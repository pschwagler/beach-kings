"""Central, privacy-preserving policy for every player-to-player interaction.

Feature services must not query :class:`UserBlock` directly.  They declare the
interaction they are performing here and either consume a public capability or
enforce the internal decision at the mutation boundary.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from enum import Enum
from typing import Any, Iterable, Mapping, Sequence

from sqlalchemy import Select, and_, delete, or_, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.models import (
    Friend,
    FriendRequest,
    InteractionRestriction,
    LeagueInvite,
    Notification,
    Player,
    User,
    SessionParticipant,
    UserBlock,
)
from backend.utils.datetime_utils import utcnow

logger = logging.getLogger(__name__)


class InteractionAction(str, Enum):
    """Every supported user-to-user surface must be registered here."""

    DIRECT_MESSAGE = "direct_message"
    FRIEND_REQUEST = "friend_request"
    LEAGUE_INVITE = "league_invite"
    SESSION_INVITE = "session_invite"
    MENTION = "mention"
    REPLY = "reply"
    PRESENCE = "presence"
    READ_RECEIPT = "read_receipt"
    NOTIFICATION = "notification"
    DISCOVERY = "discovery"
    USER_GENERATED_CONTENT = "user_generated_content"
    SHARED_OPERATIONAL_CONTENT = "shared_operational_content"


class PolicyRule(str, Enum):
    BILATERAL = "bilateral"
    SHARED_OPERATIONAL = "shared_operational"


# Deliberately explicit: the exhaustiveness test prevents a new enum member
# from inheriting an accidental default policy.
ACTION_POLICY: Mapping[InteractionAction, PolicyRule] = {
    InteractionAction.DIRECT_MESSAGE: PolicyRule.BILATERAL,
    InteractionAction.FRIEND_REQUEST: PolicyRule.BILATERAL,
    InteractionAction.LEAGUE_INVITE: PolicyRule.BILATERAL,
    InteractionAction.SESSION_INVITE: PolicyRule.BILATERAL,
    InteractionAction.MENTION: PolicyRule.BILATERAL,
    InteractionAction.REPLY: PolicyRule.BILATERAL,
    InteractionAction.PRESENCE: PolicyRule.BILATERAL,
    InteractionAction.READ_RECEIPT: PolicyRule.BILATERAL,
    InteractionAction.NOTIFICATION: PolicyRule.BILATERAL,
    InteractionAction.DISCOVERY: PolicyRule.BILATERAL,
    InteractionAction.USER_GENERATED_CONTENT: PolicyRule.BILATERAL,
    # Rosters, schedules, standings, scores, and match history remain visible.
    InteractionAction.SHARED_OPERATIONAL_CONTENT: PolicyRule.SHARED_OPERATIONAL,
}


class DenialReason(str, Enum):
    BLOCKED_BY_VIEWER = "blocked_by_viewer"
    BLOCKED_BY_OTHER = "blocked_by_other"
    VIEWER_RESTRICTED = "viewer_restricted"
    OTHER_RESTRICTED = "other_restricted"
    PLAYER_UNAVAILABLE = "player_unavailable"


@dataclass(frozen=True)
class InteractionDecision:
    action: InteractionAction
    allowed: bool
    denial_reason: DenialReason | None
    blocked_by_viewer: bool
    viewer_restricted: bool


class InteractionUnavailable(Exception):
    """Internal mutation denial; API routes expose only a generic 409."""

    def __init__(self, decision: InteractionDecision):
        super().__init__("Interaction unavailable")
        self.decision = decision


@dataclass(frozen=True)
class _PairState:
    viewer_blocks_other: bool = False
    other_blocks_viewer: bool = False
    viewer_restricted: bool = False
    other_restricted: bool = False
    viewer_unavailable: bool = False
    other_unavailable: bool = False


def decide_interaction(action: InteractionAction, state: _PairState) -> InteractionDecision:
    """Pure policy evaluation, kept separate for exhaustive direction tests."""
    rule = ACTION_POLICY[action]
    reason: DenialReason | None = None
    if rule is PolicyRule.BILATERAL:
        if state.viewer_unavailable or state.other_unavailable:
            reason = DenialReason.PLAYER_UNAVAILABLE
        elif state.viewer_blocks_other:
            reason = DenialReason.BLOCKED_BY_VIEWER
        elif state.other_blocks_viewer:
            reason = DenialReason.BLOCKED_BY_OTHER
        elif state.viewer_restricted:
            reason = DenialReason.VIEWER_RESTRICTED
        elif state.other_restricted:
            reason = DenialReason.OTHER_RESTRICTED
    return InteractionDecision(
        action=action,
        allowed=reason is None,
        denial_reason=reason,
        blocked_by_viewer=state.viewer_blocks_other,
        viewer_restricted=state.viewer_restricted,
    )


def _public_capability(state: _PairState) -> dict[str, Any]:
    return {
        "actions": {
            action.value: decide_interaction(action, state).allowed for action in InteractionAction
        },
        # These are the only two denial details safe to reveal to the viewer.
        "blocked_by_viewer": state.viewer_blocks_other,
        "viewer_restricted": state.viewer_restricted,
    }


async def _pair_states(
    session: AsyncSession,
    viewer_id: int,
    other_ids: Sequence[int],
) -> dict[int, _PairState]:
    unique_ids = tuple(dict.fromkeys(int(player_id) for player_id in other_ids))
    if len(unique_ids) > 100:
        raise ValueError("A maximum of 100 player IDs is allowed")
    if not unique_ids:
        return {}

    blocks_result = await session.execute(
        select(UserBlock.blocker_player_id, UserBlock.blocked_player_id).where(
            or_(
                and_(
                    UserBlock.blocker_player_id == viewer_id,
                    UserBlock.blocked_player_id.in_(unique_ids),
                ),
                and_(
                    UserBlock.blocked_player_id == viewer_id,
                    UserBlock.blocker_player_id.in_(unique_ids),
                ),
            )
        )
    )
    block_rows = blocks_result.all()
    viewer_blocks = {
        row.blocked_player_id for row in block_rows if row.blocker_player_id == viewer_id
    }
    other_blocks = {
        row.blocker_player_id for row in block_rows if row.blocked_player_id == viewer_id
    }

    now = utcnow()
    restricted_result = await session.execute(
        select(InteractionRestriction.player_id).where(
            InteractionRestriction.player_id.in_((viewer_id, *unique_ids)),
            InteractionRestriction.starts_at <= now,
            InteractionRestriction.expires_at > now,
            InteractionRestriction.revoked_at.is_(None),
        )
    )
    restricted_ids = set(restricted_result.scalars().all())
    restricted_ids.update(
        await account_restricted_player_ids(session, (viewer_id, *unique_ids), now=now)
    )
    active_result = await session.execute(
        select(Player.id).where(
            Player.id.in_((viewer_id, *unique_ids)), Player.deleted_at.is_(None)
        )
    )
    active_ids = set(active_result.scalars().all())
    return {
        other_id: _PairState(
            viewer_blocks_other=other_id in viewer_blocks,
            other_blocks_viewer=other_id in other_blocks,
            viewer_restricted=viewer_id in restricted_ids,
            other_restricted=other_id in restricted_ids,
            viewer_unavailable=viewer_id not in active_ids,
            other_unavailable=other_id not in active_ids,
        )
        for other_id in unique_ids
    }


async def interaction_capabilities(
    session: AsyncSession,
    viewer_id: int,
    other_ids: Sequence[int],
) -> dict[int, dict[str, Any]]:
    """Evaluate as many as 100 players with a bounded number of queries."""
    states = await _pair_states(session, viewer_id, other_ids)
    return {player_id: _public_capability(state) for player_id, state in states.items()}


async def interaction_capability(
    session: AsyncSession,
    viewer_id: int,
    other_id: int,
) -> dict[str, Any]:
    return (await interaction_capabilities(session, viewer_id, [other_id]))[other_id]


async def interaction_decision(
    session: AsyncSession,
    viewer_id: int,
    other_id: int,
    action: InteractionAction,
) -> InteractionDecision:
    state = (await _pair_states(session, viewer_id, [other_id]))[other_id]
    return decide_interaction(action, state)


async def enforce_action(
    session: AsyncSession,
    viewer_id: int,
    other_id: int,
    action: InteractionAction,
) -> None:
    decision = await interaction_decision(session, viewer_id, other_id, action)
    if not decision.allowed:
        raise InteractionUnavailable(decision)


async def enforce_actions(
    session: AsyncSession,
    viewer_id: int,
    other_ids: Sequence[int],
    action: InteractionAction,
) -> None:
    """Batch mutation enforcement without an N+1 policy query."""
    states = await _pair_states(session, viewer_id, other_ids)
    for state in states.values():
        decision = decide_interaction(action, state)
        if not decision.allowed:
            raise InteractionUnavailable(decision)


async def block_exists(session: AsyncSession, player_a: int, player_b: int) -> bool:
    decision = await interaction_decision(
        session, player_a, player_b, InteractionAction.DIRECT_MESSAGE
    )
    return decision.denial_reason in {
        DenialReason.BLOCKED_BY_VIEWER,
        DenialReason.BLOCKED_BY_OTHER,
    }


async def blocked_by_viewer(session: AsyncSession, viewer_id: int, other_id: int) -> bool:
    state = (await _pair_states(session, viewer_id, [other_id]))[other_id]
    return state.viewer_blocks_other


async def has_active_restriction(session: AsyncSession, player_id: int) -> bool:
    state = (await _pair_states(session, player_id, [player_id]))[player_id]
    return state.viewer_restricted


async def current_restriction(
    session: AsyncSession, player_id: int
) -> InteractionRestriction | None:
    """Return the active restriction with the latest expiry for status surfaces."""
    result = await session.execute(
        select(InteractionRestriction)
        .where(
            InteractionRestriction.player_id == player_id,
            InteractionRestriction.starts_at <= utcnow(),
            InteractionRestriction.expires_at > utcnow(),
            InteractionRestriction.revoked_at.is_(None),
        )
        .order_by(InteractionRestriction.expires_at.desc(), InteractionRestriction.id.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def account_restricted_player_ids(
    session: AsyncSession,
    player_ids: Sequence[int],
    *,
    now=None,
) -> set[int]:
    """Return players whose full account suspension or ban is currently effective."""
    unique_ids = tuple(dict.fromkeys(int(player_id) for player_id in player_ids))
    if not unique_ids:
        return set()
    current_time = now or utcnow()
    result = await session.execute(
        select(Player.id)
        .join(User, User.id == Player.user_id)
        .where(
            Player.id.in_(unique_ids),
            or_(
                User.moderation_status == "banned",
                and_(
                    User.moderation_status == "suspended",
                    or_(
                        User.moderation_expires_at.is_(None),
                        User.moderation_expires_at > current_time,
                    ),
                ),
            ),
        )
    )
    return set(result.scalars().all())


async def account_restricted_user_ids(
    session: AsyncSession, user_ids: Sequence[int], *, now=None
) -> set[int]:
    """Return user IDs under an effective full-account suspension or ban."""
    unique_ids = tuple(dict.fromkeys(int(user_id) for user_id in user_ids))
    if not unique_ids:
        return set()
    current_time = now or utcnow()
    result = await session.execute(
        select(User.id).where(
            User.id.in_(unique_ids),
            or_(
                User.moderation_status == "banned",
                and_(
                    User.moderation_status == "suspended",
                    or_(
                        User.moderation_expires_at.is_(None),
                        User.moderation_expires_at > current_time,
                    ),
                ),
            ),
        )
    )
    return set(result.scalars().all())


async def enforce_ugc_creation(session: AsyncSession, player_id: int) -> None:
    """Prevent a restricted player from using public UGC to bypass a social lock."""
    await enforce_action(
        session,
        player_id,
        player_id,
        InteractionAction.USER_GENERATED_CONTENT,
    )


async def enforce_user_ugc_creation(session: AsyncSession, user_id: int) -> None:
    """Apply the UGC restriction for an authenticated user when a player exists."""
    player_id = (
        await session.execute(
            select(Player.id).where(
                Player.user_id == user_id,
                Player.is_placeholder == False,  # noqa: E712
            )
        )
    ).scalar_one_or_none()
    if player_id is not None:
        await enforce_ugc_creation(session, player_id)


async def create_block(session: AsyncSession, blocker_id: int, blocked_id: int) -> dict[str, Any]:
    """Create a directed block and atomically sever pair-specific state."""
    if blocker_id == blocked_id:
        raise ValueError("You cannot block yourself")
    exists_result = await session.execute(
        select(Player.id).where(Player.id == blocked_id, Player.deleted_at.is_(None))
    )
    if exists_result.scalar_one_or_none() is None:
        raise ValueError("Player not found")

    statement = (
        insert(UserBlock)
        .values(blocker_player_id=blocker_id, blocked_player_id=blocked_id)
        .on_conflict_do_nothing(constraint="uq_user_blocks_pair")
        .returning(UserBlock.id)
    )
    inserted_id = (await session.execute(statement)).scalar_one_or_none()

    low, high = sorted((blocker_id, blocked_id))
    await session.execute(
        delete(Friend).where(Friend.player1_id == low, Friend.player2_id == high)
    )
    pair = or_(
        and_(
            FriendRequest.sender_player_id == blocker_id,
            FriendRequest.receiver_player_id == blocked_id,
        ),
        and_(
            FriendRequest.sender_player_id == blocked_id,
            FriendRequest.receiver_player_id == blocker_id,
        ),
    )
    await session.execute(
        update(FriendRequest)
        .where(pair, FriendRequest.status == "pending")
        .values(status="cancelled", responded_at=utcnow())
    )
    await session.execute(
        update(LeagueInvite)
        .where(
            LeagueInvite.status == "pending",
            or_(
                and_(
                    LeagueInvite.invited_by_player_id == blocker_id,
                    LeagueInvite.player_id == blocked_id,
                ),
                and_(
                    LeagueInvite.invited_by_player_id == blocked_id,
                    LeagueInvite.player_id == blocker_id,
                ),
            ),
        )
        .values(status="declined")
    )
    await session.execute(
        delete(SessionParticipant).where(
            or_(
                and_(
                    SessionParticipant.invited_by == blocker_id,
                    SessionParticipant.player_id == blocked_id,
                ),
                and_(
                    SessionParticipant.invited_by == blocked_id,
                    SessionParticipant.player_id == blocker_id,
                ),
            )
        )
    )

    user_rows = await session.execute(
        select(Player.id, Player.user_id).where(Player.id.in_([blocker_id, blocked_id]))
    )
    user_ids = {row.id: row.user_id for row in user_rows.all() if row.user_id is not None}
    for owner_player_id, actor_player_id in (
        (blocker_id, blocked_id),
        (blocked_id, blocker_id),
    ):
        owner_user_id = user_ids.get(owner_player_id)
        if owner_user_id is not None:
            await session.execute(
                update(Notification)
                .where(
                    Notification.user_id == owner_user_id,
                    Notification.actor_player_id == actor_player_id,
                    Notification.dismissed_at.is_(None),
                )
                .values(dismissed_at=utcnow())
            )
    await session.flush()
    return {"player_id": blocked_id, "created": inserted_id is not None}


async def remove_block(session: AsyncSession, blocker_id: int, blocked_id: int) -> bool:
    result = await session.execute(
        delete(UserBlock)
        .where(
            UserBlock.blocker_player_id == blocker_id, UserBlock.blocked_player_id == blocked_id
        )
        .returning(UserBlock.id)
    )
    await session.flush()
    return result.scalar_one_or_none() is not None


async def broadcast_private_data_invalidation(
    session: AsyncSession, player_ids: Iterable[int]
) -> None:
    """Quietly invalidate both sides after block/unblock; never reveal why."""
    rows = await session.execute(
        select(Player.user_id).where(
            Player.id.in_(tuple(set(player_ids))), Player.user_id.is_not(None)
        )
    )
    try:
        from backend.services.websocket_manager import get_websocket_manager

        manager = get_websocket_manager()
        event = {
            "type": "private_data_invalidated",
            "roots": ["social", "messages", "moderation", "notifications"],
        }
        for user_id in rows.scalars().all():
            await manager.send_to_user(user_id, event)
    except Exception:  # cache invalidation must never undo a committed safety action
        logger.warning("Private-data invalidation broadcast failed", exc_info=True)


async def list_blocks(session: AsyncSession, blocker_id: int) -> list[dict[str, Any]]:
    result = await session.execute(
        select(
            UserBlock.blocked_player_id,
            Player.full_name,
            Player.profile_picture_url,
            UserBlock.created_at,
        )
        .join(Player, Player.id == UserBlock.blocked_player_id)
        .where(
            UserBlock.blocker_player_id == blocker_id,
            Player.deleted_at.is_(None),
        )
        .order_by(UserBlock.created_at.desc())
    )
    return [
        {
            "player_id": row.blocked_player_id,
            "full_name": row.full_name,
            "avatar": row.profile_picture_url,
            "blocked_at": row.created_at,
        }
        for row in result.all()
    ]


def bilateral_blocked_player_ids(viewer_id: int) -> Select:
    """Canonical SQL subquery for bilateral block exclusions."""
    return (
        select(UserBlock.blocked_player_id.label("player_id"))
        .where(UserBlock.blocker_player_id == viewer_id)
        .union(
            select(UserBlock.blocker_player_id.label("player_id")).where(
                UserBlock.blocked_player_id == viewer_id
            )
        )
    )


async def blocked_player_ids(session: AsyncSession, viewer_id: int) -> set[int]:
    result = await session.execute(bilateral_blocked_player_ids(viewer_id))
    return set(result.scalars().all())


async def blocked_by_viewer_player_ids(session: AsyncSession, viewer_id: int) -> set[int]:
    """Return only blocks initiated by the viewer (for private collapse UI)."""
    result = await session.execute(
        select(UserBlock.blocked_player_id).where(UserBlock.blocker_player_id == viewer_id)
    )
    return set(result.scalars().all())


async def delete_blocks_for_player(session: AsyncSession, player_id: int) -> None:
    """Remove private block state when either identity is permanently deleted."""
    await session.execute(
        delete(UserBlock).where(
            or_(
                UserBlock.blocker_player_id == player_id,
                UserBlock.blocked_player_id == player_id,
            )
        )
    )


def exclude_blocked_players(query, viewer_id: int, player_column):
    """Apply the canonical two-way block exclusion to a player select."""
    return query.where(player_column.not_in(bilateral_blocked_player_ids(viewer_id)))


def exclude_blocked_notification_actors(query, viewer_id: int):
    """Keep system notifications while excluding blocked player actors."""
    return query.where(
        or_(
            Notification.actor_player_id.is_(None),
            Notification.actor_player_id.not_in(bilateral_blocked_player_ids(viewer_id)),
        )
    )
