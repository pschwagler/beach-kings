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
