from __future__ import annotations

from pydantic import BaseModel


class FileResult(BaseModel):
    file_id: str
    filename: str
    size: int
    content_type: str
    download_url: str
    expires_in: int
