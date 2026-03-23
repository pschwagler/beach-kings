"""
Unit tests for geocoding_service.py.

Uses unittest.mock.patch and AsyncMock to mock httpx.AsyncClient.
No DB or real HTTP calls needed.
"""

import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from backend.services.geocoding_service import geocode_address, _get_mapbox_token


# ---------------------------------------------------------------------------
# Helper: build a mock httpx response
# ---------------------------------------------------------------------------


def _mock_response(json_data: dict, status_code: int = 200) -> MagicMock:
    """Return a MagicMock that behaves like an httpx.Response."""
    resp = MagicMock()
    resp.status_code = status_code
    resp.json.return_value = json_data

    if status_code >= 400:
        import httpx
        resp.raise_for_status.side_effect = httpx.HTTPStatusError(
            "HTTP Error",
            request=MagicMock(),
            response=MagicMock(status_code=status_code),
        )
    else:
        resp.raise_for_status.return_value = None

    return resp


def _make_feature(lng: float, lat: float) -> dict:
    """Return a minimal Mapbox feature dict."""
    return {
        "center": [lng, lat],
        "place_name": "123 Test St, San Diego, CA 92101, United States",
    }


# ---------------------------------------------------------------------------
# _get_mapbox_token
# ---------------------------------------------------------------------------


class TestGetMapboxToken:
    def test_returns_token_when_set(self):
        with patch.dict(os.environ, {"MAPBOX_ACCESS_TOKEN": "pk.testtoken"}):
            assert _get_mapbox_token() == "pk.testtoken"

    def test_returns_none_when_not_set(self):
        env = {k: v for k, v in os.environ.items() if k != "MAPBOX_ACCESS_TOKEN"}
        with patch.dict(os.environ, env, clear=True):
            assert _get_mapbox_token() is None


# ---------------------------------------------------------------------------
# geocode_address — no token
# ---------------------------------------------------------------------------


class TestGeocodeAddressNoToken:
    @pytest.mark.asyncio
    async def test_no_token_returns_none_none(self):
        env = {k: v for k, v in os.environ.items() if k != "MAPBOX_ACCESS_TOKEN"}
        with patch.dict(os.environ, env, clear=True):
            lat, lng = await geocode_address("123 Main St")
        assert lat is None
        assert lng is None

    @pytest.mark.asyncio
    async def test_empty_token_returns_none_none(self):
        with patch.dict(os.environ, {"MAPBOX_ACCESS_TOKEN": ""}):
            lat, lng = await geocode_address("123 Main St")
        assert lat is None
        assert lng is None


# ---------------------------------------------------------------------------
# geocode_address — successful response
# ---------------------------------------------------------------------------


class TestGeocodeAddressSuccess:
    @pytest.mark.asyncio
    async def test_returns_correct_lat_lng(self):
        resp = _mock_response({"features": [_make_feature(-117.1611, 32.7157)]})

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=resp)

        with (
            patch.dict(os.environ, {"MAPBOX_ACCESS_TOKEN": "pk.test"}),
            patch("backend.services.geocoding_service.httpx.AsyncClient") as MockClient,
        ):
            MockClient.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=False)

            lat, lng = await geocode_address("1600 Amphitheatre Parkway, Mountain View, CA")

        assert lat == pytest.approx(32.7157)
        assert lng == pytest.approx(-117.1611)

    @pytest.mark.asyncio
    async def test_returns_float_types(self):
        resp = _mock_response({"features": [_make_feature(-118.2437, 34.0522)]})

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=resp)

        with (
            patch.dict(os.environ, {"MAPBOX_ACCESS_TOKEN": "pk.test"}),
            patch("backend.services.geocoding_service.httpx.AsyncClient") as MockClient,
        ):
            MockClient.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=False)

            lat, lng = await geocode_address("Los Angeles, CA")

        assert isinstance(lat, float)
        assert isinstance(lng, float)

    @pytest.mark.asyncio
    async def test_uses_first_feature_when_multiple(self):
        resp = _mock_response(
            {
                "features": [
                    _make_feature(-117.1611, 32.7157),
                    _make_feature(-118.2437, 34.0522),
                ]
            }
        )

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=resp)

        with (
            patch.dict(os.environ, {"MAPBOX_ACCESS_TOKEN": "pk.test"}),
            patch("backend.services.geocoding_service.httpx.AsyncClient") as MockClient,
        ):
            MockClient.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=False)

            lat, lng = await geocode_address("San Diego, CA")

        assert lat == pytest.approx(32.7157)


# ---------------------------------------------------------------------------
# geocode_address — empty features
# ---------------------------------------------------------------------------


