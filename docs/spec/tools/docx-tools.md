# Word Tools

Status: draft | Updated: 2026-03-19 | Phase 1-2 implemented, Phase 2b (citations + extra detectors) in progress

**Pattern:** C - Unified Workspace | **Run Mode:** manual

## Concept

All Word document operations happen in a single workspace. Users add DOCX files, view document structure, run health diagnostics, merge multiple documents, split by sections, repair formatting issues, compress, and convert to PDF -- all in one flow.

The workspace is **structure-oriented** (sections, headings, content blocks) rather than page-oriented like PDF Tools. This matches how Word documents are authored and organized.

Core value proposition: **understand, fix, and transform your Word documents in one place.**

## Feature Set

| Feature | Description | Priority |
|---------|-------------|----------|
| Preview | Client-side DOCX rendering via docx-preview | P0 |
| Convert to PDF | DOCX → PDF via LibreOffice headless | P0 |
| Health check | Auto-detect structural/formatting issues | P0 |
| Auto-repair | Fix detected issues (TOC, styles, spacing, etc.) | P0 |
| Merge | Combine multiple DOCX files into one | P1 |
| Split | Split one DOCX by heading level into separate files | P1 |
| Compress | Reduce file size (compress embedded images, strip metadata) | P1 |
| Extract text | Export plain text or Markdown from DOCX | P2 |

## Layout

Workspace layout (`ToolPageShell layout="workspace"`).

Two-zone design: **document list sidebar** + **main panel** that adapts based on context.

### Empty State

Standard workspace dropzone. Accepts `.docx` files (single or multiple).

### Single Document View

When one document is loaded, the main panel has two tabs: **Preview** and **Inspect**.

```
+--------------------------------------------------------+
| Word Tools                          [+ Add] [Export ▾] |
+-------------+------------------------------------------+
| Documents   | report.docx  12p · 3,420 words · 2.1 MB |
| ┌─────────┐ | [Preview]  [Inspect 5⚠]                 |
| │report   │ |------------------------------------------|
| │.docx    │ |                                          |
| │ 12p 2.1M│ |  ┌────────────────────────────────────┐  |
| └─────────┘ |  │                                    │  |
|             |  │   Document content rendered by      │  |
| [+ Add]     |  │   docx-preview, scrollable,        │  |
|             |  │   preserving original layout,       │  |
|             |  │   fonts, tables, images, headers    │  |
|             |  │                                    │  |
|             |  │   (paginated view with page         │  |
|             |  │    boundaries visible)              │  |
|             |  │                                    │  |
|             |  └────────────────────────────────────┘  |
+-------------+------------------------------------------+
| [Fix & Convert PDF] [Convert PDF] [Fix & Save DOCX]   |
+--------------------------------------------------------+
```

**Inspect tab** shows structure + health side by side:

```
+--------------------------------------------------------+
| Word Tools                          [+ Add] [Export ▾] |
+-------------+------------------------------------------+
| Documents   | report.docx  12p · 3,420 words · 2.1 MB |
| ┌─────────┐ | [Preview]  [Inspect 5⚠]                 |
| │report   │ |------------------------------------------|
| │.docx    │ | Structure             | Health Check  5⚠ |
| │ 12p 2.1M│ |                       |                  |
| └─────────┘ | 1. Introduction       | ☑ TOC outdated  ▸|
|             |   1.1 Background      | ☑ Manual fmt    ▸|
| [+ Add]     |   1.2 Scope           | ☑ Style mismatch▸|
|             | 2. Analysis      ⚠    | ☑ Empty ¶       ▸|
|             |   2.1 Data Sources    | ☑ Font mix      ▸|
|             |   2.1 Methodology ⚠   |                  |
|             | 3. results       ⚠    | ──────────────── |
|             |   3.1 Key Findings    | Select: All|None |
|             | 4. Conclusion         |                  |
+-------------+------------------------------------------+
| [Fix & Convert PDF] [Convert PDF] [Fix & Save DOCX]   |
+--------------------------------------------------------+
```

