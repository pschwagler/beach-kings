"""
Unit tests for placeholder player CRUD operations.

Tests Epic 2 deliverables:
- create_placeholder: basic, with phone, with league_id, invite token generated
- list_placeholders: returns only creator's, includes match counts, empty list
- delete_placeholder: reassign to Unknown Player, 403/404, cascade, is_ranked enforcement
- Player search scoping: excluded by default, included when scoped
- is_ranked enforcement: match with placeholder → is_ranked=false
"""

import secrets

import pytest
import pytest_asyncio
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
    Season,
    Location,
)
from backend.models.schemas import CreateMatchRequest
from backend.services import placeholder_service, data_service, user_service


# ============================================================================
# Fixtures
# ============================================================================


@pytest_asyncio.fixture
async def test_user(db_session):
    """Create a test user."""
    user_id = await user_service.create_user(
        session=db_session,
        phone_number="+15550010001",
        password_hash="hashed_password",
    )
    return user_id


@pytest_asyncio.fixture
async def second_user(db_session):
    """Create a second test user."""
    user_id = await user_service.create_user(
        session=db_session,
        phone_number="+15550010002",
        password_hash="hashed_password",
    )
    return user_id


@pytest_asyncio.fixture
async def creator_player(db_session, test_user):
    """Create a real player who will create placeholders."""
    player = Player(full_name="Creator Player", user_id=test_user)
    db_session.add(player)
    await db_session.commit()
    await db_session.refresh(player)
    return player


@pytest_asyncio.fixture
async def other_player(db_session, second_user):
    """Create another real player (non-creator)."""
    player = Player(full_name="Other Player", user_id=second_user)
    db_session.add(player)
    await db_session.commit()
    await db_session.refresh(player)
    return player


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
async def four_real_players(db_session):
    """Create 4 real players for match tests."""
    players = []
    for i in range(4):
        user_id = await user_service.create_user(
            session=db_session,
            phone_number=f"+1555100000{i}",
            password_hash="hashed_password",
        )
        player = Player(full_name=f"Real Player {i+1}", user_id=user_id)
        db_session.add(player)
        await db_session.commit()
        await db_session.refresh(player)
        players.append(player)
    return players


# ============================================================================
# 1. Create placeholder tests
# ============================================================================


class TestCreatePlaceholder:
    """Tests for placeholder_service.create_placeholder."""

    @pytest.mark.asyncio
    async def test_basic_creation(self, db_session, creator_player):
        """Create a basic placeholder player with no extras."""
        result = await placeholder_service.create_placeholder(
            db_session, name="John Doe", created_by_player_id=creator_player.id
        )

        assert result.player_id is not None
        assert result.name == "John Doe"
        assert result.invite_token is not None
        assert len(result.invite_token) > 0
        assert "/invite/" in result.invite_url

        # Verify DB record
        player = await db_session.get(Player, result.player_id)
        assert player.is_placeholder is True
        assert player.created_by_player_id == creator_player.id
        assert player.user_id is None

    @pytest.mark.asyncio
    async def test_with_phone_number(self, db_session, creator_player):
        """Create placeholder with phone number stored on invite."""
        result = await placeholder_service.create_placeholder(
            db_session,
            name="Jane Smith",
            created_by_player_id=creator_player.id,
            phone_number="+15559876543",
        )

        invite_result = await db_session.execute(
            select(PlayerInvite).where(PlayerInvite.player_id == result.player_id)
        )
        invite = invite_result.scalar_one()
        assert invite.phone_number == "+15559876543"

    @pytest.mark.asyncio
    async def test_with_league_id(self, db_session, creator_player, test_league):
        """Creating with league_id should add a LeagueMember row."""
        result = await placeholder_service.create_placeholder(
            db_session,
            name="League Placeholder",
            created_by_player_id=creator_player.id,
            league_id=test_league.id,
        )

        lm_result = await db_session.execute(
            select(LeagueMember).where(
                LeagueMember.player_id == result.player_id,
                LeagueMember.league_id == test_league.id,
            )
        )
        lm = lm_result.scalar_one()
        assert lm.role == "placeholder"
        assert lm.created_by == creator_player.id

    @pytest.mark.asyncio
    async def test_invite_token_generated(self, db_session, creator_player):
        """Each placeholder gets a unique invite token."""
        r1 = await placeholder_service.create_placeholder(
            db_session, name="Player A", created_by_player_id=creator_player.id
        )
        r2 = await placeholder_service.create_placeholder(
            db_session, name="Player B", created_by_player_id=creator_player.id
        )

        assert r1.invite_token != r2.invite_token

    @pytest.mark.asyncio
    async def test_invite_status_pending(self, db_session, creator_player):
        """Newly created invite should have 'pending' status."""
        result = await placeholder_service.create_placeholder(
            db_session, name="Pending Guy", created_by_player_id=creator_player.id
        )

        invite_result = await db_session.execute(
            select(PlayerInvite).where(PlayerInvite.player_id == result.player_id)
        )
        invite = invite_result.scalar_one()
        assert invite.status == InviteStatus.PENDING.value


