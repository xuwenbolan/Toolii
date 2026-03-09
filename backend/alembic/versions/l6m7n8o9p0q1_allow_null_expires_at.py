"""Allow NULL expires_at for unlimited retention.

Revision ID: l6m7n8o9p0q1
Revises: k5l6m7n8o9p0
Create Date: 2026-03-09
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "l6m7n8o9p0q1"
down_revision = "k5l6m7n8o9p0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # SQLite does not support ALTER COLUMN, so we use batch mode
    with op.batch_alter_table("user_files") as batch_op:
        batch_op.alter_column(
            "expires_at",
            existing_type=sa.DateTime(timezone=True),
            nullable=True,
        )

    with op.batch_alter_table("share_groups") as batch_op:
        batch_op.alter_column(
            "expires_at",
            existing_type=sa.DateTime(timezone=True),
            nullable=True,
        )


def downgrade() -> None:
    # Fill NULL expires_at with created_at + 7 days before setting NOT NULL
    op.execute(
        "UPDATE user_files SET expires_at = datetime(created_at, '+7 days') "
        "WHERE expires_at IS NULL"
    )
    op.execute(
        "UPDATE share_groups SET expires_at = datetime(created_at, '+7 days') "
        "WHERE expires_at IS NULL"
    )

    with op.batch_alter_table("share_groups") as batch_op:
        batch_op.alter_column(
            "expires_at",
            existing_type=sa.DateTime(timezone=True),
            nullable=False,
        )

    with op.batch_alter_table("user_files") as batch_op:
        batch_op.alter_column(
            "expires_at",
            existing_type=sa.DateTime(timezone=True),
            nullable=False,
        )
