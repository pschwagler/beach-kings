"""
Court discovery service — CRUD, search, nearby, slug generation.

Handles court listing with filters, detail retrieval, court submission,
and nearby-court calculations using haversine distance.
"""

import logging
import math
import re
import unicodedata
from typing import Dict, List, Optional, Tuple

from sqlalchemy import and_, case, func, literal, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.database.models import (
    Court,
    CourtEditSuggestion,
    CourtPhoto,
    CourtReview,
    CourtReviewPhoto,
    CourtReviewTag,
    CourtTag,
    Location,
    Match,
    Player,
    Session,
    SessionStatus,
)
from backend.utils.geo_utils import calculate_distance_miles

logger = logging.getLogger(__name__)


def _escape_like(value: str) -> str:
    """Escape LIKE-special characters (%, _) so they match literally."""
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


# ---------------------------------------------------------------------------
# Slug helpers
# ---------------------------------------------------------------------------


def _slugify(text: str) -> str:
    """Convert text to URL-safe slug (lowercase, hyphens, no special chars)."""
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_]+", "-", text)
    text = re.sub(r"-+", "-", text)
    return text.strip("-")


async def _generate_unique_slug(
    session: AsyncSession, name: str, city: Optional[str] = None
) -> str:
    """Generate a unique slug for a court, appending city or numeric suffix if needed."""
    base = _slugify(name)
    if city:
        base = f"{base}-{_slugify(city)}"

    slug = base
    counter = 1
    while True:
        result = await session.execute(select(Court.id).where(Court.slug == slug))
        if result.scalar_one_or_none() is None:
            return slug
        slug = f"{base}-{counter}"
        counter += 1


# ---------------------------------------------------------------------------
# Tags
# ---------------------------------------------------------------------------


async def get_all_tags(session: AsyncSession) -> List[Dict]:
    """Return all curated court tags ordered by sort_order."""
    result = await session.execute(select(CourtTag).order_by(CourtTag.sort_order))
    return [
        {
            "id": t.id,
            "name": t.name,
            "slug": t.slug,
            "category": t.category,
            "sort_order": t.sort_order,
        }
        for t in result.scalars().all()
    ]


# ---------------------------------------------------------------------------
# Court listing (public)
# ---------------------------------------------------------------------------


