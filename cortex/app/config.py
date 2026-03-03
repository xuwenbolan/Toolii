from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_dir: Path = Path("models")
    vram_budget_mb: int = 11000
    port: int = 9100
    log_level: str = "INFO"
    warmup: bool = False
    max_concurrent: int = 2
    gpu_queue_timeout: float = 30.0
    idle_evict_minutes: int = 30

    model_config = SettingsConfigDict(env_prefix="CORTEX_", case_sensitive=False)


settings = Settings()
