"""
Tests for match history player IDs (Issue #139).

Verifies that get_player_match_history_by_id returns Partner ID,
Opponent 1 ID, and Opponent 2 ID fields alongside the name fields.
"""

import pytest
import pytest_asyncio
import uuid
from datetime import date


from backend.database.models import (
    Player,
    League,
    Season,
    Session,
    Match,
)
from backend.services import data_service, user_service


def _unique_phone():
    return f"+1555{uuid.uuid4().hex[:7]}"


async def _create_player(db_session, name, user_id=None):
    """Create a player directly, return Player ORM object."""
    player = Player(full_name=name, user_id=user_id, gender="M", level="intermediate")
    db_session.add(player)
    await db_session.flush()
    await db_session.refresh(player)
    return player


@pytest_asyncio.fixture
async def match_scenario(db_session):
    """
    Create 4 players and a submitted match between them.

    Team 1: (p1, p2) vs Team 2: (p3, p4), score 21-19, team 1 wins.
    Returns dict with player objects, match id, etc.
    """
    # Create users for players that will query their history
    u1_id = await user_service.create_user(
        session=db_session, phone_number=_unique_phone(), password_hash="hash"
    )
    u3_id = await user_service.create_user(
        session=db_session, phone_number=_unique_phone(), password_hash="hash"
    )

    p1 = await _create_player(db_session, "Alice Alpha", user_id=u1_id)
    p2 = await _create_player(db_session, "Bob Beta")
    p3 = await _create_player(db_session, "Carol Gamma", user_id=u3_id)
    p4 = await _create_player(db_session, "Dave Delta")

    league = League(name="Test League", is_open=True)
    db_session.add(league)
    await db_session.flush()

    season = Season(
        league_id=league.id,
        name="Test Season",
        start_date=date(2024, 1, 1),
        end_date=date(2025, 12, 31),
    )
    db_session.add(season)
    await db_session.flush()

    sess = Session(
        date="2024-06-01",
        name="Test Session",
        status="SUBMITTED",
        season_id=season.id,
    )
    db_session.add(sess)
    await db_session.flush()

    match = Match(
        session_id=sess.id,
        date="2024-06-01",
        team1_player1_id=p1.id,
        team1_player2_id=p2.id,
        team2_player1_id=p3.id,
        team2_player2_id=p4.id,
        team1_score=21,
        team2_score=19,
        winner=1,
    )
    db_session.add(match)
    await db_session.commit()

    return {
        "p1": p1,
        "p2": p2,
        "p3": p3,
        "p4": p4,
        "match_id": match.id,
    }


@pytest.mark.asyncio
async def test_team1_player1_sees_correct_ids(db_session, match_scenario):
    """
    Player on team 1 (p1): partner is p2, opponents are p3 and p4.
    All IDs should be present in the response.
    """
    p1 = match_scenario["p1"]
    p2 = match_scenario["p2"]
    p3 = match_scenario["p3"]
    p4 = match_scenario["p4"]

    history = await data_service.get_player_match_history_by_id(db_session, p1.id)
    assert history is not None
    assert len(history) == 1

    m = history[0]
    assert m["partner"] == "Bob Beta"
    assert m["partner_id"] == p2.id
    assert m["opponent_1"] == "Carol Gamma"
    assert m["opponent_1_id"] == p3.id
    assert m["opponent_2"] == "Dave Delta"
    assert m["opponent_2_id"] == p4.id
    assert m["result"] == "W"
    assert m["score"] == "21-19"
    # All non-placeholder players
    assert m["partner_is_placeholder"] is False
    assert m["opponent_1_is_placeholder"] is False
    assert m["opponent_2_is_placeholder"] is False


@pytest.mark.asyncio
async def test_team2_player1_sees_correct_ids(db_session, match_scenario):
    """
    Player on team 2 (p3): partner is p4, opponents are p1 and p2.
    Score is inverted (19-21).
    """
    p1 = match_scenario["p1"]
    p2 = match_scenario["p2"]
    p3 = match_scenario["p3"]
    p4 = match_scenario["p4"]

    history = await data_service.get_player_match_history_by_id(db_session, p3.id)
    assert history is not None
    assert len(history) == 1

    m = history[0]
    assert m["partner"] == "Dave Delta"
    assert m["partner_id"] == p4.id
    assert m["opponent_1"] == "Alice Alpha"
    assert m["opponent_1_id"] == p1.id
    assert m["opponent_2"] == "Bob Beta"
    assert m["opponent_2_id"] == p2.id
    assert m["result"] == "L"
    assert m["score"] == "19-21"


@pytest.mark.asyncio
async def test_team1_player2_sees_correct_partner(db_session, match_scenario):
    """
    Player on team 1 but in slot 2 (p2): partner should be p1.
    """
    p1 = match_scenario["p1"]
    p2 = match_scenario["p2"]
    p3 = match_scenario["p3"]
    p4 = match_scenario["p4"]

    history = await data_service.get_player_match_history_by_id(db_session, p2.id)
    assert len(history) == 1

    m = history[0]
    assert m["partner"] == "Alice Alpha"
    assert m["partner_id"] == p1.id
    assert m["opponent_1_id"] == p3.id
    assert m["opponent_2_id"] == p4.id


