from __future__ import annotations

import logging
import os
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import or_, and_
from sqlalchemy.orm import Session

from app.auth import Permission, get_current_user, log_audit, require_permission
from app.database import get_db
from app.models import AuditLog, Document, RemediationSuggestion, ReviewTask, ReviewTaskEvent, Scan, User, Violation

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/compliance", tags=["compliance"])


class ViolationBriefSchema(BaseModel):
    title: str
    severity: str
    clause: str | None = None
    description: str
    excerpt: str | None = None
    recommendation: str | None = None
    confidence: int | None = None


class ReviewTaskSchema(BaseModel):
    id: int
    scan_id: int
    rule_id: str
    rule_name: str
    framework: str
    document_id: int
    document_name: str = ""
    reason: str
    status: str
    assigned_to: str | None = None
    assigned_to_id: int | None = None
    submitted_by: str | None = None
    submitted_by_id: int | None = None
    assigned_by: str | None = None
    due_date: str | None = None
    notes: str | None = None
    created_at: str
    reviewed_at: str | None = None
    violation: ViolationBriefSchema | None = None


class ReviewActionResponse(BaseModel):
    id: int
    status: str
    message: str


class ReviewTaskUpdate(BaseModel):
    due_date: str | None = None


def _get_org_review_task(db: Session, task_id: int, org_id: int) -> ReviewTask:
    task = (
        db.query(ReviewTask)
        .join(Document, ReviewTask.document_id == Document.id)
        .filter(ReviewTask.id == task_id, Document.organization_id == org_id)
        .first()
    )
    if not task:
        raise HTTPException(status_code=404, detail="Review task not found")
    return task


def _update_document_review_status(db: Session, document_id: int):
    """Check if all review tasks for a document are resolved/dismissed and update document status."""
    remaining = (
        db.query(ReviewTask)
        .filter(
            ReviewTask.document_id == document_id,
            ~ReviewTask.status.in_(["resolved", "dismissed"]),
        )
        .count()
    )
    if remaining == 0:
        doc = db.query(Document).filter(Document.id == document_id).first()
        if doc:
            doc.status = "reviewed"


def log_review_event(
    db: Session,
    task_id: int,
    user_id: int | None,
    event_type: str,
    old_value: str | None = None,
    new_value: str | None = None,
    notes: str | None = None,
):
    """Append an immutable event to a review task's history."""
    db.add(ReviewTaskEvent(
        task_id=task_id,
        user_id=user_id,
        event_type=event_type,
        old_value=old_value,
        new_value=new_value,
        notes=notes,
    ))
    db.flush()


