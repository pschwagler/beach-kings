"""Backend service modules, grouped by product domain.

The lazy compatibility map keeps established ``from backend.services import
foo_service`` imports working while new code can use the explicit domain path.
"""

from importlib import import_module
from types import ModuleType


_SERVICE_DOMAINS = {
    "account_deletion_service": "auth",
    "apple_revocation_worker": "auth",
    "apple_token_service": "auth",
    "auth_service": "auth",
    "auth_delivery_service": "auth",
    "auth_delivery_worker": "auth",
    "rate_limiting_service": "auth",
    "youth_safety_service": "auth",
    "court_photo_service": "courts",
    "court_service": "courts",
    "geocoding_service": "courts",
    "location_service": "courts",
    "match_validation": "games",
    "my_games_service": "games",
    "photo_match_service": "games",
    "session_cleanup_service": "games",
    "session_data": "games",
    "session_geo_service": "games",
    "kob_advancement": "kob",
    "kob_algorithms": "kob",
    "kob_preview": "kob",
    "kob_queries": "kob",
    "kob_responses": "kob",
    "kob_scheduler": "kob",
    "kob_scoring": "kob",
    "kob_service": "kob",
    "kob_suggest": "kob",
    "kob_time": "kob",
    "league_data": "leagues",
    "league_games_service": "leagues",
    "season_awards_service": "leagues",
    "season_finalization_service": "leagues",
    "signup_data": "leagues",
    "moderation_admin_queries": "moderation",
    "moderation_alerts": "moderation",
    "moderation_evidence_service": "moderation",
    "moderation_service": "moderation",
    "moderation_worker": "moderation",
    "notification_service": "notifications",
    "push_delivery_service": "notifications",
    "push_prefs_service": "notifications",
    "push_service": "notifications",
    "push_worker": "notifications",
    "avatar_service": "players",
    "gender_inference": "players",
    "placeholder_service": "players",
    "player_data": "players",
    "player_lifecycle": "players",
    "player_search_cache": "players",
    "player_search_scoring": "players",
    "user_service": "players",
    "email_service": "platform",
    "media_deletion_worker": "platform",
    "redis_service": "platform",
    "role_service": "platform",
    "s3_service": "platform",
    "settings_service": "platform",
    "websocket_manager": "platform",
    "public_service": "public",
    "direct_message_service": "social",
    "friend_service": "social",
    "interaction_policy": "social",
    "message_data": "social",
    "message_write_policy": "social",
    "relationship_service": "social",
    "youth_interaction_policy": "social",
    "calculation_service": "stats",
    "my_stats_service": "stats",
    "stats_calc_data": "stats",
    "stats_data": "stats",
    "stats_queue": "stats",
    "stats_read_data": "stats",
}

__all__ = ["data_service", *_SERVICE_DOMAINS]


def __getattr__(name: str) -> ModuleType:
    """Load compatibility module attributes without importing every service."""
    if name == "data_service":
        module = import_module("backend.services.data_service")
    elif domain := _SERVICE_DOMAINS.get(name):
        module = import_module(f"backend.services.{domain}.{name}")
    else:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
    globals()[name] = module
    return module
