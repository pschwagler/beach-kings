"""Route-layer tests for league invite endpoints.

Covers:
- GET  /api/leagues/{id}/invitable-players?q=
- POST /api/leagues/{id}/invites
- GET  /api/leagues/{id}/invites
- GET  /api/users/me/league-invites/sent
- GET  /api/users/me/league-invites/received
- POST /api/leagues/{id}/invites/respond  (accept / decline)

Auth strategy: ``_make_admin_client`` marks the caller as a system admin
(by patching ``data_service.get_setting``) so ``make_require_league_admin``
short-circuits without any DB call.  For the 403 non-admin test,
``get_setting`` returns None and we rely on one execute call for the
role check — following the pattern in test_seasons_routes.py.

For the respond endpoint ``_make_plain_client`` provides an ordinary
authenticated user (no system-admin bypass) matching how the route
is secured via ``require_user``.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.main import app
from backend.database.db import get_db_session
from backend.services import auth_service, data_service, role_service, user_service

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

LEAGUE_ID = 7
PLAYER_ID = 3
USER_ID = 1
PHONE = "+10000000099"

FAKE_USER = {
    "id": USER_ID,
    "phone_number": PHONE,
    "name": "Admin Player",
    "email": "admin@example.com",
    "is_verified": True,
    "created_at": "2024-01-01T00:00:00Z",
}

MOCK_INVITABLE_PLAYER = {
    "player_id": 10,
    "display_name": "Jake Donovan",
    "initials": "JD",
    "location_name": "Queens, NY",
    "level": "Open",
    "invite_status": "none",
    "section": "friends",
}

MOCK_INVITE_ITEM = {
    "id": 1,
    "league_id": LEAGUE_ID,
    "league_name": "QBK Open Men",
    "player_id": 10,
    "display_name": "Jake Donovan",
    "initials": "JD",
    "invited_at": "2026-01-01T00:00:00+00:00",
    "status": "pending",
}

MOCK_INVITE_ITEM_WITH_GAME_COUNT = {
    **MOCK_INVITE_ITEM,
    "game_count": 5,
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_fake_session() -> MagicMock:
    """Return an AsyncMock that simulates a SQLAlchemy async session."""
    session = MagicMock(spec=AsyncSession)
    session.execute = AsyncMock()
    return session


def _scalar_result(obj) -> MagicMock:
    """Wrap a single ORM object in a mock execute() result."""
    result = MagicMock()
    result.scalar_one_or_none.return_value = obj
    return result


def _fake_player(player_id: int = PLAYER_ID, user_id: int = USER_ID) -> MagicMock:
    """Return a mock Player ORM object."""
    player = MagicMock()
    player.id = player_id
    player.user_id = user_id
    return player


def _make_admin_client(monkeypatch) -> tuple[TestClient, dict]:
    """
    Return (TestClient, auth_headers) with the caller treated as a system admin.

    System-admin status short-circuits all league-role DB queries so the only
    session.execute calls come from the route handler itself.
    """

    def fake_verify_token(token: str) -> dict:
        return {"user_id": USER_ID, "phone_number": PHONE}

    async def fake_get_user_by_id(session, uid: int) -> dict:
        return FAKE_USER

    async def fake_get_setting(session, key: str):
        if key == "system_admin_phone_numbers":
            return PHONE
        return None

    monkeypatch.setattr(auth_service, "verify_token", fake_verify_token, raising=True)
    monkeypatch.setattr(user_service, "get_user_by_id", fake_get_user_by_id, raising=True)
    monkeypatch.setattr(data_service, "get_setting", fake_get_setting, raising=True)

    async def fake_is_system_admin(session, uid: int) -> bool:
        return True

    monkeypatch.setattr(role_service, "is_system_admin", fake_is_system_admin, raising=True)
    return TestClient(app), {"Authorization": "Bearer dummy"}


def _make_plain_client(monkeypatch) -> tuple[TestClient, dict]:
    """Return (TestClient, auth_headers) for an ordinary authenticated user.

    Unlike ``_make_admin_client``, no system-admin bypass is applied; the
    caller is just a verified user with no league-admin privileges.
    """

    def fake_verify_token(token: str) -> dict:
        return {"user_id": USER_ID, "phone_number": PHONE}

    async def fake_get_user_by_id(session, uid: int) -> dict:
        return FAKE_USER

    monkeypatch.setattr(auth_service, "verify_token", fake_verify_token, raising=True)
    monkeypatch.setattr(user_service, "get_user_by_id", fake_get_user_by_id, raising=True)
    return TestClient(app), {"Authorization": "Bearer dummy"}


def _make_nonadmin_client(monkeypatch) -> tuple[TestClient, dict]:
    """Return (TestClient, auth_headers) for a plain authenticated user (not system admin)."""

    def fake_verify_token(token: str) -> dict:
        return {"user_id": USER_ID, "phone_number": PHONE}

    async def fake_get_user_by_id(session, uid: int) -> dict:
        return FAKE_USER

    async def fake_get_setting(session, key: str):
        return None  # not a system admin

    monkeypatch.setattr(auth_service, "verify_token", fake_verify_token, raising=True)
    monkeypatch.setattr(user_service, "get_user_by_id", fake_get_user_by_id, raising=True)
    monkeypatch.setattr(data_service, "get_setting", fake_get_setting, raising=True)

    async def fake_is_system_admin(session, uid: int) -> bool:
        return False

    monkeypatch.setattr(role_service, "is_system_admin", fake_is_system_admin, raising=True)
    return TestClient(app), {"Authorization": "Bearer dummy"}


def _override_session(session: MagicMock) -> None:
    app.dependency_overrides[get_db_session] = lambda: session


def _clear_overrides() -> None:
    app.dependency_overrides.pop(get_db_session, None)


# ---------------------------------------------------------------------------
# GET /api/leagues/{id}/invitable-players
# ---------------------------------------------------------------------------


class TestGetInvitablePlayers:
    """Tests for GET /api/leagues/{league_id}/invitable-players."""

    def test_no_token_returns_401_or_403(self):
        """Unauthenticated request is rejected."""
        client = TestClient(app)
        response = client.get(f"/api/leagues/{LEAGUE_ID}/invitable-players")
        assert response.status_code in (401, 403)

    def test_non_admin_returns_403(self, monkeypatch):
        """Non-admin member gets 403 from the league-role check."""
        client, headers = _make_nonadmin_client(monkeypatch)

        # _has_league_role executes once; returns None → not admin → 403
        session = _make_fake_session()
        session.execute.side_effect = [_scalar_result(None)]
        _override_session(session)

        try:
            response = client.get(
                f"/api/leagues/{LEAGUE_ID}/invitable-players",
                headers=headers,
            )
            assert response.status_code == 403
        finally:
            _clear_overrides()

    def test_returns_invitable_players_for_admin(self, monkeypatch):
        """System admin gets 200 with correctly shaped player list."""
        client, headers = _make_admin_client(monkeypatch)

        async def fake_get_invitable_players(session, league_id, admin_player_id, query=None):
            return [MOCK_INVITABLE_PLAYER]

        monkeypatch.setattr(
            data_service, "get_invitable_players", fake_get_invitable_players, raising=True
        )

        # Route handler: 1 execute for player lookup
        session = _make_fake_session()
        session.execute.side_effect = [_scalar_result(_fake_player())]
        _override_session(session)

        try:
            response = client.get(f"/api/leagues/{LEAGUE_ID}/invitable-players", headers=headers)
            assert response.status_code == 200
            body = response.json()
            assert isinstance(body, list)
            assert len(body) == 1
            assert body[0]["player_id"] == 10
            assert body[0]["invite_status"] == "none"
            assert body[0]["section"] == "friends"
        finally:
            _clear_overrides()

    def test_passes_query_param(self, monkeypatch):
        """Query parameter q is forwarded to the service function."""
        client, headers = _make_admin_client(monkeypatch)

        received_query: list[str | None] = []

        async def fake_get_invitable_players(session, league_id, admin_player_id, query=None):
            received_query.append(query)
            return []

        monkeypatch.setattr(
            data_service, "get_invitable_players", fake_get_invitable_players, raising=True
        )

        session = _make_fake_session()
        session.execute.side_effect = [_scalar_result(_fake_player())]
        _override_session(session)

        try:
            response = client.get(
                f"/api/leagues/{LEAGUE_ID}/invitable-players?q=jake",
                headers=headers,
            )
            assert response.status_code == 200
            assert received_query == ["jake"]
        finally:
            _clear_overrides()

    def test_returns_empty_query_as_none(self, monkeypatch):
        """Empty q param is treated as None (no filter)."""
        client, headers = _make_admin_client(monkeypatch)

        received_query: list[str | None] = []

        async def fake_get_invitable_players(session, league_id, admin_player_id, query=None):
            received_query.append(query)
            return []

        monkeypatch.setattr(
            data_service, "get_invitable_players", fake_get_invitable_players, raising=True
        )

        session = _make_fake_session()
        session.execute.side_effect = [_scalar_result(_fake_player())]
        _override_session(session)

        try:
            response = client.get(
                f"/api/leagues/{LEAGUE_ID}/invitable-players",
                headers=headers,
            )
            assert response.status_code == 200
            assert received_query == [None]
        finally:
            _clear_overrides()


# ---------------------------------------------------------------------------
# POST /api/leagues/{id}/invites
# ---------------------------------------------------------------------------


class TestPostLeagueInvites:
    """Tests for POST /api/leagues/{league_id}/invites."""

    def test_no_token_returns_401_or_403(self):
        """Unauthenticated request is rejected."""
        client = TestClient(app)
        response = client.post(f"/api/leagues/{LEAGUE_ID}/invites", json={"player_ids": [10]})
        assert response.status_code in (401, 403)

    def test_missing_player_ids_returns_422(self, monkeypatch):
        """Request body without player_ids returns 422 validation error."""
        client, headers = _make_admin_client(monkeypatch)

        session = _make_fake_session()
        session.execute.return_value = _scalar_result(_fake_player())
        _override_session(session)

        try:
            response = client.post(
                f"/api/leagues/{LEAGUE_ID}/invites",
                json={},
                headers=headers,
            )
            assert response.status_code == 422
        finally:
            _clear_overrides()

    def test_empty_player_ids_returns_400(self, monkeypatch):
        """Empty player_ids list returns 400."""
        client, headers = _make_admin_client(monkeypatch)

        session = _make_fake_session()
        session.execute.return_value = _scalar_result(_fake_player())
        _override_session(session)

        try:
            response = client.post(
                f"/api/leagues/{LEAGUE_ID}/invites",
                json={"player_ids": []},
                headers=headers,
            )
            assert response.status_code == 400
        finally:
            _clear_overrides()

    def test_sends_invites_returns_success(self, monkeypatch):
        """Valid request creates invites and returns success."""
        client, headers = _make_admin_client(monkeypatch)

        async def fake_create_league_invites(session, league_id, player_ids, invited_by_player_id):
            return len(player_ids)

        async def fake_get_league(session, league_id):
            return {"id": league_id, "name": "QBK Open Men"}

        monkeypatch.setattr(
            data_service, "create_league_invites", fake_create_league_invites, raising=True
        )
        monkeypatch.setattr(data_service, "get_league", fake_get_league, raising=True)

        # Route handler: player lookup, then per-player notification lookup
        session = _make_fake_session()
        session.execute.return_value = _scalar_result(_fake_player())
        _override_session(session)

        try:
            response = client.post(
                f"/api/leagues/{LEAGUE_ID}/invites",
                json={"player_ids": [10, 11]},
                headers=headers,
            )
            assert response.status_code == 200
            body = response.json()
            assert body["success"] is True
        finally:
            _clear_overrides()


# ---------------------------------------------------------------------------
# GET /api/leagues/{id}/invites
# ---------------------------------------------------------------------------


class TestGetLeagueInvites:
    """Tests for GET /api/leagues/{league_id}/invites."""

    def test_no_token_returns_401_or_403(self):
        """Unauthenticated request is rejected."""
        client = TestClient(app)
        response = client.get(f"/api/leagues/{LEAGUE_ID}/invites")
        assert response.status_code in (401, 403)

    def test_returns_invite_list_for_admin(self, monkeypatch):
        """System admin gets 200 with correctly shaped invite list."""
        client, headers = _make_admin_client(monkeypatch)

        async def fake_list_league_invites(session, league_id):
            return [MOCK_INVITE_ITEM]

        monkeypatch.setattr(
            data_service, "list_league_invites", fake_list_league_invites, raising=True
        )

        session = _make_fake_session()
        session.execute.return_value = _scalar_result(_fake_player())
        _override_session(session)

        try:
            response = client.get(f"/api/leagues/{LEAGUE_ID}/invites", headers=headers)
            assert response.status_code == 200
            body = response.json()
            assert isinstance(body, list)
            assert len(body) == 1
            assert body[0]["id"] == 1
            assert body[0]["league_name"] == "QBK Open Men"
            assert body[0]["status"] == "pending"
        finally:
            _clear_overrides()

    def test_returns_empty_list(self, monkeypatch):
        """Returns empty list when there are no invites."""
        client, headers = _make_admin_client(monkeypatch)

        async def fake_list_league_invites(session, league_id):
            return []

        monkeypatch.setattr(
            data_service, "list_league_invites", fake_list_league_invites, raising=True
        )

        session = _make_fake_session()
        session.execute.return_value = _scalar_result(_fake_player())
        _override_session(session)

        try:
            response = client.get(f"/api/leagues/{LEAGUE_ID}/invites", headers=headers)
            assert response.status_code == 200
            assert response.json() == []
        finally:
            _clear_overrides()


# ---------------------------------------------------------------------------
# GET /api/users/me/league-invites/sent
# ---------------------------------------------------------------------------


class TestGetMySentLeagueInvites:
    """Tests for GET /api/users/me/league-invites/sent."""

    def test_no_token_returns_401_or_403(self):
        """Unauthenticated request is rejected."""
        client = TestClient(app)
        response = client.get("/api/users/me/league-invites/sent")
        assert response.status_code in (401, 403)

    def test_returns_sent_invites_for_authenticated_user(self, monkeypatch):
        """Authenticated user gets 200 with their sent invite list."""
        client, headers = _make_admin_client(monkeypatch)

        async def fake_list_my_sent_invites(session, player_id):
            return [MOCK_INVITE_ITEM]

        monkeypatch.setattr(
            data_service, "list_my_sent_invites", fake_list_my_sent_invites, raising=True
        )

        session = _make_fake_session()
        session.execute.side_effect = [_scalar_result(_fake_player())]
        _override_session(session)

        try:
            response = client.get("/api/users/me/league-invites/sent", headers=headers)
            assert response.status_code == 200
            body = response.json()
            assert isinstance(body, list)
            assert len(body) == 1
            assert body[0]["league_name"] == "QBK Open Men"
        finally:
            _clear_overrides()

    def test_returns_empty_list_when_no_invites(self, monkeypatch):
        """User with no sent invites gets empty list."""
        client, headers = _make_admin_client(monkeypatch)

        async def fake_list_my_sent_invites(session, player_id):
            return []

        monkeypatch.setattr(
            data_service, "list_my_sent_invites", fake_list_my_sent_invites, raising=True
        )

        session = _make_fake_session()
        session.execute.side_effect = [_scalar_result(_fake_player())]
        _override_session(session)

        try:
            response = client.get("/api/users/me/league-invites/sent", headers=headers)
            assert response.status_code == 200
            assert response.json() == []
        finally:
            _clear_overrides()

    def test_returns_empty_list_when_no_player_profile(self, monkeypatch):
        """User without a player profile gets empty list (no 404)."""
        client, headers = _make_admin_client(monkeypatch)

        async def fake_list_my_sent_invites(session, player_id):
            return []

        monkeypatch.setattr(
            data_service, "list_my_sent_invites", fake_list_my_sent_invites, raising=True
        )

        session = _make_fake_session()
        session.execute.side_effect = [_scalar_result(None)]  # no player
        _override_session(session)

        try:
            response = client.get("/api/users/me/league-invites/sent", headers=headers)
            assert response.status_code == 200
            assert response.json() == []
        finally:
            _clear_overrides()


# ---------------------------------------------------------------------------
# GET /api/leagues/{id}/invites — game_count populated
# ---------------------------------------------------------------------------


class TestGetLeagueInvitesGameCount:
    """Verify that game_count is populated in the admin invite list response."""

    def test_game_count_populated_when_service_returns_it(self, monkeypatch):
        """game_count is surfaced in the response when the service populates it."""
        client, headers = _make_admin_client(monkeypatch)

        async def fake_list_league_invites(session, league_id):
            return [MOCK_INVITE_ITEM_WITH_GAME_COUNT]

        monkeypatch.setattr(
            data_service, "list_league_invites", fake_list_league_invites, raising=True
        )

        session = _make_fake_session()
        session.execute.return_value = _scalar_result(_fake_player())
        _override_session(session)

        try:
            response = client.get(f"/api/leagues/{LEAGUE_ID}/invites", headers=headers)
            assert response.status_code == 200
            body = response.json()
            assert len(body) == 1
            assert body[0]["game_count"] == 5
        finally:
            _clear_overrides()

    def test_game_count_is_none_when_not_provided(self, monkeypatch):
        """game_count is None (omitted or null) when the service does not set it."""
        client, headers = _make_admin_client(monkeypatch)

        async def fake_list_league_invites(session, league_id):
            return [MOCK_INVITE_ITEM]  # no game_count key

        monkeypatch.setattr(
            data_service, "list_league_invites", fake_list_league_invites, raising=True
        )

        session = _make_fake_session()
        session.execute.return_value = _scalar_result(_fake_player())
        _override_session(session)

        try:
            response = client.get(f"/api/leagues/{LEAGUE_ID}/invites", headers=headers)
            assert response.status_code == 200
            body = response.json()
            # game_count may be absent or null — both are acceptable
            assert body[0].get("game_count") is None
        finally:
            _clear_overrides()


# ---------------------------------------------------------------------------
# GET /api/users/me/league-invites/received
# ---------------------------------------------------------------------------


class TestGetMyReceivedLeagueInvites:
    """Tests for GET /api/users/me/league-invites/received."""

    def test_no_token_returns_401_or_403(self):
        """Unauthenticated request is rejected."""
        client = TestClient(app)
        response = client.get("/api/users/me/league-invites/received")
        assert response.status_code in (401, 403)

    def test_returns_received_invites_with_correct_fields_and_game_count(self, monkeypatch):
        """Authenticated user gets 200 with pending received invites including game_count."""
        client, headers = _make_plain_client(monkeypatch)

        invite_with_game_count = {
            **MOCK_INVITE_ITEM_WITH_GAME_COUNT,
            "status": "pending",
        }

        async def fake_list_my_received_invites(session, player_id):
            return [invite_with_game_count]

        monkeypatch.setattr(
            data_service,
            "list_my_received_invites",
            fake_list_my_received_invites,
            raising=True,
        )

        session = _make_fake_session()
        session.execute.side_effect = [_scalar_result(_fake_player())]
        _override_session(session)

        try:
            response = client.get("/api/users/me/league-invites/received", headers=headers)
            assert response.status_code == 200
            body = response.json()
            assert isinstance(body, list)
            assert len(body) == 1
            item = body[0]
            assert item["id"] == 1
            assert item["league_name"] == "QBK Open Men"
            assert item["status"] == "pending"
            assert item["game_count"] == 5
            assert item["display_name"] == "Jake Donovan"
        finally:
            _clear_overrides()

    def test_excludes_invites_sent_to_other_players(self, monkeypatch):
        """Service is called with current player's ID, so other-player invites are excluded.

        The filtering is enforced in the service layer by keying on the current
        player's ID.  This test verifies that the route passes the correct
        player_id to the service and returns exactly what the service returns.
        """
        client, headers = _make_plain_client(monkeypatch)

        received_player_ids: list[int] = []

        async def fake_list_my_received_invites(session, player_id: int):
            received_player_ids.append(player_id)
            # Service filters by player_id; pretend only current player's invites match.
            return []

        monkeypatch.setattr(
            data_service,
            "list_my_received_invites",
            fake_list_my_received_invites,
            raising=True,
        )

        session = _make_fake_session()
        session.execute.side_effect = [_scalar_result(_fake_player(player_id=PLAYER_ID))]
        _override_session(session)

        try:
            response = client.get("/api/users/me/league-invites/received", headers=headers)
            assert response.status_code == 200
            # The route MUST pass the current user's player_id.
            assert received_player_ids == [PLAYER_ID]
        finally:
            _clear_overrides()

    def test_returns_empty_list_when_no_invites(self, monkeypatch):
        """User with no received invites gets empty list."""
        client, headers = _make_plain_client(monkeypatch)

        async def fake_list_my_received_invites(session, player_id):
            return []

        monkeypatch.setattr(
            data_service,
            "list_my_received_invites",
            fake_list_my_received_invites,
            raising=True,
        )

        session = _make_fake_session()
        session.execute.side_effect = [_scalar_result(_fake_player())]
        _override_session(session)

        try:
            response = client.get("/api/users/me/league-invites/received", headers=headers)
            assert response.status_code == 200
            assert response.json() == []
        finally:
            _clear_overrides()

    def test_returns_empty_list_when_no_player_profile(self, monkeypatch):
        """User without a player profile gets empty list (no 404)."""
        client, headers = _make_plain_client(monkeypatch)

        async def fake_list_my_received_invites(session, player_id):
            raise AssertionError("Should not be called when player profile is missing")

        monkeypatch.setattr(
            data_service,
            "list_my_received_invites",
            fake_list_my_received_invites,
            raising=True,
        )

        session = _make_fake_session()
        session.execute.side_effect = [_scalar_result(None)]  # no player
        _override_session(session)

        try:
            response = client.get("/api/users/me/league-invites/received", headers=headers)
            assert response.status_code == 200
            assert response.json() == []
        finally:
            _clear_overrides()


# ---------------------------------------------------------------------------
# POST /api/leagues/{league_id}/invites/respond
# ---------------------------------------------------------------------------


class TestRespondToLeagueInvite:
    """Tests for POST /api/leagues/{league_id}/invites/respond."""

    def test_no_token_returns_401_or_403(self):
        """Unauthenticated request is rejected."""
        client = TestClient(app)
        response = client.post(
            f"/api/leagues/{LEAGUE_ID}/invites/respond",
            json={"action": "accept"},
        )
        assert response.status_code in (401, 403)

    def test_missing_action_returns_422(self, monkeypatch):
        """Request body without action returns 422 validation error."""
        client, headers = _make_plain_client(monkeypatch)

        session = _make_fake_session()
        session.execute.return_value = _scalar_result(_fake_player())
        _override_session(session)

        try:
            response = client.post(
                f"/api/leagues/{LEAGUE_ID}/invites/respond",
                json={},
                headers=headers,
            )
            assert response.status_code == 422
        finally:
            _clear_overrides()

    def test_invalid_action_returns_422(self, monkeypatch):
        """Unknown action value returns 422 validation error."""
        client, headers = _make_plain_client(monkeypatch)

        session = _make_fake_session()
        session.execute.return_value = _scalar_result(_fake_player())
        _override_session(session)

        try:
            response = client.post(
                f"/api/leagues/{LEAGUE_ID}/invites/respond",
                json={"action": "maybe"},
                headers=headers,
            )
            assert response.status_code == 422
        finally:
            _clear_overrides()

    def test_accept_invite_returns_accepted_status(self, monkeypatch):
        """Invitee accepts — service is called and response carries status=accepted."""
        client, headers = _make_plain_client(monkeypatch)

        called_with: list[dict] = []

        async def fake_respond_to_league_invite(session, league_id, player_id, action):
            called_with.append({"league_id": league_id, "player_id": player_id, "action": action})
            return {"status": "accepted"}

        monkeypatch.setattr(
            data_service,
            "respond_to_league_invite",
            fake_respond_to_league_invite,
            raising=True,
        )

        session = _make_fake_session()
        session.execute.return_value = _scalar_result(_fake_player())
        _override_session(session)

        try:
            response = client.post(
                f"/api/leagues/{LEAGUE_ID}/invites/respond",
                json={"action": "accept"},
                headers=headers,
            )
            assert response.status_code == 200
            assert response.json()["status"] == "accepted"
            assert called_with == [
                {"league_id": LEAGUE_ID, "player_id": PLAYER_ID, "action": "accept"}
            ]
        finally:
            _clear_overrides()

    def test_decline_invite_returns_declined_status(self, monkeypatch):
        """Invitee declines — service is called with action=decline."""
        client, headers = _make_plain_client(monkeypatch)

        called_with: list[dict] = []

        async def fake_respond_to_league_invite(session, league_id, player_id, action):
            called_with.append({"action": action})
            return {"status": "declined"}

        monkeypatch.setattr(
            data_service,
            "respond_to_league_invite",
            fake_respond_to_league_invite,
            raising=True,
        )

        session = _make_fake_session()
        session.execute.return_value = _scalar_result(_fake_player())
        _override_session(session)

        try:
            response = client.post(
                f"/api/leagues/{LEAGUE_ID}/invites/respond",
                json={"action": "decline"},
                headers=headers,
            )
            assert response.status_code == 200
            assert response.json()["status"] == "declined"
            assert called_with == [{"action": "decline"}]
        finally:
            _clear_overrides()

    def test_no_pending_invite_returns_404(self, monkeypatch):
        """Service raises ValueError when no pending invite exists — route returns 404."""
        client, headers = _make_plain_client(monkeypatch)

        async def fake_respond_to_league_invite(session, league_id, player_id, action):
            raise ValueError("No pending invite found")

        monkeypatch.setattr(
            data_service,
            "respond_to_league_invite",
            fake_respond_to_league_invite,
            raising=True,
        )

        session = _make_fake_session()
        session.execute.return_value = _scalar_result(_fake_player())
        _override_session(session)

        try:
            response = client.post(
                f"/api/leagues/{LEAGUE_ID}/invites/respond",
                json={"action": "accept"},
                headers=headers,
            )
            assert response.status_code == 404
        finally:
            _clear_overrides()

    def test_no_player_profile_returns_404(self, monkeypatch):
        """User with no player profile gets 404 before service is called."""
        client, headers = _make_plain_client(monkeypatch)

        # Service should never be reached.
        async def fake_respond_to_league_invite(session, league_id, player_id, action):
            raise AssertionError("Should not be called when player profile is missing")

        monkeypatch.setattr(
            data_service,
            "respond_to_league_invite",
            fake_respond_to_league_invite,
            raising=True,
        )

        session = _make_fake_session()
        session.execute.return_value = _scalar_result(None)  # no player
        _override_session(session)

        try:
            response = client.post(
                f"/api/leagues/{LEAGUE_ID}/invites/respond",
                json={"action": "accept"},
                headers=headers,
            )
            assert response.status_code == 404
        finally:
            _clear_overrides()

    def test_only_invitee_can_respond_to_their_invite(self, monkeypatch):
        """A player who has no invite for this league gets 404 (not a different player's 404).

        The service encapsulates the ownership check: it raises ValueError when
        no pending invite exists for (league_id, caller_player_id).  The route
        converts that to 404 — the caller cannot distinguish "invite not found"
        from "that invite belongs to someone else", which is correct.
        """
        client, headers = _make_plain_client(monkeypatch)

        # Simulate different player trying to act on another player's invite.
        other_player = MagicMock()
        other_player.id = 999  # different player
        other_player.user_id = USER_ID

        async def fake_respond_to_league_invite(session, league_id, player_id, action):
            # player_id=999 has no pending invite → ValueError
            raise ValueError("No pending invite found for this player")

        monkeypatch.setattr(
            data_service,
            "respond_to_league_invite",
            fake_respond_to_league_invite,
            raising=True,
        )

        session = _make_fake_session()
        session.execute.return_value = _scalar_result(other_player)
        _override_session(session)

        try:
            response = client.post(
                f"/api/leagues/{LEAGUE_ID}/invites/respond",
                json={"action": "accept"},
                headers=headers,
            )
            assert response.status_code == 404
        finally:
            _clear_overrides()
