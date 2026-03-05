"""Court route handlers (admin CRUD + discovery)."""

import asyncio
import logging
import uuid
from enum import Enum
from typing import List, Optional

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Query,
    Request,
    UploadFile,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.routes import limiter
from backend.database.db import get_db_session
from backend.services import (
    data_service,
    court_service,
    court_photo_service,
    s3_service,
    geocoding_service,
)
from backend.api.auth_dependencies import (
    require_system_admin,
    require_verified_player,
    require_court_owner_or_admin,
)
from backend.database.models import Court, CourtEditSuggestion
from backend.models.schemas import (
    CreateCourtRequest,
    UpdateCourtRequest,
    CreateReviewRequest,
    UpdateReviewRequest,
    ReviewActionResponse,
    CourtEditSuggestionRequest,
    CourtEditSuggestionResponse,
    CourtPhotoUploadResponse,
    ReorderCourtPhotosRequest,
)

logger = logging.getLogger(__name__)
router = APIRouter()


class SuggestionAction(str, Enum):
    """Allowed actions for resolving a court edit suggestion."""

    APPROVED = "approved"
    REJECTED = "rejected"


# ---------------------------------------------------------------------------
# Admin court CRUD
# ---------------------------------------------------------------------------


@router.post("/api/courts")
async def create_court(
    request: Request,
    user: dict = Depends(require_system_admin),
    session: AsyncSession = Depends(get_db_session),
):
    """Create a court (system_admin)."""
    try:
        body = await request.json()
        court = await data_service.create_court(
            session=session,
            name=body["name"],
            address=body.get("address"),
            location_id=body["location_id"],
            geoJson=body.get("geoJson"),
        )
        return court
    except KeyError as e:
        raise HTTPException(status_code=400, detail=f"Missing required field: {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating court: {str(e)}")


