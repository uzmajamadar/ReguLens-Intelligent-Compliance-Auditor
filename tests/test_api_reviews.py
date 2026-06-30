import pytest
from fastapi import status
from fastapi.testclient import TestClient
from datetime import datetime

import main
from app.auth import get_current_user, hash_password, create_access_token
from app.database import get_db


@pytest.fixture
def org_and_users(test_db):
    """Create org + admin + reviewer users and return them."""
    from app.models import Organization, User

    org = Organization(name="Review Test Org")
    test_db.add(org)
    test_db.flush()

    admin = User(
        name="Admin",
        email="admin@reviewtest.com",
        password_hash=hash_password("admin123"),
        role="admin",
        organization_id=org.id,
    )
    test_db.add(admin)

    reviewer = User(
        name="Reviewer",
        email="reviewer@reviewtest.com",
        password_hash=hash_password("review123"),
        role="reviewer",
        organization_id=org.id,
    )
    test_db.add(reviewer)
    test_db.commit()

    return {"org": org, "admin": admin, "reviewer": reviewer}


@pytest.fixture
def admin_client(test_db, org_and_users):
    """TestClient authenticated as admin (via token, no dependency override)."""
    user = org_and_users["admin"]
    token = create_access_token({"sub": str(user.id), "role": user.role})

    def override_get_db():
        yield test_db

    saved = main.app.dependency_overrides.get(get_current_user)
    main.app.dependency_overrides[get_db] = override_get_db
    main.app.dependency_overrides.pop(get_current_user, None)
    client = TestClient(main.app)
    client.headers["Authorization"] = f"Bearer {token}"
    yield client
    main.app.dependency_overrides.pop(get_db, None)
    if saved is not None:
        main.app.dependency_overrides[get_current_user] = saved
    else:
        main.app.dependency_overrides.pop(get_current_user, None)


@pytest.fixture
def reviewer_client(test_db, org_and_users):
    """TestClient authenticated as reviewer (via token, no dependency override)."""
    user = org_and_users["reviewer"]
    token = create_access_token({"sub": str(user.id), "role": user.role})

    def override_get_db():
        yield test_db

    saved = main.app.dependency_overrides.get(get_current_user)
    main.app.dependency_overrides[get_db] = override_get_db
    main.app.dependency_overrides.pop(get_current_user, None)
    client = TestClient(main.app)
    client.headers["Authorization"] = f"Bearer {token}"
    yield client
    main.app.dependency_overrides.pop(get_db, None)
    if saved is not None:
        main.app.dependency_overrides[get_current_user] = saved
    else:
        main.app.dependency_overrides.pop(get_current_user, None)


@pytest.fixture
def document(test_db, org_and_users):
    """Create a sample document."""
    from app.models import Document
    doc = Document(
        filename="test-policy.pdf",
        original_filename="test-policy.pdf",
        file_size_bytes=2048,
        page_count=5,
        status="indexed",
        user_id=org_and_users["admin"].id,
        organization_id=org_and_users["org"].id,
    )
    test_db.add(doc)
    test_db.commit()
    test_db.refresh(doc)
    return doc


@pytest.fixture
def scan(test_db, document):
    """Create a sample scan with violations."""
    from app.models import Scan, Violation
    scan = Scan(
        document_id=document.id,
        framework="GDPR",
        status="completed",
        score=75,
        grade="B",
        violation_count=1,
    )
    test_db.add(scan)
    test_db.flush()

    violation = Violation(
        scan_id=scan.id,
        rule_id="gdpr_article_5",
        title="Lawful Processing",
        framework="GDPR",
        severity="high",
        status="open",
        description="Personal data processed without lawful basis",
        clause="Article 5(1)(a)",
    )
    test_db.add(violation)
    test_db.commit()
    test_db.refresh(scan)
    test_db.refresh(violation)
    return {"scan": scan, "violation": violation}


class TestSubmitForReview:
    def test_submit_violation(self, admin_client, scan):
        violation_id = scan["violation"].id
        resp = admin_client.post(
            f"/compliance/violations/{violation_id}/submit-review"
        )
        assert resp.status_code == status.HTTP_200_OK
        data = resp.json()
        assert "task_id" in data
        assert data["status"] == "pending_assignment"

    def test_submit_already_submitted(self, admin_client, scan):
        violation_id = scan["violation"].id
        resp = admin_client.post(
            f"/compliance/violations/{violation_id}/submit-review"
        )
        assert resp.status_code == status.HTTP_200_OK

        # Submitting again should fail
        resp = admin_client.post(
            f"/compliance/violations/{violation_id}/submit-review"
        )
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert "already exists" in resp.json()["detail"].lower()

    def test_submit_nonexistent_violation(self, admin_client):
        resp = admin_client.post("/compliance/violations/99999/submit-review")
        assert resp.status_code == status.HTTP_404_NOT_FOUND


