"""
Tests for session cleanup service (auto-submit / auto-delete stale sessions).

Verifies that ACTIVE sessions inactive for 12+ hours are:
- Auto-submitted if they have matches
- Auto-deleted if empty
- Creator is notified in both cases
"""

import pytest
import pytest_asyncio
import uuid
from datetime import date, timedelta
from sqlalchemy import select, update, func

from backend.database.models import (
    Session,
    SessionStatus,
    Match,
    League,
    Season,
    Player,
    Notification,
    NotificationType,
)
from backend.services.session_cleanup_service import SessionCleanupService
from backend.services import user_service
from backend.utils.datetime_utils import utcnow


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _unique_phone():
    """Generate a unique phone number to avoid collisions between tests."""
    return f"+1555{uuid.uuid4().hex[:7]}"


@pytest_asyncio.fixture
async def test_user(db_session):
    """Create a test user with a unique phone number."""
    user_id = await user_service.create_user(
        session=db_session, phone_number=_unique_phone(), password_hash="hashed"
    )
    return user_id


@pytest_asyncio.fixture
async def test_players(db_session, test_user):
    """Create 4 test players (needed for valid matches: 2 per team)."""
    players = []
    # First player linked to test_user (the session creator)
    p1 = Player(full_name="Creator Player", user_id=test_user, gender="M", level="intermediate")
    db_session.add(p1)
    await db_session.flush()
    players.append(p1)

    # 3 more players (no user_id needed)
    for i in range(2, 5):
        p = Player(full_name=f"Player {i}", gender="M", level="intermediate")
        db_session.add(p)
        await db_session.flush()
        players.append(p)

    return players


@pytest_asyncio.fixture
async def league_and_season(db_session):
    """Create a league + active season."""
    league = League(name="Cleanup Test League", is_open=True)
    db_session.add(league)
    await db_session.flush()

    season = Season(
        league_id=league.id,
        name="Cleanup Test Season",
        start_date=date(2024, 1, 1),
        end_date=date(2025, 12, 31),
    )
    db_session.add(season)
    await db_session.flush()
    return league, season


@pytest_asyncio.fixture
def cleanup_service():
    """Create a fresh cleanup service instance (not started).

    Also registers mock stats queue callbacks so lock_in_session
    (which enqueues stats recalculation) doesn't raise.
    """
    from backend.services.stats_queue import get_stats_queue

    queue = get_stats_queue()

    async def _noop_global(session):
        return {}

    async def _noop_league(session, league_id):
        return {}

    queue.register_calculation_callbacks(
        global_calc_callback=_noop_global,
        league_calc_callback=_noop_league,
    )
    return SessionCleanupService()


def _stale_time():
    """Return a timestamp older than the 12h threshold."""
    return utcnow() - timedelta(hours=13)


def _fresh_time():
    """Return a recent timestamp within the 12h threshold."""
    return utcnow() - timedelta(hours=1)


def _make_match(session_id: int, players: list, match_date: str = "2024-06-01") -> Match:
    """Create a valid Match ORM object with all required fields."""
    return Match(
        session_id=session_id,
        date=match_date,
        team1_player1_id=players[0].id,
        team1_player2_id=players[1].id,
        team2_player1_id=players[2].id,
        team2_player2_id=players[3].id,
        team1_score=21,
        team2_score=19,
        winner=1,
    )


# ---------------------------------------------------------------------------
# Auto-submit: stale session WITH matches → SUBMITTED
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_stale_session_with_matches_auto_submitted(
    db_session, test_players, league_and_season, cleanup_service
):
    """ACTIVE + old updated_at + matches → status becomes SUBMITTED."""
    league, season = league_and_season

    sess = Session(
        date="2024-06-01",
        name="Stale w/ matches",
        status=SessionStatus.ACTIVE,
        season_id=season.id,
        created_by=test_players[0].id,
    )
    db_session.add(sess)
    await db_session.flush()

    db_session.add(_make_match(sess.id, test_players))
    await db_session.flush()

    await db_session.execute(
        update(Session).where(Session.id == sess.id).values(updated_at=_stale_time())
    )
    await db_session.commit()

    session_id = sess.id

    await cleanup_service._process_stale_sessions()

    # Expire cached ORM objects + rollback so the next query sees committed changes
    db_session.expire_all()
    await db_session.rollback()

    result = await db_session.execute(select(Session).where(Session.id == session_id))
    updated_sess = result.scalar_one_or_none()
    assert updated_sess is not None
    assert updated_sess.status == SessionStatus.SUBMITTED


