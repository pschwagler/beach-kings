"""Database-free unit tests for stats queue admission behavior."""

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from backend.database.models import StatsCalculationJobStatus
from backend.services.stats.stats_queue import StatsCalculationQueue


@pytest.mark.asyncio
async def test_distinct_target_is_queued_when_other_job_is_running_and_pending():
    """An unrelated pending job must never stand in for the requested target."""
    queue = StatsCalculationQueue()
    session = AsyncMock()
    unrelated_pending = SimpleNamespace(id=22)

    queue._find_existing_job = AsyncMock(return_value=None)
    queue._get_running_job = AsyncMock(return_value=SimpleNamespace(id=11))
    queue._find_queued_job = AsyncMock(return_value=None)
    # These attributes model the old one-pending-job admission path. Keeping
    # them on the instance makes this test fail against the former behavior.
    queue._count_queued_jobs = AsyncMock(return_value=1)
    queue._get_first_queued_job = AsyncMock(return_value=unrelated_pending)
    queue._create_pending_job = AsyncMock(return_value=33)

    job_id = await queue.enqueue_calculation(session, "league", 202)

    assert job_id == 33
    queue._create_pending_job.assert_awaited_once_with(session, "league", 202)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "status", [StatsCalculationJobStatus.PENDING, StatsCalculationJobStatus.RUNNING]
)
async def test_same_target_still_deduplicates_pending_and_running_jobs(status):
    """The fix must retain same-target deduplication."""
    queue = StatsCalculationQueue()
    session = AsyncMock()
    existing = SimpleNamespace(id=44, status=status)

    queue._find_existing_job = AsyncMock(return_value=existing)
    queue._get_running_job = AsyncMock()
    queue._create_pending_job = AsyncMock()

    job_id = await queue.enqueue_calculation(session, "league", 202)

    assert job_id == existing.id
    queue._get_running_job.assert_not_awaited()
    queue._create_pending_job.assert_not_awaited()
