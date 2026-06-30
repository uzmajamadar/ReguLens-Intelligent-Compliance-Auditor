import pytest
from fastapi import status
from fastapi.testclient import TestClient

import main
from app.auth import get_current_user, hash_password, create_access_token
from app.database import get_db
from app.models import Notification, Organization, User


@pytest.fixture
def auth_client(test_db):
    org = Organization(name="Notif Test Org")
    test_db.add(org)
    test_db.flush()

    user = User(
        name="Notif User",
        email="notif@test.com",
        password_hash=hash_password("test123"),
        role="admin",
        organization_id=org.id,
    )
    test_db.add(user)
    test_db.commit()

    token = create_access_token({"sub": str(user.id), "role": user.role})

    def override_get_db():
        yield test_db

    def override_get_current_user():
        return user

    main.app.dependency_overrides[get_db] = override_get_db
    main.app.dependency_overrides[get_current_user] = override_get_current_user
    client = TestClient(main.app)
    client.headers["Authorization"] = f"Bearer {token}"
    yield client
    main.app.dependency_overrides.clear()


class TestNotifications:
    def test_list_empty(self, auth_client):
        resp = auth_client.get("/workflows/notifications")
        assert resp.status_code == status.HTTP_200_OK
        assert resp.json() == []

    def test_create_and_list(self, test_db, auth_client):
        user = test_db.query(User).filter(User.email == "notif@test.com").first()
        notif = Notification(
            user_id=user.id,
            title="Test Notification",
            message="This is a test",
            type="review_assigned",
            resource_type="review_task",
            resource_id=1,
        )
        test_db.add(notif)
        test_db.commit()

        resp = auth_client.get("/workflows/notifications")
        assert resp.status_code == status.HTTP_200_OK
        data = resp.json()
        assert len(data) >= 1
        assert data[0]["title"] == "Test Notification"

    def test_mark_read(self, test_db, auth_client):
        user = test_db.query(User).filter(User.email == "notif@test.com").first()
        notif = Notification(
            user_id=user.id,
            title="Read me",
            message="Mark as read",
            type="review_assigned",
            resource_type="review_task",
            resource_id=1,
        )
        test_db.add(notif)
        test_db.commit()
        notif_id = notif.id

        resp = auth_client.post(f"/workflows/notifications/{notif_id}/read")
        assert resp.status_code == status.HTTP_200_OK

        resp = auth_client.get("/workflows/notifications?unread_only=true")
        data = resp.json()
        ids = [n["id"] for n in data]
        assert notif_id not in ids

    def test_mark_all_read(self, test_db, auth_client):
        user = test_db.query(User).filter(User.email == "notif@test.com").first()
        for i in range(3):
            test_db.add(Notification(
                user_id=user.id,
                title=f"Notif {i}",
                message="test",
                type="review_assigned",
                resource_type="review_task",
                resource_id=i,
            ))
        test_db.commit()

        resp = auth_client.post("/workflows/notifications/read-all")
        assert resp.status_code == status.HTTP_200_OK

        resp = auth_client.get("/workflows/notifications?unread_only=true")
        assert resp.json() == []

    def test_notification_different_user(self, test_db, auth_client):
        """A user should not see another user's notifications."""
        user = test_db.query(User).filter(User.email == "notif@test.com").first()

        other_org = Organization(name="Other Org")
        test_db.add(other_org)
        test_db.flush()
        other_user = User(
            name="Other",
            email="other@test.com",
            password_hash=hash_password("test123"),
            role="admin",
            organization_id=other_org.id,
        )
        test_db.add(other_user)
        test_db.flush()

        # Notification for other user
        notif = Notification(
            user_id=other_user.id,
            title="Not for you",
            message="hidden",
            type="review_assigned",
            resource_type="review_task",
            resource_id=1,
        )
        test_db.add(notif)
        test_db.commit()

        resp = auth_client.get("/workflows/notifications")
        data = resp.json()
        titles = [n["title"] for n in data]
        assert "Not for you" not in titles