# ---------------------------------------------------------------------------
# Auto-delete: stale session WITHOUT matches → row deleted
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_stale_empty_session_deleted(
    db_session, test_players, league_and_season, cleanup_service
):
    """ACTIVE + old updated_at + 0 matches → session row deleted."""
    league, season = league_and_season

    sess = Session(
        date="2024-06-01",
        name="Stale empty",
        status=SessionStatus.ACTIVE,
        season_id=season.id,
        created_by=test_players[0].id,
    )
    db_session.add(sess)
    await db_session.flush()

    await db_session.execute(
        update(Session).where(Session.id == sess.id).values(updated_at=_stale_time())
    )
    await db_session.commit()

    session_id = sess.id

    await cleanup_service._process_stale_sessions()

    await db_session.rollback()

    result = await db_session.execute(select(Session).where(Session.id == session_id))
    assert result.scalar_one_or_none() is None


# ---------------------------------------------------------------------------
# Fresh session: should NOT be touched
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_fresh_session_not_touched(
    db_session, test_players, league_and_season, cleanup_service
):
    """ACTIVE + recent updated_at → stays ACTIVE, untouched."""
    league, season = league_and_season

    sess = Session(
        date="2024-06-01",
        name="Fresh session",
        status=SessionStatus.ACTIVE,
        season_id=season.id,
        created_by=test_players[0].id,
    )
    db_session.add(sess)
    await db_session.flush()

    await db_session.execute(
        update(Session).where(Session.id == sess.id).values(updated_at=_fresh_time())
    )
    await db_session.commit()

    session_id = sess.id

    await cleanup_service._process_stale_sessions()

    await db_session.rollback()

    result = await db_session.execute(select(Session).where(Session.id == session_id))
    still_active = result.scalar_one()
    assert still_active.status == SessionStatus.ACTIVE


# ---------------------------------------------------------------------------
# Already-submitted session: should be ignored
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_submitted_session_ignored(
    db_session, test_players, league_and_season, cleanup_service
):
    """SUBMITTED + old updated_at → no change."""
    league, season = league_and_season

    sess = Session(
        date="2024-06-01",
        name="Already submitted",
        status=SessionStatus.SUBMITTED,
        season_id=season.id,
        created_by=test_players[0].id,
    )
    db_session.add(sess)
    await db_session.flush()

    await db_session.execute(
        update(Session).where(Session.id == sess.id).values(updated_at=_stale_time())
    )
    await db_session.commit()

    session_id = sess.id

    await cleanup_service._process_stale_sessions()

    await db_session.rollback()

    result = await db_session.execute(select(Session).where(Session.id == session_id))
    unchanged = result.scalar_one()
    assert unchanged.status == SessionStatus.SUBMITTED


# ---------------------------------------------------------------------------
# Notification: creator notified on auto-submit
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_creator_notified_on_auto_submit(
    db_session, test_user, test_players, league_and_season, cleanup_service
):
    """Notification created with SESSION_AUTO_SUBMITTED type on auto-submit."""
    league, season = league_and_season

    sess = Session(
        date="2024-06-01",
        name="Notify test",
        status=SessionStatus.ACTIVE,
        season_id=season.id,
        created_by=test_players[0].id,
    )
    db_session.add(sess)
    await db_session.flush()

    db_session.add(_make_match(sess.id, test_players))
    await db_session.flush()

    await db_session.execute(
        update(Session).where(Session.id == sess.id).values(updated_at=_stale_time())
    )
    await db_session.commit()

    await cleanup_service._process_stale_sessions()

    await db_session.rollback()

    result = await db_session.execute(
        select(Notification).where(
            Notification.user_id == test_user,
            Notification.type == NotificationType.SESSION_AUTO_SUBMITTED.value,
        )
    )
    notif = result.scalar_one_or_none()
    assert notif is not None
    assert "auto-submitted" in notif.title.lower()
    assert "Notify test" in notif.message
    assert f"/league/{league.id}" in notif.link_url


# ---------------------------------------------------------------------------
# Notification: creator notified on auto-delete
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_creator_notified_on_auto_delete(
    db_session, test_user, test_players, league_and_season, cleanup_service
):
    """Notification created with SESSION_AUTO_DELETED type on auto-delete."""
    league, season = league_and_season

    sess = Session(
        date="2024-06-01",
        name="Delete notify test",
        status=SessionStatus.ACTIVE,
        season_id=season.id,
        created_by=test_players[0].id,
    )
    db_session.add(sess)
    await db_session.flush()

    await db_session.execute(
        update(Session).where(Session.id == sess.id).values(updated_at=_stale_time())
    )
    await db_session.commit()

    await cleanup_service._process_stale_sessions()

    await db_session.rollback()

    result = await db_session.execute(
        select(Notification).where(
            Notification.user_id == test_user,
            Notification.type == NotificationType.SESSION_AUTO_DELETED.value,
        )
    )
    notif = result.scalar_one_or_none()
    assert notif is not None
    assert "auto-deleted" in notif.title.lower()
    assert "Delete notify test" in notif.message
    assert notif.link_url == "/home"


