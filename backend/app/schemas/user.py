from __future__ import annotations

from pydantic import BaseModel, EmailStr, ConfigDict


class UserPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr

    is_active: bool = True
