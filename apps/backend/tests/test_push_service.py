"""
Unit tests for push notification service.

Tests device token CRUD and Expo Push API delivery.
"""

import pytest
import pytest_asyncio
from unittest.mock import AsyncMock, patch, MagicMock

from backend.services import push_service
from backend.services import user_service
from backend.database.models import DeviceToken


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _create_user(db_session, phone: str) -> int:
    """Create a test user and return user_id."""
    user_id = await user_service.create_user(
        session=db_session,
        phone_number=phone,
        password_hash="hashed_password",
    )
    return user_id


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def user_a(db_session) -> int:
    """Create first test user."""
    return await _create_user(db_session, "+15551000001")


@pytest_asyncio.fixture
async def user_b(db_session) -> int:
    """Create second test user."""
    return await _create_user(db_session, "+15551000002")


# ---------------------------------------------------------------------------
# register_token
# ---------------------------------------------------------------------------


class TestRegisterToken:
    """Tests for push_service.register_token."""

    @pytest.mark.asyncio
    async def test_register_new_token(self, db_session, user_a):
        """Registering a new token creates a DeviceToken row."""
        token = "ExponentPushToken[abc123]"
        result = await push_service.register_token(db_session, user_a, token, "ios")

        assert result.token == token
        assert result.user_id == user_a
        assert result.platform == "ios"
        assert result.id is not None

    @pytest.mark.asyncio
    async def test_register_duplicate_token_same_user(self, db_session, user_a):
        """Re-registering the same token for the same user is idempotent."""
        token = "ExponentPushToken[dup111]"
        first = await push_service.register_token(db_session, user_a, token, "ios")
        second = await push_service.register_token(db_session, user_a, token, "ios")

        assert first.id == second.id
        assert second.user_id == user_a

    @pytest.mark.asyncio
    async def test_register_transfers_ownership(self, db_session, user_a, user_b):
        """Re-registering an existing token under a new user transfers ownership."""
        token = "ExponentPushToken[shared999]"
        await push_service.register_token(db_session, user_a, token, "ios")
        result = await push_service.register_token(db_session, user_b, token, "android")

        assert result.user_id == user_b
        assert result.platform == "android"

        # user_a should no longer own any tokens
        tokens_a = await push_service.get_tokens_for_user(db_session, user_a)
        assert len(tokens_a) == 0

    @pytest.mark.asyncio
    async def test_register_multiple_tokens_per_user(self, db_session, user_a):
        """A user can have multiple device tokens (phone + tablet)."""
        t1 = "ExponentPushToken[device1]"
        t2 = "ExponentPushToken[device2]"
        await push_service.register_token(db_session, user_a, t1, "ios")
        await push_service.register_token(db_session, user_a, t2, "android")

        tokens = await push_service.get_tokens_for_user(db_session, user_a)
        assert len(tokens) == 2
        token_strings = {t.token for t in tokens}
        assert t1 in token_strings
        assert t2 in token_strings


# ---------------------------------------------------------------------------
# unregister_token
# ---------------------------------------------------------------------------


class TestUnregisterToken:
    """Tests for push_service.unregister_token."""

    @pytest.mark.asyncio
    async def test_unregister_own_token(self, db_session, user_a):
        """Unregistering a token the user owns returns True."""
        token = "ExponentPushToken[remove_me]"
        await push_service.register_token(db_session, user_a, token, "ios")

        deleted = await push_service.unregister_token(db_session, user_a, token)
        assert deleted is True

        tokens = await push_service.get_tokens_for_user(db_session, user_a)
        assert len(tokens) == 0

    @pytest.mark.asyncio
    async def test_unregister_nonexistent_token(self, db_session, user_a):
        """Unregistering a token that doesn't exist returns False."""
        deleted = await push_service.unregister_token(
            db_session, user_a, "ExponentPushToken[nope]"
        )
        assert deleted is False

    @pytest.mark.asyncio
    async def test_unregister_other_users_token(self, db_session, user_a, user_b):
        """Cannot unregister a token that belongs to another user."""
        token = "ExponentPushToken[not_yours]"
        await push_service.register_token(db_session, user_a, token, "ios")

        deleted = await push_service.unregister_token(db_session, user_b, token)
        assert deleted is False

        # Token still exists for user_a
        tokens = await push_service.get_tokens_for_user(db_session, user_a)
        assert len(tokens) == 1


# ---------------------------------------------------------------------------
# unregister_all_tokens
# ---------------------------------------------------------------------------


class TestUnregisterAllTokens:
    """Tests for push_service.unregister_all_tokens."""

    @pytest.mark.asyncio
    async def test_unregister_all(self, db_session, user_a):
        """Removes all tokens for a user and returns the count."""
        await push_service.register_token(db_session, user_a, "ExponentPushToken[a1]", "ios")
        await push_service.register_token(db_session, user_a, "ExponentPushToken[a2]", "android")

        count = await push_service.unregister_all_tokens(db_session, user_a)
        assert count == 2

        tokens = await push_service.get_tokens_for_user(db_session, user_a)
        assert len(tokens) == 0

    @pytest.mark.asyncio
    async def test_unregister_all_no_tokens(self, db_session, user_a):
        """Returns 0 when user has no tokens."""
        count = await push_service.unregister_all_tokens(db_session, user_a)
        assert count == 0


