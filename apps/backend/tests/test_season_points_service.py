from types import SimpleNamespace as NS
from unittest.mock import AsyncMock, patch
from datetime import date
import pytest
from backend.services.leagues.season_points_service import get_season_points, iso_date
from backend.models.schemas.season_points import SeasonPointsResponse


def result(value):
    return NS(
        scalar_one_or_none=lambda: value,
        scalar_one=lambda: value,
        scalars=lambda: NS(all=lambda: value),
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("rating", [False, True])
@pytest.mark.parametrize("complete", [False, True])
async def test_points_history_matches_standings(rating, complete):
    s = NS(id=1, date="10/06/2026", status="SUBMITTED")
    m = NS(
        id=8,
        session=s,
        team1_player1_id=1,
        team1_player2_id=2,
        team2_player1_id=3,
        team2_player2_id=4,
        winner=1,
    )
    config = (
        '{"type":"season_rating"}'
        if rating
        else '{"type":"points_system","points_per_win":5,"points_per_loss":-2}'
    )
    season = NS(
        id=2,
        name="Fall",
        start_date=date(2026, 10, 1),
        end_date=None,
        scoring_system="season_rating" if rating else "points_system",
        point_system=config,
    )
    points = 110 if rating else 5
    db = NS(
        execute=AsyncMock(
            side_effect=[
                result(season),
                result(NS(name="League")),
                result([NS(player_id=1, match_id=8, rating_after=110)] if rating else []),
            ]
        )
    )
    standings = {
        "standings": [
            dict(
                player_id=1,
                display_name="A. Player",
                rank=1,
                games_played=1,
                wins=1,
                rating=points if complete else points + 100,
            )
        ]
    }
    with (
        patch(
            "backend.services.leagues.season_points_service.get_league_standings",
            AsyncMock(return_value=standings),
        ),
        patch(
            "backend.services.leagues.season_points_service.load_stat_eligible_matches_async",
            AsyncMock(return_value=[m]),
        ),
    ):
        response = SeasonPointsResponse.model_validate(await get_season_points(db, 1, 2))
    assert response.players[0].complete == complete
    if not complete:
        assert response.players[0].history == []
        return
    assert response.players[0].history[0].points == points
    assert response.players[0].history[0].change == (10 if rating else 5)
    assert response.players[0].history[0].date == "2026-10-06"
    assert db.execute.call_count == 3


@pytest.mark.asyncio
async def test_missing_or_wrong_league_season_is_404():
    from fastapi import HTTPException

    db = NS(execute=AsyncMock(return_value=result(None)))
    with pytest.raises(HTTPException) as error:
        await get_season_points(db, 1, 999)
    assert error.value.status_code == 404


def test_date_formats():
    assert iso_date("2026-10-06") == iso_date("10/06/2026")
    with pytest.raises(ValueError):
        iso_date("not a date")


def test_points_route_requires_authentication(monkeypatch):
    monkeypatch.setenv("JWT_SECRET_KEY", "test-only-season-points-secret-at-least-32-characters")
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from backend.api.routes.seasons import router

    app = FastAPI()
    app.include_router(router)
    response = TestClient(app).get("/api/leagues/1/seasons/2/points-history")
    assert response.status_code == 401