async def list_courts_public(
    session: AsyncSession,
    *,
    location_id: Optional[str] = None,
    surface_type: Optional[str] = None,
    min_rating: Optional[float] = None,
    is_free: Optional[bool] = None,
    has_lights: Optional[bool] = None,
    has_restrooms: Optional[bool] = None,
    has_parking: Optional[bool] = None,
    nets_provided: Optional[bool] = None,
    search: Optional[str] = None,
    user_lat: Optional[float] = None,
    user_lng: Optional[float] = None,
    page: int = 1,
    page_size: int = 20,
) -> Dict:
    """
    List approved, active courts with optional filters and pagination.

    When ``user_lat`` and ``user_lng`` are provided, results are sorted by
    distance (nearest first) and each item includes ``distance_miles``.
    Otherwise results are sorted alphabetically by name.

    Args:
        session: Database session.
        location_id: Filter by location hub ID (e.g. ``socal_sd``).
        surface_type: Filter by surface (``sand``, ``grass``, ``indoor_sand``).
        min_rating: Minimum average rating (1–5).
        is_free: Filter free (True) or paid (False) courts.
        has_lights: Filter courts with lights.
        has_restrooms: Filter courts with restrooms.
        has_parking: Filter courts with parking.
        nets_provided: Filter courts with nets.
        search: Free-text search on name or address.
        user_lat: User latitude for distance-based sorting.
        user_lng: User longitude for distance-based sorting.
        page: Page number (1-indexed).
        page_size: Items per page (default 20).

    Returns:
        Dict with ``items``, ``total_count``, ``page``, ``page_size``.
    """
    sort_by_distance = user_lat is not None and user_lng is not None

    base = select(Court).where(
        and_(Court.status == "approved", Court.is_active == True)  # noqa: E712
    )

    # Apply filters
    if location_id:
        base = base.where(Court.location_id == location_id)
    if surface_type:
        base = base.where(Court.surface_type == surface_type)
    if min_rating is not None:
        base = base.where(Court.average_rating >= min_rating)
    if is_free is not None:
        base = base.where(Court.is_free == is_free)
    if has_lights is not None:
        base = base.where(Court.has_lights == has_lights)
    if has_restrooms is not None:
        base = base.where(Court.has_restrooms == has_restrooms)
    if has_parking is not None:
        base = base.where(Court.has_parking == has_parking)
    if nets_provided is not None:
        base = base.where(Court.nets_provided == nets_provided)
    if search:
        pattern = f"%{_escape_like(search)}%"
        base = base.where(
            or_(Court.name.ilike(pattern), Court.address.ilike(pattern))
        )

    # Count
    count_q = select(func.count()).select_from(base.subquery())
    total_count = (await session.execute(count_q)).scalar() or 0

    # Build distance expression for SQL-level sort when user coords provided.
    # Uses the Haversine approximation via PostgreSQL math functions:
    #   d = 3959 * acos(sin(lat1)*sin(lat2) + cos(lat1)*cos(lat2)*cos(lng2-lng1))
    dist_col = None
    if sort_by_distance:
        rad = math.pi / 180.0
        u_lat_r = user_lat * rad
        u_lng_r = user_lng * rad
        dist_col = (
            literal(3959.0)
            * func.acos(
                func.least(
                    literal(1.0),
                    func.sin(literal(u_lat_r))
                    * func.sin(Court.latitude * rad)
                    + func.cos(literal(u_lat_r))
                    * func.cos(Court.latitude * rad)
                    * func.cos(Court.longitude * rad - literal(u_lng_r)),
                )
            )
        ).label("distance_miles")

    offset = (page - 1) * page_size
    courts_q = base.outerjoin(Location, Court.location_id == Location.id).add_columns(
        Location.name.label("location_name"),
        Location.slug.label("location_slug"),
    )

    if dist_col is not None:
        # Add distance column; push courts without coords to the end
        courts_q = courts_q.add_columns(
            case(
                (
                    and_(Court.latitude.isnot(None), Court.longitude.isnot(None)),
                    dist_col,
                ),
                else_=literal(999999.0),
            ).label("distance_miles")
        ).order_by("distance_miles")
    else:
        courts_q = courts_q.order_by(Court.name)

    courts_q = courts_q.offset(offset).limit(page_size)
    rows = (await session.execute(courts_q)).all()

    # Batch-load tags and thumbnails to avoid N+1 queries
    court_ids = [row[0].id for row in rows]
    tags_map = await _batch_get_top_tags(session, court_ids, limit=3)
    photos_map = await _batch_get_thumbnails(session, court_ids)

    items = []
    for row in rows:
        court = row[0]
        loc_name = row[1]
        loc_slug = row[2]
        item = {
            "id": court.id,
            "name": court.name,
            "slug": court.slug or "",
            "address": court.address,
            "location_id": court.location_id,
            "location_name": loc_name,
            "location_slug": loc_slug,
            "court_count": court.court_count,
            "surface_type": court.surface_type,
            "is_free": court.is_free,
            "has_lights": court.has_lights,
            "nets_provided": court.nets_provided,
            "latitude": court.latitude,
            "longitude": court.longitude,
            "average_rating": court.average_rating,
            "review_count": court.review_count or 0,
            "top_tags": tags_map.get(court.id, []),
            "photo_url": photos_map.get(court.id),
        }
        if dist_col is not None:
            d = row[3]
            item["distance_miles"] = round(d, 1) if d < 999999.0 else None
        items.append(item)

    return {
        "items": items,
        "total_count": total_count,
        "page": page,
        "page_size": page_size,
    }


async def _batch_get_top_tags(
    session: AsyncSession, court_ids: List[int], limit: int = 3
) -> Dict[int, List[str]]:
    """Return the top-N most-used tag names for each court in a single query."""
    if not court_ids:
        return {}

    # Rank tags per court by frequency, then filter to top N
    ranked = (
        select(
            CourtReview.court_id,
            CourtTag.name,
            func.count(CourtReviewTag.id).label("cnt"),
            func.row_number()
            .over(
                partition_by=CourtReview.court_id,
                order_by=func.count(CourtReviewTag.id).desc(),
            )
            .label("rn"),
        )
        .join(CourtReviewTag, CourtReview.id == CourtReviewTag.review_id)
        .join(CourtTag, CourtReviewTag.tag_id == CourtTag.id)
        .where(CourtReview.court_id.in_(court_ids))
        .group_by(CourtReview.court_id, CourtTag.name)
        .subquery()
    )

    q = select(ranked.c.court_id, ranked.c.name).where(ranked.c.rn <= limit)
    result = await session.execute(q)

    tags_map: Dict[int, List[str]] = {cid: [] for cid in court_ids}
    for court_id, tag_name in result.all():
        tags_map[court_id].append(tag_name)
    return tags_map


