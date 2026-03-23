"""
Data service layer — backward-compatibility re-export shim.

All symbols are now defined in focused domain modules:

- league_data    : leagues, seasons, locations, courts, home courts,
                   members, join requests, settings
- session_data   : sessions, matches, participants, session-code utilities
- player_data    : player CRUD, player home courts, initials, search
- signup_data    : weekly schedules, signups, signup events
- message_data   : league messages
- stats_data     : rankings, ELO, match queries, stats calculation
  - stats_read_data  : read-only stats queries
  - stats_calc_data  : stats calculation pipeline

Import from this module to keep existing call sites unchanged.
"""

from backend.services.league_data import *  # noqa: F401,F403
from backend.services.session_data import *  # noqa: F401,F403
from backend.services.player_data import *  # noqa: F401,F403
from backend.services.signup_data import *  # noqa: F401,F403
from backend.services.message_data import *  # noqa: F401,F403
from backend.services.stats_data import *  # noqa: F401,F403

# Explicit re-exports for tools that perform static analysis
from backend.services.league_data import (
    create_league,
    list_leagues,
    query_leagues,
    get_league,
    get_user_leagues,
    update_league,
    delete_league,
    is_database_empty,
    _is_season_active,
    create_season,
    list_seasons,
    get_season,
    update_season,
    create_location,
    list_locations,
    list_regions,
    update_location,
    delete_location,
    create_court,
    list_courts,
    update_court,
    delete_court,
    get_league_home_courts,
    add_league_home_court,
    remove_league_home_court,
    reorder_league_home_courts,
    set_league_home_courts,
    get_player_home_courts,
    add_player_home_court,
    remove_player_home_court,
    set_player_home_courts,
    reorder_player_home_courts,
    list_league_members,
    add_league_member,
    add_league_members_batch,
    is_league_member,
    get_league_member_by_player,
    update_league_member,
    remove_league_member,
    get_league_member_user_ids,
    get_league_admin_user_ids,
    create_league_request,
    _join_request_row_to_dict,
    list_league_join_requests,
    list_league_join_requests_rejected,
    cancel_league_request,
    get_setting,
    set_setting,
)

from backend.services.session_data import (
    SESSION_CODE_ALPHABET,
    SESSION_CODE_LENGTH,
    SESSION_CODE_MAX_ATTEMPTS,
    get_sessions,
    get_session,
    get_session_for_routes,
    get_active_session,
    get_session_by_code,
    get_open_sessions_for_user,
    get_user_leagues_for_routes,
    _generate_session_code,
    get_or_create_active_league_session,
    create_league_session,
    create_session,
    lock_in_session,
    update_session,
    delete_session,
    get_matches,
    get_session_matches,
    get_match_async,
    create_match_async,
    update_match_async,
    delete_match_async,
    get_session_participants,
    remove_session_participant,
    add_session_participant,
    join_session_by_code,
    can_user_add_match_to_session,
    get_session_match_player_user_ids,
)

from backend.services.player_data import (
    generate_player_initials,
    _normalize_list_str,
    _filter_placeholders,
    _filter_search,
    _filter_location,
    _filter_league_membership,
    _filter_demographics,
    list_players_search,
    get_all_player_names,
    get_player_by_user_id,
    get_player_by_user_id_with_stats,
    upsert_user_player,
    get_or_create_player,
    get_player_by_id,
)

from backend.services.signup_data import (
    create_weekly_schedule,
    get_weekly_schedules,
    get_weekly_schedule,
    update_weekly_schedule,
    delete_weekly_schedule,
    _generate_signups_from_schedule,
    _get_previous_calendar_week_range,
    _calculate_open_signups_at,
    recalculate_open_signups_for_season,
    _weekly_schedule_to_dict,
    create_signup,
    get_signups,
    get_signup,
    update_signup,
    delete_signup,
    signup_player,
    dropout_player,
    get_signup_players,
    get_signup_events,
    _signup_to_dict,
    _signup_to_dict_with_players,
)

from backend.services.message_data import (
    get_league_messages,
    create_league_message,
)

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
