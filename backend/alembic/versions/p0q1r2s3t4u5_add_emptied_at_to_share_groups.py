"""Add emptied_at column to share_groups for delayed cleanup of empty groups.

Revision ID: p0q1r2s3t4u5
Revises: o9p0q1r2s3t4
Create Date: 2026-03-10
"""

import sqlalchemy as sa
from alembic import op

revision = "p0q1r2s3t4u5"
down_revision = "o9p0q1r2s3t4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "share_groups",
        sa.Column("emptied_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("share_groups", "emptied_at")
