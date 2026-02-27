from __future__ import annotations

import logging

from app.services.email.base import EmailService

logger = logging.getLogger("app.email.dev")


class DevEmailService(EmailService):
    """Development email service that logs to console instead of sending real emails."""

    async def send_verification_email(
        self, *, to_email: str, token: str, base_url: str
    ) -> None:
        url = f"{base_url}/auth/verify-email?token={token}"
        logger.info(
            "DEV EMAIL - Verification email to %s\n  URL: %s\n  Token: %s",
            to_email,
            url,
            token,
        )

    async def send_password_reset_email(
        self, *, to_email: str, token: str, base_url: str
    ) -> None:
        url = f"{base_url}/auth/reset-password?token={token}"
        logger.info(
            "DEV EMAIL - Password reset email to %s\n  URL: %s\n  Token: %s",
            to_email,
            url,
            token,
        )
