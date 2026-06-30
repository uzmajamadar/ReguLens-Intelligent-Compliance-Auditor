import io
import logging
from pathlib import Path

from app.config import settings

logger = logging.getLogger(__name__)

LOCAL_STORAGE_DIR = Path("storage/documents")


def _s3_client():
    import boto3
    kwargs = {
        "aws_access_key_id": settings.s3_access_key_id,
        "aws_secret_access_key": settings.s3_secret_access_key,
        "region_name": settings.s3_region,
    }
    if settings.s3_endpoint_url:
        kwargs["endpoint_url"] = settings.s3_endpoint_url
    return boto3.client("s3", **kwargs)


def _key_for(document_id: int, filename: str) -> str:
    return f"documents/{document_id}_{filename}"


def save(document_id: int, filename: str, data: bytes) -> str:
    """Save file bytes and return the storage path (local path or S3 key)."""
    if settings.s3_bucket:
        key = _key_for(document_id, filename)
        _s3_client().put_object(Bucket=settings.s3_bucket, Key=key, Body=data)
        logger.info("Saved s3://%s/%s (%d bytes)", settings.s3_bucket, key, len(data))
        return f"s3://{settings.s3_bucket}/{key}"
    else:
        LOCAL_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
        safe_name = f"{document_id}_{filename}"
        file_path = LOCAL_STORAGE_DIR / safe_name
        file_path.write_bytes(data)
        logger.info("Saved %s (%d bytes)", file_path, len(data))
        return str(file_path)


def read_bytes(file_path: str) -> bytes:
    """Read file bytes from S3 or local disk given the path returned by save()."""
    if file_path.startswith("s3://"):
        parts = file_path.replace("s3://", "").split("/", 1)
        bucket = parts[0]
        key = parts[1]
        resp = _s3_client().get_object(Bucket=bucket, Key=key)
        data = resp["Body"].read()
        return data
    else:
        return Path(file_path).read_bytes()


def delete(file_path: str) -> bool:
    """Delete a file from S3 or local disk. Returns True if deleted."""
    if file_path.startswith("s3://"):
        parts = file_path.replace("s3://", "").split("/", 1)
        bucket = parts[0]
        key = parts[1]
        _s3_client().delete_object(Bucket=bucket, Key=key)
        logger.info("Deleted s3://%s/%s", bucket, key)
        return True
    else:
        p = Path(file_path)
        if p.exists():
            p.unlink()
            logger.info("Deleted %s", file_path)
            return True
        return False


def exists(file_path: str) -> bool:
    """Check if a file exists in S3 or on local disk."""
    if file_path.startswith("s3://"):
        parts = file_path.replace("s3://", "").split("/", 1)
        bucket = parts[0]
        key = parts[1]
        try:
            _s3_client().head_object(Bucket=bucket, Key=key)
            return True
        except Exception:
            return False
    else:
        return Path(file_path).exists()
