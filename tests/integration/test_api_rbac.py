"""Integration tests for RBAC: permission enforcement across endpoints."""
import pytest


class TestOwnerPermissions:
    def test_owner_can_list_documents(self, owner_client):
        resp = owner_client.get("/documents/")
        assert resp.status_code == 200

    def test_owner_cannot_run_audit(self, owner_client):
        resp = owner_client.post("/compliance/audit", json={
            "document_id": 1, "framework": "GDPR",
        })
        assert resp.status_code == 403

    def test_owner_cannot_manage_users(self, owner_client):
        resp = owner_client.get("/admin/users")
        assert resp.status_code == 403

    def test_owner_cannot_create_workflow(self, owner_client):
        resp = owner_client.post("/workflows/", json={
            "name": "Test WF", "framework": "GDPR",
        })
        assert resp.status_code == 403


class TestReviewerPermissions:
    def test_reviewer_can_list_documents(self, reviewer_client):
        resp = reviewer_client.get("/documents/")
        assert resp.status_code == 200

    def test_reviewer_cannot_run_audit(self, reviewer_client):
        resp = reviewer_client.post("/compliance/audit", json={
            "document_id": 1, "framework": "GDPR",
        })
        assert resp.status_code == 403

    def test_reviewer_can_read_users(self, reviewer_client):
        resp = reviewer_client.get("/admin/users")
        assert resp.status_code == 200


class TestComplianceManagerPermissions:
    def test_cm_can_list_documents(self, manager_client):
        resp = manager_client.get("/documents/")
        assert resp.status_code == 200

    def test_cm_can_read_users(self, manager_client):
        resp = manager_client.get("/admin/users")
        assert resp.status_code == 200

    def test_cm_can_read_reviews(self, manager_client):
        resp = manager_client.get("/compliance/reviews")
        assert resp.status_code == 200


class TestAdminPermissions:
    def test_admin_can_manage_users(self, admin_client):
        resp = admin_client.get("/admin/users")
        assert resp.status_code == 200

    def test_admin_can_read_audit_logs(self, admin_client):
        resp = admin_client.get("/admin/audit-logs")
        assert resp.status_code == 200

    def test_admin_can_get_stats(self, admin_client):
        resp = admin_client.get("/admin/stats")
        assert resp.status_code == 200

    def test_admin_can_read_reviews(self, admin_client):
        resp = admin_client.get("/compliance/reviews")
        assert resp.status_code == 200
