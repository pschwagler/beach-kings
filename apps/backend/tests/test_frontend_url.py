"""Tests for deployment-aware frontend URL generation."""

from backend.utils.frontend_url import build_invite_url, get_frontend_base_url


def test_local_frontend_url_is_default(monkeypatch):
    monkeypatch.delenv("FRONTEND_URL", raising=False)
    monkeypatch.setenv("ENV", "development")
    monkeypatch.delenv("FRONTEND_PORT", raising=False)

    assert get_frontend_base_url() == "http://localhost:3000"
    assert build_invite_url("local-token") == "http://localhost:3000/invite/local-token"


def test_local_frontend_url_uses_configured_port(monkeypatch):
    monkeypatch.delenv("FRONTEND_URL", raising=False)
    monkeypatch.setenv("ENV", "test")
    monkeypatch.setenv("FRONTEND_PORT", "3002")

    assert build_invite_url("test-token") == "http://localhost:3002/invite/test-token"


def test_explicit_deployment_url_takes_precedence(monkeypatch):
    monkeypatch.setenv("ENV", "production")
    monkeypatch.setenv("FRONTEND_URL", "https://preview.example.com/")

    assert build_invite_url("preview-token") == (
        "https://preview.example.com/invite/preview-token"
    )


def test_production_uses_canonical_fallback(monkeypatch):
    monkeypatch.delenv("FRONTEND_URL", raising=False)
    monkeypatch.setenv("ENV", "production")

    assert build_invite_url("prod-token") == ("https://beachleaguevb.com/invite/prod-token")
