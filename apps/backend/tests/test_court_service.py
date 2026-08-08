"""
Tests for court_service — court CRUD, slug generation, nearby courts,
review CRUD, rating recalculation, edit suggestions.
"""

import json

import pytest
import pytest_asyncio

from backend.database.models import (
    Court,
    CourtEditSuggestion,
    CourtTag,
    League,
    LeagueHomeCourt,
    LeagueMember,
    Location,
    Player,
    PlayerHomeCourt,
    Region,
)
from backend.services import court_service
from backend.services import player_data
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
            name="Dup Court",
            slug="dup-court-test-city",
            location_id=location.id,
            status="approved",
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
            name="Pending",
            slug="pending-court",
            location_id=location.id,
            status="pending",
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
            name="Grass Place",
            slug="grass-place",
            location_id=location.id,
            status="approved",
            surface_type="grass",
            is_active=True,
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
    async def test_list_courts_filters_by_bounds_and_coordinates(
        self, db_session, court, location
    ):
        """Bounds include in-area courts and exclude both outside and coordinate-less courts."""
        inside = Court(
            name="Inside",
            slug="inside",
            location_id=location.id,
            status="approved",
            is_active=True,
            latitude=40.7,
            longitude=-74.0,
        )
        outside = Court(
            name="Outside",
            slug="outside",
            location_id=location.id,
            status="approved",
            is_active=True,
            latitude=34.0,
            longitude=-118.0,
        )
        db_session.add_all([inside, outside])
        await db_session.commit()

        result = await court_service.list_courts_public(
            db_session, north=41, south=40, east=-73, west=-75
        )

        assert [item["slug"] for item in result["items"]] == ["inside"]
        assert result["total_count"] == 1

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
            db_session,
            court["id"],
            description="Updated desc",
            court_count=6,
        )
        assert updated is not None

        # Verify through full detail fetch
        detail = await court_service.get_court_by_slug(db_session, court["slug"])
        assert detail["description"] == "Updated desc"
        assert detail["court_count"] == 6

    @pytest.mark.asyncio
    async def test_update_court_fields_clears_nullable_conditions(self, db_session, court):
        """Explicit nulls clear condition metadata used by partial approvals."""
        await court_service.update_court_fields(
            db_session,
            court["id"],
            wind_exposure="exposed",
            wind_notes="Afternoon crosswind",
            sand_depth="deep",
            sand_notes="Deep near the net",
        )

        await court_service.update_court_fields(
            db_session,
            court["id"],
            wind_exposure=None,
            wind_notes=None,
            sand_depth=None,
            sand_notes=None,
        )

        detail = await court_service.get_court_by_slug(db_session, court["slug"])
        assert detail["wind_exposure"] is None
        assert detail["wind_notes"] is None
        assert detail["sand_depth"] is None
        assert detail["sand_notes"] is None

    @pytest.mark.asyncio
    async def test_conditions_round_trip_in_list_and_detail(
        self, db_session, location, test_player
    ):
        created = await court_service.create_court(
            db_session,
            name="Conditions Court",
            address="10 Shoreline Dr",
            location_id=location.id,
            created_by_player_id=test_player.id,
            status="approved",
            wind_exposure="mixed",
            wind_notes="Calmer in the morning; crosswind often builds after lunch.",
            sand_depth="deep",
            sand_notes="Deepest near the west baseline.",
            latitude=37.77,
            longitude=-122.51,
        )

        detail = await court_service.get_court_by_slug(db_session, created["slug"])
        assert detail["wind_exposure"] == "mixed"
        assert detail["sand_depth"] == "deep"
        listing = await court_service.list_courts_public(db_session)
        item = next(item for item in listing["items"] if item["id"] == created["id"])
        assert item["wind_notes"].startswith("Calmer")
        assert item["sand_notes"] == "Deepest near the west baseline."


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
            name="Close Court",
            slug="close-court",
            location_id=location.id,
            status="approved",
            is_active=True,
            latitude=40.73,
            longitude=-74.00,
        )
        court2 = Court(
            name="Far Court",
            slug="far-court",
            location_id=location.id,
            status="approved",
            is_active=True,
            latitude=40.80,
            longitude=-73.95,
        )
        court3 = Court(
            name="Very Far Court",
            slug="very-far",
            location_id=location.id,
            status="approved",
            is_active=True,
            latitude=42.00,
            longitude=-72.00,  # ~150 miles away
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
            name="Court A",
            slug="court-a",
            location_id=location.id,
            status="approved",
            is_active=True,
            latitude=40.73,
            longitude=-74.00,
        )
        court2 = Court(
            name="Court B",
            slug="court-b",
            location_id=location.id,
            status="approved",
            is_active=True,
            latitude=40.735,
            longitude=-73.99,
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

    @pytest.mark.asyncio
    async def test_approve_conditions_and_pin_synchronizes_geojson(
        self, db_session, court, test_player
    ):
        suggestion = await court_service.create_edit_suggestion(
            session=db_session,
            court_id=court["id"],
            suggested_by_player_id=test_player.id,
            changes={
                "wind_exposure": "exposed",
                "wind_notes": "Strong onshore wind is common in the afternoon.",
                "sand_depth": "typical",
                "sand_notes": "Consistent depth across both courts.",
                "latitude": 37.7694,
                "longitude": -122.5107,
            },
            note="Pin should sit on the north-end courts.",
        )

        resolved = await court_service.resolve_edit_suggestion(
            session=db_session,
            suggestion_id=suggestion["id"],
            action="approved",
            reviewer_player_id=test_player.id,
        )
        assert resolved["note"] == "Pin should sit on the north-end courts."

        court_row = await db_session.get(Court, court["id"])
        await db_session.refresh(court_row)
        assert court_row.wind_exposure == "exposed"
        assert court_row.sand_depth == "typical"
        assert court_row.latitude == pytest.approx(37.7694)
        assert court_row.longitude == pytest.approx(-122.5107)
        assert json.loads(court_row.geoJson) == {
            "type": "Point",
            "coordinates": [-122.5107, 37.7694],
        }

        admin_items = await court_service.list_all_suggestions_admin(db_session)
        admin_item = next(item for item in admin_items["items"] if item["id"] == suggestion["id"])
        assert admin_item["note"] == "Pin should sit on the north-end courts."
        assert admin_item["current"]["latitude"] == pytest.approx(37.7694)

    @pytest.mark.asyncio
    async def test_partial_resolution_applies_atomic_snapshot_with_null_and_pin(
        self, db_session, court, test_player
    ):
        await court_service.update_court_fields(
            db_session,
            court["id"],
            wind_notes="Outdated wind note",
            sand_depth="shallow",
        )
        suggestion = await court_service.create_edit_suggestion(
            session=db_session,
            court_id=court["id"],
            suggested_by_player_id=test_player.id,
            changes={
                "wind_notes": None,
                "sand_depth": "deep",
                "latitude": 37.7694,
                "longitude": -122.5107,
            },
        )

        selected = {
            "wind_notes": None,
            "sand_depth": "typical",
            "latitude": 37.7694,
            "longitude": -122.5107,
        }
        resolved = await court_service.resolve_edit_suggestion(
            session=db_session,
            suggestion_id=suggestion["id"],
            action="partially_applied",
            reviewer_player_id=test_player.id,
            applied_changes=selected,
        )
        assert resolved["status"] == "partially_applied"
        assert resolved["applied_changes"] == selected

        court_row = await db_session.get(Court, court["id"])
        await db_session.refresh(court_row)
        assert court_row.wind_notes is None
        assert court_row.sand_depth == "typical"
        assert json.loads(court_row.geoJson)["coordinates"] == [-122.5107, 37.7694]

        with pytest.raises(
            court_service.SuggestionResolutionConflictError,
            match="already been resolved",
        ):
            await court_service.resolve_edit_suggestion(
                session=db_session,
                suggestion_id=suggestion["id"],
                action="rejected",
                reviewer_player_id=test_player.id,
            )

        stored = await db_session.get(CourtEditSuggestion, suggestion["id"])
        assert stored.status == "partially_applied"
        assert stored.applied_changes == selected

    @pytest.mark.asyncio
    async def test_partial_resolution_rejects_changes_not_in_proposal(
        self, db_session, court, test_player
    ):
        suggestion = await court_service.create_edit_suggestion(
            session=db_session,
            court_id=court["id"],
            suggested_by_player_id=test_player.id,
            changes={"sand_depth": "deep"},
        )

        with pytest.raises(
            court_service.SuggestionResolutionValidationError,
            match="selected from",
        ):
            await court_service.resolve_edit_suggestion(
                session=db_session,
                suggestion_id=suggestion["id"],
                action="partially_applied",
                reviewer_player_id=test_player.id,
                applied_changes={"wind_exposure": "mixed"},
            )

        stored = await db_session.get(CourtEditSuggestion, suggestion["id"])
        assert stored.status == "pending"
        assert stored.applied_changes is None

    @pytest.mark.asyncio
    async def test_approve_revalidates_legacy_stored_changes(self, db_session, court, test_player):
        suggestion = await court_service.create_edit_suggestion(
            session=db_session,
            court_id=court["id"],
            suggested_by_player_id=test_player.id,
            changes={"latitude": 37.7},
        )

        with pytest.raises(
            court_service.SuggestionResolutionValidationError,
            match="Stored suggestion changes are invalid",
        ):
            await court_service.resolve_edit_suggestion(
                session=db_session,
                suggestion_id=suggestion["id"],
                action="approved",
                reviewer_player_id=test_player.id,
            )

        stored = await db_session.get(CourtEditSuggestion, suggestion["id"])
        assert stored.status == "pending"


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
            name="Hidden",
            slug="hidden-court",
            location_id=location.id,
            status="pending",
        )
        db_session.add(c)
        await db_session.commit()

        sitemap = await court_service.get_sitemap_courts(db_session)
        slugs = [s["slug"] for s in sitemap]
        assert court["slug"] in slugs
        assert "hidden-court" not in slugs