async def _batch_get_thumbnails(
    session: AsyncSession, court_ids: List[int]
) -> Dict[int, Optional[str]]:
    """Return the most recent photo URL for each court in a single query.

    Considers both review photos and standalone court photos, picking
    whichever is most recent.
    """
    if not court_ids:
        return {}

    # Review photos
    review_photos = (
        select(
            CourtReview.court_id.label("court_id"),
            CourtReviewPhoto.url.label("url"),
            CourtReviewPhoto.created_at.label("created_at"),
        )
        .join(CourtReview, CourtReviewPhoto.review_id == CourtReview.id)
        .where(CourtReview.court_id.in_(court_ids))
    )

    # Standalone court photos
    standalone_photos = select(
        CourtPhoto.court_id.label("court_id"),
        CourtPhoto.url.label("url"),
        CourtPhoto.created_at.label("created_at"),
    ).where(CourtPhoto.court_id.in_(court_ids))

    # Union both sources, rank by recency per court
    all_photos = review_photos.union_all(standalone_photos).subquery()

    ranked = (
        select(
            all_photos.c.court_id,
            all_photos.c.url,
            func.row_number()
            .over(
                partition_by=all_photos.c.court_id,
                order_by=all_photos.c.created_at.desc(),
            )
            .label("rn"),
        )
        .subquery()
    )

    q = select(ranked.c.court_id, ranked.c.url).where(ranked.c.rn == 1)
    result = await session.execute(q)

    photos_map: Dict[int, Optional[str]] = {}
    for court_id, url in result.all():
        photos_map[court_id] = url
    return photos_map


# ---------------------------------------------------------------------------
# Court detail
# ---------------------------------------------------------------------------


async def get_court_id_by_slug(session: AsyncSession, slug: str) -> Optional[int]:
    """
    Look up a court ID by slug.

    Returns the court's integer ID, or None if not found.
    """
    result = await session.execute(
        select(Court.id).where(Court.slug == slug)
    )
    row = result.first()
    return row[0] if row else None


async def get_court_by_slug(session: AsyncSession, slug: str) -> Optional[Dict]:
    """
    Fetch full court detail by slug.

    Eagerly loads reviews (with tags, photos, author) and location name.
    Returns None if not found.
    """
    q = (
        select(Court)
        .options(
            selectinload(Court.reviews).options(
                selectinload(CourtReview.review_tags).selectinload(CourtReviewTag.tag),
                selectinload(CourtReview.photos),
                selectinload(CourtReview.player),
            ),
            selectinload(Court.photos),
        )
        .where(Court.slug == slug)
    )
    result = await session.execute(q)
    court = result.scalar_one_or_none()
    if not court:
        return None

    # Location name + slug
    loc_name = None
    loc_slug = None
    if court.location_id:
        loc_result = await session.execute(
            select(Location.name, Location.slug).where(Location.id == court.location_id)
        )
        loc_row = loc_result.first()
        if loc_row:
            loc_name = loc_row[0]
            loc_slug = loc_row[1]

    # Build reviews
    reviews = []
    all_photos = []
    for r in sorted(court.reviews, key=lambda x: x.created_at, reverse=True):
        tags = [
            {
                "id": rt.tag.id,
                "name": rt.tag.name,
                "slug": rt.tag.slug,
                "category": rt.tag.category,
                "sort_order": rt.tag.sort_order,
            }
            for rt in r.review_tags
        ]
        photos = [
            {"id": p.id, "url": p.url, "sort_order": p.sort_order}
            for p in sorted(r.photos, key=lambda x: x.sort_order)
        ]
        all_photos.extend(photos)

        reviews.append(
            {
                "id": r.id,
                "court_id": r.court_id,
                "rating": r.rating,
                "review_text": r.review_text,
                "author": {
                    "player_id": r.player.id,
                    "full_name": r.player.full_name,
                    "avatar": r.player.avatar,
                },
                "tags": tags,
                "photos": photos,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "updated_at": r.updated_at.isoformat() if r.updated_at else None,
            }
        )

    # Standalone court photos
    court_photos = [
        {"id": p.id, "url": p.url, "sort_order": p.sort_order}
        for p in sorted(court.photos, key=lambda x: x.sort_order)
    ]

    return {
        "id": court.id,
        "name": court.name,
        "slug": court.slug,
        "address": court.address,
        "description": court.description,
        "location_id": court.location_id,
        "location_name": loc_name,
        "location_slug": loc_slug,
        "court_count": court.court_count,
        "surface_type": court.surface_type,
        "is_free": court.is_free,
        "cost_info": court.cost_info,
        "has_lights": court.has_lights,
        "has_restrooms": court.has_restrooms,
        "has_parking": court.has_parking,
        "parking_info": court.parking_info,
        "nets_provided": court.nets_provided,
        "hours": court.hours,
        "phone": court.phone,
        "website": court.website,
        "latitude": court.latitude,
        "longitude": court.longitude,
        "average_rating": court.average_rating,
        "review_count": court.review_count or 0,
        "status": court.status or "approved",
        "is_active": court.is_active if court.is_active is not None else True,
        "created_by": court.created_by,
        "reviews": reviews,
        "all_photos": court_photos + all_photos,
        "court_photos": court_photos,
        "created_at": court.created_at.isoformat() if court.created_at else None,
        "updated_at": court.updated_at.isoformat() if court.updated_at else None,
    }


