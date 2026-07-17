import logging

from sqlalchemy.orm import Session

from app.config import settings
from app.models import Document, Notification, ReviewTask, User, Violation

from .email import send_email
from .slack import send_slack_message

logger = logging.getLogger(__name__)

STATUS_EMAIL_CONFIG = {
    "approved": {
        "subject": "Review Approved: {rule_name}",
        "badge": "Approved",
        "badge_color": "#16a34a",
        "icon": "✅",
        "slack_icon": "✅",
    },
    "resolved": {
        "subject": "Violation Resolved: {rule_name}",
        "badge": "Resolved",
        "badge_color": "#16a34a",
        "icon": "✅",
        "slack_icon": "✅",
    },
    "dismissed": {
        "subject": "Finding Dismissed: {rule_name}",
        "badge": "Dismissed (False Positive)",
        "badge_color": "#6b7280",
        "icon": "🚫",
        "slack_icon": "🚫",
    },
    "changes_requested": {
        "subject": "Changes Requested: {rule_name}",
        "badge": "Changes Requested",
        "badge_color": "#f59e0b",
        "icon": "✏️",
        "slack_icon": "✏️",
    },
}


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


def _document_owner(db: Session, document_id: int) -> User | None:
    doc = db.query(Document).filter(Document.id == document_id).first()
    if doc and doc.user_id:
        return db.query(User).filter(User.id == doc.user_id).first()
    return None


def _compliance_managers(db: Session, org_id: int) -> list[User]:
    return db.query(User).filter(
        User.organization_id == org_id,
        User.role.in_(["compliance_manager", "admin"]),
        User.is_active.is_(True),
    ).all()


def _in_app_notification(db: Session, user_id: int, title: str, message: str, type: str, resource_id: int | None = None):
    db.add(Notification(
        user_id=user_id,
        title=title,
        message=message,
        type=type,
        resource_type="review_task",
        resource_id=resource_id,
    ))


def _email_html_template(title: str, badge: str, badge_color: str, rows: list[tuple[str, str]], cta_url: str | None = None, cta_text: str | None = None, notes: str | None = None) -> str:
    rows_html = "".join(
        f'<tr><td style="padding:6px 0;color:#6b7280;font-size:13px;width:120px;">{label}</td><td style="padding:6px 0;font-size:14px;">{value}</td></tr>'
        for label, value in rows
    )
    badge_html = f'<span style="display:inline-block;background:{badge_color};color:#fff;padding:4px 12px;border-radius:12px;font-size:13px;font-weight:600;">{badge}</span>'
    note_html = f'<tr><td colspan="2" style="padding:12px 0 0;font-size:13px;color:#6b7280;border-top:1px solid #e5e7eb;">Note: {notes}</td></tr>' if notes else ""
    cta_html = f'<p style="margin-top:24px;text-align:center;"><a href="{cta_url}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600;">{cta_text} →</a></p>' if cta_url and cta_text else ""
    return f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1f2937;padding:24px;">
