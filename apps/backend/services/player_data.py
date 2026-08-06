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
from sqlalchemy import select, update, delete, func, or_, and_, case

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
from backend.services.player_search_scoring import (
    RECENT_WINDOW_DAYS,
    PlayerSignalMetrics,
    ScoreContext,
    score_player,
    tags_for,
)
from backend.services import player_search_cache
from backend.services.player_search_cache import CallerNetworkSignals


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
#
# One bounded, deduped, score-ranked list — no pagination cursor. The pure
# scoring rules live in player_search_scoring; the cacheable caller-global
# signal collection is split from the live, per-request context lookups so:
#
#   * the expensive part (friends / fof / shared-league / recent_*) is
#     collected once per caller and cached (player_search_cache);
#   * session / league membership is recomputed live every call, so an
#     in-session / in-league player is *always* present and correctly
#     flagged even off a totally stale or empty cache — a structural
#     guarantee, not a tested-happy-path one;
#   * strangers (a name search's score-0 matches) are appended after the
#     network and explicitly exclude every candidate id, so no row can
#     ever appear twice.


# Full network is returned (the client scrolls it); this only guards
# pathological data, never normal use.
_NETWORK_HARD_CAP = 500
# Default cap on score-0 strangers appended to a name search.
_DEFAULT_STRANGER_LIMIT = 50

_NON_SYSTEM = or_(Player.status != "system", Player.status.is_(None))


def _resolved_names(row) -> Dict[str, str]:
    """First/last/full for a Player row, back-filling legacy rows from full_name."""
    resolved = resolve_name_fields(
        first_name=row.first_name,
        last_name=row.last_name,
        full_name=row.full_name,
    )
    if resolved is None:
        return {"first_name": "", "last_name": "", "full_name": ""}
    return resolved


