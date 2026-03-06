"""Add photo/idphoto tool entry and set daily limits for GPU-heavy tools.

Revision ID: i3j4k5l6m7n8
Revises: h2i3j4k5l6m7
Create Date: 2026-03-05
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "i3j4k5l6m7n8"
down_revision = "h2i3j4k5l6m7"
branch_labels = None
depends_on = None


# Daily limits for GPU/compute-heavy tools (anon, auth)
_DAILY_LIMITS: dict[str, tuple[int | None, int | None]] = {
    # tool_name:              (daily_limit_anon, daily_limit_auth)
    "image/upscale":          (3,    20),
    "image/restore-face":     (3,    20),
    "image/colorize":         (3,    20),
    "image/denoise":          (5,    30),
    "image/remove-bg":        (5,    30),
    "image/inpaint":          (3,    20),
    "photo/idphoto":          (5,    30),
    "facemap/report":         (None, 10),
}


def upgrade() -> None:
    conn = op.get_bind()

    # 1. Insert photo/idphoto tool
    conn.execute(
        sa.text(
            "INSERT INTO tools "
            "(tool_name, category, display_order, is_enabled, credit_cost, "
            " access_level, display_name_zh, display_name_en, "
            " daily_limit_anon, daily_limit_auth) "
            "VALUES "
            "(:name, 'photo', 14, TRUE, 0, 'public', :zh, :en, :anon, :auth)"
        ),
        {
            "name": "photo/idphoto",
            "zh": "证件照",
            "en": "ID Photo",
            "anon": 5,
            "auth": 30,
        },
    )

    # 2. Set daily limits for GPU-heavy tools
    for tool_name, (anon, auth) in _DAILY_LIMITS.items():
        if tool_name == "photo/idphoto":
            continue  # already set above
        conn.execute(
            sa.text(
                "UPDATE tools "
                "SET daily_limit_anon = :anon, daily_limit_auth = :auth "
                "WHERE tool_name = :name"
            ),
            {"anon": anon, "auth": auth, "name": tool_name},
        )


def downgrade() -> None:
    conn = op.get_bind()

    # Remove photo/idphoto
    conn.execute(sa.text("DELETE FROM tools WHERE tool_name = 'photo/idphoto'"))

    # Clear daily limits
    for tool_name in _DAILY_LIMITS:
        if tool_name == "photo/idphoto":
            continue
        conn.execute(
            sa.text(
                "UPDATE tools "
                "SET daily_limit_anon = NULL, daily_limit_auth = NULL "
                "WHERE tool_name = :name"
            ),
            {"name": tool_name},
        )