<table cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
<tr><td style="background:#2563eb;padding:20px 24px;">
<h1 style="margin:0;font-size:18px;color:#fff;">{title}</h1>
</td></tr>
<tr><td style="padding:24px;">
{badge_html}
<table cellpadding="0" cellspacing="0" style="width:100%;margin-top:16px;">
{rows_html}
{note_html}
</table>
{cta_html}
</td></tr>
</table>
</body>
</html>"""


def notify_assigned(db: Session, task: ReviewTask, assignee: User, assigner: User):
    ctx = _task_context(db, task, assigner)

    note_section = f"\nNote:\n{ctx['notes']}\n" if ctx["notes"] else ""

    _in_app_notification(db, assignee.id,
        "New Review Assigned",
        f"Assigned By: {ctx['assigned_by']}\nDocument: {ctx['doc_name']}\nFramework: {ctx['framework']}\nViolation: {ctx['rule_name']}\nPriority: {ctx['severity']}\nDue: {ctx['due_date']}",
        "review_assigned", task.id)

    review_url = f"{settings.app_url}/compliance/review?task_id={task.id}"

    rows = [
        ("Assigned By", ctx["assigned_by"]),
        ("Document", ctx["doc_name"]),
        ("Framework", ctx["framework"]),
        ("Violation", ctx["rule_name"]),
        ("Priority", ctx["severity"]),
        ("Due Date", ctx["due_date"]),
    ]
    body = (
        f"New Compliance Review Assigned\n\n"
        f"Assigned By:\n{ctx['assigned_by']}\n\n"
        f"Document:\n{ctx['doc_name']}\n\n"
        f"Framework:\n{ctx['framework']}\n\n"
        f"Violation:\n{ctx['rule_name']}\n\n"
        f"Priority:\n{ctx['severity']}\n\n"
        f"Due Date:\n{ctx['due_date']}"
        f"{note_section}"
        f"\n\nOpen Review: {review_url}"
    )
    html_body = _email_html_template(
        "New Compliance Review Assigned", "Assigned", "#2563eb", rows,
        review_url, "Open Review", ctx.get("notes"),
    )

    slack_text = (
        f":clipboard: *New Review Assigned*\n"
        f"Document: {ctx['doc_name']}\n"
        f"Framework: {ctx['framework']}\n"
        f"Rule: {ctx['rule_name']}\n"
        f"Priority: {ctx['severity']}\n"
        f"Due: {ctx['due_date']}\n"
        f"Assigned to: {assignee.name}"
    )

    is_self_claim = assignee.id == assigner.id
    if assignee.email and not is_self_claim:
        send_email(to=assignee.email, subject=f"New Review Assigned: {ctx['rule_name']}", body=body, html_body=html_body)
    elif is_self_claim:
        logger.info("Skipping email for self-claim by user %s", assignee.id)
    send_slack_message(
        slack_text,
        framework=ctx["framework"],
        actions=[
            {"type": "button", "text": {"type": "plain_text", "text": "Open Review"}, "url": review_url},
        ],
    )


def notify_resolved(db: Session, task: ReviewTask, reviewer: User | None = None):
    ctx = _task_context(db, task)
    cfg = STATUS_EMAIL_CONFIG.get(task.status, {})
    badge = cfg.get("badge", task.status.title())
    badge_color = cfg.get("badge_color", "#6b7280")
    subject = cfg.get("subject", "Review {status}").format(**ctx) if cfg else f"Review {task.status.title()}: {ctx['rule_name']}"
    slack_icon = cfg.get("slack_icon", "✅")

    reviewer_line = f"\nReviewed By:\n{reviewer.name}\n" if reviewer else ""
    note_section = f"\nNote:\n{ctx['notes']}\n" if ctx["notes"] else ""
    status_label = cfg.get("badge", task.status.title())

    body = (
        f"Compliance Review {status_label}\n\n"
        f"Document:\n{ctx['doc_name']}\n\n"
        f"Framework:\n{ctx['framework']}\n\n"
        f"Violation:\n{ctx['rule_name']}\n\n"
        f"Priority:\n{ctx['severity']}"
        f"{reviewer_line}"
        f"{note_section}"
        f"\nStatus: {status_label}"
    )

    slack_text = (
        f"{slack_icon} *Review {badge}*\n"
        f"Document: {ctx['doc_name']}\n"
        f"Framework: {ctx['framework']}\n"
        f"Rule: {ctx['rule_name']}\n"
        f"Priority: {ctx['severity']}\n"
        f"Status: {badge}"
    )

    rows = [
        ("Document", ctx["doc_name"]),
        ("Framework", ctx["framework"]),
        ("Violation", ctx["rule_name"]),
        ("Priority", ctx["severity"]),
    ]
    if reviewer:
        rows.append(("Reviewed By", reviewer.name))

    review_url = f"{settings.app_url}/compliance/review?task_id={task.id}"
    html_body = _email_html_template(
        f"Compliance Review {status_label}", badge, badge_color, rows,
        review_url, "View Review", ctx.get("notes"),
    )

    # Slack with action button + framework routing
    send_slack_message(
        slack_text,
        framework=ctx["framework"],
        actions=[
            {"type": "button", "text": {"type": "plain_text", "text": "Open Review"}, "url": review_url},
        ],
    )

    # Recipient: document owner
    owner = _document_owner(db, task.document_id)
    if owner and owner.email:
        send_email(to=owner.email, subject=subject, body=body, html_body=html_body)
        _in_app_notification(db, owner.id,
            f"Review {status_label}: {ctx['rule_name']}",
            f"Document: {ctx['doc_name']}\nStatus: {status_label}\nReviewed By: {reviewer.name if reviewer else 'System'}",
            "review_resolved", task.id)

    # Also notify compliance managers for approved/rejected
    if task.status in ("approved", "dismissed", "resolved"):
        doc = db.query(Document).filter(Document.id == task.document_id).first()
        org_id = doc.organization_id if doc else None
        if org_id:
            for cm in _compliance_managers(db, org_id):
                if cm.id != (owner.id if owner else -1):
                    _in_app_notification(db, cm.id,
                        f"Review {status_label}: {ctx['rule_name']}",
                        f"Document: {ctx['doc_name']}\nStatus: {status_label}\nReviewed By: {reviewer.name if reviewer else 'System'}",
                        "review_resolved", task.id)


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
    html_body = _email_html_template(
        "Compliance Review Overdue", "Overdue", "#dc2626", [
            ("Document", ctx["doc_name"]),
            ("Violation", ctx["rule_name"]),
            ("Due Date", ctx["due_date"]),
        ],
        cta_url=f"{settings.app_url}/compliance/review?task_id={task.id}",
        cta_text="View Review",
    )
    slack_text = (
        f"⚠️ *Review Overdue*\n"
        f"Document: {ctx['doc_name']}\n"
        f"Rule: {ctx['rule_name']}\n"
        f"Due: {ctx['due_date']}"
    )

    assignee = db.query(User).filter(User.id == task.assigned_to_id).first() if task.assigned_to_id else None
    if assignee:
        send_email(to=assignee.email, subject=subject, body=body, html_body=html_body)
        _in_app_notification(db, assignee.id,
            f"Review Overdue: {ctx['rule_name']}",
            f"Document: {ctx['doc_name']}\nDue: {ctx['due_date']}",
            "review_overdue", task.id)
    send_slack_message(
        slack_text,
        framework=ctx["framework"],
        actions=[
            {"type": "button", "text": {"type": "plain_text", "text": "View Review"}, "url": f"{settings.app_url}/compliance/review?task_id={task.id}"},
        ],
    )


def notify_upload_complete(db: Session, document: Document):
    org_id = document.organization_id
    if not org_id:
        return
    for cm in _compliance_managers(db, org_id):
        _in_app_notification(db, cm.id,
            "Document Uploaded",
            f"Document: {document.original_filename or document.filename} has been uploaded and is being scanned.",
            "upload_complete", document.id)
        if cm.email:
            send_email(
                to=cm.email,
                subject=f"Document Uploaded: {document.original_filename or document.filename}",
                body=f"A new document has been uploaded and is being scanned.\n\nDocument: {document.original_filename or document.filename}\n\nIt will be available for review once the scan completes.",
                html_body=_email_html_template(
                    "Document Uploaded", "Uploaded", "#2563eb", [
                        ("Document", document.original_filename or document.filename),
                    ],
                    cta_url=f"{settings.app_url}/documents/{document.id}",
                    cta_text="View Document",
                ),
            )

    doc_name = document.original_filename or document.filename
    frameworks_raw = document.frameworks or "[]"
    try:
        import json
        frameworks = json.loads(frameworks_raw)
    except (json.JSONDecodeError, TypeError):
        frameworks = []
    first_framework = frameworks[0] if frameworks else None

    send_slack_message(
        f":arrow_up: *Document Uploaded*\nDocument: {doc_name}\nFrameworks: {', '.join(frameworks) if frameworks else 'N/A'}",
        framework=first_framework,
        actions=[
            {"type": "button", "text": {"type": "plain_text", "text": "View Document"}, "url": f"{settings.app_url}/documents/{document.id}"},
        ],
    )


def notify_scan_complete(db: Session, document: Document, scan_framework: str):
    owner = _document_owner(db, document.id)
    if owner and owner.email:
        send_email(
            to=owner.email,
            subject=f"Scan Complete: {document.original_filename or document.filename} ({scan_framework})",
            body=f"The compliance scan for {scan_framework} has completed.\n\nDocument: {document.original_filename or document.filename}\n\nReview any findings in the compliance dashboard.",
            html_body=_email_html_template(
                "Scan Complete", "Complete", "#16a34a", [
                    ("Document", document.original_filename or document.filename),
                    ("Framework", scan_framework),
                ],
                cta_url=f"{settings.app_url}/compliance/review",
                cta_text="View Findings",
            ),
        )
        _in_app_notification(db, owner.id,
            f"Scan Complete: {scan_framework}",
            f"Document: {document.original_filename or document.filename}\nFramework: {scan_framework}",
            "scan_complete", document.id)

    doc_name = document.original_filename or document.filename
    send_slack_message(
        f":white_check_mark: *Scan Complete*\nDocument: {doc_name}\nFramework: {scan_framework}",
        framework=scan_framework,
        actions=[
            {"type": "button", "text": {"type": "plain_text", "text": "View Findings"}, "url": f"{settings.app_url}/compliance/review"},
        ],
    )


def notify_remediation_created(db: Session, violation: Violation, document: Document):
    owner = _document_owner(db, document.id)
    if owner and owner.email:
        send_email(
            to=owner.email,
            subject=f"Remediation Suggestion Available: {violation.title}",
            body=f"A remediation suggestion has been generated for a violation in your document.\n\nDocument: {document.original_filename or document.filename}\nViolation: {violation.title}\nSeverity: {violation.severity}\n\nReview and apply the suggestion in the compliance dashboard.",
            html_body=_email_html_template(
                "Remediation Suggestion Available", "Suggestion", "#f59e0b", [
                    ("Document", document.original_filename or document.filename),
                    ("Violation", violation.title),
                    ("Severity", violation.severity),
                ],
                cta_url=f"{settings.app_url}/documents/{document.id}",
                cta_text="View Suggestion",
            ),
        )
        _in_app_notification(db, owner.id,
            f"Remediation Suggestion: {violation.title}",
            f"A remediation suggestion is available for violation '{violation.title}' in {document.original_filename or document.filename}.",
            "remediation_created", violation.id)


def notify_account_created(db: Session, user: User, temp_password: str | None = None):
    subject = "Welcome to AuthDoc"
    body = f"""Welcome to AuthDoc!

