"""
Unit tests for placeholder invite claim and merge flows (Epic 3).

Tests:
- get_invite_details: valid/invalid token, match count, league names, claimed status
- claim_invite (new user): placeholder becomes user's player
- claim_invite (merge): match FKs transferred, placeholder deleted
- Conflict handling: skipped matches, warnings, placeholder retained
- flip_ranked_status: unranked→ranked after all placeholders resolved
- League membership transfer on claim
- Notification creation for invite creator
- Stats recalc enqueue on claim
- Edge cases: already-claimed, invalid token, double-claim
"""

import secrets

import pytest
import pytest_asyncio
from unittest.mock import AsyncMock, patch
from sqlalchemy import select

from backend.database.models import (
    Player,
    PlayerInvite,
    InviteStatus,
    League,
    LeagueMember,
    Match,
    Session,
    SessionStatus,
    SessionParticipant,
    Notification,
    NotificationType,
)
from backend.services import placeholder_service, user_service


# ============================================================================
# Fixtures
# ============================================================================


@pytest_asyncio.fixture
async def test_user(db_session):
    """Create a test user (will be the invite creator)."""
    user_id = await user_service.create_user(
        session=db_session,
        phone_number="+15550020001",
        password_hash="hashed_password",
    )
    return user_id


@pytest_asyncio.fixture
async def claiming_user(db_session):
    """Create a user who will claim the invite."""
    user_id = await user_service.create_user(
        session=db_session,
        phone_number="+15550020002",
        password_hash="hashed_password",
    )
    return user_id


@pytest_asyncio.fixture
async def third_user(db_session):
    """Create a third user for conflict scenarios."""
    user_id = await user_service.create_user(
        session=db_session,
        phone_number="+15550020003",
        password_hash="hashed_password",
    )
    return user_id


@pytest_asyncio.fixture
async def creator_player(db_session, test_user):
    """Real player who creates placeholders."""
    player = Player(full_name="Creator Player", user_id=test_user)
    db_session.add(player)
    await db_session.commit()
    await db_session.refresh(player)
    return player


@pytest_asyncio.fixture
async def claiming_player(db_session, claiming_user):
    """Existing player profile for the claiming user (merge path)."""
    player = Player(full_name="Claiming Player", user_id=claiming_user)
    db_session.add(player)
    await db_session.commit()
    await db_session.refresh(player)
    return player


@pytest_asyncio.fixture
async def other_player(db_session, third_user):
    """Another real player for filling out matches."""
    player = Player(full_name="Other Player", user_id=third_user)
    db_session.add(player)
    await db_session.commit()
    await db_session.refresh(player)
    return player


@pytest_asyncio.fixture
async def four_real_players(db_session):
    """Create 4 real players for match tests."""
    players = []
    for i in range(4):
        user_id = await user_service.create_user(
            session=db_session,
            phone_number=f"+1555200000{i}",
            password_hash="hashed_password",
        )
        player = Player(full_name=f"Real Player {i+1}", user_id=user_id)
        db_session.add(player)
        await db_session.commit()
        await db_session.refresh(player)
        players.append(player)
    return players


@pytest_asyncio.fixture
async def test_league(db_session, creator_player):
    """Create a test league."""
    league = League(
        name="Test League",
        created_by=creator_player.id,
    )
    db_session.add(league)
    await db_session.commit()
    await db_session.refresh(league)
    return league


@pytest_asyncio.fixture
async def second_league(db_session, creator_player):
    """Create a second test league."""
    league = League(
        name="Second League",
        created_by=creator_player.id,
    )
    db_session.add(league)
    await db_session.commit()
    await db_session.refresh(league)
    return league


@pytest_asyncio.fixture
async def test_session(db_session, creator_player):
    """Create a test game session."""
    game_session = Session(
        date="2/15/2026",
        name="Test Session 2/15/2026",
        status=SessionStatus.ACTIVE,
        created_by=creator_player.id,
    )
    db_session.add(game_session)
    await db_session.commit()
    await db_session.refresh(game_session)
    return game_session


@pytest_asyncio.fixture
async def placeholder_with_invite(db_session, creator_player):
    """Create a placeholder player with a pending invite."""
    result = await placeholder_service.create_placeholder(
        db_session,
        name="Placeholder Person",
        created_by_player_id=creator_player.id,
    )
    return result


