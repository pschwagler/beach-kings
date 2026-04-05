"""
ELO calculation service.
Processes matches and computes all statistics.
"""

from typing import List, Dict, Tuple, Optional
import json
import logging

from backend.utils.constants import INITIAL_ELO, USE_POINT_DIFFERENTIAL, K, SEASON_K
from backend.database.models import Match, PartnershipStats, OpponentStats, EloHistory

logger = logging.getLogger(__name__)


# ============================================================================
# Helper Functions (ELO Calculations)
# ============================================================================


def expected_score(elo_a: float, elo_b: float) -> float:
    """
    Calculate expected score for player A against player B using ELO formula.

    Formula: P(A beats B) = 1 / (1 + 10^((elo_B - elo_A) / 400))
    If elo_A > elo_B, result > 0.5 (A is favored)
    """
    return 1 / (1 + 10 ** ((elo_b - elo_a) / 400))


def elo_change(k: float, old_elo: float, expected_score: float, actual_score: float) -> float:
    """Calculate ELO rating change."""
    return k * (actual_score - expected_score)


def k_factor(k_constant: float) -> float:
    """Return the K-factor constant for ELO calculations."""
    return k_constant


# ============================================================================
# Scoring System Helpers
# ============================================================================


def get_scoring_config(point_system_json: Optional[str]) -> Dict:
    """
    Parse season point_system JSON and return configuration dict.

    Args:
        point_system_json: JSON string from season.point_system field

    Returns:
        Dict with scoring configuration:
        - For Points System: {"type": "points_system", "points_per_win": int, "points_per_loss": int}
        - For Season Rating: {"type": "season_rating", "initial_rating": float}
    """
    if not point_system_json:
        # Default to Points System
        return {"type": "points_system", "points_per_win": 3, "points_per_loss": 1}

    try:
        config = json.loads(point_system_json)
        # Ensure defaults for Points System
        if config.get("type") == "points_system":
            config.setdefault("points_per_win", 3)
            config.setdefault("points_per_loss", 1)
        return config
    except (json.JSONDecodeError, TypeError) as exc:
        logger.warning(
            "Malformed point_system JSON, falling back to defaults: %r (error: %s)",
            point_system_json,
            exc,
        )
        return {"type": "points_system", "points_per_win": 3, "points_per_loss": 1}


def calculate_points(wins: int, losses: int, scoring_config: Dict) -> int:
    """
    Calculate points based on wins, losses, and scoring configuration.

    Note: For Season Rating mode, partnership/opponent stats use points=0 since
    season ratings are tracked per player, not per partnership/opponent pair.
    Player season stats use PlayerStats.points property which returns the season rating.

    Args:
        wins: Number of wins
        losses: Number of losses
        scoring_config: Scoring configuration dict

    Returns:
        Total points (for Points System) or 0 (for Season Rating in partnership/opponent contexts)
    """
    if scoring_config.get("type") == "season_rating":
        # For Season Rating, partnership/opponent stats use 0 points
        # Player season stats use PlayerStats.points which returns the season rating
        return 0

    # Points System
    points_per_win = scoring_config.get("points_per_win", 3)
    points_per_loss = scoring_config.get("points_per_loss", 1)
    return (wins * points_per_win) + (losses * points_per_loss)


# ============================================================================
# Match Data Structure
# ============================================================================
# Note: We now use the Match ORM model from database.models directly
# This section is kept for backwards compatibility documentation


# ============================================================================
# Match Processing Helpers
# ============================================================================


def calculate_winner(team1_score: int, team2_score: int) -> int:
    """
    Determine winner: 1 = team1, 2 = team2, -1 = tie.

    Args:
        team1_score: Score for team 1
        team2_score: Score for team 2

    Returns:
        Winner indicator (1, 2, or -1 for tie)
    """
    if team1_score > team2_score:
        return 1
    elif team2_score > team1_score:
        return 2
    else:
        return -1


