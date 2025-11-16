"""
Core data models for beach volleyball ELO system.
"""

from backend.utils.constants import INITIAL_ELO, USE_POINT_DIFFERENTIAL, K


def expectedScore(eloA, eloB):
    """Calculate expected score for player A against player B using ELO formula."""
    return 1 / (1 + 10**((eloA - eloB) / 400))


def eloChange(k, old_elo, expectedV, win):
    """Calculate ELO rating change."""
    return k * (win - expectedV)


def kFunction(avg_games, K):
    """Calculate K-factor based on average games played."""
    return K


class Match:
    """Represents a beach volleyball match between two teams."""
    
    def __init__(self, p1, p2, p3, p4, scores, date=None):
        """
        Initialize a match.
        
        Args:
            p1, p2: Players on team 1
            p3, p4: Players on team 2
            scores: List of [team1_score, team2_score]
            date: Optional date string for the match
        """
        self.players = [[p1, p2], [p3, p4]]
        self.date = date
        self.elo_deltas = [None, None]  # Will store [team1_delta, team2_delta]
        
        # Store original scores for point differential tracking
        self.original_scores = [int(scores[0]), int(scores[1])]
        
        # Determine winner (1 = team1, 2 = team2, -1 = tie)
        if int(scores[0]) > int(scores[1]):
            self.winner = 1
        elif int(scores[1]) > int(scores[0]):
            self.winner = 2
        else:
            self.winner = -1
        
        # Normalize score to 0-1 range for ELO calculation
        if self.winner != -1:
            if USE_POINT_DIFFERENTIAL:
                # Factor in point differential
                winning_team_idx = 0 if self.winner == 1 else 1
                normalisation_factor = 10 - int(scores[winning_team_idx])
                scores[0] = float(scores[0]) + normalisation_factor
                scores[1] = float(scores[1]) + normalisation_factor
                self.score = float(scores[0]) / (float(scores[0]) + float(scores[1]))
            else:
                # Simple win/loss: winner gets 1.0, loser gets 0.0
                self.score = 1.0 if self.winner == 1 else 0.0
        else:
            # Tie
            self.score = 0.5


class PlayerStats:
    """Encapsulates all statistics for a single player."""
    
    def __init__(self, name):
        self.name = name
        self.elo = INITIAL_ELO
        self.game_count = 0
        self.win_count = 0
        self.wins_with = {}      # wins partnered with each player
        self.games_with = {}     # games partnered with each player
        self.wins_against = {}   # wins against each player
        self.games_against = {}  # games against each player
        self.elo_history = []
        self.date_history = []   # dates corresponding to elo_history
        self.match_elo_history = []  # List of (match_ref, elo_after, elo_change, date)
        
        # Point differential tracking
        self.total_point_diff = 0
        self.point_diff_with = {}    # point differential with each partner
        self.point_diff_against = {} # point differential against each opponent
    
    @property
    def win_rate(self):
        """Calculate overall win rate."""
        if self.game_count == 0:
            return 0
        return self.win_count / self.game_count
    
    @property
    def avg_point_diff(self):
        """Calculate average point differential."""
        if self.game_count == 0:
            return 0
        return self.total_point_diff / self.game_count
    
    @property
    def points(self):
        """Calculate points: +3 for each win, +1 for each loss."""
        losses = self.game_count - self.win_count
        return (self.win_count * 3) + (losses * 1)
    
    def record_game_with(self, partner):
        """Record a game played with a partner."""
        if partner not in self.games_with:
            self.games_with[partner] = 0
        self.games_with[partner] += 1
    
    def record_win_with(self, partner):
        """Record a win with a partner."""
        if partner not in self.wins_with:
            self.wins_with[partner] = 0
        self.wins_with[partner] += 1
    
    def record_game_against(self, opponent):
        """Record a game played against an opponent."""
        if opponent not in self.games_against:
            self.games_against[opponent] = 0
        self.games_against[opponent] += 1
    
    def record_win_against(self, opponent):
        """Record a win against an opponent."""
        if opponent not in self.wins_against:
            self.wins_against[opponent] = 0
        self.wins_against[opponent] += 1
    
    def record_point_diff_with(self, partner, diff):
        """Record point differential with a partner."""
        if partner not in self.point_diff_with:
            self.point_diff_with[partner] = 0
        self.point_diff_with[partner] += diff
    
    def record_point_diff_against(self, opponent, diff):
        """Record point differential against an opponent."""
        if opponent not in self.point_diff_against:
            self.point_diff_against[opponent] = 0
        self.point_diff_against[opponent] += diff
    
    def update_elo(self, delta, date=None, match_ref=None):
        """Update ELO rating and record history."""
        self.elo += delta
        self.elo_history.append(self.elo)
        self.date_history.append(date)
        if match_ref is not None:
            self.match_elo_history.append((match_ref, self.elo, delta, date))


