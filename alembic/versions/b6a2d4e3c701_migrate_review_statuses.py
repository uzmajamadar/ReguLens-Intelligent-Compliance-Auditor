"""migrate review/violation statuses to simplified set

Revision ID: b6a2d4e3c701
Revises: c8a4e3d2b601
Create Date: 2026-07-08 18:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b6a2d4e3c701'
down_revision: Union[str, Sequence[str], None] = 'c8a4e3d2b601'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


STATUS_MAP_REVIEW = {
    "pending_review": "pending",
    "pending_assignment": "pending",
    "waiting_for_fix": "approved",
    "needs_fix": "changes_requested",
}

STATUS_MAP_VIOLATION = {
    "pending_assignment": "pending",
    "pending_review": "pending",
    "waiting_for_fix": "approved",
    "needs_fix": "changed_requested",
}

STATUS_MAP_DOCUMENT = {
    "pending_review": "review_pending",
    "pending_assignment": "review_pending",
}


def upgrade() -> None:
    conn = op.get_bind()

    for old, new in STATUS_MAP_REVIEW.items():
        conn.execute(
            sa.text("UPDATE review_tasks SET status = :new WHERE status = :old"),
            {"new": new, "old": old},
        )

    for old, new in STATUS_MAP_VIOLATION.items():
        conn.execute(
            sa.text("UPDATE violations SET status = :new WHERE status = :old"),
            {"new": new, "old": old},
        )

    for old, new in STATUS_MAP_DOCUMENT.items():
        conn.execute(
            sa.text("UPDATE documents SET status = :new WHERE status = :old"),
            {"new": new, "old": old},
        )


def downgrade() -> None:
    conn = op.get_bind()

    reverse_review = {v: k for k, v in STATUS_MAP_REVIEW.items()}
    for new, old in reverse_review.items():
        conn.execute(
            sa.text("UPDATE review_tasks SET status = :old WHERE status = :new"),
            {"old": old, "new": new},
        )

    reverse_violation = {v: k for k, v in STATUS_MAP_VIOLATION.items()}
    for new, old in reverse_violation.items():
        conn.execute(
            sa.text("UPDATE violations SET status = :old WHERE status = :new"),
            {"old": old, "new": new},
        )

    reverse_document = {v: k for k, v in STATUS_MAP_DOCUMENT.items()}
    for new, old in reverse_document.items():
        conn.execute(
            sa.text("UPDATE documents SET status = :old WHERE status = :new"),
            {"old": old, "new": new},
        )
