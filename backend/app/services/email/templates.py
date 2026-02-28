from __future__ import annotations

import html as html_mod

from app.core.config import settings
from app.services.email.lang import Lang

# ---------------------------------------------------------------------------
# Translation strings
# ---------------------------------------------------------------------------

_STRINGS: dict[str, dict[Lang, str]] = {
    # Verification email
    "verify_subject": {
        "zh": "Toolii - 验证你的邮箱",
        "en": "Toolii - Verify Your Email",
    },
    "verify_greeting": {
        "zh": "你好！",
        "en": "Hello!",
    },
    "verify_body": {
        "zh": "感谢注册 Toolii。请点击下方按钮验证你的邮箱地址：",
        "en": "Thanks for signing up for Toolii. Please click the button below to verify your email address:",
    },
    "verify_button": {
        "zh": "验证邮箱",
        "en": "Verify Email",
    },
    "verify_expire": {
        "zh": "此链接将在 {hours} 小时后过期。",
        "en": "This link will expire in {hours} hours.",
    },
    "verify_ignore": {
        "zh": "如果你没有注册 Toolii，请忽略此邮件。",
        "en": "If you didn't sign up for Toolii, please ignore this email.",
    },
    # Password reset email
    "reset_subject": {
        "zh": "Toolii - 重置密码",
        "en": "Toolii - Reset Your Password",
    },
    "reset_greeting": {
        "zh": "你好！",
        "en": "Hello!",
    },
    "reset_body": {
        "zh": "我们收到了重置你密码的请求。请点击下方按钮设置新密码：",
        "en": "We received a request to reset your password. Click the button below to set a new password:",
    },
    "reset_button": {
        "zh": "重置密码",
        "en": "Reset Password",
    },
    "reset_expire": {
        "zh": "此链接将在 {minutes} 分钟后过期。",
        "en": "This link will expire in {minutes} minutes.",
    },
    "reset_ignore": {
        "zh": "如果你没有请求重置密码，请忽略此邮件。",
        "en": "If you didn't request a password reset, please ignore this email.",
    },
    # Common
    "footer_text": {
        "zh": "此邮件由 Toolii 自动发送，请勿回复。",
        "en": "This email was sent automatically by Toolii. Please do not reply.",
    },
    "link_fallback": {
        "zh": "如果按钮无法点击，请复制以下链接到浏览器打开：",
        "en": "If the button doesn't work, copy and paste this link into your browser:",
    },
}


def _t(key: str, lang: Lang, **kwargs: object) -> str:
    """Look up a translated string and apply format substitutions."""
    template = _STRINGS[key][lang]
    return template.format(**kwargs) if kwargs else template


# ---------------------------------------------------------------------------
# HTML layout
# ---------------------------------------------------------------------------

_FONT = "'Source Sans 3','PingFang SC','Microsoft YaHei',Arial,sans-serif"

_LOGO_HTML = (
    '<table cellpadding="0" cellspacing="0" border="0"><tr>'
    '<td style="width:32px;height:32px;background-color:#4F46E5;'
    "border-radius:8px;text-align:center;vertical-align:middle;"
    'line-height:32px;">'
    '<span style="color:#FFFFFF;font-size:18px;font-weight:700;'
    "font-family:Arial,sans-serif;\">T</span>"
    "</td>"
    "<td style=\"padding-left:10px;font-size:18px;font-weight:600;"
    "color:#1A1A1A;font-family:" + _FONT + ";"
    'letter-spacing:-0.02em;">Toolii</td>'
    "</tr></table>"
)