# ---------------------------------------------------------------------------
# Court photos (standalone)
# ---------------------------------------------------------------------------


async def add_court_photo(
    session: AsyncSession,
    court_id: int,
    player_id: int,
    s3_key: str,
    url: str,
) -> Dict:
    """
    Create a standalone court photo record.

    Args:
        session: Database session
        court_id: ID of the court
        player_id: ID of the player uploading
        s3_key: S3 object key
        url: Public URL of the photo

    Returns:
        Dict with id, url, sort_order
    """
    # Verify court exists
    court = await session.get(Court, court_id)
    if not court:
        raise ValueError(f"Court {court_id} not found")

    # Lock the court row to prevent race conditions on sort_order
    await session.execute(select(Court).where(Court.id == court_id).with_for_update())

    # Determine next sort_order
    max_order_result = await session.execute(
        select(func.coalesce(func.max(CourtPhoto.sort_order), -1)).where(
            CourtPhoto.court_id == court_id
        )
    )
    next_order = max_order_result.scalar() + 1

    photo = CourtPhoto(
        court_id=court_id,
        s3_key=s3_key,
        url=url,
        uploaded_by=player_id,
        sort_order=next_order,
    )
    session.add(photo)
    await session.commit()

    return {"id": photo.id, "url": photo.url, "sort_order": photo.sort_order}


async def get_court_leaderboard(
    session: AsyncSession,
    court_id: int,
    limit: int = 10,
) -> List[Dict]:
    """
    Get top players by match count at a court.

    Counts matches played at the court (via sessions) and calculates win rate.
    Returns ranked list of players with match_count, win_count, win_rate.
    """
    # Build a union of all player appearances in matches at this court
    # Each match has 4 player slots: team1_player1, team1_player2, team2_player1, team2_player2
    # A player "wins" if they're on the winning team
    player_match = (
        select(
            Match.id.label("match_id"),
            Match.team1_player1_id.label("player_id"),
            case((Match.winner == 1, 1), else_=0).label("is_win"),
        )
        .join(Session, Session.id == Match.session_id)
        .where(
            Session.court_id == court_id,
            Session.status.in_([SessionStatus.SUBMITTED, SessionStatus.EDITED]),
            Match.team1_player1_id.isnot(None),
        )
    ).union_all(
        select(
            Match.id,
            Match.team1_player2_id,
            case((Match.winner == 1, 1), else_=0),
        )
        .join(Session, Session.id == Match.session_id)
        .where(
            Session.court_id == court_id,
            Session.status.in_([SessionStatus.SUBMITTED, SessionStatus.EDITED]),
            Match.team1_player2_id.isnot(None),
        ),
        select(
            Match.id,
            Match.team2_player1_id,
            case((Match.winner == 2, 1), else_=0),
        )
        .join(Session, Session.id == Match.session_id)
        .where(
            Session.court_id == court_id,
            Session.status.in_([SessionStatus.SUBMITTED, SessionStatus.EDITED]),
            Match.team2_player1_id.isnot(None),
        ),
        select(
            Match.id,
            Match.team2_player2_id,
            case((Match.winner == 2, 1), else_=0),
        )
        .join(Session, Session.id == Match.session_id)
        .where(
            Session.court_id == court_id,
            Session.status.in_([SessionStatus.SUBMITTED, SessionStatus.EDITED]),
            Match.team2_player2_id.isnot(None),
        ),
    )

    sub = player_match.subquery()

    q = (
        select(
            sub.c.player_id,
            func.count(sub.c.match_id).label("match_count"),
            func.sum(sub.c.is_win).label("win_count"),
        )
        .group_by(sub.c.player_id)
        .order_by(func.count(sub.c.match_id).desc())
        .limit(limit)
    )

    result = await session.execute(q)
    rows = result.all()

    if not rows:
        return []

    # Fetch player details
    player_ids = [r.player_id for r in rows]
    player_q = select(Player.id, Player.full_name, Player.avatar).where(
        Player.id.in_(player_ids)
    )
    player_result = await session.execute(player_q)
    player_map = {p.id: p for p in player_result.all()}

    leaderboard = []
    for rank, row in enumerate(rows, start=1):
        player = player_map.get(row.player_id)
        if not player:
            continue
        match_count = row.match_count
        win_count = int(row.win_count or 0)
        leaderboard.append(
            {
                "rank": rank,
                "player_id": row.player_id,
                "player_name": player.full_name,
                "avatar": player.avatar,
                "match_count": match_count,
                "win_count": win_count,
                "win_rate": round(win_count / match_count, 3) if match_count else 0.0,
            }
        )

    return leaderboard


