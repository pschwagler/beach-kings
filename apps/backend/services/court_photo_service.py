"""
Court photo processing service.

Validates, resizes, and converts court review photos to JPEG.
Reuses validation patterns from avatar_service.
"""

import logging
from io import BytesIO

from fastapi import UploadFile
from PIL import Image

logger = logging.getLogger(__name__)

# Validation constants
MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024  # 10MB
MAX_IMAGE_PIXELS = 25_000_000  # 25MP
MAX_DIMENSION = 1200  # Resize longest side to this
JPEG_QUALITY = 85
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"}

Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS


async def process_court_photo(file: UploadFile) -> bytes:
    """
    Validate, resize, and convert an uploaded court photo to JPEG.

    Args:
        file: Uploaded file from FastAPI

    Returns:
        Processed JPEG bytes

    Raises:
        ValueError: If file is invalid (too large, wrong type, corrupted)
    """
    content = await file.read()

    # Size check
    if len(content) > MAX_FILE_SIZE_BYTES:
        raise ValueError(
            f"File size exceeds maximum of {MAX_FILE_SIZE_BYTES // (1024 * 1024)}MB"
        )

    # Type check
    ct = file.content_type or ""
    if ct not in ALLOWED_CONTENT_TYPES:
        raise ValueError(f"Invalid file type '{ct}'. Allowed: JPEG, PNG, WebP, HEIC")

    try:
        img = Image.open(BytesIO(content))
        img.load()  # Force full decode to catch corrupted files
    except Image.DecompressionBombError:
        raise ValueError("Image dimensions too large")
    except Exception as e:
        raise ValueError(f"Invalid or corrupted image: {e}")

    # Convert to RGB (strip alpha / handle palette modes)
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")

    # Resize if either dimension exceeds MAX_DIMENSION
    w, h = img.size
    if w > MAX_DIMENSION or h > MAX_DIMENSION:
        ratio = MAX_DIMENSION / max(w, h)
        new_size = (int(w * ratio), int(h * ratio))
        img = img.resize(new_size, Image.LANCZOS)

    # Encode as JPEG
    buf = BytesIO()
    img.save(buf, format="JPEG", quality=JPEG_QUALITY)
    return buf.getvalue()