@pytest_asyncio.fixture
async def placeholder_in_league(db_session, creator_player, test_league):
    """Create a placeholder player added to a league."""
    result = await placeholder_service.create_placeholder(
        db_session,
        name="League Placeholder",
        created_by_player_id=creator_player.id,
        league_id=test_league.id,
    )
    return result


# ============================================================================
# Helper
# ============================================================================


def _make_match(session_id, p1, p2, p3, p4, is_ranked=False):
    """Create a Match object with sensible defaults."""
    return Match(
        session_id=session_id,
        date="2/15/2026",
        team1_player1_id=p1,
        team1_player2_id=p2,
        team2_player1_id=p3,
        team2_player2_id=p4,
        team1_score=21,
        team2_score=15,
        winner=1,
        is_ranked=is_ranked,
    )


# ============================================================================
# 1. TestGetInviteDetails
# ============================================================================


class TestGetInviteDetails:
    """Tests for placeholder_service.get_invite_details."""

    @pytest.mark.asyncio
    async def test_valid_token(self, db_session, creator_player, placeholder_with_invite):
        """Valid token returns invite details."""
        ph = placeholder_with_invite
        result = await placeholder_service.get_invite_details(db_session, ph.invite_token)

        assert result.inviter_name == "Creator Player"
        assert result.placeholder_name == "Placeholder Person"
        assert result.status == "pending"

    @pytest.mark.asyncio
    async def test_invalid_token(self, db_session):
        """Invalid token raises ValueError."""
        with pytest.raises(ValueError, match="Invite not found"):
            await placeholder_service.get_invite_details(db_session, "bogus_token")

    @pytest.mark.asyncio
    async def test_match_count(
        self, db_session, creator_player, other_player, test_session, placeholder_with_invite
    ):
        """Match count reflects placeholder's matches."""
        ph = placeholder_with_invite
        match = _make_match(
            test_session.id, creator_player.id, ph.player_id,
            other_player.id, creator_player.id,
        )
        db_session.add(match)
        await db_session.commit()

        result = await placeholder_service.get_invite_details(db_session, ph.invite_token)
        assert result.match_count == 1

    @pytest.mark.asyncio
    async def test_league_names(self, db_session, creator_player, placeholder_in_league, test_league):
        """League names are included in response."""
        ph = placeholder_in_league
        result = await placeholder_service.get_invite_details(db_session, ph.invite_token)
        assert "Test League" in result.league_names

    @pytest.mark.asyncio
    async def test_claimed_status(self, db_session, creator_player, placeholder_with_invite):
        """After claiming, status reflects 'claimed'."""
        ph = placeholder_with_invite
        # Manually mark as claimed
        await db_session.execute(
            select(PlayerInvite).where(PlayerInvite.invite_token == ph.invite_token)
        )
        from sqlalchemy import update
        await db_session.execute(
            update(PlayerInvite)
            .where(PlayerInvite.invite_token == ph.invite_token)
            .values(status=InviteStatus.CLAIMED.value)
        )
        await db_session.commit()

        result = await placeholder_service.get_invite_details(db_session, ph.invite_token)
        assert result.status == "claimed"


# ============================================================================
# 2. TestClaimNewUser
# ============================================================================


class TestClaimNewUser:
    """Tests for claim_invite when user has no existing player profile."""

    @pytest.mark.asyncio
    async def test_placeholder_becomes_player(
        self, db_session, creator_player, claiming_user, placeholder_with_invite
    ):
        """Claiming user without player → placeholder becomes their player."""
        ph = placeholder_with_invite

        with patch("backend.services.stats_queue.get_stats_queue") as mock_queue:
            mock_queue.return_value.enqueue_calculation = AsyncMock()
            result = await placeholder_service.claim_invite(
                db_session, ph.invite_token, claiming_user
            )

        assert result.success is True
        assert result.player_id == ph.player_id

        # Verify the placeholder is now a real player
        player = await db_session.get(Player, ph.player_id)
        assert player.user_id == claiming_user
        assert player.is_placeholder is False
        assert player.full_name == "Placeholder Person"

    @pytest.mark.asyncio
    async def test_invite_marked_claimed(
        self, db_session, creator_player, claiming_user, placeholder_with_invite
    ):
        """Invite status updated to 'claimed' with user and timestamp."""
        ph = placeholder_with_invite

        with patch("backend.services.stats_queue.get_stats_queue") as mock_queue:
            mock_queue.return_value.enqueue_calculation = AsyncMock()
            await placeholder_service.claim_invite(db_session, ph.invite_token, claiming_user)

        invite_result = await db_session.execute(
            select(PlayerInvite).where(PlayerInvite.invite_token == ph.invite_token)
        )
        invite = invite_result.scalar_one()
        assert invite.status == InviteStatus.CLAIMED.value
        assert invite.claimed_by_user_id == claiming_user
        assert invite.claimed_at is not None


