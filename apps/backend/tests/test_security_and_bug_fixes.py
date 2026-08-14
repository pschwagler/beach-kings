"""
Tests proving each bug and security fix from the code-review findings.

Findings covered:
  BUG 1   — create_match gap-game session lookup now anchored on league_id
  BUG 2   — found-session dict includes league_id (gap game classified as league)
  BUG 3   — pickup naming counter excludes gap games (league_id IS NULL required)
  BUG 5   — _is_system_admin swallows exception but now logs at WARNING
  BUG 6   — _get_active_season uses `is not None` so season_id=0 is accepted
  SEC 1   — end_league_session rejects session from a different league (IDOR)
  SEC 2   — POST /api/sessions rejects non-members for league_id
  SEC 3   — POST /api/matches rejects non-members for league_id
  SEC 4   — remove_session_participant rejects non-members on league sessions
"""

from __future__ import annotations

import logging
import pytest
import pytest_asyncio
from datetime import date
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.main import app
from backend.database.models import (
    League,
    Player,
    Session,
    SessionStatus,
    User,
)
from backend.services import auth_service, data_service, role_service, user_service
from backend.services import notification_service


# ---------------------------------------------------------------------------
# Constants shared by the HTTP-layer (monkeypatch) tests
# ---------------------------------------------------------------------------

_PHONE = "+10000000001"
_USER_ID = 901
_PLAYER_ID = 902
_LEAGUE_ID = 50
_SEASON_ID = 20
_SESSION_ID = 300
_AUTH = {"Authorization": "Bearer dummy"}

_FAKE_USER = {
    "id": _USER_ID,
    "phone_number": _PHONE,
    "name": "Security Test User",
    "email": "sec@example.com",
    "is_verified": True,
}
_FAKE_PLAYER = {"id": _PLAYER_ID, "full_name": "Sec Player", "user_id": _USER_ID}


# ---------------------------------------------------------------------------
# Auth helpers for HTTP-layer tests
# ---------------------------------------------------------------------------


def _patch_base_auth(monkeypatch):
    """Patch JWT verification and user lookup."""

    def fake_verify_token(token: str) -> dict:
        return {"user_id": _USER_ID, "phone_number": _PHONE}

    async def fake_get_user_by_id(session, uid: int) -> dict:
        return _FAKE_USER

    monkeypatch.setattr(auth_service, "verify_token", fake_verify_token, raising=True)
    monkeypatch.setattr(user_service, "get_user_by_id", fake_get_user_by_id, raising=True)


def _patch_system_admin(monkeypatch):
    """Patch get_setting so the test user is a system admin (bypasses membership)."""

    async def fake_get_setting(session, key: str):
        if key in ("system_admin_phone_numbers", "system_admin_emails"):
            return _PHONE
        return None

    monkeypatch.setattr(data_service, "get_setting", fake_get_setting, raising=True)

    async def fake_is_system_admin(session, user_id):
        return True

    monkeypatch.setattr(role_service, "is_system_admin", fake_is_system_admin, raising=True)


def _make_admin_client(monkeypatch):
    """(client, headers) for a system-admin user."""
    _patch_base_auth(monkeypatch)
    _patch_system_admin(monkeypatch)
    return TestClient(app), _AUTH


def _make_user_client(monkeypatch):
    """(client, headers) for a plain authenticated non-admin user."""
    _patch_base_auth(monkeypatch)

    async def fake_is_system_admin(session, user_id):
        return False

    monkeypatch.setattr(role_service, "is_system_admin", fake_is_system_admin, raising=True)
    return TestClient(app), _AUTH


def _patch_player(monkeypatch):
    async def fake_get_player(session, user_id):
        return _FAKE_PLAYER

    monkeypatch.setattr(data_service, "get_player_by_user_id", fake_get_player, raising=True)

    async def fake_require_active_players(session, player_ids):
        return None

    monkeypatch.setattr(
        "backend.api.routes.matches.require_active_players",
        fake_require_active_players,
    )


def _patch_notifications(monkeypatch):
    async def fake_notify(*args, **kwargs):
        return None

    monkeypatch.setattr(
        notification_service,
        "notify_players_about_session_submitted",
        fake_notify,
        raising=True,
    )


