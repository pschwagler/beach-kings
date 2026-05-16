"""
Player profile, search, and home-court CRUD operations.

Extracted from data_service.py.  Covers:
- Player search with multi-dimensional filters
- Player profile read / upsert
- Home-court management per player
"""

from typing import List, Dict, Optional, Set, Tuple
from datetime import date, datetime, timedelta, timezone

__all__ = [
    "resolve_name_fields",
    "generate_player_initials",
    "list_players_search",
    "search_players_with_relevance",
    "get_all_player_names",
    "get_player_by_user_id",
    "get_player_by_user_id_with_stats",
    "upsert_user_player",
    "get_or_create_player",
    "get_player_by_id",
    "get_player_home_courts",
    "add_player_home_court",
    "remove_player_home_court",
    "set_player_home_courts",
    "reorder_player_home_courts",
]

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete, func, or_, and_

from backend.database.models import (
    Player,
    Location,
    LeagueMember,
    PlayerHomeCourt,
    PlayerGlobalStats,
    Court,
    Friend,
    Match,
    Session,
    SessionParticipant,
)


# ---------------------------------------------------------------------------
# Name resolution helper
# ---------------------------------------------------------------------------


def resolve_name_fields(
    *,
    first_name: Optional[str] = None,
    last_name: Optional[str] = None,
    full_name: Optional[str] = None,
) -> Optional[Dict[str, str]]:
    """
    Resolve first_name, last_name, and full_name from whichever subset is provided.

    Accepts first+last (preferred), full_name only (legacy), or a mix.
    When first+last are provided they take precedence over full_name.

    Returns:
        Dict with keys ``first_name``, ``last_name``, ``full_name``,
        or ``None`` if no name information was provided at all.
    """
    has_first = first_name is not None and first_name.strip() != ""
    has_last = last_name is not None and last_name.strip() != ""

    if has_first or has_last:
        fn = (first_name or "").strip()
        ln = (last_name or "").strip()
        computed_full = f"{fn} {ln}".strip()
        return {
            "first_name": fn,
            "last_name": ln,
            "full_name": computed_full,
        }

    if full_name is not None and full_name.strip() != "":
        stripped = " ".join(full_name.split())
        parts = stripped.split(" ", 1)
        return {
            "first_name": parts[0],
            "last_name": parts[1] if len(parts) > 1 else "",
            "full_name": stripped,
        }

    return None


# ---------------------------------------------------------------------------
# Initials helper (also re-used by league_data / stats_data)
# ---------------------------------------------------------------------------


def generate_player_initials(name: str) -> str:
    """
    Generate initials from a player name.

    Returns the first letter of the first name plus the first letter of the
    last name.  If only one word is present, returns the first two letters
    of that word.  Returns an empty string for blank input.

    Args:
        name: Full player name string.

    Returns:
        Upper-cased initials (1–2 characters) or empty string.
    """
    if not name or not name.strip():
        return ""

    name_parts = name.strip().split()

    if len(name_parts) == 0:
        return ""
    elif len(name_parts) == 1:
        single_name = name_parts[0]
        if len(single_name) >= 2:
            return single_name[0:2].upper()
        return single_name[0].upper()

    return (name_parts[0][0] + name_parts[-1][0]).upper()


# ---------------------------------------------------------------------------
# Filter helpers used by list_players_search
# ---------------------------------------------------------------------------


def _normalize_list_str(lst: Optional[List[str]]) -> List[str]:
    """Return non-empty, stripped, lower-cased strings from a list."""
    if not lst:
        return []
    return [s.strip().lower() for s in lst if s is not None and str(s).strip()]


def _filter_placeholders(stmt, include_placeholders: bool):
    """Exclude placeholder players unless ``include_placeholders`` is True."""
    if include_placeholders:
        return stmt
    return stmt.where(Player.is_placeholder.is_(False))


def _filter_search(stmt, q: Optional[str]):
    """Apply full-name / nickname ILIKE filter."""
    if q and q.strip():
        term = f"%{q.strip()}%"
        stmt = stmt.where(or_(Player.full_name.ilike(term), Player.nickname.ilike(term)))
    return stmt


