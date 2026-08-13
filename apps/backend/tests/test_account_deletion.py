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

import asyncio

import pytest
import pytest_asyncio
import uuid
from datetime import date, timedelta
from unittest.mock import MagicMock, patch

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
    MediaDeletionJob,
    Location,
    Court,
    CourtReview,
    CourtReviewPhoto,
    CourtPhoto,
)
from backend.services import auth_service, moderation_service, user_service
from backend.services.auth.account_deletion_service import AccountDeletionService
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

    # Reviews and both photo types are UGC that permanent deletion must remove.
    location = Location(id=f"delete_{uuid.uuid4().hex[:12]}", name="Deletion Test Location")
    db_session.add(location)
    await db_session.flush()
    court = Court(name="Deletion Test Court", location_id=location.id)
    db_session.add(court)
    await db_session.flush()
    review = CourtReview(court_id=court.id, player_id=p1, rating=5, review_text="Delete me")
    db_session.add(review)
    await db_session.flush()
    review_photo = CourtReviewPhoto(
        review_id=review.id,
        s3_key=f"court-reviews/{p1}/review.jpg",
        url="https://example.invalid/review.jpg",
    )
    standalone_photo = CourtPhoto(
        court_id=court.id,
        uploaded_by=p1,
        s3_key=f"court-photos/{p1}/standalone.jpg",
        url="https://example.invalid/standalone.jpg",
    )
    db_session.add_all([review_photo, standalone_photo])

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
        "review_id": review.id,
        "review_photo_id": review_photo.id,
        "standalone_photo_id": standalone_photo.id,
        "direct_message_id": dm.id,
        "league_message_id": lm.id,
        "court_id": court.id,
        "location_id": location.id,
        "review_photo_key": review_photo.s3_key,
        "standalone_photo_key": standalone_photo.s3_key,
    }


async def _attach_player(db_session, user_id, name):
    """Attach the ordinary player profile created by each signup flow."""
    player = Player(full_name=name, user_id=user_id, gender="M", level="intermediate")
    db_session.add(player)
    await db_session.commit()
    await db_session.refresh(player)
    return player.id


# ---------------------------------------------------------------------------
# Full signup -> deletion -> re-registration lifecycles
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_password_account_can_register_again_after_permanent_deletion(db_session):
    """Permanent deletion releases both password-account login identifiers."""
    phone = _unique_phone()
    email = f"password-{uuid.uuid4().hex}@example.test"

    first_user_id = await user_service.create_user(
        db_session,
        phone_number=phone,
        email=email,
        password_hash="first-password-hash",
    )
    first_player_id = await _attach_player(db_session, first_user_id, "Password User")

    assert await user_service.execute_account_deletion(db_session, first_user_id) is True

    second_user_id = await user_service.create_user(
        db_session,
        phone_number=phone,
        email=email,
        password_hash="second-password-hash",
    )
    second_player_id = await _attach_player(db_session, second_user_id, "Password User Again")

    assert second_user_id != first_user_id
    assert second_player_id != first_player_id
    assert (await user_service.get_user_by_phone(db_session, phone))["id"] == second_user_id
    assert (await user_service.get_user_by_email(db_session, email))["id"] == second_user_id
    deleted_user = await user_service.get_user_by_id(db_session, first_user_id)
    assert deleted_user["deleted_at"] is not None
    assert deleted_user["phone_number"] is None
    assert deleted_user["email"] is None


@pytest.mark.asyncio
async def test_google_account_can_register_again_after_permanent_deletion(db_session, monkeypatch):
    """A mocked Google identity can create a fresh account after deletion."""
    google_id = f"google-{uuid.uuid4().hex}"
    email = f"google-{uuid.uuid4().hex}@example.test"
    provider = MagicMock(return_value={"sub": google_id, "email": email, "name": "Google User"})
    monkeypatch.setattr(auth_service, "verify_google_id_token", provider, raising=True)

    first_identity = auth_service.verify_google_id_token("first-google-id-token")
    first_user_id = await user_service.create_google_user(
        db_session,
        email=first_identity["email"],
        google_id=first_identity["sub"],
        full_name=first_identity["name"],
    )
    first_player_id = await _attach_player(db_session, first_user_id, first_identity["name"])

    assert await user_service.execute_account_deletion(db_session, first_user_id) is True

    second_identity = auth_service.verify_google_id_token("second-google-id-token")
    second_user_id = await user_service.create_google_user(
        db_session,
        email=second_identity["email"],
        google_id=second_identity["sub"],
        full_name=second_identity["name"],
    )
    second_player_id = await _attach_player(db_session, second_user_id, second_identity["name"])

    assert second_user_id != first_user_id
    assert second_player_id != first_player_id
    assert (await user_service.get_user_by_google_id(db_session, google_id))[
        "id"
    ] == second_user_id
    assert (await user_service.get_user_by_email(db_session, email))["id"] == second_user_id
    deleted_user = await user_service.get_user_by_id(db_session, first_user_id)
    assert deleted_user["deleted_at"] is not None
    assert deleted_user["google_id"] is None
    assert deleted_user["email"] is None
    assert provider.call_count == 2


