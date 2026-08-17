"""Migration coverage for recoverable stats calculation work."""

import importlib

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


migration = importlib.import_module("backend.alembic.versions.075_add_stats_job_leases")


async def _invoke(test_engine, migration_function) -> None:
    async with test_engine.begin() as connection:

        def run(sync_connection) -> None:
            original_op = migration.op
            migration.op = Operations(MigrationContext.configure(sync_connection))
            try:
                migration_function()
            finally:
                migration.op = original_op

        await connection.run_sync(run)


async def _has_lease_columns(test_engine) -> bool:
    async with test_engine.connect() as connection:

        def inspect(sync_connection) -> bool:
            columns = sa.inspect(sync_connection).get_columns("stats_calculation_jobs")
            return "lease_expires_at" in {column["name"] for column in columns}

        return await connection.run_sync(inspect)


@pytest.mark.asyncio
async def test_upgrade_requeues_preexisting_running_work(test_engine):
    """A RUNNING row from the old schema becomes claimable after upgrade."""
    await _invoke(test_engine, migration.downgrade)
    try:
        async with test_engine.begin() as connection:
            job_id = await connection.scalar(
                sa.text(
                    """
                    INSERT INTO stats_calculation_jobs (calc_type, status, started_at)
                    VALUES ('global', 'RUNNING', now())
                    RETURNING id
                    """
                )
            )

        await _invoke(test_engine, migration.upgrade)

        async with test_engine.connect() as connection:
            row = (
                await connection.execute(
                    sa.text(
                        """
                        SELECT status, started_at, available_at,
                               lease_expires_at, claim_token
                        FROM stats_calculation_jobs
                        WHERE id = :job_id
                        """
                    ),
                    {"job_id": job_id},
                )
            ).one()
        assert row.status == "PENDING"
        assert row.started_at is None
        assert row.available_at is not None
        assert row.lease_expires_at is None
        assert row.claim_token is None
    finally:
        if not await _has_lease_columns(test_engine):
            await _invoke(test_engine, migration.upgrade)


@pytest.mark.asyncio
async def test_downgrade_requeues_currently_leased_work(test_engine):
    """Removing lease columns leaves active work visible to the old worker."""
    async with test_engine.begin() as connection:
        job_id = await connection.scalar(
            sa.text(
                """
                INSERT INTO stats_calculation_jobs (
                    calc_type, status, started_at, lease_expires_at,
                    claim_token, attempts
                )
                VALUES (
                    'global', 'RUNNING', now(), now() + interval '5 minutes',
                    'active-worker', 1
                )
                RETURNING id
                """
            )
        )

    await _invoke(test_engine, migration.downgrade)
    try:
        async with test_engine.connect() as connection:
            row = (
                await connection.execute(
                    sa.text(
                        """
                        SELECT status, started_at, completed_at
                        FROM stats_calculation_jobs
                        WHERE id = :job_id
                        """
                    ),
                    {"job_id": job_id},
                )
            ).one()
        assert row.status == "PENDING"
        assert row.started_at is None
        assert row.completed_at is None
    finally:
        await _invoke(test_engine, migration.upgrade)