def _filter_location(stmt, location_ids: Optional[List[str]]):
    """Filter by location_id IN list."""
    loc_ids = [x for x in (location_ids or []) if x is not None and str(x).strip()]
    if loc_ids:
        stmt = stmt.where(Player.location_id.in_(loc_ids))
    return stmt


def _filter_league_membership(stmt, league_ids: Optional[List[int]]):
    """Filter to players who are members of any of the given leagues."""
    if league_ids:
        clean = [x for x in league_ids if x is not None]
        if clean:
            stmt = stmt.where(
                Player.id.in_(
                    select(LeagueMember.player_id)
                    .where(LeagueMember.league_id.in_(clean))
                    .distinct()
                )
            )
    return stmt


def _filter_demographics(stmt, genders: Optional[List[str]], levels: Optional[List[str]]):
    """Filter by gender and/or skill level."""
    gender_vals = _normalize_list_str(genders)
    if gender_vals:
        stmt = stmt.where(func.lower(Player.gender).in_(gender_vals))
    level_vals = _normalize_list_str(levels)
    if level_vals:
        stmt = stmt.where(func.lower(Player.level).in_(level_vals))
    return stmt


# ---------------------------------------------------------------------------
# Player search
# ---------------------------------------------------------------------------


async def list_players_search(
    session: AsyncSession,
    q: Optional[str] = None,
    location_ids: Optional[List[str]] = None,
    league_ids: Optional[List[int]] = None,
    genders: Optional[List[str]] = None,
    levels: Optional[List[str]] = None,
    limit: int = 50,
    offset: int = 0,
    include_placeholders: bool = False,
    session_id: Optional[int] = None,
) -> Tuple[List[Dict], int]:
    """
    Search players with optional multi-dimensional filters.

    Filter lists are OR within each dimension (multiple locations → player
    in any of them).  System records (``status='system'``) are always
    excluded.  Placeholder players are excluded by default unless
    ``include_placeholders`` is True.

    Args:
        session: Async database session.
        q: Full-text search term (matched against full_name and nickname).
        location_ids: Optional list of location ID strings to filter by.
        league_ids: Optional list of league IDs; restricts to members of any.
        genders: Optional list of gender values (case-insensitive).
        levels: Optional list of level values (case-insensitive).
        limit: Page size (capped at 500).
        offset: Page start offset.
        include_placeholders: When True, placeholder players are included.
        session_id: Unused; reserved for future session-context filtering.

    Returns:
        Tuple of (items list, total count).  Each item dict contains:
        ``id``, ``full_name``, ``nickname``, ``name``, ``gender``,
        ``level``, ``user_id``, ``location_id``, ``location_name``,
        ``is_placeholder``.
    """

    def _apply_common_filters(stmt, *, for_count: bool = False):
        stmt = stmt.where(or_(Player.status != "system", Player.status.is_(None)))
        stmt = _filter_placeholders(stmt, include_placeholders)
        stmt = _filter_search(stmt, q)
        stmt = _filter_location(stmt, location_ids)
        stmt = _filter_league_membership(stmt, league_ids)
        stmt = _filter_demographics(stmt, genders, levels)
        return stmt

    # Count
    count_stmt = select(func.count(Player.id)).select_from(Player)
    count_stmt = _apply_common_filters(count_stmt, for_count=True)
    total_result = await session.execute(count_stmt)
    total = total_result.scalar() or 0

    # Page
    page_stmt = select(Player, Location.name.label("location_name")).outerjoin(
        Location, Location.id == Player.location_id
    )
    page_stmt = _apply_common_filters(page_stmt)
    page_stmt = (
        page_stmt.order_by(
            func.coalesce(Player.nickname, Player.full_name).asc().nullslast(), Player.id.asc()
        )
        .limit(min(limit, 500))
        .offset(offset)
    )
    page_result = await session.execute(page_stmt)
    rows = page_result.all()

    items = []
    for player, location_name in rows:
        name = player.full_name if player.full_name else f"Player {player.id}"
        items.append(
            {
                "id": player.id,
                "full_name": player.full_name,
                "nickname": player.nickname,
                "name": name,
                "gender": player.gender,
                "level": player.level,
                "user_id": player.user_id,
                "location_id": player.location_id,
                "location_name": location_name,
                "is_placeholder": player.is_placeholder,
            }
        )
    return items, total