**Left sidebar — Document list:**
- Thumbnail card per document: filename, page count, file size
- Click to select active document (main panel updates)
- Drag-and-drop reorder (determines merge order)
- Right-click/long-press: remove document
- `[+ Add]` button at bottom to add more files

**Main panel tabs:**

- **Preview tab (default):** client-side DOCX rendering via `docx-preview`
  - Paginated scrollable view preserving original layout (fonts, tables, images, headers/footers)
  - Rendered immediately on upload, no server round-trip
  - Zoom controls (fit width / fit page / percentage)
  - Page indicator in bottom-right corner ("Page 3 of 12")
- **Inspect tab:** two-column layout for structure + health
  - Badge on tab shows issue count (e.g., `Inspect 5⚠`)
  - **Structure column:** heading tree extracted from document
    - Indented by heading level (H1 → H6)
    - ⚠ marker on headings with detected issues
    - Click heading to expand detail (paragraph count, word count under that section)
  - **Health column:** diagnostic issue list
    - Each issue: severity icon + title + collapsible detail + checkbox + `FIX` badge if auto-fixable
    - Sorted by severity (critical → warning → info)
    - `▸` to expand issue detail inline
    - "Select All / None" toggle

### Multiple Documents — Merge + Batch View

When 2+ documents are loaded, the workspace shifts to merge-aware mode:

```
+--------------------------------------------------------+
| Word Tools                          [+ Add] [Export ▾] |
+-------------+------------------------------------------+
| Documents   | Merge Preview                            |
| ┌─────────┐ |                                          |
| │report   │ | ┌──────────────────────────────────────┐ |
| │.docx    │ | │ 1. report.docx          12p  2.1 MB │ |
| │ 12p 2.1M│ | │    4 headings · 2 issues            │ |
| └─────────┘ | ├──────────────────────────────────────┤ |
| ┌─────────┐ | │ 2. appendix.docx         5p  0.8 MB │ |
| │appendix │ | │    2 headings · 0 issues             │ |
| │.docx    │ | ├──────────────────────────────────────┤ |
| │  5p 0.8M│ | │ 3. references.docx       3p  0.4 MB │ |
| └─────────┘ | │    1 heading · 1 issue               │ |
| ┌─────────┐ | └──────────────────────────────────────┘ |
| │referenc │ |                                          |
| │es.docx  │ | Total: 20 pages · 3 files · 3.3 MB     |
| │  3p 0.4M│ |         3 issues across all documents   |
| └─────────┘ |                                          |
| [+ Add]     | Click a document to view its structure   |
+-------------+------------------------------------------+
| [Fix All & Merge PDF] [Merge PDF] [Merge DOCX]        |
+--------------------------------------------------------+
```

- Sidebar documents are draggable to reorder (sets merge sequence)
- Main panel shows a stacked summary of all documents
- Click any document card to drill into its structure + health view
- Action bar updates to show merge-aware options

## Workspace Interactions

### Adding Files

- Drop or browse to add `.docx` files
- Multiple files can be added incrementally
- On upload, two things happen in parallel:
  - **Client-side:** `docx-preview` renders the document immediately (Preview tab)
  - **Server-side:** `analyze` endpoint returns metadata + structure + health issues (Inspect tab)

### Document Management

- **Reorder:** drag documents in the sidebar to change merge order
- **Remove:** right-click → remove, or swipe on mobile
- **Replace:** drop a new file onto an existing document card to replace it

### Health Check

- Runs automatically on file upload
- Results cached per document (re-analyzed only if file changes)
- Issue checkboxes persist across view switches
- Issues are scoped per-document; merge view shows aggregate count

### Export Actions

All exports go through the standard `FileResult` flow.

**Single document mode:**

