"""DOCX to PDF conversion via LibreOffice headless.

Pre-processes the DOCX with python-docx to fix common LibreOffice
rendering issues (orphaned headings, broken PAGE fields, revision
marks), then invokes soffice --headless --convert-to pdf.

A fontconfig overlay is injected so that common Windows CJK font names
(宋体, 黑体, 仿宋 …) resolve to Noto CJK families.
"""

from __future__ import annotations

import io
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

from docx import Document
from docx.oxml.ns import qn

_SOFFICE = shutil.which("soffice") or "/usr/bin/soffice"

# Fontconfig snippet that maps common Windows CJK font names to
# Noto CJK families so LibreOffice renders them correctly on Linux.
_FONTCONFIG_CONF = """\
<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">
<fontconfig>
  <!-- SimSun / 宋体 → Noto Serif CJK SC -->
  <match target="pattern">
    <test name="family"><string>宋体</string></test>
    <edit name="family" mode="assign" binding="strong">
      <string>Noto Serif CJK SC</string>
    </edit>
  </match>
  <match target="pattern">
    <test name="family"><string>SimSun</string></test>
    <edit name="family" mode="assign" binding="strong">
      <string>Noto Serif CJK SC</string>
    </edit>
  </match>
  <match target="pattern">
    <test name="family"><string>NSimSun</string></test>
    <edit name="family" mode="assign" binding="strong">
      <string>Noto Serif CJK SC</string>
    </edit>
  </match>

  <!-- SimHei / 黑体 → Noto Sans CJK SC -->
  <match target="pattern">
    <test name="family"><string>黑体</string></test>
    <edit name="family" mode="assign" binding="strong">
      <string>Noto Sans CJK SC</string>
    </edit>
  </match>
  <match target="pattern">
    <test name="family"><string>SimHei</string></test>
    <edit name="family" mode="assign" binding="strong">
      <string>Noto Sans CJK SC</string>
    </edit>
  </match>

  <!-- FangSong / 仿宋 → Noto Serif CJK SC (closest match) -->
  <match target="pattern">
    <test name="family"><string>仿宋</string></test>
    <edit name="family" mode="assign" binding="strong">
      <string>Noto Serif CJK SC</string>
    </edit>
  </match>
  <match target="pattern">
    <test name="family"><string>FangSong</string></test>
    <edit name="family" mode="assign" binding="strong">
      <string>Noto Serif CJK SC</string>
    </edit>
  </match>
  <match target="pattern">
    <test name="family"><string>FangSong_GB2312</string></test>
    <edit name="family" mode="assign" binding="strong">
      <string>Noto Serif CJK SC</string>
    </edit>
  </match>

  <!-- KaiTi / 楷体 → Noto Serif CJK SC -->
  <match target="pattern">
    <test name="family"><string>楷体</string></test>
    <edit name="family" mode="assign" binding="strong">
      <string>Noto Serif CJK SC</string>
    </edit>
  </match>
  <match target="pattern">
    <test name="family"><string>KaiTi</string></test>
    <edit name="family" mode="assign" binding="strong">
      <string>Noto Serif CJK SC</string>
    </edit>
  </match>

  <!-- Microsoft YaHei / 微软雅黑 → Noto Sans CJK SC -->
  <match target="pattern">
    <test name="family"><string>微软雅黑</string></test>
    <edit name="family" mode="assign" binding="strong">
      <string>Noto Sans CJK SC</string>
    </edit>
  </match>
  <match target="pattern">
    <test name="family"><string>Microsoft YaHei</string></test>
    <edit name="family" mode="assign" binding="strong">
      <string>Noto Sans CJK SC</string>
    </edit>
  </match>
</fontconfig>
"""


