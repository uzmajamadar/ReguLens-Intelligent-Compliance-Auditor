import pytest
from fastapi import status
from fastapi.testclient import TestClient

import main
from app.auth import get_current_user, hash_password, create_access_token
from app.database import get_db


@pytest.fixture
def unauth_client(test_db):
    """TestClient with test database but NO authenticated user."""
    def override_get_db():
        yield test_db
    main.app.dependency_overrides[get_db] = override_get_db
    yield TestClient(main.app)
    main.app.dependency_overrides.clear()


@pytest.fixture
def auth_client(test_db):
    """TestClient with test database and authenticated admin user."""
    from app.models import Organization, User

    org = test_db.query(Organization).first()
    if not org:
        org = Organization(name="Test Org")
        test_db.add(org)
        test_db.flush()

    user = test_db.query(User).filter(User.email == "admin@test.com").first()
    if not user:
        user = User(
            name="Admin",
            email="admin@test.com",
            password_hash=hash_password("admin123"),
            role="admin",
            organization_id=org.id,
        )
        test_db.add(user)
        test_db.flush()

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


class TestRegister:
    def test_register_success(self, unauth_client):
        resp = unauth_client.post("/auth/register", json={
            "name": "New User",
            "email": "new@test.com",
            "password": "password123",
            "organization_name": "New Org",
        })
        assert resp.status_code == status.HTTP_200_OK
        data = resp.json()
        assert "access_token" in data
        assert data["user"]["email"] == "new@test.com"
        assert data["user"]["role"] == "admin"

    def test_register_duplicate_email(self, unauth_client):
        # First register the user
        resp = unauth_client.post("/auth/register", json={
            "name": "Original",
            "email": "admin@test.com",
            "password": "password123",
        })
        assert resp.status_code == status.HTTP_200_OK

        # Now trying to register the same email should fail
        resp = unauth_client.post("/auth/register", json={
            "name": "Duplicate",
            "email": "admin@test.com",
            "password": "password123",
        })
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert "already registered" in resp.json()["detail"].lower()


class TestLogin:
    def test_login_success(self, test_db, unauth_client):
        from app.models import Organization, User
        org = Organization(name="Login Org")
        test_db.add(org)
        test_db.flush()
        user = User(
            name="Login User",
            email="login@test.com",
            password_hash=hash_password("pass123"),
            role="reviewer",
            organization_id=org.id,
        )
        test_db.add(user)
        test_db.commit()

        resp = unauth_client.post("/auth/login", json={
            "email": "login@test.com",
            "password": "pass123",
        })
        assert resp.status_code == status.HTTP_200_OK
        data = resp.json()
        assert "access_token" in data
        assert data["user"]["email"] == "login@test.com"
        assert data["user"]["role"] == "reviewer"

    def test_login_wrong_password(self, unauth_client):
        resp = unauth_client.post("/auth/login", json={
            "email": "admin@test.com",
            "password": "wrongpassword",
        })
        assert resp.status_code == status.HTTP_401_UNAUTHORIZED

    def test_login_nonexistent_user(self, unauth_client):
        resp = unauth_client.post("/auth/login", json={
            "email": "nobody@test.com",
            "password": "password123",
        })
        assert resp.status_code == status.HTTP_401_UNAUTHORIZED

    def test_login_inactive_user(self, test_db, unauth_client):
        from app.models import Organization, User
        from app.auth import hash_password

        org = Organization(name="Login Org")
        test_db.add(org)
        test_db.flush()
        user = User(
            name="Login User",
            email="login@test.com",
            password_hash=hash_password("pass123"),
            role="reviewer",
            organization_id=org.id,
            is_active=False,
        )
        test_db.add(user)
        test_db.commit()

        resp = unauth_client.post("/auth/login", json={
            "email": "login@test.com",
            "password": "pass123",
        })
        assert resp.status_code == status.HTTP_401_UNAUTHORIZED
        assert "disabled" in resp.json()["detail"].lower()


class TestMe:
    def test_me_authenticated(self, auth_client):
        resp = auth_client.get("/auth/me")
        assert resp.status_code == status.HTTP_200_OK
        assert resp.json()["email"] == "admin@test.com"

    def test_me_unauthenticated(self, unauth_client):
        resp = unauth_client.get("/auth/me")
        assert resp.status_code == status.HTTP_401_UNAUTHORIZED


