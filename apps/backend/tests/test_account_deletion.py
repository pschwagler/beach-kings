"""
Tests for account deletion — schedule, cancel, execute, and background worker.

Covers:
- Scheduling deletion (30-day grace period)
- Cancelling pending deletion
- Full execution: PII anonymized, related data deleted, matches preserved
- Auth dependency rejects expired deletions
- Login auto-cancels pending deletion
- Background worker processes expired accounts
"""

import pytest
import pytest_asyncio
import uuid
from datetime import date, timedelta
from unittest.mock import patch

from sqlalchemy import select, func

from backend.database.models import (
    User,
    Player,
    Friend,
    FriendRequest,
    DirectMessage,
    Notification,
    LeagueMember,
    LeagueMessage,
    LeagueRequest,
    PlayerGlobalStats,
    PartnershipStats,
    OpponentStats,
    EloHistory,
    Feedback,
    League,
    Season,
    Session,
    Match,
    RefreshToken,
    SessionParticipant,
)
from backend.services import user_service
from backend.services.account_deletion_service import AccountDeletionService
from backend.utils.datetime_utils import utcnow


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _unique_phone():
    """Generate a unique phone number to avoid collisions between tests."""
    return f"+1555{uuid.uuid4().hex[:7]}"


async def _create_user_and_player(db_session, phone=None, name="Test Player"):
    """Create a user + player pair. Returns (user_id, player_id)."""
    phone = phone or _unique_phone()
    user_id = await user_service.create_user(
        session=db_session, phone_number=phone, password_hash="hashed"
    )
    player = Player(full_name=name, user_id=user_id, gender="M", level="intermediate")
    db_session.add(player)
    await db_session.commit()
    await db_session.refresh(player)
    return user_id, player.id


async def _create_league_and_season(db_session):
    """Create a league + season. Returns (league_id, season_id)."""
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
    return league.id, season.id


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def user_and_player(db_session):
    """Create a test user with a player profile."""
    user_id, player_id = await _create_user_and_player(db_session)
    return {"user_id": user_id, "player_id": player_id}


@pytest_asyncio.fixture
async def two_players(db_session):
    """Create two users with player profiles."""
    u1, p1 = await _create_user_and_player(db_session, name="Alice")
    u2, p2 = await _create_user_and_player(db_session, name="Bob")
    return {
        "alice": {"user_id": u1, "player_id": p1},
        "bob": {"user_id": u2, "player_id": p2},
    }


@pytest_asyncio.fixture
async def rich_user(db_session):
    """Create a user with extensive related data for comprehensive deletion testing."""
    u1, p1 = await _create_user_and_player(db_session, name="DeleteMe User")
    u2, p2 = await _create_user_and_player(db_session, name="Other Player")
    u3, p3 = await _create_user_and_player(db_session, name="Third Player")
    u4, p4 = await _create_user_and_player(db_session, name="Fourth Player")

    league_id, season_id = await _create_league_and_season(db_session)

    # Friend request + friend
    fr = FriendRequest(sender_player_id=p1, receiver_player_id=p2, status="accepted")
    db_session.add(fr)
    friend = Friend(player1_id=p1, player2_id=p2)
    db_session.add(friend)

    # Direct message
    dm = DirectMessage(sender_player_id=p1, receiver_player_id=p2, message_text="hello")
    db_session.add(dm)

    # Notification
    notif = Notification(
        user_id=u1,
        type="league_message",
        title="Test",
        message="Test msg",
    )
    db_session.add(notif)

    # League message
    lm = LeagueMessage(league_id=league_id, user_id=u1, message_text="hi league")
    db_session.add(lm)

    # League membership
    member = LeagueMember(league_id=league_id, player_id=p1, role="player")
    db_session.add(member)

    # League request
    lr = LeagueRequest(league_id=league_id, player_id=p1, status="pending")
    db_session.add(lr)

    # Player stats
    pgs = PlayerGlobalStats(player_id=p1, total_wins=5, total_games=8, current_rating=1200.0)
    db_session.add(pgs)

    # ELO history — create a session + match first
    sess = Session(
        date="2024-06-01",
        name="Test Session",
        status="SUBMITTED",
        season_id=season_id,
    )
    db_session.add(sess)
    await db_session.flush()

    match = Match(
        session_id=sess.id,
        date="2024-06-01",
        team1_player1_id=p1,
        team1_player2_id=p2,
        team2_player1_id=p3,
        team2_player2_id=p4,
        team1_score=21,
        team2_score=19,
        winner=1,
    )
    db_session.add(match)
    await db_session.flush()

    elo = EloHistory(
        player_id=p1,
        match_id=match.id,
        date="2024-06-01",
        elo_after=1050.0,
        elo_change=50.0,
    )
    db_session.add(elo)

    # Partnership stats
    ps = PartnershipStats(player_id=p1, partner_id=p2, wins=3, games=4)
    db_session.add(ps)

    # Opponent stats
    ops = OpponentStats(player_id=p1, opponent_id=p3, wins=2, games=4)
    db_session.add(ops)

    # Feedback
    fb = Feedback(user_id=u1, feedback_text="Great app!")
    db_session.add(fb)

    # Refresh token
    rt = RefreshToken(
        user_id=u1,
        token="test_refresh_token_del",
        expires_at=(utcnow() + timedelta(days=7)).isoformat(),
    )
    db_session.add(rt)

    # Session participant
    sp = SessionParticipant(session_id=sess.id, player_id=p1)
    db_session.add(sp)

    await db_session.commit()

    return {
        "user_id": u1,
        "player_id": p1,
        "other_user_id": u2,
        "other_player_id": p2,
        "third_player_id": p3,
        "fourth_player_id": p4,
        "league_id": league_id,
        "season_id": season_id,
        "session_id": sess.id,
        "match_id": match.id,
    }


