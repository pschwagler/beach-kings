"""Tests for is_user_admin_of_session_league authorization helper.

Phase 4 regression suite — verifies that the direct Session.league_id join
correctly grants/denies admin access for all three session states:
  - Pickup:      league_id=NULL, season_id=NULL
  - League gap:  league_id=X,    season_id=NULL  (KEY regression target)
  - Season game: league_id=X,    season_id=Y

Key regression: a gap-game session (season_id=NULL, league_id set) must return
True for a league admin.  The old Season-join path returned False here because
Session.season_id IS NULL breaks the join to Season.
"""

import pytest
import pytest_asyncio
from datetime import date, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.models import League, LeagueMember, Player, Season, Session, User
from backend.api.routes.sessions import is_user_admin_of_session_league


# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def league(db_session: AsyncSession) -> League:
    """Primary league for all tests."""
    lg = League(name="Test League", is_open=True)
    db_session.add(lg)
    await db_session.commit()
    await db_session.refresh(lg)
    return lg


@pytest_asyncio.fixture
async def other_league(db_session: AsyncSession) -> League:
    """A second, independent league — used to verify cross-league deny."""
    lg = League(name="Other League", is_open=True)
    db_session.add(lg)
    await db_session.commit()
    await db_session.refresh(lg)
    return lg


@pytest_asyncio.fixture
async def season(db_session: AsyncSession, league: League) -> Season:
    """Active open-ended season attached to *league*."""
    s = Season(
        league_id=league.id,
        name="Test Season",
        start_date=date.today() - timedelta(days=10),
        end_date=None,
    )
    db_session.add(s)
    await db_session.commit()
    await db_session.refresh(s)
    return s


@pytest_asyncio.fixture
async def admin_user(db_session: AsyncSession) -> User:
    """A User record for the admin under test."""
    u = User(email="admin@test.example", auth_provider="phone", is_verified=True)
    db_session.add(u)
    await db_session.commit()
    await db_session.refresh(u)
    return u


@pytest_asyncio.fixture
async def admin_player(db_session: AsyncSession, admin_user: User) -> Player:
    """Player linked to admin_user."""
    p = Player(full_name="Admin Player", first_name="Admin", last_name="Player",
               user_id=admin_user.id)
    db_session.add(p)
    await db_session.commit()
    await db_session.refresh(p)
    return p


@pytest_asyncio.fixture
async def member_user(db_session: AsyncSession) -> User:
    """A User record for a non-admin member."""
    u = User(email="member@test.example", auth_provider="phone", is_verified=True)
    db_session.add(u)
    await db_session.commit()
    await db_session.refresh(u)
    return u


@pytest_asyncio.fixture
async def member_player(db_session: AsyncSession, member_user: User) -> Player:
    """Player linked to member_user."""
    p = Player(full_name="Member Player", first_name="Member", last_name="Player",
               user_id=member_user.id)
    db_session.add(p)
    await db_session.commit()
    await db_session.refresh(p)
    return p


@pytest_asyncio.fixture
async def outsider_user(db_session: AsyncSession) -> User:
    """A User who is not a member of the primary league at all."""
    u = User(email="outsider@test.example", auth_provider="phone", is_verified=True)
    db_session.add(u)
    await db_session.commit()
    await db_session.refresh(u)
    return u


@pytest_asyncio.fixture
async def outsider_player(db_session: AsyncSession, outsider_user: User) -> Player:
    """Player linked to outsider_user."""
    p = Player(full_name="Outsider Player", first_name="Outsider", last_name="Player",
               user_id=outsider_user.id)
    db_session.add(p)
    await db_session.commit()
    await db_session.refresh(p)
    return p


# ---------------------------------------------------------------------------
# Case 1: Season game, user is admin → True
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_season_session_admin_returns_true(
    db_session: AsyncSession,
    league: League,
    season: Season,
    admin_player: Player,
    admin_user: User,
):
    """Admin of the league can administer a full season game (league_id + season_id set)."""
    # Membership: admin role
    db_session.add(LeagueMember(league_id=league.id, player_id=admin_player.id, role="admin"))
    await db_session.commit()

    # Season game: both league_id and season_id set
    sess = Session(
        date="6/19/2026",
        name="Season Session",
        league_id=league.id,
        season_id=season.id,
    )
    db_session.add(sess)
    await db_session.commit()
    await db_session.refresh(sess)

    result = await is_user_admin_of_session_league(db_session, admin_user.id, sess.id)
    assert result is True


# ---------------------------------------------------------------------------
# Case 2: Gap game (season_id=NULL, league_id set), admin → True  [REGRESSION]
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_gap_session_admin_returns_true(
    db_session: AsyncSession,
    league: League,
    admin_player: Player,
    admin_user: User,
):
    """REGRESSION: admin of league can administer a gap-game session (season_id=NULL).

    Before the fix, the Season-join path produced zero rows for gap games
    because Session.season_id IS NULL. The direct Session.league_id join must
    return True here.
    """
    db_session.add(LeagueMember(league_id=league.id, player_id=admin_player.id, role="admin"))
    await db_session.commit()

    # Gap game: league_id set, season_id deliberately NULL
    sess = Session(
        date="6/19/2026",
        name="Gap Session",
        league_id=league.id,
        season_id=None,
    )
    db_session.add(sess)
    await db_session.commit()
    await db_session.refresh(sess)

    result = await is_user_admin_of_session_league(db_session, admin_user.id, sess.id)
    assert result is True, (
        "Gap-game admin check regressed: expected True but got False. "
        "Ensure is_user_admin_of_session_league joins via Session.league_id, not Season."
    )


