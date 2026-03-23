"""
Unit tests for kob_advancement.py.

Tests bracket advancement logic, round completion checks, playoff transitions,
draft bracket creation, and tournament completion.
All tests require a DB session via the db_session fixture.
"""

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from backend.services import kob_service
from backend.services.kob_advancement import (
    check_round_complete,
    advance_round,
    complete_tournament,
    update_bracket_match,
)
from backend.database.models import (
    User,
    Player,
    KobPlayer,
    KobTournament,
    KobMatch,
    TournamentStatus,
)


# ---------------------------------------------------------------------------
# Shared test helpers
# ---------------------------------------------------------------------------


async def _create_player(db_session, name: str, phone: str = None) -> int:
    """Create a User + Player pair. Returns player_id."""
    phone = phone or f"+1555{abs(hash(name)) % 10**7:07d}"
    user = User(phone_number=phone, password_hash="hash", is_verified=True)
    db_session.add(user)
    await db_session.flush()
    player = Player(full_name=name, user_id=user.id)
    db_session.add(player)
    await db_session.flush()
    await db_session.refresh(player)
    return player.id


async def _create_tournament(db_session, director_id: int, **overrides) -> tuple:
    """Create a SETUP tournament. Returns (tournament_id, code)."""
    data = {
        "name": "Advancement Test KOB",
        "gender": "coed",
        "format": "FULL_ROUND_ROBIN",
        "game_to": 21,
        "num_courts": 2,
        "games_per_match": 1,
        **overrides,
    }
    t = await kob_service.create_tournament(db_session, director_id, data)
    return t.id, t.code


async def _add_players(db_session, tournament_id: int, player_ids: list) -> None:
    """Add players to tournament with sequential seeds."""
    for i, pid in enumerate(player_ids):
        entry = KobPlayer(tournament_id=tournament_id, player_id=pid, seed=i + 1)
        db_session.add(entry)
    await db_session.flush()


async def _start_tournament(db_session, director_id: int, player_ids: list, **overrides) -> int:
    """Create, populate, and start a tournament. Returns tournament_id."""
    tid, _ = await _create_tournament(db_session, director_id, **overrides)
    await _add_players(db_session, tid, player_ids)
    await kob_service.start_tournament(db_session, tid, director_id)
    return tid


async def _fresh_tournament(db_session, tournament_id: int) -> KobTournament:
    """Reload tournament with eager-loaded relationships."""
    result = await db_session.execute(
        select(KobTournament)
        .options(
            selectinload(KobTournament.kob_players).selectinload(KobPlayer.player),
            selectinload(KobTournament.kob_matches),
            selectinload(KobTournament.director),
        )
        .where(KobTournament.id == tournament_id)
        .execution_options(populate_existing=True)
    )
    return result.scalar_one_or_none()


async def _score_round(db_session, tournament_id: int, round_num: int) -> None:
    """Score all non-bye matches in a round so team1 wins every match."""
    result = await db_session.execute(
        select(KobMatch).where(
            KobMatch.tournament_id == tournament_id,
            KobMatch.round_num == round_num,
            KobMatch.is_bye.is_(False),
        )
    )
    matches = result.scalars().all()
    for m in matches:
        m.team1_score = 21
        m.team2_score = 15
        m.winner = 1
    await db_session.flush()


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def director(db_session):
    return await _create_player(db_session, "Director D", "+15550000001")


@pytest_asyncio.fixture
async def four_players(db_session):
    names = ["P1", "P2", "P3", "P4"]
    return [await _create_player(db_session, n, f"+155511{i:04d}") for i, n in enumerate(names)]


@pytest_asyncio.fixture
async def six_players(db_session):
    names = ["P1", "P2", "P3", "P4", "P5", "P6"]
    return [await _create_player(db_session, n, f"+155522{i:04d}") for i, n in enumerate(names)]


# ---------------------------------------------------------------------------
# check_round_complete
# ---------------------------------------------------------------------------