# ============================================================================
# 2. List placeholders tests
# ============================================================================


class TestListPlaceholders:
    """Tests for placeholder_service.list_placeholders."""

    @pytest.mark.asyncio
    async def test_returns_only_creators_placeholders(
        self, db_session, creator_player, other_player
    ):
        """Only placeholders created by the querying player are returned."""
        await placeholder_service.create_placeholder(
            db_session, name="My Placeholder", created_by_player_id=creator_player.id
        )
        await placeholder_service.create_placeholder(
            db_session, name="Other's Placeholder", created_by_player_id=other_player.id
        )

        result = await placeholder_service.list_placeholders(db_session, creator_player.id)
        assert len(result.placeholders) == 1
        assert result.placeholders[0].name == "My Placeholder"

    @pytest.mark.asyncio
    async def test_includes_match_count(
        self, db_session, creator_player, other_player, test_session
    ):
        """Match count reflects how many matches the placeholder appears in."""
        ph = await placeholder_service.create_placeholder(
            db_session, name="Match Placeholder", created_by_player_id=creator_player.id
        )

        # Create a match with the placeholder
        match = Match(
            session_id=test_session.id,
            date="2/15/2026",
            team1_player1_id=creator_player.id,
            team1_player2_id=ph.player_id,
            team2_player1_id=other_player.id,
            team2_player2_id=creator_player.id,
            team1_score=21,
            team2_score=15,
            winner=1,
        )
        db_session.add(match)
        await db_session.commit()

        result = await placeholder_service.list_placeholders(db_session, creator_player.id)
        assert result.placeholders[0].match_count == 1

    @pytest.mark.asyncio
    async def test_empty_list(self, db_session, creator_player):
        """Returns empty list when no placeholders exist."""
        result = await placeholder_service.list_placeholders(db_session, creator_player.id)
        assert result.placeholders == []

    @pytest.mark.asyncio
    async def test_list_includes_invite_info(self, db_session, creator_player):
        """Each item includes invite_token, invite_url, and status."""
        await placeholder_service.create_placeholder(
            db_session,
            name="Info Placeholder",
            created_by_player_id=creator_player.id,
            phone_number="+15551112222",
        )

        result = await placeholder_service.list_placeholders(db_session, creator_player.id)
        item = result.placeholders[0]
        assert item.invite_token is not None
        assert "/invite/" in item.invite_url
        assert item.status == "pending"
        assert item.phone_number == "+15551112222"


# ============================================================================
# 3. Delete placeholder tests
# ============================================================================


