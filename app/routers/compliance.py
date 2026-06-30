"""
routers/compliance.py — Compliance audit endpoints.

Supports both single-framework and cross-framework multi-framework audits:
  - POST /compliance/audit          — Single or multi-framework audit
  - GET  /compliance/frameworks     — List available frameworks
  - GET  /compliance/rules          — List all compliance rules
  - POST /compliance/feedback       — Human review feedback
  - GET  /compliance/feedback/{name}— Get feedback for a collection
"""
from __future__ import annotations

import logging
import os
import re
from datetime import datetime, timedelta, timezone
from difflib import SequenceMatcher

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import case
from sqlalchemy.orm import Session

from app.auth import get_current_user, log_audit, require_role
from app.compliance_rules_loader import (
    get_available_frameworks,
    get_rules_by_framework,
)
from app.database import get_db
from app.models import AuditFeedback, AuditLog, Document, DocumentVersion, RemediationSuggestion, ReviewTask, RuleEvaluation, Scan, User, Violation
from app.compliance_engine import (
    AuditReport as EngineReport,
    CrossFrameworkReport as EngineCrossReport,
    FrameworkConflict as EngineConflict,
    RuleResult as EngineRuleResult,
    run_audit,
    run_multi_framework_audit,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/compliance", tags=["compliance"])

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
COLLECTION_NAME = os.getenv("COLLECTION_NAME", "regulens_policies")


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------

class AuditRequest(BaseModel):
    collection_name: str = Field(
        default=COLLECTION_NAME,
        description="Qdrant collection to audit",
    )
    top_k_per_rule: int = Field(
        default=3,
        ge=1,
        le=10,
        description="Number of chunks retrieved per rule (more = slower but thorough)",
    )
    frameworks: list[str] | None = Field(
        default=None,
        description=(
            "List of frameworks to audit (e.g. ['GDPR', 'HIPAA', 'SOC2']). "
            "When provided, runs a cross-framework audit with conflict detection. "
            "When omitted, runs a single-framework or all-rules audit (backward-compatible)."
        ),
    )
    document_id: int | None = Field(
        default=None,
        description="Scope audit to a single document's chunks by document_id.",
    )


class RuleResultSchema(BaseModel):
    rule_id: str
    rule_name: str
    regulation: str
    article: str
    violation: bool
    severity: str
    explanation: str
    analysis: str = ""
    confidence: int | None = None
    chunks_checked: int
    points_deducted: int
    remediation: str = ""
    error: str | None = None


class AuditReportSchema(BaseModel):
    collection_name: str
    audited_at: str
    total_rules: int
    violations_found: int
    rules_passed: int
    score: float
    grade: str
    summary: str
    severity_breakdown: dict[str, int]
    results: list[RuleResultSchema]


class FrameworkConflictSchema(BaseModel):
    rule_id_a: str
    rule_name_a: str
    framework_a: str
    rule_id_b: str
    rule_name_b: str
    framework_b: str
    topic: str
    description: str
    resolveable: bool = True
    recommendation: str = ""


class CrossFrameworkReportSchema(BaseModel):
    collection_name: str
    audited_at: str
    frameworks: list[str]
    unified_score: float
    unified_grade: str
    per_framework: dict[str, AuditReportSchema]
    results: list[RuleResultSchema]
    conflicts: list[FrameworkConflictSchema]
    severity_breakdown: dict[str, int]


class FeedbackRequest(BaseModel):
    collection_name: str
    rule_id: str
    status: str = Field(..., description="'confirmed' or 'false_positive'")
    notes: str | None = None


class FeedbackResponse(BaseModel):
    rule_id: str
    status: str
    notes: str | None = None
    updated_at: str


class FrameworkInfo(BaseModel):
    name: str
    rule_count: int


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _to_schema(r: EngineRuleResult) -> RuleResultSchema:
    return RuleResultSchema(
        rule_id=r.rule_id,
        rule_name=r.rule_name,
        regulation=r.regulation,
        article=r.article,
        violation=r.violation,
        severity=r.severity,
        explanation=r.explanation,
        analysis=r.analysis,
        confidence=r.confidence,
        chunks_checked=r.chunks_checked,
        points_deducted=r.points_deducted,
        remediation=r.remediation,
        error=r.error,
    )


def _report_to_schema(report: EngineReport) -> AuditReportSchema:
    return AuditReportSchema(
        collection_name=report.collection_name,
        audited_at=report.audited_at,
        total_rules=report.total_rules,
        violations_found=report.violations_found,
        rules_passed=report.rules_passed,
        score=report.score,
        grade=report.grade,
        summary=report.summary,
        severity_breakdown=report.severity_breakdown,
        results=[_to_schema(r) for r in report.results],
    )


def _conflict_to_schema(c: EngineConflict) -> FrameworkConflictSchema:
    return FrameworkConflictSchema(
        rule_id_a=c.rule_id_a,
        rule_name_a=c.rule_name_a,
        framework_a=c.framework_a,
        rule_id_b=c.rule_id_b,
        rule_name_b=c.rule_name_b,
        framework_b=c.framework_b,
        topic=c.topic,
        description=c.description,
        resolveable=c.resolveable,
        recommendation=c.recommendation,
    )


def _get_org_review_task(db: Session, task_id: int, org_id: int) -> ReviewTask:
    """Fetch a ReviewTask scoped to the organization via Document join."""
    task = (
        db.query(ReviewTask)
        .join(Document, ReviewTask.document_id == Document.id)
        .filter(ReviewTask.id == task_id, Document.organization_id == org_id)
        .first()
    )
    if not task:
        raise HTTPException(status_code=404, detail="Review task not found")
    return task


def _cross_report_to_schema(report: EngineCrossReport) -> CrossFrameworkReportSchema:
    return CrossFrameworkReportSchema(
        collection_name=report.collection_name,
        audited_at=report.audited_at,
        frameworks=report.frameworks,
        unified_score=report.unified_score,
        unified_grade=report.unified_grade,
        per_framework={
            fw: _report_to_schema(rpt)
            for fw, rpt in report.per_framework.items()
        },
        results=[_to_schema(r) for r in report.results],
        conflicts=[_conflict_to_schema(c) for c in report.conflicts],
        severity_breakdown=report.severity_breakdown,
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post(
    "/audit",
    response_model=AuditReportSchema | CrossFrameworkReportSchema,
    summary="Run a compliance audit (single or cross-framework)",
    description=(
        "Runs compliance checks against documents in the specified Qdrant collection. "
        "When `frameworks` is provided, runs a cross-framework super-scan with per-framework "
        "scores, a unified grade, and conflict detection. When omitted, runs the default "
        "single-framework audit (all rules) for backward compatibility."
    ),
)
def run_compliance_audit(
    req: AuditRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "compliance_manager")),
) -> AuditReportSchema | CrossFrameworkReportSchema:
    if not GROQ_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="GROQ_API_KEY is not configured.",
        )

    # ── Cross-framework audit ──────────────────────────────────────
    if req.frameworks:
        logger.info(
            "Cross-framework audit for collection '%s' frameworks=%s (top_k=%d).",
            req.collection_name, req.frameworks, req.top_k_per_rule,
        )
        try:
            report = run_multi_framework_audit(
                collection_name=req.collection_name,
                groq_api_key=GROQ_API_KEY,
                frameworks=req.frameworks,
                top_k_per_rule=req.top_k_per_rule,
                document_id=req.document_id,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except Exception as exc:
            logger.exception("Cross-framework audit failed")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Audit engine error: {exc}",
            ) from exc

        log_audit(
            db, current_user.id, "audit",
            f"Cross-framework audit: {req.frameworks} on collection '{req.collection_name}' — "
            f"score={report.unified_score:.1f} grade={report.unified_grade}",
        )
        logger.info(
            "Cross-framework audit complete — unified=%.1f grade=%s conflicts=%d",
            report.unified_score, report.unified_grade, len(report.conflicts),
        )
        return _cross_report_to_schema(report)

    # ── Single-framework / all-rules audit (backward-compatible) ───
    logger.info(
        "Starting compliance audit for collection '%s' (top_k=%d).",
        req.collection_name, req.top_k_per_rule,
    )

    try:
        report = run_audit(
            collection_name=req.collection_name,
            groq_api_key=GROQ_API_KEY,
            top_k_per_rule=req.top_k_per_rule,
            document_id=req.document_id,
        )
    except Exception as exc:
        logger.exception("Compliance audit failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Audit engine error: {exc}",
        ) from exc

    log_audit(
        db, current_user.id, "audit",
        f"Single-framework audit on collection '{req.collection_name}' — "
        f"score={report.score:.1f} grade={report.grade}",
    )
    logger.info("Audit complete — score=%.1f grade=%s", report.score, report.grade)
    return _report_to_schema(report)


