from __future__ import annotations

import json
import logging
import os
import uuid
from datetime import datetime, timedelta, timezone


from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import Permission, get_current_user, log_audit, require_permission, scope_document_owner
from app.file_storage import delete as delete_file, exists as file_exists, read_bytes as read_file
from app.database import get_db
from app.diff_engine import compute_diff
from app.embeddings import embed_query
from app.models import Document, DocumentVersion, RuleEvaluation, ReviewTask, Scan, User, Violation
from app.workflow_engine import create_workflow_instance
from app.vector_store import delete_document_points
from app.chunk_diff import compute_chunk_diff, get_changed_chunk_hashes
from app.selective_engine import determine_affected_rules, run_selective_audit, store_rule_chunk_mappings
from app.reconciliation import reconcile_all_frameworks

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/documents", tags=["versions"])

COLLECTION_NAME = os.getenv("COLLECTION_NAME", "regulens_policies")
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")

_SEVERITY_DEDUCTIONS = {
    "none": 0, "low": 3, "medium": 7, "high": 12, "critical": 20,
}

_GRADE_THRESHOLDS = [
    (90, "A"),
    (75, "B"),
    (60, "C"),
    (45, "D"),
    (0,  "F"),
]


def _recalculate_scan_score(scan: Scan, db: Session) -> int:
    """Recalculate a scan's score, grade and violation_count from its persisted violations.
    Fixes stale scores from previous bugs where score was computed
    from all engine results instead of only confirmed violations.
    """
    if scan.status != "completed":
        return scan.score or 0
    violations = db.query(Violation).filter(Violation.scan_id == scan.id).all()
    scan.violation_count = len(violations)
    total = sum(_SEVERITY_DEDUCTIONS.get(v.severity, 7) for v in violations)
    recalculated = max(0, 100 - total)
    if recalculated != scan.score:
        scan.score = recalculated
        db.flush()
    # Also recalculate grade so it stays consistent with the score
    grade = next(g for threshold, g in _GRADE_THRESHOLDS if recalculated >= threshold)
    if grade != scan.grade:
        scan.grade = grade
        db.flush()
    return recalculated


def _get_document_for_user(db: Session, document_id: int, user: User):
    """Fetch a document scoped to organization (and own user for employees)."""
    q = db.query(Document).filter(
        Document.id == document_id,
        Document.organization_id == user.organization_id,
    )
    q = scope_document_owner(q, user, Document)
    doc = q.first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class VersionSummary(BaseModel):
    version_id: int
    version_number: int
    filename: str
    file_size_bytes: int
    page_count: int | None
    total_chunks: int
    has_ocr_pages: bool
    created_at: str


class DocumentDetail(BaseModel):
    document_id: int
    original_filename: str
    current_version: int
    document_group_id: str | None
    versions: list[VersionSummary]


class FrameworksUpdate(BaseModel):
    frameworks: list[str]


class DiffLineSchema(BaseModel):
    kind: str
    content: str
    line_number_old: int | None = None
    line_number_new: int | None = None


class DiffResponse(BaseModel):
    old_version: int
    new_version: int
    stats: dict
    lines: list[DiffLineSchema]


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class DocumentInfo(BaseModel):
    document_id: int
    filename: str
    original_filename: str
    version_number: int
    document_group_id: str | None = None
    page_count: int | None = None
    total_chunks: int | None = None
    status: str
    upload_time: str
    collection_name: str | None = None
    frameworks: list[str] = []
    uploaded_by_name: str | None = None
    uploaded_by: int | None = None


class ScanSummary(BaseModel):
    scan_id: int
    framework: str
    scan_group_id: str | None = None
    status: str
    score: int | None = None
    grade: str | None = None
    violation_count: int = 0
    created_at: str
    completed_at: str | None = None
    scan_type: str = "full"
    rules_evaluated: int | None = None
    rules_skipped: int | None = None
    changed_chunks: int | None = None
    changed_percentage: float | None = None


class MultiScanSummary(BaseModel):
    scan_group_id: str
    frameworks: list[str]
    unified_score: int | None = None
    unified_grade: str | None = None
    total_violations: int = 0
    scans: list[ScanSummary]


class ViolationSchema(BaseModel):
    id: int
    rule_id: str
    title: str
    severity: str
    clause: str | None = None
    description: str
    excerpt: str | None = None
    recommendation: str | None = None
    confidence: int | None = None
    source_chunks: str | None = None
    page_number: int | None = None
    task_id: int | None = None
    assigned_to: str | None = None
    due_date: str | None = None
    document_version: int | None = None
    section_path: str | None = None
    previous_violation_id: int | None = None
    framework: str | None = None
    status: str | None = None


class RuleEvaluationSchema(BaseModel):
    id: int
    rule_id: str
    rule_name: str
    framework: str
    status: str
    confidence: int | None = None
    severity: str | None = None
    explanation: str | None = None
    error: str | None = None
    chunks_checked: int = 0


