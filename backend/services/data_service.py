"""
Data service layer for database operations.
Handles all CRUD operations for the ELO system.
"""

from typing import List, Dict, Optional
from backend.database import db
from backend.models.match import Match
from backend.services import calculation_service
from backend.utils.constants import INITIAL_ELO
import csv
import io

def flush_and_repopulate(tracker, match_list):
    """
    Flush all data and import matches from Google Sheets, then calculate statistics.
    
    Args:
        tracker: Ignored (legacy parameter, calculation now done from DB)
        match_list: List of Match objects from Google Sheets
        
    Returns:
        dict with player_count and match_count from calculate_stats()
    """
    # Flush ALL tables
    db.flush_all_tables()
    
    # Extract unique player names for ID mapping
    player_names = set()
    for match in match_list:
        player_names.add(match.players[0][0])  # team1 player1
        player_names.add(match.players[0][1])  # team1 player2
        player_names.add(match.players[1][0])  # team2 player1
        player_names.add(match.players[1][1])  # team2 player2
    
    with db.get_db() as conn:
        # Create placeholder players (will be recalculated by calculate_stats)
        player_id_map = {}
        player_data = []
        for player_id, name in enumerate(sorted(player_names), start=1):
            player_id_map[name] = player_id
            # Insert with placeholder values (will be overwritten by calculate_stats)
            player_data.append((player_id, name, 1200, 0, 0, 0, 0.0, 0.0))
        
        conn.executemany(
            """INSERT INTO players (id, name, current_elo, games, wins, points, win_rate, avg_point_diff)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            player_data
        )
        
        # Create sessions for each unique date (all locked-in by default)
        unique_dates = sorted(set(match.date for match in match_list if match.date), reverse=True)
        session_id_map = {}
        
        for date in unique_dates:
            cursor = conn.execute(
                """INSERT INTO sessions (date, name, is_pending)
                   VALUES (?, ?, 0)""",
                (date, date)  # Session name is just the date
            )
            session_id_map[date] = cursor.lastrowid
        
        # Insert matches with session_ids (ELO changes initially 0)
        match_data = []
        for match_id, match in enumerate(match_list, start=1):
            team1_p1_name, team1_p2_name = match.players[0]
            team2_p1_name, team2_p2_name = match.players[1]
            session_id = session_id_map.get(match.date)
            
            match_data.append((
                match_id,
                session_id,
                match.date or '',
                player_id_map[team1_p1_name], team1_p1_name,
                player_id_map[team1_p2_name], team1_p2_name,
                player_id_map[team2_p1_name], team2_p1_name,
                player_id_map[team2_p2_name], team2_p2_name,
                match.original_scores[0], match.original_scores[1],
                match.winner,
                0, 0  # ELO changes set to 0, will be calculated by calculate_stats()
            ))

        conn.executemany(
            """INSERT INTO matches (
                id, session_id, date, team1_player1_id, team1_player1_name, team1_player2_id, team1_player2_name,
                team2_player1_id, team2_player1_name, team2_player2_id, team2_player2_name,
                team1_score, team2_score, winner, team1_elo_change, team2_elo_change
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            match_data
        )
    
    # Now calculate all stats from the database
    return calculate_stats()


def load_matches_from_database() -> List[Match]:
    """
    Load matches from database (locked-in sessions only) and convert to Match objects.
    
    Active sessions are intentionally excluded - their matches are invisible to stats
    until the session is locked in.
    
    Returns:
        List of Match objects in chronological order
    """
    with db.get_db() as conn:
        cursor = conn.execute("""
            SELECT m.date, m.team1_player1_name, m.team1_player2_name,
                   m.team2_player1_name, m.team2_player2_name,
                   m.team1_score, m.team2_score
            FROM matches m
            LEFT JOIN sessions s ON m.session_id = s.id
            WHERE m.session_id IS NULL OR s.is_pending = 0
            ORDER BY m.id ASC
        """)
        
        match_list = []
        for row in cursor.fetchall():
            match = Match(
                row["team1_player1_name"],
                row["team1_player2_name"],
                row["team2_player1_name"],
                row["team2_player2_name"],
                [row["team1_score"], row["team2_score"]],
                row["date"]
            )
            match_list.append(match)
        
        return match_list


def calculate_stats() -> Dict:
    """
    Calculate all player statistics from database matches (locked-in sessions only).
    
    This is the core calculation function that:
    - Loads locked-in session matches from database
    - Processes through ELO calculation engine
    - Flushes derived stats tables (players, partnerships, opponents, elo_history)
    - Repopulates with calculated data
    - Updates match ELO change fields in database
    
    Tables flushed & repopulated:
    - players
    - partnership_stats
    - opponent_stats
    - elo_history
    - matches (ELO change fields only)
    
    Tables preserved:
    - sessions (unchanged)
    - matches records (only ELO fields updated)
    
    Returns:
        dict with player_count and match_count
    """
    # Load locked-in matches from database
    match_list = load_matches_from_database()
    
    if not match_list:
        return {"player_count": 0, "match_count": 0}
    
    # Process through calculation engine
    tracker = calculation_service.process_matches(match_list)
    
    # Flush derived stats tables (preserve sessions & matches & players)
    with db.get_db() as conn:
        conn.execute("DELETE FROM elo_history")
        conn.execute("DELETE FROM opponent_stats")
        conn.execute("DELETE FROM partnership_stats")
        
        # Update or insert players (preserve existing IDs)
        for name, stats in tracker.players.items():
            conn.execute("""
                INSERT INTO players (name, current_elo, games, wins, points, win_rate, avg_point_diff)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(name) DO UPDATE SET
                    current_elo = excluded.current_elo,
                    games = excluded.games,
                    wins = excluded.wins,
                    points = excluded.points,
                    win_rate = excluded.win_rate,
                    avg_point_diff = excluded.avg_point_diff
            """, (
                name, round(stats.elo, 2), stats.game_count, stats.win_count,
                stats.points, round(stats.win_rate, 3), round(stats.avg_point_diff, 1)
            ))
        
        # Rebuild player_id_map from database
        player_id_map = {}
        cursor = conn.execute("SELECT id, name FROM players")
        for row in cursor.fetchall():
            player_id_map[row["name"]] = row["id"]
        
        # Update player IDs in matches table using bulk CASE update
        if player_id_map:
            when_clauses = " ".join([
                f"WHEN '{name}' THEN {player_id}" 
                for name, player_id in player_id_map.items()
            ])
            
            conn.execute(f"""
                UPDATE matches 
                SET team1_player1_id = CASE team1_player1_name {when_clauses} ELSE team1_player1_id END,
                    team1_player2_id = CASE team1_player2_name {when_clauses} ELSE team1_player2_id END,
                    team2_player1_id = CASE team2_player1_name {when_clauses} ELSE team2_player1_id END,
                    team2_player2_id = CASE team2_player2_name {when_clauses} ELSE team2_player2_id END
            """)
        
        # Update match ELO changes (only for locked-in sessions)
        for match in match_list:
            team1_p1_name, team1_p2_name = match.players[0]
            team2_p1_name, team2_p2_name = match.players[1]
            
            conn.execute("""
                UPDATE matches 
                SET team1_elo_change = ?, team2_elo_change = ?
                WHERE id IN (
                    SELECT m.id FROM matches m
                    LEFT JOIN sessions s ON m.session_id = s.id
                    WHERE m.team1_player1_name = ? AND m.team1_player2_name = ?
                      AND m.team2_player1_name = ? AND m.team2_player2_name = ?
                      AND m.team1_score = ? AND m.team2_score = ?
                      AND m.date = ?
                      AND (m.session_id IS NULL OR s.is_pending = 0)
                    LIMIT 1
                )
            """, (
                round(match.elo_deltas[0], 1) if match.elo_deltas[0] else 0,
                round(match.elo_deltas[1], 1) if match.elo_deltas[1] else 0,
                team1_p1_name, team1_p2_name,
                team2_p1_name, team2_p2_name,
                match.original_scores[0], match.original_scores[1],
                match.date
            ))
        
        # Get match IDs for elo_history (build map in order)
        # Only include locked-in sessions to match load_matches_from_database()
        match_id_map = {}
        cursor = conn.execute("""
            SELECT m.id, m.team1_player1_name, m.team1_player2_name,
                   m.team2_player1_name, m.team2_player2_name,
                   m.team1_score, m.team2_score, m.date
            FROM matches m
            LEFT JOIN sessions s ON m.session_id = s.id
            WHERE m.session_id IS NULL OR s.is_pending = 0
            ORDER BY m.id ASC
        """)
        
        db_matches = cursor.fetchall()
        match_idx = 0
        
        for db_match in db_matches:
            if match_idx < len(match_list):
                match = match_list[match_idx]
                team1_p1_name, team1_p2_name = match.players[0]
                team2_p1_name, team2_p2_name = match.players[1]
                
                # Check if this DB match corresponds to current Match object
                if (db_match["team1_player1_name"] == team1_p1_name and
                    db_match["team1_player2_name"] == team1_p2_name and
                    db_match["team2_player1_name"] == team2_p1_name and
                    db_match["team2_player2_name"] == team2_p2_name and
                    db_match["team1_score"] == match.original_scores[0] and
                    db_match["team2_score"] == match.original_scores[1] and
                    db_match["date"] == match.date):
                    
                    match_id_map[id(match)] = db_match["id"]
                    match_idx += 1
        
        # Insert partnerships
        partnership_data = []
        for player_name, player_stats in tracker.players.items():
            player_id = player_id_map[player_name]
            for partner_name, games in player_stats.games_with.items():
                wins = player_stats.wins_with.get(partner_name, 0)
                losses = games - wins
                win_rate = wins / games if games > 0 else 0
                points = (wins * 3) + (losses * 1)
                total_pt_diff = player_stats.point_diff_with.get(partner_name, 0)
                avg_pt_diff = total_pt_diff / games if games > 0 else 0
                
                partnership_data.append((
                    player_id, player_name,
                    player_id_map[partner_name], partner_name,
                    games, wins, points,
                    round(win_rate, 3), round(avg_pt_diff, 1)
                ))
        
        if partnership_data:
            conn.executemany(
                """INSERT INTO partnership_stats (
                    player_id, player_name, partner_id, partner_name,
                    games, wins, points, win_rate, avg_point_diff
                   ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                partnership_data
            )
        
        # Insert opponents
        opponent_data = []
        for player_name, player_stats in tracker.players.items():
            player_id = player_id_map[player_name]
            for opponent_name, games in player_stats.games_against.items():
                wins = player_stats.wins_against.get(opponent_name, 0)
                losses = games - wins
                win_rate = wins / games if games > 0 else 0
                points = (wins * 3) + (losses * 1)
                total_pt_diff = player_stats.point_diff_against.get(opponent_name, 0)
                avg_pt_diff = total_pt_diff / games if games > 0 else 0
                
                opponent_data.append((
                    player_id, player_name,
                    player_id_map[opponent_name], opponent_name,
                    games, wins, points,
                    round(win_rate, 3), round(avg_pt_diff, 1)
                ))
        
        if opponent_data:
            conn.executemany(
                """INSERT INTO opponent_stats (
                    player_id, player_name, opponent_id, opponent_name,
                    games, wins, points, win_rate, avg_point_diff
                   ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                opponent_data
            )
        
        # Insert ELO history
        elo_history_data = []
        for player_name, player_stats in tracker.players.items():
            player_id = player_id_map[player_name]
            for match_ref, elo_after, elo_change, date in player_stats.match_elo_history:
                match_id = match_id_map.get(match_ref)
                if match_id:
                    elo_history_data.append((
                        player_id, player_name, match_id,
                        date or '',
                        round(elo_after, 1),
                        round(elo_change, 1)
                    ))
        
        if elo_history_data:
            conn.executemany(
                """INSERT INTO elo_history (
                    player_id, player_name, match_id, date, elo_after, elo_change
                   ) VALUES (?, ?, ?, ?, ?, ?)""",
                elo_history_data
            )
    
    return {
        "player_count": len(tracker.players),
        "match_count": len(match_list)
    }


def get_rankings() -> List[Dict]:
    """Get current player rankings ordered by points."""
    with db.get_db() as conn:
        cursor = conn.execute(
            """SELECT name, points, games, win_rate, wins, 
                      (games - wins) as losses, avg_point_diff, current_elo
               FROM players
               ORDER BY points DESC, name ASC"""
        )
        
        results = []
        for row in cursor.fetchall():
            results.append({
                "Name": row["name"],
                "Points": row["points"],
                "Games": row["games"],
                "Win Rate": row["win_rate"],
                "Wins": row["wins"],
                "Losses": row["losses"],
                "Avg Pt Diff": row["avg_point_diff"],
                "ELO": round(row["current_elo"])
            })
        
        return results


def get_player_stats(player_name: str) -> Optional[Dict]:
    """
    Get detailed stats for a player including partnerships and opponents.
    
    Returns dict with structure:
    {
        "overview": {"ranking": 1, "points": 100, "rating": 1500},
        "stats": [
            {"Partner/Opponent": "OVERALL", "Points": ..., ...},
            {"Partner/Opponent": "", ...},  # blank row
            {"Partner/Opponent": "WITH PARTNERS", ...},
            {"Partner/Opponent": "partner_name", ...},
            ...
            {"Partner/Opponent": "", ...},  # blank row
            {"Partner/Opponent": "VS OPPONENTS", ...},
            {"Partner/Opponent": "opponent_name", ...},
            ...
        ]
    }
    """
    with db.get_db() as conn:
        # Get overall player stats
        cursor = conn.execute(
            "SELECT * FROM players WHERE name = ?",
            (player_name,)
        )
        player_row = cursor.fetchone()
        
        if not player_row:
            return None
        
        # Calculate player's ranking
        cursor = conn.execute(
            """SELECT name FROM players 
               ORDER BY points DESC, avg_point_diff DESC, win_rate DESC, current_elo DESC"""
        )
        all_players = [row["name"] for row in cursor.fetchall()]
        ranking = all_players.index(player_name) + 1 if player_name in all_players else None
        
        # Build overview
        overview = {
            "ranking": ranking,
            "points": player_row["points"],
            "rating": round(player_row["current_elo"])
        }
        
        # Build results list
        results = []
        
        # Overall stats
        results.append({
            "Partner/Opponent": "OVERALL",
            "Points": player_row["points"],
            "Games": player_row["games"],
            "Wins": player_row["wins"],
            "Losses": player_row["games"] - player_row["wins"],
            "Win Rate": player_row["win_rate"],
            "Avg Pt Diff": player_row["avg_point_diff"]
        })
        
        # Blank row
        results.append({
            "Partner/Opponent": "",
            "Points": "",
            "Games": "",
            "Wins": "",
            "Losses": "",
            "Win Rate": "",
            "Avg Pt Diff": ""
        })
        
        # Partnership header
        results.append({
            "Partner/Opponent": "WITH PARTNERS",
            "Points": "",
            "Games": "",
            "Wins": "",
            "Losses": "",
            "Win Rate": "",
            "Avg Pt Diff": ""
        })
        
        # Partnership stats
        cursor = conn.execute(
            """SELECT partner_name, games, wins, points, win_rate, avg_point_diff
               FROM partnership_stats
               WHERE player_name = ?
               ORDER BY points DESC, win_rate DESC""",
            (player_name,)
        )
        
        for row in cursor.fetchall():
            results.append({
                "Partner/Opponent": row["partner_name"],
                "Points": row["points"],
                "Games": row["games"],
                "Wins": row["wins"],
                "Losses": row["games"] - row["wins"],
                "Win Rate": row["win_rate"],
                "Avg Pt Diff": row["avg_point_diff"]
            })
        
        # Blank row
        results.append({
            "Partner/Opponent": "",
            "Points": "",
            "Games": "",
            "Wins": "",
            "Losses": "",
            "Win Rate": "",
            "Avg Pt Diff": ""
        })
        
        # Opponent header
        results.append({
            "Partner/Opponent": "VS OPPONENTS",
            "Points": "",
            "Games": "",
            "Wins": "",
            "Losses": "",
            "Win Rate": "",
            "Avg Pt Diff": ""
        })
        
        # Opponent stats
        cursor = conn.execute(
            """SELECT opponent_name, games, wins, points, win_rate, avg_point_diff
               FROM opponent_stats
               WHERE player_name = ?
               ORDER BY points DESC, win_rate DESC""",
            (player_name,)
        )
        
        for row in cursor.fetchall():
            results.append({
                "Partner/Opponent": row["opponent_name"],
                "Points": row["points"],
                "Games": row["games"],
                "Wins": row["wins"],
                "Losses": row["games"] - row["wins"],
                "Win Rate": row["win_rate"],
                "Avg Pt Diff": row["avg_point_diff"]
            })
        
        return {
            "overview": overview,
            "stats": results
        }


def get_matches(limit: Optional[int] = None) -> List[Dict]:
    """Get all matches, optionally limited."""
    with db.get_db() as conn:
        query = """
            SELECT m.id, m.date, m.session_id, s.name as session_name, s.is_pending as session_pending,
                   m.team1_player1_name, m.team1_player2_name,
                   m.team2_player1_name, m.team2_player2_name,
                   m.team1_score, m.team2_score, m.winner,
                   m.team1_elo_change, m.team2_elo_change
            FROM matches m
            LEFT JOIN sessions s ON m.session_id = s.id
            ORDER BY COALESCE(s.id, 999999) DESC, m.id DESC
        """
        
        if limit:
            query += f" LIMIT {limit}"
        
        cursor = conn.execute(query)
        
        results = []
        for row in cursor.fetchall():
            winner_text = "Tie"
            if row["winner"] == 1:
                winner_text = "Team 1"
            elif row["winner"] == 2:
                winner_text = "Team 2"
            
            results.append({
                "Match ID": row["id"],
                "Date": row["date"],
                "Session ID": row["session_id"],
                "Session Name": row["session_name"],
                "Session Active": bool(row["session_pending"]) if row["session_pending"] is not None else None,
                "Team 1 Player 1": row["team1_player1_name"],
                "Team 1 Player 2": row["team1_player2_name"],
                "Team 2 Player 1": row["team2_player1_name"],
                "Team 2 Player 2": row["team2_player2_name"],
                "Team 1 Score": row["team1_score"],
                "Team 2 Score": row["team2_score"],
                "Winner": winner_text,
                "Team 1 ELO Change": row["team1_elo_change"],
                "Team 2 ELO Change": row["team2_elo_change"]
            })
        
        return results


def get_player_match_history(player_name: str) -> Optional[List[Dict]]:
    """
    Get match history for a specific player.
    
    Returns:
        List of matches if player found (may be empty)
        None if player not found
    """
    with db.get_db() as conn:
        # Get player ID
        cursor = conn.execute("SELECT id FROM players WHERE name = ?", (player_name,))
        player_row = cursor.fetchone()
        
        if not player_row:
            return None  # Player not found
        
        player_id = player_row["id"]
        
        # Get all matches where player participated, joined with ELO history and session status
        cursor = conn.execute(
            """SELECT m.*, eh.elo_after, s.is_pending as session_pending
               FROM matches m
               LEFT JOIN elo_history eh ON eh.match_id = m.id AND eh.player_id = ?
               LEFT JOIN sessions s ON m.session_id = s.id
               WHERE team1_player1_id = ? OR team1_player2_id = ?
                  OR team2_player1_id = ? OR team2_player2_id = ?
               ORDER BY m.id DESC""",
            (player_id, player_id, player_id, player_id, player_id)
        )
        
        results = []
        for row in cursor.fetchall():
            # Determine which team the player was on
            if row["team1_player1_id"] == player_id or row["team1_player2_id"] == player_id:
                # Player on team 1
                partner = row["team1_player2_name"] if row["team1_player1_id"] == player_id else row["team1_player1_name"]
                opponent1 = row["team2_player1_name"]
                opponent2 = row["team2_player2_name"]
                player_score = row["team1_score"]
                opponent_score = row["team2_score"]
                elo_change = row["team1_elo_change"]
                
                if row["winner"] == 1:
                    result = "W"
                elif row["winner"] == -1:
                    result = "T"
                else:
                    result = "L"
            else:
                # Player on team 2
                partner = row["team2_player2_name"] if row["team2_player1_id"] == player_id else row["team2_player1_name"]
                opponent1 = row["team1_player1_name"]
                opponent2 = row["team1_player2_name"]
                player_score = row["team2_score"]
                opponent_score = row["team1_score"]
                elo_change = row["team2_elo_change"]
                
                if row["winner"] == 2:
                    result = "W"
                elif row["winner"] == -1:
                    result = "T"
                else:
                    result = "L"
            
            results.append({
                "Date": row["date"],
                "Partner": partner,
                "Opponent 1": opponent1,
                "Opponent 2": opponent2,
                "Result": result,
                "Score": f"{player_score}-{opponent_score}",
                "ELO Change": elo_change,
                "ELO After": row["elo_after"],
                "Session Active": bool(row["session_pending"]) if row["session_pending"] is not None else False
            })
        
        return results


def get_elo_timeline() -> List[Dict]:
    """Get ELO timeline data for all players."""
    with db.get_db() as conn:
        # Get all unique dates
        cursor = conn.execute(
            "SELECT DISTINCT date FROM elo_history ORDER BY date ASC"
        )
        dates = [row["date"] for row in cursor.fetchall()]
        
        if not dates:
            return []
        
        # Get all players
        cursor = conn.execute("SELECT name FROM players ORDER BY name ASC")
        player_names = [row["name"] for row in cursor.fetchall()]
        
        # Build timeline data
        timeline = []
        for date in dates:
            row_data = {"Date": date}
            
            for player_name in player_names:
                # Get the ELO at this date for this player
                cursor = conn.execute(
                    """SELECT elo_after FROM elo_history
                       WHERE player_name = ? AND date <= ?
                       ORDER BY date DESC, id DESC
                       LIMIT 1""",
                    (player_name, date)
                )
                result = cursor.fetchone()
                
                if result:
                    row_data[player_name] = result["elo_after"]
                else:
                    # Player hasn't played yet at this date, use initial ELO
                    row_data[player_name] = INITIAL_ELO
            
            timeline.append(row_data)
        
        return timeline


def is_database_empty() -> bool:
    """Check if database is empty (no players)."""
    return db.is_database_empty()


def get_setting(key: str) -> Optional[str]:
    """
    Get a setting value by key.
    
    Args:
        key: Setting key (e.g., 'whatsapp_group_id')
        
    Returns:
        Setting value or None if not found
    """
    with db.get_db() as conn:
        cursor = conn.execute(
            "SELECT value FROM settings WHERE key = ?",
            (key,)
        )
        row = cursor.fetchone()
        return row["value"] if row else None


def set_setting(key: str, value: str) -> None:
    """
    Set a setting value (upsert).
    
    Args:
        key: Setting key
        value: Setting value
    """
    with db.get_db() as conn:
        conn.execute(
            """INSERT INTO settings (key, value, updated_at)
               VALUES (?, ?, CURRENT_TIMESTAMP)
               ON CONFLICT(key) DO UPDATE SET 
                   value = excluded.value,
                   updated_at = CURRENT_TIMESTAMP""",
            (key, value)
        )


def get_sessions() -> List[Dict]:
    """Get all sessions ordered by date (most recent first)."""
    with db.get_db() as conn:
        cursor = conn.execute(
            """SELECT id, date, name, is_pending, created_at
               FROM sessions
               ORDER BY date DESC, created_at DESC"""
        )
        
        results = []
        for row in cursor.fetchall():
            results.append({
                "id": row["id"],
                "date": row["date"],
                "name": row["name"],
                "is_active": bool(row["is_pending"]),
                "created_at": row["created_at"]
            })
        
        return results


def get_session(session_id: int) -> Optional[Dict]:
    """Get a specific session by ID."""
    with db.get_db() as conn:
        cursor = conn.execute(
            "SELECT id, date, name, is_pending, created_at FROM sessions WHERE id = ?",
            (session_id,)
        )
        row = cursor.fetchone()
        
        if not row:
            return None
        
        return {
            "id": row["id"],
            "date": row["date"],
            "name": row["name"],
            "is_active": bool(row["is_pending"]),
            "created_at": row["created_at"]
        }


def create_session(date: str) -> Dict:
    """
    Create a new session.
    
    Args:
        date: Date string (e.g., '11/7/2025')
        
    Returns:
        Dict with session info
        
    Raises:
        ValueError: If an active session already exists for this date
    """
    with db.get_db() as conn:
        # Check if active session exists for this date
        cursor = conn.execute(
            "SELECT id, name FROM sessions WHERE date = ? AND is_pending = 1",
            (date,)
        )
        active_session = cursor.fetchone()
        if active_session:
            raise ValueError(f"A pending session '{active_session['name']}' already exists for this date. Please submit the current session before creating a new one.")
        
        # Count existing sessions for this date
        cursor = conn.execute(
            "SELECT COUNT(*) as count FROM sessions WHERE date = ?",
            (date,)
        )
        count = cursor.fetchone()["count"]
        
        # Generate session name
        if count == 0:
            name = date
        else:
            name = f"{date} #{count + 1}"
        
        # Create the session
        cursor = conn.execute(
            """INSERT INTO sessions (date, name, is_pending)
               VALUES (?, ?, 1)""",
            (date, name)
        )
        session_id = cursor.lastrowid
        
        return {
            "id": session_id,
            "date": date,
            "name": name,
            "is_active": True,
            "created_at": ""  # Will be set by database
        }


def lock_in_session(session_id: int) -> bool:
    """
    Lock in a session (mark as complete/submitted, is_pending = 0).
    
    Args:
        session_id: ID of session to lock in
        
    Returns:
        True if successful, False if session not found
    """
    with db.get_db() as conn:
        cursor = conn.execute(
            "UPDATE sessions SET is_pending = 0 WHERE id = ?",
            (session_id,)
        )
        return cursor.rowcount > 0


def delete_session(session_id: int) -> bool:
    """
    Delete an active session and all its matches.
    Only active (pending) sessions can be deleted.
    
    Args:
        session_id: ID of session to delete
        
    Returns:
        True if successful, False if session not found or not active
        
    Raises:
        ValueError: If session is not active (already submitted)
    """
    with db.get_db() as conn:
        # Check if session exists and is active
        cursor = conn.execute(
            "SELECT is_pending FROM sessions WHERE id = ?",
            (session_id,)
        )
        session = cursor.fetchone()
        
        if not session:
            return False
        
        if session['is_pending'] != 1:
            raise ValueError("Cannot delete a submitted session. Only active sessions can be deleted.")
        
        # First delete all matches in the session
        conn.execute(
            "DELETE FROM matches WHERE session_id = ?",
            (session_id,)
        )
        
        # Then delete the session itself
        cursor = conn.execute(
            "DELETE FROM sessions WHERE id = ?",
            (session_id,)
        )
        return cursor.rowcount > 0


def get_all_player_names() -> List[str]:
    """
    Get all unique player names from the database.
    
    Returns:
        List of player names sorted alphabetically
    """
    with db.get_db() as conn:
        cursor = conn.execute("SELECT name FROM players ORDER BY name ASC")
        return [row["name"] for row in cursor.fetchall()]


def get_or_create_player(name: str) -> int:
    """
    Get player ID by name, or create if doesn't exist.
    
    Args:
        name: Player name
        
    Returns:
        Player ID
    """
    with db.get_db() as conn:
        # Try to get existing player
        cursor = conn.execute("SELECT id FROM players WHERE name = ?", (name,))
        row = cursor.fetchone()
        
        if row:
            return row["id"]
        
        # Create new player
        cursor = conn.execute(
            """INSERT INTO players (name, current_elo, games, wins, points, win_rate, avg_point_diff)
               VALUES (?, ?, 0, 0, 0, 0.0, 0.0)""",
            (name, INITIAL_ELO)
        )
        return cursor.lastrowid


def create_match(
    session_id: int,
    date: str,
    team1_player1: str,
    team1_player2: str,
    team2_player1: str,
    team2_player2: str,
    team1_score: int,
    team2_score: int
) -> int:
    """
    Create a new match in a session.
    
    Args:
        session_id: Session ID
        date: Match date
        team1_player1: Team 1 player 1 name
        team1_player2: Team 1 player 2 name
        team2_player1: Team 2 player 1 name
        team2_player2: Team 2 player 2 name
        team1_score: Team 1 score
        team2_score: Team 2 score
        
    Returns:
        Match ID
    """
    with db.get_db() as conn:
        # Get or create player IDs
        team1_p1_id = get_or_create_player(team1_player1)
        team1_p2_id = get_or_create_player(team1_player2)
        team2_p1_id = get_or_create_player(team2_player1)
        team2_p2_id = get_or_create_player(team2_player2)
        
        # Determine winner
        if team1_score > team2_score:
            winner = 1
        elif team2_score > team1_score:
            winner = 2
        else:
            winner = -1  # Tie
        
        # For now, we don't calculate ELO changes (would need full recalculation)
        # These can be set to 0 or null
        cursor = conn.execute(
            """INSERT INTO matches (
                session_id, date,
                team1_player1_id, team1_player1_name,
                team1_player2_id, team1_player2_name,
                team2_player1_id, team2_player1_name,
                team2_player2_id, team2_player2_name,
                team1_score, team2_score, winner,
                team1_elo_change, team2_elo_change
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)""",
            (
                session_id, date,
                team1_p1_id, team1_player1,
                team1_p2_id, team1_player2,
                team2_p1_id, team2_player1,
                team2_p2_id, team2_player2,
                team1_score, team2_score, winner
            )
        )
        
        return cursor.lastrowid


def update_match(
    match_id: int,
    team1_player1: str,
    team1_player2: str,
    team2_player1: str,
    team2_player2: str,
    team1_score: int,
    team2_score: int
) -> bool:
    """
    Update an existing match.
    
    Args:
        match_id: Match ID to update
        team1_player1: Team 1 player 1 name
        team1_player2: Team 1 player 2 name
        team2_player1: Team 2 player 1 name
        team2_player2: Team 2 player 2 name
        team1_score: Team 1 score
        team2_score: Team 2 score
        
    Returns:
        True if successful, False if match not found
    """
    with db.get_db() as conn:
        # Get or create player IDs
        team1_p1_id = get_or_create_player(team1_player1)
        team1_p2_id = get_or_create_player(team1_player2)
        team2_p1_id = get_or_create_player(team2_player1)
        team2_p2_id = get_or_create_player(team2_player2)
        
        # Determine winner
        if team1_score > team2_score:
            winner = 1
        elif team2_score > team1_score:
            winner = 2
        else:
            winner = -1  # Tie
        
        cursor = conn.execute(
            """UPDATE matches 
               SET team1_player1_id = ?, team1_player1_name = ?,
                   team1_player2_id = ?, team1_player2_name = ?,
                   team2_player1_id = ?, team2_player1_name = ?,
                   team2_player2_id = ?, team2_player2_name = ?,
                   team1_score = ?, team2_score = ?,
                   winner = ?
               WHERE id = ?""",
            (
                team1_p1_id, team1_player1,
                team1_p2_id, team1_player2,
                team2_p1_id, team2_player1,
                team2_p2_id, team2_player2,
                team1_score, team2_score,
                winner,
                match_id
            )
        )
        
        return cursor.rowcount > 0


def delete_match(match_id: int) -> bool:
    """
    Delete a match from the database.
    
    Args:
        match_id: ID of the match to delete
        
    Returns:
        True if successful, False if match not found
    """
    with db.get_db() as conn:
        cursor = conn.execute(
            "DELETE FROM matches WHERE id = ?",
            (match_id,)
        )
        return cursor.rowcount > 0


def get_match(match_id: int) -> Optional[Dict]:
    """Get a specific match by ID."""
    with db.get_db() as conn:
        cursor = conn.execute(
            """SELECT m.id, m.session_id, m.date,
                      m.team1_player1_name, m.team1_player2_name,
                      m.team2_player1_name, m.team2_player2_name,
                      m.team1_score, m.team2_score,
                      s.is_pending as session_pending
               FROM matches m
               LEFT JOIN sessions s ON m.session_id = s.id
               WHERE m.id = ?""",
            (match_id,)
        )
        row = cursor.fetchone()
        
        if not row:
            return None
        
        return {
            "id": row["id"],
            "session_id": row["session_id"],
            "date": row["date"],
            "team1_player1": row["team1_player1_name"],
            "team1_player2": row["team1_player2_name"],
            "team2_player1": row["team2_player1_name"],
            "team2_player2": row["team2_player2_name"],
            "team1_score": row["team1_score"],
            "team2_score": row["team2_score"],
            "session_active": bool(row["session_pending"]) if row["session_pending"] is not None else None
        }


def get_active_session() -> Optional[Dict]:
    """Get the currently active session, if any."""
    with db.get_db() as conn:
        cursor = conn.execute(
            """SELECT id, date, name, is_pending, created_at
               FROM sessions
               WHERE is_pending = 1
               ORDER BY created_at DESC
               LIMIT 1"""
        )
        row = cursor.fetchone()
        
        if not row:
            return None
        
        return {
            "id": row["id"],
            "date": row["date"],
            "name": row["name"],
            "is_active": bool(row["is_pending"]),
            "created_at": row["created_at"]
        }


def export_matches_to_csv() -> str:
    """
    Export all matches (locked-in sessions only) to CSV format matching Google Sheets import format.
    
    Format: DATE, T1P1, T1P2, T2P1, T2P2, T1SCORE, T2SCORE
    
    Returns:
        str: CSV formatted string with header and all matches
    """
    with db.get_db() as conn:
        cursor = conn.execute(
            """SELECT date, team1_player1_name, team1_player2_name, 
                      team2_player1_name, team2_player2_name,
                      team1_score, team2_score
               FROM matches 
               WHERE session_id IN (SELECT id FROM sessions WHERE is_pending = 0)
               ORDER BY id ASC"""
        )
        matches = cursor.fetchall()
    
    # Create CSV in memory
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Write header matching Google Sheets format
    writer.writerow(['Date', 'Team 1', '', 'Team 2', '', 'Team 1 Score', 'Team 2 Score'])
    
    # Write match data
    for match in matches:
        writer.writerow([
            match['date'],
            match['team1_player1_name'],
            match['team1_player2_name'],
            match['team2_player1_name'],
            match['team2_player2_name'],
            match['team1_score'],
            match['team2_score']
        ])
    
    return output.getvalue()