class TestCheckRoundComplete:
    @pytest.mark.asyncio
    async def test_all_scored_returns_true(self, db_session, director, four_players):
        tid = await _start_tournament(db_session, director, four_players)
        await _score_round(db_session, tid, 1)
        assert await check_round_complete(db_session, tid, 1) is True

    @pytest.mark.asyncio
    async def test_unscored_returns_false(self, db_session, director, four_players):
        tid = await _start_tournament(db_session, director, four_players)
        # No matches scored yet
        assert await check_round_complete(db_session, tid, 1) is False

    @pytest.mark.asyncio
    async def test_partial_scoring_returns_false(self, db_session, director, six_players):
        tid = await _start_tournament(db_session, director, six_players)
        # Score only one match in round 1 (there are multiple)
        result = await db_session.execute(
            select(KobMatch).where(
                KobMatch.tournament_id == tid,
                KobMatch.round_num == 1,
                KobMatch.is_bye.is_(False),
            )
        )
        matches = result.scalars().all()
        if len(matches) > 1:
            first = matches[0]
            first.team1_score = 21
            first.team2_score = 15
            first.winner = 1
            await db_session.flush()
            assert await check_round_complete(db_session, tid, 1) is False

    @pytest.mark.asyncio
    async def test_nonexistent_round_returns_true(self, db_session, director, four_players):
        """A round with no matches (nonexistent) is trivially complete."""
        tid = await _start_tournament(db_session, director, four_players)
        # Round 999 does not exist — 0 unscored matches means complete
        assert await check_round_complete(db_session, tid, 999) is True

    @pytest.mark.asyncio
    async def test_bye_matches_ignored(self, db_session, director):
        """Bye matches should not prevent round completion. Needs >= 4 players."""
        player_ids = [
            await _create_player(db_session, f"BP{i}", f"+155533{i:04d}") for i in range(5)
        ]
        tid = await _start_tournament(db_session, director, player_ids)
        # Score all non-bye matches in round 1
        await _score_round(db_session, tid, 1)
        # Round should be complete even though there may be a bye
        assert await check_round_complete(db_session, tid, 1) is True


# ---------------------------------------------------------------------------
# advance_round
# ---------------------------------------------------------------------------


class TestAdvanceRound:
    @pytest.mark.asyncio
    async def test_advances_round_number(self, db_session, director, four_players):
        tid = await _start_tournament(db_session, director, four_players)
        t = await _fresh_tournament(db_session, tid)
        initial_round = t.current_round

        await _score_round(db_session, tid, initial_round)
        t = await advance_round(db_session, tid)
        assert t.current_round == initial_round + 1

    @pytest.mark.asyncio
    async def test_tournament_not_found_raises(self, db_session):
        with pytest.raises(ValueError, match="Tournament not found"):
            await advance_round(db_session, 999999)

    @pytest.mark.asyncio
    async def test_inactive_tournament_raises(self, db_session, director, four_players):
        tid, _ = await _create_tournament(db_session, director)
        # Tournament is in SETUP status — not ACTIVE
        with pytest.raises(ValueError, match="not active"):
            await advance_round(db_session, tid)

    @pytest.mark.asyncio
    async def test_last_round_completes_tournament(self, db_session, director, four_players):
        """Advancing past the last round should set status to COMPLETED."""
        tid = await _start_tournament(db_session, director, four_players)
        t = await _fresh_tournament(db_session, tid)
        total = t.schedule_data["total_rounds"]

        # Score and advance through each round sequentially
        for rnd in range(1, total + 1):
            await _score_round(db_session, tid, rnd)
            t = await advance_round(db_session, tid)

        assert t.status == TournamentStatus.COMPLETED

    @pytest.mark.asyncio
    async def test_returns_kob_tournament(self, db_session, director, four_players):
        tid = await _start_tournament(db_session, director, four_players)
        await _score_round(db_session, tid, 1)
        result = await advance_round(db_session, tid)
        assert isinstance(result, KobTournament)


# ---------------------------------------------------------------------------
# Playoff transitions
# ---------------------------------------------------------------------------


class TestPoolsPlayoffTransition:
    @pytest.mark.asyncio
    async def test_advances_to_playoffs_phase(self, db_session, director, six_players):
        """After all pool play rounds, advancing should switch to playoffs phase."""
        tid = await _start_tournament(
            db_session,
            director,
            six_players,
            format="POOLS_PLAYOFFS",
            num_pools=2,
            playoff_size=4,
            has_playoffs=True,
        )
        t = await _fresh_tournament(db_session, tid)
        total_pool_rounds = t.schedule_data["total_rounds"]

        # Score and advance through each pool play round sequentially
        for rnd in range(1, total_pool_rounds + 1):
            await _score_round(db_session, tid, rnd)
            t = await advance_round(db_session, tid)

        assert t.current_phase == "playoffs"

    @pytest.mark.asyncio
    async def test_playoff_matches_created(self, db_session, director, six_players):
        """After pool play, playoff KobMatch rows should be created."""
        tid = await _start_tournament(
            db_session,
            director,
            six_players,
            format="POOLS_PLAYOFFS",
            num_pools=2,
            playoff_size=4,
            has_playoffs=True,
        )
        t = await _fresh_tournament(db_session, tid)
        total_pool_rounds = t.schedule_data["total_rounds"]

        # Score and advance through each pool play round
        for rnd in range(1, total_pool_rounds + 1):
            await _score_round(db_session, tid, rnd)
            await advance_round(db_session, tid)

        result = await db_session.execute(
            select(KobMatch).where(
                KobMatch.tournament_id == tid,
                KobMatch.phase == "playoffs",
            )
        )
        playoff_matches = result.scalars().all()
        assert len(playoff_matches) > 0