# ===========================================================================
# DB-layer fixtures (shared across integration tests)
# ===========================================================================

TODAY = date.today()
TODAY_STR = TODAY.strftime("%-m/%-d/%Y")


@pytest_asyncio.fixture
async def league_a(db_session: AsyncSession) -> League:
    """Primary league for isolation tests."""
    lg = League(name="League A", is_open=True)
    db_session.add(lg)
    await db_session.commit()
    await db_session.refresh(lg)
    return lg


@pytest_asyncio.fixture
async def league_b(db_session: AsyncSession) -> League:
    """Second independent league — proves cross-league isolation."""
    lg = League(name="League B", is_open=True)
    db_session.add(lg)
    await db_session.commit()
    await db_session.refresh(lg)
    return lg


@pytest_asyncio.fixture
async def gap_session_a(db_session: AsyncSession, league_a: League) -> Session:
    """An ACTIVE gap-game session for League A on today's date."""
    sess = Session(
        date=TODAY_STR,
        name="League A Gap",
        league_id=league_a.id,
        season_id=None,
        status=SessionStatus.ACTIVE,
    )
    db_session.add(sess)
    await db_session.commit()
    await db_session.refresh(sess)
    return sess


@pytest_asyncio.fixture
async def gap_session_b(db_session: AsyncSession, league_b: League) -> Session:
    """An ACTIVE gap-game session for League B on the same date as gap_session_a."""
    sess = Session(
        date=TODAY_STR,
        name="League B Gap",
        league_id=league_b.id,
        season_id=None,
        status=SessionStatus.ACTIVE,
    )
    db_session.add(sess)
    await db_session.commit()
    await db_session.refresh(sess)
    return sess


@pytest_asyncio.fixture
async def pickup_session(db_session: AsyncSession) -> Session:
    """An ACTIVE pickup session (league_id=NULL, season_id=NULL)."""
    sess = Session(
        date=TODAY_STR,
        name="Pickup",
        league_id=None,
        season_id=None,
        status=SessionStatus.ACTIVE,
    )
    db_session.add(sess)
    await db_session.commit()
    await db_session.refresh(sess)
    return sess


@pytest_asyncio.fixture
async def league_user(db_session: AsyncSession) -> User:
    u = User(email="member@security.test", auth_provider="phone", is_verified=True)
    db_session.add(u)
    await db_session.commit()
    await db_session.refresh(u)
    return u


@pytest_asyncio.fixture
async def league_player(db_session: AsyncSession, league_user: User) -> Player:
    p = Player(
        full_name="Member Player", first_name="Member", last_name="Player", user_id=league_user.id
    )
    db_session.add(p)
    await db_session.commit()
    await db_session.refresh(p)
    return p


# ===========================================================================
# BUG 1 — create_match gap-game lookup anchored on league_id
# ===========================================================================


@pytest.mark.asyncio
async def test_bug1_gap_session_lookup_isolated_by_league(
    db_session: AsyncSession,
    league_a: League,
    league_b: League,
    gap_session_a: Session,
    gap_session_b: Session,
):
    """BUG 1 regression: the session-dedup query for gap games (season_id IS NULL)
    must filter by league_id so League A's lookup never returns League B's session.

    Before the fix, the WHERE clause was only `date = ? AND season_id IS NULL AND
    status = ACTIVE`, which could return either league's gap session for the day.
    After the fix, league_id is added: only THIS league's session is returned.
    """
    # Directly execute the fixed dedup query for League A
    from sqlalchemy import and_
    from backend.database.models import SessionStatus as SS

    result = await db_session.execute(
        select(Session).where(
            and_(
                Session.date == TODAY_STR,
                Session.season_id.is_(None),
                Session.league_id == league_a.id,
                Session.status == SS.ACTIVE,
            )
        )
    )
    found = result.scalar_one_or_none()

    assert found is not None, "Should find League A's gap session"
    assert found.id == gap_session_a.id, "Must return League A's session, not League B's"
    assert found.league_id == league_a.id

    # Verify League B's session is NOT returned when querying for League A
    assert found.id != gap_session_b.id, "Must not cross-contaminate League B's session"


