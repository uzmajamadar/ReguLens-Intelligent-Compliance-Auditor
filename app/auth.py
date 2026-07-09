"""
auth.py — JWT creation/verification, password hashing, FastAPI dependencies.
"""
from __future__ import annotations
import logging
import os
from datetime import datetime, timedelta, timezone

import bcrypt as _bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

SECRET_KEY = os.getenv("JWT_SECRET")
if not SECRET_KEY:
    raise ValueError("JWT_SECRET environment variable is not set. Generate a strong secret and export it.")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "480"))  # 8h

# ---------------------------------------------------------------------------
# Password hashing
# ---------------------------------------------------------------------------


def hash_password(password: str) -> str:
    return _bcrypt.hashpw(password.encode("utf-8"), _bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return _bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


# ---------------------------------------------------------------------------
# JWT
# ---------------------------------------------------------------------------

security = HTTPBearer()


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode["exp"] = expire
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None


# ---------------------------------------------------------------------------
# Granular Permissions
# ---------------------------------------------------------------------------

class Permission:
    VIOLATION_READ = "violation:read"
    VIOLATION_UPDATE = "violation:update"
    VIOLATION_SUBMIT_REVIEW = "violation:submit_review"

    REVIEW_READ = "review:read"
    REVIEW_START = "review:start"
    REVIEW_APPROVE = "review:approve"
    REVIEW_RESOLVE = "review:resolve"
    REVIEW_REJECT = "review:reject"
    REVIEW_NEEDS_FIX = "review:needs_fix"
    REVIEW_RESUBMIT = "review:resubmit"
    REVIEW_RETRY = "review:retry"
    REVIEW_REOPEN = "review:reopen"
    REVIEW_UPDATE = "review:update"
    REVIEW_ASSIGN = "review:assign"

    DOCUMENT_READ = "document:read"
    DOCUMENT_UPLOAD = "document:upload"
    DOCUMENT_DELETE = "document:delete"
    DOCUMENT_SCAN = "document:scan"
    DOCUMENT_UPDATE_FRAMEWORKS = "document:update_frameworks"
    DOCUMENT_EXPORT = "document:export"
    DOCUMENT_DOWNLOAD = "document:download"
    DOCUMENT_VIEW = "document:view"
    DOCUMENT_DIFF = "document:diff"
    DOCUMENT_QUERY = "document:query"

    REMEDIATION_READ = "remediation:read"
    REMEDIATION_CREATE = "remediation:create"
    REMEDIATION_ACCEPT = "remediation:accept"
    REMEDIATION_REJECT = "remediation:reject"
    REMEDIATION_UPDATE = "remediation:update"
    REMEDIATION_APPLY = "remediation:apply"

    FEEDBACK_SUBMIT = "feedback:submit"
    FEEDBACK_READ = "feedback:read"

    AUDIT_RUN = "audit:run"
    AUDIT_READ = "audit:read"

    WORKFLOW_READ = "workflow:read"
    WORKFLOW_CREATE = "workflow:create"
    WORKFLOW_UPDATE = "workflow:update"
    WORKFLOW_INSTANCE_CREATE = "workflow:instance:create"

    USER_READ = "user:read"
    USER_CREATE = "user:create"
    USER_UPDATE = "user:update"
    USER_DELETE = "user:delete"

    AUDIT_LOG_READ = "audit_log:read"
    STATS_READ = "stats:read"
    ORG_READ = "org:read"
    ORG_UPDATE = "org:update"
    ORG_ONBOARDING_READ = "org:onboarding:read"

    NOTIFICATION_READ = "notification:read"
    NOTIFICATION_UPDATE = "notification:update"

    CONVERSATION_MESSAGE = "conversation:message"


_ADMIN_ALL = "__all__"

_ROLE_PERMISSIONS: dict[str, set[str]] = {
    "document_owner": {
        Permission.VIOLATION_READ,
        Permission.REVIEW_READ,
        Permission.DOCUMENT_READ,
        Permission.DOCUMENT_UPLOAD,
        Permission.DOCUMENT_EXPORT,
        Permission.DOCUMENT_DOWNLOAD,
        Permission.DOCUMENT_VIEW,
        Permission.DOCUMENT_DIFF,
        Permission.DOCUMENT_QUERY,
        Permission.REMEDIATION_READ,
        Permission.FEEDBACK_SUBMIT,
        Permission.WORKFLOW_READ,
        Permission.NOTIFICATION_READ,
        Permission.NOTIFICATION_UPDATE,
        Permission.CONVERSATION_MESSAGE,
        Permission.AUDIT_READ,
    },
}
# reviewer inherits document_owner permissions

_ROLE_PERMISSIONS["reviewer"] = _ROLE_PERMISSIONS["document_owner"] | {
    Permission.VIOLATION_UPDATE,
    Permission.VIOLATION_SUBMIT_REVIEW,
    Permission.REVIEW_START,
    Permission.REVIEW_APPROVE,
    Permission.REVIEW_REJECT,
    Permission.REVIEW_NEEDS_FIX,
    Permission.REVIEW_RESUBMIT,
    Permission.DOCUMENT_DELETE,
    Permission.DOCUMENT_SCAN,
    Permission.FEEDBACK_READ,
    Permission.USER_READ,
}

# compliance_manager inherits reviewer + document_owner
_ROLE_PERMISSIONS["compliance_manager"] = _ROLE_PERMISSIONS["reviewer"] | {
    Permission.REVIEW_ASSIGN,
    Permission.REVIEW_RESOLVE,
    Permission.REVIEW_RETRY,
    Permission.REVIEW_REOPEN,
    Permission.REVIEW_UPDATE,
    Permission.DOCUMENT_UPDATE_FRAMEWORKS,
    Permission.REMEDIATION_CREATE,
    Permission.REMEDIATION_ACCEPT,
    Permission.REMEDIATION_REJECT,
    Permission.REMEDIATION_UPDATE,
    Permission.REMEDIATION_APPLY,
    Permission.AUDIT_RUN,
    Permission.WORKFLOW_CREATE,
    Permission.WORKFLOW_INSTANCE_CREATE,
}

# admin is special-cased — all permissions granted


# ---------------------------------------------------------------------------
# FastAPI dependencies
# ---------------------------------------------------------------------------


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    """Require a valid JWT and return the authenticated user."""
    payload = decode_access_token(credentials.credentials)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token.",
        )
    raw_sub = payload.get("sub")
    try:
        user_id = int(raw_sub) if raw_sub is not None else None
    except (ValueError, TypeError):
        user_id = None
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing subject.",
        )
    user = db.query(User).filter(User.id == user_id).first()
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive.",
        )
    return user


