"""
S3 service for uploading and managing files in S3.

Provides lazy-initialized boto3 client and helper functions for
uploading player avatars and court photos to S3.
"""

import logging
import os
import time
from typing import Optional
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

# Lazy-initialized S3 client
_s3_client = None


def _get_config():
    """Read S3 configuration from environment at call time (not import time)."""
    return {
        "access_key_id": os.getenv("AWS_ACCESS_KEY_ID"),
        "secret_access_key": os.getenv("AWS_SECRET_ACCESS_KEY"),
        "bucket": os.getenv("AWS_S3_BUCKET"),
        "region": os.getenv("AWS_S3_REGION", "us-west-2"),
    }


def _get_s3_client():
    """Get or create the boto3 S3 client. Lazy-imports boto3 to avoid import-time dependency."""
    global _s3_client
    if _s3_client is None:
        cfg = _get_config()
        if not all([cfg["access_key_id"], cfg["secret_access_key"], cfg["bucket"]]):
            raise ValueError(
                "AWS S3 environment variables not configured. "
                "Set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_S3_BUCKET."
            )
        import boto3

        _s3_client = boto3.client(
            "s3",
            aws_access_key_id=cfg["access_key_id"],
            aws_secret_access_key=cfg["secret_access_key"],
            region_name=cfg["region"],
        )
    return _s3_client


def upload_avatar(player_id: int, image_bytes: bytes) -> str:
    """
    Upload avatar image to S3.

    Stores at key: avatars/{player_id}/{timestamp}.jpg
    Returns the public URL of the uploaded image.

    Args:
        player_id: Player ID for organizing uploads
        image_bytes: Processed JPEG image bytes

    Returns:
        Public URL of the uploaded avatar
    """
    client = _get_s3_client()
    cfg = _get_config()
    bucket = cfg["bucket"]
    region = cfg["region"]
    timestamp = int(time.time())
    key = f"avatars/{player_id}/{timestamp}.jpg"

    client.put_object(
        Bucket=bucket,
        Key=key,
        Body=image_bytes,
        ContentType="image/jpeg",
    )

    url = f"https://{bucket}.s3.{region}.amazonaws.com/{key}"
    logger.info(f"Uploaded avatar for player {player_id}: {key}")
    return url


def delete_avatar(url: str) -> bool:
    """
    Delete an avatar from S3 by its URL. Best-effort — logs errors but doesn't raise.

    Args:
        url: The full S3 URL of the avatar to delete

    Returns:
        True if deleted successfully, False otherwise
    """
    try:
        client = _get_s3_client()
        cfg = _get_config()
        bucket = cfg["bucket"]
        key = _extract_key_from_url(url, bucket)
        if not key:
            logger.warning(f"Could not extract S3 key from URL: {url}")
            return False

        client.delete_object(Bucket=bucket, Key=key)
        logger.info(f"Deleted avatar from S3: {key}")
        return True
    except Exception as e:
        logger.error(f"Failed to delete avatar from S3: {e}")
        return False


async def upload_file(file_bytes: bytes, key: str, content_type: str = "application/octet-stream") -> str:
    """
    Upload arbitrary file bytes to S3 under the given key.

    Args:
        file_bytes: Raw file content
        key: S3 object key (e.g., "court-photos/1/2/uuid.jpg")
        content_type: MIME type for the uploaded object

    Returns:
        Public URL of the uploaded file
    """
    client = _get_s3_client()
    cfg = _get_config()
    bucket = cfg["bucket"]
    region = cfg["region"]

    client.put_object(
        Bucket=bucket,
        Key=key,
        Body=file_bytes,
        ContentType=content_type,
    )

    url = f"https://{bucket}.s3.{region}.amazonaws.com/{key}"
    logger.info("Uploaded file to S3: %s", key)
    return url


async def delete_file(key: str) -> bool:
    """
    Delete a file from S3 by its object key. Best-effort.

    Args:
        key: S3 object key

    Returns:
        True if deleted successfully, False otherwise
    """
    try:
        client = _get_s3_client()
        cfg = _get_config()
        client.delete_object(Bucket=cfg["bucket"], Key=key)
        logger.info("Deleted file from S3: %s", key)
        return True
    except Exception as e:
        logger.error("Failed to delete S3 file %s: %s", key, e)
        return False


def _extract_key_from_url(url: str, expected_bucket: Optional[str] = None) -> Optional[str]:
    """
    Extract the S3 object key from a full S3 URL.

    Validates that the URL hostname matches the expected S3 bucket before
    extracting the key.

    Handles URLs like:
      https://bucket.s3.region.amazonaws.com/avatars/123/456.jpg

    Args:
        url: Full S3 URL
        expected_bucket: Expected S3 bucket name for hostname validation

    Returns:
        Object key string or None if parsing fails or hostname doesn't match
    """
    try:
        parsed = urlparse(url)

        # Validate hostname contains expected bucket if provided
        if expected_bucket and parsed.hostname:
            if expected_bucket not in parsed.hostname:
                logger.warning(
                    f"URL hostname '{parsed.hostname}' does not match "
                    f"expected bucket '{expected_bucket}'"
                )
                return None

        # Remove leading slash from path
        key = parsed.path.lstrip("/")
        return key if key else None
    except Exception:
        return None
