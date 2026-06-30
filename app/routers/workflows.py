"""
routers/workflows.py — Workflow definition management, instance tracking,
task queue, and notification endpoints.
"""
import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import get_current_user, log_audit, require_role
from app.database import get_db
from app.models import (
    Document, Notification, Scan, User, Workflow, WorkflowInstance,
    WorkflowStep, WorkflowTask, WorkflowTransition,
)
from app.workflow_engine import complete_task, create_workflow_instance, seed_default_workflows

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/workflows", tags=["workflows"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class WorkflowStepSchema(BaseModel):
    id: int | None = None
    name: str
    order: int
    assigned_role: str | None = None
    step_type: str = "review"
    config: str | None = None


class WorkflowTransitionSchema(BaseModel):
    id: int | None = None
    source_step_id: int
    target_step_id: int
    condition_type: str = "always"
    condition_config: str | None = None


class WorkflowOut(BaseModel):
    id: int
    name: str
    framework: str | None = None
    description: str | None = None
    is_active: bool
    created_at: str
    steps: list[WorkflowStepSchema] = []
    transitions: list[WorkflowTransitionSchema] = []


class WorkflowCreate(BaseModel):
    name: str
    framework: str | None = None
    description: str | None = None


class WorkflowStepCreate(BaseModel):
    name: str
    order: int
    assigned_role: str | None = None
    step_type: str = "review"
    config: str | None = None


class WorkflowTransitionCreate(BaseModel):
    source_step_id: int
    target_step_id: int
    condition_type: str = "always"
    condition_config: str | None = None


class WorkflowInstanceOut(BaseModel):
    id: int
    document_id: int
    document_name: str = ""
    scan_id: int | None = None
    workflow_id: int
    workflow_name: str = ""
    current_step_id: int | None = None
    current_step_name: str = ""
    current_step_role: str | None = None
    status: str
    created_at: str
    updated_at: str
    completed_at: str | None = None


class WorkflowTaskOut(BaseModel):
    id: int
    instance_id: int
    step_id: int | None = None
    step_name: str = ""
    assigned_to: int | None = None
    assigned_to_name: str = ""
    status: str
    notes: str | None = None
    completed_by: int | None = None
    created_at: str
    completed_at: str | None = None


class WorkflowTaskAction(BaseModel):
    status: str = Field(..., description="approved, rejected, or changes_requested")
    notes: str | None = None


class NotificationOut(BaseModel):
    id: int
    title: str
    message: str | None = None
    type: str
    resource_type: str | None = None
    resource_id: int | None = None
    read: bool
    created_at: str


# ---------------------------------------------------------------------------
# Workflow Definitions (admin only)
# ---------------------------------------------------------------------------