async def _collect_caller_network(
    session: AsyncSession,
    *,
    caller_player_id: int,
    recent_days: int,
) -> Dict[int, CallerNetworkSignals]:
    """
    Build the caller-global signal map — the cacheable, expensive part.

    Excludes ``is_session`` / ``is_context_league`` by design: those are
    request-context and recomputed live by the caller. Counts (not booleans)
    are aggregated so future graded scoring needs no change here.
    """
    friend_ids: Set[int] = set()
    fof_ids: Set[int] = set()
    shared_league_ids: Set[int] = set()
    recent_partner: Dict[int, int] = {}
    recent_opp: Dict[int, int] = {}
    recent_session: Dict[int, int] = {}

    friend_rows = (
        await session.execute(
            select(Friend.player1_id, Friend.player2_id).where(
                or_(
                    Friend.player1_id == caller_player_id,
                    Friend.player2_id == caller_player_id,
                )
            )
        )
    ).all()
    for p1, p2 in friend_rows:
        friend_ids.add(p2 if p1 == caller_player_id else p1)

    if friend_ids:
        fof_rows = (
            await session.execute(
                select(Friend.player1_id, Friend.player2_id).where(
                    or_(
                        Friend.player1_id.in_(friend_ids),
                        Friend.player2_id.in_(friend_ids),
                    )
                )
            )
        ).all()
        for p1, p2 in fof_rows:
            if p1 in friend_ids:
                fof_ids.add(p2)
            if p2 in friend_ids:
                fof_ids.add(p1)
        fof_ids -= friend_ids
        fof_ids.discard(caller_player_id)

    cutoff = datetime.now(timezone.utc) - timedelta(days=recent_days)
    match_rows = (
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
    for t1p1, t1p2, t2p1, t2p2 in match_rows:
        team1 = [t1p1, t1p2]
        team2 = [t2p1, t2p2]
        partners, opponents = (team1, team2) if caller_player_id in team1 else (team2, team1)
        for pid in partners:
            if pid is not None and pid != caller_player_id:
                recent_partner[pid] = recent_partner.get(pid, 0) + 1
        for pid in opponents:
            if pid is not None and pid != caller_player_id:
                recent_opp[pid] = recent_opp.get(pid, 0) + 1

    my_recent = (
        await session.execute(
            select(SessionParticipant.session_id)
            .join(Session, Session.id == SessionParticipant.session_id)
            .where(
                SessionParticipant.player_id == caller_player_id,
                Session.created_at >= cutoff,
            )
        )
    ).all()
    recent_sids = {r[0] for r in my_recent}
    if recent_sids:
        co_rows = (
            await session.execute(
                select(SessionParticipant.player_id).where(
                    SessionParticipant.session_id.in_(recent_sids)
                )
            )
        ).all()
        for (pid,) in co_rows:
            if pid is not None and pid != caller_player_id:
                recent_session[pid] = recent_session.get(pid, 0) + 1

    my_leagues = (
        await session.execute(
            select(LeagueMember.league_id).where(LeagueMember.player_id == caller_player_id)
        )
    ).all()
    my_league_ids = {r[0] for r in my_leagues}
    if my_league_ids:
        co_league = (
            await session.execute(
                select(LeagueMember.player_id).where(LeagueMember.league_id.in_(my_league_ids))
            )
        ).all()
        for (pid,) in co_league:
            if pid is not None and pid != caller_player_id:
                shared_league_ids.add(pid)

    all_ids = (
        friend_ids
        | fof_ids
        | shared_league_ids
        | set(recent_partner)
        | set(recent_opp)
        | set(recent_session)
    )
    all_ids.discard(caller_player_id)
    return {
        pid: CallerNetworkSignals(
            is_friend=pid in friend_ids,
            is_fof=pid in fof_ids,
            is_shared_league=pid in shared_league_ids,
            recent_partner_count=recent_partner.get(pid, 0),
            recent_opp_count=recent_opp.get(pid, 0),
            recent_session_count=recent_session.get(pid, 0),
        )
        for pid in all_ids
    }


async def _caller_network(
    session: AsyncSession,
    *,
    caller_player_id: int,
    recent_days: int,
) -> Dict[int, CallerNetworkSignals]:
    """
    Caller-global network, served from Redis when possible.

    The cache is only consulted for the production recency window; a custom
    ``recent_days`` (tests / tuning) always recomputes. A miss / garbage /
    Redis-down all fall through to a live collect, so behaviour with no Redis
    is identical to the uncached path.
    """
    use_cache = recent_days == RECENT_WINDOW_DAYS
    if use_cache:
        cached = await player_search_cache.load_network(caller_player_id)
        if cached is not None:
            return cached
    network = await _collect_caller_network(
        session,
        caller_player_id=caller_player_id,
        recent_days=recent_days,
    )
    if use_cache:
        await player_search_cache.store_network(caller_player_id, network)
    return network


async def _session_member_ids(session: AsyncSession, session_id: int) -> Set[int]:
    """Live picker-session membership (never cached → never stale).

    Unions explicit session_participants rows with players who appear in any
    match in the session — both paths indicate prior participation.
    """
    part_rows = (
        await session.execute(
            select(SessionParticipant.player_id).where(SessionParticipant.session_id == session_id)
        )
    ).all()
    ids: Set[int] = {r[0] for r in part_rows if r[0] is not None}

    match_rows = (
        await session.execute(
            select(
                Match.team1_player1_id,
                Match.team1_player2_id,
                Match.team2_player1_id,
                Match.team2_player2_id,
            ).where(Match.session_id == session_id)
        )
    ).all()
    for row in match_rows:
        for pid in (row[0], row[1], row[2], row[3]):
            if pid is not None:
                ids.add(pid)

    return ids


async def _league_member_ids(session: AsyncSession, league_id: int) -> Set[int]:
    """Live league-match membership (never cached → never stale)."""
    rows = (
        await session.execute(
            select(LeagueMember.player_id).where(LeagueMember.league_id == league_id)
        )
    ).all()
    return {r[0] for r in rows if r[0] is not None}


def _serialize(row, *, tags: List[str], score: int, in_session: bool) -> Dict:
    """
    Shape a Player row into a picker result item.

    ``in_session`` is a distinct layout signal (drives the compact-chip
    group) — deliberately *not* a pill, so it never appears in ``tags``.
    ``is_guest`` mirrors ``Player.is_placeholder`` so the client seats a
    searched guest the same way as one freshly added via "Add New Player".
    first/last name are sent so the client can render last-initial etc.;
    full_name is retained as the canonical display + sort key.
    """
    names = _resolved_names(row)
    return {
        "id": row.id,
        "first_name": names["first_name"],
        "last_name": names["last_name"],
        "full_name": row.full_name,
        "nickname": row.nickname,
        "initials": generate_player_initials(row.full_name or ""),
        "profile_picture_url": row.profile_picture_url,
        "tags": tags,
        "score": score,
        "in_session": in_session,
        "is_guest": bool(getattr(row, "is_placeholder", False)),
    }


async def search_players_with_relevance(
    session: AsyncSession,
    q: str,
    *,
    caller_player_id: Optional[int],
    session_id: Optional[int] = None,
    league_id: Optional[int] = None,
    limit: int = _DEFAULT_STRANGER_LIMIT,
    recent_days: int = RECENT_WINDOW_DAYS,
) -> List[Dict]:
    """
    Relevance-ranked player search for pickers — one bounded list.

    Players are scored additively (see :mod:`player_search_scoring`): every
    relationship to the caller adds points. The caller's whole network is
    returned ranked by score (the client scrolls it locally); when a name
    term is given, score-0 strangers matching it are appended after the
    network, capped at ``limit``. There is no pagination cursor.

    Two invariants hold *structurally*, independent of cache state:

      * **No duplicates** — strangers explicitly exclude every candidate id.
      * **Session / league members always present & flagged** — that
        membership is queried live every call, never cached, so it cannot
        be stale even off an empty cache.

    Args:
        session: Async DB session.
        q: Name term (case-insensitive substring on full_name/nickname).
            Empty -> the caller's full network, no strangers.
        caller_player_id: Caller's player id; ``None`` => no network signals.
        session_id: Picker session context (members get the in-session flag).
        league_id: League-match context (members get the league signal/pill).
        limit: Cap on appended score-0 strangers (clamped 1..100).
        recent_days: Recency window; non-default bypasses the cache.

    Placeholders (guests) are first-class here: one in the caller's network
    (recent opponent, shared picker session / league) is scored and ranked
    like any real player; as a stranger, only placeholders the caller
    created themselves are name-searchable (others stay private to their
    creator's context).

    Returns:
        A list of result dicts: id, first_name, last_name, full_name,
        nickname, initials, tags (list[str]), score (int), in_session (bool),
        is_guest (bool — mirrors Player.is_placeholder).
        Network (ranked) first, then strangers (alphabetical, score 0).
    """
    term = (q or "").strip().lower()
    stranger_cap = max(1, min(limit, 100))
    ctx = ScoreContext(is_league_match=league_id is not None)

    # 1. Caller-global network — cached when possible (expensive, stable).
    network: Dict[int, CallerNetworkSignals] = {}
    if caller_player_id is not None:
        network = await _caller_network(
            session,
            caller_player_id=caller_player_id,
            recent_days=recent_days,
        )

    # 2. Request-context membership — always live, never cached, never stale.
    session_ids = (
        await _session_member_ids(session, session_id) if session_id is not None else set()
    )
    league_ids = await _league_member_ids(session, league_id) if league_id is not None else set()

    # 3. Candidate id set = network ∪ live context, caller removed.
    candidate: Set[int] = set(network) | session_ids | league_ids
    blocked_ids: Set[int] = set()
    if caller_player_id is not None:
        candidate.discard(caller_player_id)
        from backend.services import interaction_policy

        blocked_ids = await interaction_policy.blocked_player_ids(session, caller_player_id)
        # Existing session/league members are shared operational content and
        # stay visible. Blocked non-members are not invite candidates.
        candidate -= blocked_ids - session_ids - league_ids

    # Name predicate pushed into SQL rather than Python post-filtering: at
    # thousands of network members the picker must fetch only matching rows,
    # not the whole network on every debounced keystroke. Reused by the
    # stranger query below so both branches share one definition.
    name_like = f"%{term}%" if term else None
    name_match = (
        or_(Player.full_name.ilike(name_like), Player.nickname.ilike(name_like))
        if name_like is not None
        else None
    )

    network_items: List[Dict] = []
    if candidate:
        # Placeholders are NOT filtered here: a guest the caller has played
        # against (or who shares the picker session / league) is a genuine
        # member of the caller's network and must be re-pickable. They land
        # in `candidate` via the same recent-opp / membership signals as any
        # real player, and are scored identically.
        network_where = [
            Player.id.in_(candidate),
            _NON_SYSTEM,
        ]
        if name_match is not None:
            network_where.append(name_match)
        rows = (
            await session.execute(
                select(
                    Player.id,
                    Player.first_name,
                    Player.last_name,
                    Player.full_name,
                    Player.nickname,
                    Player.profile_picture_url,
                    Player.is_placeholder,
                ).where(*network_where)
            )
        ).all()
        for r in rows:
            sig = network.get(r.id)
            metrics = PlayerSignalMetrics(
                is_session=r.id in session_ids,
                is_context_league=r.id in league_ids,
                is_friend=sig.is_friend if sig else False,
                is_fof=sig.is_fof if sig else False,
                is_shared_league=sig.is_shared_league if sig else False,
                recent_partner_count=sig.recent_partner_count if sig else 0,
                recent_opp_count=sig.recent_opp_count if sig else 0,
                recent_session_count=sig.recent_session_count if sig else 0,
            )
            network_items.append(
                _serialize(
                    r,
                    tags=tags_for(metrics, ctx),
                    score=score_player(metrics, ctx),
                    in_session=metrics.is_session,
                )
            )
        network_items.sort(key=lambda d: (-d["score"], (d["full_name"] or "").lower(), d["id"]))
        network_items = network_items[:_NETWORK_HARD_CAP]

    # 4. Strangers: only with a name term (it bounds the scan). Explicitly
    #    disjoint from every candidate id, so no row can be duplicated.
    stranger_items: List[Dict] = []
    if term:
        seen: Set[int] = {d["id"] for d in network_items} | candidate
        if caller_player_id is not None:
            seen.add(caller_player_id)
        # Surface the best name matches first so the typed player stays
        # reachable within the cap: exact name, then prefix, then plain
        # substring — never blind alphabetical (which buried exact matches).
        match_rank = case(
            (
                or_(
                    func.lower(Player.full_name) == term,
                    func.lower(Player.nickname) == term,
                ),
                0,
            ),
            (
                or_(
                    func.lower(Player.full_name).like(f"{term}%"),
                    func.lower(Player.nickname).like(f"{term}%"),
                ),
                1,
            ),
            else_=2,
        )
        # Strangers are score-0 name matches with no tie to the caller.
        # Surfacing every guest anyone ever created here would be noise (and
        # mildly leaky), so placeholders are excluded from the stranger pool
        # *except* the ones the caller created themselves — those stay
        # findable by name so a freshly-added guest can be re-picked before
        # any game has been logged with them.
        stranger_placeholder_ok = (
            or_(
                Player.is_placeholder.is_(False),
                Player.created_by_player_id == caller_player_id,
            )
            if caller_player_id is not None
            else Player.is_placeholder.is_(False)
        )
        s_stmt = select(
            Player.id,
            Player.first_name,
            Player.last_name,
            Player.full_name,
            Player.nickname,
            Player.profile_picture_url,
            Player.is_placeholder,
        ).where(
            name_match,
            _NON_SYSTEM,
            stranger_placeholder_ok,
        )
        if seen:
            s_stmt = s_stmt.where(Player.id.notin_(seen))
        if blocked_ids:
            s_stmt = s_stmt.where(Player.id.notin_(blocked_ids))
        s_stmt = s_stmt.order_by(
            match_rank.asc(), func.lower(Player.full_name).asc(), Player.id.asc()
        ).limit(stranger_cap)
        s_rows = (await session.execute(s_stmt)).all()
        stranger_items = [_serialize(r, tags=[], score=0, in_session=False) for r in s_rows]

    return network_items + stranger_items


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
        "avatar": player.profile_picture_url or player.avatar,
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
        "avatar": player.profile_picture_url or player.avatar,
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
        {
            "id": court.id,
            "name": court.name,
            "address": court.address,
            "latitude": court.latitude,
            "longitude": court.longitude,
            "position": phc.position,
        }
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
