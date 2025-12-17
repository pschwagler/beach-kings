"""
Tests for stats calculation queue service.
Tests enqueueing, deduplication, and job status tracking.
"""
import pytest
import pytest_asyncio
from datetime import datetime, timedelta
from backend.utils.datetime_utils import utcnow
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from backend.database.models import StatsCalculationJob, StatsCalculationJobStatus
from backend.services.stats_queue import StatsCalculationQueue, get_stats_queue

# db_session fixture is provided by conftest.py


@pytest.fixture
def queue():
    """Create a fresh queue instance for each test."""
    q = StatsCalculationQueue()
    # Register mock callbacks to avoid RuntimeError when calculations are triggered
    # Tests that actually need to run calculations can override these
    async def mock_global_calc(session):
        return {"player_count": 0, "match_count": 0}
    
    async def mock_league_calc(session, league_id):
        return {"player_count": 0, "match_count": 0}
    
    q.register_calculation_callbacks(
        global_calc_callback=mock_global_calc,
        league_calc_callback=mock_season_calc
    )
    return q


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
    """Test enqueueing a league-specific stats calculation."""
    # Create league and season first
    from backend.database.models import League, Season
    from datetime import date
    
    league = League(name="Test League", is_open=True)
    db_session.add(league)
    await db_session.flush()
    
    season = Season(
        league_id=league.id,
        name="Test Season",
        start_date=date(2024, 1, 1),
        end_date=date(2024, 12, 31),
    )
    db_session.add(season)
    await db_session.flush()
    
    league_id = league.id
    job_id = await queue.enqueue_calculation(db_session, "league", league_id)
    
    assert job_id > 0
    
    # Check job was created
    result = await db_session.execute(
        StatsCalculationJob.__table__.select().where(StatsCalculationJob.id == job_id)
    )
    job = result.fetchone()
    assert job is not None
    assert job.calc_type == "league"
    assert job.league_id == league_id


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
    # Create league and seasons first
    from backend.database.models import League, Season
    from datetime import date
    
    league = League(name="Test League", is_open=True)
    db_session.add(league)
    await db_session.flush()
    
    season1 = Season(
        league_id=league.id,
        name="Season 1",
        start_date=date(2024, 1, 1),
        end_date=date(2024, 6, 30),
    )
    db_session.add(season1)
    await db_session.flush()
    
    season2 = Season(
        league_id=league.id,
        name="Season 2",
        start_date=date(2024, 7, 1),
        end_date=date(2024, 12, 31),
    )
    db_session.add(season2)
    await db_session.flush()
    
    job_id1 = await queue.enqueue_calculation(db_session, "season", season1.id)
    job_id2 = await queue.enqueue_calculation(db_session, "season", season2.id)
    
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
    # First create a season so we can reference it
    # Create league/season directly via ORM to avoid needing creator_user_id
    from backend.database.models import League, Season
    from datetime import date
    
    league = League(name="Test League", is_open=True)
    db_session.add(league)
    await db_session.flush()
    
    season = Season(
        league_id=league.id,
        name="Test Season",
        start_date=date(2024, 1, 1),
        end_date=date(2024, 12, 31),
    )
    db_session.add(season)
    await db_session.flush()
    
    global_job_id = await queue.enqueue_calculation(db_session, "global", None)
    season_job_id = await queue.enqueue_calculation(db_session, "season", season.id)
    
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
    # First create a season so we can reference it
    # Create league/season directly via ORM to avoid needing creator_user_id
    from backend.database.models import League, Season
    from datetime import date
    
    league = League(name="Test League", is_open=True)
    db_session.add(league)
    await db_session.flush()
    
    season = Season(
        league_id=league.id,
        name="Test Season",
        start_date=date(2024, 1, 1),
        end_date=date(2024, 12, 31),
    )
    db_session.add(season)
    await db_session.flush()
    
    # Create some jobs manually
    job1 = StatsCalculationJob(
        calc_type="global",
        season_id=None,
        status=StatsCalculationJobStatus.RUNNING,
        started_at=utcnow()
    )
    db_session.add(job1)
    
    job2 = StatsCalculationJob(
        calc_type="league",
        league_id=league.id,
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


# ============================================================================
# Callback Registration Tests
# ============================================================================

@pytest.mark.asyncio
async def test_register_callbacks_with_valid_functions():
    """Test that valid callable functions can be registered."""
    queue = StatsCalculationQueue()
    
    async def global_calc(session):
        return {"player_count": 0, "match_count": 0}
    
    async def league_calc(session, league_id):
        return {"player_count": 0, "match_count": 0}
    
    # Should not raise
    queue.register_calculation_callbacks(
        global_calc_callback=global_calc,
        season_calc_callback=season_calc
    )


@pytest.mark.asyncio
async def test_register_callbacks_with_non_callable_global():
    """Test that registering non-callable global callback raises TypeError."""
    queue = StatsCalculationQueue()
    
    async def league_calc(session, league_id):
        return {"player_count": 0, "match_count": 0}
    
    with pytest.raises(TypeError, match="global_calc_callback must be callable"):
        queue.register_calculation_callbacks(
            global_calc_callback=None,
            season_calc_callback=season_calc
        )


@pytest.mark.asyncio
async def test_register_callbacks_with_non_callable_season():
    """Test that registering non-callable season callback raises TypeError."""
    queue = StatsCalculationQueue()
    
    async def global_calc(session):
        return {"player_count": 0, "match_count": 0}
    
    with pytest.raises(TypeError, match="season_calc_callback must be callable"):
        queue.register_calculation_callbacks(
            global_calc_callback=global_calc,
            league_calc_callback="not a function"
        )


@pytest.mark.asyncio
async def test_register_callbacks_re_registration():
    """Test that callbacks can be re-registered (useful for testing)."""
    queue = StatsCalculationQueue()
    
    async def global_calc1(session):
        return {"player_count": 1, "match_count": 1}
    
    async def league_calc1(session, league_id):
        return {"player_count": 1, "match_count": 1}
    
    async def global_calc2(session):
        return {"player_count": 2, "match_count": 2}
    
    async def season_calc2(session, season_id):
        return {"player_count": 2, "match_count": 2}
    
    # First registration
    queue.register_calculation_callbacks(
        global_calc_callback=global_calc1,
        league_calc_callback=league_calc1
    )
    
    # Re-registration should work (with warning logged)
    queue.register_calculation_callbacks(
        global_calc_callback=global_calc2,
        league_calc_callback=league_calc2
    )


# ============================================================================
# Callback Execution Tests
# ============================================================================

@pytest.mark.asyncio
async def test_run_calculation_without_callbacks_registered(db_session):
    """Test that running a calculation without registered callbacks raises RuntimeError."""
    queue = StatsCalculationQueue()
    # Don't register callbacks
    
    # Create a job manually
    job = StatsCalculationJob(
        calc_type="global",
        season_id=None,
        status=StatsCalculationJobStatus.RUNNING,
        started_at=utcnow()
    )
    db_session.add(job)
    await db_session.commit()
    await db_session.refresh(job)
    
    # Attempt to run calculation - should raise RuntimeError
    with pytest.raises(RuntimeError, match="Calculation callbacks not registered"):
        await queue._run_calculation(job.id)


@pytest.mark.asyncio
async def test_run_calculation_global_callback_executed(db_session):
    """Test that global calculation callback is executed correctly."""
    queue = StatsCalculationQueue()
    
    callback_called = False
    callback_session = None
    
    async def global_calc(session):
        nonlocal callback_called, callback_session
        callback_called = True
        callback_session = session
        return {"player_count": 5, "match_count": 10}
    
    async def league_calc(session, league_id):
        return {"player_count": 0, "match_count": 0}
    
    queue.register_calculation_callbacks(
        global_calc_callback=global_calc,
        season_calc_callback=season_calc
    )
    
    # Create and run a global calculation job
    job = StatsCalculationJob(
        calc_type="global",
        season_id=None,
        status=StatsCalculationJobStatus.RUNNING,
        started_at=utcnow()
    )
    db_session.add(job)
    await db_session.commit()
    await db_session.refresh(job)
    
    job_id = job.id  # Store ID before rollback
    await queue._run_calculation(job_id)
    
    # Verify callback was called
    assert callback_called is True
    assert callback_session is not None
    
    # Verify job was marked as completed
    # Rollback the test session to start a fresh transaction that will see the committed changes
    await db_session.rollback()
    
    # Re-query to get fresh data from database
    result = await db_session.execute(
        select(StatsCalculationJob).where(StatsCalculationJob.id == job_id)
    )
    updated_job = result.scalar_one()
    assert updated_job.status == StatsCalculationJobStatus.COMPLETED
    assert updated_job.completed_at is not None


@pytest.mark.asyncio
async def test_run_calculation_season_callback_executed(db_session):
    """Test that league calculation callback is executed correctly."""
    queue = StatsCalculationQueue()
    
    callback_called = False
    callback_session = None
    callback_league_id = None
    
    async def global_calc(session):
        return {"player_count": 0, "match_count": 0}
    
    async def league_calc(session, league_id):
        nonlocal callback_called, callback_session, callback_league_id
        callback_called = True
        callback_session = session
        callback_league_id = league_id
        return {"league_player_count": 3, "league_match_count": 7, "season_counts": {}}
    
    queue.register_calculation_callbacks(
        global_calc_callback=global_calc,
        league_calc_callback=league_calc
    )
    
    # Create league and season first
    from backend.database.models import League, Season
    from datetime import date
    
    league = League(name="Test League", is_open=True)
    db_session.add(league)
    await db_session.flush()
    
    season = Season(
        league_id=league.id,
        name="Test Season",
        start_date=date(2024, 1, 1),
        end_date=date(2024, 12, 31),
    )
    db_session.add(season)
    await db_session.flush()
    
    # Create and run a league calculation job
    league_id = league.id
    job = StatsCalculationJob(
        calc_type="league",
        league_id=league_id,
        status=StatsCalculationJobStatus.RUNNING,
        started_at=utcnow()
    )
    db_session.add(job)
    await db_session.commit()
    await db_session.refresh(job)
    
    job_id = job.id  # Store ID before rollback
    await queue._run_calculation(job_id)
    
    # Verify callback was called with correct parameters
    assert callback_called is True
    assert callback_session is not None
    assert callback_league_id == league_id
    
    # Verify job was marked as completed
    # Rollback the test session to start a fresh transaction that will see the committed changes
    await db_session.rollback()
    
    # Re-query to get fresh data from database
    result = await db_session.execute(
        select(StatsCalculationJob).where(StatsCalculationJob.id == job_id)
    )
    updated_job = result.scalar_one()
    assert updated_job.status == StatsCalculationJobStatus.COMPLETED
    assert updated_job.completed_at is not None


@pytest.mark.asyncio
async def test_run_calculation_season_without_season_id_raises_error(db_session):
    """Test that season calculation without season_id raises ValueError."""
    queue = StatsCalculationQueue()
    
    async def global_calc(session):
        return {"player_count": 0, "match_count": 0}
    
    async def league_calc(session, league_id):
        return {"player_count": 0, "match_count": 0}
    
    queue.register_calculation_callbacks(
        global_calc_callback=global_calc,
        season_calc_callback=season_calc
    )
    
    # Create a league job without league_id
    job = StatsCalculationJob(
        calc_type="league",
        league_id=None,  # Missing league_id
        status=StatsCalculationJobStatus.RUNNING,
        started_at=utcnow()
    )
    db_session.add(job)
    await db_session.commit()
    await db_session.refresh(job)
    
    job_id = job.id  # Store ID before rollback
    # Should raise ValueError
    with pytest.raises(ValueError, match="league_id required for league calculation"):
        await queue._run_calculation(job_id)
    
    # Rollback the test session to start a fresh transaction that will see the committed changes
    await db_session.rollback()
    
    # Job should be marked as failed
    # Re-query to get fresh data from database
    result = await db_session.execute(
        select(StatsCalculationJob).where(StatsCalculationJob.id == job_id)
    )
    updated_job = result.scalar_one()
    assert updated_job.status == StatsCalculationJobStatus.FAILED
    assert updated_job.completed_at is not None
    assert "season_id required" in updated_job.error_message


@pytest.mark.asyncio
async def test_run_calculation_callback_exception_marks_job_failed(db_session):
    """Test that if callback raises an exception, job is marked as failed."""
    queue = StatsCalculationQueue()
    
    async def global_calc(session):
        raise ValueError("Test error from callback")
    
    async def league_calc(session, league_id):
        return {"player_count": 0, "match_count": 0}
    
    queue.register_calculation_callbacks(
        global_calc_callback=global_calc,
        season_calc_callback=season_calc
    )
    
    # Create and run a global calculation job
    job = StatsCalculationJob(
        calc_type="global",
        season_id=None,
        status=StatsCalculationJobStatus.RUNNING,
        started_at=utcnow()
    )
    db_session.add(job)
    await db_session.commit()
    await db_session.refresh(job)
    
    job_id = job.id  # Store ID before rollback
    # Should raise the exception
    with pytest.raises(ValueError, match="Test error from callback"):
        await queue._run_calculation(job_id)
    
    # Rollback the test session to start a fresh transaction that will see the committed changes
    await db_session.rollback()
    
    # Verify job was marked as failed with error message
    # Re-query to get fresh data from database
    result = await db_session.execute(
        select(StatsCalculationJob).where(StatsCalculationJob.id == job_id)
    )
    updated_job = result.scalar_one()
    assert updated_job.status == StatsCalculationJobStatus.FAILED
    assert updated_job.completed_at is not None
    assert "Test error from callback" in updated_job.error_message


@pytest.mark.asyncio
async def test_run_calculation_unknown_calc_type_raises_error(db_session):
    """Test that unknown calc_type raises ValueError."""
    queue = StatsCalculationQueue()
    
    async def global_calc(session):
        return {"player_count": 0, "match_count": 0}
    
    async def league_calc(session, league_id):
        return {"player_count": 0, "match_count": 0}
    
    queue.register_calculation_callbacks(
        global_calc_callback=global_calc,
        season_calc_callback=season_calc
    )
    
    # Create a job with unknown calc_type
    job = StatsCalculationJob(
        calc_type="unknown_type",
        season_id=None,
        status=StatsCalculationJobStatus.RUNNING,
        started_at=utcnow()
    )
    db_session.add(job)
    await db_session.commit()
    await db_session.refresh(job)
    
    job_id = job.id  # Store ID before rollback
    # Should raise ValueError
    with pytest.raises(ValueError, match="Unknown calc_type: unknown_type"):
        await queue._run_calculation(job_id)
    
    # Rollback the test session to start a fresh transaction that will see the committed changes
    await db_session.rollback()
    
    # Job should be marked as failed
    # Re-query to get fresh data from database
    result = await db_session.execute(
        select(StatsCalculationJob).where(StatsCalculationJob.id == job_id)
    )
    updated_job = result.scalar_one()
    assert updated_job.status == StatsCalculationJobStatus.FAILED
    assert updated_job.completed_at is not None
    assert "Unknown calc_type" in updated_job.error_message


@pytest.mark.asyncio
async def test_run_calculation_nonexistent_job_returns_early(db_session):
    """Test that running calculation for non-existent job returns early without error."""
    queue = StatsCalculationQueue()
    
    async def global_calc(session):
        return {"player_count": 0, "match_count": 0}
    
    async def league_calc(session, league_id):
        return {"player_count": 0, "match_count": 0}
    
    queue.register_calculation_callbacks(
        global_calc_callback=global_calc,
        season_calc_callback=season_calc
    )
    
    # Try to run calculation for non-existent job
    # Should return early without raising error
    await queue._run_calculation(99999)


# ============================================================================
# Integration Tests with Real Calculation Functions
# ============================================================================

@pytest.mark.asyncio
async def test_integration_with_real_calculation_functions(db_session):
    """Test integration with actual data_service calculation functions."""
    from backend.services.data_service import (
        calculate_global_stats_async,
        calculate_league_stats_async
    )
    
    queue = StatsCalculationQueue()
    queue.register_calculation_callbacks(
        global_calc_callback=calculate_global_stats_async,
        league_calc_callback=calculate_league_stats_async
    )
    
    # Create a global calculation job
    job = StatsCalculationJob(
        calc_type="global",
        season_id=None,
        status=StatsCalculationJobStatus.RUNNING,
        started_at=utcnow()
    )
    db_session.add(job)
    await db_session.commit()
    await db_session.refresh(job)
    
    job_id = job.id  # Store ID before rollback
    # Run the calculation
    await queue._run_calculation(job_id)
    
    # Rollback the test session to start a fresh transaction that will see the committed changes
    await db_session.rollback()
    
    # Verify job completed successfully
    # Re-query to get fresh data from database
    result = await db_session.execute(
        select(StatsCalculationJob).where(StatsCalculationJob.id == job_id)
    )
    updated_job = result.scalar_one()
    assert updated_job.status == StatsCalculationJobStatus.COMPLETED
    assert updated_job.completed_at is not None
    assert updated_job.error_message is None


@pytest.mark.asyncio
async def test_integration_enqueue_and_execute_global_calculation(db_session):
    """Test full integration: enqueue a job and verify it can be executed."""
    from backend.services.data_service import (
        calculate_global_stats_async,
        calculate_league_stats_async
    )
    
    queue = StatsCalculationQueue()
    queue.register_calculation_callbacks(
        global_calc_callback=calculate_global_stats_async,
        league_calc_callback=calculate_league_stats_async
    )
    
    # Enqueue a calculation
    job_id = await queue.enqueue_calculation(db_session, "global", None)
    
    # Get the job
    result = await db_session.execute(
        select(StatsCalculationJob).where(StatsCalculationJob.id == job_id)
    )
    job = result.scalar_one_or_none()
    assert job is not None
    
    # Manually run the calculation (simulating what the worker would do)
    await queue._run_calculation(job_id)
    
    # Rollback the test session to start a fresh transaction that will see the committed changes
    await db_session.rollback()
    
    # Verify job completed
    # Re-query to get fresh data from database
    result = await db_session.execute(
        select(StatsCalculationJob).where(StatsCalculationJob.id == job_id)
    )
    updated_job = result.scalar_one()
    assert updated_job.status == StatsCalculationJobStatus.COMPLETED


@pytest.mark.asyncio
async def test_register_stats_queue_callbacks_function(db_session):
    """Test that the data_service registration function works correctly."""
    from backend.services.data_service import register_stats_queue_callbacks
    from backend.services.stats_queue import get_stats_queue
    
    queue = get_stats_queue()
    
    # Verify callbacks are not registered initially (or may be from previous test)
    # Call the registration function
    register_stats_queue_callbacks()
    
    # Verify that we can now run a calculation without RuntimeError
    # (This indirectly verifies callbacks were registered)
    # We'll create a minimal test job to verify
    job = StatsCalculationJob(
        calc_type="global",
        season_id=None,
        status=StatsCalculationJobStatus.RUNNING,
        started_at=utcnow()
    )
    db_session.add(job)
    await db_session.commit()
    await db_session.refresh(job)
    
    # Should not raise RuntimeError about missing callbacks
    # (It might raise other errors if data is missing, but not the callback error)
    try:
        await queue._run_calculation(job.id)
        # If it succeeds, great. If it fails for other reasons (like missing data),
        # that's fine - we just want to ensure it's not a callback registration error
    except RuntimeError as e:
        if "callbacks not registered" in str(e):
            pytest.fail("Callbacks were not registered by register_stats_queue_callbacks()")
    except Exception:
        # Other exceptions are fine - we're just checking callback registration
        pass