# ---------------------------------------------------------------------------
# Relevance-ranked player search (for player pickers)
# ---------------------------------------------------------------------------


_RELATION_SCORES = {
    "friend": 6,
    "friend_of_friend": 5,
    "recent_opponent": 4,
    "session": 3,
    "league": 2,
    "other": 1,
}

# In a league match the most relevant pick is "someone in this league" — those
# members outrank even direct friends, since the roster is league-scoped.
_LEAGUE_MATCH_RELATION_SCORES = {
    "league": 7,
    "friend": 6,
    "friend_of_friend": 5,
    "recent_opponent": 4,
    "session": 3,
    "other": 1,
}


def _relation_scores(league_id: Optional[int]) -> Dict[str, int]:
    """
    Pick the bucket-score map for the relevance sort.

    When a ``league_id`` context is present (a league match), league members
    are ranked first; otherwise the default friend-first ordering applies.
    """
    return (
        _LEAGUE_MATCH_RELATION_SCORES if league_id is not None else _RELATION_SCORES
    )


async def _collect_relation_buckets(
    session: AsyncSession,
    *,
    caller_player_id: Optional[int],
    session_id: Optional[int],
    league_id: Optional[int],
    recent_days: int,
    restrict_to: Optional[Set[int]] = None,
) -> Dict[str, Set[int]]:
    """
    Build the friend / FoF / recent-opponent / session / league bucket sets.

    When ``restrict_to`` is provided, returned sets are intersected with it
    (useful for filtering an over-fetched name-search candidate list).
    Otherwise the bucket sets are returned unconstrained — that's the right
    shape for the "no search query" default-roster path.
    """
    friend_ids: Set[int] = set()
    fof_ids: Set[int] = set()
    recent_opponent_ids: Set[int] = set()
    session_member_ids: Set[int] = set()
    league_member_ids: Set[int] = set()

    if caller_player_id is not None:
        friend_rows = (
            await session.execute(
                select(Friend.player1_id, Friend.player2_id).where(
                    or_(
                        Friend.player1_id == caller_player_id,
                        Friend.player2_id == caller_player_id,
                    ),
                )
            )
        ).all()
        all_friends: Set[int] = set()
        for p1, p2 in friend_rows:
            all_friends.add(p2 if p1 == caller_player_id else p1)
        friend_ids = set(all_friends)

        if all_friends:
            fof_rows = (
                await session.execute(
                    select(Friend.player1_id, Friend.player2_id).where(
                        or_(
                            Friend.player1_id.in_(all_friends),
                            Friend.player2_id.in_(all_friends),
                        ),
                    )
                )
            ).all()
            for p1, p2 in fof_rows:
                if p1 in all_friends:
                    fof_ids.add(p2)
                if p2 in all_friends:
                    fof_ids.add(p1)
            fof_ids -= friend_ids
            fof_ids.discard(caller_player_id)

        cutoff = datetime.now(timezone.utc) - timedelta(days=recent_days)
        opp_rows = (
            await session.execute(
                select(
                    Match.team1_player1_id,
                    Match.team1_player2_id,
                    Match.team2_player1_id,
                    Match.team2_player2_id,
                )
                .join(Session, Session.id == Match.session_id)
                .where(
                    Session.created_at >= cutoff,
                    or_(
                        Match.team1_player1_id == caller_player_id,
                        Match.team1_player2_id == caller_player_id,
                        Match.team2_player1_id == caller_player_id,
                        Match.team2_player2_id == caller_player_id,
                    ),
                )
            )
        ).all()
        for row in opp_rows:
            for pid in row:
                if pid is not None and pid != caller_player_id:
                    recent_opponent_ids.add(pid)

    if session_id is not None:
        sp_rows = (
            await session.execute(
                select(SessionParticipant.player_id).where(
                    SessionParticipant.session_id == session_id,
                )
            )
        ).all()
        session_member_ids = {row[0] for row in sp_rows if row[0] is not None}

    if league_id is not None:
        lm_rows = (
            await session.execute(
                select(LeagueMember.player_id).where(
                    LeagueMember.league_id == league_id,
                )
            )
        ).all()
        league_member_ids = {row[0] for row in lm_rows if row[0] is not None}

    if restrict_to is not None:
        friend_ids &= restrict_to
        fof_ids &= restrict_to
        recent_opponent_ids &= restrict_to
        session_member_ids &= restrict_to
        league_member_ids &= restrict_to

    return {
        "friend": friend_ids,
        "friend_of_friend": fof_ids,
        "recent_opponent": recent_opponent_ids,
        "session": session_member_ids,
        "league": league_member_ids,
    }


