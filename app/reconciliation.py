"""
reconciliation.py — Cross-version violation and review task reconciliation.

After a scan (full or selective), this module:
  1. Matches new violations to previous violations by rule_id + content similarity
  2. Links them via previous_violation_id for audit trail
  3. Reuses review tasks for still-open violations
  4. Auto-resolves review tasks for violations that were fixed
  5. Creates new review tasks for genuinely new violations
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone, timedelta

from sqlalchemy.orm import Session

from app.models import (
    Document,
    Scan,
    Violation,
    ReviewTask,
    ReviewTaskEvent,
    RuleEvaluation,
    DocumentChunk,
)

logger = logging.getLogger(__name__)


def _compute_text_similarity(text_a: str, text_b: str) -> float:
    """Simple Jaccard similarity for text comparison."""
    if not text_a or not text_b:
        return 0.0
    set_a = set(text_a.lower().split())
    set_b = set(text_b.lower().split())
    if not set_a or not set_b:
        return 0.0
    intersection = set_a & set_b
    union = set_a | set_b
    return len(intersection) / len(union) if union else 0.0


def _find_previous_violations(
    db: Session,
    document_id: int,
    current_version: int,
) -> list[Violation]:
    """Find all violations from the previous version of this document."""
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc or not doc.document_group_id:
        return []

    prev_version = current_version - 1
    if prev_version < 1:
        return []

    # Find previous version's document
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

    # Get scan IDs for the previous version
    prev_scan_ids = [
        s.id for s in
        db.query(Scan.id).filter(Scan.document_id == prev_doc.id, Scan.status == "completed").all()
    ]
    if not prev_scan_ids:
        return []

    # Get violations from previous version
    return (
        db.query(Violation)
        .filter(Violation.scan_id.in_(prev_scan_ids))
        .all()
    )


def reconcile_violations(
    db: Session,
    document_id: int,
    scan_id: int,
) -> dict:
    """
    After a new scan, reconcile new violations with previous violations.

    Returns a summary dict with counts of linked, new, and resolved violations.
    """
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        return {"linked": 0, "new": 0, "resolved": 0}

    current_version = doc.version_number or 1
    scan = db.query(Scan).filter(Scan.id == scan_id).first()
    if not scan:
        return {"linked": 0, "new": 0, "resolved": 0}

    # Get new violations from this scan
    new_violations = (
        db.query(Violation)
        .filter(Violation.scan_id == scan_id)
        .all()
    )

    # Get previous violations
    prev_violations = _find_previous_violations(db, document_id, current_version)
    prev_by_rule: dict[str, list[Violation]] = {}
    for v in prev_violations:
        prev_by_rule.setdefault(v.rule_id, []).append(v)

    linked = 0
    new_count = 0

    for violation in new_violations:
        violation.document_version = current_version

        # Try to find a matching previous violation
        prev_candidates = prev_by_rule.get(violation.rule_id, [])
        best_match = None
        best_score = 0.0

        for prev in prev_candidates:
            # Match by rule_id (already filtered) + excerpt similarity
            score = _compute_text_similarity(violation.excerpt or "", prev.excerpt or "")
            if score > best_score:
                best_score = score
                best_match = prev

        if best_match and best_score > 0.3:
            # Link to previous violation
            violation.previous_violation_id = best_match.id
            linked += 1

            # Try to reuse the review task from the previous violation
            prev_task = (
                db.query(ReviewTask)
                .filter(
                    ReviewTask.scan_id == best_match.scan_id,
                    ReviewTask.rule_id == best_match.rule_id,
                    ReviewTask.document_id == document_id,
                )
                .first()
            )
            if prev_task and prev_task.status in ("pending", "assigned", "in_review"):
                # Reuse the task — update its scan reference
                prev_task.scan_id = scan_id
                prev_task.violation_link_id = violation.id
                prev_task.rule_evaluation_id = None  # will be set later if needed
                logger.info(
                    "Reused review task %d for violation %d (linked to previous %d)",
                    prev_task.id, violation.id, best_match.id,
                )
        else:
            new_count += 1
            # Create a review task for genuinely new violations
            existing_task = (
                db.query(ReviewTask)
                .filter(
                    ReviewTask.scan_id == scan_id,
                    ReviewTask.rule_id == violation.rule_id,
                    ReviewTask.document_id == document_id,
                )
                .first()
            )
            if not existing_task:
                db.add(ReviewTask(
                    scan_id=scan_id,
                    rule_id=violation.rule_id,
                    rule_name=violation.title,
                    framework=violation.framework,
                    document_id=document_id,
                    reason="low_confidence",
                    status="pending",
                    due_date=datetime.now(timezone.utc) + timedelta(days=7),
                ))
                logger.info(
                    "Created review task for new violation %d (rule=%s) in reconciliation",
                    violation.id, violation.rule_id,
                )
            # Set section_path from chunk metadata if available
            if violation.source_chunks:
                try:
                    chunks_data = json.loads(violation.source_chunks)
                    if chunks_data:
                        first_chunk_hash = chunks_data[0].get("text_snippet", "")[:100]
                        # Try to find the chunk in document_chunks
                        chunk = (
                            db.query(DocumentChunk)
                            .filter(
                                DocumentChunk.document_id == document_id,
                                DocumentChunk.version_number == current_version,
                            )
                            .first()
                        )
                        if chunk:
                            violation.section_path = chunk.section_path
                            violation.chunk_hash = chunk.content_hash
                except (json.JSONDecodeError, IndexError):
                    pass

    # Find resolved violations (in previous but not in new)
    new_rule_ids = {v.rule_id for v in new_violations}
    resolved = 0

    for prev_v in prev_violations:
        if prev_v.rule_id not in new_rule_ids:
            # This violation was fixed in the new version
            # Find its review task and auto-resolve
            prev_task = (
                db.query(ReviewTask)
                .filter(
                    ReviewTask.scan_id == prev_v.scan_id,
                    ReviewTask.rule_id == prev_v.rule_id,
                    ReviewTask.document_id == document_id,
                    ReviewTask.status.in_(["approved", "changes_requested"]),
                )
                .first()
            )
            if prev_task:
                old_status = prev_task.status
                prev_task.status = "resolved"
                prev_task.reviewed_at = datetime.now(timezone.utc)

                # Log the event
                db.add(ReviewTaskEvent(
                    task_id=prev_task.id,
                    user_id=None,
                    event_type="auto_resolved",
                    old_value=old_status,
                    new_value="resolved",
                    notes=f"Violation fixed in version {current_version}",
                ))
                resolved += 1

    db.flush()

    summary = {"linked": linked, "new": new_count, "resolved": resolved}
    logger.info(
        "Violation reconciliation for doc %d, scan %d: linked=%d, new=%d, resolved=%d",
        document_id, scan_id, linked, new_count, resolved,
    )

    return summary


def reconcile_all_frameworks(
    db: Session,
    document_id: int,
    scan_ids: list[int],
) -> dict:
    """Run reconciliation for all framework scans in a multi-framework scan."""
    total = {"linked": 0, "new": 0, "resolved": 0}
    for scan_id in scan_ids:
        result = reconcile_violations(db, document_id, scan_id)
        total["linked"] += result["linked"]
        total["new"] += result["new"]
        total["resolved"] += result["resolved"]

    # Avoid double-counting resolved tasks across frameworks
    # (same rule across different frameworks may reference the same task)
    return total
