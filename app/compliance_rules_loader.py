"""
app/compliance_rules_loader.py — Aggregates compliance rules from all packs.

Provides a unified interface to access rules across all supported frameworks.
The engine imports this module instead of individual rule packs.

Exports:
  - ComplianceRule  — canonical dataclass (compatible with all pack definitions)
  - RULES           — combined list of every rule from every pack
  - RULES_BY_ID     — lookup dict by rule id
  - get_available_frameworks()         — list of all framework names
  - get_rules_by_framework(framework)  — filter rules by regulation name
  - get_rules_by_frameworks(frameworks) — filter for a list of frameworks
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence


@dataclass(frozen=True)
class ComplianceRule:
    id: str
    name: str
    regulation: str
    article: str
    search_query: str
    check_question: str
    max_severity: str
    detailed_checks: str = ""


# ---------------------------------------------------------------------------
# Import every rule pack
# Each pack exports: RULES: list[ComplianceRule], RULES_BY_ID: dict[str, ...]
# ---------------------------------------------------------------------------

from app import compliance_rules as _gdpr_hr
from app import compliance_rules_hipaa as _hipaa
from app import compliance_rules_soc2 as _soc2
from app import compliance_rules_pci_dss as _pci
from app import compliance_rules_iso27001 as _iso27001

# ---------------------------------------------------------------------------
# Aggregate
# ---------------------------------------------------------------------------

RULES: list[ComplianceRule] = [
    *_gdpr_hr.RULES,
    *_hipaa.RULES,
    *_soc2.RULES,
    *_pci.RULES,
    *_iso27001.RULES,
]  # type: ignore[assignment]

RULES_BY_ID: dict[str, ComplianceRule] = {}
for r in RULES:
    RULES_BY_ID[r.id] = r


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_available_frameworks() -> list[dict[str, str | int]]:
    """Return a summary of every framework and its rule count."""
    counts: dict[str, int] = {}
    for r in RULES:
        counts[r.regulation] = counts.get(r.regulation, 0) + 1
    return [
        {"name": name, "rule_count": count}
        for name, count in sorted(counts.items())
    ]


def get_rules_by_framework(framework: str | None = None) -> list[ComplianceRule]:
    """Return all rules for a given framework, or all rules if *framework* is None."""
    if framework is None:
        return list(RULES)
    return [r for r in RULES if r.regulation == framework]


def get_rules_by_frameworks(frameworks: Sequence[str]) -> list[ComplianceRule]:
    """Return all rules matching any of the given frameworks."""
    fw_set = set(frameworks)
    return [r for r in RULES if r.regulation in fw_set]