@router.get("/api/courts")
async def list_courts(
    location_id: Optional[str] = None, session: AsyncSession = Depends(get_db_session)
):
    """List courts, optionally filtered by location (public)."""
    try:
        return await data_service.list_courts(session, location_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error listing courts: {str(e)}")


@router.get("/api/courts/placeholder")
async def get_placeholder_court(
    location_id: str = Query(..., description="Location ID to look up placeholder court"),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Return the placeholder "Other / Private Court" for a location.

    No auth required. Returns {id, name, location_id} or 404.
    """
    result = await court_service.get_placeholder_court(session, location_id)
    if not result:
        raise HTTPException(status_code=404, detail="No placeholder court for this location")
    return result


@router.put("/api/courts/{court_id}")
async def update_court(
    court_id: int,
    request: Request,
    user: dict = Depends(require_system_admin),
    session: AsyncSession = Depends(get_db_session),
):
    """Update a court (system_admin)."""
    try:
        body = await request.json()
        court = await data_service.update_court(
            session=session,
            court_id=court_id,
            name=body.get("name"),
            address=body.get("address"),
            location_id=body.get("location_id"),
            geoJson=body.get("geoJson"),
        )
        if not court:
            raise HTTPException(status_code=404, detail="Court not found")
        return court
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating court: {str(e)}")


@router.delete("/api/courts/{court_id}")
async def delete_court(
    court_id: int,
    user: dict = Depends(require_system_admin),
    session: AsyncSession = Depends(get_db_session),
):
    """Delete a court (system_admin)."""
    try:
        success = await data_service.delete_court(session, court_id)
        if not success:
            raise HTTPException(status_code=404, detail="Court not found")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting court: {str(e)}")


# ---------------------------------------------------------------------------
# Court Discovery — authenticated endpoints
# ---------------------------------------------------------------------------


@router.post("/api/courts/submit", response_model=dict)
@limiter.limit("10/minute")
async def submit_court(
    request: Request,
    payload: CreateCourtRequest,
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Submit a new court for admin approval (verified player).

    Court is created with status='pending'. Geocodes address if no lat/lng provided.
    """
    try:
        lat, lng = payload.latitude, payload.longitude
        if lat is None or lng is None:
            lat, lng = await geocoding_service.geocode_address(payload.address)

        result = await court_service.create_court(
            session,
            name=payload.name,
            address=payload.address,
            location_id=payload.location_id,
            created_by_player_id=user["player_id"],
            status="pending",
            description=payload.description,
            court_count=payload.court_count,
            surface_type=payload.surface_type,
            is_free=payload.is_free,
            cost_info=payload.cost_info,
            has_lights=payload.has_lights,
            has_restrooms=payload.has_restrooms,
            has_parking=payload.has_parking,
            parking_info=payload.parking_info,
            nets_provided=payload.nets_provided,
            hours=payload.hours,
            phone=payload.phone,
            website=payload.website,
            latitude=lat,
            longitude=lng,
        )
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error submitting court: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Error submitting court")


@router.put("/api/courts/{court_id}/update", response_model=dict)
async def update_court_discovery(
    court_id: int,
    payload: UpdateCourtRequest,
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Update court info (creator or system admin).

    Only the court creator or a system admin can update court fields.
    """
    try:
        await require_court_owner_or_admin(session, court_id, user)

        result = await court_service.update_court_fields(
            session,
            court_id,
            updater_player_id=user["player_id"],
            **payload.model_dump(exclude_unset=True),
        )
        if not result:
            raise HTTPException(status_code=404, detail="Court not found")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error updating court: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Error updating court")


# --- Reviews ---


@router.post("/api/courts/{court_id}/reviews", response_model=ReviewActionResponse)
@limiter.limit("10/minute")
async def create_court_review(
    request: Request,
    court_id: int,
    payload: CreateReviewRequest,
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Create a review for a court (verified player, one per court).

    Star rating 1-5 required. Text and tags are optional.
    """
    try:
        result = await court_service.create_review(
            session,
            court_id=court_id,
            player_id=user["player_id"],
            rating=payload.rating,
            review_text=payload.review_text,
            tag_ids=payload.tag_ids or [],
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error creating review: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Error creating review")


@router.put("/api/courts/{court_id}/reviews/{review_id}", response_model=ReviewActionResponse)
async def update_court_review(
    court_id: int,
    review_id: int,
    payload: UpdateReviewRequest,
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    """Update an existing review (author only)."""
    try:
        result = await court_service.update_review(
            session,
            review_id=review_id,
            player_id=user["player_id"],
            rating=payload.rating,
            review_text=payload.review_text,
            tag_ids=payload.tag_ids,
        )
        if not result:
            raise HTTPException(status_code=404, detail="Review not found or not authorized")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error updating review: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Error updating review")


@router.delete("/api/courts/{court_id}/reviews/{review_id}", response_model=ReviewActionResponse)
async def delete_court_review(
    court_id: int,
    review_id: int,
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Delete a review (author only).

    Triggers async S3 photo cleanup if photos were attached.
    """
    try:
        result = await court_service.delete_review(
            session,
            review_id=review_id,
            player_id=user["player_id"],
        )
        if not result:
            raise HTTPException(status_code=404, detail="Review not found or not authorized")

        # Concurrent S3 photo cleanup
        photo_keys = result.pop("photo_s3_keys", [])
        if photo_keys:
            delete_tasks = [asyncio.to_thread(s3_service.delete_file, key) for key in photo_keys]
            results = await asyncio.gather(*delete_tasks, return_exceptions=True)
            for key, res in zip(photo_keys, results):
                if isinstance(res, Exception):
                    logger.error("Failed to delete S3 photo: %s — %s", key, res, exc_info=True)

        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error deleting review: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Error deleting review")


@router.post("/api/courts/{court_id}/reviews/{review_id}/photos", response_model=dict)
@limiter.limit("20/minute")
async def upload_review_photo(
    request: Request,
    court_id: int,
    review_id: int,
    file: UploadFile = File(...),
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Upload a photo to a review (author only, max 3 per review).

    Photos are resized to max 1200px and converted to JPEG 85%.
    Two-step: create review first, then upload photos separately.
    """
    try:
        # Process and upload
        processed = await court_photo_service.process_court_photo(file)
        s3_key = f"court-photos/{court_id}/{review_id}/{uuid.uuid4()}.jpg"
        url = await asyncio.to_thread(s3_service.upload_file, processed, s3_key, "image/jpeg")

        try:
            result = await court_service.add_review_photo(
                session,
                review_id=review_id,
                player_id=user["player_id"],
                s3_key=s3_key,
                url=url,
            )
            if not result:
                raise HTTPException(status_code=404, detail="Review not found or not authorized")
            return result
        except Exception:
            # Clean up orphaned S3 object if DB record creation fails
            try:
                await asyncio.to_thread(s3_service.delete_file, s3_key)
            except Exception as cleanup_err:
                logger.warning("Failed to clean up S3 object %s: %s", s3_key, cleanup_err)
            raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error uploading review photo: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Error uploading photo")


# --- Standalone court photos ---


@router.post("/api/courts/{court_id}/photos", response_model=CourtPhotoUploadResponse)
@limiter.limit("20/minute")
async def upload_court_photo(
    request: Request,
    court_id: int,
    file: UploadFile = File(...),
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Upload a standalone photo to a court.

    Photos are resized to max 1200px and converted to JPEG 85%.
    Requires a verified player account.
    """
    try:
        # Verify court exists before processing/uploading to avoid orphaned S3 objects
        court = await session.get(Court, court_id)
        if not court:
            raise HTTPException(status_code=404, detail="Court not found")

        processed = await court_photo_service.process_court_photo(file)
        s3_key = f"court-photos/{court_id}/{uuid.uuid4()}.jpg"
        url = await asyncio.to_thread(s3_service.upload_file, processed, s3_key, "image/jpeg")

        try:
            result = await court_service.add_court_photo(
                session,
                court_id=court_id,
                player_id=user["player_id"],
                s3_key=s3_key,
                url=url,
            )
            return result
        except Exception:
            # Clean up orphaned S3 object if DB record creation fails
            try:
                await asyncio.to_thread(s3_service.delete_file, s3_key)
            except Exception as cleanup_err:
                logger.warning("Failed to clean up S3 object %s: %s", s3_key, cleanup_err)
            raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error uploading court photo: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Error uploading photo")


# --- Edit suggestions ---


@router.post("/api/courts/{court_id}/suggest-edit", response_model=dict)
@limiter.limit("10/minute")
async def suggest_court_edit(
    request: Request,
    court_id: int,
    payload: CourtEditSuggestionRequest,
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    """Submit an edit suggestion for a court (verified player)."""
    try:
        result = await court_service.create_edit_suggestion(
            session,
            court_id=court_id,
            suggested_by_player_id=user["player_id"],
            changes=payload.changes,
        )
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error creating edit suggestion: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Error creating suggestion")


@router.get("/api/courts/{court_id}/suggestions", response_model=List[CourtEditSuggestionResponse])
async def list_court_edit_suggestions(
    court_id: int,
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    """List edit suggestions for a court (creator or admin)."""
    try:
        await require_court_owner_or_admin(session, court_id, user)
        return await court_service.list_edit_suggestions(session, court_id)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error listing suggestions: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Error listing suggestions")


@router.put("/api/courts/suggestions/{suggestion_id}", response_model=dict)
async def resolve_court_edit_suggestion(
    suggestion_id: int,
    action: SuggestionAction = Query(...),
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    """Approve or reject an edit suggestion (court creator or admin)."""
    try:
        # Look up the suggestion to find its court, then verify ownership
        suggestion_result = await session.execute(
            select(CourtEditSuggestion.court_id).where(CourtEditSuggestion.id == suggestion_id)
        )
        court_id = suggestion_result.scalar_one_or_none()
        if court_id is None:
            raise HTTPException(status_code=404, detail="Suggestion not found")

        await require_court_owner_or_admin(session, court_id, user)

        result = await court_service.resolve_edit_suggestion(
            session,
            suggestion_id=suggestion_id,
            action=action.value,
            reviewer_player_id=user["player_id"],
        )
        if not result:
            raise HTTPException(status_code=404, detail="Suggestion not found")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error resolving suggestion: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Error resolving suggestion")


# --- Admin court management ---


@router.get("/api/admin-view/courts/pending", response_model=list)
async def list_pending_courts(
    user: dict = Depends(require_system_admin),
    session: AsyncSession = Depends(get_db_session),
):
    """List all pending court submissions for admin review."""
    return await court_service.list_pending_courts(session)


@router.put("/api/admin-view/courts/{court_id}/approve", response_model=dict)
async def approve_court(
    court_id: int,
    user: dict = Depends(require_system_admin),
    session: AsyncSession = Depends(get_db_session),
):
    """Approve a pending court submission (system admin)."""
    result = await court_service.approve_court(session, court_id)
    if not result:
        raise HTTPException(status_code=404, detail="Court not found")
    return result


@router.put("/api/admin-view/courts/{court_id}/reject", response_model=dict)
async def reject_court(
    court_id: int,
    user: dict = Depends(require_system_admin),
    session: AsyncSession = Depends(get_db_session),
):
    """Reject a pending court submission (system admin)."""
    result = await court_service.reject_court(session, court_id)
    if not result:
        raise HTTPException(status_code=404, detail="Court not found")
    return result


@router.get("/api/admin-view/courts/suggestions", response_model=dict)
async def list_all_suggestions_admin(
    status: Optional[str] = Query("pending"),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    user: dict = Depends(require_system_admin),
    session: AsyncSession = Depends(get_db_session),
):
    """List all court edit suggestions with status filter and pagination (system admin)."""
    return await court_service.list_all_suggestions_admin(
        session, status=status, page=page, page_size=page_size
    )


@router.delete("/api/admin-view/courts/photos/{photo_id}", response_model=dict)
async def admin_delete_court_photo(
    photo_id: int,
    user: dict = Depends(require_system_admin),
    session: AsyncSession = Depends(get_db_session),
):
    """Delete a standalone court photo (system admin)."""
    try:
        s3_key = await court_service.admin_delete_court_photo(session, photo_id)
        if s3_key is None:
            raise HTTPException(status_code=404, detail="Photo not found")

        # S3 cleanup
        try:
            await asyncio.to_thread(s3_service.delete_file, s3_key)
        except Exception as e:
            logger.error("Failed to delete S3 photo %s: %s", s3_key, e, exc_info=True)

        return {"photo_id": photo_id, "deleted": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error deleting court photo: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Error deleting photo")


@router.put("/api/admin-view/courts/{court_id}/photos/reorder", response_model=list)
async def reorder_court_photos(
    court_id: int,
    payload: ReorderCourtPhotosRequest,
    user: dict = Depends(require_system_admin),
    session: AsyncSession = Depends(get_db_session),
):
    """Reorder standalone court photos (system admin)."""
    try:
        return await court_service.reorder_court_photos(session, court_id, payload.photo_ids)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error reordering court photos: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Error reordering photos")


@router.delete("/api/admin-view/courts/reviews/{review_id}", response_model=dict)
async def admin_delete_court_review(
    review_id: int,
    user: dict = Depends(require_system_admin),
    session: AsyncSession = Depends(get_db_session),
):
    """Delete any court review (system admin). Cleans up S3 photos."""
    try:
        result = await court_service.admin_delete_review(session, review_id=review_id)
        if not result:
            raise HTTPException(status_code=404, detail="Review not found")

        # Concurrent S3 photo cleanup
        photo_keys = result.pop("photo_s3_keys", [])
        if photo_keys:
            delete_tasks = [asyncio.to_thread(s3_service.delete_file, key) for key in photo_keys]
            results = await asyncio.gather(*delete_tasks, return_exceptions=True)
            for key, res in zip(photo_keys, results):
                if isinstance(res, Exception):
                    logger.error("Failed to delete S3 photo: %s — %s", key, res, exc_info=True)

        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error deleting review: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Error deleting review")


@router.get("/api/admin-view/courts", response_model=dict)
async def list_all_courts_admin(
    search: Optional[str] = Query(None),
    region_id: Optional[str] = Query(None),
    location_id: Optional[str] = Query(None),
    sort_by: Optional[str] = Query(None),
    sort_dir: Optional[str] = Query("desc"),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    user: dict = Depends(require_system_admin),
    session: AsyncSession = Depends(get_db_session),
):
    """List all courts with search, filters, sorting, and pagination (system admin)."""
    return await court_service.list_all_courts_admin(
        session,
        search=search,
        region_id=region_id,
        location_id=location_id,
        sort_by=sort_by,
        sort_dir=sort_dir,
        page=page,
        page_size=page_size,
    )
