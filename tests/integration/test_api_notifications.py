"""Integration tests for notification API endpoints."""
import pytest
from datetime import datetime, timezone, timedelta

from app.models import Notification, ReviewTask


class TestCheckOverdue:
    def test_check_overdue_no_tasks(self, admin_client):
        resp = admin_client.post("/notifications/check-overdue")
        assert resp.status_code == 200

    def test_check_overdue_with_overdue_task(self, admin_client, test_db, sample_scan, org_and_users):
        scan = sample_scan["scan"]
        task = ReviewTask(
            scan_id=scan.id, rule_id="gdpr_overdue",
            rule_name="Overdue Rule", framework="GDPR",
            document_id=scan.document_id,
            reason="low_confidence", status="assigned",
            assigned_to=org_and_users["reviewer"].name,
            assigned_to_id=org_and_users["reviewer"].id,
            due_date=datetime.now(timezone.utc) - timedelta(days=1),
        )
        test_db.add(task)
        test_db.commit()
        resp = admin_client.post("/notifications/check-overdue")
        assert resp.status_code == 200


class TestWorkflowNotifications:
    def test_list_notifications(self, admin_client, test_db, org_and_users):
        user = org_and_users["admin"]
        n = Notification(
            user_id=user.id, title="Test", message="Test message",
            type="info",
        )
        test_db.add(n)
        test_db.commit()
        resp = admin_client.get("/workflows/notifications")
        assert resp.status_code == 200
        notifs = resp.json()
        assert len(notifs) >= 1

    def test_mark_notification_read(self, admin_client, test_db, org_and_users):
        user = org_and_users["admin"]
        n = Notification(
            user_id=user.id, title="Test", message="Test",
            type="info", read=False,
        )
        test_db.add(n)
        test_db.commit()
        test_db.refresh(n)
        resp = admin_client.post(f"/workflows/notifications/{n.id}/read")
        assert resp.status_code == 200

    def test_mark_all_notifications_read(self, admin_client, test_db, org_and_users):
        user = org_and_users["admin"]
        n1 = Notification(
            user_id=user.id, title="N1", type="info", read=False,
        )
        n2 = Notification(
            user_id=user.id, title="N2", type="info", read=False,
        )
        test_db.add_all([n1, n2])
        test_db.commit()
        resp = admin_client.post("/workflows/notifications/read-all")
        assert resp.status_code == 200
        remaining = test_db.query(Notification).filter(
            Notification.user_id == user.id,
            Notification.read.is_(False),
        ).count()
        assert remaining == 0