Your account has been created.

Email: {user.email}
Role: {user.role}
{f"Temporary Password: {temp_password}" if temp_password else ""}

Login at: {settings.app_url}/login

We recommend changing your password after first login."""

    html_body = _email_html_template(
        "Welcome to AuthDoc", "Account Created", "#2563eb", [
            ("Email", user.email),
            ("Role", user.role),
        ],
        cta_url=f"{settings.app_url}/login",
        cta_text="Login Now",
        notes=f"Temporary Password: {temp_password}" if temp_password else None,
    )

    if user.email:
        send_email(to=user.email, subject=subject, body=body, html_body=html_body)

    _in_app_notification(db, user.id,
        "Welcome to AuthDoc",
        f"Your account has been created with role: {user.role}.",
        "account_created")


def notify_auto_resubmitted(db: Session, task: ReviewTask, reviewer: User | None = None):
    """Notify reviewer and document owner that a changes_requested task auto-resubmitted after a new version was uploaded and the violation was fixed."""
    ctx = _task_context(db, task)
    owner = _document_owner(db, task.document_id)

    review_url = f"{settings.app_url}/compliance/review?task_id={task.id}"

    if reviewer and reviewer.email:
        send_email(
            to=reviewer.email,
            subject=f"Document Updated for Review: {ctx['rule_name']}",
            body=f"The document has been updated and the violation appears to be fixed. Please verify.\n\nDocument: {ctx['doc_name']}\nRule: {ctx['rule_name']}\n\nOpen Review: {review_url}",
            html_body=_email_html_template(
                "Document Updated — Ready for Review", "Ready for Review", "#2563eb", [
                    ("Document", ctx["doc_name"]),
                    ("Rule", ctx["rule_name"]),
                    ("Framework", ctx["framework"]),
                ],
                cta_url=review_url, cta_text="Open Review",
            ),
        )
        _in_app_notification(db, reviewer.id,
            f"Ready for Review: {ctx['rule_name']}",
            f"The document '{ctx['doc_name']}' has been updated. Please verify the fix.",
            "review_resubmitted", task.id)

    if owner and owner.email and (not reviewer or owner.id != reviewer.id):
        send_email(
            to=owner.email,
            subject=f"Document Resubmitted: {ctx['rule_name']}",
            body=f"Your document update has been uploaded and the violation appears fixed. A reviewer will verify shortly.\n\nDocument: {ctx['doc_name']}\nRule: {ctx['rule_name']}",
            html_body=_email_html_template(
                "Document Resubmitted for Review", "Resubmitted", "#f59e0b", [
                    ("Document", ctx["doc_name"]),
                    ("Rule", ctx["rule_name"]),
                ],
                cta_url=review_url, cta_text="View Status",
            ),
        )

    send_slack_message(
        f"🔄 *Document Resubmitted*\n"
        f"Document: {ctx['doc_name']}\n"
        f"Rule: {ctx['rule_name']}\n"
        f"Status: Awaiting Review Verification",
        framework=ctx["framework"],
        actions=[
            {"type": "button", "text": {"type": "plain_text", "text": "Open Review"}, "url": review_url},
        ],
    )


def notify_changes_requested(db: Session, task: ReviewTask, reviewer: User):
    """Notify document owner that changes were requested on their document."""
    ctx = _task_context(db, task, reviewer)
    owner = _document_owner(db, task.document_id)
    review_url = f"{settings.app_url}/compliance/review?task_id={task.id}"

    if owner:
        if owner.email:
            send_email(
                to=owner.email,
                subject=f"Changes Requested: {ctx['rule_name']}",
                body=f"A reviewer has requested changes to your document.\n\nDocument: {ctx['doc_name']}\nReviewer: {reviewer.name}\nRule: {ctx['rule_name']}\nFramework: {ctx['framework']}\n\n{('Note: ' + ctx['notes']) if ctx['notes'] else ''}\n\nPlease update your document and upload a new version.",
                html_body=_email_html_template(
                    "Changes Requested on Your Document", "Changes Requested", "#f59e0b", [
                        ("Document", ctx["doc_name"]),
                        ("Reviewer", reviewer.name),
                        ("Rule", ctx["rule_name"]),
                        ("Framework", ctx["framework"]),
                    ],
                    cta_url=f"{settings.app_url}/documents/{task.document_id}",
                    cta_text="Upload New Version",
                    notes=ctx.get("notes"),
                ),
            )

        note = f"\nNote: {ctx['notes']}" if ctx['notes'] else ""
        _in_app_notification(db, owner.id,
            f"Changes Requested: {ctx['rule_name']}",
            f"Reviewer {reviewer.name} requested changes on '{ctx['doc_name']}'.\nRule: {ctx['rule_name']}{note}",
            "changes_requested", task.id)

    send_slack_message(
        f"✏️ *Changes Requested*\n"
        f"Document: {ctx['doc_name']}\n"
        f"Reviewer: {reviewer.name}\n"
        f"Rule: {ctx['rule_name']}",
        framework=ctx["framework"],
        actions=[
            {"type": "button", "text": {"type": "plain_text", "text": "Upload New Version"}, "url": f"{settings.app_url}/documents/{task.document_id}"},
        ],
    )

    # Notify compliance managers
    doc = db.query(Document).filter(Document.id == task.document_id).first()
    org_id = doc.organization_id if doc else None
    if org_id:
        for cm in _compliance_managers(db, org_id):
            if cm.id != (owner.id if owner else -1) and cm.id != reviewer.id:
                _in_app_notification(db, cm.id,
                    f"Changes Requested: {ctx['rule_name']}",
                    f"Reviewer {reviewer.name} requested changes on '{ctx['doc_name']}'.\nRule: {ctx['rule_name']}",
                    "changes_requested", task.id)