@pytest.mark.asyncio
async def test_apple_account_can_register_again_after_permanent_deletion(db_session, monkeypatch):
    """A mocked Apple identity can create a fresh account after deletion."""
    apple_id = f"apple-{uuid.uuid4().hex}"
    email = f"apple-{uuid.uuid4().hex}@privaterelay.appleid.com"
    provider = MagicMock(return_value={"sub": apple_id, "email": email})
    monkeypatch.setattr(auth_service, "verify_apple_id_token", provider, raising=True)

    first_identity = auth_service.verify_apple_id_token("first-apple-id-token")
    first_user_id = await user_service.create_apple_user(
        db_session,
        email=first_identity["email"],
        apple_id=first_identity["sub"],
        full_name="Apple User",
    )
    first_player_id = await _attach_player(db_session, first_user_id, "Apple User")

    assert await user_service.execute_account_deletion(db_session, first_user_id) is True

    second_identity = auth_service.verify_apple_id_token("second-apple-id-token")
    second_user_id = await user_service.create_apple_user(
        db_session,
        email=second_identity["email"],
        apple_id=second_identity["sub"],
        full_name="Apple User Again",
    )
    second_player_id = await _attach_player(db_session, second_user_id, "Apple User Again")

    assert second_user_id != first_user_id
    assert second_player_id != first_player_id
    assert (await user_service.get_user_by_apple_id(db_session, apple_id))["id"] == second_user_id
    assert (await user_service.get_user_by_email(db_session, email))["id"] == second_user_id
    deleted_user = await user_service.get_user_by_id(db_session, first_user_id)
    assert deleted_user["deleted_at"] is not None
    assert deleted_user["apple_id"] is None
    assert deleted_user["email"] is None
    assert provider.call_count == 2


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

    result = await db_session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one()
    user.google_id = f"google-{uuid.uuid4().hex}"
    user.apple_id = f"apple-{uuid.uuid4().hex}"
    await db_session.commit()

    success = await user_service.execute_account_deletion(db_session, user_id)
    assert success is True

    # Re-read from DB
    result = await db_session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one()

    assert user.phone_number is None
    assert user.email is None
    assert user.google_id is None
    assert user.apple_id is None
    assert user.password_hash is None
    assert user.deletion_scheduled_at is None
    assert user.deleted_at is not None
    assert user.is_verified is False


@pytest.mark.asyncio
async def test_execute_deletion_anonymizes_player_pii(db_session, rich_user):
    """Player name becomes 'Deleted Player', other PII fields cleared."""
    player_id = rich_user["player_id"]

    result = await db_session.execute(select(Player).where(Player.id == player_id))
    player = result.scalar_one()
    player.first_name = "Delete"
    player.last_name = "Me"
    player.height = "6ft"
    player.preferred_side = "left"
    player.avp_playerProfileId = 12345
    player.status = "active"
    await db_session.commit()

    await user_service.execute_account_deletion(db_session, rich_user["user_id"])

    result = await db_session.execute(select(Player).where(Player.id == player_id))
    player = result.scalar_one()

    assert player.full_name == "Deleted Player"
    assert player.first_name == ""
    assert player.last_name == ""
    assert player.user_id is None
    assert player.nickname is None
    assert player.gender is None
    assert player.level is None
    assert player.city is None
    assert player.state is None
    assert player.location_id is None
    assert player.date_of_birth is None
    assert player.profile_picture_url is None
    assert player.avatar is None
    assert player.height is None
    assert player.preferred_side is None
    assert player.avp_playerProfileId is None
    assert player.status is None
    assert player.created_by_player_id is None
    assert player.deleted_at is not None

    user = await db_session.scalar(select(User).where(User.id == rich_user["user_id"]))
    assert user.deleted_at == player.deleted_at


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
async def test_execute_deletion_detaches_retained_attribution(db_session, rich_user):
    """Factual records remain but no longer identify their deleted creator/updater."""
    player_id = rich_user["player_id"]
    league = await db_session.get(League, rich_user["league_id"])
    season = await db_session.get(Season, rich_user["season_id"])
    sess = await db_session.get(Session, rich_user["session_id"])
    match = await db_session.get(Match, rich_user["match_id"])
    court = await db_session.get(Court, rich_user["court_id"])
    location = await db_session.get(Location, rich_user["location_id"])
    for record in (league, season, sess, match, court, location):
        record.created_by = player_id
        if hasattr(record, "updated_by"):
            record.updated_by = player_id
    await db_session.commit()

    await user_service.execute_account_deletion(db_session, rich_user["user_id"])

    for record in (league, season, sess, match, court, location):
        await db_session.refresh(record)
        assert record.created_by is None
        if hasattr(record, "updated_by"):
            assert record.updated_by is None


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
async def test_execute_deletion_enqueues_avatar_for_durable_cleanup(db_session, user_and_player):
    """Owned avatars are durably queued in the account-deletion transaction."""
    player_id = user_and_player["player_id"]
    object_key = f"avatars/{player_id}/test.jpg"

    result = await db_session.execute(select(Player).where(Player.id == player_id))
    player = result.scalar_one()
    player.profile_picture_url = f"https://beach-kings.s3.us-west-2.amazonaws.com/{object_key}"
    await db_session.commit()

    await user_service.execute_account_deletion(db_session, user_and_player["user_id"])

    result = await db_session.execute(
        select(MediaDeletionJob).where(MediaDeletionJob.object_key == object_key)
    )
    job = result.scalar_one()
    assert job.status == "pending"


