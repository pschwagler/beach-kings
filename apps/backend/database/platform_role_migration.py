"""Pure identity matching helpers used by the platform-role migration."""

from __future__ import annotations

import re
from collections.abc import Iterable, Mapping


def normalize_phone(value: str) -> str:
    digits = re.sub(r"\D", "", value.strip())
    if len(digits) == 10:
        digits = f"1{digits}"
    return f"+{digits}" if digits else ""


def entries(value: str | None) -> list[str]:
    return [item.strip() for item in (value or "").split(",") if item.strip()]


def resolve_legacy_admins(
    users: Iterable[Mapping[str, object]], phones: list[str], emails: list[str]
) -> tuple[set[int], list[str]]:
    by_phone: dict[str, set[int]] = {}
    by_email: dict[str, set[int]] = {}
    for user in users:
        user_id = int(user["id"])
        if user.get("phone_number"):
            by_phone.setdefault(normalize_phone(str(user["phone_number"])), set()).add(user_id)
        if user.get("email"):
            by_email.setdefault(str(user["email"]).strip().lower(), set()).add(user_id)

    matched_ids: set[int] = set()
    unmatched: list[str] = []
    lookups = [
        *((raw, by_phone.get(normalize_phone(raw), set())) for raw in phones),
        *((raw, by_email.get(raw.strip().lower(), set())) for raw in emails),
    ]
    for raw, matches in lookups:
        if len(matches) > 1:
            raise RuntimeError(f"Ambiguous normalized legacy admin identity: {raw}")
        if matches:
            matched_ids.update(matches)
        else:
            unmatched.append(raw)
    return matched_ids, unmatched
