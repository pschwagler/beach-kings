"""Private picture access, bounded decoding, and admin write behavior."""

import base64
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image

from backend.api.routes import league_pictures as routes
from backend.services.leagues.league_picture_service import MAX_UPLOAD_BYTES, process_picture


def image_bytes(color="blue"):
    image = Image.new("RGB", (80, 60), color)
    output = BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


@pytest.fixture
def setup(monkeypatch):
    app = FastAPI()
    app.include_router(routes.router)
    db = SimpleNamespace(
        scalar=AsyncMock(return_value="admin"),
        get=AsyncMock(return_value=None),
        execute=AsyncMock(),
        commit=AsyncMock(),
    )
    app.dependency_overrides[routes.require_user] = lambda: {"id": 7}
    app.dependency_overrides[routes.get_db_session] = lambda: db
    monkeypatch.setattr(routes.interaction_policy, "enforce_user_ugc_creation", AsyncMock())
    return TestClient(app), db


@pytest.mark.parametrize("role", ["admin", "member"])
def test_member_can_read_private_picture_with_no_public_cache(setup, role):
    client, db = setup
    db.scalar.return_value = role
    db.get.return_value = SimpleNamespace(image_bytes=b"normalized-jpeg", revision="revision1")
    response = client.get("/api/leagues/42/picture")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "private, no-store"
    assert response.json() == {
        "data_uri": "data:image/jpeg;base64," + base64.b64encode(b"normalized-jpeg").decode(),
        "revision": "revision1",
    }


@pytest.mark.parametrize("method", ["get", "post", "delete"])
def test_nonmember_including_platform_admin_cannot_access_picture(setup, method):
    client, db = setup
    db.scalar.return_value = None
    kwargs = (
        {"files": {"file": ("photo.png", image_bytes(), "image/png")}} if method == "post" else {}
    )
    response = getattr(client, method)("/api/leagues/42/picture", **kwargs)
    assert response.status_code == 403
    db.get.assert_not_awaited()
    db.execute.assert_not_awaited()
    db.commit.assert_not_awaited()


@pytest.mark.parametrize("method", ["post", "delete"])
def test_regular_member_cannot_change_picture(setup, method):
    client, db = setup
    db.scalar.return_value = "member"
    kwargs = (
        {"files": {"file": ("photo.png", image_bytes(), "image/png")}} if method == "post" else {}
    )
    response = getattr(client, method)("/api/leagues/42/picture", **kwargs)
    assert response.status_code == 403
    db.execute.assert_not_awaited()


def test_empty_picture_has_explicit_null_response(setup):
    client, _ = setup
    assert client.get("/api/leagues/42/picture").json() == {"data_uri": None, "revision": None}


def test_anonymous_viewer_cannot_read_picture(setup):
    client, db = setup
    client.app.dependency_overrides.pop(routes.require_user)
    assert client.get("/api/leagues/42/picture").status_code in {401, 403}
    db.scalar.assert_not_awaited()


def test_admin_upload_normalizes_and_replacement_has_new_identity(setup):
    client, db = setup
    first = client.post(
        "/api/leagues/42/picture", files={"file": ("x.png", image_bytes(), "image/png")}
    )
    second = client.post(
        "/api/leagues/42/picture", files={"file": ("x.png", image_bytes("red"), "image/png")}
    )
    assert first.status_code == second.status_code == 200
    assert first.json()["revision"] != second.json()["revision"]
    assert first.json()["data_uri"] != second.json()["data_uri"]
    encoded = first.json()["data_uri"].split(",", 1)[1]
    with Image.open(BytesIO(base64.b64decode(encoded))) as image:
        assert image.format == "JPEG"
        assert image.size == (80, 60)
        assert not image.getexif()
    assert first.headers["cache-control"] == "private, no-store"
    assert db.commit.await_count == 2


@pytest.mark.parametrize(
    "content,mime",
    [
        (b"not an image", "image/png"),
        (b"gif", "image/gif"),
        (b"x" * (MAX_UPLOAD_BYTES + 1), "image/jpeg"),
    ],
)
def test_invalid_upload_does_not_replace_existing_picture(setup, content, mime):
    client, db = setup
    response = client.post("/api/leagues/42/picture", files={"file": ("x", content, mime)})
    assert response.status_code == 400
    db.execute.assert_not_awaited()
    db.commit.assert_not_awaited()


def test_admin_remove_is_idempotent_and_private(setup):
    client, db = setup
    response = client.delete("/api/leagues/42/picture")
    assert response.status_code == 200
    assert response.json() == {"data_uri": None, "revision": None}
    assert response.headers["cache-control"] == "private, no-store"
    db.commit.assert_awaited_once()


def test_decoder_rejects_excessive_dimensions_before_loading_pixels(monkeypatch):
    fake = SimpleNamespace(width=6000, height=6000)

    class Source:
        def __enter__(self):
            return fake

        def __exit__(self, *args):
            return None

    monkeypatch.setattr(Image, "open", lambda _: Source())
    with pytest.raises(ValueError, match="25 megapixels"):
        process_picture(b"image", "image/jpeg")


def test_picture_keeps_aspect_ratio_and_removes_uploaded_exif():
    source = Image.new("RGB", (1600, 1200), "blue")
    exif = Image.Exif()
    exif[315] = "Private image author"
    output = BytesIO()
    source.save(output, format="JPEG", exif=exif)
    result = process_picture(output.getvalue(), "image/jpeg")
    with Image.open(BytesIO(result)) as image:
        assert image.size == (1024, 768)
        assert not image.getexif()


def test_restricted_creator_is_rejected_before_picture_is_written(setup, monkeypatch):
    client, db = setup
    monkeypatch.setattr(
        routes.interaction_policy,
        "enforce_user_ugc_creation",
        AsyncMock(
            side_effect=routes.interaction_policy.InteractionUnavailable(
                routes.interaction_policy.InteractionDecision(
                    action=routes.interaction_policy.InteractionAction.USER_GENERATED_CONTENT,
                    allowed=False,
                    denial_reason=routes.interaction_policy.DenialReason.VIEWER_RESTRICTED,
                    blocked_by_viewer=False,
                    viewer_restricted=True,
                )
            ),
        ),
    )
    response = client.post(
        "/api/leagues/42/picture", files={"file": ("x.png", image_bytes(), "image/png")}
    )
    assert response.status_code == 409
    db.execute.assert_not_awaited()
    db.commit.assert_not_awaited()