def normalize_score(team1_score: int, team2_score: int, winner: int) -> float:
    """
    Normalize score to 0-1 range for ELO calculation.

    Args:
        team1_score: Score for team 1
        team2_score: Score for team 2
        winner: Winner indicator (1, 2, or -1)

    Returns:
        Normalized score for team 1 (0.0 to 1.0)
    """
    if winner == -1:
        # Tie
        return 0.5

    if USE_POINT_DIFFERENTIAL:
        # Factor in point differential
        winning_score = team1_score if winner == 1 else team2_score
        normalization_factor = 10 - winning_score
        adjusted_score1 = float(team1_score) + normalization_factor
        adjusted_score2 = float(team2_score) + normalization_factor
        return adjusted_score1 / (adjusted_score1 + adjusted_score2)
    else:
        # Simple win/loss: winner gets 1.0, loser gets 0.0
        return 1.0 if winner == 1 else 0.0


# ============================================================================
# PlayerStats Class
# ============================================================================


class PlayerStats:
    """Encapsulates all statistics for a single player."""

    def __init__(
        self,
        player_id: int,
        initial_rating: Optional[float] = None,
        scoring_config: Optional[Dict] = None,
    ):
        self.player_id = player_id
        self.elo = INITIAL_ELO  # Global ELO
        self.season_rating = (
            initial_rating if initial_rating is not None else INITIAL_ELO
        )  # Season-specific ELO
        self.initial_rating = initial_rating  # Store initial rating for season
        self.scoring_config = (
            scoring_config
            if scoring_config is not None
            else {
                "type": "points_system",
                "points_per_win": 3,
                "points_per_loss": 1,
            }
        )
        self.game_count = 0
        self.win_count = 0
        self.wins_with: Dict[int, int] = {}  # wins partnered with each player (by ID)
        self.games_with: Dict[int, int] = {}  # games partnered with each player (by ID)
        self.wins_against: Dict[int, int] = {}  # wins against each player (by ID)
        self.games_against: Dict[int, int] = {}  # games against each player (by ID)
        self.elo_history: List[float] = []
        self.season_rating_history: List[float] = []  # Season-specific rating history
        self.date_history: List[Optional[str]] = []  # dates corresponding to elo_history
        self.match_elo_history: List[
            Tuple[int, float, float, Optional[str]]
        ] = []  # (match_id, elo_after, elo_change, date)
        self.match_season_rating_history: List[
            Tuple[int, float, float, Optional[str]]
        ] = []  # Season rating history

        # Point differential tracking
        self.total_point_diff = 0
        self.point_diff_with: Dict[int, int] = {}  # point differential with each partner (by ID)
        self.point_diff_against: Dict[
            int, int
        ] = {}  # point differential against each opponent (by ID)

    @property
    def win_rate(self) -> float:
        """Calculate overall win rate."""
        if self.game_count == 0:
            return 0.0
        return self.win_count / self.game_count

    @property
    def avg_point_diff(self) -> float:
        """Calculate average point differential."""
        if self.game_count == 0:
            return 0.0
        return self.total_point_diff / self.game_count

    @property
    def points(self) -> float:
        """
        Calculate points based on scoring system.
        For Points System: returns win/loss points
        For Season Rating: returns season rating (float, not rounded)
        """
        if self.scoring_config.get("type") == "season_rating":
            return self.season_rating

        # Points System
        losses = self.game_count - self.win_count
        points_per_win = self.scoring_config.get("points_per_win", 3)
        points_per_loss = self.scoring_config.get("points_per_loss", 1)
        return float((self.win_count * points_per_win) + (losses * points_per_loss))

    def _increment_dict(self, d: Dict[int, int], key: int, amount: int = 1) -> None:
        """Helper to increment a value in a dictionary, initializing if needed."""
        d[key] = d.get(key, 0) + amount

    def record_game_with(self, partner_id: int) -> None:
        """Record a game played with a partner."""
        self._increment_dict(self.games_with, partner_id)

    def record_win_with(self, partner_id: int) -> None:
        """Record a win with a partner."""
        self._increment_dict(self.wins_with, partner_id)

    def record_game_against(self, opponent_id: int) -> None:
        """Record a game played against an opponent."""
        self._increment_dict(self.games_against, opponent_id)

    def record_win_against(self, opponent_id: int) -> None:
        """Record a win against an opponent."""
        self._increment_dict(self.wins_against, opponent_id)

    def record_point_diff_with(self, partner_id: int, diff: int) -> None:
        """Record point differential with a partner."""
        self._increment_dict(self.point_diff_with, partner_id, diff)

    def record_point_diff_against(self, opponent_id: int, diff: int) -> None:
        """Record point differential against an opponent."""
        self._increment_dict(self.point_diff_against, opponent_id, diff)

    def update_elo(
        self, delta: float, date: Optional[str] = None, match_id: Optional[int] = None
    ) -> None:
        """Update global ELO rating and record history."""
        self.elo += delta
        self.elo_history.append(self.elo)
        self.date_history.append(date)
        if match_id is not None:
            self.match_elo_history.append((match_id, self.elo, delta, date))

    def update_season_rating(
        self, delta: float, date: Optional[str] = None, match_id: Optional[int] = None
    ) -> None:
        """Update season-specific ELO rating and record history."""
        self.season_rating += delta
        self.season_rating_history.append(self.season_rating)
        if match_id is not None:
            self.match_season_rating_history.append((match_id, self.season_rating, delta, date))


