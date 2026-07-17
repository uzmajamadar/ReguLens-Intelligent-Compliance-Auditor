"""Unit tests for the compliance engine — scoring, grading, severity, confidence.

Tests the pure functions and data structures in app/compliance_engine.py
without requiring any external services (Groq, Qdrant, etc.).
"""
import pytest

from app.compliance_engine import (
    SEVERITY_DEDUCTIONS,
    GRADE_THRESHOLDS,
    RuleResult,
    SourceChunk,
    AuditReport,
    FrameworkConflict,
    _build_audit_report,
    _extract_page_numbers,
    _detect_conflicts,
    FRAMEWORK_CONFLICT_MAP,
)


class TestSeverityDeductions:
    def test_all_severities_present(self):
        expected = {"none", "low", "medium", "high", "critical"}
        assert set(SEVERITY_DEDUCTIONS.keys()) == expected

    def test_none_has_zero_deduction(self):
        assert SEVERITY_DEDUCTIONS["none"] == 0

    def test_deductions_increase_with_severity(self):
        assert SEVERITY_DEDUCTIONS["low"] < SEVERITY_DEDUCTIONS["medium"]
        assert SEVERITY_DEDUCTIONS["medium"] < SEVERITY_DEDUCTIONS["high"]
        assert SEVERITY_DEDUCTIONS["high"] < SEVERITY_DEDUCTIONS["critical"]

    def test_specific_values(self):
        assert SEVERITY_DEDUCTIONS["low"] == 3
        assert SEVERITY_DEDUCTIONS["medium"] == 7
        assert SEVERITY_DEDUCTIONS["high"] == 12
        assert SEVERITY_DEDUCTIONS["critical"] == 20


class TestGradeThresholds:
    def test_grade_a_at_90(self):
        grade = next(g for t, g in GRADE_THRESHOLDS if 90 >= t)
        assert grade == "A"

    def test_grade_b_at_75(self):
        grade = next(g for t, g in GRADE_THRESHOLDS if 75 >= t)
        assert grade == "B"

    def test_grade_c_at_60(self):
        grade = next(g for t, g in GRADE_THRESHOLDS if 60 >= t)
        assert grade == "C"

    def test_grade_d_at_45(self):
        grade = next(g for t, g in GRADE_THRESHOLDS if 45 >= t)
        assert grade == "D"

    def test_grade_f_at_0(self):
        grade = next(g for t, g in GRADE_THRESHOLDS if 0 >= t)
        assert grade == "F"

    def test_grade_85_is_b(self):
        grade = next(g for t, g in GRADE_THRESHOLDS if 85 >= t)
        assert grade == "B"

    def test_grade_99_is_a(self):
        grade = next(g for t, g in GRADE_THRESHOLDS if 99 >= t)
        assert grade == "A"

    def test_grade_10_is_f(self):
        grade = next(g for t, g in GRADE_THRESHOLDS if 10 >= t)
        assert grade == "F"


class TestExtractPageNumbers:
    def test_single_page(self):
        text = "--- Page 3 ---\nSome content here."
        assert _extract_page_numbers(text) == [3]

    def test_multiple_pages(self):
        text = "--- Page 1 ---\nContent\n--- Page 5 ---\nMore content"
        assert _extract_page_numbers(text) == [1, 5]

    def test_no_pages(self):
        text = "Just plain text without markers."
        assert _extract_page_numbers(text) == []

    def test_large_page_numbers(self):
        text = "--- Page 100 ---\nContent"
        assert _extract_page_numbers(text) == [100]