| Action | Behavior |
|--------|----------|
| **Fix & Convert PDF** | Apply checked fixes → convert to PDF → return PDF |
| **Convert PDF** | Convert as-is → return PDF |
| **Fix & Save DOCX** | Apply checked fixes → return corrected DOCX |
| **Compress** | Compress embedded images + strip metadata → return DOCX |
| **Split by Headings** | Split at H1 boundaries → return ZIP of DOCX files |

**Multi-document mode:**

| Action | Behavior |
|--------|----------|
| **Fix All & Merge PDF** | Repair all checked issues → merge in order → convert to PDF |
| **Merge PDF** | Merge in order → convert to PDF |
| **Merge DOCX** | Merge in order → return combined DOCX |
| **Fix All & Merge DOCX** | Repair all → merge → return DOCX |

Export actions are grouped under an `[Export ▾]` dropdown in the header, with the two most common actions promoted as primary buttons in the action bar.

## Health Check — Issue Categories

### Tier 1: Deterministic — High confidence, safe to auto-fix

| Issue | Detection | Auto-fix |
|-------|-----------|----------|
| **TOC outdated** | Compare TOC field entries against actual Heading paragraphs | Rebuild TOC XML from current headings |
| **Redundant empty paragraphs** | 2+ consecutive empty ¶, or trailing empty ¶ at section end | Remove extras, keep at most one |
| **Font inconsistency (body)** | Body paragraphs use >1 font family | Normalize to the dominant font |
| **Spacing inconsistency** | Body paragraphs have >2 distinct line-spacing values | Normalize to the dominant spacing |
| **Missing heading styles** | Paragraphs with heading-like formatting (bold + large font) but no Heading style applied | Apply matching Heading style |
| **Heading orphan at page bottom** | Heading paragraphs missing `keep_with_next` property — may render alone at the bottom of a page, separated from content | Set `keep_with_next = True` on all Heading paragraphs |

### Tier 1b: Deterministic — Additional detectors

| Issue | Detection | Auto-fix |
|-------|-----------|----------|
| **Empty heading** | Heading paragraph with no text content | Remove the empty paragraph |
| **Heading level flat** | All headings at same level (e.g., all H1) when Chinese numbered patterns suggest sub-levels (`一、` = H1, `（一）` = H2, `1.` = H3) | Re-assign levels based on numbering pattern |
| **First-line indent inconsistency** | Body paragraphs have >3 distinct first-line indent values | Normalize to the dominant value |
| **Body font size inconsistency** | Body text runs use >2 distinct font sizes (excluding headings) | Normalize to the dominant size |

### Tier 2: Heuristic — Needs pattern matching, moderate confidence

| Issue | Detection | Auto-fix |
|-------|-----------|----------|
| **Heading level inconsistency** | Same-level headings have different formatting (e.g., some H2 are 16pt, others 14pt) | Normalize to the style definition |
| **Numbering discontinuity** | List numbering resets unexpectedly or skips values | Re-link to correct abstractNum |
| **Inconsistent indentation** | Body paragraphs at same level have different indent values | Normalize to the dominant indent |
| **Image overflow** | Image width exceeds page printable area | Scale down to fit within margins |
| **Citation: reference numbering missing** | Numbered citation style detected (`[N]` in body) but reference entries lack `[N]` prefix | Prepend sequential `[N]` to each reference entry |

### Tier 3: Structural — Requires deeper analysis

| Issue | Detection | Auto-fix |
|-------|-----------|----------|
| **Heading hierarchy gaps** | H1 → H3 (skipping H2) | Insert missing level or re-level (user confirmation) |
| **Duplicate numbering definitions** | Multiple abstractNum entries that are semantically identical | Merge and re-link |
| **Broken cross-references** | REF fields pointing to non-existent bookmarks | Flag only (no auto-fix) |
| **Style bloat** | Dozens of unused or near-duplicate styles | Flag only (report count) |
| **Citation: number out of range** | Inline `[N]` where N > reference entry count | Flag only (cannot infer target) |
| **Citation: number gap** | Inline citations skip numbers (e.g., `[1][2][5]`, missing 3-4) | Flag only (renumbering too risky) |
| **Citation: never cited** | Reference entry exists but no inline citation points to it | Flag only (may be intentional) |
| **Citation: style mixed** | Document uses both numbered `[N]` and author-year `(Author, Year)` styles | Flag only (user must decide) |
| **Citation: no reference section** | Inline citations found but no recognizable reference section | Flag only |

