from __future__ import annotations

import base64
from pathlib import Path

from deployment.promote_provider_config import PROMOTED_KEYS, update_env_file


def _values() -> dict[str, str]:
    return {
        "GOOGLE_CLIENT_IDS": "ios-client.apps.googleusercontent.com",
        "APPLE_CLIENT_ID": "com.beachleague.app",
        "APPLE_CLIENT_IDS": "",
        "APPLE_TEAM_ID": "TEAM123",
        "APPLE_KEY_ID": "KEY123",
        "APPLE_PRIVATE_KEY": r"-----BEGIN PRIVATE KEY-----\nvalue\n-----END PRIVATE KEY-----",
    }


def _read(path: Path) -> dict[str, str]:
    return dict(line.split("=", 1) for line in path.read_text().splitlines() if "=" in line)


def test_promotes_only_allowlisted_values_and_preserves_existing_settings(tmp_path: Path) -> None:
    path = tmp_path / ".env"
    path.write_text("DATABASE_URL=postgres://example\nGOOGLE_CLIENT_ID=web-client\n")

    update_env_file(path, _values())

    result = _read(path)
    assert result["DATABASE_URL"] == "postgres://example"
    assert result["GOOGLE_CLIENT_ID"] == "web-client"
    assert {key: result[key] for key in PROMOTED_KEYS} == _values()
    assert len(base64.urlsafe_b64decode(result["APPLE_TOKEN_ENCRYPTION_KEY"])) == 32


def test_preserves_effective_last_token_encryption_key_and_removes_duplicates(
    tmp_path: Path,
) -> None:
    path = tmp_path / ".env"
    stale_key = base64.urlsafe_b64encode(b"a" * 32).decode()
    effective_key = base64.urlsafe_b64encode(b"b" * 32).decode()
    path.write_text(
        "APPLE_CLIENT_ID=old\n"
        "APPLE_CLIENT_ID=duplicate\n"
        f"APPLE_TOKEN_ENCRYPTION_KEY={stale_key}\n"
        f"APPLE_TOKEN_ENCRYPTION_KEY={effective_key}\n"
    )

    update_env_file(path, _values())
    update_env_file(path, _values())

    result = _read(path)
    assert result["APPLE_CLIENT_ID"] == "com.beachleague.app"
    assert result["APPLE_TOKEN_ENCRYPTION_KEY"] == effective_key
    assert path.read_text().count("APPLE_CLIENT_ID=") == 1
    assert path.read_text().count("APPLE_TOKEN_ENCRYPTION_KEY=") == 1


def test_generates_key_when_effective_last_token_value_is_empty(tmp_path: Path) -> None:
    path = tmp_path / ".env"
    stale_key = base64.urlsafe_b64encode(b"a" * 32).decode()
    path.write_text(f"APPLE_TOKEN_ENCRYPTION_KEY={stale_key}\nAPPLE_TOKEN_ENCRYPTION_KEY=\n")

    update_env_file(path, _values())

    result = _read(path)
    assert result["APPLE_TOKEN_ENCRYPTION_KEY"] != stale_key
    assert len(base64.urlsafe_b64decode(result["APPLE_TOKEN_ENCRYPTION_KEY"])) == 32
