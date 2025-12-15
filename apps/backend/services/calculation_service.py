"""
ELO calculation service.
Processes matches and computes all statistics.
"""

from typing import List, Dict, Tuple, Optional
from backend.utils.constants import INITIAL_ELO, USE_POINT_DIFFERENTIAL, K
from backend.database.models import Match, PartnershipStats, OpponentStats, EloHistory


# ============================================================================
# Helper Functions (ELO Calculations)
# ============================================================================

def expected_score(elo_a: float, elo_b: float) -> float:
    """
    Calculate expected score for player A against player B using ELO formula.
    
    Formula: P(A beats B) = 1 / (1 + 10^((elo_B - elo_A) / 400))
    If elo_A > elo_B, result > 0.5 (A is favored)
    """
    return 1 / (1 + 10**((elo_b - elo_a) / 400))


def elo_change(k: float, old_elo: float, expected_score: float, actual_score: float) -> float:
    """Calculate ELO rating change."""
    return k * (actual_score - expected_score)


def k_factor(avg_games: float, k_constant: float) -> float:
    """Calculate K-factor based on average games played."""
    return k_constant


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
        winning_team_idx = 0 if winner == 1 else 1
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
    
    def __init__(self, name: str):
        self.name = name
        self.elo = INITIAL_ELO
        self.game_count = 0
        self.win_count = 0
        self.wins_with: Dict[str, int] = {}      # wins partnered with each player
        self.games_with: Dict[str, int] = {}      # games partnered with each player
        self.wins_against: Dict[str, int] = {}   # wins against each player
        self.games_against: Dict[str, int] = {}  # games against each player
        self.elo_history: List[float] = []
        self.date_history: List[Optional[str]] = []   # dates corresponding to elo_history
        self.match_elo_history: List[Tuple[int, float, float, Optional[str]]] = []  # (match_id, elo_after, elo_change, date)
        
        # Point differential tracking
        self.total_point_diff = 0
        self.point_diff_with: Dict[str, int] = {}    # point differential with each partner
        self.point_diff_against: Dict[str, int] = {} # point differential against each opponent
    
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
    def points(self) -> int:
        """Calculate points: +3 for each win, +1 for each loss."""
        losses = self.game_count - self.win_count
        return (self.win_count * 3) + (losses * 1)
    
    def _increment_dict(self, d: Dict[str, int], key: str, amount: int = 1) -> None:
        """Helper to increment a value in a dictionary, initializing if needed."""
        d[key] = d.get(key, 0) + amount
    
    def record_game_with(self, partner: str) -> None:
        """Record a game played with a partner."""
        self._increment_dict(self.games_with, partner)
    
    def record_win_with(self, partner: str) -> None:
        """Record a win with a partner."""
        self._increment_dict(self.wins_with, partner)
    
    def record_game_against(self, opponent: str) -> None:
        """Record a game played against an opponent."""
        self._increment_dict(self.games_against, opponent)
    
    def record_win_against(self, opponent: str) -> None:
        """Record a win against an opponent."""
        self._increment_dict(self.wins_against, opponent)
    
    def record_point_diff_with(self, partner: str, diff: int) -> None:
        """Record point differential with a partner."""
        self._increment_dict(self.point_diff_with, partner, diff)
    
    def record_point_diff_against(self, opponent: str, diff: int) -> None:
        """Record point differential against an opponent."""
        self._increment_dict(self.point_diff_against, opponent, diff)
    
    def update_elo(self, delta: float, date: Optional[str] = None, match_id: Optional[int] = None) -> None:
        """Update ELO rating and record history."""
        self.elo += delta
        self.elo_history.append(self.elo)
        self.date_history.append(date)
        if match_id is not None:
            self.match_elo_history.append((match_id, self.elo, delta, date))


# ============================================================================
# StatsTracker Class
# ============================================================================