### Citation Detection Architecture

Citation checking uses a two-phase pipeline that first identifies the citation style, then runs style-specific checkers.

**Phase 1 — Style identification:**

Scan body text for citation patterns and the reference section for entry formats. Determine the dominant style by signal strength:

| Signal | Pattern | Style |
|--------|---------|-------|
| Bracket numbers | `[1]`, `[1,3]`, `[1-3]` in body text | `numbered` |
| Author-year (CN) | `（张三，2020）`, `张三（2020）` | `author_year` |
| Author-year (EN) | `(Smith, 2020)`, `Smith (2020)` | `author_year` |
| Word footnotes/endnotes | Native footnote/endnote elements | `footnote` |
| Both numbered and author-year significant | — | `mixed` (flagged as issue) |
| No citations found | — | `none` (skip all checks) |

Reference section is located by scanning for heading or pseudo-heading matching: `参考文献`, `References`, `Bibliography`, `Works Cited`.

**Phase 2 — Style-specific checks:**

```python
CitationProfile = {style, inline_numbers, ref_entry_count, ref_numbered, ...}

# Universal (any style)
_check_no_reference_section(doc, profile)
_check_style_mixed(doc, profile)

# Numbered style
_check_ref_numbering_missing(doc, profile)
_check_number_out_of_range(doc, profile)
_check_number_gaps(doc, profile)
_check_never_cited_numbered(doc, profile)

# Author-year style (future)
_check_author_not_found(doc, profile)
_check_ref_orphan_author_year(doc, profile)
```

**Detector return type:** Citation detector returns `list[dict]` (0-N issues). `_run_detectors` flattens list returns alongside single-issue returns from other detectors.

**Module:** `processing/docx_citations.py` — isolated from `docx_analyze.py`, registered as one entry in the detector list.

## Processing Architecture

### Frontend Dependencies

- **docx-preview** — Client-side DOCX rendering (parses OOXML, renders to HTML+CSS in a container element). Supports styles, tables, images, headers/footers, numbering. No server round-trip for preview.

### Backend Dependencies

- **python-docx** — DOCX parsing, structural analysis, repair, merge, and split operations
- **python-docx `._element` + lxml** — Raw XML manipulation for features python-docx doesn't cover (numbering.xml repair, TOC field insertion)
- **docxcompose** — Multi-document merge with style/numbering conflict resolution
- **LibreOffice headless** — DOCX → PDF conversion and TOC field refresh. Direct CLI invocation (`soffice --headless --convert-to pdf`), no third-party wrapper. Each conversion spawns a subprocess; concurrency controlled via `asyncio.Semaphore` with isolated `UserInstallation` paths. Cold start ~3-4s per conversion, acceptable for current scale.
- No GPU/Cortex dependency; all processing runs on CPU

### API Endpoints

```
POST /api/v1/docx/analyze
  Input:  DOCX file (multipart)
  Output: DocxAnalysisResult (metadata + headings + issues)

POST /api/v1/docx/convert
  Input:  DOCX file + optional repair issue IDs (multipart + form)
  Output: FileResult (PDF)

POST /api/v1/docx/repair
  Input:  DOCX file + selected issue IDs (multipart + form)
  Output: FileResult (repaired DOCX)

POST /api/v1/docx/merge
  Input:  multiple DOCX files + optional repair issue map (multipart + form)
  Output: FileResult (merged DOCX or PDF, controlled by output_format param)

POST /api/v1/docx/split
  Input:  DOCX file + split_level (int, heading level to split at)
  Output: FileResult (ZIP of DOCX files)

POST /api/v1/docx/compress
  Input:  DOCX file + optional target quality (multipart + form)
  Output: FileResult (compressed DOCX)
```

