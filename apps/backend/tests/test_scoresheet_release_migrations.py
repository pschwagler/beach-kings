"""Exercise the incremental scoresheet release against a pre-release schema."""

import importlib
from uuid import uuid4

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import inspect, text

from backend.database.models import FeatureFlag


@pytest.mark.asyncio
async def test_scoresheet_migrations_upgrade_081_without_removing_existing_jobs(test_engine):
    schema = f"scoresheet_migration_{uuid4().hex}"

    def verify(connection):
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
        connection.execute(text(f'SET LOCAL search_path TO "{schema}"'))
        connection.execute(text("CREATE TABLE users (id INTEGER PRIMARY KEY)"))
        connection.execute(
            text(
                "CREATE TABLE photo_match_jobs (id INTEGER PRIMARY KEY, league_id INTEGER NOT NULL)"
            )
        )
        connection.execute(text("INSERT INTO photo_match_jobs VALUES (1, 7)"))
        FeatureFlag.__table__.create(connection)
        with Operations.context(MigrationContext.configure(connection)):
            for revision in (
                "082_enable_scoresheet_parsing",
                "083_allow_pickup_photo_jobs",
                "084_photo_import_receipts",
            ):
                importlib.import_module(f"backend.alembic.versions.{revision}").upgrade()
        columns = {
            column["name"]: column
            for column in inspect(connection).get_columns("photo_match_jobs", schema=schema)
        }
        assert columns["league_id"]["nullable"]
        assert columns["user_id"]["nullable"]
        assert columns["import_result"]["nullable"]
        assert connection.execute(text("SELECT id, league_id FROM photo_match_jobs")).one() == (
            1,
            7,
        )
        assert connection.execute(
            text(
                "SELECT enabled, rollout_percent FROM feature_flags WHERE key='scoresheet_parsing'"
            )
        ).one() == (True, 100)

    async with test_engine.connect() as connection:
        async with connection.begin():
            await connection.run_sync(verify)
            # The isolated schema and fixtures are rolled back with this test.
            await connection.rollback()
