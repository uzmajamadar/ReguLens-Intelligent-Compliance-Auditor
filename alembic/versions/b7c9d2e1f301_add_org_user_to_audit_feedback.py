"""add_org_user_to_audit_feedback

Revision ID: b7c9d2e1f301
Revises: a59dc4a3f511
Create Date: 2026-07-08 17:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b7c9d2e1f301'
down_revision: Union[str, Sequence[str], None] = 'a59dc4a3f511'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('audit_feedback') as batch_op:
        batch_op.add_column(sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', name='fk_audit_feedback_user_id'), nullable=True, index=True))
        batch_op.add_column(sa.Column('organization_id', sa.Integer(), sa.ForeignKey('organizations.id', name='fk_audit_feedback_organization_id'), nullable=True, index=True))


def downgrade() -> None:
    with op.batch_alter_table('audit_feedback') as batch_op:
        batch_op.drop_column('organization_id')
        batch_op.drop_column('user_id')
