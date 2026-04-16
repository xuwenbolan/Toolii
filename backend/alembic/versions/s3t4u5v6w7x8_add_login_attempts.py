"""Add login_attempts table for persistent lockout tracking.

Revision ID: s3t4u5v6w7x8
Revises: r2s3t4u5v6w7
Create Date: 2026-04-16
"""

import sqlalchemy as sa
from alembic import op

revision = "s3t4u5v6w7x8"
down_revision = "r2s3t4u5v6w7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "login_attempts",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column(
            "failure_count",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "first_failure_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.Column(
            "locked_until",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_login_attempts_email",
        "login_attempts",
        ["email"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_login_attempts_email", "login_attempts")
    op.drop_table("login_attempts")
