from __future__ import annotations

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class ProcessingHistory(TimestampMixin, Base):
    __tablename__ = "processing_history"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)

    tool_name: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="done")

    input_file_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    output_file_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)

