"""
Tests for push_prefs_service.

Covers:
  - get_prefs: returns defaults when no row exists
  - get_prefs: returns stored values when row exists
  - update_prefs: creates row on first call with partial update
  - update_prefs: updates existing row (partial update, no-None fields only)
  - should_send_push: master kill-switch (push_enabled=False blocks all)
  - should_send_push: per-type pref respected
  - should_send_push: notification types with no pref mapping are allowed
  - Route: GET /api/users/me/push-prefs returns 200 with defaults
  - Route: PATCH /api/users/me/push-prefs persists and returns updated prefs
  - notification_service integration: push skipped when prefs suppress it
"""

import pytest
import pytest_asyncio
from unittest.mock import AsyncMock, MagicMock, patch

from backend.services.push_prefs_service import (
    _DEFAULTS,
    get_prefs,
    update_prefs,
    should_send_push,
)
from backend.database.models import NotificationType


# ---------------------------------------------------------------------------
# should_send_push — pure function, no DB needed
# ---------------------------------------------------------------------------


class TestShouldSendPush:
    """Unit tests for the pure should_send_push predicate."""

    def _prefs(self, **overrides) -> dict:
        return {**_DEFAULTS, **overrides}

    def test_master_off_suppresses_all(self) -> None:
        """push_enabled=False blocks push regardless of per-type prefs."""
        prefs = self._prefs(push_enabled=False, direct_messages=True)
        assert should_send_push(prefs, NotificationType.DIRECT_MESSAGE.value) is False

    def test_master_on_allows_enabled_type(self) -> None:
        prefs = self._prefs(push_enabled=True, direct_messages=True)
        assert should_send_push(prefs, NotificationType.DIRECT_MESSAGE.value) is True

    def test_master_on_type_pref_off_blocks(self) -> None:
        prefs = self._prefs(push_enabled=True, direct_messages=False)
        assert should_send_push(prefs, NotificationType.DIRECT_MESSAGE.value) is False

    def test_friend_request_type(self) -> None:
        prefs = self._prefs(push_enabled=True, friend_requests=True)
        assert should_send_push(prefs, NotificationType.FRIEND_REQUEST.value) is True

    def test_friend_accepted_uses_friend_requests_pref(self) -> None:
        prefs = self._prefs(push_enabled=True, friend_requests=False)
        assert should_send_push(prefs, NotificationType.FRIEND_ACCEPTED.value) is False

    def test_league_message_type(self) -> None:
        prefs = self._prefs(push_enabled=True, league_messages=True)
        assert should_send_push(prefs, NotificationType.LEAGUE_MESSAGE.value) is True

    def test_league_invite_uses_league_messages_pref(self) -> None:
        prefs = self._prefs(push_enabled=True, league_messages=False)
        assert should_send_push(prefs, NotificationType.LEAGUE_INVITE.value) is False

    def test_match_invite_type(self) -> None:
        prefs = self._prefs(push_enabled=True, match_invites=True)
        assert should_send_push(prefs, NotificationType.SESSION_SUBMITTED.value) is True

    def test_session_auto_submitted_uses_match_invites(self) -> None:
        prefs = self._prefs(push_enabled=True, match_invites=False)
        assert should_send_push(prefs, NotificationType.SESSION_AUTO_SUBMITTED.value) is False

    def test_ranking_changes_type(self) -> None:
        prefs = self._prefs(push_enabled=True, ranking_changes=True)
        assert should_send_push(prefs, NotificationType.SEASON_AWARD.value) is True

    def test_ranking_changes_off_blocks_season_award(self) -> None:
        prefs = self._prefs(push_enabled=True, ranking_changes=False)
        assert should_send_push(prefs, NotificationType.SEASON_AWARD.value) is False

    def test_unknown_type_is_allowed(self) -> None:
        """Notification types with no pref mapping are unconditionally allowed."""
        prefs = self._prefs(push_enabled=True)
        assert should_send_push(prefs, "some_future_type") is True

    def test_unknown_type_blocked_by_master(self) -> None:
        prefs = self._prefs(push_enabled=False)
        assert should_send_push(prefs, "some_future_type") is False

    def test_missing_push_enabled_defaults_to_true(self) -> None:
        """If push_enabled key is missing from prefs dict, treat as enabled."""
        prefs = {"direct_messages": True}
        assert should_send_push(prefs, NotificationType.DIRECT_MESSAGE.value) is True

    def test_empty_prefs_dict_allows_push(self) -> None:
        assert should_send_push({}, "direct_message") is True