@pytest.mark.asyncio
async def test_team2_player2_sees_correct_partner(db_session, match_scenario):
    """
    Player on team 2 but in slot 2 (p4): partner should be p3.
    """
    p3 = match_scenario["p3"]
    p4 = match_scenario["p4"]

    history = await data_service.get_player_match_history_by_id(db_session, p4.id)
    assert len(history) == 1

    m = history[0]
    assert m["partner"] == "Carol Gamma"
    assert m["partner_id"] == p3.id


@pytest.mark.asyncio
async def test_same_named_players_have_distinct_ids(db_session):
    """
    Two players named "John Smith" should return different IDs
    so the frontend can group stats correctly.
    """
    u1 = await user_service.create_user(
        session=db_session, phone_number=_unique_phone(), password_hash="hash"
    )
    p1 = await _create_player(db_session, "John Smith", user_id=u1)
    p2 = await _create_player(db_session, "John Smith")  # same name, different player
    p3 = await _create_player(db_session, "Jane Doe")
    p4 = await _create_player(db_session, "Bob Builder")

    league = League(name="Dup Name League", is_open=True)
    db_session.add(league)
    await db_session.flush()
    season = Season(
        league_id=league.id,
        name="S1",
        start_date=date(2024, 1, 1),
        end_date=date(2025, 12, 31),
    )
    db_session.add(season)
    await db_session.flush()
    sess = Session(
        date="2024-06-01",
        name="Dup Name Session",
        status="SUBMITTED",
        season_id=season.id,
    )
    db_session.add(sess)
    await db_session.flush()

    # Game 1: p1 partners with p2 (both "John Smith")
    m1 = Match(
        session_id=sess.id,
        date="2024-06-01",
        team1_player1_id=p1.id,
        team1_player2_id=p2.id,
        team2_player1_id=p3.id,
        team2_player2_id=p4.id,
        team1_score=21,
        team2_score=15,
        winner=1,
    )
    db_session.add(m1)

    # Game 2: p1 partners with p3, opponents include p2 (another "John Smith")
    m2 = Match(
        session_id=sess.id,
        date="2024-06-01",
        team1_player1_id=p1.id,
        team1_player2_id=p3.id,
        team2_player1_id=p2.id,
        team2_player2_id=p4.id,
        team1_score=21,
        team2_score=18,
        winner=1,
    )
    db_session.add(m2)
    await db_session.commit()

    history = await data_service.get_player_match_history_by_id(db_session, p1.id)
    assert len(history) == 2

    # Collect partner IDs across matches
    partner_ids = {m["partner_id"] for m in history}
    partner_names = {m["partner"] for m in history}

    # Both partners are named "John Smith" and "Jane Doe"
    assert p2.id in partner_ids
    assert p3.id in partner_ids
    # Despite p2 having the same name as p1, the IDs are distinct
    assert p2.id != p1.id

    # In match 2, p2 appears as opponent — check opponent IDs
    match2 = [m for m in history if m["partner_id"] == p3.id][0]
    assert match2["opponent_1_id"] == p2.id
    assert match2["opponent_1"] == "John Smith"


@pytest.mark.asyncio
async def test_placeholder_flags_in_match_history(db_session):
    """
    When a partner or opponent is a placeholder, IsPlaceholder should be True.
    """
    u1 = await user_service.create_user(
        session=db_session, phone_number=_unique_phone(), password_hash="hash"
    )
    p1 = await _create_player(db_session, "Real Player", user_id=u1)
    p2 = Player(
        full_name="Placeholder Partner", gender="M", level="intermediate", is_placeholder=True
    )
    p3 = await _create_player(db_session, "Real Opp 1")
    p4 = Player(full_name="Placeholder Opp", gender="F", level="beginner", is_placeholder=True)
    db_session.add_all([p2, p4])
    await db_session.flush()
    await db_session.refresh(p2)
    await db_session.refresh(p4)

    league = League(name="PH Flag League", is_open=True)
    db_session.add(league)
    await db_session.flush()
    season = Season(
        league_id=league.id, name="S", start_date=date(2024, 1, 1), end_date=date(2025, 12, 31)
    )
    db_session.add(season)
    await db_session.flush()
    sess = Session(date="2024-06-01", name="PH Session", status="SUBMITTED", season_id=season.id)
    db_session.add(sess)
    await db_session.flush()
    match = Match(
        session_id=sess.id,
        date="2024-06-01",
        team1_player1_id=p1.id,
        team1_player2_id=p2.id,
        team2_player1_id=p3.id,
        team2_player2_id=p4.id,
        team1_score=21,
        team2_score=15,
        winner=1,
    )
    db_session.add(match)
    await db_session.commit()

    history = await data_service.get_player_match_history_by_id(db_session, p1.id)
    assert len(history) == 1
    m = history[0]
    assert m["partner_is_placeholder"] is True
    assert m["opponent_1_is_placeholder"] is False
    assert m["opponent_2_is_placeholder"] is True


@pytest.mark.asyncio
async def test_nonexistent_player_returns_none(db_session):
    """Requesting match history for a nonexistent player returns None."""
    result = await data_service.get_player_match_history_by_id(db_session, 99999)
    assert result is None


@pytest.mark.asyncio
async def test_player_with_no_matches_returns_empty_list(db_session):
    """Player with no matches returns an empty list (not None)."""
    p = await _create_player(db_session, "No Matches Player")
    await db_session.commit()

    result = await data_service.get_player_match_history_by_id(db_session, p.id)
    assert result is not None
    assert result == []