class TestGeocodeAddressEmptyFeatures:
    @pytest.mark.asyncio
    async def test_empty_features_returns_none_none(self):
        resp = _mock_response({"features": []})

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=resp)

        with (
            patch.dict(os.environ, {"MAPBOX_ACCESS_TOKEN": "pk.test"}),
            patch("backend.services.geocoding_service.httpx.AsyncClient") as MockClient,
        ):
            MockClient.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=False)

            lat, lng = await geocode_address("Nowhere 99999")

        assert lat is None
        assert lng is None

    @pytest.mark.asyncio
    async def test_missing_features_key_returns_none_none(self):
        resp = _mock_response({})

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=resp)

        with (
            patch.dict(os.environ, {"MAPBOX_ACCESS_TOKEN": "pk.test"}),
            patch("backend.services.geocoding_service.httpx.AsyncClient") as MockClient,
        ):
            MockClient.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=False)

            lat, lng = await geocode_address("Nowhere 99999")

        assert lat is None
        assert lng is None


# ---------------------------------------------------------------------------
# geocode_address — HTTP errors
# ---------------------------------------------------------------------------


class TestGeocodeAddressHttpErrors:
    @pytest.mark.asyncio
    async def test_http_error_returns_none_none(self):
        import httpx

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(
            side_effect=httpx.HTTPStatusError(
                "404 Not Found",
                request=MagicMock(),
                response=MagicMock(status_code=404),
            )
        )

        with (
            patch.dict(os.environ, {"MAPBOX_ACCESS_TOKEN": "pk.test"}),
            patch("backend.services.geocoding_service.httpx.AsyncClient") as MockClient,
        ):
            MockClient.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=False)

            lat, lng = await geocode_address("Triggering HTTP error")

        assert lat is None
        assert lng is None

    @pytest.mark.asyncio
    async def test_500_error_returns_none_none(self):
        import httpx

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(
            side_effect=httpx.HTTPStatusError(
                "500 Internal Server Error",
                request=MagicMock(),
                response=MagicMock(status_code=500),
            )
        )

        with (
            patch.dict(os.environ, {"MAPBOX_ACCESS_TOKEN": "pk.test"}),
            patch("backend.services.geocoding_service.httpx.AsyncClient") as MockClient,
        ):
            MockClient.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=False)

            lat, lng = await geocode_address("Server error address")

        assert lat is None
        assert lng is None


# ---------------------------------------------------------------------------
# geocode_address — network / timeout errors
# ---------------------------------------------------------------------------


class TestGeocodeAddressNetworkErrors:
    @pytest.mark.asyncio
    async def test_timeout_returns_none_none(self):
        import httpx

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(side_effect=httpx.TimeoutException("Timeout"))

        with (
            patch.dict(os.environ, {"MAPBOX_ACCESS_TOKEN": "pk.test"}),
            patch("backend.services.geocoding_service.httpx.AsyncClient") as MockClient,
        ):
            MockClient.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=False)

            lat, lng = await geocode_address("Timeout address")

        assert lat is None
        assert lng is None

    @pytest.mark.asyncio
    async def test_connection_error_returns_none_none(self):
        import httpx

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(
            side_effect=httpx.ConnectError("Connection refused")
        )

        with (
            patch.dict(os.environ, {"MAPBOX_ACCESS_TOKEN": "pk.test"}),
            patch("backend.services.geocoding_service.httpx.AsyncClient") as MockClient,
        ):
            MockClient.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=False)

            lat, lng = await geocode_address("Unreachable address")

        assert lat is None
        assert lng is None

    @pytest.mark.asyncio
    async def test_generic_exception_returns_none_none(self):
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(side_effect=RuntimeError("Unexpected error"))

        with (
            patch.dict(os.environ, {"MAPBOX_ACCESS_TOKEN": "pk.test"}),
            patch("backend.services.geocoding_service.httpx.AsyncClient") as MockClient,
        ):
            MockClient.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=False)

            lat, lng = await geocode_address("Error-prone address")

        assert lat is None
        assert lng is None

    @pytest.mark.asyncio
    async def test_raise_for_status_raises_returns_none_none(self):
        """raise_for_status() itself throwing should be caught gracefully."""
        import httpx

        resp = MagicMock()
        resp.raise_for_status.side_effect = httpx.HTTPStatusError(
            "Forbidden", request=MagicMock(), response=MagicMock(status_code=403)
        )
        resp.json.return_value = {"features": []}

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=resp)

        with (
            patch.dict(os.environ, {"MAPBOX_ACCESS_TOKEN": "pk.test"}),
            patch("backend.services.geocoding_service.httpx.AsyncClient") as MockClient,
        ):
            MockClient.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=False)

            lat, lng = await geocode_address("Forbidden address")

        assert lat is None
        assert lng is None
