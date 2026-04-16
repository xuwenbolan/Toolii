#!/usr/bin/env python3
"""Standalone DOCX-to-PDF converter using the LibreOffice UNO API.

This script MUST be executed with the system Python that ships python3-uno
(typically /usr/bin/python3), NOT with the project venv.

Usage:
    /usr/bin/python3 _uno_convert.py <input.docx> <output.pdf> [port]

It starts a temporary soffice listener, connects via UNO, opens the
document with UpdateDocMode=FULL_UPDATE, explicitly refreshes all text
fields (PAGE, PAGEREF, REF, etc.) and document indexes (TOC), then
exports to PDF.
"""

from __future__ import annotations

import os
import socket
import subprocess
import sys
import tempfile
import time


def _find_free_port() -> int:
    """Return an ephemeral localhost TCP port that is currently free."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _start_soffice(port: int, user_install: str) -> subprocess.Popen:
    proc = subprocess.Popen(
        [
            "soffice",
            "--headless",
            "--norestore",
            "--nologo",
            f"--accept=socket,host=localhost,port={port};urp;",
            f"-env:UserInstallation=file://{user_install}",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return proc


def _connect(port: int, retries: int = 20, delay: float = 0.5):
    """Connect to the soffice listener, retrying until it is ready."""
    import uno
    from com.sun.star.connection import NoConnectException

    local_ctx = uno.getComponentContext()
    resolver = local_ctx.ServiceManager.createInstanceWithContext(
        "com.sun.star.bridge.UnoUrlResolver", local_ctx,
    )
    url = f"uno:socket,host=localhost,port={port};urp;StarOffice.ComponentContext"
    for i in range(retries):
        try:
            ctx = resolver.resolve(url)
            return ctx
        except NoConnectException:
            time.sleep(delay)
    raise RuntimeError(f"Cannot connect to soffice on port {port} after {retries} retries")


def convert(input_path: str, output_path: str, port: int | None = None) -> None:
    import uno
    from com.sun.star.beans import PropertyValue

    input_path = os.path.abspath(input_path)
    output_path = os.path.abspath(output_path)

    # Each invocation needs its own port AND its own UserInstallation
    # profile. Sharing either across concurrent calls causes soffice to
    # fail to bind or to reject the second instance as a duplicate.
    if port is None:
        port = _find_free_port()
    user_install = tempfile.mkdtemp(prefix="uno_profile_")

    proc = _start_soffice(port, user_install)
    try:
        ctx = _connect(port)
        smgr = ctx.ServiceManager
        desktop = smgr.createInstanceWithContext("com.sun.star.frame.Desktop", ctx)

        file_url = uno.systemPathToFileUrl(input_path)
        load_props = (
            PropertyValue(Name="Hidden", Value=True),
            PropertyValue(Name="UpdateDocMode", Value=1),  # FULL_UPDATE
        )
        doc = desktop.loadComponentFromURL(file_url, "_blank", 0, load_props)
        if doc is None:
            raise RuntimeError("Failed to open document")

        # Force-refresh all text fields (PAGE, PAGEREF, DATE, etc.)
        try:
            doc.getTextFields().refresh()
        except Exception:
            pass

        # Update document indexes (TOC, etc.)
        try:
            indexes = doc.getDocumentIndexes()
            for i in range(indexes.getCount()):
                indexes.getByIndex(i).update()
        except Exception:
            pass

        # Export to PDF.
        pdf_url = uno.systemPathToFileUrl(output_path)
        export_props = (
            PropertyValue(Name="FilterName", Value="writer_pdf_Export"),
        )
        doc.storeToURL(pdf_url, export_props)
        doc.close(True)

        # Ask desktop to terminate so soffice exits cleanly.
        try:
            desktop.terminate()
        except Exception:
            pass
    finally:
        # Make sure soffice is dead.
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()
        # Clean up temp profile.
        import shutil
        shutil.rmtree(user_install, ignore_errors=True)


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(f"Usage: {sys.argv[0]} <input.docx> <output.pdf> [port]", file=sys.stderr)
        sys.exit(1)
    in_path = sys.argv[1]
    out_path = sys.argv[2]
    cli_port: int | None = None
    if len(sys.argv) > 3:
        try:
            cli_port = int(sys.argv[3])
        except ValueError:
            print(f"Invalid port: {sys.argv[3]}", file=sys.stderr)
            sys.exit(2)
        if not (1024 <= cli_port <= 65535):
            print(f"Port out of range (1024-65535): {cli_port}", file=sys.stderr)
            sys.exit(2)
    convert(in_path, out_path, cli_port)
