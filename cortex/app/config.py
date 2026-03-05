from __future__ import annotations

from pathlib import Path

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    data_dir: Path = Path("data")
    model_dir: Path | None = None
    vram_budget_mb: int = 0  # 0 = auto-detect from GPU (total - reserve)
    port: int = 9100
    log_level: str = "INFO"
    warmup: bool = False
    max_concurrent: int = 2
    max_concurrent_cpu: int = 2  # separate limit for CPU-only inferences
    gpu_queue_timeout: float = 30.0
    inference_timeout: float = 120.0
    idle_evict_minutes: int = 30
    max_image_pixels: int = 4096 * 4096  # ~16.7M pixels
    max_payload_mb: int = 20
    api_key: str = ""
    stats_file: Path | None = None
    profile_file: Path | None = None

    model_config = SettingsConfigDict(
        env_prefix="CORTEX_", case_sensitive=False, env_file=".env", env_file_encoding="utf-8",
    )

    @model_validator(mode="after")
    def _derive_paths(self) -> Settings:
        if self.model_dir is None:
            self.model_dir = self.data_dir / "models"
        if self.stats_file is None:
            self.stats_file = self.data_dir / "stats.json"
        if self.profile_file is None:
            self.profile_file = self.data_dir / "vram_profile.json"
        return self


settings = Settings()
