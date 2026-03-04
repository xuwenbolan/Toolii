"""Merge per-endpoint PDF tool configs into a single pdf/tools entry.

Revision ID: a1b2c3d4e5f6
Revises: f1a2b3c4d5e6
Create Date: 2026-03-04

Individual pdf/* entries (pdf/compress, pdf/merge, etc.) are replaced by a
single pdf/tools row.  The ToolGatewayRoute category fallback resolves
pdf/compress → pdf/tools automatically.  Usage recording in
processing_history still writes the per-endpoint tool_name for analytics.
"""

from alembic import op
import sqlalchemy as sa


revision = "a1b2c3d4e5f6"
down_revision = "f1a2b3c4d5e6"
branch_labels = None
depends_on = None

_OLD_PDF_TOOLS = [
    "pdf/compress",
    "pdf/merge",
    "pdf/pages",
    "pdf/split",
    "pdf/from-images",
]


def upgrade() -> None:
    conn = op.get_bind()

    # Delete individual PDF tool entries
    conn.execute(
        sa.text("DELETE FROM tools WHERE tool_name IN :names").bindparams(
            sa.bindparam("names", expanding=True)
        ),
        {"names": _OLD_PDF_TOOLS},
    )

    # Insert unified pdf/tools entry
    conn.execute(
        sa.text(
            "INSERT INTO tools (tool_name, category, display_order, is_enabled, "
            "credit_cost, access_level, display_name_zh, display_name_en) "
            "VALUES (:name, :cat, :ord, :enabled, :cost, :access, :zh, :en)"
        ),
        {
            "name": "pdf/tools",
            "cat": "pdf",
            "ord": 14,
            "enabled": True,
            "cost": 0,
            "access": "public",
            "zh": "PDF 工具",
            "en": "PDF Tools",
        },
    )


def downgrade() -> None:
    conn = op.get_bind()

    # Remove unified entry
    conn.execute(sa.text("DELETE FROM tools WHERE tool_name = 'pdf/tools'"))

    # Restore individual entries
    tools_table = sa.table(
        "tools",
        sa.column("tool_name", sa.String),
        sa.column("category", sa.String),
        sa.column("display_order", sa.Integer),
        sa.column("is_enabled", sa.Boolean),
        sa.column("credit_cost", sa.Integer),
        sa.column("access_level", sa.String),
        sa.column("display_name_zh", sa.String),
        sa.column("display_name_en", sa.String),
    )
    op.bulk_insert(tools_table, [
        {"tool_name": "pdf/compress",    "category": "pdf", "display_order": 14, "is_enabled": True, "credit_cost": 0, "access_level": "public", "display_name_zh": "PDF 压缩",     "display_name_en": "PDF Compress"},
        {"tool_name": "pdf/merge",       "category": "pdf", "display_order": 15, "is_enabled": True, "credit_cost": 0, "access_level": "public", "display_name_zh": "PDF 合并",     "display_name_en": "PDF Merge"},
        {"tool_name": "pdf/pages",       "category": "pdf", "display_order": 16, "is_enabled": True, "credit_cost": 0, "access_level": "public", "display_name_zh": "PDF 提取页面", "display_name_en": "PDF Extract Pages"},
        {"tool_name": "pdf/split",       "category": "pdf", "display_order": 17, "is_enabled": True, "credit_cost": 0, "access_level": "public", "display_name_zh": "PDF 拆分",     "display_name_en": "PDF Split"},
        {"tool_name": "pdf/from-images", "category": "pdf", "display_order": 18, "is_enabled": True, "credit_cost": 0, "access_level": "public", "display_name_zh": "图片转 PDF",   "display_name_en": "Images to PDF"},
    ])