# ---------------------------------------------------------------------------
# Frameworks
# ---------------------------------------------------------------------------

@router.get(
    "/frameworks",
    response_model=list[FrameworkInfo],
    summary="List all available compliance frameworks",
    description="Returns every regulatory framework and the number of rules defined for each.",
)
def list_frameworks(
    current_user: User = Depends(get_current_user),
) -> list[FrameworkInfo]:
    return [FrameworkInfo(**fw) for fw in get_available_frameworks()]


# ---------------------------------------------------------------------------
# Human Feedback Layer
# ---------------------------------------------------------------------------

@router.post(
    "/feedback",
    response_model=FeedbackResponse,
    summary="Submit human review feedback for a violation",
)
def submit_feedback(
    req: FeedbackRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FeedbackResponse:
    if req.status not in ("confirmed", "false_positive"):
        raise HTTPException(status_code=400, detail="Status must be confirmed or false_positive")

    feedback = db.query(AuditFeedback).filter(
        AuditFeedback.collection_name == req.collection_name,
        AuditFeedback.rule_id == req.rule_id
    ).first()

    if feedback:
        feedback.status = req.status
        feedback.notes = req.notes
    else:
        feedback = AuditFeedback(
            collection_name=req.collection_name,
            rule_id=req.rule_id,
            status=req.status,
            notes=req.notes
        )
        db.add(feedback)

    db.commit()
    db.refresh(feedback)
    log_audit(
        db, current_user.id, "feedback",
        f"Feedback for rule '{req.rule_id}' in collection '{req.collection_name}': {req.status}",
    )

    return FeedbackResponse(
        rule_id=feedback.rule_id,
        status=feedback.status,
        notes=feedback.notes,
        updated_at=feedback.updated_at.isoformat()
    )


@router.get(
    "/feedback/{collection_name}",
    response_model=list[FeedbackResponse],
    summary="Get all human review feedback for a collection",
)
def get_feedback(
    collection_name: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[FeedbackResponse]:
    records = db.query(AuditFeedback).filter(
        AuditFeedback.collection_name == collection_name
    ).all()

    return [
        FeedbackResponse(
            rule_id=r.rule_id,
            status=r.status,
            notes=r.notes,
            updated_at=r.updated_at.isoformat()
        )
        for r in records
    ]


# ---------------------------------------------------------------------------
# Review Queue Schemas
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Review Queue Endpoints
# ---------------------------------------------------------------------------

@router.get(
    "/review",
    response_model=list[ReviewTaskSchema],
    summary="List review tasks (pending human review)",
)
def list_review_tasks(
    status_filter: str = Query("pending_review", description="Filter by status: pending_review, pending_assignment, assigned, in_review, approved, waiting_for_fix, dismissed, needs_fix"),
    framework: str = Query(None, description="Filter by framework name"),
    assigned_to: str = Query(None, description="Filter by assigned user name (deprecated — use assigned_to_id)"),
    assigned_to_id: int = Query(None, description="Filter by assigned user ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
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

    # Preload document names
    doc_ids = {t.document_id for t in tasks}
    docs = {d.id: d.original_filename or d.filename for d in db.query(Document).filter(Document.id.in_(doc_ids)).all()} if doc_ids else {}

    # Preload violation details for each task
    violation_map: dict[tuple[int, str], Violation] = {}
    if tasks:
        from sqlalchemy import or_, and_
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

    # Preload audit logs for tasks with missing assigned_by / submitted_by
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
    "/review/stats",
    summary="Get aggregate counts for the review queue",
)
def get_review_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    base = (
        db.query(ReviewTask)
        .join(Document, ReviewTask.document_id == Document.id)
        .filter(Document.organization_id == current_user.organization_id)
    )
    total = base.count()
    pending = base.filter(ReviewTask.status == "pending_review").count()
    pending_assignment = base.filter(ReviewTask.status == "pending_assignment").count()
    assigned = base.filter(ReviewTask.status == "assigned").count()
    in_review = base.filter(ReviewTask.status == "in_review").count()
    approved = base.filter(ReviewTask.status == "approved").count()
    waiting_for_fix = base.filter(ReviewTask.status == "waiting_for_fix").count()
    dismissed = base.filter(ReviewTask.status == "dismissed").count()
    needs_fix = base.filter(ReviewTask.status == "needs_fix").count()
    return {
        "total": total,
        "pending_review": pending,
        "pending_assignment": pending_assignment,
        "assigned": assigned,
        "in_review": in_review,
        "approved": approved,
        "waiting_for_fix": waiting_for_fix,
        "dismissed": dismissed,
        "needs_fix": needs_fix,
    }


@router.post(
    "/review/{task_id}/start-review",
    response_model=ReviewActionResponse,
    summary="Mark a review task as being actively reviewed",
)
def start_review_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "compliance_manager", "reviewer")),
):
    task = _get_org_review_task(db, task_id, current_user.organization_id)
    if task.status != "assigned":
        raise HTTPException(status_code=400, detail="Task must be in 'assigned' status to start review")
    task.status = "in_review"
    violation = db.query(Violation).filter(
        Violation.scan_id == task.scan_id, Violation.rule_id == task.rule_id
    ).first()
    if violation and violation.status == "assigned":
        violation.status = "in_review"
    db.commit()
    log_audit(db, current_user.id, "review_start", details=f"Review task {task_id} started (in_review)")
    return ReviewActionResponse(id=task.id, status=task.status, message="Review started.")