# ============================================================================
# 3. TestClaimMerge
# ============================================================================


class TestClaimMerge:
    """Tests for claim_invite when user already has a player profile (merge path)."""

    @pytest.mark.asyncio
    async def test_match_fks_transferred(
        self, db_session, creator_player, claiming_user, claiming_player,
        other_player, test_session, placeholder_with_invite
    ):
        """Match FKs transfer from placeholder to claiming player."""
        ph = placeholder_with_invite
        match = _make_match(
            test_session.id, creator_player.id, ph.player_id,
            other_player.id, creator_player.id,
        )
        db_session.add(match)
        await db_session.commit()
        match_id = match.id

        with patch("backend.services.stats_queue.get_stats_queue") as mock_queue:
            mock_queue.return_value.enqueue_calculation = AsyncMock()
            result = await placeholder_service.claim_invite(
                db_session, ph.invite_token, claiming_user
            )

        assert result.success is True
        assert result.player_id == claiming_player.id

        # Match FK should now point to claiming_player
        updated_match = await db_session.get(Match, match_id)
        assert updated_match.team1_player2_id == claiming_player.id

    @pytest.mark.asyncio
    async def test_placeholder_deleted_on_merge(
        self, db_session, creator_player, claiming_user, claiming_player,
        other_player, test_session, placeholder_with_invite
    ):
        """Placeholder is deleted after successful merge (no conflicts)."""
        ph = placeholder_with_invite
        match = _make_match(
            test_session.id, creator_player.id, ph.player_id,
            other_player.id, creator_player.id,
        )
        db_session.add(match)
        await db_session.commit()

        with patch("backend.services.stats_queue.get_stats_queue") as mock_queue:
            mock_queue.return_value.enqueue_calculation = AsyncMock()
            await placeholder_service.claim_invite(db_session, ph.invite_token, claiming_user)

        deleted = await db_session.get(Player, ph.player_id)
        assert deleted is None

    @pytest.mark.asyncio
    async def test_session_participants_transferred(
        self, db_session, creator_player, claiming_user, claiming_player,
        test_session, placeholder_with_invite
    ):
        """Session participants are transferred from placeholder to target."""
        ph = placeholder_with_invite
        sp = SessionParticipant(
            session_id=test_session.id,
            player_id=ph.player_id,
            invited_by=creator_player.id,
        )
        db_session.add(sp)
        await db_session.commit()

        with patch("backend.services.stats_queue.get_stats_queue") as mock_queue:
            mock_queue.return_value.enqueue_calculation = AsyncMock()
            await placeholder_service.claim_invite(db_session, ph.invite_token, claiming_user)

        # Target should now be a participant
        sp_result = await db_session.execute(
            select(SessionParticipant).where(
                SessionParticipant.session_id == test_session.id,
                SessionParticipant.player_id == claiming_player.id,
            )
        )
        assert sp_result.scalar_one_or_none() is not None


# ============================================================================
# 4. TestClaimConflicts
# ============================================================================


class TestClaimConflicts:
    """Tests for claim when claiming user already appears in match with placeholder."""

    @pytest.mark.asyncio
    async def test_conflicting_matches_skipped(
        self, db_session, creator_player, claiming_user, claiming_player,
        other_player, test_session, placeholder_with_invite
    ):
        """Matches where both placeholder and target exist are skipped."""
        ph = placeholder_with_invite

        # Conflict: claiming_player and placeholder both in the match
        conflict_match = _make_match(
            test_session.id, claiming_player.id, ph.player_id,
            other_player.id, creator_player.id,
        )
        db_session.add(conflict_match)
        await db_session.commit()
        conflict_id = conflict_match.id

        with patch("backend.services.stats_queue.get_stats_queue") as mock_queue:
            mock_queue.return_value.enqueue_calculation = AsyncMock()
            result = await placeholder_service.claim_invite(
                db_session, ph.invite_token, claiming_user
            )

        assert result.warnings is not None
        assert len(result.warnings) == 1
        assert "1 match(es)" in result.warnings[0]

        # The conflicting match should still reference the placeholder
        match = await db_session.get(Match, conflict_id)
        assert match.team1_player2_id == ph.player_id

    @pytest.mark.asyncio
    async def test_placeholder_not_deleted_with_conflicts(
        self, db_session, creator_player, claiming_user, claiming_player,
        other_player, test_session, placeholder_with_invite
    ):
        """Placeholder is NOT deleted when conflicting matches exist."""
        ph = placeholder_with_invite
        conflict_match = _make_match(
            test_session.id, claiming_player.id, ph.player_id,
            other_player.id, creator_player.id,
        )
        db_session.add(conflict_match)
        await db_session.commit()

        with patch("backend.services.stats_queue.get_stats_queue") as mock_queue:
            mock_queue.return_value.enqueue_calculation = AsyncMock()
            await placeholder_service.claim_invite(db_session, ph.invite_token, claiming_user)

        # Placeholder should still exist
        player = await db_session.get(Player, ph.player_id)
        assert player is not None