# ---------------------------------------------------------------------------
# get_tokens_for_user
# ---------------------------------------------------------------------------


class TestGetTokensForUser:
    """Tests for push_service.get_tokens_for_user."""

    @pytest.mark.asyncio
    async def test_empty_when_no_tokens(self, db_session, user_a):
        """Returns empty list when user has no registered tokens."""
        tokens = await push_service.get_tokens_for_user(db_session, user_a)
        assert tokens == []

    @pytest.mark.asyncio
    async def test_returns_only_users_tokens(self, db_session, user_a, user_b):
        """Only returns tokens belonging to the specified user."""
        await push_service.register_token(db_session, user_a, "ExponentPushToken[a_tok]", "ios")
        await push_service.register_token(db_session, user_b, "ExponentPushToken[b_tok]", "android")

        tokens_a = await push_service.get_tokens_for_user(db_session, user_a)
        assert len(tokens_a) == 1
        assert tokens_a[0].token == "ExponentPushToken[a_tok]"


# ---------------------------------------------------------------------------
# send_push_notifications (Expo API)
# ---------------------------------------------------------------------------


class TestSendPushNotifications:
    """Tests for push_service.send_push_notifications (HTTP to Expo)."""

    @pytest.mark.asyncio
    async def test_sends_to_expo_api(self):
        """Sends messages to Expo Push API and handles 200 response."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "data": [{"status": "ok", "id": "xxx"}]
        }

        with patch("httpx.AsyncClient") as MockClient:
            mock_client = AsyncMock()
            mock_client.post.return_value = mock_response
            MockClient.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=False)

            await push_service.send_push_notifications(
                tokens=["ExponentPushToken[abc]"],
                title="Test",
                body="Hello",
                data={"key": "value"},
            )

            mock_client.post.assert_called_once()
            call_args = mock_client.post.call_args
            assert call_args[0][0] == push_service.EXPO_PUSH_URL
            payload = call_args[1]["json"]
            assert len(payload) == 1
            assert payload[0]["to"] == "ExponentPushToken[abc]"
            assert payload[0]["title"] == "Test"
            assert payload[0]["body"] == "Hello"
            assert payload[0]["data"] == {"key": "value"}

    @pytest.mark.asyncio
    async def test_skips_when_no_tokens(self):
        """Does not call Expo API when token list is empty."""
        with patch("httpx.AsyncClient") as MockClient:
            await push_service.send_push_notifications([], "Title", "Body")
            MockClient.assert_not_called()

    @pytest.mark.asyncio
    async def test_handles_expo_api_error(self):
        """Logs but does not raise on Expo API non-200 response."""
        mock_response = MagicMock()
        mock_response.status_code = 500
        mock_response.text = "Internal Server Error"

        with patch("httpx.AsyncClient") as MockClient:
            mock_client = AsyncMock()
            mock_client.post.return_value = mock_response
            MockClient.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=False)

            # Should not raise
            await push_service.send_push_notifications(
                ["ExponentPushToken[abc]"], "Title", "Body"
            )

    @pytest.mark.asyncio
    async def test_handles_network_error(self):
        """Logs but does not raise on network failure."""
        with patch("httpx.AsyncClient") as MockClient:
            mock_client = AsyncMock()
            mock_client.post.side_effect = Exception("Connection refused")
            MockClient.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=False)

            # Should not raise
            await push_service.send_push_notifications(
                ["ExponentPushToken[abc]"], "Title", "Body"
            )

    @pytest.mark.asyncio
    async def test_omits_data_when_none(self):
        """Message payload excludes 'data' key when data is None."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"data": [{"status": "ok"}]}

        with patch("httpx.AsyncClient") as MockClient:
            mock_client = AsyncMock()
            mock_client.post.return_value = mock_response
            MockClient.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=False)

            await push_service.send_push_notifications(
                ["ExponentPushToken[abc]"], "Title", "Body", data=None
            )

            payload = mock_client.post.call_args[1]["json"]
            assert "data" not in payload[0]


# ---------------------------------------------------------------------------
# send_push_to_user
# ---------------------------------------------------------------------------


class TestSendPushToUser:
    """Tests for push_service.send_push_to_user (convenience wrapper)."""

    @pytest.mark.asyncio
    async def test_sends_to_all_user_devices(self, db_session, user_a):
        """Looks up user tokens and sends push to each."""
        await push_service.register_token(db_session, user_a, "ExponentPushToken[d1]", "ios")
        await push_service.register_token(db_session, user_a, "ExponentPushToken[d2]", "android")

        with patch.object(push_service, "send_push_notifications", new_callable=AsyncMock) as mock_send:
            await push_service.send_push_to_user(
                db_session, user_a, "Title", "Body", data={"x": 1}
            )
            mock_send.assert_called_once()
            tokens_arg = mock_send.call_args[0][0]
            assert set(tokens_arg) == {"ExponentPushToken[d1]", "ExponentPushToken[d2]"}

    @pytest.mark.asyncio
    async def test_skips_when_no_tokens_registered(self, db_session, user_a):
        """Does nothing when user has no device tokens."""
        with patch.object(push_service, "send_push_notifications", new_callable=AsyncMock) as mock_send:
            await push_service.send_push_to_user(db_session, user_a, "Title", "Body")
            mock_send.assert_not_called()
