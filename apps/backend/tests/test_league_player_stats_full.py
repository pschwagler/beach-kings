"""
Integration tests for ``stats_read_data.get_league_player_stats_full``.

Covers the aggregating service that backs
``GET /api/leagues/{league_id}/players/{player_id}/stats``. Seeds players,
a league, a season, and league-scoped + season-scoped partner/opponent rows,
then verifies the composed response.

Also covers:
- rank populated from row_number() matching the standings ordering
- game_history populated with viewed-player perspective and league/season scoping
- access-control gate: per-player league stats are members-only (every league)
"""

from __future__ import annotations

from datetime import date, timedelta

import pytest

from backend.database.models import (
    League,
    LeagueMember,
    Match,
    OpponentStatsLeague,
    OpponentStatsSeason,
    PartnershipStatsLeague,
    PartnershipStatsSeason,
    Player,
    PlayerLeagueStats,
    PlayerSeasonStats,
    Season,
    Session,
    SessionStatus,
)
from backend.services.stats.stats_read_data import get_league_player_stats_full


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


async def _league(db_session, name: str, is_public: bool = True) -> League:
    league = League(name=name, is_public=is_public)
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
    result = await get_league_player_stats_full(db_session, league_id=league.id, player_id=999_999)
    assert result is None


@pytest.mark.asyncio
async def test_returns_none_when_league_missing(db_session):
    p = await _player(db_session, "Pat S")
    result = await get_league_player_stats_full(db_session, league_id=999_999, player_id=p.id)
    assert result is None


@pytest.mark.asyncio
async def test_returns_none_when_season_does_not_belong_to_league(db_session):
    p = await _player(db_session, "Pat S")
    league_a = await _league(db_session, "League A")
    league_b = await _league(db_session, "League B")
    season_b = await _season(db_session, league_b, "B-S1")
    await _league_member(db_session, league_a, p)

    result = await get_league_player_stats_full(
        db_session,
        league_id=league_a.id,
        player_id=p.id,
        season_id=season_b.id,
        caller_player_id=p.id,
    )
    assert result is None


