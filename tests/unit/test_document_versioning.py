"""Unit tests for document versioning logic.

Tests version group detection, version increment, eval status determination,
and review reason extraction from app/routers/upload.py and app/routers/versions.py.
"""
import pytest


class TestGetOrCreateGroupId:
    def test_new_file_returns_version_1(self, test_db):
        from app.routers.upload import _get_or_create_group_id
        from app.models import Organization

        org = Organization(name="Version Test Org")
        test_db.add(org)
        test_db.flush()

        group_id, version = _get_or_create_group_id(test_db, "new-doc.pdf", org.id)
        assert version == 1
        assert isinstance(group_id, str)
        assert len(group_id) == 16

    def test_existing_file_returns_next_version(self, test_db, org_and_users):
        from app.routers.upload import _get_or_create_group_id
        from app.models import Document

        doc = Document(
            filename="policy.pdf",
            original_filename="policy.pdf",
            file_size_bytes=1024,
            status="indexed",
            document_group_id="abc123",
            version_number=2,
            user_id=org_and_users["admin"].id,
            organization_id=org_and_users["org"].id,
        )
        test_db.add(doc)
        test_db.commit()

        group_id, version = _get_or_create_group_id(
            test_db, "policy.pdf", org_and_users["org"].id
        )
        assert group_id == "abc123"
        assert version == 3

    def test_different_org_returns_new_group(self, test_db, org_and_users, second_org_and_users):
        from app.routers.upload import _get_or_create_group_id
        from app.models import Document

        doc = Document(
            filename="policy.pdf",
            original_filename="policy.pdf",
            file_size_bytes=1024,
            status="indexed",
            document_group_id="existing_group",
            version_number=1,
            organization_id=org_and_users["org"].id,
        )
        test_db.add(doc)
        test_db.commit()

        group_id, version = _get_or_create_group_id(
            test_db, "policy.pdf", second_org_and_users["org"].id
        )
        assert group_id != "existing_group"
        assert version == 1


class TestDetermineEvalStatus:
    def _make_result(self, error=None, confidence=None, violation=False):
        from app.compliance_engine import RuleResult
        return RuleResult(
            rule_id="test_rule",
            rule_name="Test Rule",
            regulation="GDPR",
            article="Art. 5",
            violation=violation,
            severity="none" if not violation else "medium",
            explanation="",
            chunks_checked=0,
            points_deducted=0,
            confidence=confidence,
            error=error,
        )

    def test_error_status(self):
        from app.routers.versions import _determine_eval_status
        result = self._make_result(error="Connection failed")
        assert _determine_eval_status(result) == "error"

    def test_warning_status_low_confidence(self):
        from app.routers.versions import _determine_eval_status
        result = self._make_result(confidence=45, violation=True)
        assert _determine_eval_status(result) == "warning"

    def test_warning_status_boundary(self):
        from app.routers.versions import _determine_eval_status
        result = self._make_result(confidence=59, violation=True)
        assert _determine_eval_status(result) == "warning"

    def test_passed_status(self):
        from app.routers.versions import _determine_eval_status
        result = self._make_result(violation=False, confidence=90)
        assert _determine_eval_status(result) == "passed"

    def test_failed_status_high_confidence_violation(self):
        from app.routers.versions import _determine_eval_status
        result = self._make_result(violation=True, confidence=90)
        assert _determine_eval_status(result) == "failed"


class TestReviewReasonFromError:
    def test_timeout(self):
        from app.routers.versions import _review_reason_from_error
        assert _review_reason_from_error("Request timed out after 30s") == "timeout"

    def test_rate_limit(self):
        from app.routers.versions import _review_reason_from_error
        assert _review_reason_from_error("Rate limit exceeded, try again") == "rate_limited"

    def test_parse_error(self):
        from app.routers.versions import _review_reason_from_error
        assert _review_reason_from_error("Could not parse unparseable response") == "parse_error"

    def test_generic_error(self):
        from app.routers.versions import _review_reason_from_error
        assert _review_reason_from_error("Some random error") == "evaluation_error"


class TestRecalculateScanScore:
    def test_score_recalculated_from_violations(self, test_db, sample_document):
        from app.routers.versions import _recalculate_scan_score
        from app.models import Scan, Violation

        scan = Scan(
            document_id=sample_document.id,
            framework="GDPR",
            status="completed",
            score=100,
            grade="A",
            violation_count=0,
        )
        test_db.add(scan)
        test_db.flush()

        v = Violation(
            scan_id=scan.id,
            rule_id="test_rule",
            title="Test",
            framework="GDPR",
            severity="high",
            status="open",
            description="Test",
        )
        test_db.add(v)
        test_db.flush()

        new_score = _recalculate_scan_score(scan, test_db)
        assert new_score == 88  # 100 - 12 (high severity deduction)

    def test_no_change_when_not_completed(self, test_db, sample_document):
        from app.routers.versions import _recalculate_scan_score
        from app.models import Scan

        scan = Scan(
            document_id=sample_document.id,
            framework="GDPR",
            status="running",
            score=50,
        )
        test_db.add(scan)
        test_db.flush()

        result = _recalculate_scan_score(scan, test_db)
        assert result == 50