def _make_relation_classifier(buckets: Dict[str, Set[int]]):
    """Return a function mapping a player id to its highest-priority bucket."""

    def _relation(pid: int) -> str:
        if pid in buckets["friend"]:
            return "friend"
        if pid in buckets["friend_of_friend"]:
            return "friend_of_friend"
        if pid in buckets["recent_opponent"]:
            return "recent_opponent"
        if pid in buckets["session"]:
            return "session"
        if pid in buckets["league"]:
            return "league"
        return "other"

    return _relation


async def _default_ranked_roster(
    session: AsyncSession,
    *,
    caller_player_id: Optional[int],
    session_id: Optional[int],
    league_id: Optional[int],
    limit: int,
    recent_days: int,
) -> List[Dict]:
    """
    Return the caller's relevance-ranked roster when no search query was
    provided. Includes only players from the caller's network (friends,
    FoF, recent opponents, session/league members) — never the "other"
    bucket, since there's no name match to surface them.
    """
    buckets = await _collect_relation_buckets(
        session,
        caller_player_id=caller_player_id,
        session_id=session_id,
        league_id=league_id,
        recent_days=recent_days,
    )

    candidate_ids: Set[int] = (
        buckets["friend"]
        | buckets["friend_of_friend"]
        | buckets["recent_opponent"]
        | buckets["session"]
        | buckets["league"]
    )
    if caller_player_id is not None:
        candidate_ids.discard(caller_player_id)

    if not candidate_ids:
        return []

    rows = (
        await session.execute(
            select(Player.id, Player.full_name, Player.nickname).where(
                Player.id.in_(candidate_ids),
                or_(Player.status != "system", Player.status.is_(None)),
                Player.is_placeholder.is_(False),
            )
        )
    ).all()

    classify = _make_relation_classifier(buckets)
    scores = _relation_scores(league_id)
    annotated = [(row, classify(row.id)) for row in rows]
    annotated.sort(
        key=lambda t: (
            -scores[t[1]],
            (t[0].full_name or "").lower(),
            t[0].id,
        )
    )
    annotated = annotated[: max(1, min(limit, 50))]

    return [
        {
            "id": row.id,
            "full_name": row.full_name,
            "nickname": row.nickname,
            "initials": generate_player_initials(row.full_name or ""),
            "relation": relation,
        }
        for row, relation in annotated
    ]


