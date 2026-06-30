"""
ingestion.py — PDF text extraction + OCR fallback + token-aware chunking.

Pipeline per uploaded file:
  1. Open PDF with PyMuPDF (fitz)
  2. For each page: extract text via get_text(); if empty → render to image → Tesseract OCR
  3. Join all page texts into one document string
  4. Split into overlapping chunks (~500 tokens, 50-token overlap) via LlamaIndex SentenceSplitter
"""
from __future__ import annotations

import io
import logging
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
class ExtractionResult:
    pages: List[PageResult]
    full_text: str
    page_count: int
    has_ocr_pages: bool
    chunks: List[str]


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
    )
