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
