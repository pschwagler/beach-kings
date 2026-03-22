"""
Unit tests for SeasonFinalizationService._process_unfinalized_seasons().

Uses monkeypatching to mock db.AsyncSessionLocal so these tests run without a
real database connection.
"""

import pytest
from datetime import date
from unittest.mock import AsyncMock, MagicMock, patch

from backend.services.season_finalization_service import SeasonFinalizationService


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_season(season_id: int, end_date=None) -> MagicMock:
    """Return a lightweight Season-like mock."""
    season = MagicMock()
    season.id = season_id
    season.end_date = end_date or date(2024, 1, 1)
    season.awards_finalized_at = None
    return season


def _make_mock_session(seasons: list) -> AsyncMock:
    """
    Build a mock AsyncSession whose execute() returns a scalars result
    containing the given seasons list.
    """
    scalars_result = MagicMock()
    scalars_result.all.return_value = seasons

    execute_result = MagicMock()
    execute_result.scalars.return_value = scalars_result

    mock_session = AsyncMock()
    mock_session.execute = AsyncMock(return_value=execute_result)
    mock_session.rollback = AsyncMock()
    return mock_session


def _make_session_context_manager(mock_session: AsyncMock):
    """
    Wrap mock_session in an async context manager so it can be used with
    ``async with db.AsyncSessionLocal() as session:``.
    """
    cm = AsyncMock()
    cm.__aenter__ = AsyncMock(return_value=mock_session)
    cm.__aexit__ = AsyncMock(return_value=False)
    return cm


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_process_no_unfinalized_seasons():
    """When no seasons need finalization, returns immediately without calling compute_season_awards."""
    mock_session = _make_mock_session(seasons=[])

    with (
        patch(
            "backend.services.season_finalization_service.db.AsyncSessionLocal",
            return_value=_make_session_context_manager(mock_session),
        ),
        patch(
            "backend.services.season_awards_service.compute_season_awards",
            new_callable=AsyncMock,
        ) as mock_compute,
    ):
        service = SeasonFinalizationService()
        await service._process_unfinalized_seasons()

    mock_compute.assert_not_called()


@pytest.mark.asyncio
async def test_process_single_unfinalized_season():
    """A single ended season with no awards_finalized_at should be finalized."""
    season = _make_season(season_id=42)
    mock_session = _make_mock_session(seasons=[season])

    fake_awards = [MagicMock(), MagicMock()]

    with (
        patch(
            "backend.services.season_finalization_service.db.AsyncSessionLocal",
            return_value=_make_session_context_manager(mock_session),
        ),
        patch(
            "backend.services.season_awards_service.compute_season_awards",
            new_callable=AsyncMock,
            return_value=fake_awards,
        ) as mock_compute,
    ):
        service = SeasonFinalizationService()
        await service._process_unfinalized_seasons()

    mock_compute.assert_awaited_once_with(mock_session, 42)


@pytest.mark.asyncio
async def test_process_multiple_unfinalized_seasons():
    """All unfinalized seasons are processed in sequence."""
    seasons = [_make_season(i) for i in (10, 20, 30)]
    mock_session = _make_mock_session(seasons=seasons)

    with (
        patch(
            "backend.services.season_finalization_service.db.AsyncSessionLocal",
            return_value=_make_session_context_manager(mock_session),
        ),
        patch(
            "backend.services.season_awards_service.compute_season_awards",
            new_callable=AsyncMock,
            return_value=[],
        ) as mock_compute,
    ):
        service = SeasonFinalizationService()
        await service._process_unfinalized_seasons()

    assert mock_compute.await_count == 3
    called_ids = [c.args[1] for c in mock_compute.await_args_list]
    assert called_ids == [10, 20, 30]


@pytest.mark.asyncio
async def test_error_for_one_season_does_not_block_others():
    """
    If compute_season_awards raises for season 20, seasons 10 and 30 are still
    finalized and rollback is called for the failing season.
    """
    seasons = [_make_season(i) for i in (10, 20, 30)]
    mock_session = _make_mock_session(seasons=seasons)

    call_order = []

    async def fake_compute(session, season_id):
        call_order.append(season_id)
        if season_id == 20:
            raise RuntimeError("database constraint violation")
        return []

    with (
        patch(
            "backend.services.season_finalization_service.db.AsyncSessionLocal",
            return_value=_make_session_context_manager(mock_session),
        ),
        patch(
            "backend.services.season_awards_service.compute_season_awards",
            side_effect=fake_compute,
        ),
    ):
        service = SeasonFinalizationService()
        await service._process_unfinalized_seasons()

    # All three seasons were attempted
    assert call_order == [10, 20, 30]
    # rollback was called once (for season 20)
    mock_session.rollback.assert_awaited_once()


@pytest.mark.asyncio
async def test_rollback_called_on_error():
    """Verifies that session.rollback() is awaited when a season fails."""
    season = _make_season(season_id=7)
    mock_session = _make_mock_session(seasons=[season])

    with (
        patch(
            "backend.services.season_finalization_service.db.AsyncSessionLocal",
            return_value=_make_session_context_manager(mock_session),
        ),
        patch(
            "backend.services.season_awards_service.compute_season_awards",
            new_callable=AsyncMock,
            side_effect=Exception("unexpected error"),
        ),
    ):
        service = SeasonFinalizationService()
        await service._process_unfinalized_seasons()

    mock_session.rollback.assert_awaited_once()


@pytest.mark.asyncio
async def test_db_execute_uses_correct_filter_criteria():
    """
    Verifies the DB query is executed (with some WHERE clause) and that
    today's date is used as the cutoff — not a hardcoded date.
    """
    mock_session = _make_mock_session(seasons=[])

    with (
        patch(
            "backend.services.season_finalization_service.db.AsyncSessionLocal",
            return_value=_make_session_context_manager(mock_session),
        ),
        patch("backend.services.season_finalization_service.date") as mock_date,
    ):
        mock_date.today.return_value = date(2025, 6, 15)

        service = SeasonFinalizationService()
        await service._process_unfinalized_seasons()

    # execute() was called exactly once — the SELECT query
    mock_session.execute.assert_awaited_once()
    # date.today() was called to get the cutoff
    mock_date.today.assert_called_once()
