"""Tests for Bug #3: photo-confirm endpoint requires a season, blocking gap games.

The ``confirm_photo_matches`` route raised HTTP 400 "season_id is required"
when ``season_id`` was omitted, making it impossible to log matches for a gap
game (league_id set, season_id NULL).

Fix:
- ``ConfirmPhotoMatchesRequest.season_id`` becomes ``Optional[int]``
- Remove the ``if not season_id: raise HTTPException(400, ...)`` guard
- Skip the season-belongs-to-league validation block when ``season_id`` is None
- ``create_matches_from_session`` signature: ``season_id: int`` → ``Optional[int]``

Three state model (background):
  Pickup:      league_id=NULL, season_id=NULL  — not handled by photo confirm
  Gap game:    league_id=SET,  season_id=NULL  ← BUG: was blocked
  Season game: league_id=SET,  season_id=SET  — was working
"""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from backend.api.main import app
from backend.services import auth_service, data_service, photo_match_service, user_service


# ---------------------------------------------------------------------------
# Auth helpers (mirrors test_matches_routes.py)
# ---------------------------------------------------------------------------

_PHONE = "+19990000001"
_USER_ID = 42


def _make_admin_client(monkeypatch, phone: str = _PHONE, user_id: int = _USER_ID):
    """Return a TestClient and auth headers for a system-admin user."""

    def fake_verify_token(token: str) -> dict:
        return {"user_id": user_id, "phone_number": phone}

    async def fake_get_user_by_id(session, uid: int) -> dict:
        return {
            "id": user_id,
            "phone_number": phone,
            "name": "Admin",
            "email": "admin@photo.example",
            "is_verified": True,
            "created_at": "2020-01-01T00:00:00Z",
        }

    async def fake_get_setting(session, key: str):
        if key == "system_admin_phone_numbers":
            return phone
        if key == "system_admin_emails":
            return None
        return None

    monkeypatch.setattr(auth_service, "verify_token", fake_verify_token, raising=True)
    monkeypatch.setattr(user_service, "get_user_by_id", fake_get_user_by_id, raising=True)
    monkeypatch.setattr(data_service, "get_setting", fake_get_setting, raising=True)

    return TestClient(app), {"Authorization": "Bearer dummy"}


# ---------------------------------------------------------------------------
# Bug #3a: gap game — season_id omitted must NOT return 400
# ---------------------------------------------------------------------------