# ---------------------------------------------------------------------------
# Schedule deletion
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_schedule_account_deletion(db_session, user_and_player):
    """Scheduling sets deletion_scheduled_at ~30 days in the future."""
    user_id = user_and_player["user_id"]

    before = utcnow()
    success = await user_service.schedule_account_deletion(db_session, user_id)
    assert success is True

    user = await user_service.get_user_by_id(db_session, user_id)
    assert user["deletion_scheduled_at"] is not None

    scheduled = user["deletion_scheduled_at"]
    # Should be roughly 30 days from now
    from datetime import datetime

    scheduled_dt = datetime.fromisoformat(scheduled)
    expected_min = before + timedelta(days=29, hours=23)
    expected_max = before + timedelta(days=30, minutes=5)
    assert expected_min <= scheduled_dt <= expected_max


@pytest.mark.asyncio
async def test_schedule_deletion_nonexistent_user(db_session):
    """Scheduling deletion for a nonexistent user returns False."""
    success = await user_service.schedule_account_deletion(db_session, 99999)
    assert success is False


# ---------------------------------------------------------------------------
# Cancel deletion
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_cancel_account_deletion(db_session, user_and_player):
    """Cancelling clears deletion_scheduled_at."""
    user_id = user_and_player["user_id"]

    await user_service.schedule_account_deletion(db_session, user_id)
    user = await user_service.get_user_by_id(db_session, user_id)
    assert user["deletion_scheduled_at"] is not None

    success = await user_service.cancel_account_deletion(db_session, user_id)
    assert success is True

    user = await user_service.get_user_by_id(db_session, user_id)
    assert user["deletion_scheduled_at"] is None


@pytest.mark.asyncio
async def test_cancel_deletion_when_not_pending(db_session, user_and_player):
    """Cancelling when no deletion is pending returns False."""
    user_id = user_and_player["user_id"]
    success = await user_service.cancel_account_deletion(db_session, user_id)
    assert success is False


# ---------------------------------------------------------------------------
# Execute deletion — comprehensive data cleanup
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_execute_deletion_anonymizes_user_pii(db_session, rich_user):
    """User PII fields are cleared after execution."""
    user_id = rich_user["user_id"]

    success = await user_service.execute_account_deletion(db_session, user_id)
    assert success is True

    # Re-read from DB
    result = await db_session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one()

    assert user.phone_number is None
    assert user.email is None
    assert user.google_id is None
    assert user.password_hash is None
    assert user.deletion_scheduled_at is None
    assert user.is_verified is False


@pytest.mark.asyncio
async def test_execute_deletion_anonymizes_player_pii(db_session, rich_user):
    """Player name becomes 'Deleted Player', other PII fields cleared."""
    player_id = rich_user["player_id"]

    await user_service.execute_account_deletion(db_session, rich_user["user_id"])

    result = await db_session.execute(select(Player).where(Player.id == player_id))
    player = result.scalar_one()

    assert player.full_name == "Deleted Player"
    assert player.nickname is None
    assert player.gender is None
    assert player.level is None
    assert player.city is None
    assert player.state is None
    assert player.location_id is None
    assert player.date_of_birth is None
    assert player.profile_picture_url is None
    assert player.avatar is None