class TestAssignReview:
    def test_assign_review(self, admin_client, scan, org_and_users):
        # Submit first
        violation_id = scan["violation"].id
        resp = admin_client.post(
            f"/compliance/violations/{violation_id}/submit-review"
        )
        task_id = resp.json()["task_id"]

        # Assign
        reviewer = org_and_users["reviewer"]
        resp = admin_client.put(
            f"/admin/review/{task_id}/assign",
            json={
                "assigned_to_id": reviewer.id,
                "note": "Please review this finding",
            },
        )
        assert resp.status_code == status.HTTP_200_OK
        assert resp.json()["assigned_to"] == reviewer.name

    def test_assign_to_nonexistent_user(self, admin_client, scan):
        violation_id = scan["violation"].id
        resp = admin_client.post(
            f"/compliance/violations/{violation_id}/submit-review"
        )
        task_id = resp.json()["task_id"]

        resp = admin_client.put(
            f"/admin/review/{task_id}/assign",
            json={"assigned_to_id": 99999},
        )
        assert resp.status_code == status.HTTP_404_NOT_FOUND


class TestReviewWorkflow:
    """Full review workflow: submit → assign → start → approve → resolve."""

    def _setup(self, admin_client, scan, org_and_users):
        violation_id = scan["violation"].id
        resp = admin_client.post(
            f"/compliance/violations/{violation_id}/submit-review"
        )
        task_id = resp.json()["task_id"]
        reviewer = org_and_users["reviewer"]
        admin_client.put(
            f"/admin/review/{task_id}/assign",
            json={"assigned_to_id": reviewer.id},
        )
        return task_id

    def test_full_approve_flow(self, admin_client, reviewer_client, scan, org_and_users):
        task_id = self._setup(admin_client, scan, org_and_users)

        # Start review
        resp = reviewer_client.post(
            f"/compliance/review/{task_id}/start-review"
        )
        assert resp.status_code == status.HTTP_200_OK
        assert resp.json()["status"] == "in_review"

        # Approve
        resp = reviewer_client.post(
            f"/compliance/review/{task_id}/approve"
        )
        assert resp.status_code == status.HTTP_200_OK
        assert resp.json()["status"] == "waiting_for_fix"

        # Resolve (admin only)
        resp = admin_client.post(
            f"/compliance/review/{task_id}/resolve"
        )
        assert resp.status_code == status.HTTP_200_OK
        assert resp.json()["status"] == "resolved"

    def test_reject_flow(self, admin_client, reviewer_client, scan, org_and_users):
        task_id = self._setup(admin_client, scan, org_and_users)

        # Start review
        reviewer_client.post(f"/compliance/review/{task_id}/start-review")

        # Reject
        resp = reviewer_client.post(
            f"/compliance/review/{task_id}/reject?notes=False positive"
        )
        assert resp.status_code == status.HTTP_200_OK
        assert resp.json()["status"] == "dismissed"

    def test_needs_fix_flow(self, admin_client, reviewer_client, scan, org_and_users):
        task_id = self._setup(admin_client, scan, org_and_users)

        # Start review
        reviewer_client.post(f"/compliance/review/{task_id}/start-review")

        # Needs fix
        resp = reviewer_client.post(
            f"/compliance/review/{task_id}/needs-fix?notes=Update clause reference"
        )
        assert resp.status_code == status.HTTP_200_OK
        assert resp.json()["status"] == "needs_fix"

    def test_list_tasks(self, admin_client, scan, org_and_users):
        self._setup(admin_client, scan, org_and_users)

        resp = admin_client.get(
            "/compliance/review?status_filter=assigned"
        )
        assert resp.status_code == status.HTTP_200_OK
        tasks = resp.json()
        assert len(tasks) > 0
        assert tasks[0]["status"] == "assigned"

    def test_review_stats(self, admin_client, scan, org_and_users):
        self._setup(admin_client, scan, org_and_users)

        resp = admin_client.get("/compliance/review/stats")
        assert resp.status_code == status.HTTP_200_OK
        data = resp.json()
        assert "pending_assignment" in data
        assert "total" in data

    def test_reviewer_cannot_resolve(self, reviewer_client, scan, org_and_users):
        """Resolve requires admin or compliance_manager role."""
        # Submit + assign as admin first
        violation_id = scan["violation"].id
        resp = reviewer_client.post(
            f"/compliance/violations/{violation_id}/submit-review"
        )
        task_id = resp.json()["task_id"]

        # Reviewer can't resolve even if task is in correct state
        # (task is still pending_assignment, resolve expects waiting_for_fix)
        resp = reviewer_client.post(
            f"/compliance/review/{task_id}/resolve"
        )
        assert resp.status_code == status.HTTP_403_FORBIDDEN