async def search_players_with_relevance(
    session: AsyncSession,
    q: str,
    *,
    caller_player_id: Optional[int],
    session_id: Optional[int] = None,
    league_id: Optional[int] = None,
    limit: int = 20,
    recent_days: int = 90,
) -> List[Dict]:
    """
    Search players by name, ranked by relevance to the caller.

    Buckets (highest priority first):
        friend > friend_of_friend > recent_opponent > session > league > other

    In a league match (``league_id`` set), league members are promoted to the
    top: league > friend > friend_of_friend > recent_opponent > session > other.

    When ``q`` is empty or whitespace, returns the caller's default ranked
    roster — friends, FoF, recent opponents, and session/league members —
    excluding the ``other`` bucket (no name match to surface them).

    Otherwise the query over-fetches alphabetical name matches, then
    annotates and re-ranks them in Python so all buckets are considered
    without writing multi-CTE SQL. Placeholder and system players are
    excluded throughout.

    Args:
        session: Async DB session.
        q: Search term (matched ILIKE against full_name and nickname). Empty
            string returns the caller's default ranked roster.
        caller_player_id: Caller's player id; ``None`` skips friend/opponent
            scoring (everyone falls into ``other``).
        session_id: Optional session context; members get bucket ``session``.
        league_id: Optional league context; members get bucket ``league``.
        limit: Max items to return (capped at 50).
        recent_days: Window (days) for the ``recent_opponent`` bucket.

    Returns:
        List of dicts with ``id``, ``full_name``, ``nickname``, ``initials``,
        and ``relation``.
    """
    term = (q or "").strip()
    capped = max(1, min(limit, 50))

    if not term:
        return await _default_ranked_roster(
            session,
            caller_player_id=caller_player_id,
            session_id=session_id,
            league_id=league_id,
            limit=capped,
            recent_days=recent_days,
        )

    over_fetch = min(capped * 5, 200)
    like = f"%{term}%"

    name_stmt = (
        select(Player.id, Player.full_name, Player.nickname)
        .where(
            or_(Player.full_name.ilike(like), Player.nickname.ilike(like)),
            or_(Player.status != "system", Player.status.is_(None)),
            Player.is_placeholder.is_(False),
        )
        .order_by(Player.full_name.asc(), Player.id.asc())
        .limit(over_fetch)
    )
    if caller_player_id is not None:
        name_stmt = name_stmt.where(Player.id != caller_player_id)

    rows = (await session.execute(name_stmt)).all()
    if not rows:
        return []

    candidate_set: Set[int] = {r.id for r in rows}

    buckets = await _collect_relation_buckets(
        session,
        caller_player_id=caller_player_id,
        session_id=session_id,
        league_id=league_id,
        recent_days=recent_days,
        restrict_to=candidate_set,
    )

    classify = _make_relation_classifier(buckets)
    scores = _relation_scores(league_id)
    annotated = [(row, classify(row.id)) for row in rows]
    annotated.sort(
        key=lambda t: (
            -scores[t[1]],
            (t[0].full_name or "").lower(),
            t[0].id,
        )
    )
    annotated = annotated[:capped]

    return [
        {
            "id": row.id,
            "full_name": row.full_name,
            "nickname": row.nickname,
            "initials": generate_player_initials(row.full_name or ""),
            "relation": relation,
        }
        for row, relation in annotated
    ]


async def get_all_player_names(session: AsyncSession) -> List[str]:
    """
    Return all player full names sorted alphabetically.

    Args:
        session: Async database session.

    Returns:
        Sorted list of full name strings.
    """
    result = await session.execute(select(Player.full_name).order_by(Player.full_name.asc()))
    return [row[0] for row in result.all()]


# ---------------------------------------------------------------------------
# Player profile read / upsert
# ---------------------------------------------------------------------------


async def get_player_by_user_id(session: AsyncSession, user_id: int) -> Optional[Dict]:
    """
    Get a player profile by user ID.

    Args:
        session: Async database session.
        user_id: User ID to look up.

    Returns:
        Player dict or None if not found.  Keys include all profile fields
        plus ``created_at`` / ``updated_at`` as ISO strings.
    """
    result = await session.execute(select(Player).where(Player.user_id == user_id))
    player = result.scalar_one_or_none()
    if not player:
        return None
    return {
        "id": player.id,
        "full_name": player.full_name,
        "user_id": player.user_id,
        "nickname": player.nickname,
        "gender": player.gender,
        "level": player.level,
        "date_of_birth": player.date_of_birth.isoformat() if player.date_of_birth else None,
        "height": player.height,
        "preferred_side": player.preferred_side,
        "location_id": player.location_id,
        "city": player.city,
        "state": player.state,
        "city_latitude": player.city_latitude,
        "city_longitude": player.city_longitude,
        "distance_to_location": player.distance_to_location,
        "avatar": player.avatar,
        "profile_picture_url": player.profile_picture_url,
        "avp_playerProfileId": player.avp_playerProfileId,
        "status": player.status,
        "created_at": player.created_at.isoformat() if player.created_at else None,
        "updated_at": player.updated_at.isoformat() if player.updated_at else None,
    }


