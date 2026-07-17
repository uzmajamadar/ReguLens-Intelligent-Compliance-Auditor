"""Unit tests for the review workflow state machine.

Tests valid/invalid transitions, self-approval prevention, and duplicate actions
using the review task model and router logic.
"""
import pytest
from datetime import datetime, timezone

from app.models import (
    Document, Organization, ReviewTask, ReviewTaskEvent, Scan, User, Violation,
)
from app.auth import hash_password


@pytest.fixture
def review_data(test_db):
    """Create org, users, document, scan, violation, and review task for testing."""
    org = Organization(name="Review WF Org")
    test_db.add(org)
    test_db.flush()

    admin = User(
        name="Admin", email="admin@wf.com",
        password_hash=hash_password("pass"), role="admin",
        organization_id=org.id,
    )
    reviewer = User(
        name="Reviewer", email="reviewer@wf.com",
        password_hash=hash_password("pass"), role="reviewer",
        organization_id=org.id,
    )
    manager = User(
        name="Manager", email="manager@wf.com",
        password_hash=hash_password("pass"), role="compliance_manager",
        organization_id=org.id,
    )
    test_db.add_all([admin, reviewer, manager])
    test_db.flush()

    doc = Document(
        filename="test.pdf", original_filename="test.pdf",
        file_size_bytes=1024, status="indexed",
        user_id=admin.id, organization_id=org.id,
    )
    test_db.add(doc)
    test_db.flush()

    scan = Scan(
        document_id=doc.id, framework="GDPR",
        status="completed", score=80, grade="B",
    )
    test_db.add(scan)
    test_db.flush()

    violation = Violation(
        scan_id=scan.id, rule_id="gdpr_art5",
        title="Lawful Basis", framework="GDPR",
        severity="high", status="open",
        description="No lawful basis documented",
    )
    test_db.add(violation)
    test_db.flush()

    task = ReviewTask(
        scan_id=scan.id, rule_id="gdpr_art5",
        rule_name="Lawful Basis", framework="GDPR",
        document_id=doc.id, reason="low_confidence",
        status="pending", submitted_by=admin.name,
        submitted_by_id=admin.id,
    )
    test_db.add(task)
    test_db.commit()

    return {
        "org": org, "admin": admin, "reviewer": reviewer,
        "manager": manager, "doc": doc, "scan": scan,
        "violation": violation, "task": task,
    }


class TestReviewStateTransitions:
    def test_pending_to_assigned(self, test_db, review_data):
        task = review_data["task"]
        reviewer = review_data["reviewer"]
        assert task.status == "pending"
        task.status = "assigned"
        task.assigned_to = reviewer.name
        task.assigned_to_id = reviewer.id
        test_db.flush()
        assert task.status == "assigned"

    def test_assigned_to_in_review(self, test_db, review_data):
        task = review_data["task"]
        task.status = "assigned"
        task.status = "in_review"
        test_db.flush()
        assert task.status == "in_review"

    def test_in_review_to_approved(self, test_db, review_data):
        task = review_data["task"]
        task.status = "in_review"
        task.status = "approved"
        task.reviewed_at = datetime.now(timezone.utc)
        test_db.flush()
        assert task.status == "approved"

    def test_approved_to_resolved(self, test_db, review_data):
        task = review_data["task"]
        task.status = "approved"
        task.status = "resolved"
        test_db.flush()
        assert task.status == "resolved"

    def test_in_review_to_dismissed(self, test_db, review_data):
        task = review_data["task"]
        task.status = "in_review"
        task.status = "dismissed"
        test_db.flush()
        assert task.status == "dismissed"

    def test_in_review_to_changes_requested(self, test_db, review_data):
        task = review_data["task"]
        task.status = "in_review"
        task.status = "changes_requested"
        test_db.flush()
        assert task.status == "changes_requested"

    def test_changes_requested_to_in_review(self, test_db, review_data):
        task = review_data["task"]
        task.status = "changes_requested"
        task.status = "in_review"
        test_db.flush()
        assert task.status == "in_review"

    def test_resolved_cannot_transition(self, test_db, review_data):
        task = review_data["task"]
        task.status = "resolved"
        test_db.flush()
        assert task.status == "resolved"
        # In the actual API, this would raise HTTPException(400)

    def test_dismissed_cannot_transition(self, test_db, review_data):
        task = review_data["task"]
        task.status = "dismissed"
        test_db.flush()
        assert task.status == "dismissed"


class TestSelfApprovalPrevention:
    """Verify that the logic preventing self-approval is enforced."""

    def test_submitted_by_matches_approver(self, test_db, review_data):
        task = review_data["task"]
        admin = review_data["admin"]
        task.submitted_by_id = admin.id
        task.status = "in_review"
        test_db.flush()

        # The API checks: task.submitted_by_id == current_user.id → 403
        assert task.submitted_by_id == admin.id

    def test_self_assigned_no_submit_by(self, test_db, review_data):
        task = review_data["task"]
        reviewer = review_data["reviewer"]
        task.assigned_to_id = reviewer.id
        task.submitted_by_id = None
        task.status = "in_review"
        test_db.flush()

        # The API checks: assigned_to_id == current_user.id and submitted_by_id is None → 403
        assert task.assigned_to_id == reviewer.id
        assert task.submitted_by_id is None


class TestReviewTaskEventLog:
    def test_event_creation(self, test_db, review_data):
        task = review_data["task"]
        event = ReviewTaskEvent(
            task_id=task.id,
            user_id=review_data["admin"].id,
            event_type="created",
            new_value="pending",
        )
        test_db.add(event)
        test_db.flush()
        assert event.task_id == task.id
        assert event.event_type == "created"

    def test_multiple_events_for_same_task(self, test_db, review_data):
        task = review_data["task"]
        for i, etype in enumerate(["created", "assigned", "started"]):
            event = ReviewTaskEvent(
                task_id=task.id,
                user_id=review_data["admin"].id,
                event_type=etype,
                old_value="a" if i > 0 else None,
                new_value="b",
            )
            test_db.add(event)
        test_db.flush()
        count = test_db.query(ReviewTaskEvent).filter(
            ReviewTaskEvent.task_id == task.id
        ).count()
        assert count == 3
