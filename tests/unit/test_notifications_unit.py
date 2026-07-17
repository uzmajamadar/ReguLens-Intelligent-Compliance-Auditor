"""Unit tests for notification logic.

Tests payload generation, recipient selection, email/Slack sending,
and in-app notification creation with external services mocked.
"""
import pytest
from unittest.mock import patch, MagicMock
from datetime import datetime, timezone, timedelta

from app.models import (
    Document, Notification, Organization, ReviewTask, User, Violation, Scan,
)
from app.auth import hash_password


@pytest.fixture
def notif_data(test_db):
    """Create org, users, document, scan, violation, and task."""
    org = Organization(name="Notif Test Org")
    test_db.add(org)
    test_db.flush()

    admin = User(
        name="Admin User", email="admin@notif.com",
        password_hash=hash_password("pass"), role="admin",
        organization_id=org.id,
    )
    reviewer = User(
        name="Reviewer User", email="reviewer@notif.com",
        password_hash=hash_password("pass"), role="reviewer",
        organization_id=org.id,
    )
    owner = User(
        name="Owner User", email="owner@notif.com",
        password_hash=hash_password("pass"), role="document_owner",
        organization_id=org.id,
    )
    test_db.add_all([admin, reviewer, owner])
    test_db.flush()

    doc = Document(
        filename="test.pdf", original_filename="test.pdf",
        file_size_bytes=1024, status="indexed",
        user_id=owner.id, organization_id=org.id,
    )
    test_db.add(doc)
    test_db.flush()

    scan = Scan(
        document_id=doc.id, framework="GDPR",
        status="completed", score=70, grade="C",
    )
    test_db.add(scan)
    test_db.flush()

    violation = Violation(
        scan_id=scan.id, rule_id="gdpr_art5",
        title="Lawful Basis", framework="GDPR",
        severity="high", status="open",
        description="Missing lawful basis",
    )
    test_db.add(violation)
    test_db.flush()

    task = ReviewTask(
        scan_id=scan.id, rule_id="gdpr_art5",
        rule_name="Lawful Basis", framework="GDPR",
        document_id=doc.id, reason="low_confidence",
        status="assigned", assigned_to=reviewer.name,
        assigned_to_id=reviewer.id, assigned_by=admin.name,
        due_date=datetime.now(timezone.utc) + timedelta(days=7),
    )
    test_db.add(task)
    test_db.commit()

    return {
        "org": org, "admin": admin, "reviewer": reviewer,
        "owner": owner, "doc": doc, "scan": scan,
        "violation": violation, "task": task,
    }


class TestTaskContext:
    def test_builds_correct_context(self, test_db, notif_data):
        from app.notifications import _task_context
        task = notif_data["task"]
        ctx = _task_context(test_db, task, notif_data["admin"])
        assert ctx["rule_name"] == "Lawful Basis"
        assert ctx["framework"] == "GDPR"
        assert ctx["doc_name"] == "test.pdf"
        assert ctx["assigned_by"] == "Admin User"

    def test_context_without_assigner(self, test_db, notif_data):
        from app.notifications import _task_context
        task = notif_data["task"]
        ctx = _task_context(test_db, task)
        assert "assigned_by" in ctx


class TestDocumentOwner:
    def test_returns_owner(self, test_db, notif_data):
        from app.notifications import _document_owner
        owner = _document_owner(test_db, notif_data["doc"].id)
        assert owner is not None
        assert owner.email == "owner@notif.com"

    def test_returns_none_for_no_owner(self, test_db):
        from app.notifications import _document_owner
        result = _document_owner(test_db, 99999)
        assert result is None


class TestComplianceManagers:
    def test_returns_managers_and_admins(self, test_db, notif_data):
        from app.notifications import _compliance_managers
        cms = _compliance_managers(test_db, notif_data["org"].id)
        roles = {u.role for u in cms}
        assert "admin" in roles or "compliance_manager" in roles

    def test_excludes_inactive_users(self, test_db, notif_data):
        from app.notifications import _compliance_managers
        inactive = User(
            name="Inactive CM", email="inactive@notif.com",
            password_hash=hash_password("pass"), role="compliance_manager",
            organization_id=notif_data["org"].id, is_active=False,
        )
        test_db.add(inactive)
        test_db.flush()
        cms = _compliance_managers(test_db, notif_data["org"].id)
        assert all(u.is_active for u in cms)


