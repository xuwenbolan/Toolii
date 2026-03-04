"""Seed tool display names and clean dirty processing_history data.

Revision ID: f1a2b3c4d5e6
Revises: e02ee35ad0f7
Create Date: 2026-03-04

The old ToolRecordingRoute (before fail-open) recorded share endpoint hits
as tool usage, producing tool_name values like "share/D49BcDR..." in
processing_history. This migration removes those invalid rows and seeds
display_name_zh / display_name_en for all registered tools.
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "f1a2b3c4d5e6"
down_revision = "e02ee35ad0f7"
branch_labels = None
depends_on = None


# Display names for all registered tools
_DISPLAY_NAMES: dict[str, tuple[str, str]] = {
    # tool_name: (display_name_zh, display_name_en)
    "image/compress":     ("图片压缩",     "Image Compress"),
    "image/heic-to-jpg":  ("HEIC 转 JPG",  "HEIC to JPG"),
    "image/convert":      ("图片格式转换", "Image Convert"),
    "image/remove-bg":    ("背景去除",     "Remove Background"),
    "image/upscale":      ("图片放大",     "Image Upscale"),
    "image/restore-face": ("人脸修复",     "Face Restore"),
    "image/denoise":      ("图片降噪",     "Image Denoise"),
    "image/colorize":     ("黑白上色",     "Colorize"),
    "image/inpaint":      ("图片修复",     "Image Inpaint"),
    "image/ocr":          ("文字识别",     "OCR"),
    "image/segment":      ("图片分割",     "Image Segment"),
    "image/mosaic":       ("马赛克",       "Mosaic"),
    "image/scan-enhance": ("扫描增强",     "Scan Enhance"),
    "pdf/tools":          ("PDF 工具",     "PDF Tools"),
    "facemap/profile":    ("面相速览",     "Face Profile"),
    "facemap/report":     ("面相报告",     "Face Report"),
    "facemap/similarity": ("人脸相似度",   "Face Similarity"),
}


def upgrade() -> None:
    """Seed display names and delete dirty processing_history rows."""
    conn = op.get_bind()

    # 1. Seed display names
    for tool_name, (zh, en) in _DISPLAY_NAMES.items():
        conn.execute(
            sa.text(
                "UPDATE tools SET display_name_zh = :zh, display_name_en = :en "
                "WHERE tool_name = :name"
            ),
            {"zh": zh, "en": en, "name": tool_name},
        )

    # 2. Delete dirty rows: any tool_name NOT in the registered tools list
    valid_names = list(_DISPLAY_NAMES.keys())
    conn.execute(
        sa.text(
            "DELETE FROM processing_history "
            "WHERE tool_name NOT IN :names"
        ).bindparams(sa.bindparam("names", expanding=True)),
        {"names": valid_names},
    )


def downgrade() -> None:
    """Clear display names (dirty data cannot be restored)."""
    conn = op.get_bind()
    conn.execute(
        sa.text("UPDATE tools SET display_name_zh = NULL, display_name_en = NULL"),
    )
