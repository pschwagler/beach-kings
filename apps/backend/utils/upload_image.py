"""Bounded image decoding shared by public upload processors."""

from io import BytesIO

from PIL import Image
from pillow_heif import register_heif_opener

MAX_IMAGE_PIXELS = 25_000_000
PHOTO_FORMATS = ("JPEG", "PNG", "WEBP", "HEIF")


def open_upload_image(content: bytes) -> Image.Image:
    """Select approved decoders before parsing; never trust upload MIME labels."""
    register_heif_opener()
    Image.init()
    formats = tuple(name for name in PHOTO_FORMATS if name in Image.OPEN)
    image = Image.open(BytesIO(content), formats=formats)
    width, height = image.size
    if width <= 0 or height <= 0 or width * height > MAX_IMAGE_PIXELS:
        image.close()
        raise Image.DecompressionBombError("Image dimensions too large")
    return image
