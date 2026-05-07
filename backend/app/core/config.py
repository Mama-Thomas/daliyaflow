from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Environment
    ENVIRONMENT: Literal["development", "staging", "production", "test"] = "development"
    PROJECT_NAME: str = "DaliyaFlow"
    API_V1_PREFIX: str = "/api/v1"

    # Database
    DATABASE_URL: str = (
        "postgresql+asyncpg://daliya:devpassword@postgres:5432/daliyaflow_dev"
    )
    DB_ECHO: bool = False
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 20

    # Redis / Celery
    REDIS_URL: str = "redis://redis:6379/0"

    # JWT
    JWT_SECRET_KEY: str = "change-me"
    JWT_REFRESH_SECRET: str = "change-me-also"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    MAGIC_LINK_EXPIRE_MINUTES: int = 15

    # AWS
    AWS_REGION: str = "us-west-2"
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    AUDIO_BUCKET: str = "daliyaflow-audio-dev"
    AUDIO_URL_EXPIRE_SECONDS: int = 900  # 15 minutes
    MAX_AUDIO_SIZE_MB: int = 25
    MAX_AUDIO_DURATION_SECONDS: int = 600

    # AI
    ANTHROPIC_API_KEY: str = ""
    ANTHROPIC_MODEL: str = "claude-sonnet-4-6"
    openai_api_key: str = Field(default="", env="OPENAI_API_KEY")
    openai_whisper_model: str = Field(
        default="whisper-1", env="OPENAI_WHISPER_MODEL"
    )

    # Observability
    SENTRY_DSN: str = ""

    # CORS
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:5173"
    ALLOWED_ORIGINS: str = ""  # production whitelist; empty = derive from CORS_ORIGINS

    # Limits
    MAX_NOTE_LENGTH: int = 10_000
    MAX_REQUEST_BODY_BYTES: int = 10 * 1024 * 1024  # 10MB
    MAX_AUDIO_BODY_BYTES: int = 25 * 1024 * 1024  # 25MB

    # Sessions
    SESSION_TIMEOUT_MINUTES: int = 30
    SESSION_TIMEOUT_MINUTES_CAREGIVER: int = 60
    SESSION_TIMEOUT_WARNING_MINUTES: int = 5

    # Email — local dev defaults to console logging.
    SEND_EMAILS: bool = False
    EMAIL_FROM_ADDRESS: str = "no-reply@daliyaflow.com"
    EMAIL_FROM_NAME: str = "DaliyaFlow"
    EMAIL_PROVIDER: str = "console"  # one of: console, ses, resend
    APP_BASE_URL: str = "http://localhost:3000"

    @property
    def cors_origins_list(self) -> list[str]:
        if self.is_production and self.ALLOWED_ORIGINS:
            return [
                o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()
            ]
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
