# Feature: Court Discovery & Reviews

**Date:** 2026-02-15
**Status:** Approved

## Problem Statement

Beach volleyball players lack a centralized resource to find, evaluate, and share information about courts. Players currently rely on word-of-mouth or fragmented web searches to discover courts, assess quality, and know what to expect before showing up. This feature creates a UDisc-style court directory that serves existing league players (primary) and attracts new users via SEO (secondary).

## Success Criteria

- Users can browse a searchable, filterable court directory with map and list views
- Each court has a dedicated detail page with photos, reviews, ratings, amenities, and location info
- Verified players can add new courts, leave star + text + tag reviews, and upload photos
- NYC courts are seeded as launch content; system supports any location hub
- Court pages are publicly accessible (SEO) with auth required to interact
- Average court rating is calculated and displayed from user reviews
- Court submissions require admin approval before going live
- Admin page includes a court submissions review section

## Scope

### In Scope
- Court directory page (map + list toggle) with search and filters
- Dedicated court detail page (info, photos, reviews, map pin, nearby courts)
- Court creation flow for verified players
- Review system: 1-5 stars, optional text, selectable tags (1 review per user per court)
- Up to 3 photo uploads per review (S3, preprocessed)
- Review editing and deletion by the review author
- "Suggest an edit" flow for court info corrections
- Curated seed tags (~10-15)
- NYC seed data (8 courts)
- Nav link ("Courts") + integration on existing location pages
- Public browsing, authenticated interaction
- Mapbox GL for map views

### Out of Scope (V1)
- Real-time features (live court availability, booking, check-ins)
- Review moderation / flagging system
- User-created tags (admin-curated only in V1)
- Court conditions reporting
- Favorites / saved courts
- Court leaderboards or gamification
- Push notifications for court activity
- Court-based chat or social features

