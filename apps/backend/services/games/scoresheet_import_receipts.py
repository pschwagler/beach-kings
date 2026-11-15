"""Read authorized, durable import receipts before consulting expiring drafts."""

from sqlalchemy import select

from backend.database.models import PhotoMatchJob


async def confirmed_import(session, draft_id, *, league_id=None, user_id=None):
    query = select(PhotoMatchJob.import_result).where(PhotoMatchJob.session_id == draft_id)
    if league_id is not None:
        query = query.where(PhotoMatchJob.league_id == league_id)
    else:
        query = query.where(PhotoMatchJob.league_id.is_(None), PhotoMatchJob.user_id == user_id)
    receipt = await session.scalar(query.order_by(PhotoMatchJob.id).limit(1))
    if not receipt:
        return None
    ids = receipt["match_ids"]
    return {
        "status": "success",
        "message": "Matches already created",
        "match_ids": ids,
        "matches_created": len(ids),
        "session_id": receipt["session_id"],
    }
