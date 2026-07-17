"""Integration tests for auth API endpoints."""
import pytest


class TestLogin:
    def test_login_success(self, auth_client, test_db):
        from app.models import User
        user = test_db.query(User).filter(User.email == "testadmin@test.com").first()
        assert user is not None
        resp = auth_client.post("/auth/login", json={
            "email": "testadmin@test.com", "password": "test123",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["user"]["role"] == "admin"

    def test_login_wrong_password(self, auth_client):
        resp = auth_client.post("/auth/login", json={
            "email": "testadmin@test.com", "password": "wrongpassword",
        })
        assert resp.status_code in (400, 401)

    def test_login_nonexistent_user(self, auth_client):
        resp = auth_client.post("/auth/login", json={
            "email": "nobody@test.com", "password": "pass",
        })
        assert resp.status_code in (400, 401)


class TestRegister:
    def test_register_creates_org_and_user(self, unauth_client):
        resp = unauth_client.post("/auth/register", json={
            "organization_name": "New Org",
            "name": "New Admin",
            "email": "neworg@test.com",
            "password": "securepass123",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["user"]["email"] == "neworg@test.com"
        assert data["user"]["role"] == "admin"

    def test_register_duplicate_email(self, unauth_client, auth_client):
        resp = unauth_client.post("/auth/register", json={
            "organization_name": "Org2",
            "name": "Admin2",
            "email": "testadmin@test.com",
            "password": "pass1234",
        })
        assert resp.status_code in (400, 409)


class TestMeEndpoint:
    def test_me_returns_current_user(self, auth_client):
        resp = auth_client.get("/auth/me")
        assert resp.status_code == 200
        data = resp.json()
        assert "email" in data
        assert "role" in data

    def test_me_unauthorized(self, unauth_client):
        resp = unauth_client.get("/auth/me")
        assert resp.status_code == 401


class TestProfileEndpoint:
    def test_get_profile(self, auth_client):
        resp = auth_client.get("/auth/profile")
        assert resp.status_code == 200
        assert "email" in resp.json()

    def test_update_profile_name(self, auth_client):
        resp = auth_client.put("/auth/profile", json={"name": "Updated Name"})
        assert resp.status_code == 200
        assert resp.json()["name"] == "Updated Name"
        assert auth_client.get("/auth/me").json()["name"] == "Updated Name"
