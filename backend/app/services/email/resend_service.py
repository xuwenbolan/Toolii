from __future__ import annotations

import logging

import resend

from app.core.config import settings
from app.services.email.base import EmailService

logger = logging.getLogger("app.email.resend")


class ResendEmailService(EmailService):
    """Resend API-based email service."""

    def __init__(self) -> None:
        resend.api_key = settings.resend_api_key

    async def send_verification_email(
        self, *, to_email: str, token: str, base_url: str
    ) -> None:
        url = f"{base_url}/auth/verify-email?token={token}"
        try:
            resend.Emails.send(
                {
                    "from": settings.email_from,
                    "to": [to_email],
                    "subject": "Toolii - Verify your email",
                    "html": (
                        f"<p>Hello,</p>"
                        f"<p>Please click the link below to verify your email address:</p>"
                        f'<p><a href="{url}">{url}</a></p>'
                        f"<p>This link will expire in {settings.email_verification_expire_hours} hours.</p>"
                        f"<p>If you did not sign up for Toolii, please ignore this email.</p>"
                    ),
                }
            )
        except Exception:
            logger.exception("Failed to send verification email to %s", to_email)
            raise

    async def send_password_reset_email(
        self, *, to_email: str, token: str, base_url: str
    ) -> None:
        url = f"{base_url}/auth/reset-password?token={token}"
        try:
            resend.Emails.send(
                {
                    "from": settings.email_from,
                    "to": [to_email],
                    "subject": "Toolii - Reset your password",
                    "html": (
                        f"<p>Hello,</p>"
                        f"<p>You requested a password reset. Please click the link below to set a new password:</p>"
                        f'<p><a href="{url}">{url}</a></p>'
                        f"<p>This link will expire in {settings.password_reset_expire_minutes} minutes.</p>"
                        f"<p>If you did not request a password reset, please ignore this email.</p>"
                    ),
                }
            )
        except Exception:
            logger.exception("Failed to send password reset email to %s", to_email)
            raise