class TestDeletePlaceholder:
    """Tests for placeholder_service.delete_placeholder."""

    @pytest.mark.asyncio
    async def test_replaces_with_unknown_player(
        self, db_session, creator_player, other_player, test_session
    ):
        """Deleting a placeholder reassigns match FKs to Unknown Player."""
        ph = await placeholder_service.create_placeholder(
            db_session, name="To Delete", created_by_player_id=creator_player.id
        )

        match = Match(
            session_id=test_session.id,
            date="2/15/2026",
            team1_player1_id=creator_player.id,
            team1_player2_id=ph.player_id,
            team2_player1_id=other_player.id,
            team2_player2_id=creator_player.id,
            team1_score=21,
            team2_score=15,
            winner=1,
        )
        db_session.add(match)
        await db_session.commit()
        match_id = match.id

        result = await placeholder_service.delete_placeholder(
            db_session, ph.player_id, creator_player.id
        )
        assert result.affected_matches == 1

        # Verify the match now references Unknown Player
        updated_match = await db_session.get(Match, match_id)
        assert updated_match.team1_player2_id != ph.player_id
        # Verify Unknown Player exists
        unknown_result = await db_session.execute(
            select(Player).where(Player.id == updated_match.team1_player2_id)
        )
        unknown = unknown_result.scalar_one()
        assert unknown.full_name == "Unknown Player"
        assert unknown.status == "system"

    @pytest.mark.asyncio
    async def test_sets_affected_matches_unranked(
        self, db_session, creator_player, other_player, test_session
    ):
        """Affected matches should have is_ranked=False after deletion."""
        ph = await placeholder_service.create_placeholder(
            db_session, name="Unrank Me", created_by_player_id=creator_player.id
        )

        match = Match(
            session_id=test_session.id,
            date="2/15/2026",
            team1_player1_id=creator_player.id,
            team1_player2_id=ph.player_id,
            team2_player1_id=other_player.id,
            team2_player2_id=creator_player.id,
            team1_score=21,
            team2_score=15,
            winner=1,
            is_ranked=True,
        )
        db_session.add(match)
        await db_session.commit()
        match_id = match.id

        await placeholder_service.delete_placeholder(
            db_session, ph.player_id, creator_player.id
        )

        updated_match = await db_session.get(Match, match_id)
        assert updated_match.is_ranked is False

    @pytest.mark.asyncio
    async def test_403_for_non_creator(self, db_session, creator_player, other_player):
        """Non-creator cannot delete someone else's placeholder."""
        ph = await placeholder_service.create_placeholder(
            db_session, name="Not Yours", created_by_player_id=creator_player.id
        )

        with pytest.raises(PermissionError):
            await placeholder_service.delete_placeholder(
                db_session, ph.player_id, other_player.id
            )

    @pytest.mark.asyncio
    async def test_404_for_nonexistent(self, db_session, creator_player):
        """Deleting a non-existent placeholder raises ValueError."""
        with pytest.raises(ValueError):
            await placeholder_service.delete_placeholder(
                db_session, 999999, creator_player.id
            )

    @pytest.mark.asyncio
    async def test_cascade_deletes_invite(self, db_session, creator_player):
        """Deleting placeholder should cascade-delete its PlayerInvite."""
        ph = await placeholder_service.create_placeholder(
            db_session, name="Cascade Test", created_by_player_id=creator_player.id
        )
        player_id = ph.player_id

        await placeholder_service.delete_placeholder(
            db_session, player_id, creator_player.id
        )

        invite_result = await db_session.execute(
            select(PlayerInvite).where(PlayerInvite.player_id == player_id)
        )
        assert invite_result.scalar_one_or_none() is None

    @pytest.mark.asyncio
    async def test_deletes_league_memberships(
        self, db_session, creator_player, test_league
    ):
        """Deleting placeholder removes its LeagueMember rows."""
        ph = await placeholder_service.create_placeholder(
            db_session,
            name="League Member",
            created_by_player_id=creator_player.id,
            league_id=test_league.id,
        )

        await placeholder_service.delete_placeholder(
            db_session, ph.player_id, creator_player.id
        )

        lm_result = await db_session.execute(
            select(LeagueMember).where(LeagueMember.player_id == ph.player_id)
        )
        assert lm_result.scalar_one_or_none() is None

    @pytest.mark.asyncio
    async def test_zero_affected_matches(self, db_session, creator_player):
        """Deleting placeholder with no matches returns affected_matches=0."""
        ph = await placeholder_service.create_placeholder(
            db_session, name="No Matches", created_by_player_id=creator_player.id
        )

        result = await placeholder_service.delete_placeholder(
            db_session, ph.player_id, creator_player.id
        )
        assert result.affected_matches == 0


