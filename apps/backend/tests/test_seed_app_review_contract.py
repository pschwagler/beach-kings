"""Safety contract for the production App Review fixture script."""

from pathlib import Path


SCRIPT = Path(__file__).parents[3] / "scripts" / "seed_app_review.py"


def test_review_seed_is_additive_and_keeps_password_out_of_output():
    source = SCRIPT.read_text()

    assert "APP_REVIEW_PASSWORD" in source
    assert "password intentionally not printed" in source
    assert "session.delete(" not in source
    assert "delete(" not in source
    assert "DROP " not in source.upper()
    assert "TRUNCATE " not in source.upper()
    assert "password_hash =" not in source


def test_review_seed_uses_stable_documented_names():
    source = SCRIPT.read_text()

    assert 'LEAGUE_NAME = "App Review League"' in source
    assert 'ACTIVE_SESSION_NAME = "App Review Session"' in source
    assert 'REVIEW_EMAIL = "app-review@beachleaguevb.com"' in source