async def get_player_by_user_id_with_stats(session: AsyncSession, user_id: int) -> Optional[Dict]:
    """
    Get a player profile with global stats and location slug by user ID.

    Args:
        session: Async database session.
        user_id: User ID to look up.

    Returns:
        Player dict including a nested ``stats`` dict, or None if not found.
    """
    result = await session.execute(
        select(Player, PlayerGlobalStats, Location.slug.label("location_slug"))
        .outerjoin(PlayerGlobalStats, Player.id == PlayerGlobalStats.player_id)
        .outerjoin(Location, Player.location_id == Location.id)
        .where(Player.user_id == user_id)
    )
    row = result.first()

    if not row:
        return None

    player, global_stats, location_slug = row

    return {
        "id": player.id,
        "full_name": player.full_name,
        "first_name": player.first_name,
        "last_name": player.last_name,
        "gender": player.gender,
        "level": player.level,
        "nickname": player.nickname,
        "date_of_birth": player.date_of_birth.isoformat() if player.date_of_birth else None,
        "height": player.height,
        "preferred_side": player.preferred_side,
        "location_id": player.location_id,
        "location_slug": location_slug,
        "city": player.city,
        "state": player.state,
        "city_latitude": player.city_latitude,
        "city_longitude": player.city_longitude,
        "distance_to_location": player.distance_to_location,
        "avatar": player.avatar,
        "profile_picture_url": player.profile_picture_url,
        "stats": {
            "current_rating": global_stats.current_rating if global_stats else 1200.0,
            "total_games": global_stats.total_games if global_stats else 0,
            "total_wins": global_stats.total_wins if global_stats else 0,
        },
    }