@router.get(
    "/reviews",
    response_model=list[ReviewTaskSchema],
    summary="List review tasks (pending human review)",
)
def list_review_tasks(
    status_filter: str = Query("", description="Filter by status — empty shows all"),
    framework: str = Query(None, description="Filter by framework name"),
    assigned_to: str = Query(None, description="Filter by assigned user name (deprecated — use assigned_to_id)"),
    assigned_to_id: int = Query(None, description="Filter by assigned user ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission(Permission.REVIEW_READ)),
) -> list[ReviewTaskSchema]:
    q = (
        db.query(ReviewTask)
        .join(Document, ReviewTask.document_id == Document.id)
        .filter(Document.organization_id == current_user.organization_id)
    )
    if status_filter:
        q = q.filter(ReviewTask.status == status_filter)
    if framework:
        q = q.filter(ReviewTask.framework == framework)
    if assigned_to_id:
        q = q.filter(ReviewTask.assigned_to_id == assigned_to_id)
    elif assigned_to:
        q = q.filter(ReviewTask.assigned_to == assigned_to)
    tasks = q.order_by(ReviewTask.created_at.desc()).all()

    doc_ids = {t.document_id for t in tasks}
    docs = {d.id: d.original_filename or d.filename for d in db.query(Document).filter(Document.id.in_(doc_ids)).all()} if doc_ids else {}

    violation_map: dict[tuple[int, str], Violation] = {}
    if tasks:
        pairs = [(t.scan_id, t.rule_id) for t in tasks]
        pair_conditions = [
            and_(Violation.scan_id == sid, Violation.rule_id == rid)
            for sid, rid in pairs
        ]
        violations = (
            db.query(Violation)
            .filter(or_(*pair_conditions))
            .all()
        )
        for v in violations:
            violation_map[(v.scan_id, v.rule_id)] = v

    assigner_map: dict[int, str] = {}
    missing_ids = [t.id for t in tasks if not t.assigned_by]
    if missing_ids:
        logs = (
            db.query(AuditLog)
            .filter(
                AuditLog.action == "review_assign",
                AuditLog.resource_type == "review_task",
                AuditLog.resource_id.in_(missing_ids),
            )
            .order_by(AuditLog.created_at.desc())
            .all()
        )
        user_ids = {log.user_id for log in logs if log.user_id}
        users = {u.id: u.name for u in db.query(User).filter(User.id.in_(user_ids)).all()} if user_ids else {}
        for log in logs:
            if log.resource_id not in assigner_map and log.user_id in users:
                assigner_map[log.resource_id] = users[log.user_id]

    return [
        ReviewTaskSchema(
            id=t.id,
            scan_id=t.scan_id,
            rule_id=t.rule_id,
            rule_name=t.rule_name,
            framework=t.framework,
            document_id=t.document_id,
            document_name=docs.get(t.document_id, ""),
            reason=t.reason,
            status=t.status,
            assigned_to=t.assigned_to,
            assigned_to_id=t.assigned_to_id,
            submitted_by=t.submitted_by or assigner_map.get(t.id),
            assigned_by=t.assigned_by or assigner_map.get(t.id),
            due_date=t.due_date.isoformat() if t.due_date else None,
            notes=t.notes,
            created_at=t.created_at.isoformat(),
            reviewed_at=t.reviewed_at.isoformat() if t.reviewed_at else None,
            violation=(
                ViolationBriefSchema(
                    title=v.title,
                    severity=v.severity,
                    clause=v.clause,
                    description=v.description,
                    excerpt=v.excerpt,
                    recommendation=v.recommendation,
                    confidence=v.confidence,
                )
                if (v := violation_map.get((t.scan_id, t.rule_id)))
                else None
            ),
        )
        for t in tasks
    ]


@router.get(
    "/reviews/stats",
    summary="Get aggregate counts for the review queue",
)
def get_review_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission(Permission.REVIEW_READ)),
):
    base = (
        db.query(ReviewTask)
        .join(Document, ReviewTask.document_id == Document.id)
        .filter(Document.organization_id == current_user.organization_id)
    )
    total = base.count()
    pending = base.filter(ReviewTask.status == "pending").count()
    assigned = base.filter(ReviewTask.status == "assigned").count()
    in_review = base.filter(ReviewTask.status == "in_review").count()
    approved = base.filter(ReviewTask.status == "approved").count()
    changes_requested = base.filter(ReviewTask.status == "changes_requested").count()
    dismissed = base.filter(ReviewTask.status == "dismissed").count()
    resolved = base.filter(ReviewTask.status == "resolved").count()
    return {
        "total": total,
        "pending": pending,
        "assigned": assigned,
        "in_review": in_review,
        "approved": approved,
        "changes_requested": changes_requested,
        "dismissed": dismissed,
        "resolved": resolved,
    }


@router.post(
    "/reviews/{task_id}/actions/start",
    response_model=ReviewActionResponse,
    summary="Mark a review task as being actively reviewed",
)
def start_review_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission(Permission.REVIEW_START)),
):
    task = _get_org_review_task(db, task_id, current_user.organization_id)
    if task.status in ("resolved", "dismissed"):
        raise HTTPException(status_code=400, detail="Cannot start a finalized review task")
    if task.status != "assigned":
        raise HTTPException(status_code=400, detail="Task must be in 'assigned' status to start review")
    old_status = task.status
    task.status = "in_review"
    violation = db.query(Violation).filter(
        Violation.scan_id == task.scan_id, Violation.rule_id == task.rule_id
    ).first()
    if violation and violation.status == "assigned":
        violation.status = "in_review"
    log_review_event(db, task_id, current_user.id, "started", old_value=old_status, new_value="in_review")
    log_audit(db, current_user.id, "review_start", details=f"Review task {task_id} started (in_review)")
    return ReviewActionResponse(id=task.id, status=task.status, message="Review started.")


