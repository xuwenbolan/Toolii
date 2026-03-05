from __future__ import annotations

import re
from typing import Annotated

from pydantic import AfterValidator, Field

_PASSWORD_PATTERN = re.compile(
    r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,128}$",
)


def _check_password_complexity(v: str) -> str:
    if not _PASSWORD_PATTERN.match(v):
        raise ValueError(
            "Password must contain at least one uppercase letter, "
            "one lowercase letter, and one digit"
        )
    return v


StrongPassword = Annotated[
    str,
    Field(min_length=8, max_length=128),
    AfterValidator(_check_password_complexity),
]
