from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import case
from sqlalchemy.orm import Session

from app.auth import Permission, get_current_user, require_permission, scope_document_owner
from app.database import get_db
from app.models import Document, ReviewTask, ReviewTaskEvent, Scan, User, Violation

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/compliance", tags=["compliance"])


class ComplianceViolationSchema(BaseModel):
    id: int
    scan_id: int
    rule_id: str
    title: str
    framework: str
    severity: str
    clause: str | None = None
    description: str
    excerpt: str | None = None
    recommendation: str | None = None
    confidence: int | None = None
    document_id: int
    document_name: str = ""
    status: str = "open"
    assigned_to: str | None = None
    created_at: str
    document_version: int | None = None
    section_path: str | None = None
    previous_violation_id: int | None = None
    review_task_id: int | None = None


class ViolationPatchUpdate(BaseModel):
    status: str | None = None
    assigned_to: str | None = None


class SubmitReviewResponse(BaseModel):
    task_id: int
    violation_id: int
    status: str
    message: str


@router.get(
    "/violations",
    response_model=list[ComplianceViolationSchema],
    summary="List all violations across the user's organization",
)
def list_all_violations(
    document_id: int | None = Query(None, description="Filter by document ID"),
    severity: str | None = Query(None, description="Filter by severity"),
    framework: str | None = Query(None, description="Filter by framework"),
    status: str | None = Query(None, description="Filter by status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = (
        db.query(Violation)
        .join(Scan, Violation.scan_id == Scan.id)
        .join(Document, Scan.document_id == Document.id)
        .filter(Document.organization_id == current_user.organization_id)
    )
    q = scope_document_owner(q, current_user, Document)
    if document_id is not None:
        q = q.filter(Scan.document_id == document_id)
    if severity:
        q = q.filter(Violation.severity == severity)
    if framework:
        q = q.filter(Violation.framework == framework)
    if status:
        q = q.filter(Violation.status == status)

    violations = q.order_by(
        case(
            (Violation.severity == "critical", 0),
            (Violation.severity == "high", 1),
            (Violation.severity == "medium", 2),
            (Violation.severity == "low", 3),
            else_=4,
        ),
        Violation.created_at.desc(),
    ).all()

    doc_ids = {v.scan.document_id for v in violations}
    docs = {
        d.id: d.original_filename or d.filename
        for d in db.query(Document).filter(Document.id.in_(doc_ids)).all()
    } if doc_ids else {}

    review_status_map = {}
    review_task_id_map = {}
    if violations:
        review_tasks = (
            db.query(ReviewTask)
            .filter(ReviewTask.scan_id.in_([v.scan_id for v in violations]))
            .all()
        )
        for rt in review_tasks:
            key = (rt.scan_id, rt.rule_id)
            existing = review_status_map.get(key)
            if existing is None or (rt.created_at and existing[1] and rt.created_at > existing[1]):
                review_status_map[key] = (rt.status, rt.created_at)
                review_task_id_map[key] = rt.id

    return [
        ComplianceViolationSchema(
            id=v.id,
            scan_id=v.scan_id,
            rule_id=v.rule_id,
            title=v.title,
            framework=v.framework,
            severity=v.severity,
            clause=v.clause,
            description=v.description,
            excerpt=v.excerpt,
            recommendation=v.recommendation,
            confidence=v.confidence,
            document_id=v.scan.document_id,
            document_name=docs.get(v.scan.document_id, ""),
            status=(review_status_map.get((v.scan_id, v.rule_id)) or (v.status,))[0],
            assigned_to=v.assigned_to,
            created_at=v.created_at.isoformat() if v.created_at else "",
            document_version=v.document_version,
            section_path=v.section_path,
            previous_violation_id=v.previous_violation_id,
            review_task_id=review_task_id_map.get((v.scan_id, v.rule_id)),
        )
        for v in violations
    ]


@router.patch(
    "/violations/{violation_id}",
    summary="Update violation metadata (status and assignment changes must go through the review queue)",
)
def patch_violation(
    violation_id: int,
    body: ViolationPatchUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission(Permission.VIOLATION_UPDATE)),
):
    violation = (
        db.query(Violation)
        .join(Scan, Violation.scan_id == Scan.id)
        .join(Document, Scan.document_id == Document.id)
        .filter(Violation.id == violation_id, Document.organization_id == current_user.organization_id)
        .first()
    )
    if not violation:
        raise HTTPException(status_code=404, detail="Violation not found")

    # Status and assignment changes are intentionally removed from this endpoint.
    # All violation status transitions must flow through the review queue:
    #   submit-review → (admin assign) → start → approve/reject/needs-fix → resolve
    # Use PUT /admin/reviews/{task_id}/actions/assign for assignment instead.

    return {"message": "Violation found", "id": violation_id, "status": violation.status, "assigned_to": violation.assigned_to}