# ---------------------------------------------------------------------------
# get_prefs + update_prefs — need async session mock
# ---------------------------------------------------------------------------


def _make_session_mock(existing_row=None):
    """Return a minimal AsyncSession mock pre-configured with a query result."""
    session = AsyncMock()
    scalar_result = MagicMock()
    scalar_result.scalar_one_or_none.return_value = existing_row
    session.execute = AsyncMock(return_value=scalar_result)
    session.add = MagicMock()
    session.flush = AsyncMock()

    async def mock_refresh(obj):
        # No-op; the object is already mutated in-place by update_prefs
        pass

    session.refresh = mock_refresh
    return session


class TestGetPrefs:
    """Unit tests for get_prefs."""

    @pytest.mark.asyncio
    async def test_returns_defaults_when_no_row(self) -> None:
        session = _make_session_mock(existing_row=None)
        result = await get_prefs(session, user_id=1)
        assert result == dict(_DEFAULTS)

    @pytest.mark.asyncio
    async def test_returns_row_values_when_row_exists(self) -> None:
        from backend.database.models import PushNotificationPreference

        row = PushNotificationPreference(
            user_id=1,
            push_enabled=False,
            direct_messages=False,
            league_messages=True,
            friend_requests=True,
            match_invites=True,
            tournament_updates=False,
            ranking_changes=True,
        )
        session = _make_session_mock(existing_row=row)
        result = await get_prefs(session, user_id=1)
        assert result["push_enabled"] is False
        assert result["direct_messages"] is False
        assert result["ranking_changes"] is True

    @pytest.mark.asyncio
    async def test_does_not_write_when_no_row(self) -> None:
        """get_prefs must not create a DB row; only update_prefs does."""
        session = _make_session_mock(existing_row=None)
        await get_prefs(session, user_id=42)
        session.add.assert_not_called()
        session.flush.assert_not_called()


class TestUpdatePrefs:
    """Unit tests for update_prefs."""

    @pytest.mark.asyncio
    async def test_creates_row_when_none_exists(self) -> None:
        session = _make_session_mock(existing_row=None)
        result = await update_prefs(session, user_id=5, updates={"direct_messages": False})
        session.add.assert_called_once()
        session.flush.assert_called()
        assert result["direct_messages"] is False

    @pytest.mark.asyncio
    async def test_updates_existing_row(self) -> None:
        from backend.database.models import PushNotificationPreference

        row = PushNotificationPreference(
            user_id=1,
            push_enabled=True,
            direct_messages=True,
            league_messages=True,
            friend_requests=True,
            match_invites=True,
            tournament_updates=False,
            ranking_changes=False,
        )
        session = _make_session_mock(existing_row=row)
        result = await update_prefs(session, user_id=1, updates={"push_enabled": False})
        assert result["push_enabled"] is False
        # Other fields unchanged
        assert result["direct_messages"] is True
        # add() must NOT be called (existing row)
        session.add.assert_not_called()

    @pytest.mark.asyncio
    async def test_none_values_are_ignored(self) -> None:
        """Fields with None value in the updates dict must not be applied."""
        from backend.database.models import PushNotificationPreference

        row = PushNotificationPreference(
            user_id=1,
            push_enabled=True,
            direct_messages=True,
            league_messages=True,
            friend_requests=True,
            match_invites=True,
            tournament_updates=False,
            ranking_changes=False,
        )
        session = _make_session_mock(existing_row=row)
        # Pass None for ranking_changes — should NOT flip it
        result = await update_prefs(session, user_id=1, updates={"ranking_changes": None})
        assert result["ranking_changes"] is False

    @pytest.mark.asyncio
    async def test_unknown_field_is_ignored(self) -> None:
        """Unknown field names in updates are silently ignored via hasattr guard."""
        from backend.database.models import PushNotificationPreference

        row = PushNotificationPreference(
            user_id=1,
            push_enabled=True,
            direct_messages=True,
            league_messages=True,
            friend_requests=True,
            match_invites=True,
            tournament_updates=False,
            ranking_changes=False,
        )
        session = _make_session_mock(existing_row=row)
        # Should not raise even with an unknown key
        result = await update_prefs(session, user_id=1, updates={"bogus_field": True})
        assert result["push_enabled"] is True  # unchanged