def _preprocess_docx(docx_bytes: bytes) -> bytes:
    """Pre-process DOCX to fix LibreOffice rendering issues.

    1. Ensure heading paragraphs have keepNext (prevent orphaned headings).
    2. Replace AlternateContent-wrapped PAGE fields in headers/footers
       with plain complex fields that LibreOffice can render.
    """
    from lxml import etree

    doc = Document(io.BytesIO(docx_bytes))
    changed = False

    # --- 0. Accept all revisions (remove w:del, unwrap w:ins) ---
    # Accept all revisions: remove deleted content, unwrap inserted
    # content, and strip all revision metadata (rPrChange, pPrChange,
    # tblPrChange, etc.) so LibreOffice doesn't render change bars.
    body = doc.element.body
    for del_el in list(body.iter(qn("w:del"))):
        del_el.getparent().remove(del_el)
        changed = True
    for ins_el in list(body.iter(qn("w:ins"))):
        parent = ins_el.getparent()
        idx = list(parent).index(ins_el)
        for child in list(ins_el):
            ins_el.remove(child)
            parent.insert(idx, child)
            idx += 1
        parent.remove(ins_el)
        changed = True
    for tag in ("w:rPrChange", "w:pPrChange", "w:tblPrChange",
                "w:tblGridChange", "w:tcPrChange", "w:sectPrChange"):
        for el in list(body.iter(qn(tag))):
            el.getparent().remove(el)
            changed = True

    # --- 1. Page breaks before top-level headings, keepNext on all ---
    import re
    _H1_RE = re.compile(
        r"^(?:[一二三四五六七八九十百]+、"  # 一、 二、 ...
        r"|第[一二三四五六七八九十百\d]+[章节部分]"  # 第一章 第二节 ...
        r"|摘\s*要$|Abstract$|参考文献$|致\s*谢$|目\s*录$"
        r")"
    )
    _H2_RE = re.compile(
        r"^(?:（[一二三四五六七八九十百]+）"  # （一） （二） ...
        r"|\d+[、.．]\s*\S"                    # 1、 2. ...
        r")"
    )
    for para in doc.paragraphs:
        style_name = para.style.name if para.style else ""
        text = para.text.strip()
        if not text:
            continue

        is_toc = "toc" in style_name.lower()
        is_h1 = (
            not is_toc
            and (style_name == "Heading 1" or _H1_RE.match(text))
        )
        is_h2 = (
            not is_h1
            and not is_toc
            and (style_name.startswith("Heading") or _H2_RE.match(text))
        )

        if not is_h1 and not is_h2:
            continue

        pPr = para._p.get_or_add_pPr()

        # Top-level headings: force page break before
        if is_h1:
            if pPr.find(qn("w:pageBreakBefore")) is None:
                etree.SubElement(pPr, qn("w:pageBreakBefore"))
                changed = True

        # All headings: keep with next paragraph
        if pPr.find(qn("w:keepNext")) is None:
            etree.SubElement(pPr, qn("w:keepNext"))
            changed = True

    # --- 2. Fix PAGE fields in headers/footers ---
    # LibreOffice 7.x often fails to evaluate PAGE field codes in DOCX
    # footers/headers, rendering the raw instruction text instead.
    # The fields may be nested inside AlternateContent/DrawingML textboxes,
    # SDT (structured document tags), or other wrappers.
    # Strategy: find every <w:p> anywhere in each header/footer part that
    # contains a PAGE instrText, strip the containing wrapper down to a
    # clean paragraph with a simple inline PAGE field.
    W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"

    for sec in doc.sections:
        for part in (sec.header, sec.footer,
                     sec.first_page_header, sec.first_page_footer,
                     sec.even_page_header, sec.even_page_footer):
            if part is None:
                continue
            changed |= _fix_page_fields_in_part(part._element, etree)

    if not changed:
        return docx_bytes
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def _fix_page_fields_in_part(part_element, etree) -> bool:
    """Replace all PAGE field constructs in a header/footer part with
    simple inline PAGE fields at the part's top level.

    Handles fields nested inside AlternateContent, SDT, DrawingML
    textboxes, etc. by removing the wrapper and placing a clean
    paragraph directly in the part.
    """
    W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
    changed = False

    # Collect all <w:p> elements that contain a PAGE instrText.
    page_paras = []
    for instr in list(part_element.iter(f"{{{W_NS}}}instrText")):
        if not (instr.text and "PAGE" in instr.text):
            continue
        # Walk up to find the containing <w:p>.
        p = instr.getparent()
        while p is not None and p.tag != qn("w:p"):
            p = p.getparent()
        if p is not None and p not in page_paras:
            page_paras.append(p)

    for para in page_paras:
        # Find the top-level ancestor of this para that is a direct
        # child of the part element.  That's the wrapper we may need
        # to replace (could be sdt, AlternateContent, or a direct p).
        wrapper = para
        while wrapper.getparent() is not part_element:
            wrapper = wrapper.getparent()
            if wrapper is None:
                break
        if wrapper is None:
            continue

        # Determine insertion position and remove the wrapper.
        idx = list(part_element).index(wrapper)
        part_element.remove(wrapper)

        # Build a replacement paragraph with a simple inline PAGE field.
        new_p = etree.SubElement(part_element, qn("w:p"))
        pPr = etree.SubElement(new_p, qn("w:pPr"))
        jc = etree.SubElement(pPr, qn("w:jc"))
        jc.set(qn("w:val"), "center")

        r1 = etree.SubElement(new_p, qn("w:r"))
        etree.SubElement(r1, qn("w:fldChar"), {qn("w:fldCharType"): "begin"})

        r2 = etree.SubElement(new_p, qn("w:r"))
        it = etree.SubElement(r2, qn("w:instrText"))
        it.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
        it.text = " PAGE "

        r3 = etree.SubElement(new_p, qn("w:r"))
        etree.SubElement(r3, qn("w:fldChar"), {qn("w:fldCharType"): "separate"})

        r4 = etree.SubElement(new_p, qn("w:r"))
        t = etree.SubElement(r4, qn("w:t"))
        t.text = "1"

        r5 = etree.SubElement(new_p, qn("w:r"))
        etree.SubElement(r5, qn("w:fldChar"), {qn("w:fldCharType"): "end"})

        # Move the new paragraph to the correct position.
        part_element.remove(new_p)
        part_element.insert(idx, new_p)

        changed = True

    return changed