# ---------------------------------------------------------------------------
# Draft bracket
# ---------------------------------------------------------------------------


class TestDraftBracket:
    @pytest.mark.asyncio
    async def test_draft_top4_creates_final_match(self, db_session, director, four_players):
        """DRAFT format with 4 players should produce a final bracket match."""
        tid = await _start_tournament(
            db_session,
            director,
            four_players,
            format="POOLS_PLAYOFFS",
            num_pools=2,
            playoff_size=4,
            has_playoffs=True,
            playoff_format="DRAFT",
        )
        t = await _fresh_tournament(db_session, tid)
        pool_rounds = t.schedule_data["total_rounds"]

        for rnd in range(1, pool_rounds + 1):
            await _score_round(db_session, tid, rnd)

        await advance_round(db_session, tid)

        result = await db_session.execute(
            select(KobMatch).where(
                KobMatch.tournament_id == tid,
                KobMatch.bracket_position == "final",
            )
        )
        final_match = result.scalar_one_or_none()
        assert final_match is not None
        assert final_match.phase == "playoffs"

    @pytest.mark.asyncio
    async def test_draft_top6_creates_semifinal_first(self, db_session, director, six_players):
        """DRAFT format with 6 players should produce a semifinal match first."""
        tid = await _start_tournament(
            db_session,
            director,
            six_players,
            format="POOLS_PLAYOFFS",
            num_pools=2,
            playoff_size=6,
            has_playoffs=True,
            playoff_format="DRAFT",
        )
        t = await _fresh_tournament(db_session, tid)
        pool_rounds = t.schedule_data["total_rounds"]

        # Score and advance through each pool play round
        for rnd in range(1, pool_rounds + 1):
            await _score_round(db_session, tid, rnd)
            await advance_round(db_session, tid)

        result = await db_session.execute(
            select(KobMatch).where(
                KobMatch.tournament_id == tid,
                KobMatch.bracket_position == "semifinal",
            )
        )
        semi_matches = result.scalars().all()
        assert len(semi_matches) >= 1


# ---------------------------------------------------------------------------
# update_bracket_match
# ---------------------------------------------------------------------------


