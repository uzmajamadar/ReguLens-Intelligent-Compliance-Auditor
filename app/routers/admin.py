"""
routers/admin.py — Admin-only endpoints for user management, audit logs, and stats.
"""
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.auth import get_current_user, hash_password, log_audit, require_role
from app.database import get_db
from app.models import AuditLog, Document, Organization, ReviewTask, Scan, User, Violation

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])


class UserOut(BaseModel):
    id: int
    name: str
    email: str
    role: str
    organization_id: int
    is_active: bool
    created_at: str


class UserCreate(BaseModel):
    name: str
    email: str
    password: str
    role: str = "employee"


class UserUpdate(BaseModel):
    name: str | None = None
    role: str | None = None
    is_active: bool | None = None
    password: str | None = None


class AuditLogOut(BaseModel):
    id: int
    user_id: int | None
    user_email: str | None = None
    action: str
    resource_type: str | None
    resource_id: int | None
    details: str | None
    ip_address: str | None
    created_at: str


class AdminStats(BaseModel):
    total_users: int
    total_documents: int
    total_scans: int
    pending_reviews: int
    active_users: int
    admin_users: int


class AssignReviewRequest(BaseModel):
    assigned_to_id: int
    note: str | None = None


class OrganizationOut(BaseModel):
    id: int
    name: str
    created_at: str


class OrganizationUpdate(BaseModel):
    name: str


class NeedsOnboarding(BaseModel):
    needs_onboarding: bool