# ============================================================================
# 4. Player search scoping tests
# ============================================================================


class TestPlayerSearchScoping:
    """Tests for list_players_search placeholder scoping."""

    @pytest.mark.asyncio
    async def test_placeholders_excluded_by_default(self, db_session, creator_player):
        """Placeholders should not appear in default search results."""
        await placeholder_service.create_placeholder(
            db_session, name="Hidden Placeholder", created_by_player_id=creator_player.id
        )

        items, total = await data_service.list_players_search(db_session)
        names = [item["full_name"] for item in items]
        assert "Hidden Placeholder" not in names

    @pytest.mark.asyncio
    async def test_system_records_excluded(self, db_session):
        """System records (e.g. Unknown Player) should never appear."""
        unknown = Player(
            full_name="Unknown Player", user_id=None, is_placeholder=False, status="system"
        )
        db_session.add(unknown)
        await db_session.commit()

        items, total = await data_service.list_players_search(db_session)
        names = [item["full_name"] for item in items]
        assert "Unknown Player" not in names

    @pytest.mark.asyncio
    async def test_included_when_scoped_by_creator(self, db_session, creator_player):
        """Creator's own placeholders appear when include_placeholders_for_player_id is set."""
        await placeholder_service.create_placeholder(
            db_session, name="Visible Placeholder", created_by_player_id=creator_player.id
        )

        items, total = await data_service.list_players_search(
            db_session, include_placeholders_for_player_id=creator_player.id
        )
        names = [item["full_name"] for item in items]
        assert "Visible Placeholder" in names

    @pytest.mark.asyncio
    async def test_other_creators_placeholders_excluded(
        self, db_session, creator_player, other_player
    ):
        """Another creator's placeholders should NOT appear even with scoping."""
        await placeholder_service.create_placeholder(
            db_session, name="Other's Placeholder", created_by_player_id=other_player.id
        )

        items, total = await data_service.list_players_search(
            db_session, include_placeholders_for_player_id=creator_player.id
        )
        names = [item["full_name"] for item in items]
        assert "Other's Placeholder" not in names

    @pytest.mark.asyncio
    async def test_scoped_by_league(
        self, db_session, creator_player, other_player, test_league
    ):
        """Placeholders in the specified league appear when scoped."""
        # Other player creates a placeholder and adds it to the league
        ph = await placeholder_service.create_placeholder(
            db_session,
            name="League Scoped Placeholder",
            created_by_player_id=other_player.id,
            league_id=test_league.id,
        )

        items, total = await data_service.list_players_search(
            db_session,
            include_placeholders_for_player_id=creator_player.id,
            league_ids=[test_league.id],
        )
        names = [item["full_name"] for item in items]
        assert "League Scoped Placeholder" in names

    @pytest.mark.asyncio
    async def test_scoped_by_session(
        self, db_session, creator_player, other_player, test_session
    ):
        """Placeholders in the specified session appear when scoped."""
        ph = await placeholder_service.create_placeholder(
            db_session,
            name="Session Scoped Placeholder",
            created_by_player_id=other_player.id,
        )

        # Add placeholder as session participant
        sp = SessionParticipant(
            session_id=test_session.id,
            player_id=ph.player_id,
            invited_by=other_player.id,
        )
        db_session.add(sp)
        await db_session.commit()

        items, total = await data_service.list_players_search(
            db_session,
            include_placeholders_for_player_id=creator_player.id,
            session_id=test_session.id,
        )
        names = [item["full_name"] for item in items]
        assert "Session Scoped Placeholder" in names

    @pytest.mark.asyncio
    async def test_is_placeholder_in_response_items(self, db_session, creator_player):
        """Search results should include is_placeholder field."""
        await placeholder_service.create_placeholder(
            db_session, name="Flagged Placeholder", created_by_player_id=creator_player.id
        )

        items, total = await data_service.list_players_search(
            db_session, include_placeholders_for_player_id=creator_player.id
        )

        placeholder_items = [i for i in items if i["full_name"] == "Flagged Placeholder"]
        assert len(placeholder_items) == 1
        assert placeholder_items[0]["is_placeholder"] is True

        real_items = [i for i in items if i["full_name"] == "Creator Player"]
        assert len(real_items) == 1
        assert real_items[0]["is_placeholder"] is False


