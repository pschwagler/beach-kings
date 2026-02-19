# SEO Implementation Plan

## Context
Beach League has zero SEO infrastructure — no robots.txt, sitemap, meta tags, OG images, or public-facing pages. All content is auth-walled. This plan adds public pages for leagues, players, and locations with proper metadata, structured data, and social sharing previews. Phased: infrastructure first, then public pages, then OG images.

---

## Decisions

| Decision | Choice |
|----------|--------|
| API approach | New public endpoints (separate from auth'd) |
| OG images | Dynamic for key pages + static fallback |
| Analytics | Google Search Console only (placeholder) |
| Player URLs | `/player/{id}/{slug}` (e.g. `/player/123/john-doe`) |
| Location URLs | `/beach-volleyball/{slug}` (e.g. `/beach-volleyball/san-diego`) |
| Player scope | 1+ games for public profiles |
| League visibility | New `is_public` field (separate from `is_open`). Default: true |
| Public league data | Public: full read-only. Private: name, location, member count, creator, games played |
| Player profile data | Summary: name, avatar, level, location, ELO, W/L (no match history) |
| Location page content | Leagues + top players + courts + aggregate stats |
| League page URL | Same route `/league/{id}` — SSR public view for crawlers, dashboard for auth'd users |
| Cross-linking | Public page has "Join / Sign in" CTA. No link from dashboard to public page. |

---

## Phase 1: Infrastructure

### 1.1 Root metadata upgrade
**File**: `apps/web/app/layout.jsx`
- Expand static `metadata` export: `metadataBase`, title template (`%s | Beach League Volleyball`), description, `openGraph` defaults (siteName, default image `/og-default.png`), twitter card, GSC verification placeholder

### 1.2 robots.txt
**New file**: `apps/web/app/robots.js` (Next.js convention)
- Allow `/`, disallow `/home`, `/admin-view`, `/profile`, `/api/`
- Reference sitemap at `https://beachleaguevb.com/sitemap.xml`

### 1.3 Server-side fetch utility
**New file**: `apps/web/src/lib/server-fetch.js`
- `fetchBackend(path, options)` — calls `BACKEND_INTERNAL_URL` (default `http://backend:8000`) with `next.revalidate: 300` (5min ISR)
- Used by all server components and sitemap

### 1.4 Sitemap (dynamic)
**New file**: `apps/web/app/sitemap.js`
- Fetches from 3 backend endpoints to generate entries for:
  - Static pages (`/`, `/find-leagues`, `/beach-volleyball`, `/privacy-policy`, `/terms-of-service`)
  - Public leagues: `/league/{id}`
  - Players (1+ games): `/player/{id}/{slug}`
  - Locations: `/beach-volleyball/{slug}`

### 1.5 Env var
**File**: `docker-compose.yml` — add `BACKEND_INTERNAL_URL=http://backend:8000` to frontend service

### 1.6 Backend sitemap endpoints
**New file**: `apps/backend/api/public_routes.py` — new `public_router`
**File**: `apps/backend/api/main.py` — include `public_router`

Endpoints (no auth):
- `GET /api/public/sitemap/leagues` → `[{id, name, updated_at}]` where `is_public=True`
- `GET /api/public/sitemap/players` → `[{id, full_name, updated_at}]` where `total_games >= 1`
- `GET /api/public/sitemap/locations` → `[{slug, updated_at}]`

### 1.7 Static OG fallback
**New file**: `apps/web/public/og-default.png` — 1200x630 branded image (Beach League logo on navy bg)

---

## Phase 2: Public Endpoints + Pages

### 2.1 Database migration (014)
**New file**: `apps/backend/alembic/versions/014_add_seo_fields.py`
- Add `is_public BOOLEAN NOT NULL DEFAULT true` to `leagues` + index
- Add `slug VARCHAR(100)` to `locations` + unique index
- Populate slugs from city name (e.g. "Manhattan Beach" → `manhattan-beach`)

**File**: `apps/backend/database/models.py` — add `is_public` to League, `slug` to Location
**File**: `apps/backend/models/schemas.py` — add `is_public` to league schemas

### 2.2 Public API endpoints
All in `apps/backend/api/public_routes.py`. No auth required.

#### `GET /api/public/leagues`
Paginated public league list. Params: `location_id`, `region_id`, `gender`, `level`, `page`, `page_size`.

#### `GET /api/public/leagues/{league_id}`
- `is_public=True`: full data (info, members, standings, recent matches)
- `is_public=False`: limited (name, location, member count, creator, games played)

#### `GET /api/public/players/{player_id}`
Summary stats. 404 if player has <1 game.

#### `GET /api/public/locations/{slug}`
Location data: leagues, top 20 players by ELO, courts, aggregate stats.

#### `GET /api/public/locations`
All locations with slugs for directory page.

### 2.3 League page (convert to SSR + dual view)
**File**: `apps/web/app/league/[id]/page.jsx` — rewrite as server component with `generateMetadata()`
**New file**: `apps/web/src/components/league/LeaguePageClient.jsx` — auth-aware wrapper
**New file**: `apps/web/src/components/public/PublicLeaguePage.jsx` — public view

### 2.4 Player profile page
**New file**: `apps/web/app/player/[id]/[slug]/page.jsx` — server component with `generateMetadata()`
**New file**: `apps/web/src/components/public/PublicPlayerPage.jsx`

### 2.5 Location landing page
**New file**: `apps/web/app/beach-volleyball/[slug]/page.jsx` — server component with `generateMetadata()`
**New file**: `apps/web/src/components/public/PublicLocationPage.jsx`

### 2.6 Location directory
**New file**: `apps/web/app/beach-volleyball/page.jsx` — server component
**New file**: `apps/web/src/components/public/LocationDirectory.jsx`

---

## Phase 3: OG Images + Structured Data

### 3.1 Dynamic OG image routes
Using Next.js `ImageResponse`. Navy bg + logo + data. 1200x630.

- `apps/web/app/api/og/league/[id]/route.jsx`
- `apps/web/app/api/og/player/[id]/route.jsx`
- `apps/web/app/api/og/location/[slug]/route.jsx`

### 3.2 JSON-LD structured data
**New file**: `apps/web/src/components/public/JsonLd.jsx`
- League: `SportsOrganization` schema
- Player: `Person` schema
- Location: `Place` schema

---

## Verification

### Phase 1
- `curl /robots.txt` → rules present
- `curl /sitemap.xml` → XML with league/player/location URLs
- View source → meta tags (title, description, OG, twitter)

### Phase 2
- `/league/{id}` logged out → SSR public view (content in view-source)
- `/league/{id}` logged in → existing dashboard
- `/player/{id}/{slug}` → player summary with meta tags
- `/beach-volleyball/{slug}` → location page
- `/beach-volleyball` → directory
- `curl /api/public/leagues/1` → public data

### Phase 3
- Share URL on Slack/Twitter → dynamic preview card
- Google Structured Data Testing Tool → valid JSON-LD