# ============================================================================
# Check-In Tests
# ============================================================================


class TestCheckIn:
    """Tests for court check-in, check-out, and active check-in queries."""

    @pytest.mark.asyncio
    async def test_check_in_creates_record(self, db_session, court, test_player):
        """Checking in returns check-in data with expiry."""
        result = await court_service.check_in(db_session, court["id"], test_player.id)
        assert result["court_id"] == court["id"]
        assert "checked_in_at" in result
        assert "expires_at" in result

    @pytest.mark.asyncio
    async def test_check_in_replaces_previous(self, db_session, court, test_player, location):
        """Checking in to a new court removes old check-in."""
        # Create a second court
        court2 = Court(
            name="Other Court",
            slug="other-court",
            location_id=location.id,
            status="approved",
            is_active=True,
        )
        db_session.add(court2)
        await db_session.commit()
        await db_session.refresh(court2)

        # Check in to first court
        await court_service.check_in(db_session, court["id"], test_player.id)

        # Check in to second court — should remove first
        await court_service.check_in(db_session, court2.id, test_player.id)

        # First court should have 0 active check-ins
        result = await court_service.get_active_check_ins(db_session, court["id"])
        assert result["total"] == 0

        # Second court should have 1
        result2 = await court_service.get_active_check_ins(db_session, court2.id)
        assert result2["total"] == 1

    @pytest.mark.asyncio
    async def test_check_out(self, db_session, court, test_player):
        """Checking out removes the check-in record."""
        await court_service.check_in(db_session, court["id"], test_player.id)
        removed = await court_service.check_out(db_session, court["id"], test_player.id)
        assert removed is True

        result = await court_service.get_active_check_ins(db_session, court["id"])
        assert result["total"] == 0

    @pytest.mark.asyncio
    async def test_check_out_nonexistent(self, db_session, court, test_player):
        """Checking out without a check-in returns False."""
        removed = await court_service.check_out(db_session, court["id"], test_player.id)
        assert removed is False

    @pytest.mark.asyncio
    async def test_get_active_check_ins(self, db_session, court, test_player, second_player):
        """Active check-ins returns aggregate total and breakdown by level/gender (no names)."""
        await court_service.check_in(db_session, court["id"], test_player.id)
        await court_service.check_in(db_session, court["id"], second_player.id)

        result = await court_service.get_active_check_ins(db_session, court["id"])
        assert result["total"] == 2
        assert "breakdown" in result
        # No player identities exposed
        assert "checked_in_players" not in result
        total_from_breakdown = sum(b["count"] for b in result["breakdown"])
        assert total_from_breakdown == 2

    @pytest.mark.asyncio
    async def test_expired_check_ins_excluded(self, db_session, court, test_player):
        """Expired check-ins are not included in active count."""
        from datetime import datetime, timedelta, timezone
        from backend.database.models import CourtCheckIn

        # Create an already-expired check-in
        expired = CourtCheckIn(
            court_id=court["id"],
            player_id=test_player.id,
            checked_in_at=datetime.now(timezone.utc) - timedelta(hours=5),
            expires_at=datetime.now(timezone.utc) - timedelta(hours=1),
        )
        db_session.add(expired)
        await db_session.commit()

        result = await court_service.get_active_check_ins(db_session, court["id"])
        assert result["total"] == 0


