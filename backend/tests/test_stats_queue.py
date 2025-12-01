"""
Tests for stats calculation queue service.
Tests enqueueing, deduplication, and job status tracking.
"""
import pytest
import pytest_asyncio
from datetime import datetime, timedelta
from backend.utils.datetime_utils import utcnow
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from backend.database.db import Base
from backend.database.models import StatsCalculationJob, StatsCalculationJobStatus
from backend.services.stats_queue import StatsCalculationQueue, get_stats_queue


@pytest_asyncio.fixture
async def db_session():
    """Create a test database session."""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async_session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    # Create tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    async with async_session_maker() as session:
        yield session
    
    # Cleanup
    await engine.dispose()


@pytest_asyncio.fixture
def queue():
    """Create a fresh queue instance for each test."""
    return StatsCalculationQueue()


@pytest.mark.asyncio
async def test_enqueue_global_calculation(db_session, queue):
    """Test enqueueing a global stats calculation."""
    job_id = await queue.enqueue_calculation(db_session, "global", None)
    
    assert job_id > 0
    
    # Check job was created
    result = await db_session.execute(
        StatsCalculationJob.__table__.select().where(StatsCalculationJob.id == job_id)
    )
    job = result.fetchone()
    assert job is not None
    assert job.calc_type == "global"
    assert job.season_id is None


@pytest.mark.asyncio
async def test_enqueue_season_calculation(db_session, queue):
    """Test enqueueing a season-specific stats calculation."""
    season_id = 123
    job_id = await queue.enqueue_calculation(db_session, "season", season_id)
    
    assert job_id > 0
    
    # Check job was created
    result = await db_session.execute(
        StatsCalculationJob.__table__.select().where(StatsCalculationJob.id == job_id)
    )
    job = result.fetchone()
    assert job is not None
    assert job.calc_type == "season"
    assert job.season_id == season_id


@pytest.mark.asyncio
async def test_deduplication_same_job(db_session, queue):
    """Test that enqueueing the same job twice returns the same job_id."""
    # Enqueue first job
    job_id1 = await queue.enqueue_calculation(db_session, "global", None)
    
    # Enqueue same job again (should return same ID)
    job_id2 = await queue.enqueue_calculation(db_session, "global", None)
    
    assert job_id1 == job_id2
    
    # Should only have one job in database
    result = await db_session.execute(
        StatsCalculationJob.__table__.select()
    )
    jobs = result.fetchall()
    assert len(jobs) == 1


@pytest.mark.asyncio
async def test_deduplication_different_seasons(db_session, queue):
    """Test that different season calculations create separate jobs."""
    job_id1 = await queue.enqueue_calculation(db_session, "season", 1)
    job_id2 = await queue.enqueue_calculation(db_session, "season", 2)
    
    assert job_id1 != job_id2
    
    # Should have two jobs
    result = await db_session.execute(
        StatsCalculationJob.__table__.select()
    )
    jobs = result.fetchall()
    assert len(jobs) == 2


@pytest.mark.asyncio
async def test_deduplication_global_vs_season(db_session, queue):
    """Test that global and season calculations are separate."""
    global_job_id = await queue.enqueue_calculation(db_session, "global", None)
    season_job_id = await queue.enqueue_calculation(db_session, "season", 1)
    
    assert global_job_id != season_job_id


@pytest.mark.asyncio
async def test_get_queue_status_empty(db_session, queue):
    """Test getting queue status when queue is empty."""
    status = await queue.get_queue_status(db_session)
    
    assert status["running"] is None
    assert len(status["pending"]) == 0
    assert len(status["recent_completed"]) == 0
    assert len(status["recent_failed"]) == 0


@pytest.mark.asyncio
async def test_get_queue_status_with_jobs(db_session, queue):
    """Test getting queue status with jobs."""
    # Create some jobs manually
    job1 = StatsCalculationJob(
        calc_type="global",
        season_id=None,
        status=StatsCalculationJobStatus.RUNNING,
        started_at=utcnow()
    )
    db_session.add(job1)
    
    job2 = StatsCalculationJob(
        calc_type="season",
        season_id=1,
        status=StatsCalculationJobStatus.PENDING
    )
    db_session.add(job2)
    
    job3 = StatsCalculationJob(
        calc_type="global",
        season_id=None,
        status=StatsCalculationJobStatus.COMPLETED,
        completed_at=utcnow()
    )
    db_session.add(job3)
    
    await db_session.commit()
    
    status = await queue.get_queue_status(db_session)
    
    assert status["running"] is not None
    assert status["running"]["calc_type"] == "global"
    assert len(status["pending"]) == 1
    assert len(status["recent_completed"]) == 1


@pytest.mark.asyncio
async def test_get_job_status(db_session, queue):
    """Test getting status of a specific job."""
    job_id = await queue.enqueue_calculation(db_session, "global", None)
    
    status = await queue.get_job_status(db_session, job_id)
    
    assert status is not None
    assert status["id"] == job_id
    assert status["calc_type"] == "global"
    assert status["season_id"] is None
    assert "status" in status


@pytest.mark.asyncio
async def test_get_job_status_nonexistent(db_session, queue):
    """Test getting status of non-existent job."""
    status = await queue.get_job_status(db_session, 99999)
    assert status is None


@pytest.mark.asyncio
async def test_deduplication_pending_job(db_session, queue):
    """Test that enqueueing when a pending job exists returns that job."""
    # Create a pending job manually
    job = StatsCalculationJob(
        calc_type="global",
        season_id=None,
        status=StatsCalculationJobStatus.PENDING
    )
    db_session.add(job)
    await db_session.commit()
    await db_session.refresh(job)
    
    # Enqueue same type - should return existing job
    job_id = await queue.enqueue_calculation(db_session, "global", None)
    
    assert job_id == job.id


@pytest.mark.asyncio
async def test_deduplication_running_job(db_session, queue):
    """Test that enqueueing when a running job exists returns that job."""
    # Create a running job manually
    job = StatsCalculationJob(
        calc_type="global",
        season_id=None,
        status=StatsCalculationJobStatus.RUNNING,
        started_at=utcnow()
    )
    db_session.add(job)
    await db_session.commit()
    await db_session.refresh(job)
    
    # Enqueue same type - should return existing job
    job_id = await queue.enqueue_calculation(db_session, "global", None)
    
    assert job_id == job.id


