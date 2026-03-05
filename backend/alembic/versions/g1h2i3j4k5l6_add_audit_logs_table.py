"""Add audit_logs table for comprehensive operation auditing.

Revision ID: g1h2i3j4k5l6
Revises: b2c3d4e5f6a7, f1a2b3c4d5e6
Create Date: 2026-03-05
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "g1h2i3j4k5l6"
down_revision = ("b2c3d4e5f6a7", "f1a2b3c4d5e6")
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("category", sa.String(30), nullable=False),
        sa.Column("action", sa.String(60), nullable=False),
        sa.Column("success", sa.Boolean(), nullable=False, server_default="1"),
        sa.Column("resource_type", sa.String(30), nullable=True),
        sa.Column("resource_id", sa.String(100), nullable=True),
        sa.Column("ip", sa.String(45), nullable=True),
        sa.Column("user_agent", sa.String(300), nullable=True),
        sa.Column("detail", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    with op.batch_alter_table("audit_logs") as batch_op:
        batch_op.create_index("ix_audit_logs_user_id", ["user_id"])
        batch_op.create_index("ix_audit_logs_category", ["category"])
        batch_op.create_index("ix_audit_logs_action", ["action"])
        batch_op.create_index("ix_audit_logs_created_at", ["created_at"])


def downgrade() -> None:
    op.drop_table("audit_logs")
