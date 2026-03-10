"""Add thumb_file_id column to user_files for thumbnail storage.

Revision ID: o9p0q1r2s3t4
Revises: n8o9p0q1r2s3
Create Date: 2026-03-10
"""

import sqlalchemy as sa
from alembic import op

revision = "o9p0q1r2s3t4"
down_revision = "n8o9p0q1r2s3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_files",
        sa.Column("thumb_file_id", sa.String(32), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("user_files", "thumb_file_id")