@pytest.mark.asyncio
async def test_league_scoped_aggregates_player_partners_and_opponents(db_session):
    p = await _player(db_session, "Pat S", level="Open")
    partner = await _player(db_session, "Kara F")
    opponent = await _player(db_session, "Jake D")
    league = await _league(db_session, "QBK Open Men")
    await _league_member(db_session, league, p)

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
        caller_player_id=p.id,
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
    # Only one player in the league has stats — rank is 1 (not None).
    assert result["rank"] == 1
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
    await _league_member(db_session, league, p)

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
        caller_player_id=p.id,
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
    await _league_member(db_session, league, p)

    result = await get_league_player_stats_full(
        db_session, league_id=league.id, player_id=p.id, caller_player_id=p.id
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


# ---------------------------------------------------------------------------
# Helpers for rank / game_history / access-gate tests
# ---------------------------------------------------------------------------


async def _league_member(
    db_session, league: League, player: Player, role: str = "member"
) -> LeagueMember:
    lm = LeagueMember(league_id=league.id, player_id=player.id, role=role)
    db_session.add(lm)
    await db_session.commit()
    await db_session.refresh(lm)
    return lm


async def _session(
    db_session,
    league: League,
    season: Season | None = None,
    status: SessionStatus = SessionStatus.SUBMITTED,
    session_date: str = "2024-03-01",
) -> Session:
    s = Session(
        name="Test Session",
        date=session_date,
        league_id=league.id,
        season_id=season.id if season else None,
        status=status,
    )
    db_session.add(s)
    await db_session.commit()
    await db_session.refresh(s)
    return s


async def _match(
    db_session,
    session: Session,
    t1p1: Player,
    t1p2: Player,
    t2p1: Player,
    t2p2: Player,
    t1_score: int = 21,
    t2_score: int = 15,
    winner: int = 1,
) -> Match:
    m = Match(
        session_id=session.id,
        team1_player1_id=t1p1.id,
        team1_player2_id=t1p2.id,
        team2_player1_id=t2p1.id,
        team2_player2_id=t2p2.id,
        team1_score=t1_score,
        team2_score=t2_score,
        winner=winner,
    )
    db_session.add(m)
    await db_session.commit()
    await db_session.refresh(m)
    return m


# ---------------------------------------------------------------------------
# Rank tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_rank_league_scope_matches_standings_ordering(db_session):
    """
    rank in league (all-time) scope matches get_league_standings' all-time
    ordering: wins desc, win_rate desc.

    Points are a season-only concept (PlayerLeagueStats.points is always 0
    league-wide), so league-scope rank must NOT order by points. This setup
    deliberately makes the wins-leader differ from the (would-be) points-leader
    to prove the ordering follows wins, not points.

    Player A has MORE wins but FEWER points. Player B has FEWER wins but MORE
    points. Standings ranks by wins → Player A is rank 1, Player B is rank 2.
    """
    player_a = await _player(db_session, "Alice A")
    player_b = await _player(db_session, "Bob B")
    league = await _league(db_session, "Rank League")
    await _league_member(db_session, league, player_a)
    await _league_member(db_session, league, player_b)

    # Player A: more wins, fewer points (wins-leader)
    db_session.add(
        PlayerLeagueStats(
            player_id=player_a.id,
            league_id=league.id,
            games=10,
            wins=8,
            points=10.0,
            win_rate=80.0,
            avg_point_diff=1.0,
        )
    )
    # Player B: fewer wins, more points + higher avg_point_diff (would win a
    # points-based sort, but must lose a wins-based sort)
    db_session.add(
        PlayerLeagueStats(
            player_id=player_b.id,
            league_id=league.id,
            games=10,
            wins=5,
            points=99.0,
            win_rate=50.0,
            avg_point_diff=9.0,
        )
    )
    await db_session.commit()

    result_a = await get_league_player_stats_full(
        db_session, league_id=league.id, player_id=player_a.id, caller_player_id=player_a.id
    )
    result_b = await get_league_player_stats_full(
        db_session, league_id=league.id, player_id=player_b.id, caller_player_id=player_b.id
    )

    assert result_b is not None
    assert result_a is not None
    # Wins-based ordering: A (8 wins) outranks B (5 wins), regardless of points.
    assert result_a["rank"] == 1
    assert result_b["rank"] == 2


@pytest.mark.asyncio
async def test_rank_season_scope_matches_standings_ordering(db_session):
    """
    rank is populated via row_number() in season scope using _SEASON_RANK_ORDER.
    Player with higher points ranks above player with lower points.
    """
    player_a = await _player(db_session, "Alice A")
    player_b = await _player(db_session, "Bob B")
    league = await _league(db_session, "Season Rank League")
    season = await _season(db_session, league, "Spring 2024")
    await _league_member(db_session, league, player_a)
    await _league_member(db_session, league, player_b)

    db_session.add(
        PlayerSeasonStats(
            player_id=player_a.id,
            season_id=season.id,
            games=6,
            wins=3,
            points=30.0,
            win_rate=50.0,
            avg_point_diff=0.5,
        )
    )
    db_session.add(
        PlayerSeasonStats(
            player_id=player_b.id,
            season_id=season.id,
            games=6,
            wins=5,
            points=50.0,
            win_rate=83.3,
            avg_point_diff=2.0,
        )
    )
    await db_session.commit()

    result_a = await get_league_player_stats_full(
        db_session,
        league_id=league.id,
        player_id=player_a.id,
        season_id=season.id,
        caller_player_id=player_a.id,
    )
    result_b = await get_league_player_stats_full(
        db_session,
        league_id=league.id,
        player_id=player_b.id,
        season_id=season.id,
        caller_player_id=player_b.id,
    )

    assert result_b is not None
    assert result_a is not None
    assert result_b["rank"] == 1
    assert result_a["rank"] == 2


@pytest.mark.asyncio
async def test_rank_none_when_no_stats_row(db_session):
    """rank remains None when the player has no stats row (never played)."""
    player = await _player(db_session, "Ghost G")
    league = await _league(db_session, "Empty League Ghost")
    await _league_member(db_session, league, player)

    result = await get_league_player_stats_full(
        db_session, league_id=league.id, player_id=player.id, caller_player_id=player.id
    )

    assert result is not None
    assert result["rank"] is None


@pytest.mark.asyncio
async def test_rank_tiebreak_by_avg_point_diff_then_win_rate(db_session):
    """
    Season scope: when points AND wins are equal, avg_point_diff is the next
    tiebreaker (per _SEASON_RANK_ORDER). avg_point_diff only participates in
    season-scope ranking — league/all-time scope ranks by wins + win_rate only.
    """
    player_a = await _player(db_session, "Tie A")
    player_b = await _player(db_session, "Tie B")
    league = await _league(db_session, "Tie League")
    season = await _season(db_session, league, "Tie Season")
    await _league_member(db_session, league, player_a)
    await _league_member(db_session, league, player_b)

    # Same points and same wins, player_b has higher avg_point_diff
    db_session.add(
        PlayerSeasonStats(
            player_id=player_a.id,
            season_id=season.id,
            games=10,
            wins=5,
            points=50.0,
            win_rate=50.0,
            avg_point_diff=1.0,
        )
    )
    db_session.add(
        PlayerSeasonStats(
            player_id=player_b.id,
            season_id=season.id,
            games=10,
            wins=5,
            points=50.0,
            win_rate=50.0,
            avg_point_diff=3.0,
        )
    )
    await db_session.commit()

    result_a = await get_league_player_stats_full(
        db_session,
        league_id=league.id,
        player_id=player_a.id,
        season_id=season.id,
        caller_player_id=player_a.id,
    )
    result_b = await get_league_player_stats_full(
        db_session,
        league_id=league.id,
        player_id=player_b.id,
        season_id=season.id,
        caller_player_id=player_b.id,
    )

    assert result_b is not None and result_a is not None
    assert result_b["rank"] == 1
    assert result_a["rank"] == 2


@pytest.mark.asyncio
async def test_rank_tiebreak_by_wins_before_avg_point_diff(db_session):
    """
    Season scope: when points are equal, WINS is the primary tiebreaker and
    outranks avg_point_diff. The player with more wins ranks higher even if the
    other has a better average point differential.
    """
    player_a = await _player(db_session, "Wins A")
    player_b = await _player(db_session, "Diff B")
    league = await _league(db_session, "Wins Tie League")
    season = await _season(db_session, league, "Wins Tie Season")
    await _league_member(db_session, league, player_a)
    await _league_member(db_session, league, player_b)

    # Same points. player_a has MORE wins; player_b has a higher avg_point_diff.
    # Wins must win the tiebreak, so player_a ranks first.
    db_session.add(
        PlayerSeasonStats(
            player_id=player_a.id,
            season_id=season.id,
            games=12,
            wins=8,
            points=50.0,
            win_rate=66.7,
            avg_point_diff=1.0,
        )
    )
    db_session.add(
        PlayerSeasonStats(
            player_id=player_b.id,
            season_id=season.id,
            games=12,
            wins=3,
            points=50.0,
            win_rate=25.0,
            avg_point_diff=9.0,
        )
    )
    await db_session.commit()

    result_a = await get_league_player_stats_full(
        db_session,
        league_id=league.id,
        player_id=player_a.id,
        season_id=season.id,
        caller_player_id=player_a.id,
    )
    result_b = await get_league_player_stats_full(
        db_session,
        league_id=league.id,
        player_id=player_b.id,
        season_id=season.id,
        caller_player_id=player_b.id,
    )

    assert result_a is not None and result_b is not None
    assert result_a["rank"] == 1
    assert result_b["rank"] == 2


# ---------------------------------------------------------------------------
# game_history tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_game_history_populated_with_viewed_player_perspective(db_session):
    """
    game_history is built from the VIEWED player's perspective: my_score,
    partner_names, opponent_names, and result are relative to player_id.
    Scoped to the league.
    """
    viewed = await _player(db_session, "Viewed V")
    partner = await _player(db_session, "Partner P")
    opp1 = await _player(db_session, "Opp One")
    opp2 = await _player(db_session, "Opp Two")
    league = await _league(db_session, "History League")
    await _league_member(db_session, league, viewed)
    sess = await _session(db_session, league, session_date="2024-03-15")

    # viewed + partner beat opp1 + opp2 (21-15, winner=1 because viewed is on team1)
    await _match(
        db_session,
        sess,
        t1p1=viewed,
        t1p2=partner,
        t2p1=opp1,
        t2p2=opp2,
        t1_score=21,
        t2_score=15,
        winner=1,
    )

    db_session.add(
        PlayerLeagueStats(
            player_id=viewed.id,
            league_id=league.id,
            games=1,
            wins=1,
            points=10.0,
            win_rate=100.0,
            avg_point_diff=6.0,
        )
    )
    await db_session.commit()

    result = await get_league_player_stats_full(
        db_session, league_id=league.id, player_id=viewed.id, caller_player_id=viewed.id
    )

    assert result is not None
    assert len(result["game_history"]) == 1
    entry = result["game_history"][0]
    assert entry["result"] == "W"
    assert entry["my_score"] == 21
    assert entry["opponent_score"] == 15
    assert partner.full_name in entry["partner_names"]
    assert opp1.full_name in entry["opponent_names"] or opp2.full_name in entry["opponent_names"]
    assert entry["league_id"] == league.id


@pytest.mark.asyncio
async def test_game_history_opponent_perspective(db_session):
    """
    When the viewed player is on team2 (losing side), result is 'L' and
    scores are from their perspective (my_score = team2_score).
    """
    viewed = await _player(db_session, "Team2 Player")
    partner2 = await _player(db_session, "Partner2 P")
    opp1 = await _player(db_session, "Winner One")
    opp2 = await _player(db_session, "Winner Two")
    league = await _league(db_session, "Perspective League")
    await _league_member(db_session, league, viewed)
    sess = await _session(db_session, league, session_date="2024-04-01")

    # viewed is on team2 and loses (winner=1 = team1 wins)
    await _match(
        db_session,
        sess,
        t1p1=opp1,
        t1p2=opp2,
        t2p1=viewed,
        t2p2=partner2,
        t1_score=21,
        t2_score=10,
        winner=1,
    )

    db_session.add(
        PlayerLeagueStats(
            player_id=viewed.id,
            league_id=league.id,
            games=1,
            wins=0,
            points=5.0,
            win_rate=0.0,
            avg_point_diff=-11.0,
        )
    )
    await db_session.commit()

    result = await get_league_player_stats_full(
        db_session, league_id=league.id, player_id=viewed.id, caller_player_id=viewed.id
    )

    assert result is not None
    assert len(result["game_history"]) == 1
    entry = result["game_history"][0]
    assert entry["result"] == "L"
    assert entry["my_score"] == 10
    assert entry["opponent_score"] == 21


@pytest.mark.asyncio
async def test_game_history_scoped_to_league(db_session):
    """
    Matches from other leagues are NOT included in game_history.
    """
    viewed = await _player(db_session, "Multi League P")
    partner = await _player(db_session, "Partner ML")
    opp1 = await _player(db_session, "Opp ML1")
    opp2 = await _player(db_session, "Opp ML2")
    league_a = await _league(db_session, "League A ML")
    league_b = await _league(db_session, "League B ML")
    await _league_member(db_session, league_a, viewed)

    sess_a = await _session(db_session, league_a, session_date="2024-03-01")
    sess_b = await _session(db_session, league_b, session_date="2024-03-02")

    await _match(db_session, sess_a, t1p1=viewed, t1p2=partner, t2p1=opp1, t2p2=opp2)
    await _match(db_session, sess_b, t1p1=viewed, t1p2=partner, t2p1=opp1, t2p2=opp2)

    db_session.add(
        PlayerLeagueStats(
            player_id=viewed.id,
            league_id=league_a.id,
            games=1,
            wins=1,
            points=10.0,
            win_rate=100.0,
            avg_point_diff=6.0,
        )
    )
    await db_session.commit()

    result = await get_league_player_stats_full(
        db_session, league_id=league_a.id, player_id=viewed.id, caller_player_id=viewed.id
    )

    assert result is not None
    # Only the match in league_a should appear
    assert len(result["game_history"]) == 1
    assert result["game_history"][0]["league_id"] == league_a.id


@pytest.mark.asyncio
async def test_game_history_scoped_to_season(db_session):
    """
    When season_id is provided, only matches from that season's sessions appear.
    """
    viewed = await _player(db_session, "Season Player")
    partner = await _player(db_session, "Season Partner")
    opp1 = await _player(db_session, "Season Opp1")
    opp2 = await _player(db_session, "Season Opp2")
    league = await _league(db_session, "Season Filter League")
    season = await _season(db_session, league, "Spring 2024")
    await _league_member(db_session, league, viewed)

    sess_in = await _session(db_session, league, season=season, session_date="2024-03-01")
    sess_out = await _session(db_session, league, season=None, session_date="2024-02-01")

    await _match(db_session, sess_in, t1p1=viewed, t1p2=partner, t2p1=opp1, t2p2=opp2)
    await _match(db_session, sess_out, t1p1=viewed, t1p2=partner, t2p1=opp1, t2p2=opp2)

    db_session.add(
        PlayerSeasonStats(
            player_id=viewed.id,
            season_id=season.id,
            games=1,
            wins=1,
            points=10.0,
            win_rate=100.0,
            avg_point_diff=6.0,
        )
    )
    await db_session.commit()

    result = await get_league_player_stats_full(
        db_session,
        league_id=league.id,
        player_id=viewed.id,
        season_id=season.id,
        caller_player_id=viewed.id,
    )

    assert result is not None
    assert len(result["game_history"]) == 1
    assert result["game_history"][0]["league_id"] == league.id


@pytest.mark.asyncio
async def test_game_history_empty_when_no_matches(db_session):
    """game_history is an empty list when the player has no matches in the league."""
    player = await _player(db_session, "No Games Player")
    league = await _league(db_session, "No Games League")
    await _league_member(db_session, league, player)

    result = await get_league_player_stats_full(
        db_session, league_id=league.id, player_id=player.id, caller_player_id=player.id
    )

    assert result is not None
    assert result["game_history"] == []


# ---------------------------------------------------------------------------
# Static fields unchanged
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_rating_delta_always_none(db_session):
    """rating_delta is always None (MVP decision, not computed)."""
    player = await _player(db_session, "Delta Player")
    league = await _league(db_session, "Delta League")
    await _league_member(db_session, league, player)

    db_session.add(
        PlayerLeagueStats(
            player_id=player.id,
            league_id=league.id,
            games=5,
            wins=3,
            points=30.0,
            win_rate=60.0,
            avg_point_diff=2.0,
        )
    )
    await db_session.commit()

    result = await get_league_player_stats_full(
        db_session, league_id=league.id, player_id=player.id, caller_player_id=player.id
    )

    assert result is not None
    assert result["rating_delta"] is None


@pytest.mark.asyncio
async def test_rating_is_points_based(db_session):
    """rating equals round(points); rating_delta remains None."""
    player = await _player(db_session, "Rating Player")
    league = await _league(db_session, "Rating League")
    season = await _season(db_session, league, "Rating Season")
    await _league_member(db_session, league, player)

    db_session.add(
        PlayerSeasonStats(
            player_id=player.id,
            season_id=season.id,
            games=4,
            wins=2,
            points=42.7,
            win_rate=50.0,
            avg_point_diff=1.0,
        )
    )
    await db_session.commit()

    result = await get_league_player_stats_full(
        db_session,
        league_id=league.id,
        player_id=player.id,
        season_id=season.id,
        caller_player_id=player.id,
    )

    assert result is not None
    assert result["rating"] == 43  # round(42.7)
    assert result["rating_delta"] is None


# ---------------------------------------------------------------------------
# Access-control gate tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_access_gate_public_league_member_allowed(db_session):
    """Public leagues are members-only for per-player stats; a member can read."""
    player = await _player(db_session, "Public Player")
    member = await _player(db_session, "Public Member Caller")
    league = await _league(db_session, "Public League", is_public=True)
    await _league_member(db_session, league, member)

    result = await get_league_player_stats_full(
        db_session,
        league_id=league.id,
        player_id=player.id,
        caller_player_id=member.id,
    )

    assert result is not None


@pytest.mark.asyncio
async def test_access_gate_public_league_non_member_raises_403(db_session):
    """A non-member caller gets 403 even for a public league (members-only stats)."""
    from fastapi import HTTPException

    player = await _player(db_session, "Public Target")
    non_member = await _player(db_session, "Public Non Member")
    league = await _league(db_session, "Public League NM", is_public=True)

    with pytest.raises(HTTPException) as exc_info:
        await get_league_player_stats_full(
            db_session,
            league_id=league.id,
            player_id=player.id,
            caller_player_id=non_member.id,
        )

    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_access_gate_public_league_unauthenticated_raises_403(db_session):
    """An unauthenticated caller (None) gets 403 for a public league too."""
    from fastapi import HTTPException

    player = await _player(db_session, "Public Anon Target")
    league = await _league(db_session, "Public League Anon", is_public=True)

    with pytest.raises(HTTPException) as exc_info:
        await get_league_player_stats_full(
            db_session,
            league_id=league.id,
            player_id=player.id,
            caller_player_id=None,
        )

    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_access_gate_private_league_member_allowed(db_session):
    """An authenticated member can read stats from a private league."""
    player = await _player(db_session, "Private Player")
    member = await _player(db_session, "Member Caller")
    league = await _league(db_session, "Private League Gate", is_public=False)
    await _league_member(db_session, league, member)

    result = await get_league_player_stats_full(
        db_session,
        league_id=league.id,
        player_id=player.id,
        caller_player_id=member.id,
    )

    assert result is not None


@pytest.mark.asyncio
async def test_access_gate_private_league_non_member_raises_403(db_session):
    """A non-member caller gets PermissionError for a private league."""
    from fastapi import HTTPException

    player = await _player(db_session, "Target Private")
    non_member = await _player(db_session, "Non Member")
    league = await _league(db_session, "Private League NM", is_public=False)

    with pytest.raises(HTTPException) as exc_info:
        await get_league_player_stats_full(
            db_session,
            league_id=league.id,
            player_id=player.id,
            caller_player_id=non_member.id,
        )

    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_access_gate_private_league_unauthenticated_raises_403(db_session):
    """An unauthenticated caller (None) gets 403 for a private league."""
    from fastapi import HTTPException

    player = await _player(db_session, "Target Anon")
    league = await _league(db_session, "Private League Anon", is_public=False)

    with pytest.raises(HTTPException) as exc_info:
        await get_league_player_stats_full(
            db_session,
            league_id=league.id,
            player_id=player.id,
            caller_player_id=None,
        )

    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_access_gate_private_league_viewed_player_is_member(db_session):
    """
    The viewed player being a league member does NOT grant access to a non-member
    caller. Access is checked on the caller, not the target.
    """
    from fastapi import HTTPException

    viewed = await _player(db_session, "Viewed Member")
    non_member_caller = await _player(db_session, "Non Member Caller2")
    league = await _league(db_session, "Private League VM", is_public=False)
    # Only the viewed player is a member — caller is not
    await _league_member(db_session, league, viewed)

    with pytest.raises(HTTPException) as exc_info:
        await get_league_player_stats_full(
            db_session,
            league_id=league.id,
            player_id=viewed.id,
            caller_player_id=non_member_caller.id,
        )

    assert exc_info.value.status_code == 403