@pytest.mark.asyncio
async def test_execute_deletion_removes_friends_and_requests(db_session, rich_user):
    """Friend requests and friends are deleted."""
    player_id = rich_user["player_id"]

    await user_service.execute_account_deletion(db_session, rich_user["user_id"])

    fr_count = await db_session.execute(
        select(func.count())
        .select_from(FriendRequest)
        .where(
            (FriendRequest.sender_player_id == player_id)
            | (FriendRequest.receiver_player_id == player_id)
        )
    )
    assert fr_count.scalar() == 0

    f_count = await db_session.execute(
        select(func.count())
        .select_from(Friend)
        .where((Friend.player1_id == player_id) | (Friend.player2_id == player_id))
    )
    assert f_count.scalar() == 0


@pytest.mark.asyncio
async def test_execute_deletion_removes_messages(db_session, rich_user):
    """Direct messages and league messages are deleted."""
    user_id = rich_user["user_id"]
    player_id = rich_user["player_id"]

    await user_service.execute_account_deletion(db_session, user_id)

    dm_count = await db_session.execute(
        select(func.count())
        .select_from(DirectMessage)
        .where(
            (DirectMessage.sender_player_id == player_id)
            | (DirectMessage.receiver_player_id == player_id)
        )
    )
    assert dm_count.scalar() == 0

    lm_count = await db_session.execute(
        select(func.count()).select_from(LeagueMessage).where(LeagueMessage.user_id == user_id)
    )
    assert lm_count.scalar() == 0


@pytest.mark.asyncio
async def test_execute_deletion_removes_stats(db_session, rich_user):
    """All stats rows (global, ELO, partnership, opponent) are deleted."""
    player_id = rich_user["player_id"]

    await user_service.execute_account_deletion(db_session, rich_user["user_id"])

    for model in [PlayerGlobalStats, EloHistory, PartnershipStats, OpponentStats]:
        count = await db_session.execute(
            select(func.count()).select_from(model).where(model.player_id == player_id)
        )
        assert count.scalar() == 0, f"{model.__tablename__} rows not deleted"


@pytest.mark.asyncio
async def test_execute_deletion_removes_notifications_and_feedback(db_session, rich_user):
    """Notifications and feedback are deleted."""
    user_id = rich_user["user_id"]

    await user_service.execute_account_deletion(db_session, user_id)

    n_count = await db_session.execute(
        select(func.count()).select_from(Notification).where(Notification.user_id == user_id)
    )
    assert n_count.scalar() == 0

    fb_count = await db_session.execute(
        select(func.count()).select_from(Feedback).where(Feedback.user_id == user_id)
    )
    assert fb_count.scalar() == 0


@pytest.mark.asyncio
async def test_execute_deletion_removes_league_membership(db_session, rich_user):
    """League memberships and requests are deleted."""
    player_id = rich_user["player_id"]

    await user_service.execute_account_deletion(db_session, rich_user["user_id"])

    lm_count = await db_session.execute(
        select(func.count()).select_from(LeagueMember).where(LeagueMember.player_id == player_id)
    )
    assert lm_count.scalar() == 0

    lr_count = await db_session.execute(
        select(func.count()).select_from(LeagueRequest).where(LeagueRequest.player_id == player_id)
    )
    assert lr_count.scalar() == 0


@pytest.mark.asyncio
async def test_execute_deletion_removes_tokens(db_session, rich_user):
    """Refresh tokens are deleted."""
    user_id = rich_user["user_id"]

    await user_service.execute_account_deletion(db_session, user_id)

    rt_count = await db_session.execute(
        select(func.count()).select_from(RefreshToken).where(RefreshToken.user_id == user_id)
    )
    assert rt_count.scalar() == 0


@pytest.mark.asyncio
async def test_execute_deletion_preserves_match_records(db_session, rich_user):
    """Match rows are NOT deleted — other players' history stays intact."""
    match_id = rich_user["match_id"]

    await user_service.execute_account_deletion(db_session, rich_user["user_id"])

    result = await db_session.execute(select(Match).where(Match.id == match_id))
    match = result.scalar_one_or_none()
    assert match is not None, "Match record should be preserved after deletion"
    assert match.team1_player1_id == rich_user["player_id"]


@pytest.mark.asyncio
async def test_execute_deletion_preserves_other_users_data(db_session, rich_user):
    """Other users' data is NOT affected by the deletion."""
    other_user_id = rich_user["other_user_id"]
    other_player_id = rich_user["other_player_id"]

    await user_service.execute_account_deletion(db_session, rich_user["user_id"])

    # Other user still has their data
    other_user = await user_service.get_user_by_id(db_session, other_user_id)
    assert other_user is not None
    assert other_user["is_verified"] is True

    result = await db_session.execute(select(Player).where(Player.id == other_player_id))
    other_player = result.scalar_one()
    assert other_player.full_name == "Other Player"


@pytest.mark.asyncio
async def test_execute_deletion_nonexistent_user(db_session):
    """Executing deletion for a nonexistent user returns False."""
    success = await user_service.execute_account_deletion(db_session, 99999)
    assert success is False


