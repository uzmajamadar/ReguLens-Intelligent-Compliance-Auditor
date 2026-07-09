from __future__ import annotations

import logging
import os

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import Permission, get_current_user, log_audit, require_permission
from app.compliance_rules_loader import get_available_frameworks
from app.database import get_db
from app.models import User
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


class AuditRequest(BaseModel):
    collection_name: str = Field(default=COLLECTION_NAME, description="Qdrant collection to audit")
    top_k_per_rule: int = Field(default=3, ge=1, le=10, description="Number of chunks retrieved per rule")
    frameworks: list[str] | None = Field(default=None, description="List of frameworks to audit")
    document_id: int | None = Field(default=None, description="Scope audit to a single document's chunks by document_id.")


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


class FrameworkInfo(BaseModel):
    name: str
    rule_count: int


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


def _cross_report_to_schema(report: EngineCrossReport) -> CrossFrameworkReportSchema:
    return CrossFrameworkReportSchema(
        collection_name=report.collection_name,
        audited_at=report.audited_at,
        frameworks=report.frameworks,
        unified_score=report.unified_score,
        unified_grade=report.unified_grade,
        per_framework={fw: _report_to_schema(rpt) for fw, rpt in report.per_framework.items()},
        results=[_to_schema(r) for r in report.results],
        conflicts=[_conflict_to_schema(c) for c in report.conflicts],
        severity_breakdown=report.severity_breakdown,
    )


@router.post(
    "/audit",
    response_model=AuditReportSchema | CrossFrameworkReportSchema,
    summary="Run a compliance audit (single or cross-framework)",
)
def run_compliance_audit(
    req: AuditRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission(Permission.AUDIT_RUN)),
) -> AuditReportSchema | CrossFrameworkReportSchema:
    if not GROQ_API_KEY:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="GROQ_API_KEY is not configured.")

    if req.frameworks:
        logger.info("Cross-framework audit for collection '%s' frameworks=%s (top_k=%d).", req.collection_name, req.frameworks, req.top_k_per_rule)
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
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Audit engine error: {exc}") from exc

        log_audit(db, current_user.id, "audit", f"Cross-framework audit: {req.frameworks} on collection '{req.collection_name}' — score={report.unified_score:.1f} grade={report.unified_grade}")
        logger.info("Cross-framework audit complete — unified=%.1f grade=%s conflicts=%d", report.unified_score, report.unified_grade, len(report.conflicts))
        return _cross_report_to_schema(report)

    logger.info("Starting compliance audit for collection '%s' (top_k=%d).", req.collection_name, req.top_k_per_rule)
    try:
        report = run_audit(
            collection_name=req.collection_name,
            groq_api_key=GROQ_API_KEY,
            top_k_per_rule=req.top_k_per_rule,
            document_id=req.document_id,
        )
    except Exception as exc:
        logger.exception("Compliance audit failed")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Audit engine error: {exc}") from exc

    log_audit(db, current_user.id, "audit", f"Single-framework audit on collection '{req.collection_name}' — score={report.score:.1f} grade={report.grade}")
    logger.info("Audit complete — score=%.1f grade=%s", report.score, report.grade)
    return _report_to_schema(report)


@router.get(
    "/frameworks",
    response_model=list[FrameworkInfo],
    summary="List all available compliance frameworks",
)
def list_frameworks(
    current_user: User = Depends(get_current_user),
) -> list[FrameworkInfo]:
    return [FrameworkInfo(**fw) for fw in get_available_frameworks()]
