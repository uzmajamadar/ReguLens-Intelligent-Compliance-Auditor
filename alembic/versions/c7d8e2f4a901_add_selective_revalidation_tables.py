"""add selective revalidation tables and columns

Revision ID: c7d8e2f4a901
Revises: b4998f14f159
Create Date: 2026-07-14 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c7d8e2f4a901'
down_revision: Union[str, Sequence[str], None] = 'b4998f14f159'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── New table: document_chunks ──────────────────────────────────────
    op.create_table(
        'document_chunks',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('document_id', sa.Integer(), sa.ForeignKey('documents.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('version_number', sa.Integer(), nullable=False),
        sa.Column('chunk_index', sa.Integer(), nullable=False),
        sa.Column('text', sa.Text(), nullable=False),
        sa.Column('page_numbers', sa.Text(), nullable=True),
        sa.Column('section_heading', sa.String(255), nullable=True),
        sa.Column('section_path', sa.String(512), nullable=True),
        sa.Column('content_hash', sa.String(64), nullable=False, index=True),
        sa.Column('embedding_stored', sa.Boolean(), default=True),
        sa.Column('created_at', sa.DateTime(), default=sa.func.now()),
        sa.UniqueConstraint('document_id', 'version_number', 'chunk_index', name='uq_chunk_doc_ver_idx'),
    )

    # ── New table: chunk_diffs ──────────────────────────────────────────
    op.create_table(
        'chunk_diffs',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('old_document_id', sa.Integer(), sa.ForeignKey('documents.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('new_document_id', sa.Integer(), sa.ForeignKey('documents.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('old_chunk_id', sa.Integer(), sa.ForeignKey('document_chunks.id', ondelete='SET NULL'), nullable=True),
        sa.Column('new_chunk_id', sa.Integer(), sa.ForeignKey('document_chunks.id', ondelete='SET NULL'), nullable=True),
        sa.Column('similarity_score', sa.Float(), nullable=True),
        sa.Column('change_type', sa.String(20), nullable=False),
        sa.Column('old_page_number', sa.Integer(), nullable=True),
        sa.Column('new_page_number', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), default=sa.func.now()),
    )

    # ── New table: rule_chunk_mapping ───────────────────────────────────
    op.create_table(
        'rule_chunk_mapping',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('rule_id', sa.String(100), nullable=False, index=True),
        sa.Column('framework', sa.String(50), nullable=False),
        sa.Column('chunk_id', sa.Integer(), sa.ForeignKey('document_chunks.id', ondelete='SET NULL'), nullable=True),
        sa.Column('chunk_hash', sa.String(64), nullable=True),
        sa.Column('relevance_score', sa.Float(), nullable=True),
        sa.Column('scan_id', sa.Integer(), sa.ForeignKey('scans.id', ondelete='SET NULL'), nullable=True, index=True),
        sa.Column('document_id', sa.Integer(), sa.ForeignKey('documents.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('created_at', sa.DateTime(), default=sa.func.now()),
    )

    # ── Alter violations: add cross-version tracking columns ────────────
    # Note: SQLite doesn't support ALTER TABLE ADD COLUMN with FK constraints.
    # We add the column without the FK and enforce the relationship at the ORM level.
    with op.batch_alter_table('violations') as batch_op:
        batch_op.add_column(sa.Column('document_version', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('section_path', sa.String(512), nullable=True))
        batch_op.add_column(sa.Column('chunk_hash', sa.String(64), nullable=True))
        batch_op.add_column(sa.Column('previous_violation_id', sa.Integer(), nullable=True))

    # ── Alter scans: add scan metadata columns ──────────────────────────
    with op.batch_alter_table('scans') as batch_op:
        batch_op.add_column(sa.Column('scan_type', sa.String(20), server_default='full'))
        batch_op.add_column(sa.Column('rules_evaluated', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('rules_skipped', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('chunks_diffed', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('changed_chunks', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('changed_percentage', sa.Float(), nullable=True))

    # ── Alter review_tasks: add violation linking ───────────────────────
    with op.batch_alter_table('review_tasks') as batch_op:
        batch_op.add_column(sa.Column('violation_link_id', sa.Integer(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('review_tasks') as batch_op:
        batch_op.drop_column('violation_link_id')

    with op.batch_alter_table('scans') as batch_op:
        batch_op.drop_column('changed_percentage')
        batch_op.drop_column('changed_chunks')
        batch_op.drop_column('chunks_diffed')
        batch_op.drop_column('rules_skipped')
        batch_op.drop_column('rules_evaluated')
        batch_op.drop_column('scan_type')

    with op.batch_alter_table('violations') as batch_op:
        batch_op.drop_column('previous_violation_id')
        batch_op.drop_column('chunk_hash')
        batch_op.drop_column('section_path')
        batch_op.drop_column('document_version')

    op.drop_table('rule_chunk_mapping')
    op.drop_table('chunk_diffs')
    op.drop_table('document_chunks')
