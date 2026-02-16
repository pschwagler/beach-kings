"""
Tests for court_service — court CRUD, slug generation, nearby courts,
review CRUD, rating recalculation, edit suggestions.
"""

import pytest
import pytest_asyncio
from sqlalchemy import select

from backend.database.models import (
    Court,
    CourtReview,
    CourtReviewPhoto,
    CourtTag,
    Location,
    Player,
    Region,
)
from backend.services import court_service
from backend.services import user_service
import bcrypt


# ============================================================================
# Fixtures
# ============================================================================


@pytest_asyncio.fixture
async def region(db_session):
    """Create a test region."""
    r = Region(id="test_region", name="Test Region")
    db_session.add(r)
    await db_session.commit()
    await db_session.refresh(r)
    return r


@pytest_asyncio.fixture
async def location(db_session, region):
    """Create a test location."""
    loc = Location(
        id="test_loc",
        name="Test City",
        slug="test-city",
        city="Test City",
        state="TS",
        region_id=region.id,
    )
    db_session.add(loc)
    await db_session.commit()
    await db_session.refresh(loc)
    return loc


@pytest_asyncio.fixture
async def test_user(db_session):
    """Create a test user."""
    password_hash = bcrypt.hashpw("test_password".encode(), bcrypt.gensalt()).decode()
    user_id = await user_service.create_user(
        session=db_session,
        phone_number="+15559990001",
        password_hash=password_hash,
        email="court_test@example.com",
    )
    return {"id": user_id, "phone_number": "+15559990001"}


@pytest_asyncio.fixture
async def test_player(db_session, test_user, location):
    """Create a test player."""
    player = Player(
        full_name="Court Tester",
        user_id=test_user["id"],
        location_id=location.id,
    )
    db_session.add(player)
    await db_session.commit()
    await db_session.refresh(player)
    return player


@pytest_asyncio.fixture
async def second_player(db_session, location):
    """Create a second player for multi-review tests."""
    password_hash = bcrypt.hashpw("test_password2".encode(), bcrypt.gensalt()).decode()
    user_id = await user_service.create_user(
        session=db_session,
        phone_number="+15559990002",
        password_hash=password_hash,
        email="court_test2@example.com",
    )
    player = Player(
        full_name="Second Reviewer",
        user_id=user_id,
        location_id=location.id,
    )
    db_session.add(player)
    await db_session.commit()
    await db_session.refresh(player)
    return player


@pytest_asyncio.fixture
async def court(db_session, location, test_player):
    """Create an approved court."""
    result = await court_service.create_court(
        session=db_session,
        name="Test Beach Courts",
        address="123 Test St, Test City, TS",
        location_id=location.id,
        court_count=4,
        surface_type="sand",
        is_free=True,
        has_lights=True,
        has_restrooms=False,
        has_parking=True,
        nets_provided=True,
        created_by_player_id=test_player.id,
        status="approved",
    )
    return result


@pytest_asyncio.fixture
async def tags(db_session):
    """Create test tags."""
    tag_data = [
        CourtTag(name="Great Sand", slug="great-sand", category="quality"),
        CourtTag(name="Competitive", slug="competitive", category="vibe"),
        CourtTag(name="Good Nets", slug="good-nets", category="facility"),
    ]
    db_session.add_all(tag_data)
    await db_session.commit()
    for t in tag_data:
        await db_session.refresh(t)
    return tag_data


# ============================================================================
# Slug Tests
# ============================================================================


class TestSlugGeneration:
    """Tests for _slugify and _generate_unique_slug."""

    def test_slugify_basic(self):
        """Basic text is slugified correctly."""
        assert court_service._slugify("Test Beach Courts") == "test-beach-courts"

    def test_slugify_special_chars(self):
        """Special characters are removed."""
        assert court_service._slugify("Pier 25 (Manhattan)") == "pier-25-manhattan"

    def test_slugify_accents(self):
        """Accented characters are normalized."""
        assert court_service._slugify("Café Beach") == "cafe-beach"

    def test_slugify_multiple_spaces(self):
        """Multiple spaces become single hyphens."""
        assert court_service._slugify("Test   Multiple   Spaces") == "test-multiple-spaces"

    @pytest.mark.asyncio
    async def test_unique_slug_with_city(self, db_session, location):
        """Slug appends city when no conflict."""
        slug = await court_service._generate_unique_slug(db_session, "Test Court", "Test City")
        assert slug == "test-court-test-city"

    @pytest.mark.asyncio
    async def test_unique_slug_dedup(self, db_session, location):
        """Duplicate slugs get numeric suffix."""
        # Create first court
        court1 = Court(
            name="Dup Court", slug="dup-court-test-city",
            location_id=location.id, status="approved",
        )
        db_session.add(court1)
        await db_session.commit()

        slug = await court_service._generate_unique_slug(db_session, "Dup Court", "Test City")
        assert slug == "dup-court-test-city-1"