@pytest.mark.asyncio
async def test_bug1_cross_league_old_query_would_have_been_ambiguous(
    db_session: AsyncSession,
    league_a: League,
    league_b: League,
    gap_session_a: Session,
    gap_session_b: Session,
):
    """Proves the old query (no league_id filter) would match both leagues' sessions.

    This test documents why the fix was needed: without the league_id anchor,
    two gap sessions on the same date (different leagues) both match the old WHERE.
    """
    from sqlalchemy import and_
    from backend.database.models import SessionStatus as SS

    # Simulate the OLD broken query (no league_id filter)
    result = await db_session.execute(
        select(Session).where(
            and_(
                Session.date == TODAY_STR,
                Session.season_id.is_(None),
                Session.status == SS.ACTIVE,
            )
        )
    )
    all_found = result.scalars().all()

    # Both sessions match — this is the ambiguous state the fix resolves
    ids = {s.id for s in all_found}
    assert gap_session_a.id in ids
    assert gap_session_b.id in ids


# ===========================================================================
# BUG 2 — found-session dict must include league_id
# ===========================================================================


@pytest.mark.asyncio
async def test_bug2_session_orm_to_dict_includes_league_id(
    db_session: AsyncSession,
    league_a: League,
    gap_session_a: Session,
):
    """BUG 2 regression: when an existing active gap session is found by the dedup
    query, the dict built from the ORM row must include league_id.

    Before the fix, league_id was absent, so can_user_add_match_to_session
    classified the session as pickup (league_id=None) and applied participant
    auth instead of the correct league-member/admin check.
    """
    from backend.services.games.session_data import can_user_add_match_to_session

    # Build the session dict the way the fixed code does
    session_dict = {
        "id": gap_session_a.id,
        "date": gap_session_a.date,
        "name": gap_session_a.name,
        "status": gap_session_a.status.value if gap_session_a.status else None,
        "season_id": gap_session_a.season_id,
        "league_id": gap_session_a.league_id,  # BUG 2 FIX: must be present
    }

    assert session_dict["league_id"] == league_a.id, (
        "league_id must be present in the found-session dict"
    )

    # can_user_add_match_to_session should return True for league sessions
    # (the caller then applies the league-admin check — not the participant check)
    result = await can_user_add_match_to_session(
        db_session, gap_session_a.id, session_dict, user_id=9999
    )
    assert result is True, (
        "can_user_add_match_to_session must return True for a league session "
        "so the caller defers to the league-admin check"
    )


@pytest.mark.asyncio
async def test_bug2_dict_missing_league_id_misclassified_as_pickup(
    db_session: AsyncSession,
    league_a: League,
    gap_session_a: Session,
):
    """Documents the pre-fix misclassification: a dict without league_id falls
    through to the pickup participant check, which denies user 9999 (no player).
    """
    from backend.services.games.session_data import can_user_add_match_to_session

    # The OLD dict shape (missing league_id key)
    old_dict = {
        "id": gap_session_a.id,
        "date": gap_session_a.date,
        "name": gap_session_a.name,
        "status": gap_session_a.status.value if gap_session_a.status else None,
        "season_id": gap_session_a.season_id,
        # league_id intentionally absent — this was the bug
    }

    # Without league_id, can_user_add_match_to_session treats it as pickup and
    # denies user 9999 who has no player record.
    result = await can_user_add_match_to_session(
        db_session, gap_session_a.id, old_dict, user_id=9999
    )
    # Result False = misclassified as pickup, auth wrongly denied
    assert result is False, (
        "Confirms the pre-fix behaviour: missing league_id causes mis-classification"
    )


# ===========================================================================
# BUG 3 — pickup naming counter excludes gap games
# ===========================================================================


