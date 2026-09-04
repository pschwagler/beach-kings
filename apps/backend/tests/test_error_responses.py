"""Tests for safe HTTP error responses."""

import re

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from starlette.exceptions import HTTPException as StarletteHTTPException

from backend.api.main import safe_http_exception_handler


def _test_app() -> FastAPI:
    app = FastAPI()
    app.add_exception_handler(StarletteHTTPException, safe_http_exception_handler)

    @app.get("/internal-error")
    async def internal_error():
        raise HTTPException(status_code=500, detail="database-password-should-not-leak")

    @app.get("/not-found")
    async def not_found():
        raise HTTPException(status_code=404, detail="expected public detail")

    return app


def test_internal_error_detail_is_suppressed():
    response = TestClient(_test_app()).get(
        "/internal-error", headers={"X-Request-ID": "test-request-id"}
    )

    assert response.status_code == 500
    assert response.headers["X-Request-ID"] == "test-request-id"
    assert response.json() == {
        "detail": {"code": "internal_error", "request_id": "test-request-id"}
    }
    assert "database-password" not in response.text


def test_expected_client_error_detail_is_preserved():
    response = TestClient(_test_app()).get("/not-found")

    assert response.status_code == 404
    assert response.json() == {"detail": "expected public detail"}


def test_oversized_request_id_is_replaced_with_server_id():
    supplied = "a" * 129
    response = TestClient(_test_app()).get("/internal-error", headers={"X-Request-ID": supplied})

    request_id = response.headers["X-Request-ID"]
    assert request_id != supplied
    assert re.fullmatch(r"[0-9a-f]{32}", request_id)
    assert response.json()["detail"]["request_id"] == request_id


def test_log_unsafe_request_id_is_replaced_with_server_id():
    supplied = "unsafe request id %s"
    response = TestClient(_test_app()).get("/internal-error", headers={"X-Request-ID": supplied})

    request_id = response.headers["X-Request-ID"]
    assert request_id != supplied
    assert re.fullmatch(r"[0-9a-f]{32}", request_id)
    assert supplied not in response.text