@router.post(
    "/reviews/{task_id}/actions/approve",
    response_model=ReviewActionResponse,
    summary="Approve a review task (confirm the finding)",
)
def approve_review_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission(Permission.REVIEW_APPROVE)),
):
    task = _get_org_review_task(db, task_id, current_user.organization_id)
    if task.status in ("resolved", "dismissed"):
        raise HTTPException(status_code=400, detail="Cannot modify a finalized review task")
    if task.status not in ("in_review", "assigned", "pending"):
        raise HTTPException(status_code=400, detail="Task must be in review before approval")
    if task.submitted_by_id and task.submitted_by_id == current_user.id:
        raise HTTPException(status_code=403, detail="Cannot approve your own review task")
    old_status = task.status
    task.status = "approved"
    task.reviewed_at = datetime.now(timezone.utc)

    violation = db.query(Violation).filter(
        Violation.scan_id == task.scan_id, Violation.rule_id == task.rule_id
    ).first()
    if violation and violation.status in ("assigned", "in_review", "pending"):
        violation.status = "approved"

    if task.suggestion_id:
        suggestion = db.query(RemediationSuggestion).filter(RemediationSuggestion.id == task.suggestion_id).first()
        if suggestion and suggestion.status == "accepted":
            suggestion.status = "approved"

    log_review_event(db, task_id, current_user.id, "approved", old_value=old_status, new_value="approved")
    log_audit(db, current_user.id, "review_approve", details=f"Review task {task_id} approved (rule={task.rule_id})")
    from app.notifications import notify_resolved
    notify_resolved(db, task, current_user)
    return ReviewActionResponse(id=task.id, status=task.status, message="Finding approved.")


@router.post(
    "/reviews/{task_id}/actions/resolve",
    response_model=ReviewActionResponse,
    summary="Final approval by compliance manager — resolves violation",
)
def resolve_review_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission(Permission.REVIEW_RESOLVE)),
):
    task = _get_org_review_task(db, task_id, current_user.organization_id)

    if task.status in ("resolved", "dismissed"):
        raise HTTPException(status_code=400, detail="Cannot modify a finalized review task")
    if task.status != "approved":
        raise HTTPException(status_code=400, detail="Task must be approved before final resolution")
    if task.submitted_by_id and task.submitted_by_id == current_user.id:
        raise HTTPException(status_code=403, detail="Cannot resolve your own review task")

    old_status = task.status
    task.status = "resolved"

    violation = db.query(Violation).filter(
        Violation.scan_id == task.scan_id, Violation.rule_id == task.rule_id
    ).first()
    if violation:
        violation.status = "resolved"

    if task.suggestion_id:
        suggestion = db.query(RemediationSuggestion).filter(RemediationSuggestion.id == task.suggestion_id).first()
        if suggestion and suggestion.status == "approved":
            suggestion.status = "applied"

    log_review_event(db, task_id, current_user.id, "resolved", old_value=old_status, new_value="resolved")
    log_audit(db, current_user.id, "review_resolve", details=f"Review task {task_id} resolved (rule={task.rule_id})")
    _update_document_review_status(db, task.document_id)
    from app.notifications import notify_resolved
    notify_resolved(db, task, current_user)
    return ReviewActionResponse(id=task.id, status=task.status, message="Violation resolved.")


@router.post(
    "/reviews/{task_id}/actions/reject",
    response_model=ReviewActionResponse,
    summary="Reject a review task (mark as false positive)",
)
def reject_review_task(
    task_id: int,
    notes: str = Query(""),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission(Permission.REVIEW_REJECT)),
):
    task = _get_org_review_task(db, task_id, current_user.organization_id)
    if task.status in ("resolved", "dismissed"):
        raise HTTPException(status_code=400, detail="Cannot modify a finalized review task")
    if task.status not in ("in_review", "assigned"):
        raise HTTPException(status_code=400, detail="Task must be in review before dismissal")
    if task.submitted_by_id and task.submitted_by_id == current_user.id:
        raise HTTPException(status_code=403, detail="Cannot dismiss your own review task")
    old_status = task.status
    task.status = "dismissed"
    task.notes = notes or task.notes
    task.reviewed_at = datetime.now(timezone.utc)
    violation = db.query(Violation).filter(
        Violation.scan_id == task.scan_id, Violation.rule_id == task.rule_id
    ).first()
    if violation:
        violation.status = "dismissed"
    log_review_event(db, task_id, current_user.id, "dismissed", old_value=old_status, new_value="dismissed", notes=notes)
    log_audit(db, current_user.id, "review_dismiss", details=f"Review task {task_id} dismissed as false positive")
    _update_document_review_status(db, task.document_id)
    from app.notifications import notify_resolved
    notify_resolved(db, task, current_user)
    return ReviewActionResponse(id=task.id, status=task.status, message="Marked as dismissed.")