# ============================================================================
# Leagues at Court Tests
# ============================================================================


class TestLeaguesAtCourt:
    """Tests for court → league reverse lookup."""

    @pytest.mark.asyncio
    async def test_leagues_at_court(self, db_session, court, location, test_player):
        """Returns public leagues linked to the court."""
        league = League(
            name="Beach League",
            location_id=location.id,
            is_public=True,
            created_by=test_player.id,
        )
        db_session.add(league)
        await db_session.commit()
        await db_session.refresh(league)

        # Link league to court
        link = LeagueHomeCourt(league_id=league.id, court_id=court["id"])
        db_session.add(link)

        # Add a member
        member = LeagueMember(league_id=league.id, player_id=test_player.id, role="member")
        db_session.add(member)
        await db_session.commit()

        result = await court_service.get_leagues_at_court(db_session, court["id"])
        assert len(result) == 1
        assert result[0]["name"] == "Beach League"
        assert result[0]["member_count"] == 1

    @pytest.mark.asyncio
    async def test_private_leagues_excluded(self, db_session, court, location, test_player):
        """Private leagues are not returned."""
        league = League(
            name="Secret League",
            location_id=location.id,
            is_public=False,
            created_by=test_player.id,
        )
        db_session.add(league)
        await db_session.commit()
        await db_session.refresh(league)

        link = LeagueHomeCourt(league_id=league.id, court_id=court["id"])
        db_session.add(link)
        await db_session.commit()

        result = await court_service.get_leagues_at_court(db_session, court["id"])
        assert len(result) == 0

    @pytest.mark.asyncio
    async def test_no_leagues_returns_empty(self, db_session, court):
        """Court with no leagues returns empty list."""
        result = await court_service.get_leagues_at_court(db_session, court["id"])
        assert result == []


