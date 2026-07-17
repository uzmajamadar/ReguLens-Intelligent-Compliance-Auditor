"""
ingestion.py — PDF text extraction + OCR fallback + token-aware chunking.

Pipeline per uploaded file:
  1. Open PDF with PyMuPDF (fitz)
  2. For each page: extract text via get_text(); if empty → render to image → Tesseract OCR
  3. Join all page texts into one document string
  4. Split into overlapping chunks (~500 tokens, 50-token overlap) via LlamaIndex SentenceSplitter
"""
from __future__ import annotations

import hashlib
import io
import json
import logging
import re
from dataclasses import dataclass, field
from typing import List, TYPE_CHECKING

if TYPE_CHECKING:
    import fitz

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

CHUNK_SIZE = 500      # tokens per chunk
CHUNK_OVERLAP = 50    # token overlap between consecutive chunks
OCR_DPI = 200         # render DPI for Tesseract — 200 is a good speed/quality balance
MIN_CHARS_PER_PAGE = 10  # pages with fewer chars are treated as "empty" → trigger OCR


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class PageResult:
    page_num: int       # 1-indexed
    text: str
    used_ocr: bool


@dataclass
class ChunkMetadata:
    """Rich metadata for a single chunk — used for content-addressed storage."""
    chunk_index: int
    text: str
    content_hash: str               # SHA-256 of chunk text
    page_numbers: list[int]         # which pages this chunk spans
    section_heading: str | None     # nearest heading above this chunk
    section_path: str | None        # hierarchical heading path

    def to_dict(self) -> dict:
        return {
            "chunk_index": self.chunk_index,
            "text": self.text,
            "content_hash": self.content_hash,
            "page_numbers": self.page_numbers,
            "section_heading": self.section_heading,
            "section_path": self.section_path,
        }


@dataclass
class ExtractionResult:
    pages: List[PageResult]
    full_text: str
    page_count: int
    has_ocr_pages: bool
    chunks: List[str]
    chunk_metadata: List[ChunkMetadata] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _extract_page_text(page: fitz.Page) -> tuple[str, bool]:
    import fitz
    import pytesseract
    from PIL import Image

    text = page.get_text().strip()

    if len(text) >= MIN_CHARS_PER_PAGE:
        return text, False

    logger.debug("Page %d: native text empty, falling back to OCR", page.number + 1)
    pix = page.get_pixmap(dpi=OCR_DPI)
    img = Image.open(io.BytesIO(pix.tobytes("png")))
    ocr_text = pytesseract.image_to_string(img, lang="eng").strip()
    return ocr_text, True


def _chunk_text(text: str) -> List[str]:
    if not text.strip():
        return []

    from llama_index.core.node_parser import SentenceSplitter

    splitter = SentenceSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
    )
    return splitter.split_text(text)


# ---------------------------------------------------------------------------
# Page mapping & heading extraction
# ---------------------------------------------------------------------------

_PAGE_MARKER_RE = re.compile(r"^--- Page (\d+) ---$", re.MULTILINE)

_HEADING_PATTERNS = [
    # Markdown-style headings
    re.compile(r"^(#{1,6})\s+(.+)$", re.MULTILINE),
    # ALL CAPS lines (likely headings in compliance docs)
    re.compile(r"^([A-Z][A-Z\s\-:]{5,})$", re.MULTILINE),
    # Numbered sections like "1. Introduction" or "3.2 Data Retention"
    re.compile(r"^(\d+(?:\.\d+)*)\s+([A-Z].+)$", re.MULTILINE),
]


def _extract_headings(full_text: str) -> list[tuple[str, int, str]]:
    """Extract headings with their character offsets.

    Returns list of (heading_text, char_offset, section_path_component).
    """
    headings: list[tuple[str, int, str]] = []

    for pattern in _HEADING_PATTERNS:
        for match in pattern.finditer(full_text):
            text = match.group(0).strip()
            # Normalize: strip markdown markers, trailing whitespace
            clean = re.sub(r"^(#{1,6}\s+|\d+(?:\.\d+)*\s+)", "", text).strip()
            if clean and len(clean) < 200:
                headings.append((clean, match.start(), clean))

    # Sort by position in document
    headings.sort(key=lambda h: h[1])
    return headings


def _build_page_map(full_text: str) -> list[tuple[int, int, int]]:
    """Build a mapping of (page_num, char_start, char_end) from page markers."""
    page_map: list[tuple[int, int, int]] = []
    markers = list(_PAGE_MARKER_RE.finditer(full_text))

    for i, marker in enumerate(markers):
        page_num = int(marker.group(1))
        start = marker.end() + 1  # after the marker line
        end = markers[i + 1].start() if i + 1 < len(markers) else len(full_text)
        page_map.append((page_num, start, end))

    return page_map