@router.post(
    "/review/{task_id}/approve",
    response_model=ReviewActionResponse,
    summary="Approve a review task (confirm the finding)",
)
def approve_review_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "compliance_manager", "reviewer")),
):
    task = _get_org_review_task(db, task_id, current_user.organization_id)
    if task.status not in ("in_review", "assigned", "pending_review"):
        raise HTTPException(status_code=400, detail="Task must be in review before approval")
    task.status = "waiting_for_fix"
    task.reviewed_at = datetime.now(timezone.utc)

    # Update violation status
    violation = db.query(Violation).filter(
        Violation.scan_id == task.scan_id, Violation.rule_id == task.rule_id
    ).first()
    if violation and violation.status in ("assigned", "in_review", "pending_assignment"):
        violation.status = "waiting_for_fix"

    # Update linked suggestion status
    if task.suggestion_id:
        suggestion = db.query(RemediationSuggestion).filter(RemediationSuggestion.id == task.suggestion_id).first()
        if suggestion and suggestion.status == "accepted":
            suggestion.status = "approved"

    db.commit()
    log_audit(db, current_user.id, "review_approve", details=f"Review task {task_id} approved (rule={task.rule_id})")
    from app.notifications import notify_resolved
    notify_resolved(db, task, current_user)
    return ReviewActionResponse(id=task.id, status=task.status, message="Finding approved.")


