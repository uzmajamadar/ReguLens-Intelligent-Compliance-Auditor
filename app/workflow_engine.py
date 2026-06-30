"""
workflow_engine.py — Core workflow engine: create instances, advance steps,
evaluate conditions, auto-assign tasks, and create notifications.
"""
import json
import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models import (
    Document, Notification, Scan, User, Violation,
    Workflow, WorkflowInstance, WorkflowStep, WorkflowTask, WorkflowTransition,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _find_user_by_role(db: Session, role: str, organization_id: int) -> User | None:
    return db.query(User).filter(
        User.role == role,
        User.organization_id == organization_id,
        User.is_active.is_(True),
    ).first()


def _create_notification(db: Session, user_id: int, title: str, message: str | None = None,
                         type: str = "info", resource_type: str | None = None, resource_id: int | None = None):
    n = Notification(
        user_id=user_id, title=title, message=message,
        type=type, resource_type=resource_type, resource_id=resource_id,
    )
    db.add(n)
    db.flush()
    return n


def _highest_severity_for_scan(db: Session, scan_id: int) -> str:
    """Return the highest severity among violations for a scan."""
    severity_order = {"none": 0, "low": 1, "medium": 2, "high": 3, "critical": 4}
    violations = db.query(Violation).filter(Violation.scan_id == scan_id).all()
    if not violations:
        return "none"
    highest = max(violations, key=lambda v: severity_order.get(v.severity, 0))
    return highest.severity


def _evaluate_condition(transition: WorkflowTransition, scan_id: int | None, db: Session) -> bool:
    """Evaluate whether a transition's condition is met."""
    if transition.condition_type == "always":
        return True

    if transition.condition_type == "on_approve":
        return True

    if transition.condition_type == "on_reject":
        return True

    if transition.condition_type == "severity" and scan_id:
        if not transition.condition_config:
            return False
        try:
            cfg = json.loads(transition.condition_config)
        except (json.JSONDecodeError, TypeError):
            return False

        severity_map = {"none": 0, "low": 1, "medium": 2, "high": 3, "critical": 4}
        current_sev = _highest_severity_for_scan(db, scan_id)
        current_val = severity_map.get(current_sev, 0)
        threshold_val = severity_map.get(cfg.get("value", "medium"), 2)
        operator = cfg.get("operator", "gte")

        if operator == "gte":
            return current_val >= threshold_val
        elif operator == "gt":
            return current_val > threshold_val
        elif operator == "lte":
            return current_val <= threshold_val
        elif operator == "lt":
            return current_val < threshold_val
        elif operator == "eq":
            return current_val == threshold_val
        return False

    if transition.condition_type == "confidence" and scan_id:
        if not transition.condition_config:
            return False
        try:
            cfg = json.loads(transition.condition_config)
        except (json.JSONDecodeError, TypeError):
            return False

        scan = db.query(Scan).filter(Scan.id == scan_id).first()
        if not scan or scan.score is None:
            return False
        operator = cfg.get("operator", "gte")
        threshold = cfg.get("value", 50)

        if operator == "gte":
            return scan.score >= threshold
        elif operator == "gt":
            return scan.score > threshold
        elif operator == "lte":
            return scan.score <= threshold
        elif operator == "lt":
            return scan.score < threshold
        return False

    return False


def _find_workflow_for_framework(db: Session, framework: str, organization_id: int) -> Workflow | None:
    """Find the active workflow for a framework, or return the default workflow."""
    wf = db.query(Workflow).filter(
        Workflow.framework == framework,
        Workflow.organization_id == organization_id,
        Workflow.is_active.is_(True),
    ).first()
    if wf:
        return wf
    wf = db.query(Workflow).filter(
        Workflow.framework.is_(None),
        Workflow.organization_id == organization_id,
        Workflow.is_active.is_(True),
    ).first()
    return wf


def _get_first_step(workflow: Workflow) -> WorkflowStep | None:
    if workflow.steps:
        return workflow.steps[0]
    return None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def create_workflow_instance(
    db: Session,
    document_id: int,
    scan_id: int,
    framework: str | None = None,
) -> WorkflowInstance | None:
    """Create a workflow instance for a document after a scan completes.
    
    Finds the matching workflow for the given framework, creates an instance,
    and auto-assigns the first step.
    """
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        logger.warning("Cannot create workflow instance: document %d not found", document_id)
        return None

    workflow = _find_workflow_for_framework(db, framework or "", doc.organization_id)
    if not workflow:
        logger.info("No workflow found for framework '%s' — skipping workflow creation", framework)
        return None

    first_step = _get_first_step(workflow)
    instance = WorkflowInstance(
        document_id=document_id,
        scan_id=scan_id,
        workflow_id=workflow.id,
        current_step_id=first_step.id if first_step else None,
        status="active",
    )
    db.add(instance)
    db.flush()

    if first_step and first_step.assigned_role:
        _auto_assign_task(db, instance, first_step)

    logger.info(
        "Workflow instance %d created for document %d (workflow='%s', step='%s')",
        instance.id, document_id, workflow.name, first_step.name if first_step else "none",
    )
    return instance


def _auto_assign_task(db: Session, instance: WorkflowInstance, step: WorkflowStep) -> WorkflowTask | None:
    """Create a task for the given step, assigning it to a user with the matching role."""
    doc = db.query(Document).filter(Document.id == instance.document_id).first()
    if not doc:
        return None

    user = _find_user_by_role(db, step.assigned_role, doc.organization_id)
    task = WorkflowTask(
        instance_id=instance.id,
        step_id=step.id,
        assigned_to=user.id if user else None,
        status="pending",
    )
    db.add(task)
    db.flush()

    if user:
        _create_notification(
            db, user.id,
            title=f"New task: {step.name}",
            message=f"A review task '{step.name}' has been assigned to you.",
            type="task_assigned",
            resource_type="workflow_task",
            resource_id=task.id,
        )
        logger.info("Task %d created for user %d (step='%s')", task.id, user.id, step.name)
    else:
        logger.warning("No user found with role '%s' for task %d", step.assigned_role, task.id)

    return task


def complete_task(
    db: Session,
    task_id: int,
    status: str,
    completed_by: int,
    notes: str | None = None,
) -> WorkflowInstance | None:
    """Complete a workflow task and advance the workflow to the next step.
    
    Status: approved, rejected, changes_requested
    """
    task = db.query(WorkflowTask).filter(WorkflowTask.id == task_id).first()
    if not task:
        logger.warning("Task %d not found", task_id)
        return None

    task.status = status
    task.completed_by = completed_by
    task.completed_at = datetime.now(timezone.utc)
    if notes:
        task.notes = notes
    db.flush()

    instance = db.query(WorkflowInstance).filter(WorkflowInstance.id == task.instance_id).first()
    if not instance:
        return None

    advance_workflow(db, instance, task)
    return instance


def advance_workflow(db: Session, instance: WorkflowInstance, from_task: WorkflowTask | None = None):
    """Advance the workflow by finding the next valid step through transitions."""
    current_step = db.query(WorkflowStep).filter(WorkflowStep.id == instance.current_step_id).first()
    if not current_step:
        instance.status = "completed"
        instance.completed_at = datetime.now(timezone.utc)
        db.flush()
        return

    transitions = db.query(WorkflowTransition).filter(
        WorkflowTransition.workflow_id == instance.workflow_id,
        WorkflowTransition.source_step_id == current_step.id,
    ).all()

    if not transitions:
        instance.status = "completed"
        instance.completed_at = datetime.now(timezone.utc)
        db.flush()
        _notify_users_on_workflow_complete(db, instance)
        return

    next_target_id = None
    for t in transitions:
        if _evaluate_condition(t, instance.scan_id, db):
            next_target_id = t.target_step_id
            break

    if next_target_id is None:
        instance.status = "completed"
        instance.completed_at = datetime.now(timezone.utc)
        db.flush()
        _notify_users_on_workflow_complete(db, instance)
        return

    next_step = db.query(WorkflowStep).filter(WorkflowStep.id == next_target_id).first()
    if not next_step:
        instance.status = "completed"
        instance.completed_at = datetime.now(timezone.utc)
        db.flush()
        _notify_users_on_workflow_complete(db, instance)
        return

    instance.current_step_id = next_step.id
    instance.updated_at = datetime.now(timezone.utc)
    db.flush()

    if next_step.step_type == "system":
        advance_workflow(db, instance, None)
        return

    if next_step.assigned_role:
        _auto_assign_task(db, instance, next_step)

    logger.info(
        "Workflow instance %d advanced to step '%s' (id=%d)",
        instance.id, next_step.name, next_step.id,
    )


def _notify_users_on_workflow_complete(db: Session, instance: WorkflowInstance):
    """Notify the document owner and relevant users when a workflow completes."""
    doc = db.query(Document).filter(Document.id == instance.document_id).first()
    if not doc:
        return
    users = db.query(User).filter(
        User.organization_id == doc.organization_id,
        User.is_active.is_(True),
    ).all()
    for u in users:
        _create_notification(
            db, u.id,
            title="Workflow completed",
            message=f"Workflow for document '{doc.original_filename}' has been completed.",
            type="workflow_completed",
            resource_type="workflow_instance",
            resource_id=instance.id,
        )


def seed_default_workflows(db: Session, organization_id: int):
    """Seed default workflow definitions for each compliance framework."""
    if db.query(Workflow).filter(Workflow.organization_id == organization_id).count() > 0:
        return

    workflows_data = [
        {
            "name": "GDPR Review",
            "framework": "GDPR",
            "description": "Standard GDPR compliance review workflow",
            "steps": [
                {"name": "AI GDPR Scan", "order": 1, "assigned_role": None, "step_type": "system"},
                {"name": "Legal Review", "order": 2, "assigned_role": "reviewer", "step_type": "review"},
                {"name": "Compliance Approval", "order": 3, "assigned_role": "compliance_manager", "step_type": "approval"},
                {"name": "Resolved", "order": 4, "assigned_role": None, "step_type": "system"},
            ],
            "transitions": [
                {"source": 1, "target": 2, "condition_type": "always", "condition_config": None},
                {"source": 2, "target": 3, "condition_type": "on_approve", "condition_config": None},
                {"source": 2, "target": 1, "condition_type": "on_reject", "condition_config": json.dumps({"reason": "remediation_required"})},
                {"source": 3, "target": 4, "condition_type": "on_approve", "condition_config": None},
            ],
        },
        {
            "name": "Employment Equality Review",
            "framework": "HR",
            "description": "Employment equality compliance review workflow",
            "steps": [
                {"name": "AI Equality Audit", "order": 1, "assigned_role": None, "step_type": "system"},
                {"name": "HR Review", "order": 2, "assigned_role": "reviewer", "step_type": "review"},
                {"name": "Legal Review", "order": 3, "assigned_role": "reviewer", "step_type": "review"},
                {"name": "Manager Approval", "order": 4, "assigned_role": "compliance_manager", "step_type": "approval"},
                {"name": "Resolved", "order": 5, "assigned_role": None, "step_type": "system"},
            ],
            "transitions": [
                {"source": 1, "target": 2, "condition_type": "always", "condition_config": None},
                {"source": 2, "target": 3, "condition_type": "on_approve", "condition_config": None},
                {"source": 2, "target": 1, "condition_type": "on_reject", "condition_config": json.dumps({"reason": "remediation_required"})},
                {"source": 3, "target": 4, "condition_type": "on_approve", "condition_config": None},
                {"source": 3, "target": 2, "condition_type": "on_reject", "condition_config": json.dumps({"reason": "hr_changes_needed"})},
                {"source": 4, "target": 5, "condition_type": "on_approve", "condition_config": None},
            ],
        },
        {
            "name": "HIPAA Review",
            "framework": "HIPAA",
            "description": "HIPAA compliance review workflow with security focus",
            "steps": [
                {"name": "AI HIPAA Scan", "order": 1, "assigned_role": None, "step_type": "system"},
                {"name": "Security Review", "order": 2, "assigned_role": "reviewer", "step_type": "review"},
                {"name": "Compliance Approval", "order": 3, "assigned_role": "compliance_manager", "step_type": "approval"},
                {"name": "Resolved", "order": 4, "assigned_role": None, "step_type": "system"},
            ],
            "transitions": [
                {"source": 1, "target": 2, "condition_type": "always", "condition_config": None},
                {"source": 2, "target": 3, "condition_type": "on_approve", "condition_config": None},
                {"source": 2, "target": 1, "condition_type": "on_reject", "condition_config": json.dumps({"reason": "remediation_required"})},
                {"source": 3, "target": 4, "condition_type": "on_approve", "condition_config": None},
            ],
        },
        {
            "name": "Default Review",
            "framework": None,
            "description": "Generic compliance review workflow",
            "steps": [
                {"name": "AI Scan", "order": 1, "assigned_role": None, "step_type": "system"},
                {"name": "Compliance Review", "order": 2, "assigned_role": "compliance_manager", "step_type": "review"},
                {"name": "Resolved", "order": 3, "assigned_role": None, "step_type": "system"},
            ],
            "transitions": [
                {"source": 1, "target": 2, "condition_type": "always", "condition_config": None},
                {"source": 2, "target": 3, "condition_type": "on_approve", "condition_config": None},
                {"source": 2, "target": 1, "condition_type": "on_reject", "condition_config": json.dumps({"reason": "remediation_required"})},
            ],
        },
    ]

    for wf_data in workflows_data:
        workflow = Workflow(
            organization_id=organization_id,
            name=wf_data["name"],
            framework=wf_data.get("framework"),
            description=wf_data["description"],
        )
        db.add(workflow)
        db.flush()

        step_map = {}
        for step_data in wf_data["steps"]:
            step = WorkflowStep(
                workflow_id=workflow.id,
                name=step_data["name"],
                order=step_data["order"],
                assigned_role=step_data["assigned_role"],
                step_type=step_data["step_type"],
            )
            db.add(step)
            db.flush()
            step_map[step_data["order"]] = step.id

        for t_data in wf_data["transitions"]:
            source_id = step_map.get(t_data["source"])
            target_id = step_map.get(t_data["target"])
            if source_id and target_id:
                transition = WorkflowTransition(
                    workflow_id=workflow.id,
                    source_step_id=source_id,
                    target_step_id=target_id,
                    condition_type=t_data["condition_type"],
                    condition_config=t_data.get("condition_config"),
                )
                db.add(transition)

        logger.info("Seeded workflow '%s' for org %d", workflow.name, organization_id)

    db.commit()
