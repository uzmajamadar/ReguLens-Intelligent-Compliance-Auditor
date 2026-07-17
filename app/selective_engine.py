"""
selective_engine.py — Selective revalidation engine for incremental document scans.

Instead of re-evaluating every rule on every rescan, this module:
  1. Uses chunk diffs to identify changed content
  2. Maps changed chunks to affected rules via rule_chunk_mapping
  3. Only re-evaluates affected rules via LLM
  4. Carries forward previous results for unaffected rules
  5. Rebuilds the full audit report from a mix of new + carried-forward results
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.compliance_engine import (
    AuditReport,
    CrossFrameworkReport,
    RuleResult,
    SEVERITY_DEDUCTIONS,
    GRADE_THRESHOLDS,
    _build_audit_report,
    _check_framework_batch,
)
from app.compliance_rules_loader import ComplianceRule, get_rules_by_frameworks
from app.embeddings import embed_query
from app.models import (
    Document,
    DocumentChunk,
    ChunkDiff,
    RuleChunkMapping,
    RuleEvaluation,
    Scan,
    Violation,
)
from app.vector_store import similarity_search

logger = logging.getLogger(__name__)


@dataclass
class SelectiveAuditPlan:
    """Describes the plan for a selective revalidation."""
    total_rules: int
    affected_rules: list[str]           # rule_ids that need re-evaluation
    carried_forward_rules: list[str]    # rule_ids carried from previous scan
    changed_chunk_count: int
    total_chunks: int
    changed_percentage: float
    should_full_rescan: bool
    reason: str = ""


@dataclass
class SelectiveAuditResult:
    """Result of a selective revalidation — mix of new + carried-forward results."""
    new_results: list[RuleResult]           # freshly evaluated by LLM
    carried_results: list[RuleResult]       # from previous scan
    all_results: list[RuleResult]           # combined
    rules_evaluated: int
    rules_skipped: int
    affected_frameworks: list[str]


def determine_affected_rules(
    db: Session,
    document_id: int,
    changed_chunk_hashes: set[str],
    all_frameworks: list[str],
) -> SelectiveAuditPlan:
    """
    Determine which rules are affected by changed chunks.

    Uses the rule_chunk_mapping table to find rules that previously
    referenced any of the changed chunks.
    """
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        return SelectiveAuditPlan(
            total_rules=0, affected_rules=[], carried_forward_rules=[],
            changed_chunk_count=0, total_chunks=0, changed_percentage=0,
            should_full_rescan=True, reason="Document not found",
        )

    # Get all rules for the requested frameworks
    all_rules = list(get_rules_by_frameworks(all_frameworks))
    all_rule_ids = {r.id for r in all_rules}

    # Find rules that referenced changed chunks in the previous scan
    affected_rule_ids: set[str] = set()

    if changed_chunk_hashes:
        # Query rule_chunk_mapping for rules that mapped to changed chunks
        mappings = (
            db.query(RuleChunkMapping)
            .filter(
                RuleChunkMapping.document_id == doc.id,
                RuleChunkMapping.chunk_hash.in_(changed_chunk_hashes),
            )
            .all()
        )
        for mapping in mappings:
            if mapping.rule_id in all_rule_ids:
                affected_rule_ids.add(mapping.rule_id)

    # Get total chunk count for statistics
    total_chunks = (
        db.query(DocumentChunk)
        .filter(
            DocumentChunk.document_id == doc.id,
            DocumentChunk.version_number == doc.version_number,
        )
        .count()
    )

    # If no mappings exist yet (first scan with this system), treat all as affected
    mapping_count = (
        db.query(RuleChunkMapping)
        .filter(RuleChunkMapping.document_id == doc.id)
        .count()
    )
    if mapping_count == 0:
        logger.info("No rule_chunk_mapping data for doc %d — treating all rules as affected", document_id)
        affected_rule_ids = all_rule_ids

    carried_forward_ids = all_rule_ids - affected_rule_ids

    changed_pct = len(changed_chunk_hashes) / max(total_chunks, 1)

    # Decision: should we do a full rescan?
    should_full = False
    reason = ""
    if total_chunks == 0:
        should_full = True
        reason = "No chunks stored — first scan with new system"
    elif changed_pct > 0.30:
        should_full = True
        reason = f"Changed {changed_pct*100:.1f}% of chunks (threshold: 30%)"
    elif len(affected_rule_ids) / max(len(all_rule_ids), 1) > 0.50:
        should_full = True
        reason = f"Affected {len(affected_rule_ids)}/{len(all_rule_ids)} rules (threshold: 50%)"

    plan = SelectiveAuditPlan(
        total_rules=len(all_rule_ids),
        affected_rules=sorted(affected_rule_ids),
        carried_forward_rules=sorted(carried_forward_ids),
        changed_chunk_count=len(changed_chunk_hashes),
        total_chunks=total_chunks,
        changed_percentage=changed_pct,
        should_full_rescan=should_full,
        reason=reason,
    )

    logger.info(
        "Selective audit plan for doc %d: %d affected / %d carried-forward rules, "
        "changed_pct=%.1f%%, full_rescan=%s (%s)",
        document_id, len(plan.affected_rules), len(plan.carried_forward_rules),
        changed_pct * 100, should_full, reason or "within thresholds",
    )

    return plan


def _load_carried_forward_results(
    db: Session,
    document_id: int,
    carried_rule_ids: list[str],
    scan_framework: str | None = None,
) -> list[RuleResult]:
    """Load previous scan results for rules that don't need re-evaluation."""
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc or not doc.document_group_id:
        return []

    prev_version = (doc.version_number or 1) - 1
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

    # Find the most recent completed scan for the previous version
    prev_scan = (
        db.query(Scan)
        .filter(
            Scan.document_id == prev_doc.id,
            Scan.status == "completed",
        )
        .order_by(Scan.created_at.desc())
        .first()
    )
    if not prev_scan:
        return []

    # Load rule evaluations for the carried-forward rules
    evaluations = (
        db.query(RuleEvaluation)
        .filter(
            RuleEvaluation.scan_id == prev_scan.id,
            RuleEvaluation.rule_id.in_(carried_rule_ids),
        )
        .all()
    )

    results: list[RuleResult] = []
    for ev in evaluations:
        violation = ev.status in ("failed", "warning")
        severity = ev.severity if violation else "none"
        results.append(RuleResult(
            rule_id=ev.rule_id,
            rule_name=ev.rule_name,
            regulation=ev.framework,
            article=ev.article or "",
            violation=violation,
            severity=severity or "none",
            explanation=ev.explanation or "",
            analysis=ev.analysis or "",
            remediation=ev.remediation or "",
            confidence=ev.confidence,
            chunks_checked=ev.chunks_checked or 0,
            points_deducted=ev.points_deducted or 0,
            error=ev.error,
        ))

    return results