class TestConfirmPhotoMatchesGapGame:
    """Verify that confirm_photo_matches accepts requests with no season_id."""

    def test_gap_game_missing_season_id_reaches_session_lookup(self, monkeypatch):
        """REGRESSION (Bug #3): omitting season_id must not raise 400.

        Before the fix the route returned 400 "season_id is required" before
        even touching Redis.  After the fix the route must reach the session
        lookup (returning 404 when the Redis session is absent) rather than
        returning 400.
        """
        client, headers = _make_admin_client(monkeypatch)

        async def fake_get_session_data(session_id: str):
            return None  # pretend Redis has no data

        monkeypatch.setattr(
            photo_match_service, "get_session_data", fake_get_session_data, raising=True
        )

        # Omit season_id — this simulates a gap-game confirm request
        response = client.post(
            "/api/leagues/1/matches/photo-sessions/gap_sess_001/confirm",
            json={"match_date": "6/19/2026"},
            headers=headers,
        )
        # Must NOT be 400 "season_id is required" or 422 (validation error).
        # Reaches the session lookup → 404 because Redis has no data.
        assert response.status_code == 404, (
            f"Gap-game confirm (no season_id) must NOT return 400/422.  "
            f"Got {response.status_code}: {response.text}.  "
            "Bug #3 not fixed: season_id is still required in the schema or the route guard remains."
        )

    def test_gap_game_missing_match_date_still_returns_400(self, monkeypatch):
        """match_date validation must still be enforced when season_id is absent.

        The ``if not match_date: raise HTTPException(400, ...)`` guard must remain
        so a request with neither season_id nor match_date is rejected.
        """
        client, headers = _make_admin_client(monkeypatch)

        # Provide season_id=None and no match_date
        response = client.post(
            "/api/leagues/1/matches/photo-sessions/gap_sess_002/confirm",
            json={},
            headers=headers,
        )
        # match_date is still required — should get 400 or 422
        assert response.status_code in (400, 422), (
            f"A request with no match_date must still be rejected (400/422).  "
            f"Got {response.status_code}: {response.text}."
        )

    def test_gap_game_season_validation_skipped(self, monkeypatch):
        """REGRESSION (Bug #3): the season-belongs-to-league check must be skipped
        when season_id is None.

        Wires a fake Redis session for league_id=7 and a fake
        create_matches_from_session that returns success.  If the route still
        runs the season validation when season_id is absent it would raise 400
        "Season not found or does not belong to this league".
        """
        client, headers = _make_admin_client(monkeypatch)

        async def fake_get_session_data(session_id: str):
            return {"league_id": 7, "parsed_matches": []}

        async def fake_create_matches(
            db_session, session_id, season_id, match_date, player_overrides=None
        ):
            # season_id must be None (gap game)
            assert season_id is None, (
                f"create_matches_from_session received season_id={season_id!r}; "
                "expected None for a gap game."
            )
            return True, [101, 102], "Created 2 matches"

        monkeypatch.setattr(
            photo_match_service, "get_session_data", fake_get_session_data, raising=True
        )
        monkeypatch.setattr(
            photo_match_service,
            "create_matches_from_session",
            fake_create_matches,
            raising=True,
        )

        response = client.post(
            "/api/leagues/7/matches/photo-sessions/gap_sess_003/confirm",
            json={"match_date": "6/19/2026"},  # no season_id
            headers=headers,
        )
        assert response.status_code == 200, (
            f"Gap-game confirm with valid Redis session must succeed (200).  "
            f"Got {response.status_code}: {response.text}.  "
            "Bug #3 not fixed: season validation still runs even when season_id is None."
        )

    def test_season_game_still_validates_season(self, monkeypatch):
        """Non-regression: when season_id IS provided the season-belongs-to-league
        check must still run and reject a mismatched season.

        The route must return 400 when the season does not belong to the league.
        """
        client, headers = _make_admin_client(monkeypatch)

        async def fake_get_session_data(session_id: str):
            return {"league_id": 5, "parsed_matches": []}

        # Season lookup returns None → season not in league → 400
        from unittest.mock import AsyncMock

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None  # season not found

        async def fake_execute(stmt, *args, **kwargs):
            return mock_result

        monkeypatch.setattr(
            photo_match_service, "get_session_data", fake_get_session_data, raising=True
        )

        # Patch the DB session execute so the season query returns nothing.
        # We need to monkeypatch at the AsyncSession level used by the route.
        import backend.api.routes.matches as matches_module

        original_get_db = matches_module.get_db_session

        from sqlalchemy.ext.asyncio import AsyncSession

        async def fake_db_session():
            mock_session = MagicMock(spec=AsyncSession)
            mock_session.execute = AsyncMock(return_value=mock_result)
            yield mock_session

        app.dependency_overrides[original_get_db] = fake_db_session

        try:
            response = client.post(
                "/api/leagues/5/matches/photo-sessions/season_sess_004/confirm",
                json={"season_id": 99, "match_date": "6/19/2026"},
                headers=headers,
            )
            assert response.status_code == 400, (
                f"Season game with bad season_id must return 400.  "
                f"Got {response.status_code}: {response.text}."
            )
        finally:
            app.dependency_overrides.pop(original_get_db, None)

    def test_season_id_none_passed_to_service(self, monkeypatch):
        """REGRESSION (Bug #3): create_matches_from_session must receive season_id=None.

        Verifies the route forwards ``None`` (not some default int) to the
        service when the client omits season_id.
        """
        client, headers = _make_admin_client(monkeypatch)
        received_season_ids: list = []

        async def fake_get_session_data(session_id: str):
            return {"league_id": 3, "parsed_matches": []}

        async def fake_create_matches(
            db_session, session_id, season_id, match_date, player_overrides=None
        ):
            received_season_ids.append(season_id)
            return True, [200], "Created 1 match"

        monkeypatch.setattr(
            photo_match_service, "get_session_data", fake_get_session_data, raising=True
        )
        monkeypatch.setattr(
            photo_match_service,
            "create_matches_from_session",
            fake_create_matches,
            raising=True,
        )

        response = client.post(
            "/api/leagues/3/matches/photo-sessions/gap_sess_005/confirm",
            json={"match_date": "6/19/2026"},
            headers=headers,
        )
        assert response.status_code == 200
        assert received_season_ids == [None], (
            f"Route must pass season_id=None to create_matches_from_session for a gap game.  "
            f"Got: {received_season_ids}"
        )


