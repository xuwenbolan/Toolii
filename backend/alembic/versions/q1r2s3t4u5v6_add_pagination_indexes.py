"""Add composite indexes for pagination queries on history and transactions.

Revision ID: q1r2s3t4u5v6
Revises: p0q1r2s3t4u5
Create Date: 2026-03-10
"""

from alembic import op

revision = "q1r2s3t4u5v6"
down_revision = "p0q1r2s3t4u5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_processing_history_user_created",
        "processing_history",
        ["user_id", "created_at"],
    )
    op.create_index(
        "ix_credit_transactions_user_created",
        "credit_transactions",
        ["user_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_credit_transactions_user_created", "credit_transactions")
    op.drop_index("ix_processing_history_user_created", "processing_history")
