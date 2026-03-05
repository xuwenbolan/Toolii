from __future__ import annotations

import logging
from functools import lru_cache

from app.core.config import settings
from app.services.email.base import EmailService

logger = logging.getLogger("app.email.factory")


@lru_cache(maxsize=1)
def get_email_service() -> EmailService:
    """Factory function to get the appropriate email service based on config."""
    provider = settings.email_provider
    if provider == "resend":
        from app.services.email.resend_service import ResendEmailService

        return ResendEmailService()

    if settings.env != "dev":
        raise RuntimeError(
            f"DevEmailService cannot be used in env={settings.env!r}. "
            "Set EMAIL_PROVIDER=resend with a valid RESEND_API_KEY."
        )

    from app.services.email.dev import DevEmailService

    return DevEmailService()