class ScanDetail(BaseModel):
    scan_id: int
    framework: str
    scan_group_id: str | None = None
    status: str
    score: int | None = None
    grade: str | None = None
    violation_count: int = 0
    created_at: str
    completed_at: str | None = None
    violations: list[ViolationSchema] = []
    evaluations: list[RuleEvaluationSchema] = []


class DeleteResponse(BaseModel):
    message: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/my-tasks",
    summary="List documents with pending changes-requested review tasks for the current user",
)
def list_my_review_tasks(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tasks = (
        db.query(ReviewTask)
        .join(Document, ReviewTask.document_id == Document.id)
        .filter(
            ReviewTask.status == "changes_requested",
            (ReviewTask.submitted_by_id == current_user.id) | (Document.user_id == current_user.id),
        )
        .all()
    )
    doc_ids = list({t.document_id for t in tasks})
    if not doc_ids:
        return []
    docs = (
        db.query(Document)
        .filter(Document.id.in_(doc_ids))
        .order_by(Document.upload_time.desc())
        .all()
    )
    doc_map = {d.id: d for d in docs}
    doc_tasks: dict[int, list[dict]] = {}
    for t in tasks:
        doc_tasks.setdefault(t.document_id, []).append({
            "task_id": t.id,
            "rule_name": t.rule_name,
            "framework": t.framework,
            "notes": t.notes,
            "assigned_to": t.assigned_to,
            "created_at": t.created_at.isoformat() if t.created_at else None,
        })

    result = []
    for d_id, pending in doc_tasks.items():
        d = doc_map.get(d_id)
        if not d:
            continue
        result.append({
            "document_id": d.id,
            "original_filename": d.original_filename,
            "version_number": d.version_number,
            "status": d.status,
            "frameworks": json.loads(d.frameworks) if d.frameworks else [],
            "pending_tasks": pending,
            "pending_count": len(pending),
        })

    return result


@router.get("/{document_id}", response_model=DocumentInfo)
def get_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = _get_document_for_user(db, document_id, current_user)
    return DocumentInfo(
        document_id=doc.id,
        filename=doc.filename,
        original_filename=doc.original_filename,
        version_number=doc.version_number,
        document_group_id=doc.document_group_id,
        page_count=doc.page_count,
        total_chunks=doc.total_chunks,
        status=doc.status,
        upload_time=doc.upload_time.isoformat(),
        collection_name=doc.collection_name,
        frameworks=json.loads(doc.frameworks) if doc.frameworks else [],
        uploaded_by_name=doc.uploader.name if doc.uploader else None,
        uploaded_by=doc.user_id,
    )


@router.put("/{document_id}/frameworks", response_model=DocumentInfo)
def update_document_frameworks(
    document_id: int,
    body: FrameworksUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission(Permission.DOCUMENT_UPDATE_FRAMEWORKS)),
):
    doc = _get_document_for_user(db, document_id, current_user)
    doc.frameworks = json.dumps(body.frameworks) if body.frameworks else None
    log_audit(db, current_user.id, "update_frameworks",
              f"Updated frameworks for document {document_id}: {body.frameworks}")
    return DocumentInfo(
        document_id=doc.id,
        filename=doc.filename,
        original_filename=doc.original_filename,
        version_number=doc.version_number,
        document_group_id=doc.document_group_id,
        page_count=doc.page_count,
        total_chunks=doc.total_chunks,
        status=doc.status,
        upload_time=doc.upload_time.isoformat(),
        collection_name=doc.collection_name,
        frameworks=json.loads(doc.frameworks) if doc.frameworks else [],
        uploaded_by_name=doc.uploader.name if doc.uploader else None,
        uploaded_by=doc.user_id,
    )


@router.delete("/{document_id}", response_model=DeleteResponse)
def delete_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission(Permission.DOCUMENT_DELETE)),
):
    doc = _get_document_for_user(db, document_id, current_user)

    if doc.file_path:
        try:
            delete_file(doc.file_path)
        except Exception:
            logger.exception("File storage cleanup failed for document %d", doc.file_path)

    if doc.collection_name:
        try:
            delete_document_points(doc.collection_name, document_id)
        except Exception:
            logger.exception("Qdrant cleanup failed for document %d", document_id)

    log_audit(db, current_user.id, "delete", f"Deleted document {document_id} ('{doc.filename}')")
    db.delete(doc)
    return DeleteResponse(message="Document deleted successfully")