@router.post(
    "/review/{task_id}/resolve",
    response_model=ReviewActionResponse,
    summary="Final approval by compliance manager — resolves violation",
)
def resolve_review_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "compliance_manager")),
):
    task = _get_org_review_task(db, task_id, current_user.organization_id)

    if task.status not in ("approved", "waiting_for_fix"):
        raise HTTPException(status_code=400, detail="Task must be approved before final resolution")

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

    db.commit()
    log_audit(db, current_user.id, "review_resolve", details=f"Review task {task_id} resolved (rule={task.rule_id})")
    from app.notifications import notify_resolved
    notify_resolved(db, task, current_user)
    return ReviewActionResponse(id=task.id, status=task.status, message="Violation resolved.")


@router.post(
    "/review/{task_id}/reject",
    response_model=ReviewActionResponse,
    summary="Reject a review task (mark as false positive)",
)
def reject_review_task(
    task_id: int,
    notes: str = Query(""),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "compliance_manager", "reviewer")),
):
    task = _get_org_review_task(db, task_id, current_user.organization_id)
    if task.status not in ("in_review", "assigned"):
        raise HTTPException(status_code=400, detail="Task must be in review before dismissal")
    task.status = "dismissed"
    task.notes = notes or task.notes
    task.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    log_audit(db, current_user.id, "review_dismiss", details=f"Review task {task_id} dismissed as false positive")
    from app.notifications import notify_resolved
    notify_resolved(db, task, current_user)
    return ReviewActionResponse(id=task.id, status=task.status, message="Marked as dismissed.")


@router.post(
    "/review/{task_id}/needs-fix",
    response_model=ReviewActionResponse,
    summary="Mark a review task as needs fix",
)
def needs_fix_review_task(
    task_id: int,
    notes: str = Query(""),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "compliance_manager", "reviewer")),
):
    task = _get_org_review_task(db, task_id, current_user.organization_id)
    task.status = "needs_fix"
    task.notes = notes or task.notes
    task.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    log_audit(db, current_user.id, "review_needs_fix", details=f"Review task {task_id} marked needs fix")
    from app.notifications import notify_resolved
    notify_resolved(db, task, current_user)
    return ReviewActionResponse(id=task.id, status=task.status, message="Marked as needs fix.")


@router.post(
    "/review/{task_id}/retry",
    response_model=ReviewActionResponse,
    summary="Retry a failed rule evaluation",
)
def retry_review_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "compliance_manager")),
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
        collection_name=doc.collection_name or COLLECTION_NAME,
        top_k=3,
        groq_client=groq_client,
        groq_model="llama-3.1-8b-instant",
        document_id=task.document_id,
    )

    from app.routers.versions import _determine_eval_status, _save_rule_result

    result_label = _determine_eval_status(new_result)

    # Save the new result (creates new RuleEvaluation + Violation/ReviewTask if needed)
    _save_rule_result(db, scan, task.document_id, new_result, current_user=current_user)

    # Remove the old review task (old RuleEvaluation kept for audit trail)
    db.delete(task)
    db.commit()

    return ReviewActionResponse(
        id=task.id,
        status="retried",
        message=f"Rule re-evaluated — result: {result_label}.",
    )


@router.put(
    "/review/{task_id}/due-date",
    response_model=ReviewActionResponse,
    summary="Set due date for a review task",
)
def set_review_due_date(
    task_id: int,
    due_date: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "compliance_manager")),
):
    task = _get_org_review_task(db, task_id, current_user.organization_id)
    task.due_date = datetime.fromisoformat(due_date)
    db.commit()
    return ReviewActionResponse(id=task.id, status=task.status, message=f"Due date set to {due_date}.")