### Schemas

```python
class IssueSeverity(str, Enum):
    critical = "critical"
    warning = "warning"
    info = "info"

class DocxIssue(BaseModel):
    id: str                      # e.g., "toc_outdated"
    category: str                # e.g., "toc", "heading", "spacing"
    severity: IssueSeverity
    title: str                   # i18n key
    detail: str                  # i18n key with interpolation params
    fixable: bool                # whether auto-repair is available
    params: dict[str, Any]       # issue-specific data for detail interpolation

class DocxMetadata(BaseModel):
    word_count: int
    paragraph_count: int
    page_count_estimate: int
    heading_count: int
    image_count: int
    font_families: list[str]
    style_count: int

class HeadingNode(BaseModel):
    level: int                   # 1-6
    text: str
    has_issue: bool

class DocxAnalysisResult(BaseModel):
    metadata: DocxMetadata
    headings: list[HeadingNode]
    issues: list[DocxIssue]
    issue_summary: dict[str, int]  # severity -> count
```

### Backend Module Structure

```
routers/docx.py              # 6 endpoints: analyze, convert, repair, merge, split, compress
services/docx_service.py     # orchestration, FileResult building
processing/
  docx_analyze.py            # metadata extraction + issue detection (orchestrator)
  docx_repair.py             # issue fixers (one function per issue type)
  docx_citations.py          # citation style detection + cross-check (returns list[issue])
  docx_convert.py            # LibreOffice headless wrapper
  docx_merge.py              # multi-document merge with section break handling
  docx_split.py              # split by heading level
  docx_compress.py           # image recompression + metadata stripping
schemas/docx.py              # DocxIssue, DocxMetadata, DocxAnalysisResult
```

### Issue Detector Architecture

Each issue type is a standalone detector function:

```python
# Single-issue detectors: return dict | None
def detect_toc_outdated(doc: Document) -> dict | None: ...
def detect_empty_paragraphs(doc: Document) -> dict | None: ...

# Multi-issue detectors: return list[dict] (0-N issues)
def detect_citations(doc: Document) -> list[dict]: ...

DETECTORS = [
    detect_toc_outdated,
    detect_empty_paragraphs,
    detect_font_inconsistency,
    detect_citations,       # returns list
    # register new detectors here
]

def _run_detectors(doc: Document) -> list[dict]:
    issues = []
    for d in DETECTORS:
        result = d(doc)
        if result is None:
            continue
        if isinstance(result, list):
            issues.extend(result)
        else:
            issues.append(result)
    return issues
```

Same pattern for fixers:

```python
FIXERS: dict[str, Callable[[Document, DocxIssue], None]] = {
    "toc_outdated": fix_toc,
    "empty_paragraphs": fix_empty_paragraphs,
    "font_inconsistency": fix_font_inconsistency,
}
```

## File Validation

- Accept: `.docx` only (not `.doc` — legacy binary format not supported)
- Magic bytes: `PK\x03\x04` (ZIP archive) + verify `word/document.xml` exists inside
- Max file size: 50 MB (consistent with PDF tools)
- Max batch files: 20 (for merge operations)
- Reject encrypted/password-protected DOCX (python-docx cannot open them)

## Implementation Phases

### Phase 1 — Preview + Analyze + Convert (MVP) ✓

- Frontend: client-side preview via `docx-preview` (Preview tab)
- `analyze` endpoint: metadata + Tier 1 issue detection (Inspect tab, read-only)
- `convert` endpoint: DOCX → PDF via LibreOffice (no repair)
- Single-document workspace with tabbed main panel + convert button

### Phase 2 — Repair + Merge ✓

