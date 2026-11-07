"""Full-session capability mirrors the existing metadata-write policy."""

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from backend.api.routes import sessions
from backend.models.schemas.sessions import SessionRosterDetailResponse


@pytest.mark.parametrize("status", ["ACTIVE", "SUBMITTED", "EDITED"])
@pytest.mark.parametrize(
    "league_id,system_admin,league_member,league_admin,pickup_collaborator,expected",
    [
        (5, False, True, True, False, True),
        (5, False, True, False, False, False),
        (5, True, False, False, False, True),
        (None, True, False, False, False, True),
        (None, False, False, False, True, True),
        (5, False, False, False, False, None),
        (None, False, False, False, False, None),
    ],
    ids=[
        "league-admin",
        "league-member-readonly",
        "league-system-admin",
        "pickup-system-admin",
        "pickup-noncreator-collaborator",
        "league-outsider-hidden",
        "pickup-outsider-hidden",
    ],
)
async def test_full_detail_capability_preserves_write_policy(
    monkeypatch,
    status,
    league_id,
    system_admin,
    league_member,
    league_admin,
    pickup_collaborator,
    expected,
):
    session_obj = {
        "id": 42,
        "code": "TEST42",
        "name": "11/7/2026 Session #2",
        "status": status,
        "league_id": league_id,
        "season_id": None,
        # The pickup collaborator is deliberately not the session creator.
        "created_by": 999,
    }
    monkeypatch.setattr(sessions, "_is_system_admin", AsyncMock(return_value=system_admin))
    monkeypatch.setattr(sessions, "_has_league_role", AsyncMock(return_value=league_member))
    monkeypatch.setattr(
        sessions, "is_user_admin_of_session_league", AsyncMock(return_value=league_admin)
    )
    monkeypatch.setattr(
        sessions.data_service,
        "can_user_add_match_to_session",
        AsyncMock(return_value=pickup_collaborator),
    )
    monkeypatch.setattr(sessions.data_service, "get_session", AsyncMock(return_value=session_obj))
    monkeypatch.setattr(
        sessions.data_service, "get_session_roster_with_game_counts", AsyncMock(return_value=[])
    )
    monkeypatch.setattr(sessions.data_service, "get_session_matches", AsyncMock(return_value=[]))
    monkeypatch.setattr(
        sessions.data_service, "get_player_by_user_id", AsyncMock(return_value=None)
    )
    metadata = SimpleNamespace(
        session_type="league" if league_id is not None else "pickup",
        court_id=None,
        court_name=None,
        date="2026-11-07",
        start_time=None,
        is_ranked=True,
    )
    result = SimpleNamespace(
        one_or_none=lambda: metadata,
        scalar_one_or_none=lambda: "Test league",
    )
    db = SimpleNamespace(execute=AsyncMock(return_value=result))
    user = {"id": 7}

    if expected is None:
        with pytest.raises(HTTPException) as error:
            await sessions.get_session_detail(42, current_user=user, session=db)
        assert error.value.status_code == 404
        db.execute.assert_not_awaited()
        return

    payload = await sessions.get_session_detail(42, current_user=user, session=db)
    serialized = SessionRosterDetailResponse.model_validate(payload).model_dump()

    assert serialized["can_edit_metadata"] is expected
    assert serialized["status"] == status
    assert serialized["session_number"] == 2
    assert serialized["date"] == "2026-11-07"


@pytest.mark.parametrize("status", [403, 500])
async def test_capability_does_not_hide_unexpected_authorization_errors(monkeypatch, status):
    error = HTTPException(status_code=status, detail="Unexpected permission service failure")
    monkeypatch.setattr(sessions, "require_session_metadata_editor", AsyncMock(side_effect=error))

    with pytest.raises(HTTPException) as raised:
        await sessions._can_edit_session_metadata(object(), {"id": 42}, {"id": 7})

    assert raised.value is error


async def test_capability_does_not_hide_internal_failures(monkeypatch):
    monkeypatch.setattr(
        sessions,
        "require_session_metadata_editor",
        AsyncMock(side_effect=RuntimeError("Permission service unavailable")),
    )

    with pytest.raises(RuntimeError, match="Permission service unavailable"):
        await sessions._can_edit_session_metadata(object(), {"id": 42}, {"id": 7})


def test_older_response_payload_defaults_metadata_capability_to_readonly():
    payload = SessionRosterDetailResponse(id=42, status="ACTIVE", players=[])
    assert payload.can_edit_metadata is False