# ---------------------------------------------------------------------------
# Submit Violation for Review
# ---------------------------------------------------------------------------

class SubmitReviewResponse(BaseModel):
    task_id: int
    violation_id: int
    status: str
    message: str


@router.post(
    "/violations/{violation_id}/submit-review",
    response_model=SubmitReviewResponse,
    summary="Submit a violation for human review",
)
def submit_violation_for_review(
    violation_id: int,
    suggestion_id: int | None = Query(None, description="Optional remediation suggestion ID to link"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
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

    # Check if a review task already exists for this scan+rule
    existing = (
        db.query(ReviewTask)
        .filter(ReviewTask.scan_id == violation.scan_id, ReviewTask.rule_id == violation.rule_id)
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="Review task already exists for this violation")

    if suggestion_id:
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
        status="pending_assignment",
        submitted_by=current_user.name,
        suggestion_id=suggestion_id,
        due_date=datetime.now(timezone.utc) + timedelta(days=7),
    )
    db.add(task)
    violation.status = "pending_assignment"
    db.commit()
    db.refresh(task)

    return SubmitReviewResponse(
        task_id=task.id,
        violation_id=violation.id,
        status=violation.status,
        message="Submitted for review. A compliance manager will assign a reviewer.",
    )


# ---------------------------------------------------------------------------
# Remediation Copilot Schemas
# ---------------------------------------------------------------------------

class RemediationSuggestionSchema(BaseModel):
    id: int
    violation_id: int
    scan_id: int
    rule_id: str
    original_clause: str
    suggested_clause: str
    section_reference: str | None = None
    reasoning: str | None = None
    status: str
    user_modified_text: str | None = None
    created_at: str
    resolved_at: str | None = None


class RemediationGenerateResponse(BaseModel):
    suggestion: RemediationSuggestionSchema
    message: str


class RemediationActionResponse(BaseModel):
    id: int
    status: str
    message: str
    version: int | None = None


# ---------------------------------------------------------------------------
# Remediation Copilot Endpoints
# ---------------------------------------------------------------------------

@router.post(
    "/remediate/{violation_id}",
    summary="Generate an AI remediation suggestion for a violation",
    description=(
        "Uses a dedicated LLM call to analyze the violating clause and generate "
        "a precise, compliant replacement text. Returns original vs. suggested side-by-side."
    ),
)
def generate_remediation(
    violation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "compliance_manager")),
) -> RemediationGenerateResponse:
    if not GROQ_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="GROQ_API_KEY is not configured.",
        )

    violation = (
        db.query(Violation)
        .join(Scan, Violation.scan_id == Scan.id)
        .join(Document, Scan.document_id == Document.id)
        .filter(Violation.id == violation_id, Document.organization_id == current_user.organization_id)
        .first()
    )
    if not violation:
        raise HTTPException(status_code=404, detail="Violation not found")

    from app.compliance_rules_loader import RULES_BY_ID
    rule = RULES_BY_ID.get(violation.rule_id)
    if not rule:
        raise HTTPException(status_code=400, detail=f"Rule '{violation.rule_id}' not found")

    from groq import Groq

    groq_client = Groq(api_key=GROQ_API_KEY)

    prompt = f"""You are a compliance remediation expert. Given a compliance violation, generate the exact fix.

RULES:
- Output ONLY valid JSON with these keys: original_clause, suggested_clause, section_reference, reasoning
- original_clause: the exact text from the document that violates the rule (copy the excerpt verbatim)
- suggested_clause: a SINGLE FLAT STRING (NOT a nested object). The compliant replacement text formatted as a professional legal document. Use \\n for line breaks and **markdown** for headings. Include specific timelines, rights, and procedures. Example: "**Data Retention**\\nWe will retain data for 90 days.\\n**Data Subject Rights**\\nUsers may request rectification."
- section_reference: which section/paragraph of the document needs modification (e.g. "Section 4.2" or "Data Retention Policy")
- reasoning: 1-2 sentences explaining why the suggested text resolves the violation

VIOLATION DETAILS:
- Rule Name: {rule.name}
- Rule Article: {rule.article}
- Rule Question: {rule.name}
- Violation Description: {violation.description}
- Violating Excerpt: {violation.excerpt or "Not provided"}
- Severity: {violation.severity}

Return ONLY valid JSON with no markdown formatting or extra text."""

    try:
        response = groq_client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=4096,
        )
    except Exception as exc:
        logger.exception("LLM call failed for violation %d", violation_id)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"LLM call failed: {exc}",
        ) from exc

    raw = response.choices[0].message.content.strip()
    # Strip markdown code fences if present
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[-1] if "\n" in raw else raw[3:]
        if raw.endswith("```"):
            raw = raw[:-3].strip()

    import json
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        logger.error("LLM returned invalid JSON for violation %d: %s", violation_id, raw[:300])
        raise HTTPException(status_code=502, detail=f"LLM returned invalid JSON: {raw[:300]}")

    original_clause = data.get("original_clause", violation.excerpt or "")
    suggested_clause = data.get("suggested_clause", "")
    section_reference = data.get("section_reference", "")
    reasoning = data.get("reasoning", "")

    # LLM sometimes returns suggested_clause as a nested object instead of a string
    if not isinstance(suggested_clause, str):
        suggested_clause = _dict_to_text(suggested_clause)

    suggestion = RemediationSuggestion(
        violation_id=violation.id,
        scan_id=violation.scan_id,
        rule_id=violation.rule_id,
        original_clause=original_clause,
        suggested_clause=suggested_clause,
        section_reference=section_reference,
        reasoning=reasoning,
        status="pending",
    )
    db.add(suggestion)
    db.commit()
    db.refresh(suggestion)

    return RemediationGenerateResponse(
        suggestion=_remediation_to_schema(suggestion),
        message="Remediation suggestion generated.",
    )


