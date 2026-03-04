"""rename facemap_shares to result_shares and add original_image_file_id

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-03-04 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b2c3d4e5f6a7"
down_revision: Union[str, Sequence[str], None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.rename_table("facemap_shares", "result_shares")

    with op.batch_alter_table("result_shares", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("original_image_file_id", sa.String(length=32), nullable=True)
        )


def downgrade() -> None:
    with op.batch_alter_table("result_shares", schema=None) as batch_op:
        batch_op.drop_column("original_image_file_id")

    op.rename_table("result_shares", "facemap_shares")