@router.get("/users", response_model=list[UserOut])
def list_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "compliance_manager", "reviewer")),
):
    users = (
        db.query(User)
        .filter(User.organization_id == current_user.organization_id)
        .order_by(User.created_at.desc())
        .all()
    )
    return [
        UserOut(
            id=u.id, name=u.name, email=u.email, role=u.role,
            organization_id=u.organization_id, is_active=u.is_active,
            created_at=u.created_at.isoformat(),
        )
        for u in users
    ]


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(
    req: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    if db.query(User).filter(User.email == req.email).first():
        raise HTTPException(status_code=400, detail="Email already registered.")

    valid_roles = {"admin", "compliance_manager", "reviewer", "employee"}
    if req.role not in valid_roles:
        raise HTTPException(status_code=400, detail=f"Invalid role. Must be one of: {', '.join(sorted(valid_roles))}")

    user = User(
        name=req.name,
        email=req.email,
        password_hash=hash_password(req.password),
        role=req.role,
        organization_id=current_user.organization_id,
    )
    db.add(user)
    db.flush()
    log_audit(db, current_user.id, "user_create", "user", user.id,
              f"Created user {user.email} with role {user.role}")
    db.commit()
    db.refresh(user)
    return UserOut(
        id=user.id, name=user.name, email=user.email, role=user.role,
        organization_id=user.organization_id, is_active=user.is_active,
        created_at=user.created_at.isoformat(),
    )


@router.get("/users/{user_id}", response_model=UserOut)
def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    user = db.query(User).filter(
        User.id == user_id,
        User.organization_id == current_user.organization_id,
    ).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return UserOut(
        id=user.id, name=user.name, email=user.email, role=user.role,
        organization_id=user.organization_id, is_active=user.is_active,
        created_at=user.created_at.isoformat(),
    )


@router.put("/users/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    req: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot modify your own account here. Use the profile page.")

    user = db.query(User).filter(
        User.id == user_id,
        User.organization_id == current_user.organization_id,
    ).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if req.name is not None:
        user.name = req.name
    if req.role is not None:
        valid_roles = {"admin", "compliance_manager", "reviewer", "employee"}
        if req.role not in valid_roles:
            raise HTTPException(status_code=400, detail=f"Invalid role. Must be one of: {', '.join(sorted(valid_roles))}")
        user.role = req.role
    if req.is_active is not None:
        user.is_active = req.is_active
    if req.password is not None:
        user.password_hash = hash_password(req.password)

    db.flush()
    log_audit(db, current_user.id, "user_update", "user", user.id,
              f"Updated user {user.email}")
    db.commit()
    db.refresh(user)
    return UserOut(
        id=user.id, name=user.name, email=user.email, role=user.role,
        organization_id=user.organization_id, is_active=user.is_active,
        created_at=user.created_at.isoformat(),
    )


@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account.")

    user = db.query(User).filter(
        User.id == user_id,
        User.organization_id == current_user.organization_id,
    ).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.role == "admin":
        admin_count = db.query(User).filter(
            User.organization_id == current_user.organization_id,
            User.role == "admin",
            User.is_active.is_(True),
        ).count()
        if admin_count <= 1:
            raise HTTPException(status_code=400, detail="Cannot remove the last active admin in the organization.")

    user.is_active = False
    db.flush()
    log_audit(db, current_user.id, "user_delete", "user", user.id,
              f"Deactivated user {user.email}")
    db.commit()
    return {"message": f"User '{user.email}' deactivated."}


@router.get("/audit-logs", response_model=list[AuditLogOut])
def list_audit_logs(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    action: str | None = Query(None, description="Filter by action type"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    q = (
        db.query(AuditLog, User.email.label("user_email"))
        .join(User, AuditLog.user_id == User.id, isouter=True)
        .filter(User.organization_id == current_user.organization_id)
    )
    if action:
        q = q.filter(AuditLog.action == action)
    logs = q.order_by(AuditLog.created_at.desc()).offset(offset).limit(limit).all()

    return [
        AuditLogOut(
            id=log.id,
            user_id=log.user_id,
            user_email=user_email,
            action=log.action,
            resource_type=log.resource_type,
            resource_id=log.resource_id,
            details=log.details,
            ip_address=log.ip_address,
            created_at=log.created_at.isoformat(),
        )
        for log, user_email in logs
    ]


@router.get("/stats", response_model=AdminStats)
def get_admin_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    org_id = current_user.organization_id
    total_users = db.query(User).filter(User.organization_id == org_id).count()
    active_users = db.query(User).filter(User.organization_id == org_id, User.is_active.is_(True)).count()
    admin_users = db.query(User).filter(
        User.organization_id == org_id, User.role == "admin", User.is_active.is_(True)
    ).count()
    total_documents = db.query(Document).filter(Document.organization_id == org_id).count()
    total_scans = (
        db.query(Scan)
        .join(Document, Scan.document_id == Document.id)
        .filter(Document.organization_id == org_id)
        .count()
    )
    pending_reviews = (
        db.query(ReviewTask)
        .join(Document, ReviewTask.document_id == Document.id)
        .filter(Document.organization_id == org_id, ReviewTask.status == "pending_review")
        .count()
    )
    return AdminStats(
        total_users=total_users,
        total_documents=total_documents,
        total_scans=total_scans,
        pending_reviews=pending_reviews,
        active_users=active_users,
        admin_users=admin_users,
    )


@router.get("/organization", response_model=OrganizationOut)
def get_organization(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    org = db.query(Organization).filter(Organization.id == current_user.organization_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return OrganizationOut(
        id=org.id,
        name=org.name,
        created_at=org.created_at.isoformat() if org.created_at else "",
    )


@router.put("/organization", response_model=OrganizationOut)
def update_organization(
    req: OrganizationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    org = db.query(Organization).filter(Organization.id == current_user.organization_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    org.name = req.name
    db.flush()
    log_audit(db, current_user.id, "org_update", "organization", org.id,
              f"Organization renamed to '{req.name}'")
    db.commit()
    db.refresh(org)
    return OrganizationOut(
        id=org.id,
        name=org.name,
        created_at=org.created_at.isoformat() if org.created_at else "",
    )


@router.get("/organization/needs-onboarding", response_model=NeedsOnboarding)
def needs_onboarding(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    org = db.query(Organization).filter(Organization.id == current_user.organization_id).first()
    if not org:
        return NeedsOnboarding(needs_onboarding=False)
    user_count = db.query(User).filter(User.organization_id == org.id).count()
    return NeedsOnboarding(needs_onboarding=org.name == "Default Organization" and user_count == 1)


@router.put("/review/{task_id}/assign")
def assign_review_task(
    task_id: int,
    req: AssignReviewRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "compliance_manager", "reviewer")),
):
    task = (
        db.query(ReviewTask)
        .join(Document, ReviewTask.document_id == Document.id)
        .filter(ReviewTask.id == task_id, Document.organization_id == current_user.organization_id)
        .first()
    )
    if not task:
        raise HTTPException(status_code=404, detail="Review task not found")

    assignee = db.query(User).filter(
        User.id == req.assigned_to_id,
        User.organization_id == current_user.organization_id,
    ).first()
    if not assignee:
        raise HTTPException(status_code=404, detail="Assignee not found")

    if not task.due_date:
        task.due_date = datetime.now(timezone.utc) + timedelta(days=7)
    task.assigned_to = assignee.name
    task.assigned_to_id = assignee.id
    task.assigned_by = current_user.name
    if not task.submitted_by:
        task.submitted_by = current_user.name
    if req.note:
        task.notes = (task.notes + "\n---\n" + req.note) if task.notes else req.note
    if task.status in ("pending_review", "pending_assignment"):
        task.status = "assigned"
        # Also update the associated violation status
        violation = db.query(Violation).filter(
            Violation.scan_id == task.scan_id, Violation.rule_id == task.rule_id
        ).first()
        if violation:
            violation.status = "assigned"

    db.flush()
    log_audit(db, current_user.id, "review_assign", "review_task", task_id,
              f"Assigned review task {task_id} to {assignee.name}")

    from app.notifications import notify_assigned
    notify_assigned(db, task, assignee, current_user)

    db.commit()
    return {"message": f"Review task {task_id} assigned to {assignee.name}.", "assigned_to": assignee.name}