class TestForgotPassword:
    def test_forgot_password_existing_email(self, unauth_client):
        resp = unauth_client.post("/auth/forgot-password", json={
            "email": "admin@test.com",
        })
        assert resp.status_code == status.HTTP_200_OK
        assert "message" in resp.json()

    def test_forgot_password_nonexistent_email(self, unauth_client):
        resp = unauth_client.post("/auth/forgot-password", json={
            "email": "nobody@test.com",
        })
        assert resp.status_code == status.HTTP_200_OK
        # Should return same message for security (don't reveal if email exists)
        assert "message" in resp.json()


class TestResetPassword:
    def _ensure_user(self, test_db):
        """Create a user for reset-password tests."""
        from app.models import Organization, User
        from app.auth import hash_password

        org = test_db.query(Organization).first()
        if not org:
            org = Organization(name="Reset Org")
            test_db.add(org)
            test_db.flush()
        user = User(
            name="Reset User",
            email="admin@test.com",
            password_hash=hash_password("admin123"),
            role="admin",
            organization_id=org.id,
        )
        test_db.add(user)
        test_db.commit()

    def test_reset_password_success(self, test_db, unauth_client):
        self._ensure_user(test_db)

        # First request a reset
        resp = unauth_client.post("/auth/forgot-password", json={
            "email": "admin@test.com",
        })
        assert resp.status_code == status.HTTP_200_OK

        # Get the token from the database
        from app.models import PasswordResetToken
        reset = test_db.query(PasswordResetToken).order_by(
            PasswordResetToken.id.desc()
        ).first()
        assert reset is not None

        # Now reset the password
        resp = unauth_client.post("/auth/reset-password", json={
            "token": reset.token,
            "new_password": "newpassword123",
        })
        assert resp.status_code == status.HTTP_200_OK
        assert "successfully" in resp.json()["message"].lower()

    def test_reset_password_invalid_token(self, unauth_client):
        resp = unauth_client.post("/auth/reset-password", json={
            "token": "invalid-token-123",
            "new_password": "newpassword123",
        })
        assert resp.status_code == status.HTTP_400_BAD_REQUEST


class TestProfile:
    def test_update_name(self, auth_client):
        resp = auth_client.put("/auth/profile", json={
            "name": "Updated Admin",
        })
        assert resp.status_code == status.HTTP_200_OK
        assert resp.json()["name"] == "Updated Admin"

    def test_update_password(self, auth_client):
        resp = auth_client.put("/auth/profile", json={
            "current_password": "admin123",
            "new_password": "newadmin123",
        })
        assert resp.status_code == status.HTTP_200_OK

    def test_update_password_wrong_current(self, auth_client):
        resp = auth_client.put("/auth/profile", json={
            "current_password": "wrongpassword",
            "new_password": "newadmin123",
        })
        assert resp.status_code == status.HTTP_400_BAD_REQUEST


class TestRoleBasedAccess:
    def test_admin_access_allowed(self, auth_client):
        resp = auth_client.get("/admin/users")
        assert resp.status_code in (status.HTTP_200_OK, status.HTTP_404_NOT_FOUND)

    def test_reviewer_cannot_access_admin(self, test_db):
        """A reviewer user should get 403 on admin-only endpoints."""
        from app.models import Organization, User
        from app.auth import hash_password

        org = Organization(name="Test Org")
        test_db.add(org)
        test_db.flush()

        user = User(
            name="Reviewer",
            email="reviewer@test.com",
            password_hash=hash_password("pass123"),
            role="reviewer",
            organization_id=org.id,
        )
        test_db.add(user)
        test_db.commit()

        token = create_access_token({"sub": str(user.id), "role": user.role})

        def override_get_db():
            yield test_db

        def override_get_current_user():
            return user

        import main
        from app.database import get_db
        from app.auth import get_current_user

        main.app.dependency_overrides[get_db] = override_get_db
        main.app.dependency_overrides[get_current_user] = override_get_current_user
        client = TestClient(main.app)
        client.headers["Authorization"] = f"Bearer {token}"

        # POST /admin/users requires "admin" role only — reviewer should be denied
        resp = client.post("/admin/users", json={
            "name": "New User",
            "email": "new@test.com",
            "password": "pass123",
            "role": "employee",
        })
        assert resp.status_code == status.HTTP_403_FORBIDDEN
        main.app.dependency_overrides.clear()