def _setup_fontconfig(tmpdir: str) -> dict[str, str]:
    """Write CJK font substitution rules and return env vars to activate them."""
    fc_dir = os.path.join(tmpdir, "fontconfig", "conf.d")
    os.makedirs(fc_dir, exist_ok=True)
    with open(os.path.join(fc_dir, "99-cjk-subst.conf"), "w", encoding="utf-8") as f:
        f.write(_FONTCONFIG_CONF)
    env = os.environ.copy()
    env["XDG_CONFIG_HOME"] = tmpdir
    return env


def convert_docx_to_pdf(docx_bytes: bytes) -> bytes:
    """Convert DOCX bytes to PDF via LibreOffice headless.

    Pre-processes the document to fix rendering issues, then uses
    soffice --headless --convert-to pdf for the actual conversion.
    """
    docx_bytes = _preprocess_docx(docx_bytes)

    with tempfile.TemporaryDirectory(prefix="docx2pdf_") as tmpdir:
        in_path = os.path.join(tmpdir, "input.docx")
        with open(in_path, "wb") as f:
            f.write(docx_bytes)

        env = _setup_fontconfig(tmpdir)

        # Per-call UserInstallation profile so concurrent soffice invocations
        # don't contend on the shared default profile (which otherwise
        # serializes calls or fails with "another instance is running").
        user_profile = os.path.join(tmpdir, "lo_profile")
        os.makedirs(user_profile, exist_ok=True)
        profile_uri = Path(user_profile).as_uri()

        try:
            result = subprocess.run(
                [
                    _SOFFICE,
                    "--headless",
                    "--norestore",
                    "--nologo",
                    "--nodefault",
                    f"-env:UserInstallation={profile_uri}",
                    "--convert-to", "pdf",
                    "--outdir", tmpdir,
                    in_path,
                ],
                capture_output=True,
                timeout=120,
                env=env,
            )
        except subprocess.TimeoutExpired:
            # Re-raise so callers can translate to a timeout error; tmpdir
            # cleanup still happens via the context manager.
            raise

        out_path = os.path.join(tmpdir, "input.pdf")
        if not os.path.exists(out_path):
            # Log full stderr for diagnostics but do not leak it to callers
            # (it may contain host paths or environment details).
            import logging
            logging.getLogger(__name__).warning(
                "LibreOffice conversion failed (exit=%s): %s",
                result.returncode,
                result.stderr.decode(errors="replace").strip(),
            )
            raise RuntimeError(
                f"LibreOffice conversion failed (exit={result.returncode})"
            )

        with open(out_path, "rb") as f:
            return f.read()
