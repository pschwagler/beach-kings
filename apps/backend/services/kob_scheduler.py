"""
KOB tournament scheduling — public API facade.

Re-exports from focused submodules so existing imports
(``from backend.services.kob_scheduler import …``) continue to work
with zero churn in routes, tests, or other services.

Submodules:
    kob_time        – time constants & helpers
    kob_algorithms  – pure schedule generation algorithms
    kob_preview     – preview generation & explanations
    kob_suggest     – format recommendation engine & pills
"""

from backend.services.kob_time import (  # noqa: F401
    UNSEEDED_SORT_KEY,
    WARMUP_MINUTES,
    GAME_MINUTES,
    MAX_POOL_PLAY_GPP,
    _wave_minutes,
    _round_time_minutes,
    _auto_pool_game_to,
)

from backend.services.kob_algorithms import (  # noqa: F401
    _full_rr_round_count,
    _snake_draft,
    generate_full_round_robin,
    generate_partial_round_robin,
    generate_pools_schedule,
    generate_playoff_schedule,
    generate_draft_playoff_preview,
    generate_schedule,
)

from backend.services.kob_preview import (  # noqa: F401
    generate_preview,
)

from backend.services.kob_suggest import (  # noqa: F401
    suggest_defaults,
    suggest_alternatives,
    recommend_format,
)
