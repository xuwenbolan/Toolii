from __future__ import annotations

from functools import lru_cache

from app.core.config import settings
from app.services.email.base import EmailService


@lru_cache(maxsize=1)
def get_email_service() -> EmailService:
    """Factory function to get the appropriate email service based on config."""
    provider = settings.email_provider
    if provider == "resend":
        from app.services.email.resend_service import ResendEmailService

        return ResendEmailService()
    else:
        from app.services.email.dev import DevEmailService

        return DevEmailService()
