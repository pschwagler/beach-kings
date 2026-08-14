from sqlalchemy.pool import NullPool

from backend.database.db import engine_options


def test_test_environment_uses_null_pool():
    options = engine_options("test")

    assert options["poolclass"] is NullPool
    assert "pool_size" not in options
    assert "max_overflow" not in options


def test_production_environment_retains_pool_sizing():
    options = engine_options("production")

    assert "poolclass" not in options
    assert options["pool_size"] == 10
    assert options["max_overflow"] == 20
