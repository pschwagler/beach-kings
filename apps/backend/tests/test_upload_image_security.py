"""Real-file regressions for decoder selection and upload bounds."""

from io import BytesIO

import pytest
from PIL import Image, UnidentifiedImageError

from backend.services import avatar_service, court_photo_service, photo_match_service
from backend.utils import upload_image


def image_bytes(fmt="PNG", size=(16, 12)):
    output = BytesIO()
    Image.new("RGB", size, "red").save(output, format=fmt)
    return output.getvalue()


@pytest.mark.parametrize("fmt", ["JPEG", "PNG", "WEBP"])
def test_supported_photos_decode(fmt):
    with upload_image.open_upload_image(image_bytes(fmt)) as image:
        image.load()
        assert image.size == (16, 12)


@pytest.mark.parametrize("fmt", ["GIF", "TIFF", "BMP"])
def test_disallowed_decoders_are_never_selected_for_mislabeled_uploads(fmt):
    content = image_bytes(fmt)
    with pytest.raises(UnidentifiedImageError):
        upload_image.open_upload_image(content)
    assert avatar_service.validate_avatar(content, "image/jpeg")[0] is False
    assert photo_match_service.validate_image_file(content, "image/jpeg", "photo.jpg")[0] is False
    with pytest.raises(ValueError):
        court_photo_service._process_image_bytes(content, "image/jpeg")
    with pytest.raises(UnidentifiedImageError):
        avatar_service.process_avatar(content)
    with pytest.raises(UnidentifiedImageError):
        photo_match_service.preprocess_image(content)


def test_pixel_limit_applies_before_decode(monkeypatch):
    monkeypatch.setattr(upload_image, "MAX_IMAGE_PIXELS", 100)
    with pytest.raises(Image.DecompressionBombError):
        upload_image.open_upload_image(image_bytes(size=(11, 10)))


def test_reencoded_photos_drop_private_metadata():
    output = BytesIO()
    exif = Image.Exif()
    exif[270] = "private image description"
    Image.new("RGB", (16, 12), "red").save(output, format="JPEG", exif=exif)
    for result in [
        avatar_service.process_avatar(output.getvalue()),
        court_photo_service._process_image_bytes(output.getvalue(), "image/jpeg"),
        photo_match_service.preprocess_image(output.getvalue())[0],
    ]:
        with Image.open(BytesIO(result)) as image:
            assert not image.getexif()