# ============================================================================
# Court CRUD Tests
# ============================================================================


class TestCourtCRUD:
    """Tests for court creation, listing, and retrieval."""

    @pytest.mark.asyncio
    async def test_create_court(self, db_session, location, test_player):
        """Creating a court returns expected fields."""
        result = await court_service.create_court(
            session=db_session,
            name="New Court",
            address="456 New St",
            location_id=location.id,
            court_count=2,
            surface_type="sand",
            created_by_player_id=test_player.id,
            status="pending",
        )
        assert result["name"] == "New Court"
        assert result["status"] == "pending"
        assert result["slug"] is not None

    @pytest.mark.asyncio
    async def test_create_court_approved(self, db_session, location, test_player):
        """Admin-created court has status approved."""
        result = await court_service.create_court(
            session=db_session,
            name="Admin Court",
            address="789 Admin Ave",
            location_id=location.id,
            created_by_player_id=test_player.id,
            status="approved",
        )
        assert result["status"] == "approved"

    @pytest.mark.asyncio
    async def test_list_courts_public(self, db_session, court, location):
        """Public listing returns only approved courts."""
        # Create a pending court
        c = Court(
            name="Pending", slug="pending-court",
            location_id=location.id, status="pending",
        )
        db_session.add(c)
        await db_session.commit()

        result = await court_service.list_courts_public(db_session)
        slugs = [item["slug"] for item in result["items"]]
        assert court["slug"] in slugs
        assert "pending-court" not in slugs

    @pytest.mark.asyncio
    async def test_list_courts_filter_surface(self, db_session, court, location):
        """Filtering by surface_type works."""
        # Create a grass court
        c = Court(
            name="Grass Place", slug="grass-place",
            location_id=location.id, status="approved",
            surface_type="grass", is_active=True,
        )
        db_session.add(c)
        await db_session.commit()

        result = await court_service.list_courts_public(db_session, surface_type="grass")
        assert len(result["items"]) == 1
        assert result["items"][0]["slug"] == "grass-place"

    @pytest.mark.asyncio
    async def test_list_courts_filter_free(self, db_session, court):
        """Filtering by is_free works."""
        result = await court_service.list_courts_public(db_session, is_free=True)
        assert len(result["items"]) >= 1
        for item in result["items"]:
            assert item["is_free"] is True

    @pytest.mark.asyncio
    async def test_get_court_by_slug(self, db_session, court):
        """Getting court by slug returns detail with reviews."""
        detail = await court_service.get_court_by_slug(db_session, court["slug"])
        assert detail is not None
        assert detail["name"] == "Test Beach Courts"
        assert "reviews" in detail
        assert "all_photos" in detail

    @pytest.mark.asyncio
    async def test_get_court_by_slug_not_found(self, db_session):
        """Nonexistent slug returns None."""
        result = await court_service.get_court_by_slug(db_session, "no-such-court")
        assert result is None

    @pytest.mark.asyncio
    async def test_update_court_fields(self, db_session, court):
        """Updating court fields persists changes."""
        updated = await court_service.update_court_fields(
            db_session, court["id"],
            description="Updated desc",
            court_count=6,
        )
        assert updated is not None

        # Verify through full detail fetch
        detail = await court_service.get_court_by_slug(db_session, court["slug"])
        assert detail["description"] == "Updated desc"
        assert detail["court_count"] == 6


# ============================================================================
# Admin Tests
# ============================================================================