class TestUpdateBracketMatch:
    @pytest.mark.asyncio
    async def test_updates_team_assignments(self, db_session, director, four_players):
        tid = await _start_tournament(
            db_session,
            director,
            four_players,
            format="POOLS_PLAYOFFS",
            num_pools=2,
            playoff_size=4,
            has_playoffs=True,
            playoff_format="DRAFT",
        )
        t = await _fresh_tournament(db_session, tid)
        pool_rounds = t.schedule_data["total_rounds"]

        for rnd in range(1, pool_rounds + 1):
            await _score_round(db_session, tid, rnd)

        await advance_round(db_session, tid)

        result = await db_session.execute(
            select(KobMatch).where(
                KobMatch.tournament_id == tid,
                KobMatch.bracket_position == "final",
            )
        )
        final_match = result.scalar_one_or_none()
        assert final_match is not None

        new_t1 = [four_players[0], four_players[2]]
        new_t2 = [four_players[1], four_players[3]]
        updated = await update_bracket_match(
            db_session, tid, final_match.id, team1=new_t1, team2=new_t2
        )
        assert updated.team1_player1_id == new_t1[0]
        assert updated.team1_player2_id == new_t1[1]
        assert updated.team2_player1_id == new_t2[0]
        assert updated.team2_player2_id == new_t2[1]

    @pytest.mark.asyncio
    async def test_nonexistent_match_raises(self, db_session, director, four_players):
        tid = await _start_tournament(db_session, director, four_players)
        with pytest.raises(ValueError, match="Match not found"):
            await update_bracket_match(db_session, tid, 999999, [1, 2], [3, 4])

    @pytest.mark.asyncio
    async def test_already_scored_raises(self, db_session, director, four_players):
        tid = await _start_tournament(
            db_session,
            director,
            four_players,
            format="POOLS_PLAYOFFS",
            num_pools=2,
            playoff_size=4,
            has_playoffs=True,
            playoff_format="DRAFT",
        )
        t = await _fresh_tournament(db_session, tid)
        pool_rounds = t.schedule_data["total_rounds"]

        for rnd in range(1, pool_rounds + 1):
            await _score_round(db_session, tid, rnd)

        await advance_round(db_session, tid)

        result = await db_session.execute(
            select(KobMatch).where(
                KobMatch.tournament_id == tid,
                KobMatch.bracket_position == "final",
            )
        )
        final_match = result.scalar_one_or_none()

        # Score the match
        final_match.team1_score = 21
        final_match.team2_score = 15
        final_match.winner = 1
        await db_session.flush()

        with pytest.raises(ValueError, match="already been scored"):
            await update_bracket_match(
                db_session,
                tid,
                final_match.id,
                [four_players[0], four_players[2]],
                [four_players[1], four_players[3]],
            )

    @pytest.mark.asyncio
    async def test_wrong_team_size_raises(self, db_session, director, four_players):
        tid = await _start_tournament(
            db_session,
            director,
            four_players,
            format="POOLS_PLAYOFFS",
            num_pools=2,
            playoff_size=4,
            has_playoffs=True,
            playoff_format="DRAFT",
        )
        t = await _fresh_tournament(db_session, tid)
        pool_rounds = t.schedule_data["total_rounds"]

        for rnd in range(1, pool_rounds + 1):
            await _score_round(db_session, tid, rnd)

        await advance_round(db_session, tid)

        result = await db_session.execute(
            select(KobMatch).where(
                KobMatch.tournament_id == tid,
                KobMatch.bracket_position == "final",
            )
        )
        final_match = result.scalar_one_or_none()

        with pytest.raises(ValueError, match="exactly 2 players"):
            await update_bracket_match(
                db_session,
                tid,
                final_match.id,
                [four_players[0]],
                [four_players[1], four_players[2]],
            )

    @pytest.mark.asyncio
    async def test_non_bracket_match_raises(self, db_session, director, four_players):
        tid = await _start_tournament(db_session, director, four_players)
        result = await db_session.execute(
            select(KobMatch).where(
                KobMatch.tournament_id == tid,
                KobMatch.is_bye.is_(False),
            )
        )
        pool_match = result.scalars().first()
        assert pool_match is not None

        with pytest.raises(ValueError, match="bracket matches"):
            await update_bracket_match(
                db_session,
                tid,
                pool_match.id,
                [four_players[0], four_players[1]],
                [four_players[2], four_players[3]],
            )


# ---------------------------------------------------------------------------
# complete_tournament
# ---------------------------------------------------------------------------


class TestCompleteTournament:
    @pytest.mark.asyncio
    async def test_director_can_complete(self, db_session, director, four_players):
        tid = await _start_tournament(db_session, director, four_players)
        t = await complete_tournament(db_session, tid, director)
        assert t.status == TournamentStatus.COMPLETED

    @pytest.mark.asyncio
    async def test_non_director_raises(self, db_session, director, four_players):
        other = await _create_player(db_session, "Other Player", "+15556666666")
        tid = await _start_tournament(db_session, director, four_players)
        with pytest.raises(ValueError, match="director"):
            await complete_tournament(db_session, tid, other)

    @pytest.mark.asyncio
    async def test_nonexistent_tournament_raises(self, db_session, director):
        with pytest.raises(ValueError, match="Tournament not found"):
            await complete_tournament(db_session, 999999, director)

    @pytest.mark.asyncio
    async def test_inactive_tournament_raises(self, db_session, director, four_players):
        tid, _ = await _create_tournament(db_session, director)
        # SETUP status is not ACTIVE
        with pytest.raises(ValueError, match="not active"):
            await complete_tournament(db_session, tid, director)

    @pytest.mark.asyncio
    async def test_returns_kob_tournament(self, db_session, director, four_players):
        tid = await _start_tournament(db_session, director, four_players)
        result = await complete_tournament(db_session, tid, director)
        assert isinstance(result, KobTournament)