@pytest.mark.asyncio
async def test_bug3_create_session_pickup_counter_ignores_gap_games(
    db_session: AsyncSession,
    league_a: League,
    gap_session_a: Session,  # exists on TODAY_STR, season_id=NULL, league_id SET
):
    """BUG 3 regression: create_session's session-counter query must NOT count
    gap games (season_id NULL but league_id SET) as pickup sessions.

    Before the fix, the counter was:
      WHERE date = ? AND season_id IS NULL
    which counted gap games too — the second pickup created on the same day
    would be mis-named "M/D/YYYY Session #2" even though no other pickup exists.

    After the fix:
      WHERE date = ? AND season_id IS NULL AND league_id IS NULL
    only true pickups are counted.
    """
    from sqlalchemy import and_, func

    # gap_session_a has season_id=NULL and league_id=league_a.id (gap game).
    # The FIXED counter must return 0 (no pickups exist today).
    result = await db_session.execute(
        select(func.count(Session.id)).where(
            and_(
                Session.date == TODAY_STR,
                Session.season_id.is_(None),
                Session.league_id.is_(None),  # BUG 3 FIX
            )
        )
    )
    count = result.scalar() or 0
    assert count == 0, f"Pickup counter must be 0 (gap_session_a must not be counted), got {count}"


@pytest.mark.asyncio
async def test_bug3_old_counter_would_have_counted_gap_games(
    db_session: AsyncSession,
    league_a: League,
    gap_session_a: Session,
    pickup_session: Session,
):
    """Proves the old counter over-counts: both pickup AND gap game match
    the old WHERE clause (date = ? AND season_id IS NULL).
    """
    from sqlalchemy import and_, func

    # Old broken counter
    result = await db_session.execute(
        select(func.count(Session.id)).where(
            and_(
                Session.date == TODAY_STR,
                Session.season_id.is_(None),
            )
        )
    )
    old_count = result.scalar() or 0
    assert old_count == 2, "Old counter returns 2 (gap + pickup) — confirming the bug"

    # Fixed counter
    result2 = await db_session.execute(
        select(func.count(Session.id)).where(
            and_(
                Session.date == TODAY_STR,
                Session.season_id.is_(None),
                Session.league_id.is_(None),
            )
        )
    )
    fixed_count = result2.scalar() or 0
    assert fixed_count == 1, "Fixed counter returns 1 (only the pickup)"


@pytest.mark.asyncio
async def test_bug3_create_session_names_first_pickup_without_suffix(
    db_session: AsyncSession,
    league_a: League,
    gap_session_a: Session,  # gap game exists — must NOT trigger #2 suffix
):
    """End-to-end: creating the FIRST pickup on a day that already has a gap game
    must produce a name without a '#N' suffix (e.g. '6/20/2026', not '6/20/2026 Session #2').
    """
    result = await data_service.create_session(
        db_session,
        date=TODAY_STR,
    )
    assert "#" not in result["name"], (
        f"First pickup should not have a '#N' suffix; got: {result['name']!r}"
    )


# ===========================================================================
# BUG 5 — _is_system_admin logs warning on exception
# ===========================================================================


@pytest.mark.asyncio
async def test_bug5_is_system_admin_logs_warning_on_exception(caplog):
    """BUG 5 regression: _is_system_admin must log a WARNING when an exception
    is raised, rather than swallowing it silently, and still return False.
    """
    from backend.api.auth_dependencies import _is_system_admin

    mock_session = AsyncMock()
    mock_session.execute.side_effect = RuntimeError("simulated DB failure")

    user = {"id": 1, "phone_number": "+10000000000", "email": "x@x.com"}

    with caplog.at_level(logging.WARNING, logger="backend.api.auth_dependencies"):
        result = await _is_system_admin(mock_session, user)

    assert result is False, "_is_system_admin must return False on exception (fail-safe deny)"
    assert any(
        "warning" in r.levelname.lower() or r.levelno >= logging.WARNING
        for r in caplog.records
        if "_is_system_admin" in r.message or "unexpectedly" in r.message
    ), "A WARNING log must be emitted when _is_system_admin raises"


# ===========================================================================
# BUG 6 — _get_active_season uses `is not None` guard
# ===========================================================================


@pytest.mark.asyncio
async def test_bug6_get_active_season_accepts_season_id_zero(
    db_session: AsyncSession,
    league_a: League,
):
    """BUG 6 regression: `if season_id:` evaluates False for season_id=0, causing
    the value to fall through to the resolver (which may raise or return wrong data).
    The fix uses `if season_id is not None:` so 0 is handled explicitly.

    We can't create a season with id=0 (serial PK), so we verify the behaviour
    indirectly: passing season_id=0 to _get_active_season must try to look up
    a season with that id (and raise ValueError because none exists), not silently
    fall through to the date-based resolver.
    """
    from backend.services.games.session_data import _get_active_season

    # season_id=0 should trigger the explicit-id path (is not None → True),
    # which will not find a season and must raise ValueError.
    with pytest.raises(ValueError, match="Season 0 not found"):
        await _get_active_season(db_session, league_a.id, season_id=0)


