"""Enums models."""

import enum


class SessionStatus(str, enum.Enum):
    """Session status enum."""

    ACTIVE = "ACTIVE"
    SUBMITTED = "SUBMITTED"
    EDITED = "EDITED"


class OpenSignupsMode(str, enum.Enum):
    """Weekly schedule signup opening mode."""

    AUTO_AFTER_LAST_SESSION = "auto_after_last_session"
    SPECIFIC_DAY_TIME = "specific_day_time"
    ALWAYS_OPEN = "always_open"


class SignupEventType(str, enum.Enum):
    """Signup event type."""

    SIGNUP = "signup"
    DROPOUT = "dropout"


class ScoringSystem(str, enum.Enum):
    """Season scoring system enum."""

    POINTS_SYSTEM = "points_system"
    SEASON_RATING = "season_rating"


class FriendRequestStatus(str, enum.Enum):
    """Friend request status enum."""

    PENDING = "pending"
    ACCEPTED = "accepted"
    DECLINED = "declined"
    CANCELLED = "cancelled"
    SUPERSEDED = "superseded"


class NotificationType(str, enum.Enum):
    """Notification type enum."""

    LEAGUE_MESSAGE = "league_message"
    LEAGUE_INVITE = "league_invite"
    LEAGUE_JOIN_REQUEST = "league_join_request"
    LEAGUE_JOIN_REJECTED = "league_join_rejected"
    SEASON_START = "season_start"
    SEASON_ACTIVATED = "season_activated"
    PLACEHOLDER_CLAIMED = "placeholder_claimed"
    FRIEND_REQUEST = "friend_request"
    FRIEND_ACCEPTED = "friend_accepted"
    SESSION_SUBMITTED = "session_submitted"
    SESSION_AUTO_SUBMITTED = "session_auto_submitted"
    SESSION_AUTO_DELETED = "session_auto_deleted"
    MEMBER_JOINED = "member_joined"
    MEMBER_REMOVED = "member_removed"
    DIRECT_MESSAGE = "direct_message"
    SEASON_AWARD = "season_award"
    MODERATION_UPDATE = "moderation_update"


class InviteStatus(str, enum.Enum):
    """Player invite status enum."""

    PENDING = "pending"
    CLAIMED = "claimed"