# ============================================================================
# StatsTracker Class
# ============================================================================


class StatsTracker:
    """Tracks statistics for all players across multiple matches."""

    def __init__(
        self,
        initial_ratings: Optional[Dict[int, float]] = None,
        scoring_config: Optional[Dict] = None,
    ):
        """
        Initialize StatsTracker.

        Args:
            initial_ratings: Dict mapping player_id to initial season rating (for Season Rating mode)
            scoring_config: Scoring configuration dict
        """
        self.players: Dict[int, PlayerStats] = {}
        self.initial_ratings = initial_ratings or {}
        self.scoring_config = (
            scoring_config
            if scoring_config is not None
            else {
                "type": "points_system",
                "points_per_win": 3,
                "points_per_loss": 1,
            }
        )
        self.is_season_rating = self.scoring_config.get("type") == "season_rating"

    def get_player(self, player_id: int) -> PlayerStats:
        """Get or create a player's stats."""
        if player_id not in self.players:
            initial_rating = self.initial_ratings.get(player_id)
            self.players[player_id] = PlayerStats(
                player_id, initial_rating=initial_rating, scoring_config=self.scoring_config
            )
        return self.players[player_id]

    def process_match(self, match: Match, skip_global_elo: bool = False) -> Tuple[float, float]:
        """
        Process a single match and update all relevant statistics.

        Args:
            match: Match ORM object containing match information
            skip_global_elo: If True, skip global ELO calculation (for placeholder matches).
                Season rating is still calculated.

        Returns:
            Tuple of (team1_elo_delta, team2_elo_delta)
        """
        # Ensure all players exist
        all_player_ids = match.player_ids[0] + match.player_ids[1]
        for player_id in all_player_ids:
            self.get_player(player_id)

        # Record games and partnerships
        self._record_games_and_partnerships(match)

        # Record wins if there was a winner
        winner = calculate_winner(match.team1_score, match.team2_score)
        if winner != -1:
            self._record_wins(match, winner)

        # Record point differentials
        self._record_point_differentials(match)

        # Calculate and apply ELO changes
        elo_deltas = self._update_elos(match, winner, skip_global_elo=skip_global_elo)

        return elo_deltas

    def _record_games_and_partnerships(self, match: Match) -> None:
        """Record games played and partnerships."""
        teams = match.player_ids
        for team_idx, team in enumerate(teams):
            opponent_team = teams[(team_idx + 1) % 2]

            for player_id in team:
                player = self.get_player(player_id)
                player.game_count += 1

                # Record partnership
                partner_id = team[1] if player_id == team[0] else team[0]
                player.record_game_with(partner_id)

                # Record games against opponents
                for opponent_id in opponent_team:
                    player.record_game_against(opponent_id)

    def _record_wins(self, match: Match, winner: int) -> None:
        """Record wins for the winning team."""
        winning_team_idx = 0 if winner == 1 else 1
        losing_team_idx = 1 if winner == 1 else 0

        teams = match.player_ids
        winning_team = teams[winning_team_idx]
        losing_team = teams[losing_team_idx]

        # Record wins for each player on winning team
        for player_id in winning_team:
            player = self.get_player(player_id)
            player.win_count += 1

            # Record win with partner
            partner_id = winning_team[1] if player_id == winning_team[0] else winning_team[0]
            player.record_win_with(partner_id)

            # Record wins against opponents
            for opponent_id in losing_team:
                player.record_win_against(opponent_id)

    def _record_point_differentials(self, match: Match) -> None:
        """Record point differentials for all players."""
        # Calculate point differential for each team
        point_diff_team1 = match.team1_score - match.team2_score
        point_diff_team2 = match.team2_score - match.team1_score

        teams = match.player_ids
        team1 = teams[0]
        team2 = teams[1]

        # Record for team 1
        for player_id in team1:
            player = self.get_player(player_id)
            player.total_point_diff += point_diff_team1

            # Record with partner
            partner_id = team1[1] if player_id == team1[0] else team1[0]
            player.record_point_diff_with(partner_id, point_diff_team1)

            # Record against opponents
            for opponent_id in team2:
                player.record_point_diff_against(opponent_id, point_diff_team1)

        # Record for team 2
        for player_id in team2:
            player = self.get_player(player_id)
            player.total_point_diff += point_diff_team2

            # Record with partner
            partner_id = team2[1] if player_id == team2[0] else team2[0]
            player.record_point_diff_with(partner_id, point_diff_team2)

            # Record against opponents
            for opponent_id in team1:
                player.record_point_diff_against(opponent_id, point_diff_team2)

    def _calculate_elo_deltas(
        self,
        teams: list,
        k_constant: float,
        normalized_score: float,
        rating_getter,
    ) -> List[float]:
        """
        Calculate ELO deltas for both teams using a generic rating accessor.

        Args:
            teams: [[p1, p2], [p3, p4]] player ID pairs per team
            k_constant: Base K-factor constant
            normalized_score: Score from team-1 perspective (1.0=win, 0.0=loss, 0.5=tie)
            rating_getter: Callable(PlayerStats) -> float returning the rating to use

        Returns:
            [team0_delta, team1_delta]
        """
        team_ratings = []
        for team in teams:
            avg = sum(rating_getter(self.get_player(pid)) for pid in team) / len(team)
            team_ratings.append(avg)

        exp = [
            expected_score(team_ratings[0], team_ratings[1]),
            expected_score(team_ratings[1], team_ratings[0]),
        ]
        k = k_factor(k_constant)
        return [
            elo_change(k, team_ratings[0], exp[0], normalized_score),
            elo_change(k, team_ratings[1], exp[1], 1 - normalized_score),
        ]

    def _update_elos(
        self, match: Match, winner: int, skip_global_elo: bool = False
    ) -> Tuple[float, float]:
        """
        Calculate and apply ELO changes for all players in the match.
        Updates both global ELO and season ELO (if Season Rating mode) completely separately.

        Args:
            match: Match ORM object
            winner: Winner indicator (1, 2, or -1 for tie)
            skip_global_elo: If True, skip global ELO update (for placeholder matches).
                Season rating is still calculated.
        """
        teams = match.player_ids
        normalized = normalize_score(match.team1_score, match.team2_score, winner)

        # Global ELO (skip for placeholder matches)
        global_deltas = [0.0, 0.0]
        if not skip_global_elo:
            global_deltas = self._calculate_elo_deltas(
                teams,
                K,
                normalized,
                rating_getter=lambda p: p.elo,
            )
            for team_idx, team in enumerate(teams):
                for player_id in team:
                    match_date = match.session.date if match.session else None
                    self.get_player(player_id).update_elo(
                        global_deltas[team_idx], match_date, match.id
                    )

        # Season ELO (always calculated, even for placeholder matches)
        if self.is_season_rating:
            season_deltas = self._calculate_elo_deltas(
                teams,
                SEASON_K,
                normalized,
                rating_getter=lambda p: p.season_rating,
            )
            for team_idx, team in enumerate(teams):
                for player_id in team:
                    match_date = match.session.date if match.session else None
                    self.get_player(player_id).update_season_rating(
                        season_deltas[team_idx],
                        match_date,
                        match.id,
                    )

        return (global_deltas[0], global_deltas[1])