# ============================================================================
# 5. TestFlipRankedStatus
# ============================================================================


class TestFlipRankedStatus:
    """Tests for flip_ranked_status_for_resolved_matches."""

    @pytest.mark.asyncio
    async def test_flips_when_all_real(
        self, db_session, creator_player, claiming_user,
        other_player, test_session, placeholder_with_invite
    ):
        """Match flips to ranked when all 4 players are real after claim."""
        ph = placeholder_with_invite
        match = _make_match(
            test_session.id, creator_player.id, ph.player_id,
            other_player.id, creator_player.id, is_ranked=False,
        )
        db_session.add(match)
        await db_session.commit()
        match_id = match.id

        # Claim as new user (no existing player → placeholder becomes real)
        with patch("backend.services.stats_queue.get_stats_queue") as mock_queue:
            mock_queue.return_value.enqueue_calculation = AsyncMock()
            await placeholder_service.claim_invite(db_session, ph.invite_token, claiming_user)

        updated = await db_session.get(Match, match_id)
        assert updated.is_ranked is True

    @pytest.mark.asyncio
    async def test_stays_unranked_with_remaining_placeholder(
        self, db_session, creator_player, claiming_user,
        test_session
    ):
        """Match stays unranked if another placeholder remains in the match."""
        # Create two placeholders
        ph1 = await placeholder_service.create_placeholder(
            db_session, name="Placeholder A", created_by_player_id=creator_player.id
        )
        ph2 = await placeholder_service.create_placeholder(
            db_session, name="Placeholder B", created_by_player_id=creator_player.id
        )

        # Match has both placeholders
        match = _make_match(
            test_session.id, creator_player.id, ph1.player_id,
            ph2.player_id, creator_player.id, is_ranked=False,
        )
        db_session.add(match)
        await db_session.commit()
        match_id = match.id

        # Claim only ph1 (as new user)
        with patch("backend.services.stats_queue.get_stats_queue") as mock_queue:
            mock_queue.return_value.enqueue_calculation = AsyncMock()
            await placeholder_service.claim_invite(db_session, ph1.invite_token, claiming_user)

        updated = await db_session.get(Match, match_id)
        assert updated.is_ranked is False  # ph2 still placeholder

    @pytest.mark.asyncio
    async def test_flips_after_second_placeholder_claimed(
        self, db_session, creator_player, claiming_user, third_user, test_session
    ):
        """Claiming the second placeholder in a match flips it to ranked."""
        ph1 = await placeholder_service.create_placeholder(
            db_session, name="Placeholder A", created_by_player_id=creator_player.id
        )
        ph2 = await placeholder_service.create_placeholder(
            db_session, name="Placeholder B", created_by_player_id=creator_player.id
        )

        match = _make_match(
            test_session.id, creator_player.id, ph1.player_id,
            ph2.player_id, creator_player.id, is_ranked=False,
        )
        db_session.add(match)
        await db_session.commit()
        match_id = match.id

        # Claim ph1
        with patch("backend.services.stats_queue.get_stats_queue") as mock_queue:
            mock_queue.return_value.enqueue_calculation = AsyncMock()
            await placeholder_service.claim_invite(db_session, ph1.invite_token, claiming_user)

        # Claim ph2 with different user
        with patch("backend.services.stats_queue.get_stats_queue") as mock_queue:
            mock_queue.return_value.enqueue_calculation = AsyncMock()
            await placeholder_service.claim_invite(db_session, ph2.invite_token, third_user)

        updated = await db_session.get(Match, match_id)
        assert updated.is_ranked is True


# ============================================================================
# 6. TestLeagueMembershipOnClaim
# ============================================================================


