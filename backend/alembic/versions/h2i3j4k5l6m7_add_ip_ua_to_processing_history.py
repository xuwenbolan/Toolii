"""Add ip and user_agent columns to processing_history.

Revision ID: h2i3j4k5l6m7
Revises: g1h2i3j4k5l6
Create Date: 2026-03-05
"""

from alembic import op
import sqlalchemy as sa

revision = "h2i3j4k5l6m7"
down_revision = "g1h2i3j4k5l6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("processing_history", sa.Column("ip", sa.String(45), nullable=True))
    op.add_column("processing_history", sa.Column("user_agent", sa.String(256), nullable=True))


def downgrade() -> None:
    op.drop_column("processing_history", "user_agent")
    op.drop_column("processing_history", "ip")
