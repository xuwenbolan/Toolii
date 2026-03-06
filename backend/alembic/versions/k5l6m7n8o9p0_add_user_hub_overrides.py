"""Add per-user hub override columns to users table.

Revision ID: k5l6m7n8o9p0
Revises: j4k5l6m7n8o9
Create Date: 2026-03-06
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "k5l6m7n8o9p0"
down_revision = "j4k5l6m7n8o9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("hub_quota_mb", sa.Integer(), nullable=True))
    op.add_column("users", sa.Column("hub_max_files", sa.Integer(), nullable=True))
    op.add_column("users", sa.Column("hub_max_retention_days", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "hub_max_retention_days")
    op.drop_column("users", "hub_max_files")
    op.drop_column("users", "hub_quota_mb")