# ---------------------------------------------------------------------------
# Nearby courts
# ---------------------------------------------------------------------------


async def get_nearby_courts(
    session: AsyncSession,
    lat: float,
    lng: float,
    *,
    exclude_court_id: Optional[int] = None,
    radius_miles: float = 25.0,
    limit: int = 10,
) -> List[Dict]:
    """
    Return approved courts within radius_miles of (lat, lng), sorted by distance.

    Uses in-Python haversine filtering (efficient for small datasets).
    """
    q = select(Court).where(
        and_(
            Court.status == "approved",
            Court.is_active == True,  # noqa: E712
            Court.latitude.isnot(None),
            Court.longitude.isnot(None),
        )
    )
    if exclude_court_id:
        q = q.where(Court.id != exclude_court_id)

    result = await session.execute(q)
    courts = result.scalars().all()

    nearby = []
    for c in courts:
        dist = calculate_distance_miles(lat, lng, c.latitude, c.longitude)
        if dist <= radius_miles:
            nearby.append(
                {
                    "id": c.id,
                    "name": c.name,
                    "slug": c.slug or "",
                    "address": c.address,
                    "surface_type": c.surface_type,
                    "average_rating": c.average_rating,
                    "review_count": c.review_count or 0,
                    "distance_miles": round(dist, 1),
                    "latitude": c.latitude,
                    "longitude": c.longitude,
                }
            )

    nearby.sort(key=lambda x: x["distance_miles"])
    return nearby[:limit]


# ---------------------------------------------------------------------------
# Court creation / update
# ---------------------------------------------------------------------------


async def create_court(
    session: AsyncSession,
    *,
    name: str,
    address: str,
    location_id: str,
    created_by_player_id: Optional[int] = None,
    status: str = "pending",
    description: Optional[str] = None,
    court_count: Optional[int] = None,
    surface_type: Optional[str] = None,
    is_free: Optional[bool] = None,
    cost_info: Optional[str] = None,
    has_lights: Optional[bool] = None,
    has_restrooms: Optional[bool] = None,
    has_parking: Optional[bool] = None,
    parking_info: Optional[str] = None,
    nets_provided: Optional[bool] = None,
    hours: Optional[str] = None,
    phone: Optional[str] = None,
    website: Optional[str] = None,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
) -> Dict:
    """
    Create a new court with the given status.

    Generates a unique slug from name + location city.
    """
    # Resolve city from location for slug
    city = None
    loc_result = await session.execute(
        select(Location.city).where(Location.id == location_id)
    )
    loc_row = loc_result.first()
    if loc_row:
        city = loc_row[0]

    slug = await _generate_unique_slug(session, name, city)

    court = Court(
        name=name,
        address=address,
        location_id=location_id,
        slug=slug,
        status=status,
        is_active=True,
        description=description,
        court_count=court_count,
        surface_type=surface_type,
        is_free=is_free,
        cost_info=cost_info,
        has_lights=has_lights,
        has_restrooms=has_restrooms,
        has_parking=has_parking,
        parking_info=parking_info,
        nets_provided=nets_provided,
        hours=hours,
        phone=phone,
        website=website,
        latitude=latitude,
        longitude=longitude,
        created_by=created_by_player_id,
        review_count=0,
    )
    session.add(court)
    await session.commit()
    await session.refresh(court)

    return {
        "id": court.id,
        "name": court.name,
        "slug": court.slug,
        "status": court.status,
        "created_at": court.created_at.isoformat() if court.created_at else None,
    }


