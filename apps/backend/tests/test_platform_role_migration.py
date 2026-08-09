import pytest

from backend.database.platform_role_migration import (
    entries,
    normalize_phone,
    resolve_legacy_admins,
)


def test_migration_normalizes_phone_identities():
    assert normalize_phone("(858) 555-0100") == "+18585550100"
    assert normalize_phone("+1 858 555 0100") == "+18585550100"


def test_migration_parses_config_entries_and_empty_databases_safely():
    assert entries(" admin@example.com, ,ADMIN@example.com ") == [
        "admin@example.com",
        "ADMIN@example.com",
    ]
    assert entries(None) == []
    assert entries("") == []


def test_phone_and_email_backfill_deduplicates_the_same_user():
    users = [{"id": 7, "phone_number": "+18585550100", "email": "Admin@Example.com"}]
    matched, unmatched = resolve_legacy_admins(
        users, ["(858) 555-0100"], ["admin@example.com", "missing@example.com"]
    )
    assert matched == {7}
    assert unmatched == ["missing@example.com"]


def test_duplicate_normalized_identities_fail_safely():
    users = [
        {"id": 1, "phone_number": "+18585550100", "email": None},
        {"id": 2, "phone_number": "858-555-0100", "email": None},
    ]
    with pytest.raises(RuntimeError, match="Ambiguous normalized"):
        resolve_legacy_admins(users, ["8585550100"], [])