class TestLeagueMembershipOnClaim:
    """Tests for league membership transfer during claim."""

    @pytest.mark.asyncio
    async def test_non_member_gets_membership(
        self, db_session, creator_player, claiming_user, claiming_player,
        placeholder_in_league, test_league
    ):
        """Claiming user NOT in the league → membership transferred with role 'member'."""
        ph = placeholder_in_league

        with patch("backend.services.stats_queue.get_stats_queue") as mock_queue:
            mock_queue.return_value.enqueue_calculation = AsyncMock()
            await placeholder_service.claim_invite(db_session, ph.invite_token, claiming_user)

        lm_result = await db_session.execute(
            select(LeagueMember).where(
                LeagueMember.league_id == test_league.id,
                LeagueMember.player_id == claiming_player.id,
            )
        )
        lm = lm_result.scalar_one_or_none()
        assert lm is not None
        assert lm.role == "member"

    @pytest.mark.asyncio
    async def test_existing_member_placeholder_deleted(
        self, db_session, creator_player, claiming_user, claiming_player,
        placeholder_in_league, test_league
    ):
        """Claiming user already in the league → placeholder's membership deleted."""
        ph = placeholder_in_league

        # Add claiming_player as existing member
        existing_lm = LeagueMember(
            league_id=test_league.id,
            player_id=claiming_player.id,
            role="admin",
        )
        db_session.add(existing_lm)
        await db_session.commit()

        with patch("backend.services.stats_queue.get_stats_queue") as mock_queue:
            mock_queue.return_value.enqueue_calculation = AsyncMock()
            await placeholder_service.claim_invite(db_session, ph.invite_token, claiming_user)

        # Only one membership should remain (the existing admin one)
        lm_result = await db_session.execute(
            select(LeagueMember).where(
                LeagueMember.league_id == test_league.id,
                LeagueMember.player_id == claiming_player.id,
            )
        )
        lms = lm_result.scalars().all()
        assert len(lms) == 1
        assert lms[0].role == "admin"  # Original role preserved

        # Placeholder's membership should be gone
        ph_lm_result = await db_session.execute(
            select(LeagueMember).where(
                LeagueMember.league_id == test_league.id,
                LeagueMember.player_id == ph.player_id,
            )
        )
        assert ph_lm_result.scalar_one_or_none() is None


# ============================================================================
# 7. TestNotificationOnClaim
# ============================================================================


class TestNotificationOnClaim:
    """Tests for PLACEHOLDER_CLAIMED notification creation."""

    @pytest.mark.asyncio
    async def test_notification_created_for_creator(
        self, db_session, creator_player, test_user, claiming_user,
        placeholder_with_invite
    ):
        """Claiming creates a PLACEHOLDER_CLAIMED notification for the invite creator."""
        ph = placeholder_with_invite

        with patch("backend.services.stats_queue.get_stats_queue") as mock_queue:
            mock_queue.return_value.enqueue_calculation = AsyncMock()
            await placeholder_service.claim_invite(db_session, ph.invite_token, claiming_user)

        notif_result = await db_session.execute(
            select(Notification).where(
                Notification.user_id == test_user,
                Notification.type == NotificationType.PLACEHOLDER_CLAIMED.value,
            )
        )
        notif = notif_result.scalar_one_or_none()
        assert notif is not None
        assert "claimed" in notif.message.lower() or "claimed" in notif.title.lower()


# ============================================================================
# 8. TestStatsRecalcOnClaim
# ============================================================================


class TestStatsRecalcOnClaim:
    """Tests for stats queue enqueue on claim."""

    @pytest.mark.asyncio
    async def test_global_and_league_stats_enqueued(
        self, db_session, creator_player, claiming_user, claiming_player,
        placeholder_in_league, test_league
    ):
        """Claim enqueues global recalc + one per affected league."""
        ph = placeholder_in_league

        with patch("backend.services.stats_queue.get_stats_queue") as mock_queue:
            mock_enqueue = AsyncMock()
            mock_queue.return_value.enqueue_calculation = mock_enqueue
            await placeholder_service.claim_invite(db_session, ph.invite_token, claiming_user)

        # Should have been called at least twice: global + league
        calls = mock_enqueue.call_args_list
        calc_types = [c[0][1] for c in calls]
        assert "global" in calc_types
        assert "league" in calc_types


# ============================================================================
# 9. TestClaimEdgeCases
# ============================================================================


