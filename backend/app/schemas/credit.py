from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field, field_validator


CARD_CODE_PATTERN = r"^TOOL-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$"


class RedeemRequest(BaseModel):
    code: str = Field(pattern=CARD_CODE_PATTERN)

    @field_validator("code", mode="before")
    @classmethod
    def normalize_code(cls, value: str) -> str:
        if isinstance(value, str):
            return value.strip().upper()
        return value


class RedeemResponse(BaseModel):
    added_credits: int
    balance: int
    card_type: str


class CreditBalanceResponse(BaseModel):
    balance: int


class CreditTransactionItem(BaseModel):
    id: int
    tx_type: str
    amount: int
    balance_before: int
    balance_after: int
    description: str | None = None
    reference_id: str | None = None
    created_at: datetime


class CreditTransactionsResponse(BaseModel):
    items: list[CreditTransactionItem]
    total: int
    limit: int
    offset: int