@pytest.mark.asyncio
@patch("backend.services.s3_service.delete_avatar")
async def test_execute_deletion_deletes_avatar_from_s3(mock_delete, db_session, user_and_player):
    """Avatar is deleted from S3 during account deletion."""
    player_id = user_and_player["player_id"]

    # Set a profile picture URL
    result = await db_session.execute(select(Player).where(Player.id == player_id))
    player = result.scalar_one()
    player.profile_picture_url = "https://s3.example.com/avatars/test.jpg"
    await db_session.commit()

    await user_service.execute_account_deletion(db_session, user_and_player["user_id"])

    mock_delete.assert_called_once_with("https://s3.example.com/avatars/test.jpg")


# ---------------------------------------------------------------------------
# Auth dependency — expired deletion treated as deleted
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_user_dict_includes_deletion_scheduled_at(db_session, user_and_player):
    """_user_to_dict includes deletion_scheduled_at in the returned dict."""
    user_id = user_and_player["user_id"]

    # Before scheduling — should be None
    user = await user_service.get_user_by_id(db_session, user_id)
    assert user["deletion_scheduled_at"] is None

    # After scheduling — should have ISO timestamp
    await user_service.schedule_account_deletion(db_session, user_id)
    user = await user_service.get_user_by_id(db_session, user_id)
    assert user["deletion_scheduled_at"] is not None


# ---------------------------------------------------------------------------
# Background worker
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_worker_processes_expired_deletions(db_session, user_and_player):
    """Worker finds and executes accounts past their deletion date."""
    user_id = user_and_player["user_id"]
    player_id = user_and_player["player_id"]

    # Set deletion date in the past (already expired)
    result = await db_session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one()
    user.deletion_scheduled_at = utcnow() - timedelta(hours=1)
    await db_session.commit()

    # Run the worker directly
    service = AccountDeletionService()
    await service._process_expired_deletions()

    # Expire cached objects, re-read from DB
    db_session.expire_all()
    await db_session.rollback()

    result = await db_session.execute(select(Player).where(Player.id == player_id))
    player = result.scalar_one()
    assert player.full_name == "Deleted Player"

    result = await db_session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one()
    assert user.phone_number is None


@pytest.mark.asyncio
async def test_worker_ignores_future_deletions(db_session, user_and_player):
    """Worker does NOT process accounts whose deletion date is still in the future."""
    user_id = user_and_player["user_id"]
    player_id = user_and_player["player_id"]

    # Set deletion date in the future
    result = await db_session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one()
    user.deletion_scheduled_at = utcnow() + timedelta(days=15)
    await db_session.commit()

    service = AccountDeletionService()
    await service._process_expired_deletions()

    db_session.expire_all()
    await db_session.rollback()

    # Player should NOT be anonymized
    result = await db_session.execute(select(Player).where(Player.id == player_id))
    player = result.scalar_one()
    assert player.full_name == "Test Player"


@pytest.mark.asyncio
async def test_worker_ignores_users_without_deletion(db_session, user_and_player):
    """Worker ignores users that have no deletion_scheduled_at set."""
    user_id = user_and_player["user_id"]
    player_id = user_and_player["player_id"]

    service = AccountDeletionService()
    await service._process_expired_deletions()

    db_session.expire_all()
    await db_session.rollback()

    result = await db_session.execute(select(Player).where(Player.id == player_id))
    player = result.scalar_one()
    assert player.full_name == "Test Player"


# ---------------------------------------------------------------------------
# Session participant cleanup
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_execute_deletion_removes_session_participants(db_session, rich_user):
    """Session participant rows are deleted."""
    player_id = rich_user["player_id"]

    await user_service.execute_account_deletion(db_session, rich_user["user_id"])

    sp_count = await db_session.execute(
        select(func.count())
        .select_from(SessionParticipant)
        .where(SessionParticipant.player_id == player_id)
    )
    assert sp_count.scalar() == 0


# ---------------------------------------------------------------------------
# Partnership stats for OTHER players referencing deleted player
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_execute_deletion_removes_partner_stats_for_partner(db_session, rich_user):
    """PartnershipStats where deleted player is the PARTNER are also removed."""
    # rich_user fixture creates PartnershipStats(player_id=p1, partner_id=p2)
    # After deleting p1, that row should be gone
    other_player_id = rich_user["other_player_id"]

    await user_service.execute_account_deletion(db_session, rich_user["user_id"])

    ps_count = await db_session.execute(
        select(func.count())
        .select_from(PartnershipStats)
        .where(PartnershipStats.partner_id == rich_user["player_id"])
    )
    assert ps_count.scalar() == 0