@router.get("/", response_model=list[WorkflowOut])
def list_workflows(
    framework: str | None = Query(None, description="Filter by framework"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Workflow).filter(Workflow.organization_id == current_user.organization_id)
    if framework:
        q = q.filter(Workflow.framework == framework)
    workflows = q.order_by(Workflow.name).all()

    result = []
    for wf in workflows:
        steps = [
            WorkflowStepSchema(
                id=s.id, name=s.name, order=s.order,
                assigned_role=s.assigned_role, step_type=s.step_type, config=s.config,
            )
            for s in wf.steps
        ]
        transitions = [
            WorkflowTransitionSchema(
                id=t.id, source_step_id=t.source_step_id, target_step_id=t.target_step_id,
                condition_type=t.condition_type, condition_config=t.condition_config,
            )
            for t in wf.transitions
        ]
        result.append(WorkflowOut(
            id=wf.id, name=wf.name, framework=wf.framework,
            description=wf.description, is_active=wf.is_active,
            created_at=wf.created_at.isoformat(),
            steps=steps, transitions=transitions,
        ))
    return result


@router.post("/", response_model=WorkflowOut, status_code=status.HTTP_201_CREATED)
def create_workflow(
    req: WorkflowCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    wf = Workflow(
        organization_id=current_user.organization_id,
        name=req.name,
        framework=req.framework,
        description=req.description,
    )
    db.add(wf)
    db.flush()
    log_audit(db, current_user.id, "workflow_create", "workflow", wf.id,
              f"Created workflow '{wf.name}'")
    db.commit()
    db.refresh(wf)
    return WorkflowOut(
        id=wf.id, name=wf.name, framework=wf.framework,
        description=wf.description, is_active=wf.is_active,
        created_at=wf.created_at.isoformat(),
    )


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------


@router.get("/notifications", response_model=list[NotificationOut])
def list_notifications(
    unread_only: bool = Query(False, description="Only show unread"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Notification).filter(Notification.user_id == current_user.id)
    if unread_only:
        q = q.filter(Notification.read.is_(False))
    notifications = q.order_by(Notification.created_at.desc()).limit(50).all()
    return [
        NotificationOut(
            id=n.id, title=n.title, message=n.message,
            type=n.type, resource_type=n.resource_type,
            resource_id=n.resource_id, read=n.read,
            created_at=n.created_at.isoformat(),
        )
        for n in notifications
    ]


@router.post("/notifications/{notification_id}/read")
def mark_notification_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    n = db.query(Notification).filter(
        Notification.id == notification_id,
        Notification.user_id == current_user.id,
    ).first()
    if not n:
        raise HTTPException(status_code=404, detail="Notification not found")
    n.read = True
    db.commit()
    return {"message": "Notification marked as read."}


@router.post("/notifications/read-all")
def mark_all_notifications_read(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.read.is_(False),
    ).update({"read": True})
    db.commit()
    return {"message": "All notifications marked as read."}


# ---------------------------------------------------------------------------
# Workflow CRUD
# ---------------------------------------------------------------------------


@router.get("/{workflow_id}", response_model=WorkflowOut)
def get_workflow(
    workflow_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    wf = db.query(Workflow).filter(
        Workflow.id == workflow_id,
        Workflow.organization_id == current_user.organization_id,
    ).first()
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    steps = [
        WorkflowStepSchema(
            id=s.id, name=s.name, order=s.order,
            assigned_role=s.assigned_role, step_type=s.step_type, config=s.config,
        )
        for s in wf.steps
    ]
    transitions = [
        WorkflowTransitionSchema(
            id=t.id, source_step_id=t.source_step_id, target_step_id=t.target_step_id,
            condition_type=t.condition_type, condition_config=t.condition_config,
        )
        for t in wf.transitions
    ]
    return WorkflowOut(
        id=wf.id, name=wf.name, framework=wf.framework,
        description=wf.description, is_active=wf.is_active,
        created_at=wf.created_at.isoformat(),
        steps=steps, transitions=transitions,
    )


@router.post("/{workflow_id}/steps", response_model=WorkflowStepSchema, status_code=status.HTTP_201_CREATED)
def add_workflow_step(
    workflow_id: int,
    req: WorkflowStepCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    wf = db.query(Workflow).filter(
        Workflow.id == workflow_id,
        Workflow.organization_id == current_user.organization_id,
    ).first()
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")

    step = WorkflowStep(
        workflow_id=workflow_id,
        name=req.name,
        order=req.order,
        assigned_role=req.assigned_role,
        step_type=req.step_type,
        config=req.config,
    )
    db.add(step)
    db.flush()
    log_audit(db, current_user.id, "workflow_step_add", "workflow_step", step.id,
              f"Added step '{step.name}' to workflow '{wf.name}'")
    db.commit()
    db.refresh(step)
    return WorkflowStepSchema(
        id=step.id, name=step.name, order=step.order,
        assigned_role=step.assigned_role, step_type=step.step_type, config=step.config,
    )


@router.post("/{workflow_id}/transitions", response_model=WorkflowTransitionSchema, status_code=status.HTTP_201_CREATED)
def add_workflow_transition(
    workflow_id: int,
    req: WorkflowTransitionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    wf = db.query(Workflow).filter(
        Workflow.id == workflow_id,
        Workflow.organization_id == current_user.organization_id,
    ).first()
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")

    transition = WorkflowTransition(
        workflow_id=workflow_id,
        source_step_id=req.source_step_id,
        target_step_id=req.target_step_id,
        condition_type=req.condition_type,
        condition_config=req.condition_config,
    )
    db.add(transition)
    db.flush()
    log_audit(db, current_user.id, "workflow_transition_add", "workflow_transition", transition.id,
              f"Added transition to workflow '{wf.name}'")
    db.commit()
    db.refresh(transition)
    return WorkflowTransitionSchema(
        id=transition.id, source_step_id=transition.source_step_id,
        target_step_id=transition.target_step_id,
        condition_type=transition.condition_type,
        condition_config=transition.condition_config,
    )


# ---------------------------------------------------------------------------
# Workflow Instances
# ---------------------------------------------------------------------------


@router.get("/instances", response_model=list[WorkflowInstanceOut])
def list_workflow_instances(
    status_filter: str | None = Query(None, description="Filter by status"),
    document_id: int | None = Query(None, description="Filter by document"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = (
        db.query(WorkflowInstance)
        .join(Document, WorkflowInstance.document_id == Document.id)
        .filter(Document.organization_id == current_user.organization_id)
    )
    if status_filter:
        q = q.filter(WorkflowInstance.status == status_filter)
    if document_id:
        q = q.filter(WorkflowInstance.document_id == document_id)
    instances = q.order_by(WorkflowInstance.created_at.desc()).all()

    result = []
    for inst in instances:
        doc = db.query(Document).filter(Document.id == inst.document_id).first()
        wf = db.query(Workflow).filter(Workflow.id == inst.workflow_id).first()
        step = db.query(WorkflowStep).filter(WorkflowStep.id == inst.current_step_id).first() if inst.current_step_id else None
        result.append(WorkflowInstanceOut(
            id=inst.id,
            document_id=inst.document_id,
            document_name=doc.original_filename if doc else "",
            scan_id=inst.scan_id,
            workflow_id=inst.workflow_id,
            workflow_name=wf.name if wf else "",
            current_step_id=inst.current_step_id,
            current_step_name=step.name if step else "",
            current_step_role=step.assigned_role if step else None,
            status=inst.status,
            created_at=inst.created_at.isoformat(),
            updated_at=inst.updated_at.isoformat(),
            completed_at=inst.completed_at.isoformat() if inst.completed_at else None,
        ))
    return result


@router.get("/instances/{instance_id}", response_model=WorkflowInstanceOut)
def get_workflow_instance(
    instance_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    inst = (
        db.query(WorkflowInstance)
        .join(Document, WorkflowInstance.document_id == Document.id)
        .filter(
            WorkflowInstance.id == instance_id,
            Document.organization_id == current_user.organization_id,
        )
        .first()
    )
    if not inst:
        raise HTTPException(status_code=404, detail="Workflow instance not found")

    doc = db.query(Document).filter(Document.id == inst.document_id).first()
    wf = db.query(Workflow).filter(Workflow.id == inst.workflow_id).first()
    step = db.query(WorkflowStep).filter(WorkflowStep.id == inst.current_step_id).first() if inst.current_step_id else None
    return WorkflowInstanceOut(
        id=inst.id,
        document_id=inst.document_id,
        document_name=doc.original_filename if doc else "",
        scan_id=inst.scan_id,
        workflow_id=inst.workflow_id,
        workflow_name=wf.name if wf else "",
        current_step_id=inst.current_step_id,
        current_step_name=step.name if step else "",
        current_step_role=step.assigned_role if step else None,
        status=inst.status,
        created_at=inst.created_at.isoformat(),
        updated_at=inst.updated_at.isoformat(),
        completed_at=inst.completed_at.isoformat() if inst.completed_at else None,
    )


# ---------------------------------------------------------------------------
# Workflow Tasks (user-facing task queue)
# ---------------------------------------------------------------------------


@router.get("/tasks", response_model=list[WorkflowTaskOut])
def list_workflow_tasks(
    status_filter: str | None = Query(None, description="Filter by status"),
    instance_id: int | None = Query(None, description="Filter by instance"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = (
        db.query(WorkflowTask)
        .join(WorkflowInstance, WorkflowTask.instance_id == WorkflowInstance.id)
        .join(Document, WorkflowInstance.document_id == Document.id)
        .filter(Document.organization_id == current_user.organization_id)
    )
    q = q.filter(WorkflowTask.assigned_to == current_user.id)
    if status_filter:
        q = q.filter(WorkflowTask.status == status_filter)
    if instance_id:
        q = q.filter(WorkflowTask.instance_id == instance_id)
    tasks = q.order_by(WorkflowTask.created_at.desc()).all()

    result = []
    for t in tasks:
        step = db.query(WorkflowStep).filter(WorkflowStep.id == t.step_id).first() if t.step_id else None
        assigned_user = db.query(User).filter(User.id == t.assigned_to).first() if t.assigned_to else None
        result.append(WorkflowTaskOut(
            id=t.id,
            instance_id=t.instance_id,
            step_id=t.step_id,
            step_name=step.name if step else "",
            assigned_to=t.assigned_to,
            assigned_to_name=assigned_user.name if assigned_user else "",
            status=t.status,
            notes=t.notes,
            completed_by=t.completed_by,
            created_at=t.created_at.isoformat(),
            completed_at=t.completed_at.isoformat() if t.completed_at else None,
        ))
    return result


@router.get("/tasks/{task_id}", response_model=WorkflowTaskOut)
def get_workflow_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = (
        db.query(WorkflowTask)
        .join(WorkflowInstance, WorkflowTask.instance_id == WorkflowInstance.id)
        .join(Document, WorkflowInstance.document_id == Document.id)
        .filter(
            WorkflowTask.id == task_id,
            Document.organization_id == current_user.organization_id,
        )
        .first()
    )
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    step = db.query(WorkflowStep).filter(WorkflowStep.id == task.step_id).first() if task.step_id else None
    assigned_user = db.query(User).filter(User.id == task.assigned_to).first() if task.assigned_to else None
    return WorkflowTaskOut(
        id=task.id,
        instance_id=task.instance_id,
        step_id=task.step_id,
        step_name=step.name if step else "",
        assigned_to=task.assigned_to,
        assigned_to_name=assigned_user.name if assigned_user else "",
        status=task.status,
        notes=task.notes,
        completed_by=task.completed_by,
        created_at=task.created_at.isoformat(),
        completed_at=task.completed_at.isoformat() if task.completed_at else None,
    )


@router.post("/tasks/{task_id}/action")
def act_on_task(
    task_id: int,
    req: WorkflowTaskAction,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    valid_statuses = {"approved", "rejected", "changes_requested"}
    if req.status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {', '.join(sorted(valid_statuses))}")

    task = (
        db.query(WorkflowTask)
        .join(WorkflowInstance, WorkflowTask.instance_id == WorkflowInstance.id)
        .join(Document, WorkflowInstance.document_id == Document.id)
        .filter(
            WorkflowTask.id == task_id,
            Document.organization_id == current_user.organization_id,
        )
        .first()
    )
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.status != "pending":
        raise HTTPException(status_code=400, detail=f"Task is already '{task.status}'")
    if task.assigned_to and task.assigned_to != current_user.id:
        raise HTTPException(status_code=403, detail="This task is not assigned to you")

    step = db.query(WorkflowStep).filter(WorkflowStep.id == task.step_id).first()
    if step and step.assigned_role and current_user.role != step.assigned_role:
        raise HTTPException(status_code=403, detail=f"Your role '{current_user.role}' does not match the required role '{step.assigned_role}' for this step")

    instance = complete_task(db, task_id, req.status, current_user.id, req.notes)
    log_audit(db, current_user.id, "workflow_task_complete", "workflow_task", task_id,
              f"Task {task_id} completed with status '{req.status}'")
    db.commit()

    return {"message": f"Task completed with status '{req.status}'.", "task_id": task_id, "status": req.status}


# ---------------------------------------------------------------------------
# Manual workflow creation (for testing / admin override)
# ---------------------------------------------------------------------------


@router.post("/instances", status_code=status.HTTP_201_CREATED)
def create_manual_workflow_instance(
    document_id: int,
    framework: str | None = Query(None, description="Framework to select workflow"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    inst = create_workflow_instance(db, document_id, None, framework)
    if not inst:
        raise HTTPException(status_code=400, detail="No matching workflow found for this document/framework.")
    log_audit(db, current_user.id, "workflow_instance_create", "workflow_instance", inst.id,
              f"Created workflow instance for document {document_id}")
    db.commit()
    return {"message": "Workflow instance created.", "instance_id": inst.id}