class TestAdminCourts:
    """Tests for admin approval/rejection of courts."""

    @pytest.mark.asyncio
    async def test_approve_court(self, db_session, location, test_player):
        """Approving a pending court changes status."""
        result = await court_service.create_court(
            db_session,
            name="Pending Court",
            address="100 Pending St",
            location_id=location.id,
            created_by_player_id=test_player.id,
            status="pending",
        )
        approved = await court_service.approve_court(db_session, result["id"])
        assert approved is not None
        assert approved["status"] == "approved"

    @pytest.mark.asyncio
    async def test_reject_court(self, db_session, location, test_player):
        """Rejecting a pending court changes status."""
        result = await court_service.create_court(
            db_session,
            name="Bad Court",
            address="200 Bad St",
            location_id=location.id,
            created_by_player_id=test_player.id,
            status="pending",
        )
        rejected = await court_service.reject_court(db_session, result["id"])
        assert rejected is not None
        assert rejected["status"] == "rejected"

    @pytest.mark.asyncio
    async def test_list_pending_courts(self, db_session, location, test_player):
        """Pending courts listing returns only pending status."""
        await court_service.create_court(
            db_session,
            name="Pending 1",
            address="10 Pending Ave",
            location_id=location.id,
            created_by_player_id=test_player.id,
            status="pending",
        )
        await court_service.create_court(
            db_session,
            name="Approved 1",
            address="20 Approved Ave",
            location_id=location.id,
            created_by_player_id=test_player.id,
            status="approved",
        )

        pending = await court_service.list_pending_courts(db_session)
        assert all(c["status"] == "pending" for c in pending)
        names = [c["name"] for c in pending]
        assert "Pending 1" in names
        assert "Approved 1" not in names


# ============================================================================
# Nearby Courts Tests
# ============================================================================


class TestNearbyCourts:
    """Tests for nearby court discovery."""

    @pytest.mark.asyncio
    async def test_nearby_courts(self, db_session, location):
        """Nearby courts returns courts within radius, sorted by distance."""
        # Create two courts at known positions (NYC area)
        court1 = Court(
            name="Close Court", slug="close-court",
            location_id=location.id, status="approved", is_active=True,
            latitude=40.73, longitude=-74.00,
        )
        court2 = Court(
            name="Far Court", slug="far-court",
            location_id=location.id, status="approved", is_active=True,
            latitude=40.80, longitude=-73.95,
        )
        court3 = Court(
            name="Very Far Court", slug="very-far",
            location_id=location.id, status="approved", is_active=True,
            latitude=42.00, longitude=-72.00,  # ~150 miles away
        )
        db_session.add_all([court1, court2, court3])
        await db_session.commit()

        nearby = await court_service.get_nearby_courts(
            db_session, lat=40.73, lng=-74.00, radius_miles=25
        )
        names = [c["name"] for c in nearby]
        assert "Close Court" in names
        assert "Far Court" in names
        assert "Very Far Court" not in names  # Outside 25mi radius

    @pytest.mark.asyncio
    async def test_nearby_excludes_court(self, db_session, location):
        """Exclude parameter filters out a specific court."""
        court1 = Court(
            name="Court A", slug="court-a",
            location_id=location.id, status="approved", is_active=True,
            latitude=40.73, longitude=-74.00,
        )
        court2 = Court(
            name="Court B", slug="court-b",
            location_id=location.id, status="approved", is_active=True,
            latitude=40.735, longitude=-73.99,
        )
        db_session.add_all([court1, court2])
        await db_session.commit()
        await db_session.refresh(court1)

        nearby = await court_service.get_nearby_courts(
            db_session, lat=40.73, lng=-74.00, radius_miles=25, exclude_court_id=court1.id
        )
        names = [c["name"] for c in nearby]
        assert "Court A" not in names
        assert "Court B" in names


# ============================================================================
# Review CRUD Tests
# ============================================================================


