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
                    "subject": "Toolii - 验证您的邮箱",
                    "html": (
                        f"<p>您好，</p>"
                        f"<p>请点击以下链接验证您的邮箱地址：</p>"
                        f'<p><a href="{url}">{url}</a></p>'
                        f"<p>此链接将在 {settings.email_verification_expire_hours} 小时后过期。</p>"
                        f"<p>如果您没有注册 Toolii 账号，请忽略此邮件。</p>"
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
                    "subject": "Toolii - 重置密码",
                    "html": (
                        f"<p>您好，</p>"
                        f"<p>您请求了重置密码，请点击以下链接设置新密码：</p>"
                        f'<p><a href="{url}">{url}</a></p>'
                        f"<p>此链接将在 {settings.password_reset_expire_minutes} 分钟后过期。</p>"
                        f"<p>如果您没有请求重置密码，请忽略此邮件。</p>"
                    ),
                }
            )
        except Exception:
            logger.exception("Failed to send password reset email to %s", to_email)
            raise
