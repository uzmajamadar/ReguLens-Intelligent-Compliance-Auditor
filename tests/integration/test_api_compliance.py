"""Integration tests for compliance API endpoints."""
import pytest


class TestComplianceRules:
    def test_list_rules(self, admin_client):
        resp = admin_client.get("/compliance/rules")
        assert resp.status_code == 200
        rules = resp.json()
        assert isinstance(rules, list)

    def test_list_rules_unauthenticated(self, unauth_client):
        resp = unauth_client.get("/compliance/rules")
        assert resp.status_code == 401


class TestFeedback:
    def test_submit_feedback(self, admin_client, sample_scan):
        violations = sample_scan["violations"]
        resp = admin_client.post("/compliance/feedback", json={
            "collection_name": "GDPR",
            "rule_id": violations[0].rule_id,
            "status": "confirmed",
            "comment": "This violation is valid",
        })
        assert resp.status_code == 200

    def test_get_feedback(self, admin_client):
        resp = admin_client.get("/compliance/feedback/GDPR")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)


class TestViolations:
    def test_list_violations_empty(self, admin_client):
        resp = admin_client.get("/compliance/violations")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_list_violations_with_filter(self, admin_client, sample_scan):
        resp = admin_client.get("/compliance/violations?framework=GDPR")
        assert resp.status_code == 200
        violations = resp.json()
        assert len(violations) >= 1
        assert all(v["framework"] == "GDPR" for v in violations)

    def test_list_violations_by_severity(self, admin_client, sample_scan):
        resp = admin_client.get("/compliance/violations?severity=high")
        assert resp.status_code == 200

    def test_patch_violation(self, admin_client, sample_scan):
        violation = sample_scan["violations"][0]
        resp = admin_client.patch(
            f"/compliance/violations/{violation.id}",
            json={"notes": "Updated note"},
        )
        assert resp.status_code == 200


class TestComplianceAudit:
    def test_audit_requires_permission(self, unauth_client):
        resp = unauth_client.post("/compliance/audit", json={
            "document_id": 1, "framework": "GDPR",
        })
        assert resp.status_code == 401


class TestFrameworksEndpoint:
    def test_list_frameworks(self, admin_client):
        resp = admin_client.get("/compliance/frameworks")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)
