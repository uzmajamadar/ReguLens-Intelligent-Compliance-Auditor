"""Integration tests for document API endpoints."""
import pytest


class TestListDocuments:
    def test_list_documents_empty(self, admin_client):
        resp = admin_client.get("/documents/")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_list_documents_unauthenticated(self, unauth_client):
        resp = unauth_client.get("/documents/")
        assert resp.status_code == 401


class TestGetDocument:
    def test_get_nonexistent_document(self, admin_client):
        resp = admin_client.get("/documents/99999")
        assert resp.status_code in (404, 403)

    def test_get_document_as_owner(self, admin_client, sample_document):
        resp = admin_client.get(f"/documents/{sample_document.id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["document_id"] == sample_document.id


class TestUpdateFrameworks:
    def test_update_frameworks(self, admin_client, sample_document):
        resp = admin_client.put(
            f"/documents/{sample_document.id}/frameworks",
            json={"frameworks": ["GDPR", "HIPAA"]},
        )
        assert resp.status_code == 200
        assert "GDPR" in resp.json()["frameworks"]

    def test_update_frameworks_unauthorized(self, unauth_client, sample_document):
        resp = unauth_client.put(
            f"/documents/{sample_document.id}/frameworks",
            json={"frameworks": ["GDPR"]},
        )
        assert resp.status_code == 401


class TestDeleteDocument:
    def test_delete_document(self, admin_client, sample_document):
        doc_id = sample_document.id
        resp = admin_client.delete(f"/documents/{doc_id}")
        assert resp.status_code == 200
        resp = admin_client.get(f"/documents/{doc_id}")
        assert resp.status_code in (404, 403)


class TestDocumentScans:
    def test_list_scans_empty(self, admin_client, sample_document):
        resp = admin_client.get(f"/documents/{sample_document.id}/scans")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_list_scans_with_scan(self, admin_client, sample_scan):
        scan = sample_scan["scan"]
        resp = admin_client.get(f"/documents/{scan.document_id}/scans")
        assert resp.status_code == 200
        scans = resp.json()
        assert len(scans) >= 1

    def test_get_scan_detail(self, admin_client, sample_scan):
        scan = sample_scan["scan"]
        resp = admin_client.get(
            f"/documents/{scan.document_id}/scans/{scan.id}"
        )
        assert resp.status_code == 200
        assert resp.json()["framework"] == "GDPR"


class TestDocumentVersions:
    def test_list_versions(self, admin_client, sample_document):
        resp = admin_client.get(f"/documents/{sample_document.id}/versions")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)