def require_role(*roles: str):
    """Return a dependency that checks the current user has one of the given roles.

    .. deprecated::
        Use :func:`require_permission` instead for granular access control.
    """
    def _role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{current_user.role}' not authorised. Required: {roles}",
            )
        return current_user
    return _role_checker


def scope_document_owner(query, current_user: User, model):
    """Restrict a query to the current user's own records if they are a document_owner.

    Usage::

        q = scope_document_owner(q, current_user, Document)
        # adds .filter(Document.user_id == current_user.id) for document_owners
    """
    if current_user.role == "document_owner":
        query = query.filter(model.user_id == current_user.id)
    return query


def require_permission(*permissions: str):
    """Return a dependency that checks the current user has **all** of the given permissions.

    Permissions are defined in :class:`Permission`.  Roles form an inheritance chain:

        document_owner → reviewer → compliance_manager

    ``admin`` is all-powerful and passes every permission check automatically.

    Usage::

        @router.get("/violations")
        def list_violations(
            db: Session = Depends(get_db),
            current_user: User = Depends(require_permission(Permission.VIOLATION_READ)),
        ):
            ...
    """
    def _permission_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role == "admin":
            return current_user
        allowed = _ROLE_PERMISSIONS.get(current_user.role)
        if allowed is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{current_user.role}' is not recognised.",
            )
        missing = [p for p in permissions if p not in allowed]
        if missing:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{current_user.role}' lacks required permissions: {missing}",
            )
        return current_user
    return _permission_checker


# ---------------------------------------------------------------------------
# Audit logging helper
# ---------------------------------------------------------------------------


def log_audit(
    db: Session,
    user_id: int | None,
    action: str,
    resource_type: str | None = None,
    resource_id: int | None = None,
    details: str | None = None,
    ip_address: str | None = None,
):
    from app.models import AuditLog as _AuditLog
    db.add(_AuditLog(
        user_id=user_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        details=details,
        ip_address=ip_address,
    ))
    db.flush()