def _render_email(
    *,
    lang: Lang,
    greeting: str,
    body_text: str,
    button_text: str,
    button_url: str,
    expire_text: str,
    ignore_text: str,
) -> str:
    """Render a complete branded HTML email."""
    fallback_label = _t("link_fallback", lang)
    footer = _t("footer_text", lang)
    # Escape URL for safe HTML embedding
    button_url = html_mod.escape(button_url, quote=True)

    return (
        "<!DOCTYPE html>"
        f'<html lang="{lang}">'
        '<head><meta charset="utf-8"/>'
        '<meta name="viewport" content="width=device-width,initial-scale=1.0"/>'
        "</head>"
        '<body style="margin:0;padding:0;background-color:#F5F5F5;'
        f"font-family:{_FONT};\">"
        '<table width="100%" cellpadding="0" cellspacing="0" border="0" '
        'style="background-color:#F5F5F5;padding:40px 16px;">'
        "<tr><td align=\"center\">"
        # Card
        '<table cellpadding="0" cellspacing="0" border="0" '
        'style="max-width:600px;width:100%;background-color:#FFFFFF;'
        'border:1px solid #EAEAEA;border-radius:12px;">'
        # Header
        f'<tr><td style="padding:32px 40px 24px 40px;">{_LOGO_HTML}</td></tr>'
        # Body
        '<tr><td style="padding:0 40px;">'
        f'<p style="margin:0 0 16px;font-size:16px;color:#1A1A1A;line-height:1.6;">{greeting}</p>'
        f'<p style="margin:0 0 28px;font-size:15px;color:#1A1A1A;line-height:1.6;">{body_text}</p>'
        # CTA button
        '<table cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;">'
        '<tr><td align="center" bgcolor="#4F46E5" style="border-radius:8px;">'
        f'<a href="{button_url}" target="_blank" '
        f'style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;'
        f"color:#FFFFFF;text-decoration:none;font-family:{_FONT};\">"
        f"{button_text}</a>"
        "</td></tr></table>"
        # Expire & ignore hints
        f'<p style="margin:0 0 8px;font-size:13px;color:#8D8D8D;line-height:1.5;">{expire_text}</p>'
        f'<p style="margin:0 0 24px;font-size:13px;color:#8D8D8D;line-height:1.5;">{ignore_text}</p>'
        # Link fallback
        f'<p style="margin:0 0 8px;font-size:12px;color:#8D8D8D;line-height:1.4;">{fallback_label}</p>'
        f'<p style="margin:0 0 24px;font-size:12px;word-break:break-all;line-height:1.4;">'
        f'<a href="{button_url}" style="color:#4F46E5;text-decoration:underline;">{button_url}</a></p>'
        "</td></tr>"
        # Divider
        '<tr><td style="padding:0 40px;">'
        '<hr style="border:none;border-top:1px solid #EAEAEA;margin:0;"/>'
        "</td></tr>"
        # Footer
        '<tr><td style="padding:20px 40px 32px;text-align:center;">'
        f'<p style="margin:0;font-size:12px;color:#8D8D8D;line-height:1.5;">{footer}</p>'
        "</td></tr>"
        "</table>"
        "</td></tr></table>"
        "</body></html>"
    )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def render_verification_email(*, url: str, lang: Lang) -> tuple[str, str]:
    """Return (subject, html_body) for a verification email."""
    subject = _t("verify_subject", lang)
    html = _render_email(
        lang=lang,
        greeting=_t("verify_greeting", lang),
        body_text=_t("verify_body", lang),
        button_text=_t("verify_button", lang),
        button_url=url,
        expire_text=_t("verify_expire", lang, hours=settings.email_verification_expire_hours),
        ignore_text=_t("verify_ignore", lang),
    )
    return subject, html


def render_password_reset_email(*, url: str, lang: Lang) -> tuple[str, str]:
    """Return (subject, html_body) for a password reset email."""
    subject = _t("reset_subject", lang)
    html = _render_email(
        lang=lang,
        greeting=_t("reset_greeting", lang),
        body_text=_t("reset_body", lang),
        button_text=_t("reset_button", lang),
        button_url=url,
        expire_text=_t("reset_expire", lang, minutes=settings.password_reset_expire_minutes),
        ignore_text=_t("reset_ignore", lang),
    )
    return subject, html