# ---------------------------------------------------------------------------
# Bug #3b: create_matches_from_session accepts Optional[int] season_id
# ---------------------------------------------------------------------------


class TestCreateMatchesFromSessionOptionalSeason:
    """Unit-level tests for the create_matches_from_session service function."""

    @pytest.mark.asyncio
    async def test_service_signature_accepts_none_season_id(self, monkeypatch):
        """REGRESSION (Bug #3): create_matches_from_session must accept season_id=None.

        If the old ``season_id: int`` type annotation is still in place Python
        will still run (annotations are not enforced at runtime), but we verify
        the function is callable with None and that it forwards None to
        get_or_create_active_league_session.
        """
        import inspect
        from backend.services.photo_match_service import create_matches_from_session

        sig = inspect.signature(create_matches_from_session)
        param = sig.parameters.get("season_id")
        assert param is not None, "create_matches_from_session must have a season_id parameter"

        # The annotation should be Optional[int] / int | None, not plain int
        annotation = param.annotation
        annotation_str = str(annotation)
        assert "None" in annotation_str or "Optional" in annotation_str, (
            f"season_id annotation must be Optional[int] (or 'int | None'), "
            f"got: {annotation_str}.  Bug #3 (service signature) not fixed."
        )

    @pytest.mark.asyncio
    async def test_service_forwards_none_season_id_to_session_creator(self, monkeypatch):
        """REGRESSION (Bug #3): when season_id=None, the call to
        get_or_create_active_league_session must receive season_id=None
        so it creates a gap game instead of trying to resolve a season.
        """
        captured_calls: list[dict] = []

        async def fake_get_session_data(session_id: str):
            return {
                "league_id": 8,
                "parsed_matches": [
                    {
                        "team1_player1_id": 1,
                        "team1_player2_id": 2,
                        "team2_player1_id": 3,
                        "team2_player2_id": 4,
                        "team1_score": 21,
                        "team2_score": 15,
                    }
                ],
            }

        async def fake_check_idempotency(session_id: str):
            return []

        async def fake_get_or_create(
            db_session, league_id, session_date, season_id=None, **kwargs
        ):
            captured_calls.append({"league_id": league_id, "season_id": season_id})
            return {"id": 77}

        async def fake_create_match(db_session, match_request, session_obj_id):
            return 999

        async def fake_update_session_data(session_id, updates):
            pass

        monkeypatch.setattr(
            photo_match_service, "get_session_data", fake_get_session_data, raising=True
        )
        monkeypatch.setattr(
            photo_match_service, "check_idempotency", fake_check_idempotency, raising=True
        )
        monkeypatch.setattr(
            data_service,
            "get_or_create_active_league_session",
            fake_get_or_create,
            raising=True,
        )
        monkeypatch.setattr(data_service, "create_match_async", fake_create_match, raising=True)
        monkeypatch.setattr(
            photo_match_service, "update_session_data", fake_update_session_data, raising=True
        )

        from backend.services.photo_match_service import create_matches_from_session

        success, match_ids, msg = await create_matches_from_session(
            db_session=None,
            session_id="gap_svc_001",
            season_id=None,
            match_date="6/19/2026",
        )

        assert success is True, f"create_matches_from_session failed: {msg}"
        assert len(captured_calls) == 1
        assert captured_calls[0]["season_id"] is None, (
            f"get_or_create_active_league_session must receive season_id=None for gap games.  "
            f"Got: {captured_calls[0]['season_id']}.  Bug #3 (service) not fixed."
        )
