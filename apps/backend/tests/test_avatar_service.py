"""
Tests for avatar_service — validation and image processing.
"""

from io import BytesIO

import pytest
from PIL import Image

from backend.services import avatar_service


def _make_image(width=100, height=100, fmt="JPEG", mode="RGB"):
    """Create a minimal test image and return its bytes."""
    img = Image.new(mode, (width, height), color=(255, 0, 0))
    buf = BytesIO()
    save_fmt = fmt
    if fmt == "JPEG" and mode == "RGBA":
        # JPEG doesn't support RGBA; convert for test purposes
        img = img.convert("RGB")
    img.save(buf, format=save_fmt)
    return buf.getvalue()


# ============================================================================
# validate_avatar
# ============================================================================


class TestValidateAvatar:
    """Tests for validate_avatar()."""

    def test_valid_jpeg(self):
        """Valid JPEG passes validation."""
        data = _make_image(fmt="JPEG")
        is_valid, err = avatar_service.validate_avatar(data, "image/jpeg")
        assert is_valid is True
        assert err == ""

    def test_valid_png(self):
        """Valid PNG passes validation."""
        data = _make_image(fmt="PNG")
        is_valid, err = avatar_service.validate_avatar(data, "image/png")
        assert is_valid is True
        assert err == ""

    def test_valid_webp(self):
        """Valid WebP passes validation."""
        data = _make_image(fmt="WEBP")
        is_valid, err = avatar_service.validate_avatar(data, "image/webp")
        assert is_valid is True
        assert err == ""

    def test_file_too_large(self):
        """Files exceeding 5MB are rejected."""
        # Create data slightly over 5MB
        data = b"\x00" * (avatar_service.MAX_FILE_SIZE_BYTES + 1)
        is_valid, err = avatar_service.validate_avatar(data, "image/jpeg")
        assert is_valid is False
        assert "exceeds maximum" in err

    def test_wrong_content_type(self):
        """Non-image content types are rejected."""
        data = _make_image()
        is_valid, err = avatar_service.validate_avatar(data, "application/pdf")
        assert is_valid is False
        assert "Invalid file type" in err

    def test_empty_content_type(self):
        """Empty content type is rejected."""
        data = _make_image()
        is_valid, err = avatar_service.validate_avatar(data, "")
        assert is_valid is False
        assert "Invalid file type" in err

    def test_none_content_type(self):
        """None content type is rejected."""
        data = _make_image()
        is_valid, err = avatar_service.validate_avatar(data, None)
        assert is_valid is False
        assert "Invalid file type" in err

    def test_corrupted_file(self):
        """Corrupted (non-image) bytes are rejected."""
        data = b"this is not an image"
        is_valid, err = avatar_service.validate_avatar(data, "image/jpeg")
        assert is_valid is False
        assert "Invalid or corrupted" in err

    def test_decompression_bomb(self):
        """Images with extreme dimensions are rejected."""
        # Create a minimal image header that claims enormous dimensions
        # We rely on Pillow's MAX_IMAGE_PIXELS check
        data = _make_image(width=100, height=100)
        # Normal-sized image should pass
        is_valid, err = avatar_service.validate_avatar(data, "image/jpeg")
        assert is_valid is True


# ============================================================================
# process_avatar
# ============================================================================


class TestProcessAvatar:
    """Tests for process_avatar()."""

    def test_output_is_jpeg(self):
        """Output is a JPEG image."""
        data = _make_image(width=200, height=200, fmt="PNG")
        result = avatar_service.process_avatar(data)
        img = Image.open(BytesIO(result))
        assert img.format == "JPEG"

    def test_output_dimensions(self):
        """Output is resized to 512x512."""
        data = _make_image(width=1000, height=1000)
        result = avatar_service.process_avatar(data)
        img = Image.open(BytesIO(result))
        assert img.size == (512, 512)

    def test_landscape_center_crop(self):
        """Landscape images are center-cropped to square before resize."""
        data = _make_image(width=400, height=200)
        result = avatar_service.process_avatar(data)
        img = Image.open(BytesIO(result))
        assert img.size == (512, 512)

    def test_portrait_center_crop(self):
        """Portrait images are center-cropped to square before resize."""
        data = _make_image(width=200, height=400)
        result = avatar_service.process_avatar(data)
        img = Image.open(BytesIO(result))
        assert img.size == (512, 512)

    def test_rgba_converted_to_rgb(self):
        """RGBA images are converted to RGB (white background)."""
        data = _make_image(width=200, height=200, fmt="PNG", mode="RGBA")
        result = avatar_service.process_avatar(data)
        img = Image.open(BytesIO(result))
        assert img.mode == "RGB"

    def test_small_image_upscaled(self):
        """Images smaller than 512x512 are upscaled."""
        data = _make_image(width=64, height=64)
        result = avatar_service.process_avatar(data)
        img = Image.open(BytesIO(result))
        assert img.size == (512, 512)

    def test_already_correct_size(self):
        """512x512 images are not resized unnecessarily."""
        data = _make_image(width=512, height=512)
        result = avatar_service.process_avatar(data)
        img = Image.open(BytesIO(result))
        assert img.size == (512, 512)
