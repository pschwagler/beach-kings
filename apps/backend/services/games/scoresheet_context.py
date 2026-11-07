"""Bounded player context for scoresheets, based on the uploader's real sessions."""

from datetime import date, timedelta

from sqlalchemy import case, func, or_, select, union
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.models import Match, Player, Session, SessionParticipant
from backend.services import data_service

HISTORY_LIMIT = 100
PLAYER_FIELDS = (
    Match.team1_player1_id,
    Match.team1_player2_id,
    Match.team2_player1_id,
    Match.team2_player2_id,
)


def _session_day():
    """Sortable session dates across legacy US and ISO formats; never cast user data."""
    value = Session.date
    return case(
        (value.op("~")(r"^\d{4}-\d{2}-\d{2}$"), value),
        (
            value.op("~")(r"^\d{1,2}/\d{1,2}/\d{4}$"),
            func.concat(
                func.split_part(value, "/", 3),
                "-",
                func.lpad(func.split_part(value, "/", 1), 2, "0"),
                "-",
                func.lpad(func.split_part(value, "/", 2), 2, "0"),
            ),
        ),
        else_=func.to_char(Session.created_at, "YYYY-MM-DD"),
    )


def history_statement(player_id: int, today: date):
    # Match appearances are essential: older league sessions often have no
    # SessionParticipant rows. UNION counts a person once per session, even if
    # they played several games or also have an explicit participant row.
    my_sessions = union(
        select(SessionParticipant.session_id).where(SessionParticipant.player_id == player_id),
        select(Match.session_id).where(or_(*(field == player_id for field in PLAYER_FIELDS))),
    ).cte("uploader_sessions")
    session_ids = select(my_sessions.c.session_id)
    appearances = union(
        select(SessionParticipant.session_id, SessionParticipant.player_id).where(
            SessionParticipant.session_id.in_(session_ids)
        ),
        *(
            select(Match.session_id, field.label("player_id")).where(
                Match.session_id.in_(session_ids)
            )
            for field in PLAYER_FIELDS
        ),
    ).cte("shared_session_players")
    day = _session_day()
    weight = case(
        (day >= (today - timedelta(days=30)).isoformat(), 8),
        (day >= (today - timedelta(days=90)).isoformat(), 4),
        (day >= (today - timedelta(days=365)).isoformat(), 1),
        else_=0.25,
    )
    return (
        select(
            Player.id.label("player_id"),
            Player.full_name.label("player_name"),
            Player.nickname.label("player_nickname"),
            func.count().label("shared_sessions"),
            func.max(day).label("last_shared_session"),
        )
        .join(appearances, appearances.c.player_id == Player.id)
        .join(Session, Session.id == appearances.c.session_id)
        .where(Player.id != player_id, Player.deleted_at.is_(None), day <= today.isoformat())
        .group_by(Player.id, Player.full_name, Player.nickname)
        .order_by(
            func.sum(weight).desc(),
            func.max(day).desc(),
            func.count().desc(),
            func.lower(Player.full_name),
            Player.id,
        )
        .limit(HISTORY_LIMIT)
    )


def merge_candidates(uploader: dict, history: list[dict], league_members: list[dict] | None):
    """100 history candidates plus the uploader and every selected league member."""
    members = {item["player_id"]: item for item in league_members or []}
    candidates = {}
    for item in history[:HISTORY_LIMIT]:
        candidates[item["player_id"]] = {**item, "is_uploader": False}
    candidates[uploader["id"]] = {
        **candidates.get(uploader["id"], {}),
        "player_id": uploader["id"],
        "player_name": uploader["full_name"],
        "player_nickname": uploader.get("nickname"),
        "is_uploader": True,
    }
    for player_id, member in members.items():
        candidates[player_id] = {**member, **candidates.get(player_id, {})}
    if league_members is not None:
        candidates = {
            player_id: {**item, "is_league_member": player_id in members}
            for player_id, item in candidates.items()
        }
    # Uploader first, then league members (history order retained), then others.
    return sorted(
        candidates.values(),
        key=lambda item: (
            not item.get("is_uploader", False),
            not item.get("is_league_member", False),
        ),
    )


async def context_members(session: AsyncSession, user: dict, league_id: int | None):
    uploader = await data_service.get_player_by_user_id(session, user["id"])
    if not uploader:
        return []
    history = [
        dict(row)
        for row in (
            await session.execute(history_statement(uploader["id"], date.today()))
        ).mappings()
    ]
    members = None
    if league_id is not None:
        # Do not truncate the league roster when it exceeds the history cap.
        members = await data_service.list_league_members(session, league_id)
    return merge_candidates(uploader, history, members)


async def draft_context(session, draft_id, draft, user, league_id):
    """Corrections use the same candidate IDs and metadata as the original read."""
    if "player_context" in draft:
        return draft["player_context"]
    # Older drafts did not retain context. Reconstruct for the original uploader,
    # even when a different league member submits the correction.
    from backend.services import photo_match_service

    members = await context_members(session, {"id": draft.get("user_id") or user["id"]}, league_id)
    await photo_match_service.update_session_data(draft_id, {"player_context": members})
    return members