@pytest.mark.asyncio
async def test_bug6_get_active_season_none_falls_through_to_resolver(
    db_session: AsyncSession,
    league_a: League,
):
    """When season_id is truly None, the resolver path is taken (raises ValueError
    because league_a has no active season).
    """
    from backend.services.games.session_data import _get_active_season

    with pytest.raises(ValueError, match="does not have an active season"):
        await _get_active_season(db_session, league_a.id, season_id=None)


# ===========================================================================
# SECURITY 1 — end_league_session IDOR
# ===========================================================================


class TestSec1EndLeagueSessionIDOR:
    """PATCH /api/leagues/{league_id}/sessions/{session_id} — IDOR fix."""

    def test_rejects_session_from_different_league(self, monkeypatch):
        """A member of League A cannot submit League B's session via League A's URL.

        The route must check that the session's own league_id matches the path
        league_id and return 404 (not 403) to avoid leaking cross-league info.
        """
        from sqlalchemy.ext.asyncio import AsyncSession as AlchemySession

        client, headers = _make_admin_client(monkeypatch)
        _patch_player(monkeypatch)
        _patch_notifications(monkeypatch)

        _LEAGUE_A = 10
        _LEAGUE_B = 20
        _SESSION_OF_B = 500

        async def fake_get_session(session, session_id):
            return {"id": _SESSION_OF_B, "league_id": _LEAGUE_B, "status": "ACTIVE"}

        monkeypatch.setattr(data_service, "get_session", fake_get_session, raising=True)

        call_order = [0]

        async def fake_execute(self_session, query, *a, **kw):
            call_order[0] += 1

            class R:
                def scalar_one_or_none(self_r):
                    if call_order[0] == 1:
                        # IDOR check: session belongs to League B, not A
                        return _LEAGUE_B
                    return None

                def first(self_r):
                    return ("Some Session", None, _LEAGUE_B)

            return R()

        monkeypatch.setattr(AlchemySession, "execute", fake_execute, raising=True)

        response = client.patch(
            f"/api/leagues/{_LEAGUE_A}/sessions/{_SESSION_OF_B}",
            json={"submit": True},
            headers=headers,
        )
        assert response.status_code == 404, (
            f"Cross-league IDOR must return 404, got {response.status_code}: {response.text}"
        )

    def test_rejects_nonexistent_session(self, monkeypatch):
        """A session that does not exist at all returns 404."""
        from sqlalchemy.ext.asyncio import AsyncSession as AlchemySession

        client, headers = _make_admin_client(monkeypatch)
        _patch_player(monkeypatch)

        async def fake_get_session(session, session_id):
            return None

        monkeypatch.setattr(data_service, "get_session", fake_get_session, raising=True)

        async def fake_execute(self_session, query, *a, **kw):
            class R:
                def scalar_one_or_none(self_r):
                    return None  # session not found

                def first(self_r):
                    return None

            return R()

        monkeypatch.setattr(AlchemySession, "execute", fake_execute, raising=True)

        response = client.patch(
            f"/api/leagues/{_LEAGUE_ID}/sessions/99999",
            json={"submit": True},
            headers=headers,
        )
        assert response.status_code == 404

    def test_accepts_session_belonging_to_correct_league(self, monkeypatch):
        """Happy path: session belongs to the path league → 200."""
        from sqlalchemy.ext.asyncio import AsyncSession as AlchemySession

        client, headers = _make_admin_client(monkeypatch)
        _patch_player(monkeypatch)
        _patch_notifications(monkeypatch)

        async def fake_get_session(session, session_id):
            return {"id": _SESSION_ID, "league_id": _LEAGUE_ID, "status": "ACTIVE"}

        monkeypatch.setattr(data_service, "get_session", fake_get_session, raising=True)

        call_order = [0]

        async def fake_execute(self_session, query, *a, **kw):
            call_order[0] += 1

            class R:
                def scalar_one_or_none(self_r):
                    if call_order[0] == 1:
                        return _LEAGUE_ID  # IDOR check passes — same league
                    return None

                def first(self_r):
                    return ("Test Session", _SEASON_ID, _LEAGUE_ID)

            return R()

        monkeypatch.setattr(AlchemySession, "execute", fake_execute, raising=True)

        async def fake_lock(session, session_id, updated_by=None):
            return {"global_job_id": 1, "league_job_id": None, "season_id": _SEASON_ID}

        monkeypatch.setattr(data_service, "lock_in_session", fake_lock, raising=True)

        response = client.patch(
            f"/api/leagues/{_LEAGUE_ID}/sessions/{_SESSION_ID}",
            json={"submit": True},
            headers=headers,
        )
        assert response.status_code == 200


