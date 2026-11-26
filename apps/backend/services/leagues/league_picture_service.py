"""Normalize a league picture without retaining EXIF or using public media storage."""

from io import BytesIO

from PIL import Image, ImageOps, UnidentifiedImageError

from backend.utils.upload_image import open_upload_image

MAX_UPLOAD_BYTES = 5 * 1024 * 1024
MAX_STORED_BYTES = 512 * 1024
MAX_PIXELS = 25_000_000
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"}


def process_picture(content: bytes, content_type: str | None) -> bytes:
    if not content or len(content) > MAX_UPLOAD_BYTES:
        raise ValueError("Choose a photo smaller than 5 MB.")
    if content_type not in ALLOWED_TYPES:
        raise ValueError("Choose a JPEG, PNG, or WebP photo.")
    try:
        with open_upload_image(content) as source:
            if source.width * source.height > MAX_PIXELS:
                raise ValueError("Choose a photo smaller than 25 megapixels.")
            image = ImageOps.exif_transpose(source)
            # Composite transparency onto a neutral background before JPEG encoding.
            rgba = image.convert("RGBA")
            background = Image.new("RGBA", rgba.size, "white")
            image = Image.alpha_composite(background, rgba).convert("RGB")
            image.thumbnail((1024, 768), resample=Image.Resampling.LANCZOS)
            for quality in (82, 72, 62):
                output = BytesIO()
                image.info.clear()
                image.save(output, format="JPEG", quality=quality, optimize=True)
                result = output.getvalue()
                if len(result) <= MAX_STORED_BYTES:
                    return result
            raise ValueError("This photo could not be compressed. Choose another photo.")
    except (Image.DecompressionBombError, Image.DecompressionBombWarning) as error:
        raise ValueError("Choose a smaller photo.") from error
    except (UnidentifiedImageError, OSError) as error:
        raise ValueError("The selected photo could not be read.") from error


def make_thumbnail(content: bytes) -> bytes:
    """Crop an already normalized league picture for a small square display."""
    with Image.open(BytesIO(content), formats=["JPEG"]) as source:
        image = ImageOps.fit(source, (144, 144), method=Image.Resampling.LANCZOS)
        output = BytesIO()
        image.save(output, format="JPEG", quality=78, optimize=True)
        return output.getvalue()