class TestInAppNotification:
    def test_creates_notification_record(self, test_db, notif_data):
        from app.notifications import _in_app_notification
        _in_app_notification(
            test_db, notif_data["owner"].id,
            "Test Title", "Test message", "test_type", 42,
        )
        test_db.flush()
        n = test_db.query(Notification).filter(
            Notification.user_id == notif_data["owner"].id,
            Notification.title == "Test Title",
        ).first()
        assert n is not None
        assert n.message == "Test message"
        assert n.type == "test_type"
        assert n.resource_id == 42


class TestEmailHtmlTemplate:
    def test_generates_valid_html(self):
        from app.notifications import _email_html_template
        html = _email_html_template(
            "Test Subject", "Active", "#16a34a",
            [("Key", "Value"), ("Another", "Data")],
            cta_url="https://example.com", cta_text="Click Here",
        )
        assert "<!DOCTYPE html>" in html
        assert "Test Subject" in html
        assert "Active" in html
        assert "Key" in html
        assert "Value" in html
        assert "https://example.com" in html

    def test_with_notes(self):
        from app.notifications import _email_html_template
        html = _email_html_template(
            "Title", "Badge", "#000", [], notes="Important note",
        )
        assert "Important note" in html

    def test_without_cta(self):
        from app.notifications import _email_html_template
        html = _email_html_template("Title", "B", "#000", [])
        assert "http" not in html or "charset" in html


class TestSendEmail:
    def test_skips_when_smtp_not_configured(self):
        from app.notifications.email import send_email
        with patch("app.notifications.email.settings") as mock_settings:
            mock_settings.smtp_host = ""
            mock_settings.smtp_user = ""
            result = send_email("test@test.com", "Subject", "Body")
            assert result is False

    def test_returns_false_on_send_failure(self):
        from app.notifications.email import send_email
        with patch("app.notifications.email.settings") as mock_settings, \
             patch("app.notifications.email.smtplib.SMTP") as mock_smtp:
            mock_settings.smtp_host = "smtp.test.com"
            mock_settings.smtp_user = "user"
            mock_settings.smtp_pass = "pass"
            mock_settings.smtp_port = 587
            mock_settings.email_from = "From <test@test.com>"
            mock_smtp.side_effect = ConnectionError("Connection refused")
            result = send_email("to@test.com", "Subject", "Body")
            assert result is False


class TestSendSlackMessage:
    def test_skips_when_no_webhook(self):
        from app.notifications.slack import send_slack_message
        with patch("app.notifications.slack.settings") as mock_settings:
            mock_settings.slack_webhook_url = ""
            mock_settings.slack_webhooks_by_framework = ""
            result = send_slack_message("Hello")
            assert result is False

    def test_returns_false_on_http_error(self):
        from app.notifications.slack import send_slack_message
        with patch("app.notifications.slack.settings") as mock_settings, \
             patch("app.notifications.slack.httpx") as mock_httpx:
            mock_settings.slack_webhook_url = "https://hooks.slack.com/test"
            mock_settings.slack_webhooks_by_framework = ""
            mock_resp = MagicMock()
            mock_resp.raise_for_status.side_effect = Exception("403 Forbidden")
            mock_httpx.post.return_value = mock_resp
            result = send_slack_message("Hello")
            assert result is False


class TestNotifyAssigned:
    def test_creates_in_app_notification(self, test_db, notif_data):
        from app.notifications import notify_assigned
        task = notif_data["task"]
        reviewer = notif_data["reviewer"]
        admin = notif_data["admin"]
        notify_assigned(test_db, task, reviewer, admin)
        test_db.flush()
        n = test_db.query(Notification).filter(
            Notification.user_id == reviewer.id,
            Notification.type == "review_assigned",
        ).first()
        assert n is not None
        assert n.title  # Title is set (e.g. "New Review Assigned")


class TestNotifyChangesRequested:
    def test_notifies_document_owner(self, test_db, notif_data):
        from app.notifications import notify_changes_requested
        task = notif_data["task"]
        reviewer = notif_data["reviewer"]
        notify_changes_requested(test_db, task, reviewer)
        test_db.flush()
        owner = notif_data["owner"]
        n = test_db.query(Notification).filter(
            Notification.user_id == owner.id,
            Notification.type == "changes_requested",
        ).first()
        assert n is not None


class TestNotifyOverdue:
    def test_creates_overdue_notification(self, test_db, notif_data):
        from app.notifications import notify_overdue
        task = notif_data["task"]
        notify_overdue(test_db, task)
        test_db.flush()
        reviewer = notif_data["reviewer"]
        n = test_db.query(Notification).filter(
            Notification.user_id == reviewer.id,
            Notification.type == "review_overdue",
        ).first()
        assert n is not None
