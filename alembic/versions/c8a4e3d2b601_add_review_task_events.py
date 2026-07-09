"""add_review_task_events

Revision ID: c8a4e3d2b601
Revises: b7c9d2e1f301
Create Date: 2026-07-08 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c8a4e3d2b601'
down_revision: Union[str, Sequence[str], None] = 'b7c9d2e1f301'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'review_task_events',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('task_id', sa.Integer(), sa.ForeignKey('review_tasks.id', ondelete='CASCADE', name='fk_rte_task_id'), nullable=False, index=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL', name='fk_rte_user_id'), nullable=True, index=True),
        sa.Column('event_type', sa.String(50), nullable=False),
        sa.Column('old_value', sa.String(255), nullable=True),
        sa.Column('new_value', sa.String(255), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table('review_task_events')