async def upsert_user_player(
    session: AsyncSession,
    user_id: int,
    full_name: Optional[str] = None,
    first_name: Optional[str] = None,
    last_name: Optional[str] = None,
    nickname: Optional[str] = None,
    gender: Optional[str] = None,
    level: Optional[str] = None,
    date_of_birth: Optional[str] = None,
    height: Optional[str] = None,
    preferred_side: Optional[str] = None,
    location_id: Optional[str] = None,
    city: Optional[str] = None,
    state: Optional[str] = None,
    city_latitude: Optional[float] = None,
    city_longitude: Optional[float] = None,
    distance_to_location: Optional[float] = None,
) -> Optional[Dict]:
    """
    Create or update the player profile linked to a user.

    Creates a new ``Player`` row when none exists for ``user_id``;
    updates the existing row otherwise.  Only non-None keyword arguments
    are applied during an update.

    Name resolution: if ``first_name``/``last_name`` are provided they
    take precedence; otherwise ``full_name`` is split on the first space.

    Args:
        session: Async database session.
        user_id: User ID to associate the player with.
        full_name: Full display name (legacy — prefer first/last).
        first_name: First (given) name.
        last_name: Last (family) name.
        nickname: Optional short display name.
        gender: Gender string (optional).
        level: Skill level string (optional).
        date_of_birth: ISO date string ``YYYY-MM-DD`` (optional).
        height: Height string (optional).
        preferred_side: Preferred court side (optional).
        location_id: Location ID (optional).
        city: City name (optional).
        state: State name or abbreviation (optional).
        city_latitude: City latitude coordinate (optional).
        city_longitude: City longitude coordinate (optional).
        distance_to_location: Distance to default location in miles (optional).

    Returns:
        Player dict, or None if creation was attempted without a name.
    """
    # Resolve first/last/full name fields
    name_fields = resolve_name_fields(
        first_name=first_name, last_name=last_name, full_name=full_name
    )

    # Parse date_of_birth if provided
    date_of_birth_obj = None
    if date_of_birth:
        try:
            date_of_birth_obj = date.fromisoformat(date_of_birth)
        except ValueError:
            pass

    result = await session.execute(select(Player).where(Player.user_id == user_id))
    player = result.scalar_one_or_none()

    if not player:
        if name_fields is None:
            return None
        player = Player(
            user_id=user_id,
            full_name=name_fields["full_name"],
            first_name=name_fields["first_name"],
            last_name=name_fields["last_name"],
            nickname=nickname,
            gender=gender,
            level=level,
            date_of_birth=date_of_birth_obj,
            height=height,
            preferred_side=preferred_side,
            location_id=location_id,
            city=city,
            state=state,
            city_latitude=city_latitude,
            city_longitude=city_longitude,
            distance_to_location=distance_to_location,
        )
        session.add(player)
        await session.commit()
        await session.refresh(player)
    else:
        update_values = {
            k: v
            for k, v in {
                "nickname": nickname,
                "gender": gender,
                "level": level,
                "date_of_birth": date_of_birth_obj,
                "height": height,
                "preferred_side": preferred_side,
                "location_id": location_id,
                "city": city,
                "state": state,
                "city_latitude": city_latitude,
                "city_longitude": city_longitude,
                "distance_to_location": distance_to_location,
            }.items()
            if v is not None
        }
        # Name fields are set as a group when any name input is provided
        if name_fields is not None:
            update_values["full_name"] = name_fields["full_name"]
            update_values["first_name"] = name_fields["first_name"]
            update_values["last_name"] = name_fields["last_name"]

        if update_values:
            await session.execute(
                update(Player).where(Player.user_id == user_id).values(**update_values)
            )
            await session.commit()
            await session.refresh(player)

    return {
        "id": player.id,
        "full_name": player.full_name,
        "first_name": player.first_name,
        "last_name": player.last_name,
        "user_id": player.user_id,
        "nickname": player.nickname,
        "gender": player.gender,
        "level": player.level,
        "date_of_birth": player.date_of_birth.isoformat() if player.date_of_birth else None,
        "height": player.height,
        "preferred_side": player.preferred_side,
        "location_id": player.location_id,
        "city": player.city,
        "state": player.state,
        "city_latitude": player.city_latitude,
        "city_longitude": player.city_longitude,
        "distance_to_location": player.distance_to_location,
        "profile_picture_url": player.profile_picture_url,
        "avp_playerProfileId": player.avp_playerProfileId,
        "status": player.status,
        "created_at": player.created_at.isoformat() if player.created_at else None,
        "updated_at": player.updated_at.isoformat() if player.updated_at else None,
    }


async def get_or_create_player(session: AsyncSession, name: str) -> int:
    """
    Get a player's ID by full name, or create a new player with that name.

    When duplicate names exist, the first match is returned.

    Args:
        session: Async database session.
        name: Player full name to look up or create.

    Returns:
        Player ID (integer).
    """
    result = await session.execute(select(Player.id).where(Player.full_name == name))
    player_id = result.scalars().first()

    if player_id:
        return player_id

    name_fields = resolve_name_fields(full_name=name)
    player = Player(
        full_name=name_fields["full_name"] if name_fields else name,
        first_name=name_fields["first_name"] if name_fields else "",
        last_name=name_fields["last_name"] if name_fields else "",
    )
    session.add(player)
    await session.commit()
    await session.refresh(player)
    return player.id


async def get_player_by_id(session: AsyncSession, player_id: int) -> Optional[Dict]:
    """
    Get basic player fields by player ID.

    Args:
        session: Async database session.
        player_id: Player ID.

    Returns:
        Dict with ``id``, ``full_name``, ``nickname``, ``is_placeholder``,
        ``created_by_player_id``, ``user_id``, or None if not found.
    """
    result = await session.execute(select(Player).where(Player.id == player_id))
    player = result.scalar_one_or_none()
    if not player:
        return None
    return {
        "id": player.id,
        "full_name": player.full_name,
        "first_name": player.first_name,
        "last_name": player.last_name,
        "nickname": player.nickname,
        "is_placeholder": player.is_placeholder,
        "created_by_player_id": player.created_by_player_id,
        "user_id": player.user_id,
    }


