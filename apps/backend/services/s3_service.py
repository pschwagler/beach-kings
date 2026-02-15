"""
S3 service for uploading and deleting avatar images.

Provides lazy-initialized boto3 client and helper functions for
uploading player avatars to S3 and deleting them.
"""

import logging
import os
import time
from typing import Optional
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

# Configuration from environment
AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
AWS_S3_BUCKET = os.getenv("AWS_S3_BUCKET")
AWS_S3_REGION = os.getenv("AWS_S3_REGION", "us-west-2")

# Lazy-initialized S3 client
_s3_client = None


def _get_s3_client():
    """Get or create the boto3 S3 client. Lazy-imports boto3 to avoid import-time dependency."""
    global _s3_client
    if _s3_client is None:
        if not all([AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET]):
            raise ValueError(
                "AWS S3 environment variables not configured. "
                "Set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_S3_BUCKET."
            )
        import boto3

        _s3_client = boto3.client(
            "s3",
            aws_access_key_id=AWS_ACCESS_KEY_ID,
            aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
            region_name=AWS_S3_REGION,
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
    timestamp = int(time.time())
    key = f"avatars/{player_id}/{timestamp}.jpg"

    client.put_object(
        Bucket=AWS_S3_BUCKET,
        Key=key,
        Body=image_bytes,
        ContentType="image/jpeg",
    )

    url = f"https://{AWS_S3_BUCKET}.s3.{AWS_S3_REGION}.amazonaws.com/{key}"
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
        key = _extract_key_from_url(url)
        if not key:
            logger.warning(f"Could not extract S3 key from URL: {url}")
            return False

        client.delete_object(Bucket=AWS_S3_BUCKET, Key=key)
        logger.info(f"Deleted avatar from S3: {key}")
        return True
    except Exception as e:
        logger.error(f"Failed to delete avatar from S3: {e}")
        return False


def _extract_key_from_url(url: str) -> Optional[str]:
    """
    Extract the S3 object key from a full S3 URL.

    Handles URLs like:
      https://bucket.s3.region.amazonaws.com/avatars/123/456.jpg

    Args:
        url: Full S3 URL

    Returns:
        Object key string or None if parsing fails
    """
    try:
        parsed = urlparse(url)
        # Remove leading slash from path
        key = parsed.path.lstrip("/")
        return key if key else None
    except Exception:
        return None