async def update_court_fields(
    session: AsyncSession,
    court_id: int,
    *,
    updater_player_id: Optional[int] = None,
    **fields,
) -> Optional[Dict]:
    """
    Update arbitrary fields on a court.

    Returns the updated court dict, or None if not found.
    """
    # Filter out None values (caller passes Optional fields)
    update_values = {k: v for k, v in fields.items() if v is not None}
    if updater_player_id is not None:
        update_values["updated_by"] = updater_player_id

    if update_values:
        await session.execute(
            update(Court).where(Court.id == court_id).values(**update_values)
        )
        await session.commit()

    result = await session.execute(select(Court).where(Court.id == court_id))
    court = result.scalar_one_or_none()
    if not court:
        return None

    return {
        "id": court.id,
        "name": court.name,
        "slug": court.slug,
        "status": court.status,
        "updated_at": court.updated_at.isoformat() if court.updated_at else None,
    }


# ---------------------------------------------------------------------------
# Admin operations
# ---------------------------------------------------------------------------


async def list_pending_courts(session: AsyncSession) -> List[Dict]:
    """List all courts with status='pending' for admin review."""
    q = (
        select(Court, Player.full_name)
        .outerjoin(Player, Court.created_by == Player.id)
        .where(Court.status == "pending")
        .order_by(Court.created_at.desc())
    )
    rows = (await session.execute(q)).all()
    return [
        {
            "id": court.id,
            "name": court.name,
            "slug": court.slug,
            "address": court.address,
            "location_id": court.location_id,
            "surface_type": court.surface_type,
            "court_count": court.court_count,
            "submitter_name": submitter_name,
            "created_at": court.created_at.isoformat() if court.created_at else None,
            "status": court.status,
        }
        for court, submitter_name in rows
    ]


async def approve_court(session: AsyncSession, court_id: int) -> Optional[Dict]:
    """Set court status to 'approved'. Returns updated court or None."""
    return await _set_court_status(session, court_id, "approved")


async def reject_court(session: AsyncSession, court_id: int) -> Optional[Dict]:
    """Set court status to 'rejected'. Returns updated court or None."""
    return await _set_court_status(session, court_id, "rejected")


async def _set_court_status(
    session: AsyncSession, court_id: int, new_status: str
) -> Optional[Dict]:
    """Internal helper to change court status."""
    result = await session.execute(select(Court).where(Court.id == court_id))
    court = result.scalar_one_or_none()
    if not court:
        return None

    court.status = new_status
    await session.commit()
    await session.refresh(court)

    return {
        "id": court.id,
        "name": court.name,
        "slug": court.slug,
        "status": court.status,
    }


# ---------------------------------------------------------------------------
# Reviews
# ---------------------------------------------------------------------------


