from __future__ import annotations

from abc import ABC, abstractmethod


class EmailService(ABC):
    """Abstract email service interface."""

    @abstractmethod
    async def send_verification_email(
        self, *, to_email: str, token: str, base_url: str, lang: str = "zh"
    ) -> None:
        """Send an email verification link."""

    @abstractmethod
    async def send_password_reset_email(
        self, *, to_email: str, token: str, base_url: str, lang: str = "zh"
    ) -> None:
        """Send a password reset link."""
