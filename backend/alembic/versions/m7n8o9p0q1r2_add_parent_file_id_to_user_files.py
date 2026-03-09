"""Add parent_file_id column to user_files for editor images.

Revision ID: m7n8o9p0q1r2
Revises: l6m7n8o9p0q1
Create Date: 2026-03-09
"""

from alembic import op
import sqlalchemy as sa

revision = "m7n8o9p0q1r2"
down_revision = "l6m7n8o9p0q1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_files",
        sa.Column("parent_file_id", sa.Integer(), nullable=True),
    )
    op.create_index(
        "ix_user_files_parent_file_id",
        "user_files",
        ["parent_file_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_user_files_parent_file_id", table_name="user_files")
    op.drop_column("user_files", "parent_file_id")
