# Wave 5 — Venues (Courts): Wireframe Diff

Documents intentional deviations from the wireframe HTML files for the Venues domain
(courts list, court detail, court photos screens).

---

## Courts List (`courts.html` vs `CourtsScreen`)

### Implemented as specified
- TopNav with integrated search input (`searchMode`)
- 180 px map stub area with "View Full Map" button
- Horizontal filter chips: Nearby / My Courts / Top Rated / Indoor / Outdoor / Lighted
- `FlatList` of `CourtRow` items (name, city/state, rating, court count, distance)
- Loading skeleton (`CourtsSkeleton`)
- Empty state with optional "Clear Filter" CTA
- Error state with retry button
- Pull-to-refresh

### Deviations
| Wireframe element | Implementation | Reason |
|---|---|---|
| Live map tile (MapKit / Google Maps) | Static 180 px stub with "View Full Map" label | Native map SDK not yet wired; map view is deferred as a standalone screen |
| "Nearby" / "My Courts" filter chips (active state) | Rendered as non-functional chips (no backend filter effect) | Requires user location permission and a saved-courts API endpoint; both are `TODO(backend)` |
| Location-denied empty state with "Enable Location" CTA | Generic empty state | Location permission flow deferred; empty state copy is generic for MVP |
| Distance from user shown for each row | Shown when `distance_miles` is present on the API response | Backend must compute and return the field; client renders it when available |
| `star` icon in rating cell | Plain text `★` character | Avoids SVG icon dependency in a list cell; visually equivalent |

---

## Court Detail (`court-detail.html` vs `CourtDetailScreen`)

### Implemented as specified
- Hero image with photo count badge and swipeable dot indicators (single image for MVP)
- Court name + city header below hero
- Feature badges: Outdoor / Indoor / Lighted / Free Play / Nets Provided
- Star rating bar with numeric score and review count
- Action row: Check In (primary teal) + Add to My Courts (outline)
- Court Info section: courts count, surface, hours, map preview stub, address
- Photos section: 3-col grid of up to 3 thumbnails + "+N more" tile linking to gallery
- Reviews section stub
- Loading skeleton (`CourtDetailSkeleton`)
- Error state with retry button

### Deviations
| Wireframe element | Implementation | Reason |
|---|---|---|
| Hero carousel with swipeable slides | Single `Image` with photo count badge | Multi-image carousel requires `react-native-pager-view` or similar; deferred as polish |
| `check-in` button posts check-in | Button renders; `onPress` is a stub `TODO(backend)` | Check-in endpoint (`POST /api/courts/:id/check-in`) not yet available |
| "Add to My Courts" button saves court | Button renders; `onPress` is a stub `TODO(backend)` | Saved courts endpoint (`POST /api/users/me/courts`) not yet available |
| Live map preview (MapKit / Google Maps) | 100 px map stub with "Map preview" label | Same reason as courts list; map SDK deferred |
| Reviews section with authored cards | Stub section showing review count text | Review CRUD endpoints not yet available; full reviews screen is a future screen |
| `has_restrooms` / `has_parking` amenity icons in Court Info | Not shown | Fields are present on the `Court` type; rendering deferred until icon set is confirmed |

---

## Court Photos (`court-photos.html` vs `CourtPhotosScreen`)

### Implemented as specified
- Court name + address header bar
- Guidance text ("Tap a photo to view full size")
- Photo count bar (`N photos`)
- 3-column square photo grid via `FlatList` with `numColumns={3}`
- "+ Add" button in the TopNav right slot
- Empty state with "Add the first photo" CTA
- Loading skeleton
- Error state with retry button

### Deviations
| Wireframe element | Implementation | Reason |
|---|---|---|
| Camera / gallery upload sheet on "+ Add" press | Button renders; tap shows `Alert.alert` stub `TODO(backend)` | Photo upload requires pre-signed S3 URL from backend (`POST /api/courts/:id/photos`); deferred |
| Tap photo to view full-screen lightbox | Photo `Pressable` is a no-op for now | Full-screen image viewer (e.g., `react-native-image-viewing`) deferred as polish |
| Photo delete (long-press or swipe) | Not implemented | Requires author-ownership check from backend; deferred |

---

## KoB (King of the Beach) Screen — Descoped

`apps/mobile/app/(stack)/kob/[code].tsx` intentionally remains a `<ComingSoon />` stub.
KoB is a separate tournament bracket feature outside the Venues domain scope and will be
implemented in a dedicated wave.

---

## Notes on Backend TODOs

Several API methods used by these screens are stubs in `mockApi.ts` with `TODO(backend)` markers:

- `getCourts({})` — returns `MOCK_COURTS` array (3 mock courts)
- `getCourtById(idOrSlug)` — returns `MOCK_COURT_DETAIL` object
- `getCourtPhotos(idOrSlug)` — returns `MOCK_COURT_PHOTOS` array
- `uploadCourtPhoto(idOrSlug, formData)` — throws `notImplemented` error
- `deleteCourtPhoto(idOrSlug, photoId)` — throws `notImplemented` error

When real endpoints ship, only the API client `methods.ts` and the mock factory in
`mockApi.ts` need updating; screen components, hooks, and tests remain unchanged.