def run_selective_audit(
    db: Session,
    document_id: int,
    plan: SelectiveAuditPlan,
    collection_name: str,
    groq_api_key: str,
    frameworks: list[str],
    top_k_per_rule: int = 3,
) -> SelectiveAuditResult:
    """
    Run a selective revalidation: only evaluate affected rules via LLM,
    carry forward previous results for unaffected rules.
    """
    from groq import Groq

    # Load affected rules
    all_framework_rules = {r.regulation: [] for r in get_rules_by_frameworks(frameworks)}
    for rule in get_rules_by_frameworks(frameworks):
        all_framework_rules.setdefault(rule.regulation, []).append(rule)

    affected_rules = [
        r for r in get_rules_by_frameworks(frameworks)
        if r.id in plan.affected_rules
    ]

    # Group affected rules by framework for batch evaluation
    affected_by_fw: dict[str, list[ComplianceRule]] = {}
    for rule in affected_rules:
        affected_by_fw.setdefault(rule.regulation, []).append(rule)

    # Run LLM evaluation only for affected frameworks
    new_results: list[RuleResult] = []
    affected_frameworks: list[str] = []

    if affected_by_fw:
        groq_client = Groq(api_key=groq_api_key)

        for fw, fw_rules in affected_by_fw.items():
            affected_frameworks.append(fw)
            try:
                fw_results = _check_framework_batch(
                    fw_rules, fw, collection_name,
                    top_k_per_rule, groq_client, document_id,
                )
                new_results.extend(fw_results)
            except Exception as exc:
                logger.exception("Selective audit failed for framework %s", fw)
                # Fallback: carry forward all rules for this framework
                for rule in fw_rules:
                    new_results.append(RuleResult(
                        rule_id=rule.id, rule_name=rule.name,
                        regulation=rule.regulation, article=rule.article,
                        violation=False, severity="none",
                        explanation=f"Selective revalidation failed for this framework: {exc}",
                        chunks_checked=0, points_deducted=0, error=str(exc),
                    ))

    # Load carried-forward results
    carried_results = _load_carried_forward_results(
        db, document_id, plan.carried_forward_rules,
    )

    # Combine results
    all_results = new_results + carried_results
    all_results.sort(key=lambda r: (r.regulation, r.rule_name))

    result = SelectiveAuditResult(
        new_results=new_results,
        carried_results=carried_results,
        all_results=all_results,
        rules_evaluated=len(new_results),
        rules_skipped=len(carried_results),
        affected_frameworks=affected_frameworks,
    )

    logger.info(
        "Selective audit complete for doc %d: %d rules evaluated, %d carried forward, "
        "total results=%d",
        document_id, result.rules_evaluated, result.rules_skipped,
        len(result.all_results),
    )

    return result


def store_rule_chunk_mappings(
    db: Session,
    document_id: int,
    scan_id: int,
    results: list[RuleResult],
):
    """
    Store the rule-to-chunk mapping after a scan.

    For each rule result, we record which chunks were relevant.
    This mapping is used in future scans to determine which rules
    are affected by changed chunks.
    """
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        return

    version = doc.version_number or 1

    # Get chunks for this version
    chunks = (
        db.query(DocumentChunk)
        .filter(
            DocumentChunk.document_id == document_id,
            DocumentChunk.version_number == version,
        )
        .all()
    )
    chunk_by_hash = {c.content_hash: c for c in chunks}

    stored = 0
    for result in results:
        # For each source chunk referenced in the result, store the mapping
        if result.source_chunks:
            for sc in result.source_chunks:
                # Try to find the chunk by text match
                for chunk in chunks:
                    if chunk.text[:100] in sc.text_snippet or sc.text_snippet[:100] in chunk.text:
                        db.add(RuleChunkMapping(
                            rule_id=result.rule_id,
                            framework=result.regulation,
                            chunk_id=chunk.id,
                            chunk_hash=chunk.content_hash,
                            relevance_score=1.0,
                            scan_id=scan_id,
                            document_id=document_id,
                        ))
                        stored += 1
                        break
        else:
            # If no source chunks, we can't create a mapping
            # This happens for carried-forward results
            pass

    db.flush()
    logger.info(
        "Stored %d rule-chunk mappings for doc %d, scan %d",
        stored, document_id, scan_id,
    )