# ============================================================================
# Main Processing Function
# ============================================================================


def _build_partnership_stats(
    tracker: StatsTracker,
    scoring_config: Dict,
) -> List[PartnershipStats]:
    """Build PartnershipStats ORM instances from tracked player data."""
    results = []
    for player_id, stats in tracker.players.items():
        for partner_id, games in stats.games_with.items():
            wins = stats.wins_with.get(partner_id, 0)
            losses = games - wins
            total_pt_diff = stats.point_diff_with.get(partner_id, 0)
            results.append(
                PartnershipStats(
                    player_id=player_id,
                    partner_id=partner_id,
                    games=games,
                    wins=wins,
                    points=calculate_points(wins, losses, scoring_config),
                    win_rate=round(wins / games, 3) if games else 0,
                    avg_point_diff=round(total_pt_diff / games, 1) if games else 0,
                )
            )
    return results


def _build_opponent_stats(
    tracker: StatsTracker,
    scoring_config: Dict,
) -> List[OpponentStats]:
    """Build OpponentStats ORM instances from tracked player data."""
    results = []
    for player_id, stats in tracker.players.items():
        for opponent_id, games in stats.games_against.items():
            wins = stats.wins_against.get(opponent_id, 0)
            losses = games - wins
            total_pt_diff = stats.point_diff_against.get(opponent_id, 0)
            results.append(
                OpponentStats(
                    player_id=player_id,
                    opponent_id=opponent_id,
                    games=games,
                    wins=wins,
                    points=calculate_points(wins, losses, scoring_config),
                    win_rate=round(wins / games, 3) if games else 0,
                    avg_point_diff=round(total_pt_diff / games, 1) if games else 0,
                )
            )
    return results


