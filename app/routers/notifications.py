import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import Document, ReviewTask, User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.post("/check-overdue", summary="Send reminders for overdue review tasks")
def check_overdue(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    now = datetime.now(timezone.utc)
    overdue = (
        db.query(ReviewTask)
        .join(Document, ReviewTask.document_id == Document.id)
        .filter(
            ReviewTask.due_date < now,
            ReviewTask.status == "pending_review",
            ReviewTask.assigned_to.isnot(None),
            Document.organization_id == current_user.organization_id,
        )
        .all()
    )

    from app.notifications import notify_overdue

    sent = 0
    for task in overdue:
        notify_overdue(db, task)
        sent += 1

    return {"overdue_count": len(overdue), "notifications_sent": sent}