@pytest.mark.asyncio
async def test_execute_deletion_removes_reviews_and_durably_queues_photos(db_session, rich_user):
    """Review/photo rows disappear while each S3 object remains durably tracked."""
    await user_service.execute_account_deletion(db_session, rich_user["user_id"])

    review_count = await db_session.scalar(
        select(func.count())
        .select_from(CourtReview)
        .where(CourtReview.id == rich_user["review_id"])
    )
    assert review_count == 0

    queued_keys = set(
        (
            await db_session.execute(
                select(MediaDeletionJob.object_key).where(
                    MediaDeletionJob.object_key.in_(
                        [rich_user["review_photo_key"], rich_user["standalone_photo_key"]]
                    )
                )
            )
        ).scalars()
    )
    assert queued_keys == {rich_user["review_photo_key"], rich_user["standalone_photo_key"]}


@pytest.mark.asyncio
async def test_deleted_profile_and_ugc_cannot_be_reported(db_session, rich_user):
    """Reporting fails closed after deletion removes content and tombstones its author."""
    reporter_id = rich_user["other_player_id"]
    deleted_targets = (
        ("player", rich_user["player_id"]),
        ("direct_message", rich_user["direct_message_id"]),
        ("league_message", rich_user["league_message_id"]),
        ("court_review", rich_user["review_id"]),
        ("court_photo", rich_user["standalone_photo_id"]),
        ("court_review_photo", rich_user["review_photo_id"]),
    )

    await user_service.execute_account_deletion(db_session, rich_user["user_id"])

    for target_type, target_id in deleted_targets:
        with pytest.raises(ValueError, match="Report target not found"):
            await moderation_service._resolve_target(
                db_session, reporter_id, target_type, target_id
            )


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


@pytest.mark.asyncio
async def test_user_dict_includes_permanent_deletion_marker(db_session, user_and_player):
    """Deleted accounts retain a timestamp that invalidates old access tokens."""
    user_id = user_and_player["user_id"]

    await user_service.execute_account_deletion(db_session, user_id)

    user = await user_service.get_user_by_id(db_session, user_id)
    assert user["deleted_at"] is not None


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


# ---------------------------------------------------------------------------
# _process_expired_deletions — multiple users and error resilience
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_process_expired_deletions_handles_multiple_users(db_session):
    """Multiple expired users are all processed in a single worker run."""
    from datetime import timezone
    from datetime import datetime as dt

    past = dt(2020, 1, 1, tzinfo=timezone.utc)

    u1, p1 = await _create_user_and_player(db_session, name="Expired One")
    u2, p2 = await _create_user_and_player(db_session, name="Expired Two")
    u3, p3 = await _create_user_and_player(db_session, name="Active User")

    # Mark u1 and u2 as expired, leave u3 alone
    for uid in (u1, u2):
        result = await db_session.execute(select(User).where(User.id == uid))
        user = result.scalar_one()
        user.deletion_scheduled_at = past
    await db_session.commit()

    service = AccountDeletionService()
    await service._process_expired_deletions()

    # Reload state from DB
    db_session.expire_all()
    await db_session.rollback()

    # u1 and u2 players should be anonymized (full_name cleared)
    for pid in (p1, p2):
        r = await db_session.execute(select(Player).where(Player.id == pid))
        player = r.scalar_one()
        assert player.full_name != "Expired One"
        assert player.full_name != "Expired Two"

    # u3 should be untouched
    r3 = await db_session.execute(select(Player).where(Player.id == p3))
    player3 = r3.scalar_one()
    assert player3.full_name == "Active User"


