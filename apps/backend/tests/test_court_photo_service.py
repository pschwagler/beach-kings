"""
Unit tests for court_photo_service.py.

Tests _process_image_bytes directly using real PIL images constructed in
memory (no mocking needed for PIL), and tests process_court_photo using
a mock UploadFile.
"""

import io
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from PIL import Image

from backend.services.court_photo_service import (
    _process_image_bytes,
    process_court_photo,
    MAX_DIMENSION,
    MAX_FILE_SIZE_BYTES,
    ALLOWED_CONTENT_TYPES,
)


# ---------------------------------------------------------------------------
# Helpers: create in-memory PIL images as bytes
# ---------------------------------------------------------------------------


def _make_jpeg_bytes(width: int = 100, height: int = 100, color: tuple = (255, 0, 0)) -> bytes:
    """Create a small JPEG image in memory and return its bytes."""
    img = Image.new("RGB", (width, height), color=color)
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


def _make_png_bytes(width: int = 100, height: int = 100, mode: str = "RGB") -> bytes:
    """Create a PNG image (RGB or RGBA) in memory."""
    img = Image.new(mode, (width, height), color=(0, 128, 255, 255) if mode == "RGBA" else (0, 128, 255))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _make_palette_png_bytes(width: int = 50, height: int = 50) -> bytes:
    """Create a palette-mode (P) PNG image."""
    img = Image.new("P", (width, height))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _make_large_jpeg_bytes(width: int, height: int) -> bytes:
    """Create an image that exceeds MAX_DIMENSION."""
    img = Image.new("RGB", (width, height), color=(100, 149, 237))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


# ---------------------------------------------------------------------------
# _process_image_bytes
# ---------------------------------------------------------------------------