async def create_review(
    session: AsyncSession,
    *,
    court_id: int,
    player_id: int,
    rating: int,
    review_text: Optional[str] = None,
    tag_ids: Optional[List[int]] = None,
) -> Dict:
    """
    Create a court review (one per user per court).

    Attaches tags, recalculates court average_rating and review_count.
    Raises ValueError if the user already reviewed this court.
    """
    # Check for existing review
    existing = await session.execute(
        select(CourtReview.id).where(
            and_(CourtReview.court_id == court_id, CourtReview.player_id == player_id)
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise ValueError("You have already reviewed this court")

    review = CourtReview(
        court_id=court_id,
        player_id=player_id,
        rating=rating,
        review_text=review_text,
    )
    session.add(review)
    await session.flush()  # get review.id before adding tags

    # Attach tags
    if tag_ids:
        for tid in tag_ids:
            session.add(CourtReviewTag(review_id=review.id, tag_id=tid))

    await session.commit()
    await session.refresh(review)

    # Recalculate denormalized stats
    avg, count = await _recalc_court_rating(session, court_id)

    return {
        "review_id": review.id,
        "average_rating": avg,
        "review_count": count,
    }


async def update_review(
    session: AsyncSession,
    *,
    review_id: int,
    player_id: int,
    rating: Optional[int] = None,
    review_text: Optional[str] = None,
    tag_ids: Optional[List[int]] = None,
) -> Optional[Dict]:
    """
    Update an existing review (author only).

    Returns updated stats, or None if review not found / not the author.
    """
    result = await session.execute(
        select(CourtReview).where(CourtReview.id == review_id)
    )
    review = result.scalar_one_or_none()
    if not review or review.player_id != player_id:
        return None

    if rating is not None:
        review.rating = rating
    if review_text is not None:
        review.review_text = review_text

    # Replace tags if provided
    if tag_ids is not None:
        await session.execute(
            CourtReviewTag.__table__.delete().where(
                CourtReviewTag.review_id == review_id
            )
        )
        for tid in tag_ids:
            session.add(CourtReviewTag(review_id=review_id, tag_id=tid))

    await session.commit()

    avg, count = await _recalc_court_rating(session, review.court_id)
    return {
        "review_id": review.id,
        "average_rating": avg,
        "review_count": count,
    }


async def delete_review(
    session: AsyncSession,
    *,
    review_id: int,
    player_id: int,
) -> Optional[Dict]:
    """
    Delete a review (author only). Returns S3 keys of photos for async cleanup.

    Returns updated stats and photo keys, or None if not found / not author.
    """
    result = await session.execute(
        select(CourtReview)
        .options(selectinload(CourtReview.photos))
        .where(CourtReview.id == review_id)
    )
    review = result.scalar_one_or_none()
    if not review or review.player_id != player_id:
        return None

    court_id = review.court_id
    photo_s3_keys = [p.s3_key for p in review.photos]

    await session.delete(review)
    await session.commit()

    avg, count = await _recalc_court_rating(session, court_id)
    return {
        "review_id": review_id,
        "average_rating": avg,
        "review_count": count,
        "photo_s3_keys": photo_s3_keys,
    }


async def list_reviews(
    session: AsyncSession,
    court_id: int,
    *,
    page: int = 1,
    page_size: int = 20,
) -> Dict:
    """Paginated reviews for a court with tags, photos, and author info."""
    base = select(CourtReview).where(CourtReview.court_id == court_id)
    total = (
        await session.execute(
            select(func.count()).select_from(base.subquery())
        )
    ).scalar() or 0

    offset = (page - 1) * page_size
    q = (
        base.options(
            selectinload(CourtReview.review_tags).selectinload(CourtReviewTag.tag),
            selectinload(CourtReview.photos),
            selectinload(CourtReview.player),
        )
        .order_by(CourtReview.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    rows = (await session.execute(q)).scalars().all()

    items = []
    for r in rows:
        tags = [
            {
                "id": rt.tag.id,
                "name": rt.tag.name,
                "slug": rt.tag.slug,
                "category": rt.tag.category,
                "sort_order": rt.tag.sort_order,
            }
            for rt in r.review_tags
        ]
        photos = [
            {"id": p.id, "url": p.url, "sort_order": p.sort_order}
            for p in sorted(r.photos, key=lambda x: x.sort_order)
        ]
        items.append(
            {
                "id": r.id,
                "court_id": r.court_id,
                "rating": r.rating,
                "review_text": r.review_text,
                "author": {
                    "player_id": r.player.id,
                    "full_name": r.player.full_name,
                    "avatar": r.player.avatar,
                },
                "tags": tags,
                "photos": photos,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "updated_at": r.updated_at.isoformat() if r.updated_at else None,
            }
        )

    return {"items": items, "total_count": total, "page": page, "page_size": page_size}


async def _recalc_court_rating(
    session: AsyncSession, court_id: int
) -> Tuple[Optional[float], int]:
    """Recalculate and persist average_rating and review_count for a court."""
    q = select(
        func.avg(CourtReview.rating), func.count(CourtReview.id)
    ).where(CourtReview.court_id == court_id)
    row = (await session.execute(q)).first()
    avg_val = round(float(row[0]), 2) if row[0] is not None else None
    count_val = row[1] or 0

    await session.execute(
        update(Court)
        .where(Court.id == court_id)
        .values(average_rating=avg_val, review_count=count_val)
    )
    await session.commit()
    return avg_val, count_val


# ---------------------------------------------------------------------------
# Review photos
# ---------------------------------------------------------------------------

MAX_PHOTOS_PER_REVIEW = 3


async def add_review_photo(
    session: AsyncSession,
    *,
    review_id: int,
    player_id: int,
    s3_key: str,
    url: str,
) -> Optional[Dict]:
    """
    Add a photo to a review (author only, max 3).

    Returns the new photo dict, or None if not authorized.
    Raises ValueError if photo limit exceeded.
    """
    # Verify authorship
    result = await session.execute(
        select(CourtReview).where(CourtReview.id == review_id)
    )
    review = result.scalar_one_or_none()
    if not review or review.player_id != player_id:
        return None

    # Check limit
    count_result = await session.execute(
        select(func.count()).where(CourtReviewPhoto.review_id == review_id)
    )
    current_count = count_result.scalar() or 0
    if current_count >= MAX_PHOTOS_PER_REVIEW:
        raise ValueError(f"Maximum {MAX_PHOTOS_PER_REVIEW} photos per review")

    photo = CourtReviewPhoto(
        review_id=review_id,
        s3_key=s3_key,
        url=url,
        sort_order=current_count,
    )
    session.add(photo)
    await session.commit()
    await session.refresh(photo)

    return {
        "id": photo.id,
        "url": photo.url,
        "sort_order": photo.sort_order,
    }


# ---------------------------------------------------------------------------
# Edit suggestions
# ---------------------------------------------------------------------------


async def create_edit_suggestion(
    session: AsyncSession,
    *,
    court_id: int,
    suggested_by_player_id: int,
    changes: dict,
) -> Dict:
    """Create a court edit suggestion."""
    suggestion = CourtEditSuggestion(
        court_id=court_id,
        suggested_by=suggested_by_player_id,
        changes=changes,
        status="pending",
    )
    session.add(suggestion)
    await session.commit()
    await session.refresh(suggestion)

    return {
        "id": suggestion.id,
        "court_id": suggestion.court_id,
        "status": suggestion.status,
        "created_at": suggestion.created_at.isoformat() if suggestion.created_at else None,
    }


async def list_edit_suggestions(
    session: AsyncSession, court_id: int
) -> List[Dict]:
    """List pending edit suggestions for a court."""
    q = (
        select(CourtEditSuggestion, Player.full_name)
        .outerjoin(Player, CourtEditSuggestion.suggested_by == Player.id)
        .where(CourtEditSuggestion.court_id == court_id)
        .order_by(CourtEditSuggestion.created_at.desc())
    )
    rows = (await session.execute(q)).all()
    return [
        {
            "id": s.id,
            "court_id": s.court_id,
            "suggested_by": s.suggested_by,
            "suggester_name": name,
            "changes": s.changes,
            "status": s.status,
            "reviewed_by": s.reviewed_by,
            "created_at": s.created_at.isoformat() if s.created_at else None,
            "reviewed_at": s.reviewed_at.isoformat() if s.reviewed_at else None,
        }
        for s, name in rows
    ]


async def resolve_edit_suggestion(
    session: AsyncSession,
    *,
    suggestion_id: int,
    action: str,  # 'approved' or 'rejected'
    reviewer_player_id: int,
) -> Optional[Dict]:
    """
    Approve or reject an edit suggestion.

    If approved, apply changes to the court.
    Returns updated suggestion dict or None if not found.
    """
    from datetime import datetime, timezone

    result = await session.execute(
        select(CourtEditSuggestion).where(CourtEditSuggestion.id == suggestion_id)
    )
    suggestion = result.scalar_one_or_none()
    if not suggestion:
        return None

    suggestion.status = action
    suggestion.reviewed_by = reviewer_player_id
    suggestion.reviewed_at = datetime.now(timezone.utc)

    if action == "approved":
        changes = suggestion.changes
        # Only apply known court fields
        allowed_fields = {
            "name", "address", "description", "court_count", "surface_type",
            "is_free", "cost_info", "has_lights", "has_restrooms", "has_parking",
            "parking_info", "nets_provided", "hours", "phone", "website",
        }
        update_values = {k: v for k, v in changes.items() if k in allowed_fields}
        if update_values:
            await session.execute(
                update(Court)
                .where(Court.id == suggestion.court_id)
                .values(**update_values)
            )

    await session.commit()
    await session.refresh(suggestion)

    return {
        "id": suggestion.id,
        "court_id": suggestion.court_id,
        "status": suggestion.status,
        "reviewed_at": suggestion.reviewed_at.isoformat() if suggestion.reviewed_at else None,
    }


# ---------------------------------------------------------------------------
# Sitemap helper
# ---------------------------------------------------------------------------


async def get_sitemap_courts(session: AsyncSession) -> List[Dict]:
    """Return approved courts with slugs for sitemap generation."""
    q = select(Court.slug, Court.updated_at).where(
        and_(
            Court.status == "approved",
            Court.is_active == True,  # noqa: E712
            Court.slug.isnot(None),
        )
    )
    rows = (await session.execute(q)).all()
    return [
        {
            "slug": slug,
            "updated_at": updated_at.isoformat() if updated_at else None,
        }
        for slug, updated_at in rows
    ]