def _build_elo_history(tracker: StatsTracker) -> List[EloHistory]:
    """Build EloHistory ORM instances from tracked player data (global ELO only)."""
    results = []
    for player_id, stats in tracker.players.items():
        for match_id, elo_after, change, date in stats.match_elo_history:
            results.append(
                EloHistory(
                    player_id=player_id,
                    match_id=match_id,
                    date=date or "",
                    elo_after=round(elo_after, 1),
                    elo_change=round(change, 1),
                )
            )
    return results


def process_matches(
    match_list: List[Match],
    player_id_map: Optional[Dict[str, int]] = None,
    initial_ratings: Optional[Dict[int, float]] = None,
    scoring_config: Optional[Dict] = None,
) -> Tuple[List[PartnershipStats], List[OpponentStats], List[EloHistory]]:
    """
    Process a list of matches and return computed statistics as ORM instances.

    Args:
        match_list: List of Match ORM objects (from database.models)
        player_id_map: Optional dictionary mapping player names to player IDs (deprecated, kept for compatibility)
        initial_ratings: Optional dict mapping player_id to initial season rating (for Season Rating mode)
        scoring_config: Optional scoring configuration dict

    Returns:
        Tuple of:
        - list of PartnershipStats instances
        - list of OpponentStats instances
        - list of EloHistory instances
    """
    tracker = StatsTracker(initial_ratings=initial_ratings, scoring_config=scoring_config)
    for match in match_list:
        # Skip global ELO for placeholder matches (ranked_intent=True but is_ranked=False)
        skip_global_elo = not match.is_ranked
        tracker.process_match(match, skip_global_elo=skip_global_elo)

    config = scoring_config or {}
    return (
        _build_partnership_stats(tracker, config),
        _build_opponent_stats(tracker, config),
        _build_elo_history(tracker),
    )