@router.post(
    "/reviews/{task_id}/actions/needs-fix",
    response_model=ReviewActionResponse,
    summary="Mark a review task as needs fix",
)
def needs_fix_review_task(
    task_id: int,
    notes: str = Query(""),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission(Permission.REVIEW_NEEDS_FIX)),
):
    task = _get_org_review_task(db, task_id, current_user.organization_id)
    if task.status in ("resolved", "dismissed"):
        raise HTTPException(status_code=400, detail="Cannot modify a finalized review task")
    if task.submitted_by_id and task.submitted_by_id == current_user.id:
        raise HTTPException(status_code=403, detail="Cannot request changes on your own review task")
    old_status = task.status
    task.status = "changes_requested"
    task.notes = notes or task.notes
    task.reviewed_at = datetime.now(timezone.utc)
    violation = db.query(Violation).filter(
        Violation.scan_id == task.scan_id, Violation.rule_id == task.rule_id
    ).first()
    if violation:
        violation.status = "in_review"
    log_review_event(db, task_id, current_user.id, "changes_requested", old_value=old_status, new_value="changes_requested", notes=notes)
    log_audit(db, current_user.id, "review_needs_fix", details=f"Review task {task_id} marked changes_requested")
    from app.notifications import notify_changes_requested
    notify_changes_requested(db, task, current_user)
    return ReviewActionResponse(id=task.id, status=task.status, message="Changes requested.")


@router.post(
    "/reviews/{task_id}/actions/resubmit",
    response_model=ReviewActionResponse,
    summary="Resubmit after changes — move back to in_review",
)
def resubmit_review_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission(Permission.REVIEW_RESUBMIT)),
):
    task = _get_org_review_task(db, task_id, current_user.organization_id)
    if task.status != "changes_requested":
        raise HTTPException(status_code=400, detail="Task must be in changes_requested to resubmit")
    old_status = task.status
    task.status = "in_review"
    task.reviewed_at = None
    log_review_event(db, task_id, current_user.id, "resubmitted", old_value=old_status, new_value="in_review")
    log_audit(db, current_user.id, "review_resubmit", details=f"Review task {task_id} resubmitted")
    from app.notifications import notify_auto_resubmitted
    reviewer = db.query(User).filter(User.id == task.assigned_to_id).first() if task.assigned_to_id else None
    notify_auto_resubmitted(db, task, reviewer)
    return ReviewActionResponse(id=task.id, status=task.status, message="Task resubmitted for review.")


@router.post(
    "/reviews/{task_id}/actions/retry",
    response_model=ReviewActionResponse,
    summary="Retry a failed rule evaluation",
)
def retry_review_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission(Permission.REVIEW_RETRY)),
):
    task = _get_org_review_task(db, task_id, current_user.organization_id)

    scan = db.query(Scan).filter(Scan.id == task.scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")

    rule_eval = db.query(RuleEvaluation).filter(RuleEvaluation.id == task.rule_evaluation_id).first()
    if not rule_eval:
        raise HTTPException(status_code=404, detail="Rule evaluation not found")

    doc = db.query(Document).filter(Document.id == task.document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    from app.compliance_rules_loader import RULES_BY_ID
    rule = RULES_BY_ID.get(task.rule_id)
    if not rule:
        raise HTTPException(status_code=400, detail=f"Rule '{task.rule_id}' not found in loaded rules")

    from app.compliance_engine import _check_rule
    from groq import Groq

    GROQ_API_KEY_VALUE = os.getenv("GROQ_API_KEY", "")
    groq_client = Groq(api_key=GROQ_API_KEY_VALUE)

    new_result = _check_rule(
        rule=rule,
        collection_name=doc.collection_name or os.getenv("COLLECTION_NAME", "regulens_policies"),
        top_k=3,
        groq_client=groq_client,
        groq_model="llama-3.1-8b-instant",
        document_id=task.document_id,
    )

    from app.routers.versions import _determine_eval_status, _save_rule_result

    result_label = _determine_eval_status(new_result)

    _save_rule_result(db, scan, task.document_id, new_result, current_user=current_user)

    db.delete(task)

    return ReviewActionResponse(
        id=task.id,
        status="retried",
        message=f"Rule re-evaluated — result: {result_label}.",
    )


@router.patch(
    "/reviews/{task_id}",
    response_model=ReviewActionResponse,
    summary="Update a review task (set due date, notes, etc.)",
)
def update_review_task(
    task_id: int,
    body: ReviewTaskUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission(Permission.REVIEW_UPDATE)),
):
    task = _get_org_review_task(db, task_id, current_user.organization_id)
    if task.status in ("resolved", "dismissed"):
        raise HTTPException(status_code=400, detail="Cannot update a finalized review task")
    if body.due_date is None:
        raise HTTPException(status_code=400, detail="due_date is required and cannot be cleared")
    task.due_date = datetime.fromisoformat(body.due_date)
    return ReviewActionResponse(id=task.id, status=task.status, message="Review task updated.")


class ReviewTaskEventSchema(BaseModel):
    id: int
    event_type: str
    user_name: str | None = None
    old_value: str | None = None
    new_value: str | None = None
    notes: str | None = None
    created_at: str


@router.get(
    "/reviews/{task_id}/events",
    response_model=list[ReviewTaskEventSchema],
    summary="Get the full event history for a review task",
)
def get_review_task_events(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission(Permission.REVIEW_READ)),
):
    _get_org_review_task(db, task_id, current_user.organization_id)  # verify access
    events = (
        db.query(ReviewTaskEvent)
        .filter(ReviewTaskEvent.task_id == task_id)
        .order_by(ReviewTaskEvent.created_at.asc())
        .all()
    )
    return [
        ReviewTaskEventSchema(
            id=e.id,
            event_type=e.event_type,
            user_name=e.user.name if e.user else None,
            old_value=e.old_value,
            new_value=e.new_value,
            notes=e.notes,
            created_at=e.created_at.isoformat(),
        )
        for e in events
    ]