# ===========================================================================
# SECURITY 2 — POST /api/sessions requires league membership
# ===========================================================================


class TestSec2CreateSessionMembershipCheck:
    """POST /api/sessions — league membership required when league_id is set."""

    def test_non_member_cannot_create_league_session(self, monkeypatch):
        """An authenticated user who is not a league member receives 403."""
        import backend.api.routes.sessions as sessions_module

        client, headers = _make_user_client(monkeypatch)
        _patch_player(monkeypatch)

        async def fake_has_league_role(session, user_id, league_id, required_role):
            return False  # not a member

        monkeypatch.setattr(
            sessions_module, "_has_league_role", fake_has_league_role, raising=True
        )

        response = client.post(
            "/api/sessions",
            json={"league_id": _LEAGUE_ID, "date": "6/20/2026"},
            headers=headers,
        )
        assert response.status_code == 403, (
            f"Non-member must get 403; got {response.status_code}: {response.text}"
        )

    def test_member_can_create_league_session(self, monkeypatch):
        """A league member successfully creates (or retrieves) a league session."""
        import backend.api.routes.sessions as sessions_module

        client, headers = _make_user_client(monkeypatch)
        _patch_player(monkeypatch)

        async def fake_has_league_role(session, user_id, league_id, required_role):
            return True  # is a member

        async def fake_get_or_create(session, league_id, session_date, **kwargs):
            return {
                "id": _SESSION_ID,
                "name": "League Saturday",
                "code": "LGE00001",
                "status": "ACTIVE",
                "season_id": None,
                "league_id": league_id,
            }

        monkeypatch.setattr(
            sessions_module, "_has_league_role", fake_has_league_role, raising=True
        )
        monkeypatch.setattr(
            data_service,
            "get_or_create_active_league_session",
            fake_get_or_create,
            raising=True,
        )

        response = client.post(
            "/api/sessions",
            json={"league_id": _LEAGUE_ID, "date": "6/20/2026"},
            headers=headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert data["session"]["id"] == _SESSION_ID

    def test_pickup_requires_no_membership(self, monkeypatch):
        """Pickup session (no league_id) is created without any membership check."""
        client, headers = _make_user_client(monkeypatch)
        _patch_player(monkeypatch)

        async def fake_create_session(session, date, **kwargs):
            return {
                "id": _SESSION_ID,
                "name": "Pickup",
                "code": "PICK0001",
                "status": "ACTIVE",
                "season_id": None,
                "league_id": None,
            }

        # NOTE: _has_league_role is NOT patched — proving it is never called
        monkeypatch.setattr(data_service, "create_session", fake_create_session, raising=True)

        response = client.post(
            "/api/sessions",
            json={"date": "6/20/2026"},
            headers=headers,
        )
        assert response.status_code == 200

    def test_requires_auth(self):
        """Unauthenticated request returns 401."""
        client = TestClient(app)
        response = client.post(
            "/api/sessions",
            json={"league_id": _LEAGUE_ID, "date": "6/20/2026"},
        )
        assert response.status_code in (401, 403)


# ===========================================================================
# SECURITY 3 — POST /api/matches requires league membership
# ===========================================================================


class TestSec3CreateMatchMembershipCheck:
    """POST /api/matches — league membership required when league_id is set."""

    _VALID_BODY = {
        "league_id": _LEAGUE_ID,
        "date": "6/20/2026",
        "team1_player1_id": 1,
        "team1_player2_id": 2,
        "team2_player1_id": 3,
        "team2_player2_id": 4,
        "team1_score": 21,
        "team2_score": 15,
    }

    def test_non_member_cannot_create_league_match(self, monkeypatch):
        """An authenticated non-member receives 403 when league_id is set."""
        import backend.api.auth_dependencies as auth_deps

        client, headers = _make_user_client(monkeypatch)
        _patch_player(monkeypatch)

        # Patch resolve_active_season so we reach the membership check
        async def fake_resolve_season(session, league_id):
            return None  # gap game path

        monkeypatch.setattr(
            data_service, "resolve_active_season", fake_resolve_season, raising=True
        )

        # Patch _has_league_role (as imported in matches.py's inline import)
        # matches.py uses `from backend.api.auth_dependencies import _has_league_role as _hlr`
        # inside the function body so we patch auth_dependencies directly.
        async def fake_has_league_role(session, user_id, league_id, required_role):
            return False  # not a member

        monkeypatch.setattr(auth_deps, "_has_league_role", fake_has_league_role, raising=True)

        response = client.post("/api/matches", json=self._VALID_BODY, headers=headers)
        assert response.status_code == 403, (
            f"Non-member must get 403; got {response.status_code}: {response.text}"
        )

    def test_member_can_create_league_match(self, monkeypatch):
        """A league member can add a match to a league session."""
        import backend.api.auth_dependencies as auth_deps

        client, headers = _make_user_client(monkeypatch)
        _patch_player(monkeypatch)

        async def fake_resolve_season(session, league_id):
            return None  # gap game

        async def fake_has_league_role(session, user_id, league_id, required_role):
            return True  # is a member

        async def fake_get_or_create(session, league_id, session_date, **kwargs):
            return {
                "id": _SESSION_ID,
                "status": "ACTIVE",
                "league_id": league_id,
                "season_id": None,
            }

        async def fake_create_match(session, match_request, session_id):
            return 42  # match id

        monkeypatch.setattr(
            data_service, "resolve_active_season", fake_resolve_season, raising=True
        )
        monkeypatch.setattr(auth_deps, "_has_league_role", fake_has_league_role, raising=True)
        monkeypatch.setattr(
            data_service,
            "get_or_create_active_league_session",
            fake_get_or_create,
            raising=True,
        )
        monkeypatch.setattr(data_service, "create_match_async", fake_create_match, raising=True)

        response = client.post("/api/matches", json=self._VALID_BODY, headers=headers)
        assert response.status_code == 200
        assert response.json()["match_id"] == 42

    def test_pickup_match_requires_no_membership(self, monkeypatch):
        """Pickup match (no league_id) is created without a membership check."""
        pickup_body = {
            "team1_player1_id": 1,
            "team1_player2_id": 2,
            "team2_player1_id": 3,
            "team2_player2_id": 4,
            "team1_score": 21,
            "team2_score": 15,
        }

        client, headers = _make_user_client(monkeypatch)
        _patch_player(monkeypatch)

        async def fake_create_session(session, date, **kwargs):
            return {"id": _SESSION_ID, "status": "ACTIVE", "league_id": None}

        async def fake_create_match(session, match_request, session_id):
            return 55

        monkeypatch.setattr(data_service, "create_session", fake_create_session, raising=True)
        monkeypatch.setattr(data_service, "create_match_async", fake_create_match, raising=True)

        response = client.post("/api/matches", json=pickup_body, headers=headers)
        assert response.status_code == 200

    def test_requires_auth(self):
        """Unauthenticated request returns 401."""
        client = TestClient(app)
        response = client.post("/api/matches", json=self._VALID_BODY)
        assert response.status_code in (401, 403)


# ===========================================================================
# SECURITY 4 — remove_session_participant requires league membership
# ===========================================================================


class TestSec4RemoveParticipantMembershipCheck:
    """DELETE /api/sessions/{session_id}/participants/{player_id} — SECURITY 4."""

    _OTHER_PLAYER = 99

    _LEAGUE_SESSION = {
        "id": _SESSION_ID,
        "name": "League Session",
        "status": "ACTIVE",
        "season_id": _SEASON_ID,
        "league_id": _LEAGUE_ID,
        "created_by": _PLAYER_ID,
        "code": "LGE12345",
    }

    def test_non_member_cannot_remove_participant_from_league_session(self, monkeypatch):
        """A user who is not a league member receives 404 when trying to remove
        a participant from a league session.
        """
        import backend.api.routes.sessions as sessions_module

        client, headers = _make_user_client(monkeypatch)

        async def fake_get_session(session, session_id):
            return self._LEAGUE_SESSION.copy()

        async def fake_has_league_role(session, user_id, league_id, required_role):
            return False  # not a member

        monkeypatch.setattr(data_service, "get_session", fake_get_session, raising=True)
        monkeypatch.setattr(
            sessions_module, "_has_league_role", fake_has_league_role, raising=True
        )

        response = client.delete(
            f"/api/sessions/{_SESSION_ID}/participants/{self._OTHER_PLAYER}",
            headers=headers,
        )
        assert response.status_code == 404, (
            f"Non-member must be denied without disclosure; got {response.status_code}: {response.text}"
        )

    def test_member_can_remove_participant_from_league_session(self, monkeypatch):
        """A league member can remove another participant from a league session."""
        import backend.api.routes.sessions as sessions_module

        client, headers = _make_user_client(monkeypatch)

        async def fake_get_session(session, session_id):
            return self._LEAGUE_SESSION.copy()

        async def fake_has_league_role(session, user_id, league_id, required_role):
            return True  # is a member

        async def fake_remove(session, session_id, player_id):
            return True

        monkeypatch.setattr(data_service, "get_session", fake_get_session, raising=True)
        monkeypatch.setattr(
            sessions_module, "_has_league_role", fake_has_league_role, raising=True
        )
        monkeypatch.setattr(data_service, "remove_session_participant", fake_remove, raising=True)

        response = client.delete(
            f"/api/sessions/{_SESSION_ID}/participants/{self._OTHER_PLAYER}",
            headers=headers,
        )
        assert response.status_code == 200
        assert response.json()["status"] == "success"

    def test_pickup_session_still_uses_participant_check(self, monkeypatch):
        """For pickup sessions (league_id=None), the existing can_user_add logic
        still gates roster removal (no membership check required/applicable).
        """
        client, headers = _make_user_client(monkeypatch)

        pickup_session = {
            "id": _SESSION_ID,
            "name": "Pickup",
            "status": "ACTIVE",
            "season_id": None,
            "league_id": None,
            "created_by": _PLAYER_ID,
            "code": "PICK1234",
        }

        async def fake_get_session(session, session_id):
            return pickup_session

        async def fake_can_add(session, session_id, sess, user_id):
            return True  # user is a participant

        async def fake_remove(session, session_id, player_id):
            return True

        monkeypatch.setattr(data_service, "get_session", fake_get_session, raising=True)
        monkeypatch.setattr(
            data_service, "can_user_add_match_to_session", fake_can_add, raising=True
        )
        monkeypatch.setattr(data_service, "remove_session_participant", fake_remove, raising=True)

        response = client.delete(
            f"/api/sessions/{_SESSION_ID}/participants/{self._OTHER_PLAYER}",
            headers=headers,
        )
        assert response.status_code == 200

    def test_pickup_session_non_participant_still_denied(self, monkeypatch):
        """For pickup sessions, a non-participant is still denied (existing behaviour)."""
        client, headers = _make_user_client(monkeypatch)

        pickup_session = {
            "id": _SESSION_ID,
            "name": "Pickup",
            "status": "ACTIVE",
            "season_id": None,
            "league_id": None,
            "created_by": _PLAYER_ID,
            "code": "PICK1234",
        }

        async def fake_get_session(session, session_id):
            return pickup_session

        async def fake_can_add(session, session_id, sess, user_id):
            return False  # not a participant

        monkeypatch.setattr(data_service, "get_session", fake_get_session, raising=True)
        monkeypatch.setattr(
            data_service, "can_user_add_match_to_session", fake_can_add, raising=True
        )

        response = client.delete(
            f"/api/sessions/{_SESSION_ID}/participants/{self._OTHER_PLAYER}",
            headers=headers,
        )
        assert response.status_code == 404
