"""
Unit tests for KOB tournament service.

Tests tournament CRUD, player management, scoring (single-game and Bo3),
standings, round advancement, draft bracket playoffs, and edge cases.
Requires a test PostgreSQL database.
"""

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from backend.services import kob_service
from backend.database.models import (
    User,
    Player,
    KobPlayer,
    KobTournament,
    TournamentStatus,
    TournamentFormat,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _create_player(db_session, name, phone=None):
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


async def _create_tournament(db_session, director_id, **overrides):
    """Create a SETUP tournament with sane defaults. Returns (tournament_id, code)."""
    data = {
        "name": "Test KOB",
        "gender": "coed",
        "format": "FULL_ROUND_ROBIN",
        "game_to": 21,
        "num_courts": 2,
        "games_per_match": 1,
        **overrides,
    }
    t = await kob_service.create_tournament(db_session, director_id, data)
    # Return scalars so callers don't hold a stale ORM reference
    return t.id, t.code


async def _add_players(db_session, tournament_id, player_ids):
    """Add players to tournament via direct KobPlayer inserts."""
    for i, pid in enumerate(player_ids):
        entry = KobPlayer(tournament_id=tournament_id, player_id=pid, seed=i + 1)
        db_session.add(entry)
    await db_session.flush()


async def _fresh_tournament(db_session, tournament_id):
    """Load a tournament with fully refreshed eager loads.

    Uses populate_existing to bypass the identity map cache, ensuring
    that kob_players and kob_matches reflect the latest DB state.
    """
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


async def _start_tournament(db_session, director_id, player_ids, **overrides):
    """Create a tournament, add players, start it. Returns tournament_id."""
    tid, _ = await _create_tournament(db_session, director_id, **overrides)
    await _add_players(db_session, tid, player_ids)
    await kob_service.start_tournament(db_session, tid, director_id)
    return tid


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def director(db_session):
    """Create a director player."""
    return await _create_player(db_session, "Director Dave", "+15550000001")


@pytest_asyncio.fixture
async def players(db_session):
    """Create 6 test players (not including the director)."""
    names = ["Alice", "Bob", "Carol", "Dan", "Eve", "Frank"]
    pids = []
    for i, name in enumerate(names):
        pid = await _create_player(db_session, name, f"+1555100{i:04d}")
        pids.append(pid)
    return pids


# ═══════════════════════════════════════════════════════════════════════════
# Tournament CRUD
# ═══════════════════════════════════════════════════════════════════════════


class TestCreateTournament:
    """Tests for create_tournament()."""

    @pytest.mark.asyncio
    async def test_creates_with_defaults(self, db_session, director):
        tid, code = await _create_tournament(db_session, director)
        t = await _fresh_tournament(db_session, tid)
        assert t.name == "Test KOB"
        assert t.status == TournamentStatus.SETUP
        assert code.startswith("KOB-")
        assert len(code) == 10
        assert t.director_player_id == director
        assert t.game_to == 21
        assert t.win_by == 2
        assert t.auto_advance is True

    @pytest.mark.asyncio
    async def test_creates_with_custom_config(self, db_session, director):
        tid, _ = await _create_tournament(
            db_session, director,
            name="Custom Tourney",
            format="POOLS_PLAYOFFS",
            game_to=15,
            num_courts=4,
            num_pools=2,
            playoff_size=4,
            games_per_match=3,
            has_playoffs=True,
            scheduled_date="2026-07-04",
        )
        t = await _fresh_tournament(db_session, tid)
        assert t.name == "Custom Tourney"
        assert t.format == TournamentFormat.POOLS_PLAYOFFS
        assert t.game_to == 15
        assert t.num_courts == 4
        assert t.num_pools == 2
        assert t.games_per_match == 3
        assert t.has_playoffs is True
        assert str(t.scheduled_date) == "2026-07-04"

    @pytest.mark.asyncio
    async def test_generates_unique_codes(self, db_session, director):
        codes = set()
        for _ in range(5):
            _, code = await _create_tournament(db_session, director)
            codes.add(code)
        assert len(codes) == 5


class TestUpdateTournament:
    """Tests for update_tournament()."""

    @pytest.mark.asyncio
    async def test_updates_name_and_config(self, db_session, director):
        tid, _ = await _create_tournament(db_session, director)
        updated = await kob_service.update_tournament(
            db_session, tid, director, {"name": "Renamed", "game_to": 15}
        )
        assert updated.name == "Renamed"
        assert updated.game_to == 15

    @pytest.mark.asyncio
    async def test_rejects_non_director(self, db_session, director, players):
        tid, _ = await _create_tournament(db_session, director)
        with pytest.raises(ValueError, match="Only the director"):
            await kob_service.update_tournament(
                db_session, tid, players[0], {"name": "Hacked"}
            )

    @pytest.mark.asyncio
    async def test_rejects_non_setup(self, db_session, director, players):
        tid = await _start_tournament(db_session, director, players[:4])
        with pytest.raises(ValueError, match="SETUP"):
            await kob_service.update_tournament(
                db_session, tid, director, {"name": "Late Change"}
            )


class TestDeleteTournament:
    """Tests for delete_tournament()."""

    @pytest.mark.asyncio
    async def test_deletes_setup_tournament(self, db_session, director):
        tid, _ = await _create_tournament(db_session, director)
        await kob_service.delete_tournament(db_session, tid, director)
        assert await kob_service.get_tournament(db_session, tid) is None

    @pytest.mark.asyncio
    async def test_rejects_delete_active(self, db_session, director, players):
        tid = await _start_tournament(db_session, director, players[:4])
        with pytest.raises(ValueError, match="SETUP"):
            await kob_service.delete_tournament(db_session, tid, director)

    @pytest.mark.asyncio
    async def test_rejects_non_director_delete(self, db_session, director, players):
        tid, _ = await _create_tournament(db_session, director)
        with pytest.raises(ValueError, match="Only the director"):
            await kob_service.delete_tournament(db_session, tid, players[0])


# ═══════════════════════════════════════════════════════════════════════════
# Player management
# ═══════════════════════════════════════════════════════════════════════════


class TestAddPlayer:
    """Tests for add_player()."""

    @pytest.mark.asyncio
    async def test_adds_player_with_auto_seed(self, db_session, director, players):
        tid, _ = await _create_tournament(db_session, director)
        entry = await kob_service.add_player(db_session, tid, players[0])
        assert entry.player_id == players[0]
        assert entry.seed == 1

        entry2 = await kob_service.add_player(db_session, tid, players[1])
        assert entry2.seed == 2

    @pytest.mark.asyncio
    async def test_adds_player_with_explicit_seed(self, db_session, director, players):
        tid, _ = await _create_tournament(db_session, director)
        entry = await kob_service.add_player(db_session, tid, players[0], seed=5)
        assert entry.seed == 5

    @pytest.mark.asyncio
    async def test_rejects_duplicate_player(self, db_session, director, players):
        tid, _ = await _create_tournament(db_session, director)
        await kob_service.add_player(db_session, tid, players[0])
        with pytest.raises(ValueError, match="already in this tournament"):
            await kob_service.add_player(db_session, tid, players[0])

    @pytest.mark.asyncio
    async def test_rejects_nonexistent_player(self, db_session, director):
        tid, _ = await _create_tournament(db_session, director)
        with pytest.raises(ValueError, match="not found"):
            await kob_service.add_player(db_session, tid, 999999)

    @pytest.mark.asyncio
    async def test_rejects_add_after_start(self, db_session, director, players):
        tid = await _start_tournament(db_session, director, players[:4])
        with pytest.raises(ValueError, match="SETUP"):
            await kob_service.add_player(db_session, tid, players[4])


class TestRemovePlayer:
    """Tests for remove_player()."""

    @pytest.mark.asyncio
    async def test_removes_player(self, db_session, director, players):
        tid, _ = await _create_tournament(db_session, director)
        await kob_service.add_player(db_session, tid, players[0])
        await kob_service.remove_player(db_session, tid, players[0])

        refreshed = await _fresh_tournament(db_session, tid)
        player_ids = [kp.player_id for kp in refreshed.kob_players]
        assert players[0] not in player_ids

    @pytest.mark.asyncio
    async def test_rejects_remove_after_start(self, db_session, director, players):
        tid = await _start_tournament(db_session, director, players[:4])
        with pytest.raises(ValueError, match="SETUP"):
            await kob_service.remove_player(db_session, tid, players[0])


class TestReorderSeeds:
    """Tests for reorder_seeds()."""

    @pytest.mark.asyncio
    async def test_reorders_seeds(self, db_session, director, players):
        tid, _ = await _create_tournament(db_session, director)
        await _add_players(db_session, tid, players[:4])

        reversed_ids = list(reversed(players[:4]))
        await kob_service.reorder_seeds(db_session, tid, reversed_ids)

        refreshed = await _fresh_tournament(db_session, tid)
        seed_map = {kp.player_id: kp.seed for kp in refreshed.kob_players}
        assert seed_map[reversed_ids[0]] == 1
        assert seed_map[reversed_ids[3]] == 4

    @pytest.mark.asyncio
    async def test_rejects_unknown_player_ids(self, db_session, director, players):
        tid, _ = await _create_tournament(db_session, director)
        await _add_players(db_session, tid, [players[0]])

        with pytest.raises(ValueError, match="Unknown player IDs"):
            await kob_service.reorder_seeds(db_session, tid, [999999])

    @pytest.mark.asyncio
    async def test_rejects_reorder_after_start(self, db_session, director, players):
        tid = await _start_tournament(db_session, director, players[:4])
        with pytest.raises(ValueError, match="SETUP"):
            await kob_service.reorder_seeds(db_session, tid, players[:4])


# ═══════════════════════════════════════════════════════════════════════════
# Start tournament
# ═══════════════════════════════════════════════════════════════════════════


class TestStartTournament:
    """Tests for start_tournament()."""

    @pytest.mark.asyncio
    async def test_starts_with_schedule(self, db_session, director, players):
        tid = await _start_tournament(db_session, director, players[:6])
        t = await _fresh_tournament(db_session, tid)
        assert t.status == TournamentStatus.ACTIVE
        assert t.current_round == 1
        assert t.current_phase == "pool_play"
        assert t.schedule_data is not None
        assert "rounds" in t.schedule_data

    @pytest.mark.asyncio
    async def test_creates_match_rows(self, db_session, director, players):
        tid = await _start_tournament(db_session, director, players[:4])
        t = await _fresh_tournament(db_session, tid)
        assert len(t.kob_matches) > 0
        for m in t.kob_matches:
            assert m.team1_player1_id is not None
            assert m.team2_player1_id is not None

    @pytest.mark.asyncio
    async def test_rejects_too_few_players(self, db_session, director, players):
        tid, _ = await _create_tournament(db_session, director)
        await _add_players(db_session, tid, players[:3])  # Only 3
        with pytest.raises(ValueError, match="at least 4"):
            await kob_service.start_tournament(db_session, tid, director)

    @pytest.mark.asyncio
    async def test_rejects_non_director_start(self, db_session, director, players):
        tid, _ = await _create_tournament(db_session, director)
        await _add_players(db_session, tid, players[:4])
        with pytest.raises(ValueError, match="Only the director"):
            await kob_service.start_tournament(db_session, tid, players[0])

    @pytest.mark.asyncio
    async def test_rejects_double_start(self, db_session, director, players):
        tid = await _start_tournament(db_session, director, players[:4])
        with pytest.raises(ValueError, match="not in SETUP"):
            await kob_service.start_tournament(db_session, tid, director)


# ═══════════════════════════════════════════════════════════════════════════
# Score validation
# ═══════════════════════════════════════════════════════════════════════════


class TestValidateScore:
    """Tests for _validate_score()."""

    def test_valid_standard_score(self):
        kob_service._validate_score(21, 15, game_to=21)

    def test_valid_deuce_score(self):
        kob_service._validate_score(23, 21, game_to=21)

    def test_valid_cap_score(self):
        kob_service._validate_score(28, 27, game_to=21, score_cap=28)

    def test_rejects_negative(self):
        with pytest.raises(ValueError, match="negative"):
            kob_service._validate_score(-1, 21, game_to=21)

    def test_rejects_tie(self):
        with pytest.raises(ValueError, match="tied"):
            kob_service._validate_score(21, 21, game_to=21)

    def test_rejects_below_game_to(self):
        with pytest.raises(ValueError, match="at least"):
            kob_service._validate_score(18, 15, game_to=21)

    def test_rejects_not_win_by_2(self):
        with pytest.raises(ValueError, match="win by at least 2"):
            kob_service._validate_score(21, 20, game_to=21)

    def test_rejects_above_cap(self):
        with pytest.raises(ValueError, match="cap"):
            kob_service._validate_score(30, 28, game_to=21, score_cap=28)

    def test_rejects_incorrect_deuce_spread(self):
        with pytest.raises(ValueError, match="exactly 2"):
            kob_service._validate_score(25, 20, game_to=21)


# ═══════════════════════════════════════════════════════════════════════════
# Scoring — single game
# ═══════════════════════════════════════════════════════════════════════════


def _r1_matches(tournament):
    """Return round-1 non-bye matches from a loaded tournament."""
    return [m for m in tournament.kob_matches if m.round_num == 1 and not m.is_bye]


class TestSubmitScore:
    """Tests for submit_score() in single-game mode."""

    @pytest.mark.asyncio
    async def test_scores_match(self, db_session, director, players):
        tid = await _start_tournament(db_session, director, players[:4])
        t = await _fresh_tournament(db_session, tid)
        t.auto_advance = False
        await db_session.flush()

        m = _r1_matches(t)[0]
        scored = await kob_service.submit_score(
            db_session, tid, m.matchup_id, 21, 15
        )
        assert scored.team1_score == 21
        assert scored.team2_score == 15
        assert scored.winner == 1

    @pytest.mark.asyncio
    async def test_rejects_future_round_score(self, db_session, director, players):
        """Cannot score a match in a future round."""
        tid = await _start_tournament(db_session, director, players[:4])
        t = await _fresh_tournament(db_session, tid)

        future = [m for m in t.kob_matches if m.round_num > 1 and not m.is_bye]
        if future:
            with pytest.raises(ValueError, match="round"):
                await kob_service.submit_score(
                    db_session, tid, future[0].matchup_id, 21, 15
                )

    @pytest.mark.asyncio
    async def test_rejects_double_score(self, db_session, director, players):
        tid = await _start_tournament(db_session, director, players[:4])
        t = await _fresh_tournament(db_session, tid)
        t.auto_advance = False
        await db_session.flush()

        m = _r1_matches(t)[0]
        await kob_service.submit_score(db_session, tid, m.matchup_id, 21, 15)
        with pytest.raises(ValueError, match="already scored"):
            await kob_service.submit_score(db_session, tid, m.matchup_id, 21, 18)

    @pytest.mark.asyncio
    async def test_rejects_inactive_tournament(self, db_session, director, players):
        tid, _ = await _create_tournament(db_session, director)
        await _add_players(db_session, tid, players[:4])
        with pytest.raises(ValueError, match="not active"):
            await kob_service.submit_score(db_session, tid, "r1m1", 21, 15)

    @pytest.mark.asyncio
    async def test_rejects_bye_match(self, db_session, director, players):
        """Cannot score a bye match."""
        tid = await _start_tournament(db_session, director, players[:5])
        t = await _fresh_tournament(db_session, tid)

        byes = [m for m in t.kob_matches if m.is_bye and m.round_num == 1]
        if byes:
            with pytest.raises(ValueError, match="bye"):
                await kob_service.submit_score(
                    db_session, tid, byes[0].matchup_id, 21, 15
                )


# ═══════════════════════════════════════════════════════════════════════════
# Scoring — Bo3
# ═══════════════════════════════════════════════════════════════════════════


class TestBo3Scoring:
    """Tests for Bo3 (games_per_match=3) scoring logic."""

    @pytest.mark.asyncio
    async def test_bo3_two_game_sweep(self, db_session, director, players):
        """Team 1 wins 2-0: match decided after game 2."""
        tid = await _start_tournament(
            db_session, director, players[:4], games_per_match=3
        )
        t = await _fresh_tournament(db_session, tid)
        t.auto_advance = False
        await db_session.flush()

        m = _r1_matches(t)[0]

        result = await kob_service.submit_score(db_session, tid, m.matchup_id, 21, 15)
        assert result.winner is None
        assert len(result.game_scores) == 1

        result = await kob_service.submit_score(db_session, tid, m.matchup_id, 21, 18)
        assert result.winner == 1
        assert len(result.game_scores) == 2

    @pytest.mark.asyncio
    async def test_bo3_three_games(self, db_session, director, players):
        """Split to 1-1, then team 2 wins game 3."""
        tid = await _start_tournament(
            db_session, director, players[:4], games_per_match=3
        )
        t = await _fresh_tournament(db_session, tid)
        t.auto_advance = False
        await db_session.flush()

        m = _r1_matches(t)[0]

        await kob_service.submit_score(db_session, tid, m.matchup_id, 21, 15)
        await kob_service.submit_score(db_session, tid, m.matchup_id, 15, 21)
        result = await kob_service.submit_score(db_session, tid, m.matchup_id, 18, 21)
        assert result.winner == 2
        assert len(result.game_scores) == 3

    @pytest.mark.asyncio
    async def test_bo3_rejects_fourth_game(self, db_session, director, players):
        """Cannot add a 4th game score."""
        tid = await _start_tournament(
            db_session, director, players[:4], games_per_match=3
        )
        t = await _fresh_tournament(db_session, tid)
        t.auto_advance = False
        await db_session.flush()

        m = _r1_matches(t)[0]

        await kob_service.submit_score(db_session, tid, m.matchup_id, 21, 15)
        await kob_service.submit_score(db_session, tid, m.matchup_id, 15, 21)
        await kob_service.submit_score(db_session, tid, m.matchup_id, 21, 18)

        with pytest.raises(ValueError, match="already decided"):
            await kob_service.submit_score(db_session, tid, m.matchup_id, 21, 15)

    @pytest.mark.asyncio
    async def test_bo3_edit_game_index(self, db_session, director, players):
        """Director can edit a specific game score via game_index."""
        tid = await _start_tournament(
            db_session, director, players[:4], games_per_match=3
        )
        t = await _fresh_tournament(db_session, tid)
        t.auto_advance = False
        await db_session.flush()

        m = _r1_matches(t)[0]

        await kob_service.submit_score(db_session, tid, m.matchup_id, 21, 15)
        await kob_service.submit_score(db_session, tid, m.matchup_id, 21, 18)
        # Match decided team1 2-0. Edit game 0 so team2 actually won it.
        result = await kob_service.update_score(
            db_session, tid, m.matchup_id, 15, 21, game_index=0
        )
        # After edit: game0 team2 win, game1 team1 win → 1-1 → no winner
        assert result.winner is None


# ═══════════════════════════════════════════════════════════════════════════
# Director score override
# ═══════════════════════════════════════════════════════════════════════════


class TestUpdateScore:
    """Tests for update_score() (director override)."""

    @pytest.mark.asyncio
    async def test_overwrites_single_game_score(self, db_session, director, players):
        tid = await _start_tournament(db_session, director, players[:4])
        t = await _fresh_tournament(db_session, tid)
        t.auto_advance = False
        await db_session.flush()

        m = _r1_matches(t)[0]
        await kob_service.submit_score(db_session, tid, m.matchup_id, 21, 15)

        corrected = await kob_service.update_score(
            db_session, tid, m.matchup_id, 15, 21
        )
        assert corrected.team1_score == 15
        assert corrected.team2_score == 21
        assert corrected.winner == 2


# ═══════════════════════════════════════════════════════════════════════════
# Round advancement
# ═══════════════════════════════════════════════════════════════════════════


class TestRoundAdvancement:
    """Tests for check_round_complete() and advance_round()."""

    @pytest.mark.asyncio
    async def test_auto_advance_on_round_completion(self, db_session, director, players):
        """When auto_advance=True, scoring the last match advances the round."""
        tid = await _start_tournament(db_session, director, players[:4])
        t = await _fresh_tournament(db_session, tid)
        assert t.current_round == 1

        for m in _r1_matches(t):
            await kob_service.submit_score(db_session, tid, m.matchup_id, 21, 15)

        refreshed = await _fresh_tournament(db_session, tid)
        assert refreshed.current_round > 1

    @pytest.mark.asyncio
    async def test_manual_advance(self, db_session, director, players):
        """Director can manually advance when auto_advance is off."""
        tid = await _start_tournament(db_session, director, players[:4])
        t = await _fresh_tournament(db_session, tid)
        t.auto_advance = False
        await db_session.flush()

        for m in _r1_matches(t):
            await kob_service.submit_score(db_session, tid, m.matchup_id, 21, 15)

        refreshed = await _fresh_tournament(db_session, tid)
        assert refreshed.current_round == 1  # No auto-advance

        advanced = await kob_service.advance_round(db_session, tid)
        assert advanced.current_round == 2

    @pytest.mark.asyncio
    async def test_check_round_complete(self, db_session, director, players):
        tid = await _start_tournament(db_session, director, players[:4])
        t = await _fresh_tournament(db_session, tid)
        t.auto_advance = False
        await db_session.flush()

        assert not await kob_service.check_round_complete(db_session, tid, 1)

        for m in _r1_matches(t):
            await kob_service.submit_score(db_session, tid, m.matchup_id, 21, 15)

        assert await kob_service.check_round_complete(db_session, tid, 1)


# ═══════════════════════════════════════════════════════════════════════════
# Complete tournament
# ═══════════════════════════════════════════════════════════════════════════


class TestCompleteTournament:
    """Tests for complete_tournament()."""

    @pytest.mark.asyncio
    async def test_completes_active_tournament(self, db_session, director, players):
        tid = await _start_tournament(db_session, director, players[:4])
        completed = await kob_service.complete_tournament(db_session, tid, director)
        assert completed.status == TournamentStatus.COMPLETED

    @pytest.mark.asyncio
    async def test_rejects_complete_setup(self, db_session, director):
        tid, _ = await _create_tournament(db_session, director)
        with pytest.raises(ValueError, match="not active"):
            await kob_service.complete_tournament(db_session, tid, director)


# ═══════════════════════════════════════════════════════════════════════════
# Drop player
# ═══════════════════════════════════════════════════════════════════════════


class TestDropPlayer:
    """Tests for drop_player()."""

    @pytest.mark.asyncio
    async def test_drops_player_marks_future_byes(self, db_session, director, players):
        tid = await _start_tournament(db_session, director, players[:4])
        t = await _fresh_tournament(db_session, tid)
        t.auto_advance = False
        await db_session.flush()

        drop_pid = players[0]
        await kob_service.drop_player(db_session, tid, drop_pid)

        refreshed = await _fresh_tournament(db_session, tid)
        dropped_entry = [kp for kp in refreshed.kob_players if kp.player_id == drop_pid][0]
        assert dropped_entry.is_dropped is True
        assert dropped_entry.dropped_at_round == 1

        # Unscored matches with this player should be byes
        player_matches = [
            m for m in refreshed.kob_matches
            if drop_pid in [m.team1_player1_id, m.team1_player2_id,
                            m.team2_player1_id, m.team2_player2_id]
            and m.round_num >= 1
        ]
        for m in player_matches:
            assert m.is_bye is True
            assert m.winner is not None

    @pytest.mark.asyncio
    async def test_rejects_drop_in_setup(self, db_session, director, players):
        tid, _ = await _create_tournament(db_session, director)
        await _add_players(db_session, tid, [players[0]])
        with pytest.raises(ValueError, match="active"):
            await kob_service.drop_player(db_session, tid, players[0])

    @pytest.mark.asyncio
    async def test_rejects_drop_nonexistent(self, db_session, director, players):
        tid = await _start_tournament(db_session, director, players[:4])
        with pytest.raises(ValueError, match="not in this tournament"):
            await kob_service.drop_player(db_session, tid, 999999)


# ═══════════════════════════════════════════════════════════════════════════
# Standings
# ═══════════════════════════════════════════════════════════════════════════


class TestStandings:
    """Tests for get_standings()."""

    @pytest.mark.asyncio
    async def test_standings_after_scoring(self, db_session, director, players):
        """Standings reflect scored match results."""
        tid = await _start_tournament(db_session, director, players[:4])
        t = await _fresh_tournament(db_session, tid)
        t.auto_advance = False
        await db_session.flush()

        for m in _r1_matches(t):
            await kob_service.submit_score(db_session, tid, m.matchup_id, 21, 15)

        standings = await kob_service.get_standings(db_session, tid)
        assert len(standings) == 4
        for s in standings:
            assert "rank" in s
            assert "wins" in s
            assert "losses" in s
            assert "point_diff" in s
        total_wins = sum(s["wins"] for s in standings)
        assert total_wins > 0

    @pytest.mark.asyncio
    async def test_standings_empty_before_scoring(self, db_session, director, players):
        """Standings show all players with 0 wins before scoring."""
        tid = await _start_tournament(db_session, director, players[:4])
        standings = await kob_service.get_standings(db_session, tid)
        assert len(standings) == 4
        for s in standings:
            assert s["wins"] == 0
            assert s["losses"] == 0

    @pytest.mark.asyncio
    async def test_standings_bo3_only_counts_decided(self, db_session, director, players):
        """In Bo3 mode, partially-scored matches don't count as losses."""
        tid = await _start_tournament(
            db_session, director, players[:4], games_per_match=3
        )
        t = await _fresh_tournament(db_session, tid)
        t.auto_advance = False
        await db_session.flush()

        m = _r1_matches(t)[0]
        # Submit only game 1 (no winner yet)
        await kob_service.submit_score(db_session, tid, m.matchup_id, 21, 15)

        standings = await kob_service.get_standings(db_session, tid)
        total_wins = sum(s["wins"] for s in standings)
        total_losses = sum(s["losses"] for s in standings)
        assert total_wins == 0
        assert total_losses == 0


# ═══════════════════════════════════════════════════════════════════════════
# Bracket match editing
# ═══════════════════════════════════════════════════════════════════════════


class TestUpdateBracketMatch:
    """Tests for update_bracket_match()."""

    @pytest.mark.asyncio
    async def test_rejects_non_bracket_match(self, db_session, director, players):
        """Cannot edit pool-play matches via bracket update."""
        tid = await _start_tournament(db_session, director, players[:4])
        t = await _fresh_tournament(db_session, tid)

        r1 = _r1_matches(t)
        if r1:
            m = r1[0]
            with pytest.raises(ValueError, match="bracket"):
                await kob_service.update_bracket_match(
                    db_session, tid, m.id,
                    [players[0], players[1]], [players[2], players[3]],
                )

    @pytest.mark.asyncio
    async def test_rejects_invalid_team_size(self, db_session, director, players):
        """Each team must have exactly 2 players."""
        tid = await _start_tournament(db_session, director, players[:4])
        t = await _fresh_tournament(db_session, tid)

        r1 = [m for m in t.kob_matches if m.round_num == 1]
        if r1:
            with pytest.raises(ValueError):
                await kob_service.update_bracket_match(
                    db_session, tid, r1[0].id,
                    [players[0]], [players[2], players[3]],
                )


# ═══════════════════════════════════════════════════════════════════════════
# Fetch helpers
# ═══════════════════════════════════════════════════════════════════════════


class TestGetTournament:
    """Tests for get_tournament() and get_tournament_by_code()."""

    @pytest.mark.asyncio
    async def test_get_by_id(self, db_session, director):
        tid, _ = await _create_tournament(db_session, director)
        fetched = await _fresh_tournament(db_session, tid)
        assert fetched is not None
        assert fetched.name == "Test KOB"

    @pytest.mark.asyncio
    async def test_get_by_code(self, db_session, director):
        tid, code = await _create_tournament(db_session, director)
        fetched = await kob_service.get_tournament_by_code(db_session, code)
        assert fetched is not None
        assert fetched.id == tid

    @pytest.mark.asyncio
    async def test_get_nonexistent(self, db_session):
        assert await kob_service.get_tournament(db_session, 999999) is None

    @pytest.mark.asyncio
    async def test_get_by_bad_code(self, db_session):
        assert await kob_service.get_tournament_by_code(db_session, "NOPE") is None


class TestGetMyTournaments:
    """Tests for get_my_tournaments()."""

    @pytest.mark.asyncio
    async def test_returns_directed_tournaments(self, db_session, director):
        await _create_tournament(db_session, director, name="T1")
        await _create_tournament(db_session, director, name="T2")

        mine = await kob_service.get_my_tournaments(db_session, director)
        names = {t.name for t in mine}
        assert "T1" in names
        assert "T2" in names

    @pytest.mark.asyncio
    async def test_returns_participated_tournaments(self, db_session, director, players):
        tid, _ = await _create_tournament(db_session, director)
        await _add_players(db_session, tid, [players[0]])

        mine = await kob_service.get_my_tournaments(db_session, players[0])
        assert len(mine) == 1
        assert mine[0].id == tid


# ═══════════════════════════════════════════════════════════════════════════
# Response builders
# ═══════════════════════════════════════════════════════════════════════════


class TestResponseBuilders:
    """Tests for build_detail_response(), build_match_response(), build_summary_response()."""

    @pytest.mark.asyncio
    async def test_detail_response_shape(self, db_session, director, players):
        tid, code = await _create_tournament(db_session, director)
        await _add_players(db_session, tid, players[:4])

        refreshed = await _fresh_tournament(db_session, tid)
        resp = await kob_service.build_detail_response(db_session, refreshed)

        assert resp["id"] == tid
        assert resp["name"] == "Test KOB"
        assert resp["code"] == code
        assert resp["status"] == "SETUP"
        assert len(resp["players"]) == 4
        assert isinstance(resp["matches"], list)
        assert isinstance(resp["standings"], list)
        assert resp["director_player_id"] == director

    @pytest.mark.asyncio
    async def test_detail_response_player_names(self, db_session, director, players):
        tid, _ = await _create_tournament(db_session, director)
        await _add_players(db_session, tid, [players[0]])

        refreshed = await _fresh_tournament(db_session, tid)
        resp = await kob_service.build_detail_response(db_session, refreshed)

        assert len(resp["players"]) == 1
        assert resp["players"][0]["player_name"] is not None

    @pytest.mark.asyncio
    async def test_match_response_shape(self, db_session, director, players):
        tid = await _start_tournament(db_session, director, players[:4])
        t = await _fresh_tournament(db_session, tid)

        m = t.kob_matches[0]
        resp = await kob_service.build_match_response(db_session, m)

        assert "id" in resp
        assert "matchup_id" in resp
        assert "team1_player1_name" in resp
        assert "winner" in resp

    @pytest.mark.asyncio
    async def test_summary_response(self, db_session, director, players):
        tid, _ = await _create_tournament(db_session, director)
        await _add_players(db_session, tid, players[:4])

        refreshed = await _fresh_tournament(db_session, tid)
        resp = kob_service.build_summary_response(refreshed, player_count=4)

        assert resp["id"] == tid
        assert resp["player_count"] == 4
        assert resp["status"] == "SETUP"


# ═══════════════════════════════════════════════════════════════════════════
# Pools + Playoffs
# ═══════════════════════════════════════════════════════════════════════════


class TestPoolsPlayoffs:
    """Tests for POOLS_PLAYOFFS format with RR and DRAFT bracket."""

    @pytest.mark.asyncio
    async def test_pools_assigns_pool_ids(self, db_session, director, players):
        """Starting a POOLS_PLAYOFFS tournament assigns pool_id to players."""
        tid = await _start_tournament(
            db_session, director, players[:6],
            format="POOLS_PLAYOFFS",
            num_pools=2,
            has_playoffs=True,
            playoff_size=4,
        )

        t = await _fresh_tournament(db_session, tid)
        pool_ids = {kp.pool_id for kp in t.kob_players}
        assert pool_ids != {None}


# ═══════════════════════════════════════════════════════════════════════════
# Game settings
# ═══════════════════════════════════════════════════════════════════════════


class TestEffectiveGameSettings:
    """Tests for _effective_game_settings()."""

    @pytest.mark.asyncio
    async def test_pool_play_uses_base_settings(self, db_session, director):
        tid, _ = await _create_tournament(db_session, director, game_to=15, score_cap=17)
        t = await _fresh_tournament(db_session, tid)
        settings = kob_service._effective_game_settings(t, "pool_play")
        assert settings.game_to == 15
        assert settings.score_cap == 17
        assert settings.games_per_match == 1

    @pytest.mark.asyncio
    async def test_playoff_uses_override(self, db_session, director):
        tid, _ = await _create_tournament(
            db_session, director,
            game_to=15,
            playoff_game_to=21,
            playoff_games_per_match=3,
            playoff_score_cap=25,
        )
        t = await _fresh_tournament(db_session, tid)
        settings = kob_service._effective_game_settings(t, "playoffs")
        assert settings.game_to == 21
        assert settings.games_per_match == 3
        assert settings.score_cap == 25

    @pytest.mark.asyncio
    async def test_playoff_falls_back_to_base(self, db_session, director):
        """No playoff overrides → uses base settings."""
        tid, _ = await _create_tournament(db_session, director, game_to=21, games_per_match=3)
        t = await _fresh_tournament(db_session, tid)
        settings = kob_service._effective_game_settings(t, "playoffs")
        assert settings.game_to == 21
        assert settings.games_per_match == 3


# ═══════════════════════════════════════════════════════════════════════════
# Full tournament lifecycle
# ═══════════════════════════════════════════════════════════════════════════


class TestFullLifecycle:
    """Integration test: create → add players → start → score all → complete."""

    @pytest.mark.asyncio
    async def test_full_lifecycle_4_players(self, db_session, director, players):
        """Run a complete 4-player full-RR tournament from start to finish."""
        tid = await _start_tournament(db_session, director, players[:4])
        t = await _fresh_tournament(db_session, tid)
        total_rounds = t.schedule_data["total_rounds"]

        # Score all rounds
        for round_num in range(1, total_rounds + 1):
            t = await _fresh_tournament(db_session, tid)
            if t.status == TournamentStatus.COMPLETED:
                break

            r_matches = [
                m for m in t.kob_matches
                if m.round_num == round_num and not m.is_bye and m.winner is None
            ]
            for m in r_matches:
                await kob_service.submit_score(db_session, tid, m.matchup_id, 21, 15)

        final = await _fresh_tournament(db_session, tid)
        assert final.status == TournamentStatus.COMPLETED

        standings = await kob_service.get_standings(db_session, tid)
        assert len(standings) == 4
        # Each match produces 2 win credits (one per player on winning team)
        total_matches = len([m for m in final.kob_matches if not m.is_bye])
        total_wins = sum(s["wins"] for s in standings)
        assert total_wins == total_matches * 2
