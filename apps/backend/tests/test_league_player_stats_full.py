"""
Integration tests for ``stats_read_data.get_league_player_stats_full``.

Covers the aggregating service that backs
``GET /api/leagues/{league_id}/players/{player_id}/stats``. Seeds players,
a league, a season, and league-scoped + season-scoped partner/opponent rows,
then verifies the composed response.
"""

from __future__ import annotations

from datetime import date, timedelta

import pytest

from backend.database.models import (
    League,
    OpponentStatsLeague,
    OpponentStatsSeason,
    PartnershipStatsLeague,
    PartnershipStatsSeason,
    Player,
    PlayerLeagueStats,
    PlayerSeasonStats,
    Season,
)
from backend.services.stats_read_data import get_league_player_stats_full


async def _player(db_session, full_name: str, level: str | None = None) -> Player:
    parts = full_name.split()
    p = Player(
        full_name=full_name,
        first_name=parts[0],
        last_name=parts[-1] if len(parts) > 1 else parts[0],
        level=level,
    )
    db_session.add(p)
    await db_session.commit()
    await db_session.refresh(p)
    return p


async def _league(db_session, name: str) -> League:
    league = League(name=name)
    db_session.add(league)
    await db_session.commit()
    await db_session.refresh(league)
    return league


async def _season(db_session, league: League, name: str = "Spring 2024") -> Season:
    season = Season(
        league_id=league.id,
        name=name,
        start_date=date.today() - timedelta(days=30),
        end_date=date.today() + timedelta(days=30),
    )
    db_session.add(season)
    await db_session.commit()
    await db_session.refresh(season)
    return season


@pytest.mark.asyncio
async def test_returns_none_when_player_missing(db_session):
    league = await _league(db_session, "L")
    result = await get_league_player_stats_full(
        db_session, league_id=league.id, player_id=999_999
    )
    assert result is None


@pytest.mark.asyncio
async def test_returns_none_when_league_missing(db_session):
    p = await _player(db_session, "Pat S")
    result = await get_league_player_stats_full(
        db_session, league_id=999_999, player_id=p.id
    )
    assert result is None


@pytest.mark.asyncio
async def test_returns_none_when_season_does_not_belong_to_league(db_session):
    p = await _player(db_session, "Pat S")
    league_a = await _league(db_session, "League A")
    league_b = await _league(db_session, "League B")
    season_b = await _season(db_session, league_b, "B-S1")

    result = await get_league_player_stats_full(
        db_session,
        league_id=league_a.id,
        player_id=p.id,
        season_id=season_b.id,
    )
    assert result is None


@pytest.mark.asyncio
async def test_league_scoped_aggregates_player_partners_and_opponents(db_session):
    p = await _player(db_session, "Pat S", level="Open")
    partner = await _player(db_session, "Kara F")
    opponent = await _player(db_session, "Jake D")
    league = await _league(db_session, "QBK Open Men")

    db_session.add(
        PlayerLeagueStats(
            player_id=p.id,
            league_id=league.id,
            games=20,
            wins=14,
            points=0,
            win_rate=70.0,
            avg_point_diff=2.7,
        )
    )
    db_session.add(
        PartnershipStatsLeague(
            player_id=p.id,
            partner_id=partner.id,
            league_id=league.id,
            games=10,
            wins=8,
            points=0,
            win_rate=80.0,
            avg_point_diff=3.0,
        )
    )
    db_session.add(
        OpponentStatsLeague(
            player_id=p.id,
            opponent_id=opponent.id,
            league_id=league.id,
            games=6,
            wins=5,
            points=0,
            win_rate=83.3,
            avg_point_diff=4.0,
        )
    )
    await db_session.commit()

    result = await get_league_player_stats_full(
        db_session,
        league_id=league.id,
        player_id=p.id,
        current_user_player_id=p.id,
    )

    assert result is not None
    assert result["player_id"] == p.id
    assert result["league_id"] == league.id
    assert result["league_name"] == "QBK Open Men"
    assert result["season_id"] is None
    assert result["season_name"] is None
    assert result["level"] == "Open"
    assert result["display_name"] == "Pat S"
    assert result["initials"] == "PS"
    assert result["overall"] == {
        "wins": 14,
        "losses": 6,
        "win_rate": 70.0,
        "games_played": 20,
        "point_diff": 2.7,
    }
    assert result["points"] is None  # league scope: no points field
    assert result["rating"] == 0
    assert result["rank"] is None
    assert result["rating_delta"] is None
    assert result["game_history"] == []
    assert result["is_self"] is True

    assert len(result["partners"]) == 1
    assert result["partners"][0] == {
        "player_id": partner.id,
        "display_name": "Kara F",
        "initials": "KF",
        "games_played": 10,
        "wins": 8,
        "losses": 2,
        "win_rate": 80.0,
    }

    assert len(result["opponents"]) == 1
    assert result["opponents"][0]["player_id"] == opponent.id
    assert result["opponents"][0]["wins"] == 5
    assert result["opponents"][0]["losses"] == 1