class TestProcessImageBytes:
    def test_valid_rgb_jpeg_returns_bytes(self):
        content = _make_jpeg_bytes()
        result = _process_image_bytes(content, "image/jpeg")
        assert isinstance(result, bytes)
        assert len(result) > 0

    def test_output_is_valid_jpeg(self):
        content = _make_jpeg_bytes()
        result = _process_image_bytes(content, "image/jpeg")
        # Verify it is a JPEG by re-parsing
        img = Image.open(io.BytesIO(result))
        assert img.format == "JPEG"

    def test_rgb_mode_preserved(self):
        content = _make_jpeg_bytes()
        result = _process_image_bytes(content, "image/jpeg")
        img = Image.open(io.BytesIO(result))
        assert img.mode == "RGB"

    def test_rgba_image_converted_to_rgb(self):
        content = _make_png_bytes(mode="RGBA")
        result = _process_image_bytes(content, "image/png")
        img = Image.open(io.BytesIO(result))
        assert img.mode == "RGB"

    def test_palette_mode_converted_to_rgb(self):
        content = _make_palette_png_bytes()
        result = _process_image_bytes(content, "image/png")
        img = Image.open(io.BytesIO(result))
        assert img.mode == "RGB"

    def test_image_smaller_than_max_dimension_not_resized(self):
        w, h = 200, 150
        content = _make_jpeg_bytes(width=w, height=h)
        result = _process_image_bytes(content, "image/jpeg")
        img = Image.open(io.BytesIO(result))
        assert img.size == (w, h)

    def test_wide_image_resized_to_max_dimension_width(self):
        """Image wider than MAX_DIMENSION should be scaled down."""
        wide = MAX_DIMENSION + 400
        tall = 300
        content = _make_large_jpeg_bytes(wide, tall)
        result = _process_image_bytes(content, "image/jpeg")
        img = Image.open(io.BytesIO(result))
        assert img.size[0] <= MAX_DIMENSION
        assert img.size[1] <= MAX_DIMENSION

    def test_tall_image_resized_to_max_dimension_height(self):
        """Image taller than MAX_DIMENSION should be scaled down."""
        wide = 300
        tall = MAX_DIMENSION + 400
        content = _make_large_jpeg_bytes(wide, tall)
        result = _process_image_bytes(content, "image/jpeg")
        img = Image.open(io.BytesIO(result))
        assert img.size[0] <= MAX_DIMENSION
        assert img.size[1] <= MAX_DIMENSION

    def test_large_square_image_resized(self):
        """Square image larger than MAX_DIMENSION should have both sides <= MAX_DIMENSION."""
        side = MAX_DIMENSION + 500
        content = _make_large_jpeg_bytes(side, side)
        result = _process_image_bytes(content, "image/jpeg")
        img = Image.open(io.BytesIO(result))
        assert img.size[0] <= MAX_DIMENSION
        assert img.size[1] <= MAX_DIMENSION

    def test_aspect_ratio_preserved_on_resize(self):
        """Resizing should preserve aspect ratio within 1px rounding."""
        w = MAX_DIMENSION + 600
        h = MAX_DIMENSION + 200
        original_ratio = w / h
        content = _make_large_jpeg_bytes(w, h)
        result = _process_image_bytes(content, "image/jpeg")
        img = Image.open(io.BytesIO(result))
        new_ratio = img.size[0] / img.size[1]
        assert abs(new_ratio - original_ratio) < 0.02

    def test_image_at_exact_max_dimension_not_resized(self):
        """Image with longest side exactly MAX_DIMENSION should not be resized."""
        content = _make_jpeg_bytes(width=MAX_DIMENSION, height=MAX_DIMENSION // 2)
        result = _process_image_bytes(content, "image/jpeg")
        img = Image.open(io.BytesIO(result))
        assert img.size[0] == MAX_DIMENSION

    def test_corrupted_bytes_raises_value_error(self):
        with pytest.raises(ValueError, match="Invalid or corrupted image"):
            _process_image_bytes(b"this is not an image", "image/jpeg")

    def test_empty_bytes_raises_value_error(self):
        with pytest.raises(ValueError, match="Invalid or corrupted image"):
            _process_image_bytes(b"", "image/jpeg")

    def test_truncated_jpeg_raises_value_error(self):
        content = _make_jpeg_bytes()
        truncated = content[: len(content) // 2]
        with pytest.raises(ValueError):
            _process_image_bytes(truncated, "image/jpeg")

    def test_decompression_bomb_raises_value_error(self):
        """PIL.Image.DecompressionBombError should be re-raised as ValueError."""
        with patch("backend.services.court_photo_service.Image.open") as mock_open:
            mock_img = MagicMock()
            mock_img.load.side_effect = Image.DecompressionBombError("Too large")
            mock_open.return_value = mock_img
            with pytest.raises(ValueError, match="Image dimensions too large"):
                _process_image_bytes(b"fake bytes", "image/jpeg")

    def test_valid_png_returns_jpeg_output(self):
        content = _make_png_bytes()
        result = _process_image_bytes(content, "image/png")
        img = Image.open(io.BytesIO(result))
        assert img.format == "JPEG"


# ---------------------------------------------------------------------------
# process_court_photo (async, uses UploadFile mock)
# ---------------------------------------------------------------------------


def _mock_upload_file(content: bytes, content_type: str = "image/jpeg") -> MagicMock:
    """Return an AsyncMock UploadFile."""
    file = MagicMock()
    file.content_type = content_type
    file.read = AsyncMock(return_value=content)
    return file


class TestProcessCourtPhoto:
    @pytest.mark.asyncio
    async def test_valid_jpeg_returns_bytes(self):
        content = _make_jpeg_bytes()
        file = _mock_upload_file(content, "image/jpeg")
        result = await process_court_photo(file)
        assert isinstance(result, bytes)
        assert len(result) > 0

    @pytest.mark.asyncio
    async def test_valid_png_accepted(self):
        content = _make_png_bytes()
        file = _mock_upload_file(content, "image/png")
        result = await process_court_photo(file)
        assert isinstance(result, bytes)

    @pytest.mark.asyncio
    async def test_valid_webp_accepted(self):
        """WebP content type should be accepted (processing may vary)."""
        # Use a PNG as content but set content_type to webp — the type check
        # is against content_type, actual decoding handles format
        content = _make_png_bytes()
        file = _mock_upload_file(content, "image/webp")
        # May raise if content doesn't match — just verify type check passes
        try:
            result = await process_court_photo(file)
            assert isinstance(result, bytes)
        except ValueError as e:
            # If PIL can't decode as webp, that's an image corruption error, not type error
            assert "type" not in str(e).lower()

    @pytest.mark.asyncio
    async def test_file_too_large_raises_value_error(self):
        # Create content just over MAX_FILE_SIZE_BYTES
        oversized = b"X" * (MAX_FILE_SIZE_BYTES + 1)
        file = _mock_upload_file(oversized, "image/jpeg")
        with pytest.raises(ValueError, match="File size exceeds"):
            await process_court_photo(file)

    @pytest.mark.asyncio
    async def test_invalid_content_type_raises_value_error(self):
        content = _make_jpeg_bytes()
        file = _mock_upload_file(content, "text/plain")
        with pytest.raises(ValueError, match="Invalid file type"):
            await process_court_photo(file)

    @pytest.mark.asyncio
    async def test_gif_content_type_rejected(self):
        content = _make_jpeg_bytes()
        file = _mock_upload_file(content, "image/gif")
        with pytest.raises(ValueError, match="Invalid file type"):
            await process_court_photo(file)

    @pytest.mark.asyncio
    async def test_missing_content_type_rejected(self):
        content = _make_jpeg_bytes()
        file = _mock_upload_file(content, None)
        with pytest.raises(ValueError, match="Invalid file type"):
            await process_court_photo(file)

    @pytest.mark.asyncio
    async def test_corrupted_image_raises_value_error(self):
        corrupted = b"notanimage" * 100
        file = _mock_upload_file(corrupted, "image/jpeg")
        with pytest.raises(ValueError):
            await process_court_photo(file)

    @pytest.mark.asyncio
    async def test_output_is_valid_jpeg(self):
        content = _make_jpeg_bytes()
        file = _mock_upload_file(content, "image/jpeg")
        result = await process_court_photo(file)
        img = Image.open(io.BytesIO(result))
        assert img.format == "JPEG"

    @pytest.mark.asyncio
    async def test_large_image_resized(self):
        w = MAX_DIMENSION + 500
        h = MAX_DIMENSION + 200
        content = _make_large_jpeg_bytes(w, h)
        file = _mock_upload_file(content, "image/jpeg")
        result = await process_court_photo(file)
        img = Image.open(io.BytesIO(result))
        assert img.size[0] <= MAX_DIMENSION
        assert img.size[1] <= MAX_DIMENSION

    @pytest.mark.parametrize("ct", sorted(ALLOWED_CONTENT_TYPES))
    @pytest.mark.asyncio
    async def test_all_allowed_content_types_pass_type_check(self, ct):
        """Each allowed content type should pass the type gate (PIL errors ok)."""
        content = _make_jpeg_bytes()
        file = _mock_upload_file(content, ct)
        try:
            await process_court_photo(file)
        except ValueError as e:
            assert "Invalid file type" not in str(e)