# ---------------------------------------------------------------------------
# Case 3: User is a 'member' (not admin) → False
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_member_role_returns_false(
    db_session: AsyncSession,
    league: League,
    season: Season,
    member_player: Player,
    member_user: User,
):
    """A plain member of the league cannot administer the session."""
    db_session.add(LeagueMember(league_id=league.id, player_id=member_player.id, role="member"))
    await db_session.commit()

    sess = Session(
        date="6/19/2026",
        name="Member Test Session",
        league_id=league.id,
        season_id=season.id,
    )
    db_session.add(sess)
    await db_session.commit()
    await db_session.refresh(sess)

    result = await is_user_admin_of_session_league(db_session, member_user.id, sess.id)
    assert result is False


# ---------------------------------------------------------------------------
# Case 4: User is NOT a member at all → False
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_non_member_returns_false(
    db_session: AsyncSession,
    league: League,
    season: Season,
    outsider_player: Player,
    outsider_user: User,
):
    """A user with no membership row in the league is denied."""
    # No LeagueMember row for outsider
    sess = Session(
        date="6/19/2026",
        name="Non-member Test Session",
        league_id=league.id,
        season_id=season.id,
    )
    db_session.add(sess)
    await db_session.commit()
    await db_session.refresh(sess)

    result = await is_user_admin_of_session_league(db_session, outsider_user.id, sess.id)
    assert result is False


# ---------------------------------------------------------------------------
# Case 5: Pickup session (league_id=NULL) → False even for a league admin
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_pickup_session_returns_false(
    db_session: AsyncSession,
    league: League,
    admin_player: Player,
    admin_user: User,
):
    """Pickup sessions have no league; admin of some league is still denied."""
    db_session.add(LeagueMember(league_id=league.id, player_id=admin_player.id, role="admin"))
    await db_session.commit()

    # Pickup: both league_id and season_id NULL
    sess = Session(
        date="6/19/2026",
        name="Pickup Session",
        league_id=None,
        season_id=None,
    )
    db_session.add(sess)
    await db_session.commit()
    await db_session.refresh(sess)

    result = await is_user_admin_of_session_league(db_session, admin_user.id, sess.id)
    assert result is False


# ---------------------------------------------------------------------------
# Case 6: Admin of a DIFFERENT league than the session's → False
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_admin_of_wrong_league_returns_false(
    db_session: AsyncSession,
    league: League,
    other_league: League,
    admin_player: Player,
    admin_user: User,
):
    """User is admin of other_league but the session belongs to league → denied."""
    # Admin of the OTHER league, not of the session's league
    db_session.add(LeagueMember(league_id=other_league.id, player_id=admin_player.id, role="admin"))
    await db_session.commit()

    # Session is in the primary league
    sess = Session(
        date="6/19/2026",
        name="Wrong League Session",
        league_id=league.id,
        season_id=None,
    )
    db_session.add(sess)
    await db_session.commit()
    await db_session.refresh(sess)

    result = await is_user_admin_of_session_league(db_session, admin_user.id, sess.id)
    assert result is False


# ---------------------------------------------------------------------------
# Case 7: Nonexistent session_id → False (no raise)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_nonexistent_session_returns_false(
    db_session: AsyncSession,
    admin_user: User,
):
    """A session_id that does not exist must return False without raising."""
    result = await is_user_admin_of_session_league(db_session, admin_user.id, session_id=999999)
    assert result is False


# ---------------------------------------------------------------------------
# Case 8: Orphaned session (league_id NULL, season_id set) → False
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_orphaned_session_league_null_returns_false(
    db_session: AsyncSession,
    league: League,
    admin_player: Player,
    admin_user: User,
):
    """A malformed/orphaned session with league_id=NULL but season_id set (e.g.
    the league was deleted and the ondelete=SET NULL FK fired) must return False.

    This is the safe direction: with no league_id the direct join matches nothing,
    so no one is granted admin over an orphaned session.
    """
    db_session.add(LeagueMember(league_id=league.id, player_id=admin_player.id, role="admin"))
    season = Season(
        league_id=league.id,
        name="Orphan Season",
        start_date=date.today() - timedelta(days=5),
        end_date=None,
    )
    db_session.add(season)
    await db_session.commit()
    await db_session.refresh(season)

    # league_id deliberately NULL while season_id is set — the orphaned state.
    sess = Session(
        date="6/19/2026",
        name="Orphaned Session",
        league_id=None,
        season_id=season.id,
    )
    db_session.add(sess)
    await db_session.commit()
    await db_session.refresh(sess)

    result = await is_user_admin_of_session_league(db_session, admin_user.id, sess.id)
    assert result is False