class TestReviewCRUD:
    """Tests for review creation, update, deletion, and rating recalculation."""

    @pytest.mark.asyncio
    async def test_create_review(self, db_session, court, test_player):
        """Creating a review returns expected data and updates court stats."""
        result = await court_service.create_review(
            session=db_session,
            court_id=court["id"],
            player_id=test_player.id,
            rating=4,
            review_text="Great courts!",
            tag_ids=[],
        )
        assert result["review_id"] is not None
        assert result["average_rating"] == 4.0
        assert result["review_count"] == 1

    @pytest.mark.asyncio
    async def test_create_review_with_tags(self, db_session, court, test_player, tags):
        """Review with tags attaches them correctly."""
        tag_ids = [tags[0].id, tags[1].id]
        result = await court_service.create_review(
            session=db_session,
            court_id=court["id"],
            player_id=test_player.id,
            rating=5,
            tag_ids=tag_ids,
        )
        assert result["review_id"] is not None

        # Verify tags were attached
        review_id = result["review_id"]
        detail = await court_service.get_court_by_slug(db_session, court["slug"])
        review = next((r for r in detail["reviews"] if r["id"] == review_id), None)
        assert review is not None
        assert len(review["tags"]) == 2

    @pytest.mark.asyncio
    async def test_duplicate_review_fails(self, db_session, court, test_player):
        """Cannot create two reviews for same court by same player."""
        await court_service.create_review(
            session=db_session,
            court_id=court["id"],
            player_id=test_player.id,
            rating=4,
        )

        with pytest.raises(ValueError, match="already reviewed"):
            await court_service.create_review(
                session=db_session,
                court_id=court["id"],
                player_id=test_player.id,
                rating=5,
            )

    @pytest.mark.asyncio
    async def test_update_review(self, db_session, court, test_player):
        """Updating a review changes rating and recalculates average."""
        create_result = await court_service.create_review(
            session=db_session,
            court_id=court["id"],
            player_id=test_player.id,
            rating=3,
        )

        update_result = await court_service.update_review(
            session=db_session,
            review_id=create_result["review_id"],
            player_id=test_player.id,
            rating=5,
            review_text="Changed my mind!",
        )
        assert update_result["average_rating"] == 5.0

    @pytest.mark.asyncio
    async def test_update_review_wrong_player(self, db_session, court, test_player, second_player):
        """Cannot update someone else's review — returns None."""
        create_result = await court_service.create_review(
            session=db_session,
            court_id=court["id"],
            player_id=test_player.id,
            rating=4,
        )

        result = await court_service.update_review(
            session=db_session,
            review_id=create_result["review_id"],
            player_id=second_player.id,
            rating=1,
        )
        assert result is None

    @pytest.mark.asyncio
    async def test_delete_review(self, db_session, court, test_player):
        """Deleting a review removes it and recalculates stats."""
        create_result = await court_service.create_review(
            session=db_session,
            court_id=court["id"],
            player_id=test_player.id,
            rating=4,
        )

        delete_result = await court_service.delete_review(
            session=db_session,
            review_id=create_result["review_id"],
            player_id=test_player.id,
        )
        assert delete_result["review_count"] == 0
        assert delete_result["average_rating"] is None

    @pytest.mark.asyncio
    async def test_delete_review_wrong_player(self, db_session, court, test_player, second_player):
        """Cannot delete someone else's review — returns None."""
        create_result = await court_service.create_review(
            session=db_session,
            court_id=court["id"],
            player_id=test_player.id,
            rating=4,
        )

        result = await court_service.delete_review(
            session=db_session,
            review_id=create_result["review_id"],
            player_id=second_player.id,
        )
        assert result is None

    @pytest.mark.asyncio
    async def test_rating_recalculation(self, db_session, court, test_player, second_player):
        """Average rating is correctly recalculated after multiple reviews."""
        await court_service.create_review(
            session=db_session,
            court_id=court["id"],
            player_id=test_player.id,
            rating=4,
        )
        result = await court_service.create_review(
            session=db_session,
            court_id=court["id"],
            player_id=second_player.id,
            rating=2,
        )
        # (4 + 2) / 2 = 3.0
        assert result["average_rating"] == 3.0
        assert result["review_count"] == 2


# ============================================================================
# Review Photos Tests
# ============================================================================


