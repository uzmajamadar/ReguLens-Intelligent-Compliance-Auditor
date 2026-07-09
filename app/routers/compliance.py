"""
routers/compliance.py — Legacy compliance router (feedback + rules only).

Split from the original monolithic router. Audit, review, violation, and
remediation endpoints now live in:
  - audits.py
  - reviews.py
  - violations.py
  - remediations.py
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import Permission, get_current_user, log_audit, require_permission
from app.compliance_rules_loader import get_rules_by_framework
from app.database import get_db
from app.models import AuditFeedback, User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/compliance", tags=["compliance"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

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


class RuleInfo(BaseModel):
    id: str
    name: str
    regulation: str
    article: str
    max_severity: str


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
    current_user: User = Depends(require_permission(Permission.FEEDBACK_SUBMIT)),
) -> FeedbackResponse:
    if req.status not in ("confirmed", "false_positive"):
        from fastapi import HTTPException
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
            notes=req.notes,
            user_id=current_user.id,
            organization_id=current_user.organization_id,
        )
        db.add(feedback)

    log_audit(db, current_user.id, "feedback", f"Feedback for rule '{req.rule_id}' in collection '{req.collection_name}': {req.status}")

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
    current_user: User = Depends(require_permission(Permission.FEEDBACK_READ)),
) -> list[FeedbackResponse]:
    records = db.query(AuditFeedback).filter(
        AuditFeedback.collection_name == collection_name,
        AuditFeedback.organization_id == current_user.organization_id,
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
# List all rules
# ---------------------------------------------------------------------------

@router.get(
    "/rules",
    response_model=list[RuleInfo],
    summary="List all compliance rules across all frameworks",
)
def list_rules(
    current_user: User = Depends(get_current_user),
) -> list[RuleInfo]:
    rules = get_rules_by_framework(None)
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
