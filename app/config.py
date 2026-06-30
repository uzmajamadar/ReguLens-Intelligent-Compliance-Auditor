from dotenv import load_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict

load_dotenv()


class Settings(BaseSettings):
    email_provider: str = "smtp"  # smtp | resend | sendgrid
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_pass: str = ""
    email_from: str = "ReguLens <noreply@regulens.ai>"
    slack_webhook_url: str = ""
    app_url: str = "http://localhost:5173"

    # CORS — comma-separated origins; "*" allows all
    cors_origins: str = "*"

    # S3 / file storage
    s3_bucket: str = ""
    s3_region: str = "us-east-1"
    s3_access_key_id: str = ""
    s3_secret_access_key: str = ""
    s3_endpoint_url: str = ""  # optional, for S3-compatible stores (MinIO, Backblaze B2, etc.)

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
