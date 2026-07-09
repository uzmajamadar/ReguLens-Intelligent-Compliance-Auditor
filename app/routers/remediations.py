from __future__ import annotations

import json
import logging
import os
import re
from datetime import datetime, timezone
from difflib import SequenceMatcher

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import Permission, get_current_user, log_audit, require_permission
from app.database import get_db
from app.models import Document, DocumentVersion, RemediationSuggestion, Scan, Violation, User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/compliance", tags=["compliance"])

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")


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


class RemediationSuggestionUpdate(BaseModel):
    modified_text: str


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip().lower()


def _dict_to_text(obj, depth=0) -> str:
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
    candidates = [clause]
    if excerpt:
        candidates.append(excerpt)

    for c in candidates:
        if not c:
            continue
        idx = full_text.find(c)
        if idx != -1:
            return full_text[:idx] + replacement + full_text[idx + len(c):]

    norm_full = _normalize(full_text)
    for c in candidates:
        if not c:
            continue
        norm_c = _normalize(c)
        idx = norm_full.find(norm_c)
        if idx != -1:
            orig_start = 0
            norm_pos = 0
            for char in full_text:
                if norm_pos >= idx:
                    break
                if not char.isspace():
                    norm_pos += 1
                orig_start += 1
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

    if excerpt:
        matcher = SequenceMatcher(None, _normalize(excerpt), norm_full)
        match = matcher.find_longest_match(0, len(_normalize(excerpt)), 0, len(norm_full))
        if match.size > len(_normalize(excerpt)) * 0.6:
            orig_start = 0
            norm_pos = 0
            for char in full_text:
                if norm_pos >= match.b:
                    break
                if not char.isspace():
                    norm_pos += 1
                orig_start += 1
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
    "/violations/{violation_id}/actions/remediate",
    summary="Generate an AI remediation suggestion for a violation",
)
def generate_remediation(
    violation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission(Permission.REMEDIATION_CREATE)),
) -> RemediationGenerateResponse:
    if not GROQ_API_KEY:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="GROQ_API_KEY is not configured.")

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
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"LLM call failed: {exc}") from exc

    raw = response.choices[0].message.content.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[-1] if "\n" in raw else raw[3:]
        if raw.endswith("```"):
            raw = raw[:-3].strip()

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        logger.error("LLM returned invalid JSON for violation %d: %s", violation_id, raw[:300])
        raise HTTPException(status_code=502, detail=f"LLM returned invalid JSON: {raw[:300]}")

    original_clause = data.get("original_clause", violation.excerpt or "")
    suggested_clause = data.get("suggested_clause", "")
    section_reference = data.get("section_reference", "")
    reasoning = data.get("reasoning", "")

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
    db.flush()

    from app.notifications import notify_remediation_created
    from app.models import Scan, Document
    scan_obj = db.query(Scan).filter(Scan.id == violation.scan_id).first()
    if scan_obj:
        doc_obj = db.query(Document).filter(Document.id == scan_obj.document_id).first()
        if doc_obj:
            notify_remediation_created(db, violation, doc_obj)

    return RemediationGenerateResponse(
        suggestion=_remediation_to_schema(suggestion),
        message="Remediation suggestion generated.",
    )


@router.post(
    "/remediations/{suggestion_id}/actions/accept",
    response_model=RemediationActionResponse,
    summary="Accept a remediation suggestion (mark as accepted)",
)
def accept_remediation(
    suggestion_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission(Permission.REMEDIATION_ACCEPT)),
):
    s = db.query(RemediationSuggestion).filter(RemediationSuggestion.id == suggestion_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Remediation suggestion not found")
    s.status = "accepted"
    s.resolved_at = datetime.now(timezone.utc)
    log_audit(db, current_user.id, "remediation_accept", details=f"Remediation {suggestion_id} accepted")
    return RemediationActionResponse(id=s.id, status=s.status, message="Remediation accepted.")


@router.post(
    "/remediations/{suggestion_id}/actions/reject",
    response_model=RemediationActionResponse,
    summary="Reject a remediation suggestion",
)
def reject_remediation(
    suggestion_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission(Permission.REMEDIATION_REJECT)),
):
    s = db.query(RemediationSuggestion).filter(RemediationSuggestion.id == suggestion_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Remediation suggestion not found")
    s.status = "rejected"
    s.resolved_at = datetime.now(timezone.utc)
    log_audit(db, current_user.id, "remediation_reject", details=f"Remediation {suggestion_id} rejected")
    return RemediationActionResponse(id=s.id, status=s.status, message="Remediation rejected.")


@router.patch(
    "/remediations/{suggestion_id}",
    response_model=RemediationActionResponse,
    summary="Update a remediation suggestion (edit text)",
)
def update_remediation(
    suggestion_id: int,
    body: RemediationSuggestionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission(Permission.REMEDIATION_UPDATE)),
):
    s = db.query(RemediationSuggestion).filter(RemediationSuggestion.id == suggestion_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Remediation suggestion not found")
    s.user_modified_text = body.modified_text
    s.status = "modified"
    s.resolved_at = datetime.now(timezone.utc)
    log_audit(db, current_user.id, "remediation_edit", details=f"Remediation {suggestion_id} edited")
    return RemediationActionResponse(id=s.id, status=s.status, message="Remediation updated.")


@router.post(
    "/remediations/{suggestion_id}/actions/apply",
    response_model=RemediationActionResponse,
    summary="Apply the remediation by creating a new document version with the fix",
)
def apply_remediation(
    suggestion_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission(Permission.REMEDIATION_APPLY)),
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
            detail="Could not find the violating clause in the document full_text, even with fuzzy matching. The text may have already been modified, or the LLM-generated clause differs too much from the original. Try editing the suggested clause to match the document text exactly.",
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
    log_audit(db, current_user.id, "remediation_apply", details=f"Remediation {suggestion_id} applied — new version {doc.version_number}")

    return RemediationActionResponse(
        id=s.id,
        status=s.status,
        version=doc.version_number,
        message=f"Applied Successfully\nDocument Version: v{doc.version_number}\nChanges:\n+ Added compliant clause for '{violation.rule_id}'",
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
    violation = (
        db.query(Violation)
        .join(Scan, Violation.scan_id == Scan.id)
        .join(Document, Scan.document_id == Document.id)
        .filter(Violation.id == violation_id, Document.organization_id == current_user.organization_id)
        .first()
    )
    if not violation:
        raise HTTPException(status_code=404, detail="Violation not found")

    suggestions = db.query(RemediationSuggestion).filter(
        RemediationSuggestion.violation_id == violation_id
    ).order_by(RemediationSuggestion.created_at.desc()).all()
    return [_remediation_to_schema(s) for s in suggestions]