# ============================================================================
# Saved Courts ("My Courts")
# ============================================================================


class TestSavedCourts:
    """Tests for saved courts ("My Courts"), backed by player_home_courts."""

    @pytest.mark.asyncio
    async def test_save_court_creates_record(self, db_session, court, test_player):
        """Saving a court records it and is_court_saved reflects it."""
        result = await court_service.save_court(db_session, test_player.id, court["id"])
        assert result == {"court_id": court["id"], "saved": True}
        assert await court_service.is_court_saved(db_session, test_player.id, court["id"]) is True

    @pytest.mark.asyncio
    async def test_save_court_idempotent(self, db_session, court, test_player):
        """Saving the same court twice does not create a duplicate."""
        await court_service.save_court(db_session, test_player.id, court["id"])
        await court_service.save_court(db_session, test_player.id, court["id"])
        ids = await court_service.get_saved_court_ids(db_session, test_player.id)
        assert ids == {court["id"]}

    @pytest.mark.asyncio
    async def test_save_court_missing_raises(self, db_session, test_player):
        """Saving a nonexistent court raises ValueError (mapped to 404 at route)."""
        with pytest.raises(ValueError):
            await court_service.save_court(db_session, test_player.id, 999999)

    @pytest.mark.asyncio
    async def test_unsave_court(self, db_session, court, test_player):
        """Unsaving removes the record."""
        await court_service.save_court(db_session, test_player.id, court["id"])
        result = await court_service.unsave_court(db_session, test_player.id, court["id"])
        assert result == {"court_id": court["id"], "saved": False}
        assert await court_service.is_court_saved(db_session, test_player.id, court["id"]) is False

    @pytest.mark.asyncio
    async def test_unsave_court_idempotent(self, db_session, court, test_player):
        """Unsaving a court that was never saved is a no-op (no error)."""
        result = await court_service.unsave_court(db_session, test_player.id, court["id"])
        assert result == {"court_id": court["id"], "saved": False}

    @pytest.mark.asyncio
    async def test_get_saved_court_ids_subset(self, db_session, court, test_player):
        """get_saved_court_ids restricts to the provided court_ids subset."""
        await court_service.save_court(db_session, test_player.id, court["id"])
        ids = await court_service.get_saved_court_ids(
            db_session, test_player.id, [court["id"], 999999]
        )
        assert ids == {court["id"]}

    @pytest.mark.asyncio
    async def test_get_saved_court_cards(self, db_session, court, test_player):
        """Saved court cards include card fields and is_saved=True."""
        await court_service.save_court(db_session, test_player.id, court["id"])
        cards = await court_service.get_saved_court_cards(db_session, test_player.id)
        assert len(cards) == 1
        assert cards[0]["id"] == court["id"]
        assert cards[0]["is_saved"] is True
        assert "average_rating" in cards[0]
        assert "top_tags" in cards[0]

    @pytest.mark.asyncio
    async def test_list_courts_public_embeds_is_saved(self, db_session, court, test_player):
        """A saved court is flagged is_saved=True in the authenticated list."""
        await court_service.save_court(db_session, test_player.id, court["id"])
        result = await court_service.list_courts_public(db_session, player_id=test_player.id)
        items = {c["id"]: c for c in result["items"]}
        assert items[court["id"]]["is_saved"] is True

    @pytest.mark.asyncio
    async def test_list_courts_public_unsaved_is_false(self, db_session, court, test_player):
        """An unsaved court is flagged is_saved=False for an authenticated caller."""
        result = await court_service.list_courts_public(db_session, player_id=test_player.id)
        items = {c["id"]: c for c in result["items"]}
        assert items[court["id"]]["is_saved"] is False

    @pytest.mark.asyncio
    async def test_list_courts_public_no_player_omits_is_saved(self, db_session, court):
        """Anonymous listing does not include is_saved."""
        result = await court_service.list_courts_public(db_session)
        for item in result["items"]:
            assert "is_saved" not in item

    @pytest.mark.asyncio
    async def test_save_court_pending_raises(self, db_session, location, test_player):
        """Saving a court with status='pending' raises ValueError (same as missing)."""
        pending = Court(
            name="Pending Court",
            slug="pending-save-test",
            location_id=location.id,
            status="pending",
            is_active=True,
        )
        db_session.add(pending)
        await db_session.commit()
        await db_session.refresh(pending)

        with pytest.raises(ValueError, match=str(pending.id)):
            await court_service.save_court(db_session, test_player.id, pending.id)

    @pytest.mark.asyncio
    async def test_save_court_inactive_raises(self, db_session, location, test_player):
        """Saving a court with is_active=False raises ValueError (same as missing)."""
        inactive = Court(
            name="Inactive Court",
            slug="inactive-save-test",
            location_id=location.id,
            status="approved",
            is_active=False,
        )
        db_session.add(inactive)
        await db_session.commit()
        await db_session.refresh(inactive)

        with pytest.raises(ValueError, match=str(inactive.id)):
            await court_service.save_court(db_session, test_player.id, inactive.id)

    @pytest.mark.asyncio
    async def test_get_saved_court_cards_excludes_non_approved(
        self, db_session, location, test_player
    ):
        """A PlayerHomeCourt row pointing at a non-approved court is excluded from cards."""
        # Create a court that starts approved so we can save it legitimately,
        # then demote it to simulate it becoming unavailable.
        court_obj = Court(
            name="Demoted Court",
            slug="demoted-court-test",
            location_id=location.id,
            status="approved",
            is_active=True,
        )
        db_session.add(court_obj)
        await db_session.commit()
        await db_session.refresh(court_obj)

        # Save it while it is approved.
        await court_service.save_court(db_session, test_player.id, court_obj.id)

        # Demote to pending (simulates moderation action).
        court_obj.status = "pending"
        db_session.add(court_obj)
        await db_session.commit()

        cards = await court_service.get_saved_court_cards(db_session, test_player.id)
        returned_ids = {c["id"] for c in cards}
        assert court_obj.id not in returned_ids

    @pytest.mark.asyncio
    async def test_get_player_id_for_user_none(self, db_session):
        """No user resolves to no player id."""
        assert await court_service.get_player_id_for_user(db_session, None) is None

    @pytest.mark.asyncio
    async def test_get_player_id_for_user_resolves(self, db_session, test_user, test_player):
        """A user dict resolves to its non-placeholder player id."""
        pid = await court_service.get_player_id_for_user(db_session, {"id": test_user["id"]})
        assert pid == test_player.id


# ============================================================================
# Player home courts — coordinate exposure (powers client location coalescing)
# ============================================================================


class TestPlayerHomeCourtCoords:
    """get_player_home_courts surfaces each court's latitude/longitude."""

    @pytest.mark.asyncio
    async def test_includes_court_coordinates(self, db_session, location, test_player):
        """A player's home court returns the court's coordinates, ordered by position."""
        court = Court(
            name="Coords Court",
            address="500 Ocean Ave",
            location_id=location.id,
            latitude=32.78,
            longitude=-117.23,
            status="approved",
        )
        db_session.add(court)
        await db_session.commit()
        await db_session.refresh(court)

        db_session.add(PlayerHomeCourt(player_id=test_player.id, court_id=court.id, position=0))
        await db_session.commit()

        result = await player_data.get_player_home_courts(db_session, test_player.id)

        assert len(result) == 1
        assert result[0]["latitude"] == 32.78
        assert result[0]["longitude"] == -117.23
        assert result[0]["id"] == court.id