class StatsTracker:
    """Tracks statistics for all players across multiple matches."""
    
    def __init__(self):
        self.players: Dict[str, PlayerStats] = {}
    
    def get_player(self, name: str) -> PlayerStats:
        """Get or create a player's stats."""
        if name not in self.players:
            self.players[name] = PlayerStats(name)
        return self.players[name]
    
    def process_match(self, match: Match) -> Tuple[float, float]:
        """
        Process a single match and update all relevant statistics.
        
        Args:
            match: Match ORM object containing match information
            
        Returns:
            Tuple of (team1_elo_delta, team2_elo_delta)
        """
        # Ensure all players exist
        all_players = match.players[0] + match.players[1]
        for player_name in all_players:
            self.get_player(player_name)
        
        # Record games and partnerships
        self._record_games_and_partnerships(match)
        
        # Record wins if there was a winner
        winner = calculate_winner(match.team1_score, match.team2_score)
        if winner != -1:
            self._record_wins(match, winner)
        
        # Record point differentials
        self._record_point_differentials(match)
        
        # Calculate and apply ELO changes
        elo_deltas = self._update_elos(match, winner)
        
        return elo_deltas
    
    def _record_games_and_partnerships(self, match: Match) -> None:
        """Record games played and partnerships."""
        teams = match.players
        for team_idx, team in enumerate(teams):
            opponent_team = teams[(team_idx + 1) % 2]
            
            for player_name in team:
                player = self.get_player(player_name)
                player.game_count += 1
                
                # Record partnership
                partner = team[1] if player_name == team[0] else team[0]
                player.record_game_with(partner)
                
                # Record games against opponents
                for opponent in opponent_team:
                    player.record_game_against(opponent)
    
    def _record_wins(self, match: Match, winner: int) -> None:
        """Record wins for the winning team."""
        winning_team_idx = 0 if winner == 1 else 1
        losing_team_idx = 1 if winner == 1 else 0
        
        teams = match.players
        winning_team = teams[winning_team_idx]
        losing_team = teams[losing_team_idx]
        
        # Record wins for each player on winning team
        for player_name in winning_team:
            player = self.get_player(player_name)
            player.win_count += 1
            
            # Record win with partner
            partner = winning_team[1] if player_name == winning_team[0] else winning_team[0]
            player.record_win_with(partner)
            
            # Record wins against opponents
            for opponent in losing_team:
                player.record_win_against(opponent)
    
    def _record_point_differentials(self, match: Match) -> None:
        """Record point differentials for all players."""
        # Calculate point differential for each team
        point_diff_team1 = match.team1_score - match.team2_score
        point_diff_team2 = match.team2_score - match.team1_score
        
        teams = match.players
        team1 = teams[0]
        team2 = teams[1]
        
        # Record for team 1
        for player_name in team1:
            player = self.get_player(player_name)
            player.total_point_diff += point_diff_team1
            
            # Record with partner
            partner = team1[1] if player_name == team1[0] else team1[0]
            player.record_point_diff_with(partner, point_diff_team1)
            
            # Record against opponents
            for opponent in team2:
                player.record_point_diff_against(opponent, point_diff_team1)
        
        # Record for team 2
        for player_name in team2:
            player = self.get_player(player_name)
            player.total_point_diff += point_diff_team2
            
            # Record with partner
            partner = team2[1] if player_name == team2[0] else team2[0]
            player.record_point_diff_with(partner, point_diff_team2)
            
            # Record against opponents
            for opponent in team1:
                player.record_point_diff_against(opponent, point_diff_team2)
    
    def _update_elos(self, match: Match, winner: int) -> Tuple[float, float]:
        """Calculate and apply ELO changes for all players in the match."""
        teams = match.players
        
        # Calculate team average ELOs
        team_elos = []
        for team in teams:
            player1 = self.get_player(team[0])
            player2 = self.get_player(team[1])
            team_elo = (player1.elo + player2.elo) / 2
            team_elos.append(team_elo)
        
        # Calculate expected scores
        # expected[0] = expected score for team 0 (against team 1)
        # expected[1] = expected score for team 1 (against team 0)
        expected = [
            expected_score(team_elos[0], team_elos[1]),  # P(team0 beats team1)
            expected_score(team_elos[1], team_elos[0])   # P(team1 beats team0)
        ]
        
        # Calculate K-factor based on average games played
        avg_games = sum(self.get_player(p).game_count for team in teams for p in team) / 4
        k = k_factor(avg_games, K)
        
        # Calculate normalized score
        normalized_score = normalize_score(match.team1_score, match.team2_score, winner)
        
        # Calculate ELO deltas
        deltas = [
            elo_change(k, team_elos[0], expected[0], normalized_score),
            elo_change(k, team_elos[1], expected[1], 1 - normalized_score)
        ]
        
        # Apply ELO changes
        for team_idx, team in enumerate(teams):
            for player_name in team:
                player = self.get_player(player_name)
                player.update_elo(deltas[team_idx], match.date, match.id)
        
        return (deltas[0], deltas[1])


