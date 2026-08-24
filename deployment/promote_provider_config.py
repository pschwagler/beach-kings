#!/usr/bin/env python3
"""Atomically promote approved provider settings into a deployment env file."""

from __future__ import annotations

import argparse
import base64
import os
import secrets
import stat
import tempfile
from pathlib import Path


PROMOTED_KEYS = (
    "GOOGLE_CLIENT_IDS",
    "APPLE_CLIENT_ID",
    "APPLE_CLIENT_IDS",
    "APPLE_TEAM_ID",
    "APPLE_KEY_ID",
    "APPLE_PRIVATE_KEY",
)
OPTIONAL_KEYS = {"APPLE_CLIENT_IDS"}
TOKEN_KEY = "APPLE_TOKEN_ENCRYPTION_KEY"


def _promoted_values(prefix: str) -> dict[str, str]:
    values = {key: os.environ.get(f"{prefix}{key}", "").strip() for key in PROMOTED_KEYS}
    missing = [key for key, value in values.items() if not value and key not in OPTIONAL_KEYS]
    if missing:
        raise ValueError("missing approved provider settings: " + ", ".join(missing))
    return values


def _parse_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for line in path.read_text().splitlines():
        if not line or line.lstrip().startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()
    return values


def _promoted_file_values(path: Path) -> dict[str, str]:
    source = _parse_env_file(path)
    values = {key: source.get(key, "") for key in PROMOTED_KEYS}
    missing = [key for key, value in values.items() if not value and key not in OPTIONAL_KEYS]
    if missing:
        raise ValueError("missing approved provider settings: " + ", ".join(missing))
    return values


def _new_token_key() -> str:
    return base64.urlsafe_b64encode(secrets.token_bytes(32)).decode("ascii")


def update_env_file(path: Path, values: dict[str, str]) -> None:
    original = path.read_text() if path.exists() else ""
    lines = original.splitlines()
    replacements = dict(values)

    existing_token = ""
    for line in lines:
        if line.startswith(f"{TOKEN_KEY}="):
            existing_token = line.split("=", 1)[1].strip()
    replacements[TOKEN_KEY] = existing_token or _new_token_key()

    output: list[str] = []
    written: set[str] = set()
    for line in lines:
        key = line.split("=", 1)[0] if "=" in line else ""
        if key not in replacements:
            output.append(line)
            continue
        if key not in written:
            output.append(f"{key}={replacements[key]}")
            written.add(key)

    if output and output[-1] != "":
        output.append("")
    for key in (*PROMOTED_KEYS, TOKEN_KEY):
        if key not in written:
            output.append(f"{key}={replacements[key]}")
    output_text = "\n".join(output) + "\n"

    path.parent.mkdir(parents=True, exist_ok=True)
    mode = stat.S_IMODE(path.stat().st_mode) if path.exists() else 0o600
    fd, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    temporary = Path(temporary_name)
    try:
        with os.fdopen(fd, "w") as handle:
            handle.write(output_text)
            handle.flush()
            os.fsync(handle.fileno())
        temporary.chmod(mode)
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--env-file", required=True, type=Path)
    parser.add_argument("--source-prefix", default="PROMOTE_")
    parser.add_argument("--source-env-file", type=Path)
    args = parser.parse_args()

    try:
        values = (
            _promoted_file_values(args.source_env_file)
            if args.source_env_file
            else _promoted_values(args.source_prefix)
        )
        update_env_file(args.env_file, values)
    except (OSError, ValueError) as error:
        print(f"Provider configuration promotion failed: {error}")
        return 1

    print("Provider configuration promoted without exposing values")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
