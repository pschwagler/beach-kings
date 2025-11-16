"""
ELO calculation service.
Processes matches and computes all statistics.
"""

from backend.models.match import StatsTracker


def process_matches(match_list):
    """
    Process a list of matches and return the stats tracker with all computed statistics.
    
    Args:
        match_list: List of Match objects
        
    Returns:
        StatsTracker object with all computed stats
    """
    tracker = StatsTracker()
    for match in match_list:
        tracker.process_match(match)
    return tracker