def _normalize(text: str) -> str:
    """Collapse whitespace, lowercase for fuzzy comparison."""
    return re.sub(r"\s+", " ", text).strip().lower()


def _dict_to_text(obj, depth=0) -> str:
    """Convert a nested dict (LLM output) into a formatted text string."""
    indent = "  " * depth
    lines = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            heading = k.strip("* ")
            if isinstance(v, (dict, list)):
                lines.append(f"{indent}{heading}")
                lines.append(_dict_to_text(v, depth + 1))
            else:
                lines.append(f"{indent}{heading}: {v}")
    elif isinstance(obj, list):
        for item in obj:
            lines.append(f"{indent}- {_dict_to_text(item, depth + 1)}")
    else:
        return str(obj)
    return "\n".join(lines)


def _find_and_replace(full_text: str, clause: str, excerpt: str | None, replacement: str) -> str | None:
    """Find `clause` (or `excerpt` as fallback) in `full_text` and replace with `replacement`.

    Tries: exact match, whitespace-normalized match, fuzzy substring match.
    Returns the new text, or None if no match found.
    """
    candidates = [clause]
    if excerpt:
        candidates.append(excerpt)

    # Strategy 1: exact match (fast path)
    for c in candidates:
        if not c:
            continue
        idx = full_text.find(c)
        if idx != -1:
            return full_text[:idx] + replacement + full_text[idx + len(c):]

    # Strategy 2: whitespace-normalized match
    norm_full = _normalize(full_text)
    for c in candidates:
        if not c:
            continue
        norm_c = _normalize(c)
        idx = norm_full.find(norm_c)
        if idx != -1:
            # Find start position in original text
            orig_start = 0
            norm_pos = 0
            for char in full_text:
                if norm_pos >= idx:
                    break
                if not char.isspace():
                    norm_pos += 1
                orig_start += 1
            # Find end position in original text (match non-ws chars of c)
            orig_end = orig_start
            non_ws_matched = 0
            total_non_ws = sum(1 for ch in c if not ch.isspace())
            for char in full_text[orig_start:]:
                if non_ws_matched >= total_non_ws:
                    break
                if not char.isspace():
                    non_ws_matched += 1
                orig_end += 1
            return full_text[:orig_start] + replacement + full_text[orig_end:]

    # Strategy 3: fuzzy — longest common substring between excerpt and full_text
    if excerpt:
        matcher = SequenceMatcher(
            None,
            _normalize(excerpt),
            norm_full,
        )
        match = matcher.find_longest_match(
            0, len(_normalize(excerpt)),
            0, len(norm_full),
        )
        if match.size > len(_normalize(excerpt)) * 0.6:
            orig_start = 0
            norm_pos = 0
            for char in full_text:
                if norm_pos >= match.b:
                    break
                if not char.isspace():
                    norm_pos += 1
                orig_start += 1
            # Find end position in original text
            orig_end = orig_start
            non_ws_matched = 0
            total_non_ws = sum(1 for ch in excerpt if not ch.isspace())
            for char in full_text[orig_start:]:
                if non_ws_matched >= total_non_ws:
                    break
                if not char.isspace():
                    non_ws_matched += 1
                orig_end += 1
            return full_text[:orig_start] + replacement + full_text[orig_end:]

    return None