@router.post(
    "/reviews/{task_id}/actions/reopen",
    response_model=ReviewActionResponse,
    summary="Reopen a finalized review task for a new review cycle",
)
def reopen_review_task(
    task_id: int,
    notes: str = Query(""),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission(Permission.REVIEW_REOPEN)),
):
    task = _get_org_review_task(db, task_id, current_user.organization_id)
    if task.status not in ("resolved", "dismissed"):
        raise HTTPException(status_code=400, detail="Only finalized tasks (resolved or dismissed) can be reopened")

    old_status = task.status
    task.status = "pending"
    task.assigned_to = None
    task.assigned_to_id = None
    task.assigned_by = None
    task.reviewed_at = None
    task.notes = (task.notes + "\n---\n" + notes).strip() if notes else task.notes

    violation = db.query(Violation).filter(
        Violation.scan_id == task.scan_id, Violation.rule_id == task.rule_id
    ).first()
    if violation:
        violation.status = "pending"

    log_review_event(db, task_id, current_user.id, "reopened", old_value=old_status, new_value="pending", notes=notes)
    log_audit(db, current_user.id, "review_reopen", details=f"Review task {task_id} reopened (was {old_status})")
    doc = db.query(Document).filter(Document.id == task.document_id).first()
    if doc and doc.status == "reviewed":
        doc.status = "review_pending"
    return ReviewActionResponse(id=task.id, status=task.status, message="Review task reopened.")


@router.post(
    "/reviews/{task_id}/actions/claim",
    response_model=ReviewActionResponse,
    summary="Claim an unassigned review task (self-assign)",
)
def claim_review_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission(Permission.REVIEW_START)),
):
    task = _get_org_review_task(db, task_id, current_user.organization_id)
    if task.status in ("resolved", "dismissed"):
        raise HTTPException(status_code=400, detail="Cannot claim a finalized review task")
    if task.assigned_to_id and task.assigned_to_id != current_user.id:
        raise HTTPException(status_code=400, detail="Task is already assigned to another user")

    old_assignee = task.assigned_to
    task.assigned_to = current_user.name
    task.assigned_to_id = current_user.id
    task.assigned_by = current_user.name
    if not task.due_date:
        task.due_date = datetime.now(timezone.utc) + timedelta(days=7)
    if task.status == "pending":
        task.status = "assigned"
        violation = db.query(Violation).filter(
            Violation.scan_id == task.scan_id, Violation.rule_id == task.rule_id
        ).first()
        if violation:
            violation.status = "assigned"

    log_review_event(db, task_id, current_user.id,
                     "reassigned" if old_assignee else "assigned",
                     old_value=old_assignee, new_value=current_user.name)
    log_audit(db, current_user.id, "review_claim", details=f"Review task {task_id} claimed by {current_user.name}")
    from app.notifications import notify_assigned
    notify_assigned(db, task, current_user, current_user)
    return ReviewActionResponse(id=task.id, status=task.status, message="Task claimed.")
