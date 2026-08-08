"""Regression coverage for the generic match score invariant."""

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from backend.services.match_validation import (
    MATCH_SCORE_EMPTY_ERROR,
    MATCH_SCORE_TIED_ERROR,
    validate_match_score,
)
from backend.services.session_data import create_match_async, update_match_async


@pytest.mark.parametrize(
    ("team1_score", "team2_score", "message"),
    [
        (0, 0, MATCH_SCORE_EMPTY_ERROR),
        (5, 5, MATCH_SCORE_TIED_ERROR),
        (21, 21, MATCH_SCORE_TIED_ERROR),
    ],
)
def test_validate_match_score_rejects_games_without_a_winner(team1_score, team2_score, message):
    with pytest.raises(ValueError, match=message.replace(".", r"\.")):
        validate_match_score(team1_score, team2_score)


@pytest.mark.parametrize(
    ("team1_score", "team2_score"),
    [(1, 0), (21, 20), (22, 20), (23, 21), (21, 15)],
)
def test_validate_match_score_accepts_untied_scores(team1_score, team2_score):
    validate_match_score(team1_score, team2_score)


@pytest.mark.asyncio
async def test_create_match_service_rejects_tie_before_database_work():
    session = AsyncMock()
    request = SimpleNamespace(team1_score=21, team2_score=21)

    with pytest.raises(ValueError, match="Choose a winner"):
        await create_match_async(session, request, session_id=7)

    session.execute.assert_not_awaited()


@pytest.mark.asyncio
async def test_update_match_service_rejects_tie_before_database_work():
    session = AsyncMock()
    request = SimpleNamespace(team1_score=21, team2_score=21)

    with pytest.raises(ValueError, match="Choose a winner"):
        await update_match_async(session, match_id=9, match_request=request)

    session.execute.assert_not_awaited()