@router.get("/{document_id}/scans", response_model=list[ScanSummary])
def list_document_scans(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = _get_document_for_user(db, document_id, current_user)
    scans = (
        db.query(Scan)
        .filter(Scan.document_id == document_id)
        .order_by(Scan.created_at.desc())
        .all()
    )
    result = []
    now = datetime.utcnow()
    for s in scans:
        # Mark scans stuck in "running" for more than 30 minutes as failed
        if s.status == "running" and s.created_at and (now - s.created_at) > timedelta(minutes=30):
            s.status = "failed"
            s.completed_at = now
            db.flush()
        if s.status == "completed" and s.score == 0:
            _recalculate_scan_score(s, db)
        result.append(
            ScanSummary(
                scan_id=s.id,
                framework=s.framework,
                scan_group_id=s.scan_group_id,
                status=s.status,
                score=s.score,
                grade=s.grade,
                violation_count=s.violation_count,
                created_at=s.created_at.isoformat(),
                completed_at=s.completed_at.isoformat() if s.completed_at else None,
                scan_type=s.scan_type or "full",
                rules_evaluated=s.rules_evaluated,
                rules_skipped=s.rules_skipped,
                changed_chunks=s.changed_chunks,
                changed_percentage=s.changed_percentage,
            )
        )
    return result


@router.get("/{document_id}/scans/{scan_id}", response_model=ScanDetail)
def get_scan_detail(
    document_id: int,
    scan_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_document_for_user(db, document_id, current_user)
    scan = (
        db.query(Scan)
        .filter(Scan.id == scan_id, Scan.document_id == document_id)
        .first()
    )
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")

    # Build a lookup of review tasks for this scan
    review_tasks = {
        t.rule_id: t
        for t in db.query(ReviewTask).filter(ReviewTask.scan_id == scan.id).all()
    }

    return ScanDetail(
        scan_id=scan.id,
        framework=scan.framework,
        scan_group_id=scan.scan_group_id,
        status=scan.status,
        score=scan.score,
        grade=scan.grade,
        violation_count=scan.violation_count,
        created_at=scan.created_at.isoformat(),
        completed_at=scan.completed_at.isoformat() if scan.completed_at else None,
        violations=[
            ViolationSchema(
                id=v.id,
                rule_id=v.rule_id,
                title=v.title,
                severity=v.severity,
                clause=v.clause,
                description=v.description,
                excerpt=v.excerpt,
                recommendation=v.recommendation,
                confidence=v.confidence,
                source_chunks=v.source_chunks,
                page_number=v.page_number,
                task_id=review_tasks[v.rule_id].id if v.rule_id in review_tasks else None,
                assigned_to=review_tasks[v.rule_id].assigned_to if v.rule_id in review_tasks else None,
                due_date=review_tasks[v.rule_id].due_date.isoformat() if v.rule_id in review_tasks and review_tasks[v.rule_id].due_date else None,
                document_version=v.document_version,
                section_path=v.section_path,
                previous_violation_id=v.previous_violation_id,
                framework=v.framework,
                status=v.status,
            )
            for v in scan.violations
        ],
        evaluations=[
            RuleEvaluationSchema(
                id=e.id,
                rule_id=e.rule_id,
                rule_name=e.rule_name,
                framework=e.framework,
                status=e.status,
                confidence=e.confidence,
                severity=e.severity,
                explanation=e.explanation,
                error=e.error,
                chunks_checked=e.chunks_checked,
            )
            for e in scan.evaluations
        ],
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _determine_eval_status(r) -> str:
    """Map a RuleResult to a rule evaluation status string."""
    if r.error:
        return "error"
    if r.confidence is not None and r.confidence < 60:
        return "warning"
    if not r.violation:
        return "passed"
    return "failed"


def _review_reason_from_error(error: str) -> str:
    """Extract a structured reason from an error message for the review queue."""
    error_lower = error.lower()
    if "timeout" in error_lower or "timed out" in error_lower:
        return "timeout"
    if "rate limit" in error_lower or "rate_limit" in error_lower:
        return "rate_limited"
    if "parse" in error_lower or "unparseable" in error_lower:
        return "parse_error"
    return "evaluation_error"


def _auto_resolve_fixed_tasks(
    db: Session,
    scan_ids: list[int],
    document_id: int,
    current_user: User,
):
    """After a re-scan, auto-resolve approved tasks and auto-resubmit changes_requested tasks whose violations were fixed."""
    doc = db.query(Document).filter(Document.id == document_id).first()
    current_version = doc.version_number if doc else None

    scan_id_set = set(scan_ids)
    resolved = 0
    resubmitted = 0
    resubmitted_reviewer_ids = set()

    approved_tasks = (
        db.query(ReviewTask)
        .filter(
            ReviewTask.document_id == document_id,
            ReviewTask.status == "approved",
        )
        .all()
    )
    for task in approved_tasks:
        if current_version:
            task_scan = db.query(Scan).filter(Scan.id == task.scan_id).first()
            if task_scan and task_scan.document and task_scan.document.version_number != current_version:
                continue

        still_present = (
            db.query(Violation)
            .filter(
                Violation.scan_id.in_(scan_id_set),
                Violation.rule_id == task.rule_id,
            )
            .first()
        )
        if not still_present:
            task.status = "resolved"
            task.reviewed_at = datetime.now(timezone.utc)
            resolved += 1

    changes_tasks = (
        db.query(ReviewTask)
        .filter(
            ReviewTask.document_id == document_id,
            ReviewTask.status == "changes_requested",
        )
        .all()
    )
    for task in changes_tasks:
        still_present = (
            db.query(Violation)
            .filter(
                Violation.scan_id.in_(scan_id_set),
                Violation.rule_id == task.rule_id,
            )
            .first()
        )
        if not still_present:
            task.status = "in_review"
            task.reviewed_at = None
            resubmitted += 1
            if task.assigned_to_id:
                resubmitted_reviewer_ids.add(task.assigned_to_id)

    if resolved:
        from app.routers.reviews import _update_document_review_status
        _update_document_review_status(db, document_id)
        log_audit(db, current_user.id, "review_auto_resolve",
                  details=f"Auto-resolved {resolved} review task(s) for document {document_id} after re-scan")

        from app.notifications import notify_resolved
        for task in approved_tasks:
            if task.status == "resolved":
                notify_resolved(db, task, None)

    if resubmitted:
        from app.routers.reviews import _update_document_review_status
        _update_document_review_status(db, document_id)
        log_audit(db, current_user.id, "review_auto_resubmit",
                  details=f"Auto-resubmitted {resubmitted} changes_requested task(s) for document {document_id} after re-scan")

        from app.notifications import notify_auto_resubmitted
        for reviewer_id in resubmitted_reviewer_ids:
            reviewer = db.query(User).filter(User.id == reviewer_id).first() if reviewer_id else None
            if reviewer:
                matching_tasks = [t for t in changes_tasks if t.assigned_to_id == reviewer_id]
                for t in matching_tasks:
                    notify_auto_resubmitted(db, t, reviewer)


def _save_rule_result(
    db: Session,
    scan: Scan,
    document_id: int,
    r,
    current_user: User | None = None,
) -> tuple[int, int]:
    """
    Persist a single RuleResult as a RuleEvaluation row.

    Also creates a Violation row when the rule *failed*, and a ReviewTask
    when the rule hit an *error* (infrastructure / LLM failure).

    Returns (violation_count, review_task_count).
    """
    status = _determine_eval_status(r)

    eval_row = RuleEvaluation(
        scan_id=scan.id,
        rule_id=r.rule_id,
        rule_name=r.rule_name,
        framework=r.regulation,
        article=r.article,
        status=status,
        confidence=r.confidence,
        severity=r.severity if r.violation else "none",
        explanation=r.explanation,
        analysis=r.analysis[:1000] if r.analysis else None,
        remediation=r.remediation or None,
        error=r.error,
        chunks_checked=r.chunks_checked,
        points_deducted=r.points_deducted,
    )
    db.add(eval_row)
    db.flush()

    # Build excerpt from source chunks (reused for violations)
    excerpt_text = None
    page_num = None
    source_chunks_json = None
    if r.source_chunks:
        import json as _json
        first = r.source_chunks[0]
        page_num = first.page_numbers[0] if first.page_numbers else None
        excerpt_text = first.text_snippet
        source_chunks_json = _json.dumps([
            {"chunk_index": c.chunk_index, "page_numbers": c.page_numbers, "text_snippet": c.text_snippet}
            for c in r.source_chunks
        ])

    def _create_violation():
        db.add(Violation(
            scan_id=scan.id,
            rule_id=r.rule_id,
            title=r.rule_name,
            framework=r.regulation,
            severity=r.severity,
            clause=r.article,
            description=r.explanation,
            excerpt=excerpt_text,
            recommendation=r.remediation or None,
            confidence=r.confidence,
            source_chunks=source_chunks_json,
            page_number=page_num,
        ))
        return 1

    def _create_review_task(reason: str):
        existing = db.query(ReviewTask).filter(
            ReviewTask.scan_id == scan.id,
            ReviewTask.rule_id == r.rule_id,
            ReviewTask.document_id == document_id,
        ).first()
        if existing:
            return 0
        db.add(ReviewTask(
            scan_id=scan.id,
            rule_evaluation_id=eval_row.id,
            rule_id=r.rule_id,
            rule_name=r.rule_name,
            framework=r.regulation,
            document_id=document_id,
            reason=reason,
            status="pending",
            submitted_by=current_user.name if current_user else None,
            submitted_by_id=current_user.id if current_user else None,
            due_date=datetime.now(timezone.utc) + timedelta(days=7),
        ))
        return 1

    v_count = 0
    rt_count = 0

    if status == "failed":
        v_count = _create_violation()
        existing_count = db.query(ReviewTask).filter(
            ReviewTask.scan_id == scan.id,
            ReviewTask.document_id == document_id,
        ).count()
        if existing_count < 10 and (r.confidence is None or r.confidence < 90):
            rt_count = _create_review_task("low_confidence")

    elif status == "warning":
        v_count = _create_violation()
        existing_count = db.query(ReviewTask).filter(
            ReviewTask.scan_id == scan.id,
            ReviewTask.document_id == document_id,
        ).count()
        if existing_count < 10:
            rt_count = _create_review_task("low_confidence")

    elif status == "error":
        rt_count = _create_review_task(_review_reason_from_error(r.error or ""))
        if r.violation:
            v_count = _create_violation()

    return v_count, rt_count


def _run_auto_scan(
    db: Session,
    document_id: int,
    frameworks: list[str],
    current_user: User,
) -> str | None:
    """Internal scan helper — called after upload or programmatically. Returns status ('scanned' or None on failure).

    Supports selective revalidation: computes chunk diffs and only re-evaluates
    rules affected by changed content, carrying forward previous results for
    unchanged rules.
    """
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc or not GROQ_API_KEY:
        return None

    coll = doc.collection_name or COLLECTION_NAME
    scan_group_id = str(uuid.uuid4())
    scan_records: dict[str, Scan] = {}
    total_violations = 0

    # ── Step 1: Compute chunk diff to decide full vs selective scan ──────
    chunk_diff = compute_chunk_diff(db, document_id)
    scan_type = "full"
    rules_evaluated_count = 0
    rules_skipped_count = 0

    if not chunk_diff.should_full_rescan and chunk_diff.total_old_chunks > 0:
        # Selective revalidation path
        changed_hashes = get_changed_chunk_hashes(chunk_diff, db)
        plan = determine_affected_rules(db, document_id, changed_hashes, frameworks)

        if not plan.should_full_rescan:
            scan_type = "selective"
            logger.info(
                "Selective scan for doc %d: %d affected rules, %d carried forward",
                document_id, len(plan.affected_rules), len(plan.carried_forward_rules),
            )
        else:
            logger.info(
                "Full scan triggered for doc %d: %s",
                document_id, plan.reason,
            )

    # ── Step 2: Create Scan records ─────────────────────────────────────
    for fw in frameworks:
        scan_records[fw] = Scan(
            document_id=document_id,
            scan_group_id=scan_group_id,
            framework=fw,
            status="running",
            scan_type=scan_type,
            chunks_diffed=chunk_diff.total_old_chunks + chunk_diff.total_new_chunks,
            changed_chunks=chunk_diff.changed_chunks,
            changed_percentage=round(chunk_diff.changed_percentage * 100, 2),
        )
        db.add(scan_records[fw])
    db.flush()

    # ── Step 3: Run audit (full or selective) ────────────────────────────
    try:
        if scan_type == "selective":
            # Selective revalidation
            changed_hashes = get_changed_chunk_hashes(chunk_diff, db)
            plan = determine_affected_rules(db, document_id, changed_hashes, frameworks)
            selective_result = run_selective_audit(
                db=db,
                document_id=document_id,
                plan=plan,
                collection_name=coll,
                groq_api_key=GROQ_API_KEY,
                frameworks=frameworks,
                top_k_per_rule=2,
            )
            all_results = selective_result.all_results
            rules_evaluated_count = selective_result.rules_evaluated
            rules_skipped_count = selective_result.rules_skipped

            # Group results by framework for per-scan persistence
            from collections import defaultdict
            results_by_fw: dict[str, list] = defaultdict(list)
            for r in all_results:
                results_by_fw[r.regulation].append(r)

            for fw in frameworks:
                scan = scan_records[fw]
                fw_results = results_by_fw.get(fw, [])
                fw_violations = 0
                for r in fw_results:
                    v, _ = _save_rule_result(db, scan, document_id, r, current_user)
                    fw_violations += v
                scan.status = "completed"
                scan.completed_at = datetime.now(timezone.utc)
                scan.rules_evaluated = sum(1 for r in fw_results if r not in selective_result.carried_results)
                scan.rules_skipped = sum(1 for r in fw_results if r in selective_result.carried_results)
                total_violations += fw_violations
                _recalculate_scan_score(scan, db)

            # Store rule-chunk mappings for future selective scans
            store_rule_chunk_mappings(db, document_id, scan_records[frameworks[0]].id, all_results)

        else:
            # Full rescan path
            from app.compliance_engine import run_multi_framework_audit
            report = run_multi_framework_audit(
                collection_name=coll,
                groq_api_key=GROQ_API_KEY,
                frameworks=frameworks,
                top_k_per_rule=2,
                document_id=document_id,
            )

            all_results_for_mapping = []
            for fw in frameworks:
                scan = scan_records[fw]
                fw_report = report.per_framework.get(fw)
                if fw_report:
                    fw_violations = 0
                    for r in fw_report.results:
                        v, _ = _save_rule_result(db, scan, document_id, r, current_user)
                        fw_violations += v
                    scan.status = "completed"
                    scan.grade = fw_report.grade
                    scan.completed_at = datetime.now(timezone.utc)
                    scan.rules_evaluated = len(fw_report.results)
                    scan.rules_skipped = 0
                    total_violations += fw_violations
                    all_results_for_mapping.extend(fw_report.results)
                    _recalculate_scan_score(scan, db)
                else:
                    scan.status = "completed"
                    scan.score = 0
                    scan.grade = "F"
                    scan.completed_at = datetime.now(timezone.utc)

            # Store rule-chunk mappings for future selective scans
            if all_results_for_mapping:
                store_rule_chunk_mappings(db, document_id, scan_records[frameworks[0]].id, all_results_for_mapping)

        for fw in frameworks:
            create_workflow_instance(db, document_id, scan_records[fw].id, fw)

    except Exception:
        db.rollback()
        for s in scan_records.values():
            s.status = "failed"
        logger.exception("Auto-scan failed for document %d", document_id)
        return None

    # ── Reconcile violations across versions (links, reuse tasks, resolve fixed) ──
    reconciliation = reconcile_all_frameworks(
        db, document_id, [s.id for s in scan_records.values()],
    )
    _auto_resolve_fixed_tasks(db, [s.id for s in scan_records.values()], document_id, current_user)
    doc.status = "scanned"
    log_audit(db, current_user.id, "auto_scan",
              f"Auto-scan document {document_id} — frameworks={frameworks} type={scan_type} "
              f"violations={total_violations} evaluated={rules_evaluated_count} skipped={rules_skipped_count}")

    from app.notifications import notify_scan_complete
    for fw in frameworks:
        notify_scan_complete(db, doc, fw)
    db.commit()
    return "scanned"


@router.post("/{document_id}/actions/scan", response_model=ScanSummary | MultiScanSummary)
def run_document_scan(
    document_id: int,
    framework: str = Query("GDPR", description="Compliance framework (single, e.g. GDPR)"),
    frameworks: str = Query(None, description="Comma-separated frameworks (multi, e.g. GDPR,SOC2,HIPAA,PCI-DSS,ISO27001)"),
    custom_name: str | None = Query(None, description="Custom regulation name"),
    custom_description: str | None = Query(None, description="Custom regulation check description"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission(Permission.DOCUMENT_SCAN)),
):
    doc = _get_document_for_user(db, document_id, current_user)

    if not GROQ_API_KEY:
        raise HTTPException(status_code=503, detail="GROQ_API_KEY is not configured")

    coll = doc.collection_name or COLLECTION_NAME

    # ── Multi-framework path ────────────────────────────────────────────
    if frameworks:
        fw_list = [f.strip() for f in frameworks.split(",") if f.strip()]
        if not fw_list:
            raise HTTPException(status_code=400, detail="No frameworks specified")

        scan_group_id = str(uuid.uuid4())

        # Create Scan rows (one per framework)
        scan_records: dict[str, Scan] = {}
        for fw in fw_list:
            scan_records[fw] = Scan(
                document_id=document_id,
                scan_group_id=scan_group_id,
                framework=fw,
                status="running",
            )
            db.add(scan_records[fw])

        # Build custom rule if provided
        extra_rules = None
        if custom_name and custom_description:
            from app.compliance_rules_loader import ComplianceRule
            extra_rules = [
                ComplianceRule(
                    id=f"custom_{uuid.uuid4().hex[:8]}",
                    name=f"Custom: {custom_name}",
                    regulation=custom_name,
                    article="Custom Regulation",
                    search_query=custom_description,
                    check_question=custom_description,
                    max_severity="high",
                    detailed_checks="Custom regulation — evaluate against the provided description.",
                ),
            ]

        try:
            from app.compliance_engine import run_multi_framework_audit

            report = run_multi_framework_audit(
                collection_name=coll,
                groq_api_key=GROQ_API_KEY,
                frameworks=fw_list,
                top_k_per_rule=2,
                document_id=document_id,
                extra_rules=extra_rules,
            )

            # Persist rule evaluations + violations + review tasks
            total_violations = 0
            for fw in fw_list:
                scan = scan_records[fw]
                fw_report = report.per_framework.get(fw)
                if fw_report:
                    fw_violations = 0
                    fw_deductions = 0
                    for r in fw_report.results:
                        v, _ = _save_rule_result(db, scan, document_id, r, current_user)
                        fw_violations += v
                        if r.violation:
                            fw_deductions += r.points_deducted
                    scan.status = "completed"
                    scan.score = max(0, 100 - fw_deductions)
                    scan.grade = fw_report.grade
                    scan.violation_count = fw_violations
                    scan.completed_at = datetime.now(timezone.utc)
                    total_violations += fw_violations
                else:
                    scan.status = "completed"
                    scan.score = 0
                    scan.grade = "F"
                    scan.completed_at = datetime.now(timezone.utc)

            for fw in fw_list:
                scan = scan_records[fw]
                create_workflow_instance(db, document_id, scan.id, fw)

        except Exception as exc:
            for s in scan_records.values():
                s.status = "failed"
            logger.exception("Multi-scan failed for document %d", document_id)
            raise HTTPException(status_code=500, detail=f"Scan failed: {exc}") from exc

        _auto_resolve_fixed_tasks(
            db,
            [s.id for s in scan_records.values()],
            document_id,
            current_user,
        )
        doc.status = "scanned"

        from app.notifications import notify_scan_complete
        for fw in fw_list:
            notify_scan_complete(db, doc, fw)

        logger.info(
            "Multi-scan %s for document %d — unified=%d grade=%s frameworks=%d violations=%d",
            scan_group_id, document_id,
            int(report.unified_score), report.unified_grade,
            len(fw_list), total_violations,
        )

        log_audit(
            db, current_user.id, "scan",
            f"Multi-scan document {document_id} — frameworks={fw_list} grade={report.unified_grade}",
        )
        return MultiScanSummary(
            scan_group_id=scan_group_id,
            frameworks=fw_list,
            unified_score=int(report.unified_score),
            unified_grade=report.unified_grade,
            total_violations=total_violations,
            scans=[
                ScanSummary(
                    scan_id=s.id,
                    framework=s.framework,
                    scan_group_id=s.scan_group_id,
                    status=s.status,
                    score=s.score,
                    grade=s.grade,
                    violation_count=s.violation_count,
                    created_at=s.created_at.isoformat(),
                    completed_at=s.completed_at.isoformat() if s.completed_at else None,
                    scan_type=s.scan_type or "full",
                    rules_evaluated=s.rules_evaluated,
                    rules_skipped=s.rules_skipped,
                    changed_chunks=s.changed_chunks,
                    changed_percentage=s.changed_percentage,
                )
                for s in scan_records.values()
            ],
        )

    # ── Single-framework path (backward-compatible) ─────────────────────
    regulation = None if framework.lower() == "all" else framework

    scan = Scan(
        document_id=document_id,
        framework=framework,
        status="running",
    )
    db.add(scan)
    db.flush()

    try:
        from app.compliance_engine import run_audit

        report = run_audit(
            collection_name=coll,
            groq_api_key=GROQ_API_KEY,
            top_k_per_rule=2,
            regulation=regulation,
            document_id=document_id,
        )

        violations_created = 0
        failed_deductions = 0
        for r in report.results:
            v, _ = _save_rule_result(db, scan, document_id, r, current_user)
            violations_created += v
            if r.violation:
                failed_deductions += r.points_deducted

        scan.status = "completed"
        scan.score = max(0, 100 - failed_deductions)
        scan.grade = report.grade
        scan.violation_count = violations_created
        scan.completed_at = datetime.now(timezone.utc)

        create_workflow_instance(db, document_id, scan.id, scan.framework)

        _auto_resolve_fixed_tasks(
            db,
            [scan.id],
            document_id,
            current_user,
        )
        doc.status = "scanned"

        from app.notifications import notify_scan_complete
        notify_scan_complete(db, doc, scan.framework)

        log_audit(
            db, current_user.id, "scan",
            f"Scan {scan.id} for document {document_id} — framework={framework} grade={scan.grade} violations={violations_created}",
        )
        logger.info(
            "Scan %d for document %d complete — score=%d grade=%s violations=%d",
            scan.id, document_id, scan.score, scan.grade, violations_created,
        )

    except Exception as exc:
        scan.status = "failed"
        logger.exception("Scan %d failed for document %d", scan.id, document_id)
        raise HTTPException(status_code=500, detail=f"Scan failed: {exc}") from exc

    return ScanSummary(
        scan_id=scan.id,
        framework=scan.framework,
        scan_group_id=scan.scan_group_id,
        status=scan.status,
        score=scan.score,
        grade=scan.grade,
        violation_count=scan.violation_count,
        created_at=scan.created_at.isoformat(),
        completed_at=scan.completed_at.isoformat() if scan.completed_at else None,
        scan_type=scan.scan_type or "full",
        rules_evaluated=scan.rules_evaluated,
        rules_skipped=scan.rules_skipped,
        changed_chunks=scan.changed_chunks,
        changed_percentage=scan.changed_percentage,
    )


# ---------------------------------------------------------------------------
# Existing endpoints
# ---------------------------------------------------------------------------

@router.get(
    "/group/{document_group_id}/versions",
    response_model=list[DocumentDetail],
    summary="List all documents and versions in a group",
)
def list_versions_by_group(
    document_group_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    docs = (
        db.query(Document)
        .filter(
            Document.document_group_id == document_group_id,
            Document.organization_id == current_user.organization_id,
        )
        .order_by(Document.version_number.asc())
        .all()
    )
    if not docs:
        raise HTTPException(status_code=404, detail="Document group not found")

    return [
        DocumentDetail(
            document_id=doc.id,
            original_filename=doc.original_filename,
            current_version=doc.version_number,
            document_group_id=doc.document_group_id,
            versions=[
                VersionSummary(
                    version_id=v.id,
                    version_number=v.version_number,
                    filename=v.filename,
                    file_size_bytes=v.file_size_bytes,
                    page_count=v.page_count,
                    total_chunks=v.total_chunks,
                    has_ocr_pages=v.has_ocr_pages,
                    created_at=v.created_at.isoformat(),
                )
                for v in doc.versions
            ] if hasattr(doc, "versions") and doc.versions else [],
        )
        for doc in docs
    ]


@router.get(
    "/{document_id}/versions",
    response_model=list[VersionSummary],
    summary="List all versions of a specific document",
)
def list_versions(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = _get_document_for_user(db, document_id, current_user)

    versions = (
        db.query(DocumentVersion)
        .filter(DocumentVersion.document_id == document_id)
        .order_by(DocumentVersion.version_number.asc())
        .all()
    )

    return [
        VersionSummary(
            version_id=v.id,
            version_number=v.version_number,
            filename=v.filename,
            file_size_bytes=v.file_size_bytes,
            page_count=v.page_count,
            total_chunks=v.total_chunks,
            has_ocr_pages=v.has_ocr_pages,
            created_at=v.created_at.isoformat(),
        )
        for v in versions
    ]


@router.get(
    "/{document_id}/versions/{version_id}",
    summary="Get full text of a specific version",
)
def get_version(
    document_id: int,
    version_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_document_for_user(db, document_id, current_user)
    version = (
        db.query(DocumentVersion)
        .filter(
            DocumentVersion.id == version_id,
            DocumentVersion.document_id == document_id,
        )
        .first()
    )
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")

    return {
        "version_id": version.id,
        "version_number": version.version_number,
        "filename": version.filename,
        "full_text": version.full_text or "",
        "created_at": version.created_at.isoformat(),
    }


@router.get(
    "/{document_id}/diff",
    response_model=DiffResponse,
    summary="Show text diff between two versions of a document",
)
def diff_versions(
    document_id: int,
    v1: int = Query(..., description="Old version number"),
    v2: int = Query(..., description="New version number"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_document_for_user(db, document_id, current_user)
    if v1 == v2:
        raise HTTPException(status_code=400, detail="v1 and v2 must be different")

    ver1 = (
        db.query(DocumentVersion)
        .filter(
            DocumentVersion.document_id == document_id,
            DocumentVersion.version_number == v1,
        )
        .first()
    )
    ver2 = (
        db.query(DocumentVersion)
        .filter(
            DocumentVersion.document_id == document_id,
            DocumentVersion.version_number == v2,
        )
        .first()
    )

    if not ver1 or not ver2:
        raise HTTPException(status_code=404, detail="One or both versions not found")

    result = compute_diff(
        old_text=ver1.full_text or "",
        new_text=ver2.full_text or "",
        old_version=v1,
        new_version=v2,
    )

    return DiffResponse(
        old_version=result.old_version,
        new_version=result.new_version,
        stats=result.stats,
        lines=[
            DiffLineSchema(
                kind=l.kind,
                content=l.content,
                line_number_old=l.line_number_old,
                line_number_new=l.line_number_new,
            )
            for l in result.lines
        ],
    )


@router.get(
    "/",
    summary="List all uploaded documents with latest version info",
)
def list_documents(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    docs = (
        db.query(Document)
        .filter(Document.organization_id == current_user.organization_id)
    )
    docs = scope_document_owner(docs, current_user, Document)
    docs = docs.order_by(Document.upload_time.desc()).all()
    return [
        {
            "document_id": d.id,
            "id": d.id,
            "filename": d.filename,
            "original_filename": d.original_filename,
            "file_size_bytes": d.file_size_bytes,
            "version_number": d.version_number,
            "document_group_id": d.document_group_id,
            "user_id": d.user_id,
            "page_count": d.page_count,
            "total_chunks": d.total_chunks,
            "status": d.status,
            "upload_time": d.upload_time.isoformat(),
            "collection_name": d.collection_name,
            "frameworks": json.loads(d.frameworks) if d.frameworks else [],
            "uploaded_by_name": d.uploader.name if d.uploader else None,
        }
        for d in docs
    ]


@router.get(
    "/{document_id}/download",
    summary="Download original PDF file",
)
def download_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = _get_document_for_user(db, document_id, current_user)
    if not doc.file_path or not file_exists(doc.file_path):
        raise HTTPException(status_code=404, detail="File not found on storage.")
    filename = doc.original_filename or doc.filename
    data = read_file(doc.file_path)
    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get(
    "/{document_id}/view",
    summary="View PDF in browser",
)
def view_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = _get_document_for_user(db, document_id, current_user)
    if not doc.file_path or not file_exists(doc.file_path):
        raise HTTPException(status_code=404, detail="File not found on storage.")
    filename = doc.original_filename or doc.filename
    data = read_file(doc.file_path)
    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@router.post(
    "/{document_id}/versions/{version_id}/actions/export",
    summary="Export version text as PDF report",
)
def export_version_pdf(
    document_id: int,
    version_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = _get_document_for_user(db, document_id, current_user)
    version = db.query(DocumentVersion).filter(
        DocumentVersion.id == version_id,
        DocumentVersion.document_id == doc.id,
    ).first()
    if not version:
        raise HTTPException(status_code=404, detail="Version not found.")
    if not version.full_text:
        raise HTTPException(status_code=400, detail="Version has no text content.")

    try:
        from fpdf import FPDF
    except ImportError:
        raise HTTPException(status_code=500, detail="PDF export library (fpdf2) not installed.")

    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Helvetica", size=10)
    pdf.multi_cell(0, 5, version.full_text)

    import io
    buf = io.BytesIO()
    pdf.output(buf)
    buf.seek(0)

    from fastapi.responses import StreamingResponse
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="v{version.version_number}_{doc.original_filename or doc.filename}.pdf"'},
    )
