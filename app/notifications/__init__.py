import logging

from sqlalchemy.orm import Session

from app.config import settings
from app.models import Document, Notification, ReviewTask, User, Violation

from .email import send_email
from .slack import send_slack_message

logger = logging.getLogger(__name__)


def _task_context(db: Session, task: ReviewTask, assigner: User | None = None) -> dict:
    doc = db.query(Document).filter(Document.id == task.document_id).first()
    violation = db.query(Violation).filter(
        Violation.scan_id == task.scan_id, Violation.rule_id == task.rule_id
    ).first()
    return {
        "doc_name": doc.original_filename or doc.filename if doc else "Unknown",
        "rule_name": task.rule_name,
        "framework": task.framework,
        "severity": violation.severity if violation else "N/A",
        "assigned_by": assigner.name if assigner else task.assigned_by or "N/A",
        "due_date": task.due_date.strftime("%d %B %Y") if task.due_date else "Not set",
        "notes": task.notes,
    }


def _status_label(status: str) -> str:
    return {
        "approved": "Approved",
        "false_positive": "Resolved (False Positive)",
        "needs_fix": "Rejected (Needs Fix)",
    }.get(status, status)


def notify_assigned(db: Session, task: ReviewTask, assignee: User, assigner: User):
    ctx = _task_context(db, task, assigner)

    note_section = f"\nNote:\n{ctx['notes']}\n" if ctx["notes"] else ""

    db.add(Notification(
        user_id=assignee.id,
        title="New Review Assigned",
        message=(
            f"Assigned By: {ctx['assigned_by']}\n"
            f"Document: {ctx['doc_name']}\n"
            f"Framework: {ctx['framework']}\n"
            f"Violation: {ctx['rule_name']}\n"
            f"Priority: {ctx['severity']}\n"
            f"Due: {ctx['due_date']}"
        ),
        type="review_assigned",
        resource_type="review_task",
        resource_id=task.id,
    ))

    review_url = f"{settings.app_url}/compliance/review?task_id={task.id}"

    body = (
        f"New Compliance Review Assigned\n\n"
        f"Assigned By:\n"
        f"{ctx['assigned_by']}\n\n"
        f"Document:\n"
        f"{ctx['doc_name']}\n\n"
        f"Framework:\n"
        f"{ctx['framework']}\n\n"
        f"Violation:\n"
        f"{ctx['rule_name']}\n\n"
        f"Priority:\n"
        f"{ctx['severity']}\n\n"
        f"Due Date:\n"
        f"{ctx['due_date']}"
        f"{note_section}"
        f"\n\nOpen Review: {review_url}"
    )
    html_body = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1f2937;padding:24px;">
<table cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
<tr><td style="background:#2563eb;padding:20px 24px;">
<h1 style="margin:0;font-size:18px;color:#fff;">New Compliance Review Assigned</h1>
</td></tr>
<tr><td style="padding:24px;">
<table cellpadding="0" cellspacing="0" style="width:100%;">
<tr><td style="padding:6px 0;color:#6b7280;font-size:13px;width:120px;">Assigned By</td><td style="padding:6px 0;font-size:14px;">{ctx['assigned_by']}</td></tr>
<tr><td style="padding:6px 0;color:#6b7280;font-size:13px;width:120px;">Document</td><td style="padding:6px 0;font-size:14px;">{ctx['doc_name']}</td></tr>
<tr><td style="padding:6px 0;color:#6b7280;font-size:13px;width:120px;">Framework</td><td style="padding:6px 0;font-size:14px;">{ctx['framework']}</td></tr>
<tr><td style="padding:6px 0;color:#6b7280;font-size:13px;width:120px;">Violation</td><td style="padding:6px 0;font-size:14px;">{ctx['rule_name']}</td></tr>
<tr><td style="padding:6px 0;color:#6b7280;font-size:13px;width:120px;">Priority</td><td style="padding:6px 0;font-size:14px;">{ctx['severity']}</td></tr>
<tr><td style="padding:6px 0;color:#6b7280;font-size:13px;width:120px;">Due Date</td><td style="padding:6px 0;font-size:14px;">{ctx['due_date']}</td></tr>
</table>
<p style="margin-top:24px;text-align:center;">
<a href="{review_url}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600;">Open Review →</a>
</p>
</td></tr>
</table>
</body>
</html>"""

    slack_text = (
        f"*New Review Assigned*\n"
        f"Document: {ctx['doc_name']}\n"
        f"Framework: {ctx['framework']}\n"
        f"Rule: {ctx['rule_name']}\n"
        f"Priority: {ctx['severity']}\n"
        f"Due: {ctx['due_date']}\n"
        f"Assigned: {assignee.name}"
    )

    if assignee.email:
        send_email(to=assignee.email, subject=f"New Review Assigned: {ctx['rule_name']}", body=body, html_body=html_body)
    send_slack_message(slack_text)


def notify_resolved(db: Session, task: ReviewTask, reviewer: User | None = None):
    ctx = _task_context(db, task)
    status = _status_label(task.status)
    subject = f"Review {status}: {ctx['rule_name']}"

    reviewed_by = f"\n\nNote:\n{ctx['notes']}\n" if ctx["notes"] else ""
    reviewer_line = f"\nReviewed By:\n{reviewer.name}\n" if reviewer else ""

    body = (
        f"Compliance Review {status}\n\n"
        f"Document:\n{ctx['doc_name']}\n\n"
        f"Framework:\n{ctx['framework']}\n\n"
        f"Violation:\n{ctx['rule_name']}\n\n"
        f"Priority:\n{ctx['severity']}"
        f"{reviewer_line}"
        f"{reviewed_by}"
        f"\nStatus: {status}"
    )
    slack_text = (
        f"✅ Violation Resolved\n"
        f"Document: {ctx['doc_name']}\n"
        f"Framework: {ctx['framework']}\n"
        f"Rule: {ctx['rule_name']}\n"
        f"Priority: {ctx['severity']}\n"
        f"Status: {status}"
    )

    assignee = db.query(User).filter(User.id == task.assigned_to_id).first() if task.assigned_to_id else None
    if assignee:
        send_email(to=assignee.email, subject=subject, body=body)
    send_slack_message(slack_text)


def notify_overdue(db: Session, task: ReviewTask):
    ctx = _task_context(db, task)
    subject = f"Overdue: {ctx['rule_name']}"
    body = (
        f"Compliance Review Overdue\n\n"
        f"Document: {ctx['doc_name']}\n"
        f"Violation: {ctx['rule_name']}\n"
        f"Due Date: {ctx['due_date']}\n\n"
        f"Please review as soon as possible."
    )
    slack_text = (
        f"⚠️ Review Overdue\n"
        f"Document: {ctx['doc_name']}\n"
        f"Rule: {ctx['rule_name']}\n"
        f"Due: {ctx['due_date']}"
    )

    assignee = db.query(User).filter(User.id == task.assigned_to_id).first() if task.assigned_to_id else None
    if assignee:
        send_email(to=assignee.email, subject=subject, body=body)
    send_slack_message(slack_text)