# ============================================================================
# Main Processing Function
# ============================================================================

def process_matches(
    match_list: List[Match], 
    player_id_map: Dict[str, int]
) -> Tuple[Dict[Match, Tuple[float, float]], List[PartnershipStats], List[OpponentStats], List[EloHistory]]:
    """
    Process a list of matches and return computed statistics as ORM instances.
    
    Args:
        match_list: List of Match ORM objects (from database.models)
        player_id_map: Dictionary mapping player names to player IDs
        
    Returns:
        Tuple of:
        - dict mapping matches to elo_deltas
        - list of PartnershipStats instances
        - list of OpponentStats instances
        - list of EloHistory instances
    """
    tracker = StatsTracker()
    elo_deltas_map: Dict[Match, Tuple[float, float]] = {}
    
    # Process all matches to build stats
    for match in match_list:
        elo_deltas = tracker.process_match(match)
        elo_deltas_map[match] = elo_deltas
    
    # Build PartnershipStats instances
    partnerships = []
    for player_name, player_stats in tracker.players.items():
        player_id = player_id_map.get(player_name)
        if not player_id:
            continue
            
        for partner_name, games in player_stats.games_with.items():
            partner_id = player_id_map.get(partner_name)
            if not partner_id:
                continue
                
            wins = player_stats.wins_with.get(partner_name, 0)
            losses = games - wins
            win_rate = wins / games if games > 0 else 0
            points = (wins * 3) + (losses * 1)
            total_pt_diff = player_stats.point_diff_with.get(partner_name, 0)
            avg_pt_diff = total_pt_diff / games if games > 0 else 0
            
            partnership = PartnershipStats(
                player_id=player_id,
                partner_id=partner_id,
                games=games,
                wins=wins,
                points=points,
                win_rate=round(win_rate, 3),
                avg_point_diff=round(avg_pt_diff, 1)
            )
            partnerships.append(partnership)
    
    # Build OpponentStats instances
    opponents = []
    for player_name, player_stats in tracker.players.items():
        player_id = player_id_map.get(player_name)
        if not player_id:
            continue
            
        for opponent_name, games in player_stats.games_against.items():
            opponent_id = player_id_map.get(opponent_name)
            if not opponent_id:
                continue
                
            wins = player_stats.wins_against.get(opponent_name, 0)
            losses = games - wins
            win_rate = wins / games if games > 0 else 0
            points = (wins * 3) + (losses * 1)
            total_pt_diff = player_stats.point_diff_against.get(opponent_name, 0)
            avg_pt_diff = total_pt_diff / games if games > 0 else 0
            
            opponent = OpponentStats(
                player_id=player_id,
                opponent_id=opponent_id,
                games=games,
                wins=wins,
                points=points,
                win_rate=round(win_rate, 3),
                avg_point_diff=round(avg_pt_diff, 1)
            )
            opponents.append(opponent)
    
    # Build EloHistory instances
    elo_history_list = []
    for player_name, player_stats in tracker.players.items():
        player_id = player_id_map.get(player_name)
        if not player_id:
            continue
            
        for match_id, elo_after, elo_change, date in player_stats.match_elo_history:
            elo_history = EloHistory(
                player_id=player_id,
                match_id=match_id,
                date=date or '',
                elo_after=round(elo_after, 1),
                elo_change=round(elo_change, 1)
            )
            elo_history_list.append(elo_history)
    
    return elo_deltas_map, partnerships, opponents, elo_history_list