@router.post(
    "/violations/{violation_id}/actions/submit-review",
    response_model=SubmitReviewResponse,
    summary="Submit a violation for human review",
)
def submit_violation_for_review(
    violation_id: int,
    suggestion_id: int | None = Query(None, description="Optional remediation suggestion ID to link"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission(Permission.VIOLATION_SUBMIT_REVIEW)),
):
    violation = (
        db.query(Violation)
        .join(Scan, Violation.scan_id == Scan.id)
        .join(Document, Scan.document_id == Document.id)
        .filter(Violation.id == violation_id, Document.organization_id == current_user.organization_id)
        .first()
    )
    if not violation:
        raise HTTPException(status_code=404, detail="Violation not found")

    if violation.status == "resolved" or violation.status == "dismissed":
        raise HTTPException(status_code=400, detail="Violation is already resolved or dismissed")

    existing = (
        db.query(ReviewTask)
        .filter(ReviewTask.scan_id == violation.scan_id, ReviewTask.rule_id == violation.rule_id)
        .first()
    )
    if existing:
        if existing.status in ("resolved", "dismissed"):
            raise HTTPException(status_code=400, detail="Review task is already resolved or dismissed")
        existing.status = "pending"
        existing.reason = "submitted_for_review"
        existing.submitted_by = current_user.name
        existing.submitted_by_id = current_user.id
        existing.due_date = datetime.now(timezone.utc) + timedelta(days=7)
        existing.suggestion_id = suggestion_id
        task_id = existing.id
        from app.routers.reviews import log_review_event
        log_review_event(db, existing.id, current_user.id, "resubmitted", new_value="pending")
        violation.status = "pending"
        return SubmitReviewResponse(
            task_id=existing.id,
            violation_id=violation.id,
            status=violation.status,
            message="Submitted for review. A compliance manager will assign a reviewer.",
        )

    if suggestion_id:
        from app.models import RemediationSuggestion
        suggestion = (
            db.query(RemediationSuggestion)
            .filter(RemediationSuggestion.id == suggestion_id, RemediationSuggestion.violation_id == violation_id)
            .first()
        )
        if not suggestion:
            raise HTTPException(status_code=404, detail="Suggestion not found for this violation")

    task = ReviewTask(
        scan_id=violation.scan_id,
        rule_id=violation.rule_id,
        rule_name=violation.title,
        framework=violation.framework,
        document_id=violation.scan.document_id,
        reason="submitted_for_review",
        status="pending",
        submitted_by=current_user.name,
        submitted_by_id=current_user.id,
        suggestion_id=suggestion_id,
        due_date=datetime.now(timezone.utc) + timedelta(days=7),
    )
    db.add(task)
    db.flush()
    from app.routers.reviews import log_review_event
    log_review_event(db, task.id, current_user.id, "created", new_value="pending")
    violation.status = "pending"
    doc = db.query(Document).filter(Document.id == task.document_id).first()
    if doc and doc.status not in ("review_pending", "reviewed", "resolved"):
        doc.status = "review_pending"

    return SubmitReviewResponse(
        task_id=task.id,
        violation_id=violation.id,
        status=violation.status,
        message="Submitted for review. A compliance manager will assign a reviewer.",
    )