def _find_pages_for_chunk(chunk_start: int, chunk_end: int, page_map: list[tuple[int, int, int]]) -> list[int]:
    """Determine which pages a chunk spans based on character positions."""
    pages: list[int] = []
    for page_num, p_start, p_end in page_map:
        # Chunk overlaps with this page if their ranges intersect
        if chunk_start < p_end and chunk_end > p_start:
            pages.append(page_num)
    return pages or [1]


def _find_section_for_offset(offset: int, headings: list[tuple[str, int, str]]) -> tuple[str | None, str | None]:
    """Find the section heading and path for a given character offset."""
    current_heading = None
    path_parts: list[str] = []

    for heading_text, heading_offset, _ in headings:
        if heading_offset <= offset:
            current_heading = heading_text
            # Simple path: last 2 headings for context
            path_parts.append(heading_text)
            if len(path_parts) > 3:
                path_parts = path_parts[-3:]
        else:
            break

    section_path = " > ".join(path_parts) if path_parts else None
    return current_heading, section_path


def _compute_chunk_metadata(chunks: List[str], full_text: str) -> List[ChunkMetadata]:
    """Compute rich metadata for each chunk: page numbers, section heading, content hash."""
    page_map = _build_page_map(full_text)
    headings = _extract_headings(full_text)
    metadata: list[ChunkMetadata] = []

    # Track cumulative position to map chunks back to the full text
    search_start = 0

    for idx, chunk_text in enumerate(chunks):
        content_hash = hashlib.sha256(chunk_text.encode("utf-8")).hexdigest()

        # Find this chunk's position in the full text
        chunk_pos = full_text.find(chunk_text[:100], search_start)
        if chunk_pos == -1:
            # Fallback: try from the beginning
            chunk_pos = full_text.find(chunk_text[:100])

        chunk_start = chunk_pos
        chunk_end = chunk_pos + len(chunk_text)

        # Map to pages
        page_numbers = _find_pages_for_chunk(chunk_start, chunk_end, page_map)

        # Map to section
        section_heading, section_path = _find_section_for_offset(chunk_start, headings)

        metadata.append(ChunkMetadata(
            chunk_index=idx,
            text=chunk_text,
            content_hash=content_hash,
            page_numbers=page_numbers,
            section_heading=section_heading,
            section_path=section_path,
        ))

        # Advance search position for next chunk
        if chunk_pos >= 0:
            search_start = chunk_pos + 1

    return metadata


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def process_pdf(file_bytes: bytes) -> ExtractionResult:
    """
    Full ingestion pipeline for a PDF supplied as raw bytes.

    Steps:
      1. Parse with PyMuPDF
      2. Extract / OCR each page
      3. Concatenate page texts
      4. Chunk the full text
      5. Compute chunk metadata (page mapping, section headings, content hashes)

    Raises:
      ValueError: if the file cannot be parsed as a PDF.
      RuntimeError: for unexpected extraction failures.
    """
    try:
        import fitz

        doc = fitz.open(stream=file_bytes, filetype="pdf")
    except Exception as exc:
        raise ValueError(f"Cannot open file as PDF: {exc}") from exc

    pages: List[PageResult] = []
    has_ocr = False

    for page in doc:
        try:
            text, used_ocr = _extract_page_text(page)
        except Exception as exc:
            # Don't abort the whole document — log and continue with empty text
            logger.warning("Page %d extraction failed: %s", page.number + 1, exc)
            text, used_ocr = "", False

        pages.append(PageResult(page_num=page.number + 1, text=text, used_ocr=used_ocr))
        if used_ocr:
            has_ocr = True

    doc.close()

    # Join page texts with page markers so downstream consumers (e.g. AI)
    # can accurately reference page numbers.
    full_text = "\n\n".join(
        f"--- Page {p.page_num} ---\n{p.text}" for p in pages if p.text
    )
    chunks = _chunk_text(full_text)

    # Compute rich metadata for each chunk
    chunk_metadata = _compute_chunk_metadata(chunks, full_text)

    logger.info(
        "Processed PDF: %d pages, %d chunks, OCR=%s",
        len(pages), len(chunks), has_ocr,
    )

    return ExtractionResult(
        pages=pages,
        full_text=full_text,
        page_count=len(pages),
        has_ocr_pages=has_ocr,
        chunks=chunks,
        chunk_metadata=chunk_metadata,
    )