# ============================================================================
# 5. is_ranked enforcement tests
# ============================================================================


class TestIsRankedEnforcement:
    """Tests for is_ranked enforcement when placeholders are in a match."""

    @pytest.mark.asyncio
    async def test_match_with_placeholder_is_unranked(
        self, db_session, creator_player, other_player, test_session
    ):
        """Creating a match with a placeholder player forces is_ranked=False."""
        ph = await placeholder_service.create_placeholder(
            db_session, name="Placeholder In Match", created_by_player_id=creator_player.id
        )

        match_request = CreateMatchRequest(
            session_id=test_session.id,
            date="2/15/2026",
            team1_player1_id=creator_player.id,
            team1_player2_id=ph.player_id,
            team2_player1_id=other_player.id,
            team2_player2_id=creator_player.id,
            team1_score=21,
            team2_score=15,
            is_ranked=True,  # Explicitly requesting ranked
        )

        match_id = await data_service.create_match_async(
            db_session,
            match_request=match_request,
            session_id=test_session.id,
            date="2/15/2026",
        )

        match = await db_session.get(Match, match_id)
        assert match.is_ranked is False

    @pytest.mark.asyncio
    async def test_match_without_placeholder_respects_request(
        self, db_session, four_real_players, test_session
    ):
        """Match with only real players uses is_ranked from request."""
        p1, p2, p3, p4 = four_real_players

        match_request = CreateMatchRequest(
            session_id=test_session.id,
            date="2/15/2026",
            team1_player1_id=p1.id,
            team1_player2_id=p2.id,
            team2_player1_id=p3.id,
            team2_player2_id=p4.id,
            team1_score=21,
            team2_score=19,
            is_ranked=True,
        )

        match_id = await data_service.create_match_async(
            db_session,
            match_request=match_request,
            session_id=test_session.id,
            date="2/15/2026",
        )

        match = await db_session.get(Match, match_id)
        assert match.is_ranked is True

    @pytest.mark.asyncio
    async def test_match_without_placeholder_defaults_ranked(
        self, db_session, four_real_players, test_session
    ):
        """Match with real players and is_ranked=None defaults to True."""
        p1, p2, p3, p4 = four_real_players

        match_request = CreateMatchRequest(
            session_id=test_session.id,
            date="2/15/2026",
            team1_player1_id=p1.id,
            team1_player2_id=p2.id,
            team2_player1_id=p3.id,
            team2_player2_id=p4.id,
            team1_score=21,
            team2_score=19,
            is_ranked=None,
        )

        match_id = await data_service.create_match_async(
            db_session,
            match_request=match_request,
            session_id=test_session.id,
            date="2/15/2026",
        )

        match = await db_session.get(Match, match_id)
        assert match.is_ranked is True


# ============================================================================
# 6. check_match_has_placeholders tests
# ============================================================================


class TestCheckMatchHasPlaceholders:
    """Tests for placeholder_service.check_match_has_placeholders."""

    @pytest.mark.asyncio
    async def test_returns_true_when_placeholder_present(
        self, db_session, creator_player
    ):
        """Returns True if any ID in the list is a placeholder."""
        ph = await placeholder_service.create_placeholder(
            db_session, name="Check Me", created_by_player_id=creator_player.id
        )

        result = await placeholder_service.check_match_has_placeholders(
            db_session, [creator_player.id, ph.player_id]
        )
        assert result is True

    @pytest.mark.asyncio
    async def test_returns_false_when_no_placeholders(
        self, db_session, creator_player, other_player
    ):
        """Returns False if no IDs are placeholders."""
        result = await placeholder_service.check_match_has_placeholders(
            db_session, [creator_player.id, other_player.id]
        )
        assert result is False

    @pytest.mark.asyncio
    async def test_returns_false_for_empty_list(self, db_session):
        """Returns False for empty player_ids list."""
        result = await placeholder_service.check_match_has_placeholders(db_session, [])
        assert result is False
