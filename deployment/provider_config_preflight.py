#!/usr/bin/env python3
"""Fail closed on provider-validation configuration without printing values."""

import argparse
import base64
import binascii
import json
import os
from pathlib import Path
from typing import Mapping


GOOGLE_SCHEME_PREFIX = "com.googleusercontent.apps."


def _present(config: Mapping[str, str], name: str) -> bool:
    return bool(config.get(name, "").strip())


def _audiences(config: Mapping[str, str], primary: str, additional: str) -> set[str]:
    values = []
    if _present(config, primary):
        values.append(config[primary].strip())
    if _present(config, additional):
        values.extend(config[additional].split(","))
    return {value.strip() for value in values if value.strip()}


def _load_app_identity(app_config_path: Path) -> tuple[str | None, str | None]:
    try:
        app_config = json.loads(app_config_path.read_text(encoding="utf-8"))
        ios = app_config["expo"]["ios"]
        bundle_identifier = ios["bundleIdentifier"].strip()
        schemes = [
            scheme
            for url_type in ios.get("infoPlist", {}).get("CFBundleURLTypes", [])
            for scheme in url_type.get("CFBundleURLSchemes", [])
            if isinstance(scheme, str) and scheme.startswith(GOOGLE_SCHEME_PREFIX)
        ]
    except (OSError, KeyError, TypeError, ValueError, json.JSONDecodeError):
        return None, None

    if len(schemes) != 1:
        google_ios_audience = None
    else:
        client_suffix = schemes[0][len(GOOGLE_SCHEME_PREFIX) :]
        google_ios_audience = f"{client_suffix}.apps.googleusercontent.com"
    return bundle_identifier or None, google_ios_audience


def _apple_private_key_is_escaped(value: str) -> bool:
    if not value or "\n" in value or "\\n" not in value:
        return False
    lines = value.replace("\\n", "\n").splitlines()
    return (
        len(lines) >= 3
        and lines[0] == "-----BEGIN PRIVATE KEY-----"
        and lines[-1] == "-----END PRIVATE KEY-----"
        and all(line.strip() for line in lines[1:-1])
    )


def _fernet_key_has_valid_shape(value: str) -> bool:
    if not value:
        return False
    try:
        return len(base64.urlsafe_b64decode(value.encode())) == 32
    except (binascii.Error, ValueError, TypeError):
        return False


def run_checks(config: Mapping[str, str], app_config_path: Path) -> bool:
    bundle_identifier, google_ios_audience = _load_app_identity(app_config_path)
    google_audiences = _audiences(config, "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_IDS")
    apple_audiences = _audiences(config, "APPLE_CLIENT_ID", "APPLE_CLIENT_IDS")
    google_primary = config.get("GOOGLE_CLIENT_ID", "").strip()
    google_web = config.get("NEXT_PUBLIC_GOOGLE_CLIENT_ID", "").strip()

    checks = (
        ("Google backend primary audience is present", bool(google_primary)),
        ("Google additional audiences are present", _present(config, "GOOGLE_CLIENT_IDS")),
        ("Google web client is present", bool(google_web)),
        (
            "Google web client matches backend primary audience",
            bool(google_web) and google_web == google_primary,
        ),
        ("Google iOS redirect is canonical", google_ios_audience is not None),
        (
            "Google iOS audience matches app redirect",
            google_ios_audience is not None and google_ios_audience in google_audiences,
        ),
        ("Apple backend primary audience is present", _present(config, "APPLE_CLIENT_ID")),
        (
            "Apple iOS audience matches app bundle",
            bundle_identifier is not None and bundle_identifier in apple_audiences,
        ),
        ("Apple team identifier is present", _present(config, "APPLE_TEAM_ID")),
        ("Apple key identifier is present", _present(config, "APPLE_KEY_ID")),
        ("Apple private key is present", _present(config, "APPLE_PRIVATE_KEY")),
        (
            "Apple private key uses escaped single-line format",
            _apple_private_key_is_escaped(config.get("APPLE_PRIVATE_KEY", "")),
        ),
        ("Apple token encryption key is present", _present(config, "APPLE_TOKEN_ENCRYPTION_KEY")),
        (
            "Apple token encryption key has valid shape",
            _fernet_key_has_valid_shape(config.get("APPLE_TOKEN_ENCRYPTION_KEY", "")),
        ),
    )

    for label, passed in checks:
        print(f"{'PASS' if passed else 'FAIL'} {label}")
    passed = all(result for _, result in checks)
    print(
        "Provider configuration preflight passed"
        if passed
        else "Provider configuration preflight failed"
    )
    return passed


def parse_env_file(path: Path) -> dict[str, str]:
    config: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[len("export ") :]
        if "=" not in line:
            raise ValueError("invalid environment file")
        name, value = line.split("=", 1)
        name = name.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
            value = value[1:-1]
        config[name] = value
    return config


def load_configuration(env_file: Path | None) -> dict[str, str]:
    config = dict(os.environ)
    if env_file is not None:
        config.update(parse_env_file(env_file))
    return config


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Check Google/Apple validation configuration without printing values."
    )
    parser.add_argument("--env-file", type=Path)
    parser.add_argument("--app-config", type=Path, required=True)
    args = parser.parse_args()

    try:
        config = load_configuration(args.env_file)
    except (OSError, ValueError):
        print("Provider configuration preflight failed: environment file is unreadable or invalid")
        return 1
    return 0 if run_checks(config, args.app_config) else 1


if __name__ == "__main__":
    raise SystemExit(main())
