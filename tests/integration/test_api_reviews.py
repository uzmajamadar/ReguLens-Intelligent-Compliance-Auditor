"""Integration tests for review queue API endpoints."""
import pytest
from datetime import datetime, timezone, timedelta

from app.models import ReviewTask


@pytest.fixture
def sample_review_task(test_db, sample_scan, org_and_users):
    scan = sample_scan["scan"]
    reviewer = org_and_users["reviewer"]
    task = ReviewTask(
        scan_id=scan.id, rule_id="gdpr_art5_lawfulness",
        rule_name="Lawful Processing Basis", framework="GDPR",
        document_id=scan.document_id,
        reason="low_confidence", status="assigned",
        assigned_to=reviewer.name, assigned_to_id=reviewer.id,
        assigned_by=org_and_users["admin"].name,
        due_date=datetime.now(timezone.utc) + timedelta(days=7),
    )
    test_db.add(task)
    test_db.commit()
    test_db.refresh(task)
    return task


class TestListReviews:
    def test_list_reviews_empty(self, admin_client):
        resp = admin_client.get("/compliance/reviews")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_list_reviews_with_task(self, admin_client, sample_review_task):
        resp = admin_client.get("/compliance/reviews")
        assert resp.status_code == 200
        reviews = resp.json()
        assert len(reviews) >= 1


class TestReviewStats:
    def test_review_stats(self, admin_client):
        resp = admin_client.get("/compliance/reviews/stats")
        assert resp.status_code == 200
        data = resp.json()
        assert "total" in data


class TestStartReview:
    def test_start_review(self, admin_client, sample_review_task):
        task = sample_review_task
        resp = admin_client.post(f"/compliance/reviews/{task.id}/actions/start")
        assert resp.status_code == 200
        assert resp.json()["status"] == "in_review"


class TestApproveReview:
    def test_approve_review(self, admin_client, sample_review_task):
        task = sample_review_task
        admin_client.post(f"/compliance/reviews/{task.id}/actions/start")
        resp = admin_client.post(f"/compliance/reviews/{task.id}/actions/approve")
        assert resp.status_code == 200
        assert resp.json()["status"] == "approved"


class TestRejectReview:
    def test_reject_review(self, admin_client, sample_review_task):
        task = sample_review_task
        admin_client.post(f"/compliance/reviews/{task.id}/actions/start")
        resp = admin_client.post(
            f"/compliance/reviews/{task.id}/actions/reject",
            json={"notes": "Needs more context"},
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "dismissed"


class TestNeedsFixReview:
    def test_needs_fix_review(self, admin_client, sample_review_task):
        task = sample_review_task
        admin_client.post(f"/compliance/reviews/{task.id}/actions/start")
        resp = admin_client.post(
            f"/compliance/reviews/{task.id}/actions/needs-fix",
            json={"notes": "Please fix this issue"},
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "changes_requested"


class TestReviewEvents:
    def test_get_review_events(self, admin_client, sample_review_task):
        task = sample_review_task
        admin_client.post(f"/compliance/reviews/{task.id}/actions/start")
        resp = admin_client.get(f"/compliance/reviews/{task.id}/events")
        assert resp.status_code == 200
        events = resp.json()
        assert isinstance(events, list)
        assert len(events) >= 1


class TestClaimReview:
    def test_claim_review(self, admin_client, test_db, sample_scan, org_and_users):
        scan = sample_scan["scan"]
        task = ReviewTask(
            scan_id=scan.id, rule_id="gdpr_test_claim",
            rule_name="Test Claim Rule", framework="GDPR",
            document_id=scan.document_id,
            reason="low_confidence", status="assigned",
            assigned_to=None, assigned_to_id=None,
            due_date=datetime.now(timezone.utc) + timedelta(days=7),
        )
        test_db.add(task)
        test_db.commit()
        test_db.refresh(task)
        resp = admin_client.post(f"/compliance/reviews/{task.id}/actions/claim")
        assert resp.status_code == 200