class StatsTracker:
    """Tracks statistics for all players across multiple matches."""
    
    def __init__(self):
        self.players = {}
    
    def get_player(self, name):
        """Get or create a player's stats."""
        if name not in self.players:
            self.players[name] = PlayerStats(name)
        return self.players[name]
    
    def process_match(self, match):
        """Process a single match and update all relevant statistics."""
        # Ensure all players exist
        all_players = match.players[0] + match.players[1]
        for player_name in all_players:
            self.get_player(player_name)
        
        # Record games and partnerships
        self._record_games_and_partnerships(match)
        
        # Record wins if there was a winner
        if match.winner != -1:
            self._record_wins(match)
        
        # Record point differentials
        self._record_point_differentials(match)
        
        # Calculate and apply ELO changes
        self._update_elos(match)
    
    def _record_games_and_partnerships(self, match):
        """Record games played and partnerships."""
        for team_idx, team in enumerate(match.players):
            opponent_team = match.players[(team_idx + 1) % 2]
            
            # Pair of different players
            for player_name in team:
                player = self.get_player(player_name)
                player.game_count += 1
                
                # Record partnership
                partner = team[1] if player_name == team[0] else team[0]
                player.record_game_with(partner)
                
                # Record games against opponents
                for opponent in opponent_team:
                    player.record_game_against(opponent)
    
    def _record_wins(self, match):
        """Record wins for the winning team."""
        winning_team_idx = 0 if match.winner == 1 else 1
        losing_team_idx = 1 if match.winner == 1 else 0
        
        winning_team = match.players[winning_team_idx]
        losing_team = match.players[losing_team_idx]
        
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
    
    def _record_point_differentials(self, match):
        """Record point differentials for all players."""
        # Calculate point differential for each team
        point_diff_team1 = match.original_scores[0] - match.original_scores[1]
        point_diff_team2 = match.original_scores[1] - match.original_scores[0]
        
        # Record for team 1 (index 0)
        team1 = match.players[0]
        team2 = match.players[1]
        
        for player_name in team1:
            player = self.get_player(player_name)
            player.total_point_diff += point_diff_team1
            
            # Record with partner
            partner = team1[1] if player_name == team1[0] else team1[0]
            player.record_point_diff_with(partner, point_diff_team1)
            
            # Record against opponents
            for opponent in team2:
                player.record_point_diff_against(opponent, point_diff_team1)
        
        # Record for team 2 (index 1)
        for player_name in team2:
            player = self.get_player(player_name)
            player.total_point_diff += point_diff_team2
            
            # Record with partner
            partner = team2[1] if player_name == team2[0] else team2[0]
            player.record_point_diff_with(partner, point_diff_team2)
            
            # Record against opponents
            for opponent in team1:
                player.record_point_diff_against(opponent, point_diff_team2)
    
    def _update_elos(self, match):
        """Calculate and apply ELO changes for all players in the match."""
        # Calculate team average ELOs
        team_elos = []
        for team in match.players:
            player1 = self.get_player(team[0])
            player2 = self.get_player(team[1])
            team_elo = (player1.elo + player2.elo) / 2
            team_elos.append(team_elo)
        
        # Calculate expected scores
        expected = [
            expectedScore(team_elos[1], team_elos[0]),
            expectedScore(team_elos[0], team_elos[1])
        ]
        
        # Calculate K-factor based on average games played
        avg_games = sum(self.get_player(p).game_count for team in match.players for p in team) / 4
        k = kFunction(avg_games, K)
        
        # Calculate ELO deltas
        deltas = [
            eloChange(k, team_elos[0], expected[0], match.score),
            eloChange(k, team_elos[1], expected[1], 1 - match.score)
        ]
        
        # Store deltas in match object
        match.elo_deltas = deltas
        
        # Apply ELO changes
        for team_idx, team in enumerate(match.players):
            for player_name in team:
                player = self.get_player(player_name)
                player.update_elo(deltas[team_idx], match.date, match_ref=id(match))