@pytest.mark.asyncio
async def test_season_scope_uses_season_tables_and_points(db_session):
    p = await _player(db_session, "Pat S")
    partner = await _player(db_session, "Kara F")
    opponent = await _player(db_session, "Jake D")
    league = await _league(db_session, "QBK")
    season = await _season(db_session, league, "Spring 2024")

    db_session.add(
        PlayerSeasonStats(
            player_id=p.id,
            season_id=season.id,
            games=12,
            wins=9,
            points=27.5,
            win_rate=75.0,
            avg_point_diff=3.1,
        )
    )
    db_session.add(
        PartnershipStatsSeason(
            player_id=p.id,
            partner_id=partner.id,
            season_id=season.id,
            games=4,
            wins=3,
            points=9,
            win_rate=75.0,
            avg_point_diff=2.5,
        )
    )
    db_session.add(
        OpponentStatsSeason(
            player_id=p.id,
            opponent_id=opponent.id,
            season_id=season.id,
            games=2,
            wins=1,
            points=3,
            win_rate=50.0,
            avg_point_diff=0.5,
        )
    )
    # Add league-scoped rows that the season-scoped query MUST NOT pick up.
    db_session.add(
        PartnershipStatsLeague(
            player_id=p.id,
            partner_id=partner.id,
            league_id=league.id,
            games=999,
            wins=999,
            points=0,
            win_rate=99.0,
            avg_point_diff=99.0,
        )
    )
    await db_session.commit()

    result = await get_league_player_stats_full(
        db_session,
        league_id=league.id,
        player_id=p.id,
        season_id=season.id,
    )

    assert result is not None
    assert result["season_id"] == season.id
    assert result["season_name"] == "Spring 2024"
    assert result["points"] == pytest.approx(27.5)
    # rating rounds to nearest int when scoped to a season.
    assert result["rating"] == 28
    assert result["overall"]["games_played"] == 12
    assert result["overall"]["wins"] == 9
    assert result["overall"]["losses"] == 3
    assert result["partners"][0]["games_played"] == 4
    assert result["opponents"][0]["games_played"] == 2
    # is_self is False when no viewer is provided.
    assert result["is_self"] is False


@pytest.mark.asyncio
async def test_player_with_no_stats_returns_zero_overall(db_session):
    p = await _player(db_session, "Solo Player")
    league = await _league(db_session, "Empty League")

    result = await get_league_player_stats_full(
        db_session, league_id=league.id, player_id=p.id
    )

    assert result is not None
    assert result["overall"] == {
        "wins": 0,
        "losses": 0,
        "win_rate": 0.0,
        "games_played": 0,
        "point_diff": 0.0,
    }
    assert result["partners"] == []
    assert result["opponents"] == []
