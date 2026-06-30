"""
routers/auth.py — Authentication endpoints.
"""
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.auth import (
    create_access_token,
    get_current_user,
    hash_password,
    log_audit,
    verify_password,
)
from app.config import settings
from app.database import get_db
from app.models import Organization, PasswordResetToken, User
from app.notifications.email import send_email

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class LoginRequest(BaseModel):
    email: str
    password: str


class UserResponse(BaseModel):
    id: int
    name: str
    email: str
    role: str
    organization_id: int


class LoginResponse(BaseModel):
    access_token: str
    user: UserResponse


class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str
    organization_name: str = "Default Organization"


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


class UpdateProfileRequest(BaseModel):
    name: str | None = None
    current_password: str | None = None
    new_password: str | None = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/login", response_model=LoginResponse)
def login(req: LoginRequest, request: Request, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email).first()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    if not user.is_active:
        raise HTTPException(status_code=401, detail="Account is disabled.")

    token = create_access_token({"sub": str(user.id), "role": user.role})
    log_audit(db, user.id, "login", "user", user.id,
              f"User {user.email} logged in", request.client.host)

    return LoginResponse(
        access_token=token,
        user=UserResponse(
            id=user.id, name=user.name, email=user.email,
            role=user.role, organization_id=user.organization_id,
        ),
    )


@router.post("/register", response_model=LoginResponse)
def register(req: RegisterRequest, request: Request, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == req.email).first():
        raise HTTPException(status_code=400, detail="Email already registered.")

    org = Organization(name=req.organization_name)
    db.add(org)
    db.flush()

    user = User(
        name=req.name,
        email=req.email,
        password_hash=hash_password(req.password),
        role="admin",
        organization_id=org.id,
    )
    db.add(user)
    db.flush()

    token = create_access_token({"sub": str(user.id), "role": user.role})
    log_audit(db, user.id, "register", "user", user.id,
              f"User {user.email} registered org '{org.name}'", request.client.host)
    db.commit()

    return LoginResponse(
        access_token=token,
        user=UserResponse(
            id=user.id, name=user.name, email=user.email,
            role=user.role, organization_id=user.organization_id,
        ),
    )


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)):
    return UserResponse(
        id=current_user.id, name=current_user.name, email=current_user.email,
        role=current_user.role, organization_id=current_user.organization_id,
    )


@router.post("/forgot-password")
def forgot_password(req: ForgotPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email).first()
    if not user:
        return {"message": "If the email exists, a reset link has been sent."}

    token_str = secrets.token_urlsafe(32)
    expires = datetime.now(timezone.utc) + timedelta(hours=1)

    reset = PasswordResetToken(
        user_id=user.id,
        token=token_str,
        expires_at=expires,
    )
    db.add(reset)
    log_audit(db, user.id, "password_reset_request", "user", user.id,
              f"Password reset requested for {user.email}")
    db.commit()

    reset_url = f"{settings.app_url}/reset-password?token={token_str}"
    body = (
        f"Password Reset Request\n\n"
        f"Click the link below to reset your password:\n\n"
        f"{reset_url}\n\n"
        f"This link expires in 1 hour.\n"
        f"If you did not request this, please ignore this email."
    )
    html_body = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1f2937;padding:24px;">
<table cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
<tr><td style="background:#2563eb;padding:20px 24px;">
<h1 style="margin:0;font-size:18px;color:#fff;">Password Reset</h1>
</td></tr>
<tr><td style="padding:24px;">
<p style="font-size:14px;margin:0 0 16px;">Click the button below to reset your password. This link expires in <strong>1 hour</strong>.</p>
<p style="text-align:center;">
<a href="{reset_url}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600;">Reset Password</a>
</p>
<p style="font-size:12px;color:#6b7280;margin-top:24px;">If you did not request this, please ignore this email.</p>
</td></tr>
</table>
</body>
</html>"""
    send_email(to=user.email, subject="Reset your ReguLens password", body=body, html_body=html_body)

    logger.info("Password reset email sent to %s", user.email)
    return {"message": "If the email exists, a reset link has been sent."}


@router.post("/reset-password")
def reset_password(req: ResetPasswordRequest, db: Session = Depends(get_db)):
    reset = db.query(PasswordResetToken).filter(
        PasswordResetToken.token == req.token,
        PasswordResetToken.used.is_(False),
    ).first()
    if not reset:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token.")
    expires = reset.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Reset token has expired.")

    user = db.query(User).filter(User.id == reset.user_id).first()
    if not user:
        raise HTTPException(status_code=400, detail="User not found.")

    user.password_hash = hash_password(req.new_password)
    reset.used = True
    log_audit(db, user.id, "password_reset", "user", user.id,
              f"Password reset completed for {user.email}")
    db.commit()
    return {"message": "Password reset successfully."}


@router.get("/profile", response_model=UserResponse)
def get_profile(current_user: User = Depends(get_current_user)):
    return UserResponse(
        id=current_user.id, name=current_user.name, email=current_user.email,
        role=current_user.role, organization_id=current_user.organization_id,
    )


@router.put("/profile", response_model=UserResponse)
def update_profile(
    req: UpdateProfileRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if req.name is not None:
        current_user.name = req.name

    if req.new_password is not None:
        if not req.current_password:
            raise HTTPException(status_code=400, detail="Current password is required to set a new password.")
        if not verify_password(req.current_password, current_user.password_hash):
            raise HTTPException(status_code=400, detail="Current password is incorrect.")
        current_user.password_hash = hash_password(req.new_password)

    db.flush()
    log_audit(db, current_user.id, "profile_update", "user", current_user.id,
              f"Profile updated for {current_user.email}")
    db.commit()
    db.refresh(current_user)
    return UserResponse(
        id=current_user.id, name=current_user.name, email=current_user.email,
        role=current_user.role, organization_id=current_user.organization_id,
    )