class TestClaimEdgeCases:
    """Edge case tests for claim_invite."""

    @pytest.mark.asyncio
    async def test_already_claimed_rejected(
        self, db_session, creator_player, claiming_user, placeholder_with_invite
    ):
        """Attempting to claim an already-claimed invite raises ValueError."""
        ph = placeholder_with_invite

        # First claim
        with patch("backend.services.stats_queue.get_stats_queue") as mock_queue:
            mock_queue.return_value.enqueue_calculation = AsyncMock()
            await placeholder_service.claim_invite(db_session, ph.invite_token, claiming_user)

        # Second claim attempt
        second_user = await user_service.create_user(
            session=db_session,
            phone_number="+15550020099",
            password_hash="hashed_password",
        )

        with pytest.raises(ValueError, match="already been claimed"):
            with patch("backend.services.stats_queue.get_stats_queue") as mock_queue:
                mock_queue.return_value.enqueue_calculation = AsyncMock()
                await placeholder_service.claim_invite(db_session, ph.invite_token, second_user)

    @pytest.mark.asyncio
    async def test_invalid_token_404(self, db_session, claiming_user):
        """Invalid token raises ValueError."""
        with pytest.raises(ValueError, match="Invite not found"):
            await placeholder_service.claim_invite(db_session, "nonexistent_token", claiming_user)

    @pytest.mark.asyncio
    async def test_claim_returns_redirect_url(
        self, db_session, creator_player, claiming_user, placeholder_in_league, test_league
    ):
        """Claim with league membership returns redirect to /leagues."""
        ph = placeholder_in_league

        with patch("backend.services.stats_queue.get_stats_queue") as mock_queue:
            mock_queue.return_value.enqueue_calculation = AsyncMock()
            result = await placeholder_service.claim_invite(
                db_session, ph.invite_token, claiming_user
            )

        assert result.redirect_url == "/leagues"

    @pytest.mark.asyncio
    async def test_claim_no_leagues_redirect_dashboard(
        self, db_session, creator_player, claiming_user, placeholder_with_invite
    ):
        """Claim without league membership returns redirect to /dashboard."""
        ph = placeholder_with_invite

        with patch("backend.services.stats_queue.get_stats_queue") as mock_queue:
            mock_queue.return_value.enqueue_calculation = AsyncMock()
            result = await placeholder_service.claim_invite(
                db_session, ph.invite_token, claiming_user
            )

        assert result.redirect_url == "/dashboard"

    @pytest.mark.asyncio
    async def test_merge_transfers_match_created_by(
        self, db_session, creator_player, claiming_user, claiming_player,
        other_player, test_session, placeholder_with_invite
    ):
        """Match.created_by is transferred from placeholder to target during merge."""
        ph = placeholder_with_invite

        # Create a match where placeholder is the creator
        match = _make_match(
            test_session.id, creator_player.id, other_player.id,
            other_player.id, creator_player.id,
        )
        match.created_by = ph.player_id
        db_session.add(match)
        await db_session.commit()
        match_id = match.id

        with patch("backend.services.stats_queue.get_stats_queue") as mock_queue:
            mock_queue.return_value.enqueue_calculation = AsyncMock()
            await placeholder_service.claim_invite(db_session, ph.invite_token, claiming_user)

        updated = await db_session.get(Match, match_id)
        assert updated.created_by == claiming_player.id

    @pytest.mark.asyncio
    async def test_duplicate_session_participant_handled(
        self, db_session, creator_player, claiming_user, claiming_player,
        test_session, placeholder_with_invite
    ):
        """If target already in session, placeholder's session participation is deleted."""
        ph = placeholder_with_invite

        # Both placeholder and target in same session
        sp_placeholder = SessionParticipant(
            session_id=test_session.id,
            player_id=ph.player_id,
            invited_by=creator_player.id,
        )
        sp_target = SessionParticipant(
            session_id=test_session.id,
            player_id=claiming_player.id,
            invited_by=creator_player.id,
        )
        db_session.add_all([sp_placeholder, sp_target])
        await db_session.commit()

        with patch("backend.services.stats_queue.get_stats_queue") as mock_queue:
            mock_queue.return_value.enqueue_calculation = AsyncMock()
            await placeholder_service.claim_invite(db_session, ph.invite_token, claiming_user)

        # Only one session participant should remain for target
        sp_result = await db_session.execute(
            select(SessionParticipant).where(
                SessionParticipant.session_id == test_session.id,
                SessionParticipant.player_id == claiming_player.id,
            )
        )
        sps = sp_result.scalars().all()
        assert len(sps) == 1
