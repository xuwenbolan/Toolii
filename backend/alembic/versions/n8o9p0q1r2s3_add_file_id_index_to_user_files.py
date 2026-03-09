"""Add index on user_files.file_id for efficient lookup by storage UUID.

Revision ID: n8o9p0q1r2s3
Revises: m7n8o9p0q1r2
Create Date: 2026-03-09
"""

from alembic import op

revision = "n8o9p0q1r2s3"
down_revision = "m7n8o9p0q1r2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_user_files_file_id",
        "user_files",
        ["file_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_user_files_file_id", table_name="user_files")