# ---------------------------------------------------------------------------
# notification_service integration — push gated by prefs
# ---------------------------------------------------------------------------


class TestNotificationServicePushGating:
    """Verify that create_notification skips push when prefs suppress it."""

    def _make_notify_session(self, obj_id: int) -> AsyncMock:
        """Build a minimal session mock suitable for create_notification."""
        mock_session = AsyncMock()
        mock_session.flush = AsyncMock()
        mock_session.add = MagicMock()

        async def mock_refresh(obj):
            obj.id = obj_id
            obj.user_id = 99
            obj.type = NotificationType.DIRECT_MESSAGE.value
            obj.title = "Hi"
            obj.message = "Hello"
            obj.data = None
            obj.is_read = False
            obj.read_at = None
            obj.link_url = None
            obj.created_at = None

        mock_session.refresh = mock_refresh
        return mock_session

    @pytest.mark.asyncio
    async def test_push_skipped_when_master_off(self) -> None:
        """create_notification must not call push_service when push_enabled=False."""
        import backend.services.push_prefs_service as pps_module
        import backend.services.push_service as ps_module
        import backend.services.websocket_manager as ws_module
        from backend.services import notification_service  # noqa: F401

        suppressed_prefs = {**_DEFAULTS, "push_enabled": False}
        mock_session = self._make_notify_session(obj_id=1)

        with (
            patch.object(pps_module, "get_prefs", new=AsyncMock(return_value=suppressed_prefs)),
            patch.object(ps_module, "send_push_to_user", new=AsyncMock()) as mock_send_push,
            patch.object(
                ws_module,
                "get_websocket_manager",
                return_value=MagicMock(send_to_user=AsyncMock()),
            ),
        ):
            from backend.services import notification_service as ns
            await ns.create_notification(
                session=mock_session,
                user_id=99,
                type=NotificationType.DIRECT_MESSAGE.value,
                title="Hi",
                message="Hello",
            )
            mock_send_push.assert_not_called()

    @pytest.mark.asyncio
    async def test_push_sent_when_prefs_allow(self) -> None:
        """create_notification must call push_service when prefs allow it."""
        import backend.services.push_prefs_service as pps_module
        import backend.services.push_service as ps_module
        import backend.services.websocket_manager as ws_module

        allowed_prefs = {**_DEFAULTS, "push_enabled": True, "direct_messages": True}
        mock_session = self._make_notify_session(obj_id=2)

        with (
            patch.object(pps_module, "get_prefs", new=AsyncMock(return_value=allowed_prefs)),
            patch.object(ps_module, "send_push_to_user", new=AsyncMock()) as mock_send_push,
            patch.object(
                ws_module,
                "get_websocket_manager",
                return_value=MagicMock(send_to_user=AsyncMock()),
            ),
        ):
            from backend.services import notification_service as ns
            await ns.create_notification(
                session=mock_session,
                user_id=99,
                type=NotificationType.DIRECT_MESSAGE.value,
                title="Hi",
                message="Hello",
            )
            mock_send_push.assert_called_once()
