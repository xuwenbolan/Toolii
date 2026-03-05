from __future__ import annotations

import logging
import secrets
from pathlib import Path
from typing import Annotated

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

logger = logging.getLogger("app.core.config")

_INSECURE_DEFAULTS = frozenset({"CHANGE_ME", "CHANGE_ME_TOO", ""})


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    env: str = Field(default="dev", alias="ENV")
    project_name: str = Field(default="Toolii API", alias="PROJECT_NAME")
    api_prefix: str = Field(default="/api", alias="API_PREFIX")

    cors_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:5173"],
        alias="CORS_ORIGINS",
    )

    database_url: str = Field(
        default="sqlite+aiosqlite:///../data/toolii.db",
        alias="DATABASE_URL",
    )
    db_echo: bool = Field(default=False, alias="DB_ECHO")

    jwt_secret_key: str = Field(default_factory=lambda: secrets.token_hex(32), alias="JWT_SECRET_KEY")
    jwt_algorithm: str = Field(default="HS256", alias="JWT_ALGORITHM")
    access_token_expire_minutes: int = Field(default=30, alias="ACCESS_TOKEN_EXPIRE_MINUTES")
    refresh_token_expire_days: int = Field(default=30, alias="REFRESH_TOKEN_EXPIRE_DAYS")

    google_oauth_client_id: str | None = Field(default=None, alias="GOOGLE_OAUTH_CLIENT_ID")

    download_signing_secret: str = Field(default_factory=lambda: secrets.token_hex(32), alias="DOWNLOAD_SIGNING_SECRET")

    rate_limit_anon: str = Field(default="10/minute", alias="RATE_LIMIT_ANON")
    rate_limit_auth: str = Field(default="20/minute", alias="RATE_LIMIT_AUTH")
    rate_limit_heavy_anon: str = Field(default="5/minute", alias="RATE_LIMIT_HEAVY_ANON")
    rate_limit_heavy_auth: str = Field(default="12/minute", alias="RATE_LIMIT_HEAVY_AUTH")

    max_concurrent_tasks_per_key: int = Field(default=3, alias="MAX_CONCURRENT_TASKS_PER_KEY")

    max_upload_image_mb: int = Field(default=20, alias="MAX_UPLOAD_IMAGE_MB")
    max_upload_pdf_mb: int = Field(default=50, alias="MAX_UPLOAD_PDF_MB")
    max_batch_files: int = Field(default=20, alias="MAX_BATCH_FILES")
    max_batch_total_mb: int = Field(default=100, alias="MAX_BATCH_TOTAL_MB")

    file_storage_dir: str = Field(default="../data/files", alias="FILE_STORAGE_DIR")
    file_retention_hours: int = Field(default=24, alias="FILE_RETENTION_HOURS")

    # File transfer settings
    transfer_storage_dir: str = Field(default="../data/transfers", alias="TRANSFER_STORAGE_DIR")
    max_transfer_files: int = Field(default=20, alias="MAX_TRANSFER_FILES")
    max_transfer_file_mb: int = Field(default=100, alias="MAX_TRANSFER_FILE_MB")
    max_transfer_total_mb: int = Field(default=500, alias="MAX_TRANSFER_TOTAL_MB")

    # Email settings
    email_provider: str = Field(default="dev", alias="EMAIL_PROVIDER")
    resend_api_key: str = Field(default="", alias="RESEND_API_KEY")
    email_from: str = Field(default="noreply@toolii.app", alias="EMAIL_FROM")
    email_verification_expire_hours: int = Field(default=24, alias="EMAIL_VERIFICATION_EXPIRE_HOURS")
    password_reset_expire_minutes: int = Field(default=30, alias="PASSWORD_RESET_EXPIRE_MINUTES")
    frontend_base_url: str = Field(default="http://localhost:5173", alias="FRONTEND_BASE_URL")

    # Cortex GPU inference service
    cortex_url: str = Field(default="http://localhost:9100", alias="CORTEX_URL")
    cortex_api_key: str = Field(default="", alias="CORTEX_API_KEY")

    # Result share settings
    result_share_storage_dir: str = Field(
        default="../data/result_shares", alias="RESULT_SHARE_STORAGE_DIR"
    )
    result_share_ttl_days: int = Field(default=7, alias="RESULT_SHARE_TTL_DAYS")

    # LLM settings (for physiognomy detailed analysis)
    llm_base_url: str = Field(default="", alias="LLM_BASE_URL")
    llm_api_key: str = Field(default="", alias="LLM_API_KEY")
    llm_model: str = Field(default="", alias="LLM_MODEL")

    model_config = SettingsConfigDict(
        env_file=(_repo_root() / ".env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _parse_cors_origins(cls, v):  # type: ignore[no-untyped-def]
        if v is None:
            return []
        if isinstance(v, str):
            return [s.strip() for s in v.split(",") if s.strip()]
        return v

    @model_validator(mode="after")
    def _check_secrets(self) -> Settings:
        problems: list[str] = []
        if self.jwt_secret_key in _INSECURE_DEFAULTS:
            problems.append("JWT_SECRET_KEY")
        if self.download_signing_secret in _INSECURE_DEFAULTS:
            problems.append("DOWNLOAD_SIGNING_SECRET")
        if problems:
            msg = f"Insecure default value for: {', '.join(problems)}. Set proper secrets in .env"
            if self.env != "dev":
                raise ValueError(msg)
            logger.warning("SECURITY WARNING: %s", msg)
        return self


settings = Settings()