# ---------------------------------------------------------------------------
# Player home courts
# ---------------------------------------------------------------------------


async def get_player_home_courts(session: AsyncSession, player_id: int) -> List[Dict]:
    """
    Get all home courts for a player, ordered by position.

    Args:
        session: Async database session.
        player_id: Player ID.

    Returns:
        List of court dicts with ``id``, ``name``, ``address``, ``position``.
    """
    result = await session.execute(
        select(PlayerHomeCourt, Court)
        .join(Court, Court.id == PlayerHomeCourt.court_id)
        .where(PlayerHomeCourt.player_id == player_id)
        .order_by(PlayerHomeCourt.position.asc(), Court.name.asc())
    )
    rows = result.all()
    return [
        {"id": court.id, "name": court.name, "address": court.address, "position": phc.position}
        for phc, court in rows
    ]


async def add_player_home_court(session: AsyncSession, player_id: int, court_id: int) -> Dict:
    """
    Add a court as a home court for a player.

    The new court is appended after any existing home courts (position is
    automatically set to ``max_existing + 1``).

    Args:
        session: Async database session.
        player_id: Player ID.
        court_id: Court ID to add.

    Returns:
        Court dict with ``id``, ``name``, ``address``, ``position``.

    Raises:
        ValueError: If the court does not exist.
    """
    court_result = await session.execute(select(Court).where(Court.id == court_id))
    court = court_result.scalar_one_or_none()
    if not court:
        raise ValueError(f"Court {court_id} not found")

    max_pos_result = await session.execute(
        select(func.max(PlayerHomeCourt.position)).where(PlayerHomeCourt.player_id == player_id)
    )
    max_pos = max_pos_result.scalar() or -1
    position = max_pos + 1

    home_court = PlayerHomeCourt(player_id=player_id, court_id=court_id, position=position)
    session.add(home_court)
    await session.commit()
    return {"id": court.id, "name": court.name, "address": court.address, "position": position}


async def remove_player_home_court(session: AsyncSession, player_id: int, court_id: int) -> bool:
    """
    Remove a home court from a player.

    Args:
        session: Async database session.
        player_id: Player ID.
        court_id: Court ID to remove.

    Returns:
        True if a row was deleted, False if no row existed.
    """
    result = await session.execute(
        delete(PlayerHomeCourt).where(
            and_(PlayerHomeCourt.player_id == player_id, PlayerHomeCourt.court_id == court_id)
        )
    )
    await session.commit()
    return result.rowcount > 0


async def set_player_home_courts(
    session: AsyncSession, player_id: int, court_ids: List[int]
) -> List[Dict]:
    """
    Replace all home courts for a player with an ordered list of court IDs.

    Existing rows are deleted and rebuilt; position is derived from the
    array index.

    Args:
        session: Async database session.
        player_id: Player ID.
        court_ids: Ordered list of court IDs.

    Returns:
        New home-court list in the same shape as :func:`get_player_home_courts`.
    """
    await session.execute(delete(PlayerHomeCourt).where(PlayerHomeCourt.player_id == player_id))
    for position, court_id in enumerate(court_ids):
        session.add(PlayerHomeCourt(player_id=player_id, court_id=court_id, position=position))
    await session.commit()
    return await get_player_home_courts(session, player_id)


async def reorder_player_home_courts(
    session: AsyncSession, player_id: int, court_positions: List[Dict]
) -> List[Dict]:
    """
    Reorder home courts for a player by updating position values.

    Args:
        session: Async database session.
        player_id: Player ID.
        court_positions: List of ``{court_id, position}`` dicts.

    Returns:
        Updated home-court list in the same shape as
        :func:`get_player_home_courts`.
    """
    for item in court_positions:
        await session.execute(
            update(PlayerHomeCourt)
            .where(
                and_(
                    PlayerHomeCourt.player_id == player_id,
                    PlayerHomeCourt.court_id == item["court_id"],
                )
            )
            .values(position=item["position"])
        )
    await session.commit()
    return await get_player_home_courts(session, player_id)
