"""
Stats operations — backward-compatibility re-export shim.

All symbols are now defined in the three focused sub-modules:

- stats_read_data  : rankings, ELO timeline, match queries, player stats reads,
                     CSV export, match history
- stats_calc_data  : bulk insert/delete/upsert helpers, stats calculation
                     pipeline, register_stats_queue_callbacks
- player_data      : generate_player_initials (used internally by stats_read_data)

Import from this module to keep existing call sites unchanged.
"""

from backend.services.stats_read_data import *  # noqa: F401,F403
from backend.services.stats_calc_data import *  # noqa: F401,F403

# Explicit re-exports for tools that perform static analysis
from backend.services.stats_read_data import (
    _sort_rankings_all_seasons,
    _sort_rankings_single_season,
    get_rankings,
    get_elo_timeline,
    _build_elo_by_match,
    _match_row_to_elo_dict,
    get_season_matches_with_elo,
    get_league_matches_with_elo,
    query_matches,
    get_player_stats_by_id,
    get_player_season_partnership_opponent_stats,
    get_all_player_season_stats,
    get_all_player_season_partnership_opponent_stats,
    get_player_season_stats,
    get_player_league_stats,
    get_all_player_league_stats,
    get_player_league_partnership_opponent_stats,
    get_all_player_league_partnership_opponent_stats,
    export_matches_to_csv,
    get_player_match_history_by_id,
)

from backend.services.stats_calc_data import (
    delete_global_stats_async,
    delete_season_stats_async,
    delete_league_stats_async,
    load_stat_eligible_matches_async,
    delete_all_stats_async,
    _chunks,
    insert_elo_history_async,
    insert_season_rating_history_async,
    upsert_player_global_stats_async,
    insert_partnership_stats_async,
    insert_opponent_stats_async,
    insert_partnership_stats_season_async,
    insert_opponent_stats_season_async,
    insert_partnership_stats_league_async,
    insert_opponent_stats_league_async,
    upsert_player_season_stats_async,
    calculate_global_stats_async,
    calculate_league_stats_async,
    calculate_season_stats_async,
    register_stats_queue_callbacks,
)
