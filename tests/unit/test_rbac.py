"""Unit tests for RBAC: permission inheritance, scope_document_owner, require_permission."""
import pytest
from fastapi import HTTPException
from unittest.mock import MagicMock

from app.auth import (
    _ROLE_PERMISSIONS,
    Permission,
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
    scope_document_owner,
)


class TestPasswordHashing:
    def test_hash_and_verify(self):
        h = hash_password("secret123")
        assert verify_password("secret123", h)

    def test_wrong_password_fails(self):
        h = hash_password("secret123")
        assert not verify_password("wrongpassword", h)


class TestJWTTokens:
    def test_create_and_decode(self):
        token = create_access_token({"sub": "42"})
        payload = decode_access_token(token)
        assert payload is not None
        assert payload["sub"] == "42"

    def test_invalid_token_returns_none(self):
        payload = decode_access_token("garbage.token.value")
        assert payload is None


class TestRoleInheritance:
    def test_document_owner_has_base_permissions(self):
        perms = _ROLE_PERMISSIONS["document_owner"]
        assert Permission.DOCUMENT_READ in perms
        assert Permission.DOCUMENT_UPLOAD in perms
        assert Permission.VIOLATION_READ in perms
        assert Permission.CONVERSATION_MESSAGE in perms

    def test_reviewer_inherits_owner_permissions(self):
        owner = _ROLE_PERMISSIONS["document_owner"]
        reviewer = _ROLE_PERMISSIONS["reviewer"]
        assert owner.issubset(reviewer)

    def test_reviewer_has_review_permissions(self):
        reviewer = _ROLE_PERMISSIONS["reviewer"]
        assert Permission.REVIEW_START in reviewer
        assert Permission.REVIEW_APPROVE in reviewer
        assert Permission.DOCUMENT_SCAN in reviewer

    def test_compliance_manager_inherits_reviewer_permissions(self):
        reviewer = _ROLE_PERMISSIONS["reviewer"]
        cm = _ROLE_PERMISSIONS["compliance_manager"]
        assert reviewer.issubset(cm)

    def test_compliance_manager_has_admin_workflow_permissions(self):
        cm = _ROLE_PERMISSIONS["compliance_manager"]
        assert Permission.REVIEW_ASSIGN in cm
        assert Permission.AUDIT_RUN in cm
        assert Permission.WORKFLOW_CREATE in cm
        assert Permission.REMEDIATION_CREATE in cm

    def test_admin_not_in_role_permissions(self):
        assert "admin" not in _ROLE_PERMISSIONS


class TestScopeDocumentOwner:
    def test_owner_scopes_query(self):
        query = MagicMock()
        user = MagicMock()
        user.role = "document_owner"
        user.id = 42
        model = MagicMock()
        result = scope_document_owner(query, user, model)
        query.filter.assert_called_once()
        assert result is not query

    def test_admin_no_scoping(self):
        query = MagicMock()
        user = MagicMock()
        user.role = "admin"
        result = scope_document_owner(query, user, MagicMock())
        query.filter.assert_not_called()
        assert result is query

    def test_reviewer_no_scoping(self):
        query = MagicMock()
        user = MagicMock()
        user.role = "reviewer"
        result = scope_document_owner(query, user, MagicMock())
        query.filter.assert_not_called()
        assert result is query


class TestRequirePermissionDependency:
    def test_admin_passes_all(self):
        from app.auth import require_permission
        dep = require_permission(Permission.VIOLATION_UPDATE, Permission.AUDIT_RUN)
        user = MagicMock()
        user.role = "admin"
        result = dep(current_user=user)
        assert result is user

    def test_owner_lacks_admin_permission(self):
        from app.auth import require_permission
        dep = require_permission(Permission.AUDIT_RUN)
        user = MagicMock()
        user.role = "document_owner"
        with pytest.raises(HTTPException) as exc_info:
            dep(current_user=user)
        assert exc_info.value.status_code == 403

    def test_reviewer_has_review_start(self):
        from app.auth import require_permission
        dep = require_permission(Permission.REVIEW_START)
        user = MagicMock()
        user.role = "reviewer"
        result = dep(current_user=user)
        assert result is user

    def test_unknown_role_raises_403(self):
        from app.auth import require_permission
        dep = require_permission(Permission.VIOLATION_READ)
        user = MagicMock()
        user.role = "unknown_role"
        with pytest.raises(HTTPException) as exc_info:
            dep(current_user=user)
        assert exc_info.value.status_code == 403

    def test_cm_has_workflow_create(self):
        from app.auth import require_permission
        dep = require_permission(Permission.WORKFLOW_CREATE)
        user = MagicMock()
        user.role = "compliance_manager"
        result = dep(current_user=user)
        assert result is user