- `repair` endpoint with Tier 1 fixers (TOC, empty ¶, fonts, spacing, heading styles, heading orphan)
- `merge` endpoint via docxcompose: combine multiple DOCX files with style/numbering conflict resolution
- `convert` endpoint extended: optional `issues` param for repair-before-convert
- Frontend: issue checkboxes with select all/none, "Fix & Convert PDF" / "Fix & Save DOCX" actions
- Frontend: multi-document workspace with dnd-kit sortable sidebar, per-file analysis + issue selection
- Frontend: merge mode action bar with "Merge PDF" / "Merge DOCX" + repair-aware variants

### Phase 3 — Split + Compress + Advanced Repair ✓

- `split` endpoint: split by heading level into ZIP of DOCX files
- `compress` endpoint: image recompression (Pillow) + metadata strip + ZIP re-deflate
- Tier 2 detectors + fixers: heading format inconsistency, image overflow, indent inconsistency
- Tier 2 detect-only: numbering discontinuity
- Tier 3 detect-only: heading hierarchy gaps, style bloat
- Frontend: "More Actions" dropdown with split dialog (level selector) and compress button
- Total: 12 detectors, 9 fixers, 6 API endpoints

## Credit Cost

- **Analyze:** free (low compute, encourages engagement)
- **Convert to PDF:** free (competitive baseline)
- **Repair:** gated (core value-add)
- **Merge:** free for 2-3 files, gated for 4+
- **Split:** gated
- **Compress:** free

## i18n Keys

```
tools.word.title
tools.word.description
tools.word.tabs.preview
tools.word.tabs.inspect
tools.word.preview.zoom.fitWidth
tools.word.preview.zoom.fitPage
tools.word.preview.pageIndicator
tools.word.documents.empty
tools.word.documents.add
tools.word.documents.remove
tools.word.documents.reorder
tools.word.structure.title
tools.word.health.title
tools.word.health.scanning
tools.word.health.noIssues
tools.word.health.issueCount
tools.word.health.selectAll
tools.word.health.selectNone
tools.word.issues.[issue_id].title
tools.word.issues.[issue_id].detail
tools.word.severity.critical
tools.word.severity.warning
tools.word.severity.info
tools.word.actions.fixAndConvert
tools.word.actions.convert
tools.word.actions.fixAndSave
tools.word.actions.compress
tools.word.actions.splitByHeading
tools.word.actions.merge
tools.word.actions.fixAndMerge
tools.word.actions.mergeAsPdf
tools.word.merge.preview
tools.word.merge.total
tools.word.metadata.pages
tools.word.metadata.words
tools.word.metadata.headings
tools.word.metadata.images
tools.word.metadata.size
tools.word.unsupported.doc
tools.word.unsupported.encrypted
```

## Edge Cases

- **Preview rendering failure:** if `docx-preview` cannot render (e.g., heavily corrupted DOCX), show a fallback message with document metadata only; Inspect tab and export actions still work
- **Large DOCX preview:** `docx-preview` renders incrementally; for very large documents (>200 pages), rendering may take a few seconds -- show a skeleton loader until ready
- **No issues found:** green "Document looks good" state, structure view still shown, export actions available
- **Large documents (>100 pages):** analysis may take >2s; show progress indicator during scan
- **Password-protected DOCX:** reject with clear error message
- **Legacy .doc format:** reject with message suggesting user save as .docx first
- **Corrupted ZIP:** reject with "file appears corrupted" error
- **LibreOffice not installed:** backend startup check; log warning, disable convert endpoint, analyze/repair still work
- **Merge style conflicts:** when merging documents with different style definitions, the first document's styles take precedence; conflicting styles from subsequent documents are remapped
- **Split produces empty sections:** sections with no content below the heading are still included as separate files (contain just the heading)

## Why Unified Workspace

Word document operations are inherently combinatorial — users commonly need to check formatting → fix issues → merge chapters → convert to PDF in one session. A unified workspace avoids re-uploading and lets operations compose naturally. This mirrors the PDF Tools workspace philosophy, applied to the structural nature of Word documents.
