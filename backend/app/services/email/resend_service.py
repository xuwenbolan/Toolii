from __future__ import annotations

import asyncio
import logging

import resend

from app.core.config import settings
from app.services.email.base import EmailService
from app.services.email.templates import render_password_reset_email, render_verification_email

logger = logging.getLogger("app.email.resend")


class ResendEmailService(EmailService):
    """Resend API-based email service."""

    def __init__(self) -> None:
        resend.api_key = settings.resend_api_key

    async def send_verification_email(
        self, *, to_email: str, token: str, base_url: str, lang: str = "zh"
    ) -> None:
        url = f"{base_url}/auth/verify-email?token={token}"
        subject, html = render_verification_email(url=url, lang=lang)
        params = {
            "from": settings.email_from,
            "to": [to_email],
            "subject": subject,
            "html": html,
        }
        try:
            await asyncio.to_thread(resend.Emails.send, params)
        except Exception:
            logger.exception("Failed to send verification email to %s", to_email)
            raise

    async def send_password_reset_email(
        self, *, to_email: str, token: str, base_url: str, lang: str = "zh"
    ) -> None:
        url = f"{base_url}/auth/reset-password?token={token}"
        subject, html = render_password_reset_email(url=url, lang=lang)
        params = {
            "from": settings.email_from,
            "to": [to_email],
            "subject": subject,
            "html": html,
        }
        try:
            await asyncio.to_thread(resend.Emails.send, params)
        except Exception:
            logger.exception("Failed to send password reset email to %s", to_email)
            raise
