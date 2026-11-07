"""Current global rating is separate from season points in authorized standings."""

from datetime import UTC, date, datetime

import pytest
from sqlalchemy import event

from backend.database.models import (
    League,
    Player,
    PlayerGlobalStats,
    PlayerLeagueStats,
    PlayerSeasonStats,
    Season,
)
from backend.services.leagues.league_data import get_league_standings


async def season_fixture(session):
    league = League(name="Standings contract test", is_public=True)
    session.add(league)
    await session.flush()
    season = Season(league_id=league.id, name="Current season", start_date=date(2026, 1, 1))
    rated = Player(full_name="Rated Test Player")
    unrated = Player(full_name="Unrated Test Player")
    session.add_all([season, rated, unrated])
    await session.flush()
    global_stats = PlayerGlobalStats(player_id=rated.id, current_rating=1642.5)
    session.add_all(
        [
            global_stats,
            PlayerSeasonStats(
                player_id=rated.id, season_id=season.id, games=6, wins=4, points=24, win_rate=4 / 6
            ),
            PlayerSeasonStats(
                player_id=unrated.id,
                season_id=season.id,
                games=6,
                wins=5,
                points=30,
                win_rate=5 / 6,
            ),
        ]
    )
    await session.commit()
    return league, season, rated, unrated, global_stats


@pytest.mark.asyncio
async def test_current_global_rating_preserves_season_points_ranking_and_missing_rows(db_session):
    league, season, rated, unrated, global_stats = await season_fixture(db_session)
    result = await get_league_standings(db_session, league.id, season.id)
    standings = result["standings"]
    # Global ratings do not reorder the season or replace season scoring values.
    assert [row["player_id"] for row in standings] == [unrated.id, rated.id]
    assert standings[0]["rating"] == 30
    assert standings[0]["global_rating"] is None
    assert standings[1]["rating"] == 24
    assert standings[1]["global_rating"] == 1642.5

    # Read the authoritative global aggregate, including updates after season stats.
    global_stats.current_rating = 1701.25
    await db_session.commit()
    refreshed = await get_league_standings(db_session, league.id, season.id)
    assert refreshed["standings"][1]["global_rating"] == 1701.25
    assert refreshed["standings"][1]["rating"] == 24


@pytest.mark.asyncio
async def test_season_from_another_league_does_not_disclose_rows_or_metadata(db_session):
    _league, season, *_ = await season_fixture(db_session)
    other_league = League(name="Different authorized league", is_public=True)
    db_session.add(other_league)
    await db_session.commit()
    result = await get_league_standings(db_session, other_league.id, season.id)
    assert result == {"standings": [], "season_info": None}


@pytest.mark.asyncio
async def test_all_time_global_rating_keeps_existing_rating_contract(db_session):
    league, _, rated, unrated, _ = await season_fixture(db_session)
    db_session.add_all(
        [
            PlayerLeagueStats(
                player_id=rated.id, league_id=league.id, games=6, wins=4, win_rate=4 / 6
            ),
            PlayerLeagueStats(
                player_id=unrated.id, league_id=league.id, games=6, wins=5, win_rate=5 / 6
            ),
        ]
    )
    await db_session.commit()
    result = await get_league_standings(db_session, league.id)
    rows = {row["player_id"]: row for row in result["standings"]}
    assert rows[rated.id]["rating"] == rows[rated.id]["global_rating"] == 1642.5
    assert rows[unrated.id]["rating"] is None
    assert rows[unrated.id]["global_rating"] is None


@pytest.mark.asyncio
async def test_global_rating_reads_stay_bulk_and_deleted_players_stay_excluded(db_session):
    league, season, rated, unrated, _ = await season_fixture(db_session)
    connection = await db_session.connection()
    engine = connection.engine.sync_engine
    statements = []

    def record_sql(_conn, _cursor, statement, _parameters, _context, _executemany):
        statements.append(statement)

    event.listen(engine, "before_cursor_execute", record_sql)
    try:
        await get_league_standings(db_session, league.id, season.id)
        initial_query_count = len(statements)
        extra = Player(full_name="Another Ranked Player")
        db_session.add(extra)
        await db_session.flush()
        db_session.add_all(
            [
                PlayerSeasonStats(
                    player_id=extra.id, season_id=season.id, games=1, wins=1, points=3, win_rate=1
                ),
                PlayerGlobalStats(player_id=extra.id, current_rating=1250),
            ]
        )
        await db_session.flush()
        statements.clear()
        result = await get_league_standings(db_session, league.id, season.id)
        assert len(result["standings"]) == 3
        assert len(statements) == initial_query_count
        assert any("LEFT OUTER JOIN player_global_stats" in sql for sql in statements)
        rated.deleted_at = datetime(2026, 1, 2, tzinfo=UTC)
        await db_session.flush()
        result = await get_league_standings(db_session, league.id, season.id)
        assert [row["player_id"] for row in result["standings"]] == [unrated.id, extra.id]
    finally:
        event.remove(engine, "before_cursor_execute", record_sql)
