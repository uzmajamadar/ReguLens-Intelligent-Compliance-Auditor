"""
chunk_diff.py — Chunk-level diff detection for selective revalidation.

Compares two document versions at the chunk level using:
  1. Content hash matching (exact, instant)
  2. Embedding cosine similarity (for modified chunks)
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models import Document, DocumentChunk, ChunkDiff

logger = logging.getLogger(__name__)

# Threshold: chunks with similarity above this are considered "modified" (not removed+added)
SIMILARITY_MODIFIED_THRESHOLD = 0.70
# Threshold: if average similarity across all matched chunks is below this, full rescan recommended
FULL_RESCAN_SIMILARITY_THRESHOLD = 0.60


@dataclass
class ChunkDiffResult:
    """Result of comparing two document versions at the chunk level."""
    old_document_id: int
    new_document_id: int
    total_old_chunks: int
    total_new_chunks: int
    unchanged: int = 0
    modified: int = 0
    added: int = 0
    removed: int = 0
    avg_similarity: float = 0.0

    @property
    def changed_chunks(self) -> int:
        return self.modified + self.added + self.removed

    @property
    def changed_percentage(self) -> float:
        total = max(self.total_old_chunks, self.total_new_chunks)
        return self.changed_chunks / total if total > 0 else 0.0

    @property
    def should_full_rescan(self) -> bool:
        """Determine if a full rescan is recommended based on diff statistics."""
        if self.total_old_chunks == 0:
            return True  # first scan
        if self.changed_percentage > 0.30:
            return True
        if self.total_old_chunks > 0 and self.avg_similarity < FULL_RESCAN_SIMILARITY_THRESHOLD:
            return True
        return False


def _compute_cosine_similarity(vec_a: list[float], vec_b: list[float]) -> float:
    """Compute cosine similarity between two vectors."""
    dot = sum(a * b for a, b in zip(vec_a, vec_b))
    norm_a = sum(a * a for a in vec_a) ** 0.5
    norm_b = sum(b * b for b in vec_b) ** 0.5
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def _get_old_chunks(db: Session, document_id: int) -> list[DocumentChunk]:
    """Get chunks from the previous version of a document."""
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc or not doc.document_group_id:
        return []

    prev_version = (doc.version_number or 1) - 1
    if prev_version < 1:
        return []

    # Find the previous version's document
    prev_doc = (
        db.query(Document)
        .filter(
            Document.document_group_id == doc.document_group_id,
            Document.version_number == prev_version,
            Document.organization_id == doc.organization_id,
        )
        .first()
    )
    if not prev_doc:
        return []

    return (
        db.query(DocumentChunk)
        .filter(
            DocumentChunk.document_id == prev_doc.id,
            DocumentChunk.version_number == prev_version,
        )
        .order_by(DocumentChunk.chunk_index)
        .all()
    )


def _get_new_chunks(db: Session, document_id: int) -> list[DocumentChunk]:
    """Get chunks from the current version of a document."""
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        return []

    return (
        db.query(DocumentChunk)
        .filter(
            DocumentChunk.document_id == document_id,
            DocumentChunk.version_number == doc.version_number,
        )
        .order_by(DocumentChunk.chunk_index)
        .all()
    )


def compute_chunk_diff(
    db: Session,
    document_id: int,
    similarity_fn=None,
) -> ChunkDiffResult:
    """
    Compute chunk-level diff between the current and previous version of a document.

    Args:
        db: Database session
        document_id: ID of the newly uploaded document
        similarity_fn: Optional callable(old_text, new_text) -> float for embedding similarity.
                       If None, only content hash comparison is used (modified chunks
                       are detected by high text similarity via simple character overlap).

    Returns:
        ChunkDiffResult with statistics and diff details.
    """
    old_chunks = _get_old_chunks(db, document_id)
    new_chunks = _get_new_chunks(db, document_id)

    if not old_chunks:
        # First version or no previous version — no diff possible
        result = ChunkDiffResult(
            old_document_id=0,
            new_document_id=document_id,
            total_old_chunks=0,
            total_new_chunks=len(new_chunks),
        )
        return result

    doc = db.query(Document).filter(Document.id == document_id).first()
    old_doc_id = old_chunks[0].document_id if old_chunks else 0

    # Build hash index for old chunks
    old_by_hash: dict[str, DocumentChunk] = {}
    for chunk in old_chunks:
        old_by_hash[chunk.content_hash] = chunk

    # Build hash index for new chunks
    new_by_hash: dict[str, DocumentChunk] = {}
    for chunk in new_chunks:
        new_by_hash[chunk.content_hash] = chunk

    result = ChunkDiffResult(
        old_document_id=old_doc_id,
        new_document_id=document_id,
        total_old_chunks=len(old_chunks),
        total_new_chunks=len(new_chunks),
    )

    similarities: list[float] = []
    matched_old_hashes: set[str] = set()
    matched_new_hashes: set[str] = set()

    # Pass 1: Exact hash matches (unchanged)
    for new_chunk in new_chunks:
        if new_chunk.content_hash in old_by_hash:
            result.unchanged += 1
            matched_old_hashes.add(new_chunk.content_hash)
            matched_new_hashes.add(new_chunk.content_hash)

            # Persist diff record
            old_chunk = old_by_hash[new_chunk.content_hash]
            db.add(ChunkDiff(
                old_document_id=old_doc_id,
                new_document_id=document_id,
                old_chunk_id=old_chunk.id,
                new_chunk_id=new_chunk.id,
                similarity_score=1.0,
                change_type="unchanged",
                old_page_number=old_chunk.page_numbers,
                new_page_number=new_chunk.page_numbers,
            ))

    # Pass 2: Find modified chunks (new chunks not matched by hash)
    unmatched_new = [c for c in new_chunks if c.content_hash not in matched_new_hashes]
    unmatched_old = [c for c in old_chunks if c.content_hash not in matched_old_hashes]

    # For unmatched new chunks, try to find a similar unmatched old chunk
    used_old_indices: set[int] = set()
    for new_chunk in unmatched_new:
        best_score = 0.0
        best_old: DocumentChunk | None = None
        best_old_idx = -1

        for idx, old_chunk in enumerate(unmatched_old):
            if idx in used_old_indices:
                continue

            # Simple text similarity: character overlap ratio
            old_set = set(old_chunk.text.lower().split())
            new_set = set(new_chunk.text.lower().split())
            if not old_set or not new_set:
                continue
            intersection = old_set & new_set
            union = old_set | new_set
            score = len(intersection) / len(union) if union else 0.0

            if score > best_score:
                best_score = score
                best_old = old_chunk
                best_old_idx = idx

        if best_old and best_score >= SIMILARITY_MODIFIED_THRESHOLD:
            # Modified chunk
            result.modified += 1
            similarities.append(best_score)
            used_old_indices.add(best_old_idx)

            db.add(ChunkDiff(
                old_document_id=old_doc_id,
                new_document_id=document_id,
                old_chunk_id=best_old.id,
                new_chunk_id=new_chunk.id,
                similarity_score=best_score,
                change_type="modified",
                old_page_number=best_old.page_numbers,
                new_page_number=new_chunk.page_numbers,
            ))
        else:
            # Truly new chunk
            result.added += 1
            similarities.append(0.0)

            db.add(ChunkDiff(
                old_document_id=old_doc_id,
                new_document_id=document_id,
                old_chunk_id=None,
                new_chunk_id=new_chunk.id,
                similarity_score=0.0,
                change_type="added",
                new_page_number=new_chunk.page_numbers,
            ))

    # Pass 3: Removed chunks (old chunks not matched)
    for idx, old_chunk in enumerate(unmatched_old):
        if idx not in used_old_indices:
            result.removed += 1
            similarities.append(0.0)

            db.add(ChunkDiff(
                old_document_id=old_doc_id,
                new_document_id=document_id,
                old_chunk_id=old_chunk.id,
                new_chunk_id=None,
                similarity_score=0.0,
                change_type="removed",
                old_page_number=old_chunk.page_numbers,
            ))

    # Compute average similarity (unchanged = 1.0, others from matching)
    if similarities:
        result.avg_similarity = sum(similarities) / len(similarities)
    elif result.unchanged > 0:
        result.avg_similarity = 1.0

    db.flush()

    logger.info(
        "Chunk diff: doc=%d, old=%d new=%d, unchanged=%d modified=%d added=%d removed=%d, "
        "changed_pct=%.1f%%, avg_sim=%.3f, full_rescan=%s",
        document_id,
        result.total_old_chunks, result.total_new_chunks,
        result.unchanged, result.modified, result.added, result.removed,
        result.changed_percentage * 100,
        result.avg_similarity,
        result.should_full_rescan,
    )

    return result


def get_changed_chunk_hashes(diff_result: ChunkDiffResult, db: Session) -> set[str]:
    """Get the content hashes of chunks that changed (modified + added)."""
    if diff_result.new_document_id == 0:
        return set()

    new_chunks = (
        db.query(DocumentChunk)
        .filter(DocumentChunk.document_id == diff_result.new_document_id)
        .all()
    )

    # Get diff records for this comparison
    diffs = (
        db.query(ChunkDiff)
        .filter(
            ChunkDiff.new_document_id == diff_result.new_document_id,
            ChunkDiff.change_type.in_(["modified", "added"]),
        )
        .all()
    )

    changed_hashes: set[str] = set()
    new_chunk_by_id = {c.id: c for c in new_chunks}

    for diff in diffs:
        if diff.new_chunk_id and diff.new_chunk_id in new_chunk_by_id:
            changed_hashes.add(new_chunk_by_id[diff.new_chunk_id].content_hash)

    return changed_hashes