@pytest.mark.asyncio
async def test_process_expired_deletions_continues_after_single_failure(db_session):
    """A failure deleting one account does not prevent processing of subsequent accounts."""
    from datetime import timezone
    from datetime import datetime as dt

    past = dt(2020, 1, 1, tzinfo=timezone.utc)

    u1, p1 = await _create_user_and_player(db_session, name="Will Fail")
    u2, p2 = await _create_user_and_player(db_session, name="Will Succeed")

    for uid in (u1, u2):
        result = await db_session.execute(select(User).where(User.id == uid))
        user = result.scalar_one()
        user.deletion_scheduled_at = past
    await db_session.commit()

    call_count = 0
    original_execute = user_service.execute_account_deletion

    async def _patched_execute(session, uid):
        nonlocal call_count
        call_count += 1
        if uid == u1:
            raise RuntimeError("simulated failure for first user")
        return await original_execute(session, uid)

    with patch.object(user_service, "execute_account_deletion", side_effect=_patched_execute):
        service = AccountDeletionService()
        # Should not raise even though the first user's deletion errors
        await service._process_expired_deletions()

    assert call_count == 2  # Both users were attempted

    db_session.expire_all()
    await db_session.rollback()

    # u2 should be anonymized despite u1 failing
    r2 = await db_session.execute(select(Player).where(Player.id == p2))
    player2 = r2.scalar_one()
    assert player2.full_name != "Will Succeed"


# ---------------------------------------------------------------------------
# AccountDeletionService lifecycle — start / stop idempotency
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_start_does_not_create_duplicate_task():
    """Calling start() twice does not spawn a second background task."""
    service = AccountDeletionService()
    try:
        service.start()
        first_task = service._worker_task

        service.start()
        second_task = service._worker_task

        assert first_task is second_task
    finally:
        service.stop()
        if service._worker_task:
            try:
                await service._worker_task
            except (asyncio.CancelledError, Exception):
                pass


@pytest.mark.asyncio
async def test_stop_cancels_running_task():
    """stop() cancels the worker task and sets the stop event."""
    service = AccountDeletionService()
    service.start()

    assert service._worker_task is not None
    assert not service._worker_task.done()

    service.stop()

    # Give the event loop a tick to process the cancellation
    try:
        await asyncio.wait_for(asyncio.shield(service._worker_task), timeout=0.1)
    except (asyncio.CancelledError, asyncio.TimeoutError):
        pass

    assert service._stop_event.is_set()


@pytest.mark.asyncio
async def test_start_after_stop_creates_new_task():
    """After stop(), start() creates a fresh task because the old one is done."""
    service = AccountDeletionService()
    service.start()
    first_task = service._worker_task

    service.stop()
    # Drain the cancellation
    try:
        await asyncio.wait_for(asyncio.shield(first_task), timeout=0.2)
    except (asyncio.CancelledError, asyncio.TimeoutError):
        pass

    # Reset stop event and start again
    service._stop_event.clear()
    service.start()
    second_task = service._worker_task

    try:
        assert second_task is not first_task
    finally:
        service.stop()
        try:
            await asyncio.wait_for(asyncio.shield(second_task), timeout=0.2)
        except (asyncio.CancelledError, asyncio.TimeoutError):
            pass


# ---------------------------------------------------------------------------
# _poll_loop — one iteration with mocked interval
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_poll_loop_calls_process_expired_deletions():
    """_poll_loop() calls _process_expired_deletions() at least once before stop."""
    service = AccountDeletionService()
    call_count = 0

    async def _fake_process():
        nonlocal call_count
        call_count += 1
        # Signal stop after the first call so the loop exits
        service._stop_event.set()

    with (
        patch.object(
            service,
            "_process_expired_deletions",
            side_effect=_fake_process,
        ),
        patch(
            "backend.services.auth.account_deletion_service.POLL_INTERVAL_SECONDS",
            0,
        ),
    ):
        # Run the loop directly; it will exit after one iteration because
        # _fake_process sets the stop event, causing wait_for to return
        await service._poll_loop()

    assert call_count >= 1


@pytest.mark.asyncio
async def test_poll_loop_continues_after_process_raises():
    """_poll_loop() catches exceptions from _process_expired_deletions and keeps running."""
    service = AccountDeletionService()
    call_count = 0

    async def _failing_then_stop():
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            raise RuntimeError("transient error")
        # Stop after the second call
        service._stop_event.set()

    with (
        patch.object(
            service,
            "_process_expired_deletions",
            side_effect=_failing_then_stop,
        ),
        patch(
            "backend.services.auth.account_deletion_service.POLL_INTERVAL_SECONDS",
            0,
        ),
    ):
        await service._poll_loop()

    assert call_count == 2
