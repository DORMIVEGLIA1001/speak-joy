from pathlib import Path

from dotenv import load_dotenv
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(BACKEND_ROOT / ".env")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(case_sensitive=False, extra="ignore")

    port: int = Field(default=4000, alias="PORT")
    node_env: str = Field(default="development", alias="NODE_ENV")
    database_url: str = Field(alias="DATABASE_URL")
    direct_url: str | None = Field(default=None, alias="DIRECT_URL")
    jwt_secret: str = Field(alias="JWT_SECRET")
    cors_origins_raw: str = Field(
        default="http://localhost:3006,http://127.0.0.1:3006",
        alias="CORS_ORIGINS",
    )
    master_secret: str = Field(default="", alias="MASTER_SECRET")
    encryption_key: str = Field(default="", alias="ENCRYPTION_KEY")
    auth_cookie_domain: str | None = Field(default=None, alias="AUTH_COOKIE_DOMAIN")
    auth_cookie_secure_raw: str | None = Field(default=None, alias="AUTH_COOKIE_SECURE")
    frontend_base_url: str = Field(default="http://localhost:3006", alias="FRONTEND_BASE_URL")
    auth_success_redirect_path: str = Field(default="/", alias="AUTH_SUCCESS_REDIRECT_PATH")
    auth_error_redirect_path: str = Field(default="/", alias="AUTH_ERROR_REDIRECT_PATH")
    google_client_id: str = Field(default="", alias="GOOGLE_CLIENT_ID")
    google_client_secret: str = Field(default="", alias="GOOGLE_CLIENT_SECRET")
    google_redirect_uri: str = Field(default="", alias="GOOGLE_REDIRECT_URI")
    facebook_app_id: str = Field(default="", alias="FACEBOOK_APP_ID")
    facebook_app_secret: str = Field(default="", alias="FACEBOOK_APP_SECRET")
    facebook_redirect_uri: str = Field(default="", alias="FACEBOOK_REDIRECT_URI")
    smtp_host: str = Field(default="", alias="SMTP_HOST")
    smtp_port: int = Field(default=587, alias="SMTP_PORT")
    smtp_username: str = Field(default="", alias="SMTP_USERNAME")
    smtp_password: str = Field(default="", alias="SMTP_PASSWORD")
    smtp_from_email: str = Field(default="", alias="SMTP_FROM_EMAIL")
    smtp_use_tls: bool = Field(default=True, alias="SMTP_USE_TLS")
    smtp_use_ssl: bool = Field(default=False, alias="SMTP_USE_SSL")
    gmail_user: str = Field(default="", alias="GMAIL_USER")
    gmail_app_password: str = Field(default="", alias="GMAIL_APP_PASSWORD")
    # Allosaurus — offline audio→IPA phoneme recognition for role-play scoring (notes 14/7 · mục 3.5).
    # Runs locally on CPU; no token/network needed. `lang_id` picks the phone inventory.
    allosaurus_lang_id: str = Field(default="eng", alias="ALLOSAURUS_LANG_ID")

    @field_validator("master_secret", mode="before")
    @classmethod
    def _validate_master_secret(cls, value: str) -> str:
        return (value or "").strip()

    @field_validator("encryption_key", mode="before")
    @classmethod
    def _validate_encryption_key(cls, value: str) -> str:
        return (value or "").strip()

    @field_validator("auth_cookie_domain", mode="before")
    @classmethod
    def _validate_auth_cookie_domain(cls, value: str | None) -> str | None:
        cleaned = (value or "").strip()
        return cleaned or None

    @field_validator("auth_cookie_secure_raw", mode="before")
    @classmethod
    def _validate_auth_cookie_secure_raw(cls, value: str | None) -> str | None:
        cleaned = (value or "").strip().lower()
        return cleaned or None

    @field_validator(
        "frontend_base_url",
        "auth_success_redirect_path",
        "auth_error_redirect_path",
        "google_client_id",
        "google_client_secret",
        "google_redirect_uri",
        "facebook_app_id",
        "facebook_app_secret",
        "facebook_redirect_uri",
        "smtp_host",
        "smtp_username",
        "smtp_password",
        "smtp_from_email",
        "gmail_user",
        "gmail_app_password",
        mode="before",
    )
    @classmethod
    def _validate_optional_strings(cls, value: str | None) -> str:
        return (value or "").strip()

    @property
    def cors_origins(self) -> list[str]:
        origins = [origin.strip() for origin in self.cors_origins_raw.split(",") if origin.strip()]
        return origins or ["http://localhost:3006", "http://127.0.0.1:3006"]

    @property
    def db_dsn(self) -> str:
        return self.direct_url or self.database_url

    @property
    def auth_cookie_secure(self) -> bool:
        if self.auth_cookie_secure_raw == "true":
            return True
        if self.auth_cookie_secure_raw == "false":
            return False
        return self.node_env.lower() == "production"

    @property
    def smtp_configured(self) -> bool:
        return bool(self.smtp_effective_host and self.smtp_effective_from_email and self.smtp_effective_password)

    @property
    def smtp_effective_host(self) -> str:
        if self.smtp_host:
            return self.smtp_host
        if self.gmail_user and self.gmail_app_password:
            return "smtp.gmail.com"
        return ""

    @property
    def smtp_effective_port(self) -> int:
        return self.smtp_port

    @property
    def smtp_effective_username(self) -> str:
        return self.smtp_username or self.gmail_user

    @property
    def smtp_effective_password(self) -> str:
        return self.smtp_password or self.gmail_app_password

    @property
    def smtp_effective_from_email(self) -> str:
        return self.smtp_from_email or self.smtp_effective_username

    def oauth_success_redirect_url(self) -> str:
        return f"{self.frontend_base_url.rstrip('/')}{self.auth_success_redirect_path or '/'}"

    @property
    def oauth_error_redirect_url(self) -> str:
        return f"{self.frontend_base_url.rstrip('/')}{self.auth_error_redirect_path or '/'}"


settings = Settings()

if settings.node_env.lower() == "production" and not settings.master_secret:
    raise RuntimeError("MASTER_SECRET is required when NODE_ENV=production.")
