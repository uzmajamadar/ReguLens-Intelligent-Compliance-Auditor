"""add_violation_scan_rule_unique

Revision ID: a59dc4a3f511
Revises: fbb9f66711fd
Create Date: 2026-07-08 16:16:09.255031

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a59dc4a3f511'
down_revision: Union[str, Sequence[str], None] = 'fbb9f66711fd'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('violations') as batch_op:
        batch_op.create_unique_constraint('uq_violation_scan_rule', ['scan_id', 'rule_id'])


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('violations') as batch_op:
        batch_op.drop_constraint('uq_violation_scan_rule', type_='unique')