def _remediation_to_schema(s: RemediationSuggestion) -> RemediationSuggestionSchema:
    return RemediationSuggestionSchema(
        id=s.id,
        violation_id=s.violation_id,
        scan_id=s.scan_id,
        rule_id=s.rule_id,
        original_clause=s.original_clause,
        suggested_clause=s.suggested_clause,
        section_reference=s.section_reference,
        reasoning=s.reasoning,
        status=s.status,
        user_modified_text=s.user_modified_text,
        created_at=s.created_at.isoformat(),
        resolved_at=s.resolved_at.isoformat() if s.resolved_at else None,
    )


@router.post(
    "/remediation/{suggestion_id}/accept",
    response_model=RemediationActionResponse,
    summary="Accept a remediation suggestion (mark as accepted)",
)
def accept_remediation(
    suggestion_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "compliance_manager")),
):
    s = db.query(RemediationSuggestion).filter(RemediationSuggestion.id == suggestion_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Remediation suggestion not found")
    s.status = "accepted"
    s.resolved_at = datetime.now(timezone.utc)
    db.commit()
    log_audit(db, current_user.id, "remediation_accept", details=f"Remediation {suggestion_id} accepted")
    return RemediationActionResponse(id=s.id, status=s.status, message="Remediation accepted.")


@router.post(
    "/remediation/{suggestion_id}/reject",
    response_model=RemediationActionResponse,
    summary="Reject a remediation suggestion",
)
def reject_remediation(
    suggestion_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "compliance_manager")),
):
    s = db.query(RemediationSuggestion).filter(RemediationSuggestion.id == suggestion_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Remediation suggestion not found")
    s.status = "rejected"
    s.resolved_at = datetime.now(timezone.utc)
    db.commit()
    log_audit(db, current_user.id, "remediation_reject", details=f"Remediation {suggestion_id} rejected")
    return RemediationActionResponse(id=s.id, status=s.status, message="Remediation rejected.")


@router.post(
    "/remediation/{suggestion_id}/edit",
    response_model=RemediationActionResponse,
    summary="Save a user-modified version of a remediation suggestion",
)
def edit_remediation(
    suggestion_id: int,
    modified_text: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "compliance_manager")),
):
    s = db.query(RemediationSuggestion).filter(RemediationSuggestion.id == suggestion_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Remediation suggestion not found")
    s.user_modified_text = modified_text
    s.status = "modified"
    s.resolved_at = datetime.now(timezone.utc)
    db.commit()
    log_audit(db, current_user.id, "remediation_edit", details=f"Remediation {suggestion_id} edited")
    return RemediationActionResponse(id=s.id, status=s.status, message="Remediation updated.")


@router.post(
    "/remediation/{suggestion_id}/apply",
    response_model=RemediationActionResponse,
    summary="Apply the remediation by creating a new document version with the fix",
    description=(
        "Creates a new DocumentVersion with the original_clause replaced by suggested_clause "
        "in the document's full text. Uses fuzzy matching so the LLM-generated clause doesn't "
        "need to be a verbatim match. Increments the document version number."
    ),
)
def apply_remediation(
    suggestion_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    s = db.query(RemediationSuggestion).filter(RemediationSuggestion.id == suggestion_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Remediation suggestion not found")

    if s.status not in ("accepted", "modified"):
        raise HTTPException(status_code=400, detail="Suggestion must be accepted or modified before applying")

    violation = db.query(Violation).filter(Violation.id == s.violation_id).first()
    if not violation:
        raise HTTPException(status_code=404, detail="Violation not found")

    scan = db.query(Scan).filter(Scan.id == s.scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")

    doc = db.query(Document).filter(Document.id == scan.document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    full_text = doc.full_text
    if not full_text:
        raise HTTPException(status_code=400, detail="Document has no full_text")

    replacement_text = s.user_modified_text if s.status == "modified" and s.user_modified_text else s.suggested_clause

    new_text = _find_and_replace(full_text, s.original_clause, violation.excerpt, replacement_text)
    if new_text is None:
        raise HTTPException(
            status_code=400,
            detail=(
                "Could not find the violating clause in the document full_text, even with "
                "fuzzy matching. The text may have already been modified, or the LLM-generated "
                "clause differs too much from the original. Try editing the suggested clause "
                "to match the document text exactly."
            ),
        )

    doc.version_number = (doc.version_number or 1) + 1
    doc.full_text = new_text

    version = DocumentVersion(
        document_id=doc.id,
        version_number=doc.version_number,
        filename=doc.filename,
        file_size_bytes=doc.file_size_bytes,
        page_count=doc.page_count,
        total_chunks=doc.total_chunks,
        has_ocr_pages=doc.has_ocr_pages,
        full_text=new_text,
    )
    db.add(version)

    s.status = "applied"
    s.resolved_at = datetime.now(timezone.utc)
    db.commit()
    log_audit(
        db, current_user.id, "remediation_apply",
        details=f"Remediation {suggestion_id} applied — new version {doc.version_number}",
    )

    return RemediationActionResponse(
        id=s.id,
        status=s.status,
        version=doc.version_number,
        message=(
            f"Applied Successfully\n"
            f"Document Version: v{doc.version_number}\n"
            f"Changes:\n"
            f"+ Added compliant clause for '{violation.rule_id}'"
        ),
    )


@router.get(
    "/violations/{violation_id}/remediations",
    response_model=list[RemediationSuggestionSchema],
    summary="List all remediation suggestions for a given violation",
)
def list_violation_remediations(
    violation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    suggestions = db.query(RemediationSuggestion).filter(
        RemediationSuggestion.violation_id == violation_id
    ).order_by(RemediationSuggestion.created_at.desc()).all()
    return [_remediation_to_schema(s) for s in suggestions]


# ---------------------------------------------------------------------------
# Consolidated Violations Endpoint
# ---------------------------------------------------------------------------

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


class ViolationStatusUpdate(BaseModel):
    status: str

class ViolationAssignUpdate(BaseModel):
    assigned_to: str | None = None


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
    if current_user.role == "employee":
        q = q.filter(Document.user_id == current_user.id)
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

    # Build review-status lookup: (scan_id, rule_id) -> latest status
    review_status_map = {}
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
        )
        for v in violations
    ]


@router.patch(
    "/violations/{violation_id}/status",
    summary="Update violation status",
)
def update_violation_status(
    violation_id: int,
    body: ViolationStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    violation = db.query(Violation).filter(Violation.id == violation_id).first()
    if not violation:
        raise HTTPException(status_code=404, detail="Violation not found")

    scan = db.query(Scan).filter(Scan.id == violation.scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    doc = db.query(Document).filter(Document.id == scan.document_id).first()
    if not doc or doc.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Access denied")

    valid_statuses = {"detected", "assigned", "in_review", "resolved", "dismissed"}
    if body.status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {', '.join(sorted(valid_statuses))}")

    violation.status = body.status
    db.commit()
    return {"message": "Status updated", "id": violation_id, "status": violation.status}


@router.patch(
    "/violations/{violation_id}/assign",
    summary="Assign violation to a user",
)
def assign_violation(
    violation_id: int,
    body: ViolationAssignUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
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
    scan = violation.scan

    if not body.assigned_to:
        violation.assigned_to = None
        db.commit()
        return {"message": "Unassigned", "id": violation_id, "assigned_to": None, "status": violation.status}

    assignee_user = db.query(User).filter(User.name == body.assigned_to, User.organization_id == current_user.organization_id).first()
    assignee_id = assignee_user.id if assignee_user else None

    violation.assigned_to = body.assigned_to
    if violation.status in ("open", "detected"):
        violation.status = "assigned"

    # Auto-create ReviewTask so it shows in the Review Queue for the assignee
    existing_task = (
        db.query(ReviewTask)
        .filter(ReviewTask.scan_id == violation.scan_id, ReviewTask.rule_id == violation.rule_id)
        .first()
    )
    if existing_task and existing_task.status not in ("resolved",):
        existing_task.assigned_to = body.assigned_to
        existing_task.assigned_to_id = assignee_id
        existing_task.assigned_by = current_user.name
        if existing_task.status in ("pending_assignment", "open"):
            existing_task.status = "assigned"
    elif not existing_task or existing_task.status == "resolved":
        task = ReviewTask(
            scan_id=violation.scan_id,
            rule_id=violation.rule_id,
            rule_name=violation.title,
            framework=violation.framework,
            document_id=scan.document_id,
            reason="assigned_from_compliance",
            status="assigned",
            assigned_to=body.assigned_to,
            assigned_to_id=assignee_id,
            submitted_by=current_user.name,
            assigned_by=current_user.name,
            due_date=datetime.now(timezone.utc) + timedelta(days=7),
        )
        db.add(task)

    db.commit()
    return {"message": "Assigned", "id": violation_id, "assigned_to": violation.assigned_to, "status": violation.status}


# ---------------------------------------------------------------------------
# List all rules (now using loader — shows all frameworks)
# ---------------------------------------------------------------------------

class RuleInfo(BaseModel):
    id: str
    name: str
    regulation: str
    article: str
    max_severity: str


@router.get(
    "/rules",
    response_model=list[RuleInfo],
    summary="List all compliance rules across all frameworks",
    description="Returns every compliance rule across all frameworks (GDPR, HR, HIPAA, SOC2, PCI-DSS, ISO27001, etc.).",
)
def list_rules(
    current_user: User = Depends(get_current_user),
) -> list[RuleInfo]:
    rules = get_rules_by_framework(None)  # all rules
    return [
        RuleInfo(
            id=r.id,
            name=r.name,
            regulation=r.regulation,
            article=r.article,
            max_severity=r.max_severity,
        )
        for r in rules
    ]