class TestBuildAuditReport:
    def _make_result(self, rule_id, violation=False, severity="none", points=0, confidence=85):
        return RuleResult(
            rule_id=rule_id,
            rule_name=f"Rule {rule_id}",
            regulation="GDPR",
            article="Art. 5",
            violation=violation,
            severity=severity,
            explanation="Test explanation",
            chunks_checked=5,
            points_deducted=points,
            confidence=confidence,
        )

    def test_perfect_score(self):
        results = [
            self._make_result("r1", violation=False, points=0),
            self._make_result("r2", violation=False, points=0),
        ]
        report = _build_audit_report("test_collection", results)
        assert report.score == 100.0
        assert report.grade == "A"
        assert report.violations_found == 0
        assert report.rules_passed == 2

    def test_score_with_violations(self):
        results = [
            self._make_result("r1", violation=True, severity="high", points=12),
            self._make_result("r2", violation=False, points=0),
        ]
        report = _build_audit_report("test_collection", results)
        assert report.score == 88.0
        assert report.violations_found == 1
        assert report.rules_passed == 1

    def test_score_clamped_to_zero(self):
        results = [
            self._make_result("r1", violation=True, severity="critical", points=20),
            self._make_result("r2", violation=True, severity="critical", points=20),
            self._make_result("r3", violation=True, severity="critical", points=20),
            self._make_result("r4", violation=True, severity="critical", points=20),
            self._make_result("r5", violation=True, severity="critical", points=20),
            self._make_result("r6", violation=True, severity="critical", points=20),
        ]
        report = _build_audit_report("test_collection", results)
        assert report.score == 0.0

    def test_severity_breakdown(self):
        results = [
            self._make_result("r1", violation=True, severity="high", points=12),
            self._make_result("r2", violation=True, severity="low", points=3),
            self._make_result("r3", violation=False, severity="none", points=0),
        ]
        report = _build_audit_report("test_collection", results)
        assert report.severity_breakdown["high"] == 1
        assert report.severity_breakdown["low"] == 1
        assert report.severity_breakdown["none"] == 1
        assert report.severity_breakdown["critical"] == 0

    def test_summary_contains_counts(self):
        results = [
            self._make_result("r1", violation=True, severity="high", points=12),
            self._make_result("r2", violation=False, points=0),
        ]
        report = _build_audit_report("test_collection", results)
        assert "1/2 rules passed" in report.summary
        assert "88/100" in report.summary
        assert "Grade B" in report.summary

    def test_empty_results(self):
        report = _build_audit_report("test_collection", [])
        assert report.score == 100.0
        assert report.grade == "A"
        assert report.total_rules == 0

    def test_all_violations(self):
        results = [
            self._make_result("r1", violation=True, severity="medium", points=7),
            self._make_result("r2", violation=True, severity="low", points=3),
        ]
        report = _build_audit_report("test_collection", results)
        assert report.score == 90.0
        assert report.rules_passed == 0
        assert report.violations_found == 2


class TestDetectConflicts:
    def _make_result(self, rule_id, regulation, violation=False, severity="none"):
        return RuleResult(
            rule_id=rule_id,
            rule_name=f"Rule {rule_id}",
            regulation=regulation,
            article="Art. X",
            violation=violation,
            severity=severity,
            explanation="",
            chunks_checked=0,
            points_deducted=0,
        )

    def test_no_conflicts_with_no_violations(self):
        results = [
            self._make_result("gdpr_art17_erasure", "GDPR", violation=False),
            self._make_result("pci_req3_data_protection", "PCI-DSS", violation=False),
        ]
        conflicts = _detect_conflicts(results)
        assert len(conflicts) == 0

    def test_conflict_detected_with_violations(self):
        results = [
            self._make_result("gdpr_art17_erasure", "GDPR", violation=True, severity="high"),
            self._make_result("pci_req3_data_protection", "PCI-DSS", violation=True, severity="medium"),
        ]
        conflicts = _detect_conflicts(results)
        assert len(conflicts) > 0
        assert any(c.topic == "Data Retention & Deletion" for c in conflicts)

    def test_conflict_map_structure(self):
        assert len(FRAMEWORK_CONFLICT_MAP) > 0
        for entry in FRAMEWORK_CONFLICT_MAP:
            assert "topic" in entry
            assert "conflicting_rule_ids" in entry
            assert "description" in entry
            assert "recommendation" in entry
            assert len(entry["conflicting_rule_ids"]) >= 2

    def test_no_conflict_with_single_framework(self):
        results = [
            self._make_result("gdpr_art17_erasure", "GDPR", violation=True),
        ]
        conflicts = _detect_conflicts(results)
        assert len(conflicts) == 0