# ---------------------------------------------------------------------------
# No creator: should not error
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_no_creator_skips_notification(
    db_session, league_and_season, cleanup_service
):
    """Session with created_by=None → no error, no notification."""
    league, season = league_and_season

    sess = Session(
        date="2024-06-01",
        name="No creator",
        status=SessionStatus.ACTIVE,
        season_id=season.id,
        created_by=None,
    )
    db_session.add(sess)
    await db_session.flush()

    await db_session.execute(
        update(Session).where(Session.id == sess.id).values(updated_at=_stale_time())
    )
    await db_session.commit()

    session_id = sess.id

    # Should not raise
    await cleanup_service._process_stale_sessions()

    await db_session.rollback()

    # Session should be deleted (no matches)
    result = await db_session.execute(select(Session).where(Session.id == session_id))
    assert result.scalar_one_or_none() is None

    # No notifications created
    result = await db_session.execute(select(func.count()).select_from(Notification))
    assert result.scalar() == 0


# ---------------------------------------------------------------------------
# Non-league (standalone) session: submit links to /home
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_standalone_session_submit_links_to_home(
    db_session, test_user, test_players, cleanup_service
):
    """Non-league session auto-submit notification links to /home."""
    sess = Session(
        date="2024-06-01",
        name="Standalone session",
        status=SessionStatus.ACTIVE,
        season_id=None,
        code="ABCD1234",
        created_by=test_players[0].id,
    )
    db_session.add(sess)
    await db_session.flush()

    db_session.add(_make_match(sess.id, test_players))
    await db_session.flush()

    await db_session.execute(
        update(Session).where(Session.id == sess.id).values(updated_at=_stale_time())
    )
    await db_session.commit()

    await cleanup_service._process_stale_sessions()

    await db_session.rollback()

    result = await db_session.execute(
        select(Notification).where(
            Notification.user_id == test_user,
            Notification.type == NotificationType.SESSION_AUTO_SUBMITTED.value,
        )
    )
    notif = result.scalar_one_or_none()
    assert notif is not None
    assert notif.link_url == "/home"


# ---------------------------------------------------------------------------
# Match create bumps session.updated_at
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_match_create_bumps_session_updated_at(
    db_session, test_players, league_and_season
):
    """Creating a match bumps session.updated_at."""
    from backend.services.data_service import create_match_async
    from backend.models.schemas import CreateMatchRequest

    league, season = league_and_season

    sess = Session(
        date="2024-06-01",
        name="Bump test create",
        status=SessionStatus.ACTIVE,
        season_id=season.id,
        created_by=test_players[0].id,
    )
    db_session.add(sess)
    await db_session.flush()

    # Backdate updated_at
    old_time = _stale_time()
    await db_session.execute(
        update(Session).where(Session.id == sess.id).values(updated_at=old_time)
    )
    await db_session.commit()

    session_id = sess.id

    match_req = CreateMatchRequest(
        team1_player1_id=test_players[0].id,
        team1_player2_id=test_players[1].id,
        team2_player1_id=test_players[2].id,
        team2_player2_id=test_players[3].id,
        team1_score=21,
        team2_score=19,
    )
    await create_match_async(
        session=db_session,
        match_request=match_req,
        session_id=session_id,
        date="2024-06-01",
    )

    # Rollback and requery to see committed changes
    await db_session.rollback()

    result = await db_session.execute(select(Session).where(Session.id == session_id))
    updated_sess = result.scalar_one()
    assert updated_sess.updated_at > old_time


# ---------------------------------------------------------------------------
# Match delete bumps session.updated_at
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_match_delete_bumps_session_updated_at(
    db_session, test_players, league_and_season
):
    """Deleting a match bumps session.updated_at."""
    from backend.services.data_service import delete_match_async

    league, season = league_and_season

    sess = Session(
        date="2024-06-01",
        name="Bump test delete",
        status=SessionStatus.ACTIVE,
        season_id=season.id,
        created_by=test_players[0].id,
    )
    db_session.add(sess)
    await db_session.flush()

    match = _make_match(sess.id, test_players)
    db_session.add(match)
    await db_session.flush()

    # Backdate updated_at
    old_time = _stale_time()
    await db_session.execute(
        update(Session).where(Session.id == sess.id).values(updated_at=old_time)
    )
    await db_session.commit()

    session_id = sess.id
    match_id = match.id

    deleted = await delete_match_async(session=db_session, match_id=match_id)
    assert deleted is True

    # Rollback and requery to see committed changes
    await db_session.rollback()

    result = await db_session.execute(select(Session).where(Session.id == session_id))
    updated_sess = result.scalar_one()
    assert updated_sess.updated_at > old_time
