"""
Avatar service for validating and processing avatar image uploads.

Handles image validation (size, type), conversion to RGB, center-crop to square,
resize to 512x512, and JPEG compression.
"""

import logging
from io import BytesIO
from typing import Tuple

from PIL import Image

logger = logging.getLogger(__name__)

# Validation constants
MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024  # 5MB
AVATAR_SIZE = 512  # Output size in pixels (square)
JPEG_QUALITY = 85
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"}


def validate_avatar(file_bytes: bytes, content_type: str) -> Tuple[bool, str]:
    """
    Validate an uploaded avatar file.

    Checks file size and content type. Attempts to open with Pillow to verify
    the file is a real, non-corrupted image.

    Args:
        file_bytes: Raw uploaded file bytes
        content_type: MIME type from the upload

    Returns:
        Tuple of (is_valid, error_message). error_message is empty string if valid.
    """
    if len(file_bytes) > MAX_FILE_SIZE_BYTES:
        return False, f"File size exceeds maximum of {MAX_FILE_SIZE_BYTES // (1024 * 1024)}MB"

    if not content_type or content_type not in ALLOWED_CONTENT_TYPES:
        return False, f"Invalid file type '{content_type}'. Allowed: JPEG, PNG, WebP, HEIC"

    try:
        img = Image.open(BytesIO(file_bytes))
        img.verify()
    except Exception as e:
        return False, f"Invalid or corrupted image file: {str(e)}"

    return True, ""


def process_avatar(image_bytes: bytes) -> bytes:
    """
    Process an avatar image: convert to RGB, center-crop to square, resize to 512x512, compress as JPEG.

    Args:
        image_bytes: Raw image bytes (any supported format)

    Returns:
        Processed JPEG image bytes
    """
    img = Image.open(BytesIO(image_bytes))

    # Convert to RGB (handles RGBA, P, LA, etc.)
    if img.mode in ("RGBA", "P", "LA"):
        background = Image.new("RGB", img.size, (255, 255, 255))
        if img.mode == "P":
            img = img.convert("RGBA")
        background.paste(img, mask=img.split()[-1] if img.mode in ("RGBA", "LA") else None)
        img = background
    elif img.mode != "RGB":
        img = img.convert("RGB")

    # Center-crop to square
    width, height = img.size
    if width != height:
        side = min(width, height)
        left = (width - side) // 2
        top = (height - side) // 2
        img = img.crop((left, top, left + side, top + side))

    # Resize to target dimensions
    if img.size != (AVATAR_SIZE, AVATAR_SIZE):
        img = img.resize((AVATAR_SIZE, AVATAR_SIZE), Image.Resampling.LANCZOS)

    # Compress as JPEG
    output = BytesIO()
    img.save(output, format="JPEG", quality=JPEG_QUALITY, optimize=True)
    return output.getvalue()
