"""Add composite indexes for user_files and processing_history.

Revision ID: r2s3t4u5v6w7
Revises: q1r2s3t4u5v6
Create Date: 2026-03-10
"""

from alembic import op

revision = "r2s3t4u5v6w7"
down_revision = "q1r2s3t4u5v6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_user_files_user_status",
        "user_files",
        ["user_id", "status"],
    )
    op.create_index(
        "ix_processing_history_tool_user_created",
        "processing_history",
        ["tool_name", "user_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_processing_history_tool_user_created", "processing_history")
    op.drop_index("ix_user_files_user_status", "user_files")
