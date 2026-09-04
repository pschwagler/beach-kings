"""Safety contract for the non-destructive opaque-token transition."""

from pathlib import Path


def test_revision_078_contains_no_token_row_mutation():
    migration = (
        Path(__file__).parents[1]
        / "alembic"
        / "versions"
        / "078_transition_opaque_token_digests.py"
    ).read_text(encoding="utf-8")
    normalized = " ".join(migration.upper().split())

    for verb in ("DELETE FROM", "UPDATE REFRESH_TOKENS", "UPDATE PASSWORD_RESET_TOKENS"):
        assert verb not in normalized