*Roadmap items tracked in [GitHub Project](https://github.com/users/pschwagler/projects/2)*

## User Flow

### Browse Courts
1. User clicks "Courts" in navbar → lands on court directory page
2. Default view: map centered on user's location (or NYC if no geolocation)
3. Court pins on map; scrollable list below (toggle between map/list views)
4. User filters by: location hub, surface type, amenities, rating, free/paid
5. User clicks a court pin or list card → navigates to court detail page

### Court Detail Page
1. Hero section: court name, average rating, address, court count, surface type
2. Photo gallery (user-uploaded, attached to reviews)
3. Amenities section: icons/badges for parking, restrooms, lights, nets, etc.
4. Hours & contact info (if available)
5. Map pin showing court location
6. Reviews section: sorted by recency, each showing stars, text, tags, photos, author
7. "Write a Review" CTA (or "Be the first to review!" if no reviews)
8. "Nearby Courts" section at bottom
9. Unauthenticated users see an auth prompt instead of review/add buttons

### Add a Court (Submit Request)
1. Verified player clicks "Add Court" on directory page
2. Form: name (required), address (required), location hub (auto-detected or manual), court count, surface type, amenities (checkboxes), hours, website, phone
3. Address geocoded to lat/lng for map pin
4. Submission saved with status `pending` — not publicly visible yet
5. User sees confirmation: "Your court has been submitted for review!"
6. System admin reviews pending court submissions on the admin page
7. Admin approves → court goes live and appears in directory; or rejects with optional reason

### Admin: Manage Court Submissions
1. Admin navigates to admin page → "Court Submissions" section
2. Sees list of pending court submissions with submitter info and date
3. Can preview full court details
4. Approve: court status set to `approved`, becomes publicly visible
5. Reject: court status set to `rejected`, submitter could be notified (V2)

### Leave a Review
1. Verified player clicks "Write a Review" on court detail page
2. Form: star rating (1-5, required), text (optional), tags (multi-select from curated list), photos (up to 3, optional)
3. Photos preprocessed (JPEG, resized) and uploaded to S3
4. Review posted; court average rating recalculated
5. If user already reviewed this court, show "Edit Your Review" instead

### Edit / Delete Review
1. User sees edit/delete controls on their own review
2. Edit: opens pre-filled review form, user modifies and saves
3. Delete: confirmation dialog, then review removed and average recalculated

### Suggest an Edit
1. Any user clicks "Suggest an Edit" on a court detail page
2. Form pre-filled with current court info; user modifies fields and submits
3. Suggestion stored for court creator or system admin to review/approve

## Technical Design

### Data Model

#### Modify existing `courts` table (add columns)

| Column | Type | Notes |
|---|---|---|
| description | TEXT | Optional court description |
| court_count | INT | Number of individual courts at this venue |
| surface_type | VARCHAR(50) | 'sand', 'grass', 'indoor_sand' |
| is_free | BOOLEAN | Free to play or paid |
| cost_info | TEXT | Pricing details if paid |
| has_lights | BOOLEAN | Night play available |
| has_restrooms | BOOLEAN | |
| has_parking | BOOLEAN | |
| parking_info | TEXT | Parking details (free/paid/street) |
| nets_provided | BOOLEAN | Nets always up |
| hours | TEXT | Operating hours (freeform text) |
| phone | VARCHAR(30) | Contact phone |
| website | VARCHAR(500) | Court/venue website URL |
| latitude | FLOAT | Geocoded from address |
| longitude | FLOAT | Geocoded from address |
| created_by | INT (FK → players.id) | Player who added the court |
| average_rating | FLOAT | Denormalized avg from reviews |
| review_count | INT | Denormalized count |
| status | VARCHAR(20) | 'pending', 'approved', 'rejected' (default: 'pending') |
| is_active | BOOLEAN | Soft delete / closed courts |
| slug | VARCHAR(200) | SEO-friendly URL slug |

#### New `court_reviews` table

| Column | Type | Notes |
|---|---|---|
| id | SERIAL PK | |
| court_id | INT (FK → courts.id) | |
| player_id | INT (FK → players.id) | |
| rating | INT | 1-5 stars |
| review_text | TEXT | Optional |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

**Unique constraint:** `(court_id, player_id)` — one review per user per court.

#### New `court_review_tags` table (join table)

| Column | Type | Notes |
|---|---|---|
| id | SERIAL PK | |
| review_id | INT (FK → court_reviews.id) | |
| tag_id | INT (FK → court_tags.id) | |

**Unique constraint:** `(review_id, tag_id)`

#### New `court_tags` table

| Column | Type | Notes |
|---|---|---|
| id | SERIAL PK | |
| name | VARCHAR(50) | Display name (e.g., "Great Sand") |
| slug | VARCHAR(50) | URL-safe key (e.g., "great-sand") |
| category | VARCHAR(30) | Grouping: 'quality', 'vibe', 'facility' |
| sort_order | INT | Display ordering |

**Seed tags (~15):**
- Quality: "Great Sand", "Well-Maintained", "Needs Improvement"
- Vibe: "Beginner Friendly", "Competitive", "Good for Pickup", "Crowded Weekends", "Family Friendly"
- Facility: "Has Lights", "Free", "Paid", "Nets Provided", "Good Parking", "Near Transit", "Great Views"

#### New `court_review_photos` table

| Column | Type | Notes |
|---|---|---|
| id | SERIAL PK | |
| review_id | INT (FK → court_reviews.id) | |
| s3_key | VARCHAR(500) | S3 object key |
| url | VARCHAR(500) | Full CDN/S3 URL |
| sort_order | INT | Display order within review |
| created_at | TIMESTAMPTZ | |

#### New `court_edit_suggestions` table

| Column | Type | Notes |
|---|---|---|
| id | SERIAL PK | |
| court_id | INT (FK → courts.id) | |
| suggested_by | INT (FK → players.id) | |
| changes | JSONB | Dict of field→new_value |
| status | VARCHAR(20) | 'pending', 'approved', 'rejected' |
| reviewed_by | INT (FK → players.id) | Null until reviewed |
| created_at | TIMESTAMPTZ | |
| reviewed_at | TIMESTAMPTZ | |

### API Endpoints

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | /api/public/courts | List courts with filters (location, surface, rating, amenities), supports pagination. Returns court cards with avg rating. | Public |
| GET | /api/public/courts/:slug | Court detail: info, reviews, photos, tags, nearby courts | Public |
| POST | /api/courts | Submit a new court for admin approval (status: pending) | Verified player |
| PUT | /api/courts/:id | Update court info (creator or admin) | Creator / Admin |
| GET | /api/admin/courts/pending | List pending court submissions | System admin |
| PUT | /api/admin/courts/:id/approve | Approve a pending court submission | System admin |
| PUT | /api/admin/courts/:id/reject | Reject a pending court submission | System admin |
| GET | /api/courts/:id/reviews | List reviews for a court (paginated, with tags + photos) | Public |
| POST | /api/courts/:id/reviews | Create a review (star, text, tags, photos) | Verified player |
| PUT | /api/courts/:id/reviews/:review_id | Edit own review | Review author |
| DELETE | /api/courts/:id/reviews/:review_id | Delete own review | Review author |
| POST | /api/courts/:id/reviews/:review_id/photos | Upload photos to a review (max 3) | Review author |
| GET | /api/courts/tags | List all available review tags | Public |
| POST | /api/courts/:id/suggest-edit | Submit an edit suggestion | Verified player |
| GET | /api/courts/:id/suggestions | List pending edit suggestions (creator/admin) | Creator / Admin |
| PUT | /api/courts/suggestions/:id | Approve/reject suggestion | Creator / Admin |
| GET | /api/courts/nearby | Get courts near lat/lng (for map view + nearby section) | Public |

### Frontend Components

**New pages:**
- `CourtDirectoryPage` — map/list toggle, filters, search, "Add Court" CTA
- `CourtDetailPage` — full court profile, reviews, photos, map pin, nearby

**New components:**
- `CourtMap` — Mapbox GL map with court pins, popups on click
- `CourtListView` — filterable, sortable card grid/list
- `CourtCard` — summary card (name, rating, location, surface, photo thumbnail)
- `CourtDetailHeader` — name, rating, address, badges
- `CourtPhotoGallery` — horizontal scrollable photo gallery
- `CourtAmenities` — icon grid of amenities
- `CourtReviewsList` — paginated review list
- `CourtReviewCard` — single review (stars, text, tags, photos, author, date)
- `CourtReviewForm` — create/edit review with star selector, text, tag picker, photo upload
- `AddCourtForm` — multi-field court submission form (submits for admin approval)
- `SuggestEditForm` — pre-filled edit suggestion form
- `CourtTagPicker` — multi-select tag chips
- `StarRating` — interactive 1-5 star input + display component
- `NearbyCourtsList` — horizontal scroll of nearby court cards

**Modified components:**
- `Navbar` — add "Courts" nav link
- `PublicLocationPage` — enhanced courts section linking to court detail pages
- Admin page — add "Court Submissions" section to review/approve/reject pending courts

## Edge Cases & Error Handling

- **No geolocation permission:** Default map to NYC; show location prompt
- **Duplicate court:** Warn if a court with a very similar name exists at the same location hub
- **Pending court submission:** User sees "Your submission is under review" status; cannot review a court until it's approved
- **Review with no text:** Allowed — star rating is the only required field
- **Photo upload failure:** Show error toast, allow retry; don't block review submission
- **Photo too large:** Client-side resize before upload; server rejects >10MB
- **Court not found (bad slug):** 404 page with link back to directory
- **User already reviewed:** Show "Edit Your Review" button instead of "Write a Review"
- **Deleted review with photos:** Cascade delete S3 photos
- **Suggest edit on own court:** Allow (creator might want to request admin approval for sensitive changes), but also show direct edit option
- **Court with 0 reviews:** "Be the first to review!" CTA, no rating displayed (show "New" badge)
- **Geocoding failure:** Allow manual lat/lng pin placement on map, or accept address without coordinates
- **Multiple pending submissions for same court:** Show duplicate warning during submission if similar name exists (approved or pending)
- **Admin rejects court:** Court remains in DB with `rejected` status for audit trail; not visible publicly
- **Photo deletion:** When review is deleted, S3 cleanup should be async (don't block the DELETE response)

## UI/UX Notes

- Map/list toggle should remember user's preference (localStorage)
- Court cards show: thumbnail photo (or placeholder), name, star rating, location, court count, top 2-3 tags
- Star rating uses filled/empty star icons (half-star display for averages)
- Tags displayed as chips/badges using existing badge styling (border-radius: 12px)
- Photo gallery supports swipe on mobile, arrow navigation on desktop
- Review form is inline on the court detail page (not a modal) for easier photo management
- "Add Court" button is prominent on directory page, secondary on location pages
- Mobile: map fills viewport width, list cards stack vertically
- Follow existing BEM naming convention: `.court-directory__*`, `.court-detail__*`, `.court-review__*`
- Court photo placeholder: use a generic beach volleyball court illustration when no photos uploaded

## Implementation Notes

- **Geocoding:** Use Mapbox Geocoding API (already paying for Mapbox GL) — env var `MAPBOX_ACCESS_TOKEN`
- **S3 photo keys:** `court-photos/{court_id}/{review_id}/{uuid}.jpg` — mirrors existing avatar pattern in `s3_service.py`
- **Nearby courts:** Haversine distance query, default 25-mile radius, returns up to 10 courts
- **Slug generation:** `slugify(name)` + location city suffix if needed for uniqueness (e.g., `pier-25-new-york`)
- **Seed data:** NYC courts seeded with `status: 'approved'` (admin-created, skip approval)
- **Photo aggregation:** Court detail photo gallery aggregates all photos across all reviews, sorted by recency
- **Public route pattern:** Follow existing `public_routes.py` — court browse/detail under `/api/public/courts/`; review CRUD under authenticated `/api/courts/`

## Testing Plan

### Critical Paths (P0)
- Court submission: form validation, geocoding, save with pending status
- Admin approval/rejection flow: pending list, approve, reject
- Approved court appears in directory and detail page
- Review creation: star rating, text, tags, photos upload, average recalculation
- Review editing and deletion with average recalculation
- Court detail page loads correctly with reviews, photos, tags
- Map view renders pins, click navigates to detail
- Auth gating: unauthenticated users can browse but not interact

### Important (P1)
- Filter/search in directory (by location, surface, rating, amenities)
- Photo upload: preprocessing, S3 upload, display in gallery
- Suggest edit flow: submission, approval, court update
- One-review-per-user constraint enforced
- Nearby courts calculation and display
- Public location page integration

### Nice-to-Have (P2)
- Geolocation prompt and map centering
- Map/list toggle preference persistence
- Duplicate court warning
- Responsive layout across breakpoints
- SEO metadata on court pages

## NYC Seed Data

| Court Name | Address | Borough | Court Count | Surface | Free | Lights |
|---|---|---|---|---|---|---|
| Pier 25 | Hudson River Park, Pier 25, New York, NY 10013 | Manhattan | 3 | Sand | No | Yes |
| Riverside Park (104th St) | Riverside Park, W 104th St, New York, NY 10025 | Manhattan | 2 | Sand | Yes | No |
| Central Park (Sheep's Meadow) | Central Park, Sheep's Meadow, New York, NY 10019 | Manhattan | 1 | Grass | Yes | No |
| Pier 6 (Brooklyn Bridge Park) | Brooklyn Bridge Park, Pier 6, Brooklyn, NY 11201 | Brooklyn | 3 | Sand | Yes | No |
| Domino Park | Domino Park, River St, Brooklyn, NY 11249 | Brooklyn | 1 | Sand | Yes | No |
| Rockaway Beach (73rd St) | Beach 73rd St, Rockaway Beach, NY 11692 | Queens | 2 | Sand | Yes | No |
| QBK Sports | 23-32 Borden Ave, Long Island City, NY 11101 | Queens | 3 | Indoor Sand | No | Yes |
| Hunter's Point South Park | Center Blvd, Long Island City, NY 11101 | Queens | 2 | Sand | Yes | No |

All courts seeded under location hub `ny_nyc` (NY - New York City Metro).

---

## Implementation Plan: Epics & Tasks

### Key Decisions
- **Mapbox token**: Create before Epic 4. Hardcode NYC court lat/lng in seed CSV (no geocoding dependency at seed).
- **Admin court creation**: Keep existing `system_admin` route (auto-approved) alongside new user submission flow (pending).
- **Photo upload**: Two-step — create review first, then upload photos separately.
- **`require_verified_player`**: New reusable FastAPI dependency (check `is_verified` + player record exists).
- **S3**: Direct S3 URLs (same as avatars, no CloudFront).

### Build Order
```
Epic 1 (Schema + Seed)
  → Epic 2 (Court CRUD Backend)
    → Epic 3 (Review Backend)     ┐
    → Epic 4 (Directory Frontend) ┤ parallel
      → Epic 5 (Detail Frontend)  ┐
      → Epic 6 (Submission+Admin) ┤ parallel
        → Epic 7 (E2E + SEO)
```

---

### Epic 1: Database Schema & Seed Data
**Deps:** None (foundation for everything)

| # | Task | Size | Description | Key Files |
|---|------|------|-------------|-----------|
| 1.1 | Migration 019 | L | Add ~18 cols to `courts` (description, court_count, surface_type, amenity bools, lat/lng, status, slug, average_rating, review_count, is_active, is_free, cost_info, hours, phone, website, parking_info). Create 5 tables: `court_tags`, `court_reviews` (unique: court_id+player_id), `court_review_tags`, `court_review_photos`, `court_edit_suggestions`. Indexes on slug, status, lat/lng. | `apps/backend/alembic/versions/019_add_court_discovery_tables.py` |
| 1.2 | SQLAlchemy models | M | Add `CourtReview`, `CourtTag`, `CourtReviewTag`, `CourtReviewPhoto`, `CourtEditSuggestion`. Extend `Court` with new cols + relationships. | `apps/backend/database/models.py` |
| 1.3 | Seed data | M | `court_tags.csv` (~15 tags: quality/vibe/facility). `nyc_courts.csv` (8 courts with hardcoded lat/lng, status=approved). Seed runner in startup. | `apps/backend/seed/court_tags.csv`, `apps/backend/seed/nyc_courts.csv` |
| 1.4 | Pydantic schemas | M | ~15 models — `CourtListItem`, `CourtDetailResponse`, `CourtReviewResponse`, `CreateCourtRequest`, `CreateReviewRequest`, `CourtTagResponse`, `CourtEditSuggestionRequest`, `CourtNearbyResponse`, etc. | `apps/backend/models/schemas.py` |

---

### Epic 2: Court CRUD Backend
**Deps:** Epic 1

| # | Task | Size | Description | Key Files |
|---|------|------|-------------|-----------|
| 2.1 | Court service | L | `list_courts_public()` (filters: location, surface, amenities, rating, is_free; pagination; status=approved only), `get_court_by_slug()` (joins reviews/photos/tags), `create_court()` (pending status, generate slug), `update_court()`, `get_nearby_courts()` (haversine via `geo_utils.calculate_distance_miles`, 25mi, max 10). Slug: `slugify(name)-city` with uniqueness check. | `apps/backend/services/court_service.py` (new) |
| 2.2 | Public court routes | M | `GET /api/public/courts` (list+filter+paginate), `GET /api/public/courts/:slug` (detail), `GET /api/public/courts/tags` (all tags). Rate-limited. Follow existing `@public_router` pattern. | `apps/backend/api/public_routes.py` |
| 2.3 | Auth court routes | M | `POST /api/courts/submit` (verified player, status=pending). Keep existing admin `POST /api/courts` (auto-approved). `PUT /api/courts/:id` (creator or admin). New `require_verified_player` dependency. | `apps/backend/api/routes.py` |
| 2.4 | Geocoding service | S | Mapbox Geocoding API client `geocode_address(address) -> (lat, lng)`. Env: `MAPBOX_ACCESS_TOKEN`. Fallback: null coords. Used on court create (not seed). | `apps/backend/services/geocoding_service.py` (new) |
| 2.5 | Unit tests | M | Test list/filter, slug generation, nearby calculation, create with pending status, geocoding mock. | `apps/backend/tests/test_court_service.py` (new) |

**Reuse:** `geo_utils.calculate_distance_miles`, existing court CRUD in `data_service.py`, `s3_service.py` patterns.

---

### Epic 3: Review System Backend
**Deps:** Epic 2

| # | Task | Size | Description | Key Files |
|---|------|------|-------------|-----------|
| 3.1 | Review service | L | `create_review()` (1-per-user unique constraint, attach tags, recalc avg/count), `update_review()` (author only, recalc), `delete_review()` (author only, async S3 cleanup, recalc), `list_reviews()` (paginated, eager-load tags+photos+author). Avg recalc: update `courts.average_rating` and `courts.review_count`. | `apps/backend/services/court_service.py` (extend) |
| 3.2 | Court photo service | M | Reuse `avatar_service` validation pattern. Max 10MB, resize to 1200px max dim, JPEG 85%. S3 key: `court-photos/{court_id}/{review_id}/{uuid}.jpg`. New `upload_court_photo()` / `delete_court_photos()` in `s3_service.py`. Max 3 per review server-enforced. | `apps/backend/services/s3_service.py`, `apps/backend/services/court_photo_service.py` (new) |
| 3.3 | Review API routes | M | `POST /api/courts/:id/reviews`, `PUT /api/courts/:id/reviews/:rid`, `DELETE /api/courts/:id/reviews/:rid`, `POST /api/courts/:id/reviews/:rid/photos` (two-step upload). All require verified player. Return updated avg rating. | `apps/backend/api/routes.py` |
| 3.4 | Unit tests | M | Test create/edit/delete, 1-per-user enforcement, avg recalculation, photo limit, tag attachment, auth checks. | `apps/backend/tests/test_court_reviews.py` (new) |

---

### Epic 4: Court Directory Frontend
**Deps:** Epic 2

| # | Task | Size | Description | Key Files |
|---|------|------|-------------|-----------|
| 4.1 | API client functions | M | `getPublicCourts(filters)`, `getPublicCourtBySlug(slug)`, `getCourtTags()`, `getNearbyCourts(lat,lng)`, `submitCourt(data)`, `createReview()`, `updateReview()`, `deleteReview()`, `uploadReviewPhotos()`, `suggestCourtEdit()`, admin endpoints. | `apps/web/src/services/api.js` |
| 4.2 | Court directory page | M | SSR `apps/web/app/courts/page.jsx` + `CourtDirectoryClient.jsx`. Follow `beach-volleyball/page.jsx` pattern. Add "Courts" to NavBar. | `apps/web/app/courts/page.jsx`, `CourtDirectoryClient.jsx`, `NavBar.jsx` |
| 4.3 | CourtListView + CourtCard | M | Filterable grid (location, surface, rating, free/paid). Card: thumbnail, name, stars, address, court count, top tags. BEM `.court-directory__*`. | `apps/web/src/components/court/CourtListView.jsx`, `CourtCard.jsx`, CSS |
| 4.4 | StarRating component | S | Reusable — display mode (half stars for avgs) + interactive input mode (1-5). Lucide `Star` icon. | `apps/web/src/components/ui/StarRating.jsx` (new) |
| 4.5 | Mapbox map integration | L | Install `mapbox-gl` + `react-map-gl`. `CourtMap`: pins, popups, click → detail. Map/list toggle (localStorage pref). Env: `NEXT_PUBLIC_MAPBOX_TOKEN`. Default center: NYC or user geo. | `apps/web/src/components/court/CourtMap.jsx` (new) |

---

### Epic 5: Court Detail Page Frontend
**Deps:** Epic 3, Epic 4.4

| # | Task | Size | Description | Key Files |
|---|------|------|-------------|-----------|
| 5.1 | Court detail page (SSR) | M | `apps/web/app/courts/[slug]/page.jsx` with `generateMetadata`. Client component. 404 handling. | `apps/web/app/courts/[slug]/page.jsx`, `CourtDetailClient.jsx` |
| 5.2 | Detail UI components | L | `CourtDetailHeader` (name, rating, badges), `CourtAmenities` (Lucide icon grid), `CourtPhotoGallery` (horizontal scroll, swipe mobile), `NearbyCourtsList` (horizontal CourtCards). Map pin. | `apps/web/src/components/court/CourtDetail*.jsx`, CSS |
| 5.3 | Reviews section | L | `CourtReviewsList` (paginated), `CourtReviewCard` (stars, text, tags, photos, author, edit/delete own), `CourtReviewForm` (inline: star input, text, tag picker, photo dropzone 3 max), `CourtTagPicker` (multi-select chips). Auth gate. "Edit Your Review" / "Be the first!" CTA. | `apps/web/src/components/court/CourtReview*.jsx`, `CourtTagPicker.jsx`, CSS |
| 5.4 | Location page integration | S | Update `PublicLocationPage.jsx` courts section — cards link to `/courts/{slug}`, show rating + count. "View All Courts" link. | `apps/web/src/components/location/PublicLocationPage.jsx` |

---

### Epic 6: Court Submission + Admin Approval
**Deps:** Epic 2, Epic 4

| # | Task | Size | Description | Key Files |
|---|------|------|-------------|-----------|
| 6.1 | AddCourtForm | M | Multi-field form (name, address, location hub dropdown, court count, surface, amenity checkboxes, hours, website, phone). Duplicate warning. Submit → pending. Success toast. | `apps/web/src/components/court/AddCourtForm.jsx`, CSS |
| 6.2 | Admin backend | M | `GET /api/admin/courts/pending`, `PUT /api/admin/courts/:id/approve`, `PUT /api/admin/courts/:id/reject`. Require `system_admin`. | `apps/backend/api/routes.py`, `court_service.py` |
| 6.3 | Admin UI | M | New "Court Submissions" section in `AdminView.jsx`. Table: name, submitter, date, status. Preview, Approve/Reject buttons. Follow feedback section pattern. | `apps/web/src/components/AdminView.jsx` |
| 6.4 | Suggest-an-edit | M | Backend: `POST /api/courts/:id/suggest-edit` (JSONB changes), `GET /api/courts/:id/suggestions`, `PUT /api/courts/suggestions/:id` (approve/reject → apply). Frontend: `SuggestEditForm` (pre-filled). | `SuggestEditForm.jsx`, backend routes+service |

---

### Epic 7: E2E Tests + SEO
**Deps:** All above

| # | Task | Size | Description | Key Files |
|---|------|------|-------------|-----------|
| 7.1 | E2E: Court browse + detail | M | Directory loads, filter works, click court → detail page, reviews display, nearby courts show. | `apps/web/tests/e2e/courts/court-browse.spec.js` |
| 7.2 | E2E: Review CRUD + photos | M | Write review (stars + text + tags), avg update, edit, delete, upload photo. | `apps/web/tests/e2e/courts/court-reviews.spec.js` |
| 7.3 | E2E: Court submission + admin | M | Submit court (pending), admin approves, court appears in directory. | `apps/web/tests/e2e/courts/court-admin.spec.js` |
| 7.4 | Sitemap + SEO | S | Add court slugs to `sitemap.js`. Verify meta tags on court pages. | `apps/web/app/sitemap.js`, `public_service.py` |

---

### Task Summary

| Epic | Tasks | Sizes |
|------|-------|-------|
| 1. Schema & Seed | 4 | 1L, 3M |
| 2. Court CRUD Backend | 5 | 1L, 3M, 1S |
| 3. Review Backend | 4 | 1L, 3M |
| 4. Directory Frontend | 5 | 1L, 3M, 1S |
| 5. Detail Page Frontend | 4 | 2L, 1M, 1S |
| 6. Submission + Admin | 4 | 4M |
| 7. E2E + SEO | 4 | 3M, 1S |
| **Total** | **30** | **6L, 19M, 5S** |