class TestReviewPhotos:
    """Tests for review photo limits."""

    @pytest.mark.asyncio
    async def test_add_photo_within_limit(self, db_session, court, test_player):
        """Adding a photo within the 3-photo limit succeeds."""
        create_result = await court_service.create_review(
            session=db_session,
            court_id=court["id"],
            player_id=test_player.id,
            rating=5,
        )
        review_id = create_result["review_id"]

        photo = await court_service.add_review_photo(
            session=db_session,
            review_id=review_id,
            player_id=test_player.id,
            url="https://s3.example.com/photo1.jpg",
            s3_key="court-photos/1/1/photo1.jpg",
        )
        assert photo is not None
        assert photo["url"] == "https://s3.example.com/photo1.jpg"

    @pytest.mark.asyncio
    async def test_max_photos_enforced(self, db_session, court, test_player):
        """Cannot add more than MAX_PHOTOS_PER_REVIEW photos."""
        create_result = await court_service.create_review(
            session=db_session,
            court_id=court["id"],
            player_id=test_player.id,
            rating=5,
        )
        review_id = create_result["review_id"]

        # Add 3 photos (the maximum)
        for i in range(3):
            await court_service.add_review_photo(
                session=db_session,
                review_id=review_id,
                player_id=test_player.id,
                url=f"https://s3.example.com/photo{i}.jpg",
                s3_key=f"court-photos/1/1/photo{i}.jpg",
            )

        # 4th photo should fail
        with pytest.raises(ValueError, match="(?i)maximum"):
            await court_service.add_review_photo(
                session=db_session,
                review_id=review_id,
                player_id=test_player.id,
                url="https://s3.example.com/photo4.jpg",
                s3_key="court-photos/1/1/photo4.jpg",
            )


# ============================================================================
# Edit Suggestion Tests
# ============================================================================


class TestEditSuggestions:
    """Tests for court edit suggestions."""

    @pytest.mark.asyncio
    async def test_create_suggestion(self, db_session, court, test_player):
        """Creating an edit suggestion stores changes."""
        suggestion = await court_service.create_edit_suggestion(
            session=db_session,
            court_id=court["id"],
            suggested_by_player_id=test_player.id,
            changes={"court_count": 6, "hours": "8am-8pm"},
        )
        assert suggestion is not None
        assert suggestion["status"] == "pending"

    @pytest.mark.asyncio
    async def test_approve_suggestion(self, db_session, court, test_player):
        """Approving a suggestion applies changes to the court."""
        suggestion = await court_service.create_edit_suggestion(
            session=db_session,
            court_id=court["id"],
            suggested_by_player_id=test_player.id,
            changes={"court_count": 8, "description": "New description"},
        )

        resolved = await court_service.resolve_edit_suggestion(
            session=db_session,
            suggestion_id=suggestion["id"],
            action="approved",
            reviewer_player_id=test_player.id,
        )
        assert resolved["status"] == "approved"

        # Verify changes were applied
        detail = await court_service.get_court_by_slug(db_session, court["slug"])
        assert detail["court_count"] == 8
        assert detail["description"] == "New description"

    @pytest.mark.asyncio
    async def test_reject_suggestion(self, db_session, court, test_player):
        """Rejecting a suggestion does not apply changes."""
        suggestion = await court_service.create_edit_suggestion(
            session=db_session,
            court_id=court["id"],
            suggested_by_player_id=test_player.id,
            changes={"court_count": 99},
        )

        resolved = await court_service.resolve_edit_suggestion(
            session=db_session,
            suggestion_id=suggestion["id"],
            action="rejected",
            reviewer_player_id=test_player.id,
        )
        assert resolved["status"] == "rejected"

        # Verify changes were NOT applied
        detail = await court_service.get_court_by_slug(db_session, court["slug"])
        assert detail["court_count"] != 99


# ============================================================================
# Tags Tests
# ============================================================================


class TestTags:
    """Tests for court tag retrieval."""

    @pytest.mark.asyncio
    async def test_get_all_tags(self, db_session, tags):
        """Get all tags returns expected tags."""
        result = await court_service.get_all_tags(db_session)
        assert len(result) >= 3
        names = [t["name"] for t in result]
        assert "Great Sand" in names
        assert "Competitive" in names


# ============================================================================
# Sitemap Tests
# ============================================================================


class TestSitemap:
    """Tests for sitemap court data."""

    @pytest.mark.asyncio
    async def test_sitemap_courts(self, db_session, court, location):
        """Sitemap returns approved courts with slugs."""
        # Create a pending court (should not appear)
        c = Court(
            name="Hidden", slug="hidden-court",
            location_id=location.id, status="pending",
        )
        db_session.add(c)
        await db_session.commit()

        sitemap = await court_service.get_sitemap_courts(db_session)
        slugs = [s["slug"] for s in sitemap]
        assert court["slug"] in slugs
        assert "hidden-court" not in slugs
