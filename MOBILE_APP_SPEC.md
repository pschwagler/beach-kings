# Beach League Mobile App — Full Implementation Spec

> Master document for building the complete React Native (Expo) mobile app.
> Agents: work phase-by-phase, task-by-task. Each task is self-contained with
> files to create/modify, API endpoints to consume, components to build, and
> acceptance criteria. Mark tasks done as you go.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Shared Code Strategy](#2-shared-code-strategy)
3. [Phase 0 — Foundation & Design System](#phase-0--foundation--design-system)
4. [Phase 1 — Authentication & Onboarding](#phase-1--authentication--onboarding)
5. [Review Gate 1 — Foundation & Auth Audit](#review-gate-1--foundation--auth-audit)
6. [Phase 2 — Home Tab](#phase-2--home-tab)
7. [Phase 3 — Leagues Tab](#phase-3--leagues-tab)
8. [Phase 4 — Add Games Tab (Sessions & Score Entry)](#phase-4--add-games-tab-sessions--score-entry)
9. [Review Gate 2 — Core Gameplay Audit](#review-gate-2--core-gameplay-audit)
10. [Phase 5 — Social Tab (Friends, Messages, Notifications)](#phase-5--social-tab-friends-messages-notifications)
11. [Phase 6 — Profile Tab & Settings](#phase-6--profile-tab--settings)
12. [Phase 7 — Courts & Locations](#phase-7--courts--locations)
13. [Phase 8 — KOB Tournaments](#phase-8--kob-tournaments)
14. [Review Gate 3 — Feature-Complete Audit](#review-gate-3--feature-complete-audit)
15. [Phase 9 — Real-Time & Push Notifications](#phase-9--real-time--push-notifications)
16. [Review Gate 4 — Integration & Real-Time Audit](#review-gate-4--integration--real-time-audit)
17. [Phase 10 — Polish, Performance & Launch Prep](#phase-10--polish-performance--launch-prep)
18. [Cross-Cutting Concerns](#cross-cutting-concerns)
19. [Testing Strategy](#testing-strategy)
20. [v1.1 Roadmap](#v11-roadmap)
21. [Definition of Done](#definition-of-done)

---

## 1. Architecture Overview

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Expo SDK 54 (New Architecture), React 19, React Native 0.81 |
| Navigation | expo-router 6 (file-based) |
| Styling | NativeWind 4 + Tailwind 3 (darkMode: 'class') |
| State | React Context (AuthContext, ThemeContext) + per-screen `useState`/`useReducer` |
| API Client | `@beach-kings/api-client` (shared with web) via `MobileStorageAdapter(SecureStore)` |
| Token Storage | expo-secure-store |
| Design Tokens | `@beach-kings/shared/tokens` (colors, spacing, typography, layout) |
| Animation | react-native-reanimated 3 |
| Icons | react-native-svg (custom icon set) + Phosphor Icons |
| Forms | react-hook-form + zod validation |
| Lists | FlashList (recycled virtualized lists) |
| Charts | react-native-gifted-charts (SVG-based, no Skia dependency) |
| Maps | react-native-maps (court browser map view) |
| Images | expo-image (fast, cached, blur hash) |
| Testing | Jest + React Native Testing Library (unit/integration), Maestro (E2E — YAML-based, Expo-supported) |

### Directory Structure (Target)

```
apps/mobile/
  app/                          # Expo Router file-based routes
    _layout.tsx                 # Root: providers, splash, font loading
    index.tsx                   # Redirect → /(tabs)/home or /(auth)/welcome
    (auth)/
      _layout.tsx               # Stack navigator, no header
      welcome.tsx
      login.tsx
      signup.tsx
      forgot-password.tsx
      verify.tsx                # Phone OTP verification
      onboarding.tsx
    (tabs)/
      _layout.tsx               # Tab navigator (5 tabs + FAB)
      home.tsx                  # → HomeScreen
      leagues.tsx               # → LeaguesScreen
      add-games.tsx             # → AddGamesScreen (FAB center tab)
      social.tsx                # → SocialScreen
      profile.tsx               # → ProfileScreen
    (stack)/
      _layout.tsx               # Shared stack for detail screens
      league/[id].tsx
      session/[code].tsx
      session/create.tsx
      player/[id].tsx
      court/[slug].tsx
      courts.tsx                # Courts browser
      kob/[code].tsx
      kob/create.tsx
      kob/manage/[id].tsx       # Tournament director view
      find-leagues.tsx
      find-players.tsx
      create-league.tsx
      invite/[token].tsx
      my-games.tsx
      my-stats.tsx
      messages/[playerId].tsx   # DM thread
      pending-invites.tsx
      tournaments.tsx           # Tournament list
      settings.tsx
      settings/account.tsx
      settings/notifications.tsx
      settings/change-password.tsx
  src/
    components/
      ui/                       # Design system primitives
        Badge.tsx
        Button.tsx
        Card.tsx
        Chip.tsx
        Divider.tsx
        EmptyState.tsx
        icons.tsx
        Input.tsx
        LoadingSkeleton.tsx
        Modal.tsx
        BottomSheet.tsx
        SegmentControl.tsx
        TopNav.tsx
        Avatar.tsx
        OtpInput.tsx
        PasswordStrength.tsx
        PullToRefresh.tsx
        TabView.tsx
        SearchBar.tsx
        FilterChips.tsx
        Toast.tsx
        ListItem.tsx
        FAB.tsx
        StatCard.tsx
        ProgressBar.tsx
      home/                     # Home tab components
      leagues/                  # League components
      sessions/                 # Session & score components
      social/                   # Friends, messages, notifications
      profile/                  # Profile & stats components
      courts/                   # Court components
      kob/                      # KOB tournament components
    contexts/
      AuthContext.tsx
      ThemeContext.tsx
      NotificationContext.tsx
      ToastContext.tsx
    hooks/
      useApi.ts                 # Generic fetch hook with loading/error
      useInfiniteList.ts        # Paginated list hook
      useRefreshOnFocus.ts      # Refetch when screen focused
      useDebounce.ts
      usePullToRefresh.ts
      useWebSocket.ts
      useKeyboard.ts
    lib/
      api.ts                    # API client singleton (thin re-export of @beach-kings/api-client)
      navigation.ts             # Type-safe navigation helpers
      formatters.ts             # Date, number, stat formatters
      validators.ts             # Zod schemas for forms
      ErrorBoundary.tsx         # Global error boundary (catches JS errors, shows retry UI)
    types/
      index.ts                  # Re-export from @beach-kings/shared + mobile-specific types
    utils/
      storage.ts                # SecureStore helpers
      haptics.ts                # Haptic feedback wrapper
      share.ts                  # Native share helper
```

### Wireframe Reference

All wireframes live in `mobile-audit/wireframes/`. Each task references the
wireframe(s) it implements. When building a screen, open the wireframe HTML in
a browser at 390x844 and match the layout pixel-for-pixel.

### Design System Reference

- **Colors**: Teal primary (#2a7d9c), Gold accent (#c9a227), Navy text (#1a3a4a)
- **Dark mode**: Navy bg (#0f1923), elevated surface (#1a2d3d), muted text (#8ba3b5)
- **Typography**: iOS HIG scale — 28/700 (h1), 22/700 (h2), 17/600 (h3), 15/400 (body), 13/400 (caption)
- **Spacing**: 4px base grid — xs(4), sm(8), md(12), lg(16), xl(20), 2xl(24), 3xl(32)
- **Border radius**: sm(8), card(12), lg(16), full(9999)
- **Touch targets**: 44px minimum on all interactive elements
- **Shadows**: Light mode uses shadows; dark mode uses subtle borders instead

---

## 2. Shared Code Strategy

> The monorepo has two shared packages — `packages/shared/` and
> `packages/api-client/` — but the web app does **not** import either of them
> today. Types, utils, and API calls are duplicated with significant divergence.
> This section defines what to share, what stays platform-specific, and how to
> consolidate during mobile development.

### Current State (Problem)

| Package | Lines | What it has | Who imports it |
|---------|-------|-------------|----------------|
| `@beach-kings/shared` | ~117 | 9 bare-bones interfaces, no enums, minimal fields | Mobile only (skeleton) |
| `@beach-kings/api-client` | ~400 | `ApiClient` class (Axios), `MobileStorageAdapter`, ~60 endpoint methods | Mobile only (skeleton) |
| `apps/web/src/types/index.ts` | ~760 | 40+ richly documented interfaces, 10 enum types, KOB/DM/Award types | Web (canonical source of truth) |
| `apps/web/src/utils/` | ~30 files | Date formatting, match validation, player utils, slug, debounce, etc. | Web only |

**The web types are the source of truth** — they match the backend's actual response shapes. The shared package types are a stale subset.

### What to Share (Phase 0 prerequisite)

Before building mobile features, consolidate shared code so both apps consume
the same types, utils, and API methods. This work belongs in **Phase 0, Epic 0.1**.

#### A. Types → `packages/shared/src/types/`

Replace the current 9 minimal interfaces with the web's full type definitions.
Port `apps/web/src/types/index.ts` into the shared package, organized by domain:

| Target file | Types to include |
|-------------|-----------------|
| `types/enums.ts` | `PlayerGender`, `LeagueGender`, `SkillLevel`, `SessionStatus`, `CourtStatus`, `LeagueMemberRole`, `KobTournamentFormat`, `KobTournamentStatus`, `FriendRequestStatus`, `NotificationType` |
| `types/auth.ts` | `AuthResponse`, `RefreshTokenResponse` |
| `types/player.ts` | `Player`, `User`, `PublicPlayerResponse`, `PublicPlayerStats` |
| `types/league.ts` | `League`, `LeagueMember`, `LeagueStandingRow`, `LeagueMatchRow`, `HomeCourtResponse` |
| `types/season.ts` | `Season`, `WeeklySchedule`, `Signup`, `SignupPlayer` |
| `types/session.ts` | `Session`, `Match`, `MatchRecord`, `EloChange` |
| `types/court.ts` | `Court`, `CourtPhoto`, `CourtReview`, `ReviewActionResponse` |
| `types/social.ts` | `Friend`, `FriendRequest`, `FriendListResponse`, `FriendInLeague`, `DirectMessage`, `Conversation`, `ConversationListResponse`, `ThreadResponse`, `MarkReadResponse` |
| `types/notification.ts` | `Notification` |
| `types/kob.ts` | `KobTournament`, `KobTournamentDetail`, `KobPlayer`, `KobMatch`, `KobStanding` |
| `types/common.ts` | `PaginatedResponse<T>`, `Location`, `SeasonAward`, `Feedback`, `PlayerOption`, `ApiError` |
| `types/index.ts` | Re-export everything |

After migration, update `apps/web/src/types/index.ts` to re-export from `@beach-kings/shared`:
```typescript
// apps/web/src/types/index.ts (after migration)
export * from '@beach-kings/shared/types';
```

#### B. Utilities → `packages/shared/src/utils/`

Extract platform-agnostic utilities from `apps/web/src/utils/` into the shared
package. These must have **zero DOM/Node/React Native dependencies**.

| Web source file | Shared target | What it does |
|-----------------|---------------|-------------|
| `dateUtils.ts` | `utils/dateUtils.ts` | `formatDate`, `formatRelativeDate`, `getDateRange`, `isToday` |
| `formatters.ts` | `utils/formatters.ts` | `formatElo`, `formatWinRate`, `formatRecord`, `formatOrdinal` |
| `playerUtils.ts` | `utils/playerUtils.ts` | `getInitials`, `getDisplayName`, `getPlayerLevel` |
| `matchValidation.ts` | `utils/matchValidation.ts` | `validateScore`, `validateTeams`, `isValidMatch` |
| `divisionUtils.ts` | `utils/divisionUtils.ts` | `getDivisionLabel`, `formatDivision` |
| `slugify.ts` | `utils/slugify.ts` | `slugify`, `deslugify` |
| `debounce.ts` | `utils/debounce.ts` | `debounce` (generic, no DOM) |
| `awardConstants.ts` | `constants/awards.ts` | Award type labels, icons, descriptions |
| `playerFilterOptions.ts` | `constants/playerFilters.ts` | Level/gender/location filter option lists |
| `playerFormConstants.ts` | `constants/playerForm.ts` | Height options, position options, side options |
| `playerDropdownUtils.ts` | `utils/playerDropdownUtils.ts` | `formatPlayerOption`, `searchPlayers` |

After extraction, update web imports to point at `@beach-kings/shared/utils/*`.

#### C. API Methods → `packages/api-client/src/methods.ts`

The api-client already has ~60 endpoint methods. Gaps to fill (web has these,
api-client does not):

| Priority | Domain | Missing methods |
|----------|--------|----------------|
| P0 (Phase 0) | Friends | `sendFriendRequest`, `acceptFriendRequest`, `rejectFriendRequest`, `removeFriend`, `getFriends`, `getFriendRequests`, `getFriendSuggestions`, `getFriendshipStatus` |
| P0 (Phase 0) | Notifications | `getNotifications`, `markNotificationRead`, `markAllRead`, `getUnreadCount` |
| P1 (Phase 2) | Court reviews | `getCourtReviews`, `createReview`, `updateReview`, `deleteReview`, `getCourtPhotos`, `uploadCourtPhoto`, `getReviewTags` |
| P1 (Phase 2) | Court check-ins | `checkInToCourt`, `getActiveCheckIns`, `checkOut` |
| P2 (Phase 5) | Direct messages | `getConversations`, `getThread`, `sendMessage`, `markThreadRead`, `getUnreadDmCount` |
| P2 (Phase 8) | KOB tournaments | `createTournament`, `getTournament`, `joinTournament`, `startTournament`, `advanceRound`, `submitScore`, `getTournamentStandings` |

Add these incrementally — each build phase should add the methods it needs.

**Existing methods that need fixing:**

| Method | Current endpoint | Correct endpoint | Notes |
|--------|-----------------|-----------------|-------|
| `getActiveSession()` | `GET /api/sessions?active=true` | `GET /api/sessions/open` | Wrong URL — backend route is `/api/sessions/open`, returns `OpenSessionResponse[]` |
| `getCourts()` | `GET /api/courts` | `GET /api/public/courts` | Hits authenticated admin route instead of public read route (different response shape) |
| `exportMatchesToCSV()` | Uses `window.URL`, `document.createElement` | N/A — **delete or guard** | DOM-only code, will crash on React Native. Either delete (web has its own copy) or add a platform guard |

Fix these in Phase 0 alongside the cleanup steps below.

#### D. API Client Cleanup (Phase 0 prerequisite)

The `packages/api-client/` package has both a JS implementation (`index.js`, `index.d.ts`,
`createApiClient.js`, `adapters/storage.js`) and a TS implementation (`index.ts`,
`createApiClient.ts`, `adapters/storage.ts`). The mobile app already imports from the
TS implementation (`createApiClient`, `MobileStorageAdapter`). The web app does NOT use
this package at all (it has its own local `api-client.ts`).

**Cleanup steps (Phase 0, Epic 0.1):**
1. Delete JS files: `index.js`, `index.d.ts`, `createApiClient.js`, `adapters/storage.js`
2. Update `packages/api-client/package.json` → `"main": "./src/index.ts"`
3. Verify mobile app still builds and imports resolve correctly

#### E. API Client Enhancements (post-launch)

The web app has a more sophisticated API client (`apps/web/src/utils/server-fetch.ts`)
with features the shared api-client lacks. Before web can migrate to the shared
client, it needs:

1. **Proactive token refresh** — refresh before expiry, not just on 401
2. **Request deduplication** — don't fire the same GET twice concurrently
3. **Retry with backoff** — configurable retry for network errors

These are **not Phase 0 blockers** — the mobile app can use the current client as-is.
Web migration to the shared api-client is a separate initiative (post-mobile-launch).

#### F. Court API Pattern

The backend exposes courts through two route groups:

| Route | Auth | Purpose |
|-------|------|---------|
| `GET /api/public/courts/*` | None | **Reads** — listing, detail, check-ins, leaderboard, leagues. Returns richer data (location details, amenities, nearby courts). |
| `POST/DELETE /api/courts/{id}/*` | Required | **Writes** — check-in, check-out, reviews, photos, suggest-edit, submit new court. |

Mobile users are authenticated, but should still use **public routes for reads** (richer
response, same data) and **authenticated routes for writes**. Court detail pages use
`slug` for URLs but the response includes the `id` needed for write operations.

### What Stays Platform-Specific (Do NOT share)

| Category | Web | Mobile | Why |
|----------|-----|--------|-----|
| Navigation | Next.js `router.push()`, `<Link>` | expo-router `router.push()`, `<Link>` | Different router APIs |
| Storage | `localStorage`, cookies | `expo-secure-store` | Different storage APIs |
| Styling | Chakra UI, CSS modules | NativeWind, `StyleSheet` | Completely different paradigms |
| SSR/ISR | `fetchBackend()` with `next: { revalidate }` | N/A | Server-only concept |
| Image handling | `<img>`, `next/image` | `expo-image` | Different components |
| DOM APIs | `window.*`, `document.*` | N/A | No DOM in React Native |
| Platform utils | `cropImage.ts`, `og-config.tsx`, `formNavigation.ts` | `haptics.ts`, `share.ts`, `storage.ts` | Platform-specific APIs |
| Auth flow | Cookie-based, cross-tab sync | SecureStore tokens, biometrics | Different security models |

### Execution Plan

```
Phase 0, Epic 0.1 (before any feature work):
  1. Port web types → packages/shared/src/types/ (organized by domain)
  2. Extract platform-agnostic utils → packages/shared/src/utils/
  3. Update web imports to re-export from @beach-kings/shared
  4. Add P0 API methods (friends, notifications) to api-client
  5. Run all web tests to confirm nothing broke

Each subsequent phase:
  - Add phase-specific API methods to api-client BEFORE building screens
  - Any new shared type goes in packages/shared, not in apps/mobile/src/types/
  - Mobile-only types (e.g., navigation param types) stay in apps/mobile/src/types/
```

### Rules for Agents

1. **Never duplicate a type that exists in `@beach-kings/shared`** — import it
2. **Never write a utility that duplicates one in `packages/shared/src/utils/`** — import it
3. **New API endpoints go in `packages/api-client/src/methods.ts`** — the api-client IS the API layer
4. **No service layer in mobile** — screens and hooks call api-client methods directly via `import { api } from '@/lib/api'`. There are no `services/*.ts` files. Mobile-specific concerns (caching, offline queuing) are handled in hooks, not wrapper services
5. **When in doubt, check web first** — if the web app already has a working implementation of the same logic, extract it to shared rather than rewriting
6. **Court reads use public routes** — `GET /api/public/courts/*` for listing/detail, `POST/DELETE /api/courts/{id}/*` for writes (see Court API Pattern above)

---

## Phase 0 — Foundation & Design System

> Goal: Build the design system primitives, shared hooks, api-client integration,
> navigation shell, and error boundary so all subsequent phases can focus on features.

### Epic 0.0 — Project Setup (prerequisite)

#### Task 0.0.1 — Install Dependencies

Install all required npm packages before any feature work.

**Run from `apps/mobile/`:**
```bash
npx expo install nativewind tailwindcss react-native-reanimated react-native-gesture-handler \
  react-native-svg react-native-safe-area-context @shopify/flash-list expo-image \
  react-hook-form @hookform/resolvers zod expo-secure-store expo-haptics expo-camera \
  expo-image-picker expo-notifications expo-device expo-auth-session expo-apple-authentication \
  expo-crypto expo-constants expo-splash-screen expo-font expo-linking expo-web-browser \
  react-native-gifted-charts react-native-maps @react-native-community/netinfo \
  phosphor-react-native
```

**Dev dependencies:**
```bash
npm install -D @testing-library/react-native @testing-library/jest-native \
  jest-expo axios-mock-adapter @types/react @types/react-native
```

**Acceptance criteria:**
- [ ] `npx expo start` launches without errors
- [ ] `npx tsc --noEmit` passes
- [ ] All packages on compatible versions (`npx expo install --check`)

---

### Epic 0.1 — Design System Primitives

#### Task 0.1.1 — Core UI Components

Enhance existing + create new design system components.

**Files to create/modify:**
- `src/components/ui/Divider.tsx` — Horizontal rule, themed
- `src/components/ui/Chip.tsx` — Filter chip / pill selector (active/inactive states, teal active)
- `src/components/ui/EmptyState.tsx` — Icon + title + description + optional CTA button
- `src/components/ui/LoadingSkeleton.tsx` — Animated shimmer placeholder (reanimated)
- `src/components/ui/Modal.tsx` — Full-screen modal with slide-up animation, handle bar
- `src/components/ui/BottomSheet.tsx` — Bottom sheet using reanimated + gesture handler
- `src/components/ui/SegmentControl.tsx` — iOS-style segment tabs (e.g., Stats/Games/Leagues on profile)
- `src/components/ui/Avatar.tsx` — Image with fallback to initials circle, sized variants (sm/md/lg/xl)
- `src/components/ui/OtpInput.tsx` — 6-cell OTP input (auto-advance, paste support)
- `src/components/ui/PasswordStrength.tsx` — 4-segment strength bar with label
- `src/components/ui/PullToRefresh.tsx` — Pull-to-refresh wrapper
- `src/components/ui/TabView.tsx` — Horizontal scrollable tab bar with indicator
- `src/components/ui/SearchBar.tsx` — Search input with icon, clear button, debounce
- `src/components/ui/FilterChips.tsx` — Horizontal scrollable row of Chip components
- `src/components/ui/Toast.tsx` — Slide-down toast (success/error/info)
- `src/components/ui/ListItem.tsx` — Configurable list row (icon, title, subtitle, chevron, badge)
- `src/components/ui/StatCard.tsx` — Stat value + label card (used on home, profile, league)
- `src/components/ui/ProgressBar.tsx` — Horizontal progress bar, themed

**Design reference:** `mobile-audit/wireframes/design-tokens.css` + `shared.css`

**Requirements:**
- All components accept `className` (NativeWind) and spread `...rest` props
- All components support dark mode via `useTheme()` or NativeWind `dark:` classes
- All interactive elements have 44px minimum touch target
- All components have TypeScript interfaces for props
- Skeleton loading must use `react-native-reanimated` for 60fps shimmer

**Tests:** Unit test each component renders, handles props, dark mode variant.

**Acceptance criteria:**
- [ ] Every component renders in light and dark mode
- [ ] Every interactive component meets 44px touch target
- [ ] Storybook-style smoke test for each component
- [ ] No hardcoded colors — all from tokens

---

#### Task 0.1.2 — Icon System

Expand the icon set to cover all wireframe needs.

**File:** `src/components/ui/icons.tsx`

**Icons needed (from wireframes):**
- Navigation: Home, Trophy, Plus, Chat, User, ChevronLeft, ChevronRight, ChevronDown
- Actions: Search, Filter, Settings, Edit, Trash, Share, Camera, Image, Send
- Social: Heart, Bell, BellDot, Users, UserPlus, UserCheck, UserMinus, MessageCircle
- Sports: Volleyball (custom SVG), Court, Pin/MapPin, Star, StarFilled, Crown
- Status: Check, CheckCircle, XCircle, AlertTriangle, Clock, Lock, Unlock
- Misc: Copy, Link, QrCode, Calendar, BarChart, TrendingUp, Award, Medal

**Requirements:**
- All icons accept `size` (default 24) and `color` props
- Use react-native-svg `Path`/`Circle`/`Rect` elements
- Export all from barrel `icons.tsx`
- Consider adopting `phosphor-react-native` for non-custom icons to reduce maintenance

**Tests:** Smoke render test for each icon.

---

#### Task 0.1.3 — Enhanced TopNav

Update TopNav to support all wireframe navigation patterns.

**File:** `src/components/ui/TopNav.tsx`

**Patterns from wireframes:**
1. Simple: back + title + spacer (most detail screens)
2. Title + right action: title + button (e.g., "Create" on create-league)
3. Search mode: back + search input (find-players, find-leagues)
4. Transparent overlay: for screens with hero images

**Requirements:**
- `showBack` → ChevronLeft + `router.back()`
- `title` → centered text
- `rightAction` → ReactNode slot
- `searchMode` → renders SearchBar instead of title
- `transparent` → no background, white text (for image headers)
- Height: 44px content + safe area inset top
- Background: `bg-nav` (dark teal) or transparent

---

#### Task 0.1.4 — ErrorBoundary

**File:** `src/lib/ErrorBoundary.tsx`

**Requirements:**
- Class component (React error boundaries require componentDidCatch)
- Catches uncaught JS errors anywhere in the component tree
- Renders a full-screen error UI: icon, "Something went wrong" heading, error message (dev only), "Try Again" button
- "Try Again" resets error state and re-renders children
- Logs error to console in dev, to error reporting service (Sentry placeholder) in prod
- Wrap at root level in `app/_layout.tsx` (inside providers, outside navigation)

**Tests:**
- Renders children when no error
- Shows error UI when child throws
- "Try Again" resets and re-renders children

---

### Epic 0.2 — API Client & Hooks

#### Task 0.2.1 — API Client Singleton

Configure the shared api-client for mobile use. There is NO separate service layer —
screens and hooks call api-client methods directly.

**File:** `src/lib/api.ts`

```typescript
import { createApiClient, MobileStorageAdapter } from '@beach-kings/api-client';
import * as SecureStore from 'expo-secure-store';

const storage = new MobileStorageAdapter(SecureStore);

export const api = createApiClient({
  baseURL: process.env.EXPO_PUBLIC_API_URL,
  storage,
});
```

**Pattern for screens/hooks:**
```typescript
// In a screen or hook — call api-client directly, no service wrapper
import { api } from '@/lib/api';
const leagues = await api.getMyLeagues();
const results = await api.queryLeagues(filters);
```

**Requirements:**
- Single `api` export used everywhere
- No `services/*.ts` files — api-client IS the API layer
- If an API method is missing from api-client, add it to `packages/api-client/src/methods.ts`

**Tests:** Verify api singleton initializes with correct config and storage adapter.

---

#### Task 0.2.2 — Custom Hooks

**Files to create:**

`src/hooks/useApi.ts`:
```typescript
// Generic data-fetching hook
// Returns { data, error, isLoading, refetch, mutate }
// Handles loading, error, and stale-while-revalidate patterns
```

`src/hooks/useInfiniteList.ts`:
```typescript
// Paginated list hook for FlashList
// Returns { data, isLoading, isLoadingMore, hasMore, loadMore, refetch }
// Handles page tracking, append, prepend, dedup
```

`src/hooks/useRefreshOnFocus.ts`:
```typescript
// Calls refetch() when screen gains focus (useFocusEffect)
// Prevents redundant fetches within a cooldown window (default 30s)
```

`src/hooks/useDebounce.ts`:
```typescript
// Debounces a value by delay (default 300ms)
```

`src/hooks/usePullToRefresh.ts`:
```typescript
// Wraps useApi refetch with RefreshControl state
// Returns { refreshing, onRefresh, refreshControl }
```

`src/hooks/useWebSocket.ts`:
```typescript
// WebSocket connection to /api/ws/notifications
// Handles auth handshake, reconnect with exponential backoff
// Returns { lastMessage, isConnected, send }
```

`src/hooks/useKeyboard.ts`:
```typescript
// Keyboard visibility + height tracking
// Returns { isVisible, keyboardHeight }
```

**Tests:** Unit test each hook with mock data/timers.

---

#### Task 0.2.3 — Utility Modules

**Files to create:**

`src/lib/formatters.ts`:
- `formatDate(date, format?)` — relative ("2h ago", "Yesterday") or absolute
- `formatGameScore(team1Score, team2Score)` — "21-19"
- `formatRecord(wins, losses)` — "12-3"
- `formatWinRate(wins, losses)` — "80%"
- `formatElo(rating)` — "1450"
- `formatPlayerName(player)` — first + last, or nickname
- `formatOrdinal(n)` — "1st", "2nd", "3rd"

`src/lib/validators.ts`:
- Zod schemas: `loginSchema`, `signupSchema`, `resetPasswordSchema`, `createLeagueSchema`, `createSessionSchema`, `profileUpdateSchema`, `createMatchSchema`, `courtReviewSchema`, `kobCreateSchema`

`src/lib/navigation.ts`:
- Type-safe route helpers: `routes.league(id)`, `routes.player(id)`, `routes.session(code)`, `routes.court(slug)`, `routes.kob(code)`, etc.

`src/utils/haptics.ts`:
- `hapticLight()`, `hapticMedium()`, `hapticHeavy()`, `hapticSuccess()`, `hapticError()`
- Wraps expo-haptics with try/catch (no-op on unsupported)

`src/utils/share.ts`:
- `shareLink(url, title?)` — native Share API wrapper

`src/utils/storage.ts`:
- Re-export/enhance SecureStore helpers if needed beyond api-client adapter

---

### Epic 0.3 — Navigation Shell

#### Task 0.3.1 — Root Layout & Auth Guard

**File:** `app/_layout.tsx`

**Requirements:**
- Load fonts (expo-font)
- Show splash screen until fonts + auth check complete (expo-splash-screen)
- Wrap app in providers: `ThemeProvider` > `AuthProvider` > `NotificationProvider` > `ToastProvider`
- Auth guard: redirect unauthenticated users to `/(auth)/welcome`
- StatusBar component (light content on dark nav, or dynamic)

---

#### Task 0.3.2 — Tab Navigator

**File:** `app/(tabs)/_layout.tsx`

**Wireframe:** `shared.css` tab bar definition

**Requirements:**
- 5 tabs: Home, Leagues, Add Games (FAB), Social, Profile
- Tab bar: 82px height, 28px bottom padding, 8px top padding
- "Add Games" center tab renders as raised gold circular FAB (-mt-3, w-11 h-11 rounded-full, shadow)
- Active tab: teal icon + label (dark mode: lighter teal)
- Inactive tab: gray icon + label
- Badge support on Social tab (unread notification/message count)
- Tab bar hides during keyboard input (on Android)
- Safe area bottom inset respected

---

#### Task 0.3.3 — Stack Navigator for Detail Screens

**File:** `app/(stack)/_layout.tsx`

**Requirements:**
- Stack navigator for all detail/pushed screens
- Default: no header (TopNav is rendered per-screen)
- Gesture-based back navigation enabled
- Shared element transitions where appropriate (e.g., league card → league detail)

---

#### Task 0.3.4 — Auth Layout

**File:** `app/(auth)/_layout.tsx`

**Requirements:**
- Stack navigator, no header
- No tab bar visible
- Transparent background during transitions

---

### Epic 0.4 — Contexts & Providers

#### Task 0.4.1 — NotificationContext

**File:** `src/contexts/NotificationContext.tsx`

**Provides:**
- `notifications: Notification[]`
- `unreadCount: number`
- `dmUnreadCount: number`
- `markAsRead(id)`, `markAllAsRead()`
- WebSocket connection management (connect on auth, disconnect on logout)
- `addNotificationListener(type, callback)` — for DM real-time updates

**Requirements:**
- Connect WebSocket when authenticated
- Parse `notification`, `notification_updated`, `direct_message` message types
- Exponential backoff reconnect (base 3s, max 30s)
- 30-second ping/pong keepalive
- Update unread counts on new notifications
- Haptic feedback on new notification

---

#### Task 0.4.2 — ToastContext

**File:** `src/contexts/ToastContext.tsx`

**Provides:**
- `showToast(message, type: 'success' | 'error' | 'info')`

**Requirements:**
- Toast slides down from top, auto-dismisses after 3s
- Stacks if multiple toasts
- Uses reanimated for smooth animation

---

---

## Phase 1 — Authentication & Onboarding

> Goal: Complete auth flow matching wireframes — welcome, login, signup,
> forgot password, phone verification, Google OAuth, and post-signup onboarding.

### Auth Model

The backend requires `phone_number` for signup and accepts either `phone_number` or
`email` for login. The mobile app supports four auth methods:

| Method | Login | Signup | Backend endpoint |
|--------|-------|--------|-----------------|
| Phone + password | Primary | Primary | `POST /api/auth/login` (`phone_number` + `password`) |
| Email + password | Secondary | Secondary | `POST /api/auth/login` (`email` + `password`) |
| Google OAuth | Yes | Yes (auto-creates) | `POST /api/auth/google` |
| Apple Sign-In | Yes | Yes (auto-creates) | `POST /api/auth/apple` **(backend prerequisite — endpoint does not exist yet)** |

**Apple Sign-In is required by App Store policy** when any third-party auth (Google) is offered.

**Backend prerequisites before Phase 1:**
- [ ] `POST /api/auth/apple` — Apple Sign-In endpoint (mirrors Google OAuth pattern)

### Epic 1.1 — Welcome Screen

#### Task 1.1.1 — Welcome Screen

**File:** `app/(auth)/welcome.tsx`
**Wireframe:** `welcome.html`

**UI:**
- Full-screen background (navy gradient or hero image)
- App logo centered upper third
- "BEACH LEAGUE" branding text (28px/800)
- Tagline: "Track your games. Climb the ranks. Own the beach." (15px, white/80%)
- CTAs at bottom (top to bottom):
  - "Continue with Phone" — gold primary button → `/(auth)/login` (phone mode)
  - "Continue with Google" — white button with Google icon → Google OAuth flow
  - "Continue with Apple" — black button with Apple icon (iOS only) → Apple Sign-In flow
  - "Use email instead" — text link → `/(auth)/login` (email mode)
  - "Create Account" — outline white button → `/(auth)/signup`
- Bottom text: "By continuing, you agree to our Terms & Privacy Policy" (11px, links)

**Tests:**
- Renders logo, all auth buttons
- "Continue with Phone" navigates to login
- "Create Account" navigates to signup
- Apple button only shown on iOS

---

### Epic 1.2 — Login

#### Task 1.2.1 — Login Screen

**File:** `app/(auth)/login.tsx` (enhance existing)
**Wireframe:** `login.html`

**UI:**
- TopNav: back → welcome, title "Log In"
- Mode toggle (SegmentControl): "Phone" | "Email" (defaults based on welcome screen entry)
- **Phone mode:** Phone number input (tel keyboard, formatted)
- **Email mode:** Email input
- Password input with show/hide toggle
- "Forgot Password?" link → `/(auth)/forgot-password`
- "Log In" gold button
- Divider: "or continue with"
- Google OAuth button (icon + "Continue with Google")
- Apple Sign-In button (iOS only, icon + "Continue with Apple")
- Bottom: "Don't have an account? Sign Up" link → signup

**API:**
- Phone login: `POST /api/auth/login` with `{ phone_number, password }`
- Email login: `POST /api/auth/login` with `{ email, password }`
- Google: `POST /api/auth/google`
- Apple: `POST /api/auth/apple`

**Dependencies:** `expo-auth-session` (Google), `expo-apple-authentication` (Apple)

**Tests:**
- Phone/email mode toggle switches input type
- Form validation (empty fields, invalid phone format, invalid email format)
- Successful login navigates to home
- Failed login shows error alert
- Google OAuth flow
- Apple Sign-In flow (iOS only)
- "Forgot Password" link navigates correctly

---

### Epic 1.3 — Signup

#### Task 1.3.1 — Signup Screen

**File:** `app/(auth)/signup.tsx` (enhance existing)
**Wireframe:** `signup.html`

**UI:**
- TopNav: back → welcome, title "Create Account"
- First Name + Last Name (side-by-side row, existing)
- Phone Number input (tel keyboard, formatted — **required by backend**)
- Email input (optional but recommended)
- Password input with strength indicator (PasswordStrength component)
- Password rules: min 8 chars, must include number (real-time check indicators)
- "Create Account" gold button
- Divider: "or continue with"
- Google OAuth + Apple Sign-In buttons
- Bottom: "Already have an account? Log In" link
- Error state: inline field errors (red border + error text below field)

**API:** `POST /api/auth/signup` with `{ phone_number, password, first_name, last_name, email? }` → then phone verification → onboarding

**Important:** The backend **requires** `phone_number` for signup. The existing mobile
AuthContext sends `email` + `password` — this MUST be fixed to send `phone_number`.

**Tests:**
- Field validation (name required, phone required, phone format, email format if provided, password rules)
- Password strength indicator updates
- Successful signup transitions to phone verification
- Duplicate phone number shows error

---

### Epic 1.4 — Phone Verification

#### Task 1.4.1 — OTP Verification Screen

**File:** `app/(auth)/verify.tsx` (new)
**Wireframe:** `forgot-password.html` state 2 (reuse OTP pattern)

**UI:**
- TopNav: back, title "Verify Phone"
- Envelope icon + "CHECK YOUR PHONE" heading
- Helper text: "Enter the 6-digit code sent to +1 (***) ***-1234"
- OtpInput component (6 cells)
- Resend timer: "Resend code in 0:42" (countdown from 60s)
- "Verify" gold button
- "Use a different number" secondary button

**API:** `POST /api/auth/send-verification`, `POST /api/auth/verify-phone`

**Tests:**
- OTP auto-advance between cells
- Paste support (6-digit paste fills all cells)
- Resend timer counts down, re-enables after 0
- Correct code verifies and proceeds
- Wrong code shows error

---

### Epic 1.5 — Forgot Password

#### Task 1.5.1 — Forgot Password Flow (4-state)

**File:** `app/(auth)/forgot-password.tsx`
**Wireframe:** `forgot-password.html`

**States (managed by local state machine):**

**State 1 — Request:**
- Lock icon + "RESET PASSWORD" heading
- Toggle: Email | Phone (segment control)
- Email: email input + "We'll send a 6-digit code"
- Phone: tel input + SMS text
- "Send Code" gold button → state 2
- "Back to Log In" secondary button

**State 2 — Verify:**
- Envelope icon + "CHECK YOUR INBOX"
- Masked email/phone display
- OtpInput (6 cells)
- Resend timer
- "Verify" button → state 3

**State 3 — New Password:**
- Key icon + "CREATE NEW PASSWORD"
- New password input + PasswordStrength bar
- Confirm password input
- "Reset Password" button → state 4

**State 4 — Success:**
- Green checkmark circle
- "Password Updated!" heading
- "Log In Now" navy button → login

**API:** `POST /api/auth/reset-password` → `POST /api/auth/reset-password-verify` → `POST /api/auth/reset-password-confirm`

**Tests:**
- Each state renders correct UI
- State transitions work forward and back
- Email/phone toggle switches input
- Password match validation
- Successful reset navigates to login

---

### Epic 1.6 — Post-Signup Onboarding

#### Task 1.6.1 — Onboarding Wizard

**File:** `app/(auth)/onboarding.tsx`
**Wireframe:** `onboarding.html`

**UI (multi-step wizard):**

**Step 1 — Basic Info:**
- "Welcome to Beach League!" heading
- Gender: pill selector (Men's, Women's, Coed)
- Skill Level: pill selector (Beginner, Intermediate, Advanced, Open/Pro)
- "Continue" button

**Step 2 — Location:**
- "Where do you play?" heading
- Location dropdown/picker (from `GET /api/locations`)
- City + State text inputs
- "Continue" button

**Step 3 — Profile Photo (optional):**
- "Add a profile photo" heading
- Avatar upload area (camera icon, tap to select)
- "Skip for now" link
- "Complete Setup" button

**API:**
- `PUT /api/users/me/player` (gender, level, location_id, city, state)
- `POST /api/users/me/avatar` (optional photo)

**Requirements:**
- Step indicator (dots or progress bar)
- Back button returns to previous step
- Can skip photo step
- Completing onboarding navigates to `/(tabs)/home`
- Profile fields saved to player record

**Tests:**
- Each step renders, validates required fields
- Navigation between steps
- Skip photo works
- Completion saves profile and navigates to home

---

### Epic 1.7 — Invite & Claim

#### Task 1.7.1 — Invite Claim Screen

**File:** `app/(stack)/invite/[token].tsx`
**Wireframe:** `invite-claim.html`

**UI:**
- Deep-linked screen (opened via `beachleague://invite/{token}` or web link)
- If unauthenticated: redirect to login/signup, then return to claim flow
- If authenticated:
  - Show invite details: who invited, which league/matches
  - "Claim Matches" button — merges placeholder player's match history into current user
  - Success state: "Matches claimed!" + "View My Stats" CTA
  - Error state: expired/invalid token message

**API:**
- `GET /api/players/invite/{token}` (get invite details)
- `POST /api/players/invite/{token}/claim` (claim placeholder matches)

**Requirements:**
- Handle expired tokens gracefully
- Show match count being claimed
- After claim, navigate to home or league where matches originated
- Works as both deep link and in-app navigation

**Tests:**
- Valid token shows invite details and claim button
- Claim merges matches and navigates to success
- Expired token shows error
- Unauthenticated user redirected to login, returns after auth

---

---

## Review Gate 1 — Foundation & Auth Audit

> **Trigger:** After Phase 0 and Phase 1 are complete.
> **Duration:** Dedicated review cycle before starting feature phases.
> **Who:** Agent performs review, surfaces questions for human approval before proceeding.

This is the most critical gate. Everything built in Phases 2-8 depends on
the foundation being solid. Mistakes here compound everywhere.

### RG1.1 — Code Quality & Simplification

Run the `/simplify` skill (or equivalent manual review) across all code written in Phases 0-1.

**Checklist:**
- [ ] **Dead code removal:** Delete any unused components, hooks, services, or types. Run `npx knip` or manually audit exports vs. imports.
- [ ] **Duplication audit:** Are any components doing the same thing with slight variations? Merge them. Especially check UI primitives — e.g., do `Card` and `StatCard` share too much? Should one compose the other?
- [ ] **Prop interface consistency:** Do all UI components follow the same pattern? (`interface XProps`, destructured, `...rest` spread, `className` support)
- [ ] **File size check:** No file over 400 lines. Extract if needed.
- [ ] **Naming audit:** Are component names, hook names, service method names consistent and self-documenting?
- [ ] **Import hygiene:** No circular imports, no deep relative paths (all using `@/` alias), barrel exports working.

### RG1.2 — Test Coverage & Quality

- [ ] Run `npx jest --coverage` and verify **80%+ coverage** on all new code.
- [ ] Are tests actually testing behavior, or just that components render without crashing? Review for meaningful assertions.
- [ ] Are service mocks realistic? Do they match actual API response shapes?
- [ ] Do auth flow tests cover: login success, login failure, token refresh, token expiry redirect, logout cleanup?
- [ ] Do onboarding tests cover: each step validation, skip photo, complete flow?
- [ ] Run the full test suite — **zero failures, zero warnings**.

### RG1.3 — Design System Validation

- [ ] Open each wireframe HTML in a browser at 390x844 alongside the corresponding built screen in the iOS Simulator. Do they match?
- [ ] Test every UI primitive in both **light and dark mode**. Screenshot comparison.
- [ ] Verify design tokens from `@beach-kings/shared/tokens` are used everywhere — no hardcoded colors, spacing, or font sizes.
- [ ] Check every interactive element for **44px touch targets** (use Accessibility Inspector or manual measurement).
- [ ] Test with **Dynamic Type** (iOS) set to largest size — does text truncate gracefully? Does layout break?

### RG1.4 — Architecture Validation

- [ ] **Navigation:** Can you navigate login → home → back (prevented) → logout → welcome? No stack leaks?
- [ ] **Auth guard:** Does visiting a deep link while unauthenticated redirect to login, then forward to the intended screen after auth?
- [ ] **API client:** Does the token refresh queue work? (Simulate 401 with two concurrent requests — both should retry after refresh, not trigger two refreshes.)
- [ ] **Theme switching:** Toggle light → dark → system. Does every screen update immediately? Any flash of wrong theme on app restart?
- [ ] **Memory:** Profile the app with Flipper or React DevTools. Any obvious leaks from context providers or event listeners?

### RG1.5 — Requirements Clarification

**STOP and ask the human before proceeding to Phase 2:**

> Many auth/scope questions have been pre-answered in this spec (phone+email+Google+Apple auth,
> all phases are v1 scope, offline = banner + block for v1). The remaining questions are:

- [x] **Onboarding fields:** Gender, level, and location are not strictly required, but without them the "Complete Your Profile" prompt shows on the profile page. The wireframe now includes a **City autocomplete** field (Geoapify-backed, same as web) that auto-selects the nearest location from the predefined set of 58 regions. Users can override the auto-selected location via dropdown.
- [x] **Push notification permissions:** iOS requires a system permission dialog — no way around it. Prompt on **first login with an explanation modal** ("soft ask" before the OS dialog). This is handled in Phase 9 (Task 9.1.1).
- [x] **Backend readiness:** Apple Sign-In (`POST /api/auth/apple`) and change-password (`POST /api/auth/change-password`) endpoints will be built as part of this plan using TDD. New backend endpoints should be created as needed during implementation.

### RG1.6 — Dependency & Build Health

- [ ] `npx expo start` — app launches without errors
- [ ] `npx expo prebuild --clean` — native projects generate without warnings
- [ ] All packages on latest compatible versions (check `npx expo install --check`)
- [ ] No unused dependencies in `package.json`
- [ ] TypeScript: `npx tsc --noEmit` — zero errors

**Exit criteria:** ALL checklist items green, ALL tests passing (zero failures — "pre-existing" is not an exemption), all human questions answered, any required changes from review are implemented and re-tested. Do NOT proceed to Phase 2 until everything passes.

---

---

## Phase 2 — Home Tab

> Goal: Build the home screen dashboard with activity feed, quick stats,
> sessions widget, and discovery section.

### Epic 2.1 — Home Screen

#### Task 2.1.1 — Home Screen Shell

**File:** `app/(tabs)/home.tsx` + `src/components/home/HomeScreen.tsx`
**Wireframe:** `home.html`

**UI sections (vertical scroll, pull-to-refresh):**

1. **Quick Stats Bar** (horizontal scroll):
   - ELO rating card (value + delta arrow)
   - Games Played card
   - Win Rate card
   - Win Streak card
   - Each card: `StatCard` component, tappable → My Stats

2. **Active Sessions Widget:**
   - Section title: "Active Sessions" + "See All" link
   - Card for each open session (max 2 shown):
     - Session name, code, player count, time
     - "Join" or "Continue" button
   - Empty state: "No active sessions" + "Start a Session" CTA

3. **My Leagues Bar** (horizontal scroll):
   - League cards (small, avatar + name)
   - Tap → league detail
   - "+ Join League" card at end → find-leagues

4. **Recent Games:**
   - Section title: "Recent Games" + "See All" link
   - Last 3 matches as compact cards:
     - Teams, score, date, league badge
   - Empty state: "No games yet" + "Log a Game" CTA

5. **Near You / Discovery:**
   - Section title: "Near You"
   - Horizontal scroll of court cards (image, name, distance)
   - Horizontal scroll of player cards (avatar, name, level)
   - Based on user's location

**API calls on mount:**
- `GET /api/users/me/player` (stats)
- `GET /api/sessions/open` (active sessions)
- `GET /api/users/me/leagues` (my leagues)
- `POST /api/matches/search` (recent matches, limit 3)
- `GET /api/public/courts/nearby?lat&lng&radius` (nearby courts)
- `GET /api/public/players?location_id=&limit=10` (nearby players)

**Requirements:**
- Skeleton loading states for each section independently
- Pull-to-refresh reloads all sections
- Parallelize all API calls on mount
- Cache league list in context for tab badge

**Tests:**
- Renders all sections with mock data
- Skeleton states shown during loading
- Pull-to-refresh triggers refetch
- Empty states render when no data
- Navigation from each section to detail screens

---

#### Task 2.1.2 — My Games Screen

**File:** `app/(stack)/my-games.tsx` + `src/components/home/MyGamesScreen.tsx`
**Wireframe:** `my-games.html`

**UI:**
- TopNav: back, "My Games"
- SegmentControl: "Sessions" | "Matches"
- Filter chips: league filter, date range

**Sessions tab:**
- List of sessions grouped by date
- Each session card: name, code, match count, date, status badge (open/submitted)
- Tap → session detail

**Matches tab:**
- List of matches grouped by date
- Each match card: teams, score, league, date
- Win/loss indicator (green/red side bar)

**API:**
- `GET /api/sessions/open?include_all=true` (all sessions)
- `POST /api/matches/search` (all matches for current player, paginated)

**Requirements:**
- FlashList for virtualized rendering
- Infinite scroll pagination
- Filter by league (dropdown from my leagues)

**Tests:**
- Both tabs render with mock data
- Filtering by league works
- Pagination loads more items
- Session tap navigates to detail

---

#### Task 2.1.3 — My Stats Screen

**File:** `app/(stack)/my-stats.tsx` + `src/components/home/MyStatsScreen.tsx`
**Wireframe:** `my-stats.html`

**UI:**
- TopNav: back, "My Stats"
- Trophy section (awards/badges earned)
- Time filter: chips for 30d, 90d, 1y, All Time
- Overview grid (2x2): ELO, Games, Wins, Win Rate
- ELO History chart (line chart — use `react-native-gifted-charts`, SVG-based, no Skia dependency)
- Filter row: Ranked/All toggle, League+Season dropdown, Partner dropdown
- Breakdown table: partnerships (partner name, record, win %)

**API:**
- `GET /api/players/{id}/stats`
- `GET /api/elo-timeline`
- `GET /api/players/{id}/awards`
- `POST /api/partnership-opponent-stats`

**Requirements:**
- Chart renders ELO timeline with smooth line
- Filters update all stats sections
- Partner dropdown built from match history
- Trophy cards show award type, season, rank

**Tests:**
- Stats grid displays correctly
- Chart renders with mock timeline data
- Filter changes trigger refetch
- Empty states for no awards, no stats

---

---

## Phase 3 — Leagues Tab

> Goal: My leagues list, find/create leagues, league dashboard with all tabs.

### Epic 3.1 — Leagues List

#### Task 3.1.1 — Leagues Tab Screen

**File:** `app/(tabs)/leagues.tsx` + `src/components/leagues/LeaguesScreen.tsx`
**Wireframe:** `leagues-tab.html`

**UI:**
- TopNav: title "Leagues", right action: "+" button → create-league
- Section: "My Leagues" — list of joined leagues:
  - League card: banner image, name, member count, level badge, gender badge
  - Tap → league detail `/(stack)/league/[id]`
- Action bar: "Find Leagues" button, "Create League" button
- Empty state: volleyball icon + "No Leagues Yet" + "Join or create a league to get started" + "Find Leagues" / "Create League" buttons

**API:** `GET /api/users/me/leagues`

**Requirements:**
- Pull-to-refresh
- Skeleton loading (3 placeholder cards)
- Empty state when no leagues

**Tests:**
- Renders league list
- Empty state when no leagues
- Tap navigates to league detail
- Buttons navigate to find/create

---

#### Task 3.1.2 — Find Leagues Screen

**File:** `app/(stack)/find-leagues.tsx` + `src/components/leagues/FindLeaguesScreen.tsx`
**Wireframe:** `find-leagues.html`

**UI:**
- TopNav: back, "Find Leagues", search mode toggle
- Search bar (debounced)
- Filter chips (horizontal scroll): Location, Gender (Men's/Women's/Coed), Level (Beginner/Intermediate/Advanced/Open)
- League cards (list):
  - Banner, name, location, member count
  - Level badge, access badge (Open / Invite Only)
  - "Join" button (open) or "Request" button (closed)
- Empty state: "No leagues found"
- Infinite scroll pagination

**API:** `POST /api/leagues/query` with filters

**Requirements:**
- Debounced search (300ms)
- Multiple filters composable
- Join directly from card (open leagues)
- Request join (closed leagues) → confirmation modal

**Tests:**
- Search filters results
- Filter chips toggle correctly
- Join/Request buttons work
- Pagination loads more

---

#### Task 3.1.3 — Create League Screen

**File:** `app/(stack)/create-league.tsx` + `src/components/leagues/CreateLeagueScreen.tsx`
**Wireframe:** `create-league.html`

**UI:**
- TopNav: "Cancel" back, "Create League", "Create" right action (disabled until valid)
- Form sections:
  - **League Details:**
    - League Name (text input)
    - Description (multiline textarea)
    - Access: two toggle cards ("Open League" / "Invite Only") — mutually exclusive
  - **Settings:**
    - Gender: pill selector (Men's, Women's, Coed)
    - Level: dropdown select (Beginner, Intermediate, Advanced, Open)
    - Location: dropdown select (from locations API)
    - Home Court: court picker card (tap → court picker bottom sheet)
- "Create League" gold button (full width)

**API:**
- `GET /api/locations` (populate location dropdown)
- `POST /api/leagues` (create)

**Requirements:**
- Form validation: name required, location required
- "Create" nav button enables when form valid
- Court picker is a bottom sheet with search
- On success: navigate to new league detail + toast

**Tests:**
- Form validation blocks submit when invalid
- Successful creation navigates to league detail
- Access toggle switches correctly
- Gender pills are mutually exclusive

---

### Epic 3.2 — League Dashboard

#### Task 3.2.1 — League Dashboard Shell

**File:** `app/(stack)/league/[id].tsx` + `src/components/leagues/LeagueDashboard.tsx`
**Wireframe:** `league-dashboard.html`

**UI:**
- League header: banner image, league name, member count, level/gender badges
- TabView (horizontal scrollable tabs):
  - Rankings (default)
  - Games
  - Signups
  - Chat
  - Info

**API:** `GET /api/leagues/{id}`

**Requirements:**
- Tab state persisted during session
- Pull-to-refresh reloads active tab data
- Header collapses on scroll (animated with reanimated)
- Season picker dropdown (when league has multiple seasons)

---

#### Task 3.2.2 — Rankings Tab

**File:** `src/components/leagues/RankingsTab.tsx`
**Wireframe:** `league-dashboard.html`

**UI:**
- Season picker (if multiple seasons)
- Rankings table:
  - Rank (#), Player (avatar + name), Record (W-L), Win %, Points/ELO
  - Current user's row highlighted
  - Tap row → player profile
- Top 3 podium display (optional, above table):
  - Gold/Silver/Bronze medals, avatar, name, rating

**API:**
- `POST /api/rankings` (season_id or league_id)
- `GET /api/leagues/{id}/player-stats`

**Tests:**
- Table renders with mock ranking data
- Current user highlighted
- Tap navigates to player profile
- Season picker switches data

---

#### Task 3.2.3 — Games Tab

**File:** `src/components/leagues/GamesTab.tsx`
**Wireframe:** `league-matches.html`

**UI:**
- Session cards grouped by date:
  - Session name, date, status badge (pending/submitted)
  - Expandable: game rows within session
  - Each game row: team1 vs team2, score, win indicator
- "Log Games" FAB or button → add-games flow with this league pre-selected
- Empty state: "No games recorded yet"

**API:**
- `GET /api/leagues/{id}/sessions`
- `GET /api/seasons/{id}/matches`

---

#### Task 3.2.4 — Signups Tab

**File:** `src/components/leagues/SignupsTab.tsx`
**Wireframe:** `league-signups.html`

**UI:**
- Upcoming signup cards:
  - Date, time, court, spots (filled/max)
  - Player avatars row (signed up players)
  - "Sign Up" / "Drop Out" toggle button
  - Status: open, full, closed
- Past signups collapsed
- Admin view: manage roster, add/remove players

**API:**
- `GET /api/seasons/{id}/signups`
- `POST /api/signups/{id}/signup`
- `POST /api/signups/{id}/dropout`
- `GET /api/signups/{id}/players`

---

#### Task 3.2.5 — Chat Tab

**File:** `src/components/leagues/ChatTab.tsx`
**Wireframe:** `league-chat.html`

**UI:**
- Message list (newest at bottom, scroll to bottom on load)
- Each message: avatar, name, timestamp, message text
- Input bar at bottom: text input + send button
- Keyboard-aware (slides up with keyboard)

**API:**
- `GET /api/leagues/{id}/messages`
- `POST /api/leagues/{id}/messages`

**Requirements:**
- Auto-scroll to newest message
- Keyboard avoidance
- Message grouping by time (5-min window)
- Pull-to-refresh loads older messages

---

#### Task 3.2.6 — Info Tab

**File:** `src/components/leagues/InfoTab.tsx`
**Wireframe:** `league-info.html`

**UI (4 role states):**

**All roles:**
- League details card: name, description, gender, level, location, access type
- Home courts section: court cards with name, address
- Members section: admin avatars, member count, "View All" → member list

**Member view:**
- "Leave League" danger button (with confirmation modal)

**Admin view:**
- "Edit League" button → edit form
- "Manage Members" → member list with role management
- Season management: create/edit/close seasons
- Signup schedule management

**Visitor (open league):**
- "Join League" gold button

**Visitor (invite only):**
- "Request to Join" outline button
- Pending request state: "Request Pending" disabled button

**API:**
- `GET /api/leagues/{id}`
- `GET /api/leagues/{id}/members`
- `GET /api/leagues/{id}/home-courts`

---

#### Task 3.2.7 — League Player Stats

**File:** `src/components/leagues/PlayerStatsScreen.tsx`
**Route:** Push from rankings tab row tap
**Wireframe:** `league-player-stats.html`

**UI:**
- Player header: avatar, name, league record
- Stats grid: games, wins, losses, win %, ELO
- Partnership breakdown table
- Recent matches in this league

**API:**
- `GET /api/players/{id}/league/{league_id}/stats`
- `GET /api/players/{id}/league/{league_id}/partnership-opponent-stats`

---

#### Task 3.2.8 — League Invite

**File:** `src/components/leagues/LeagueInviteSheet.tsx`
**Wireframe:** `league-invite.html`

**UI (bottom sheet):**
- Search bar (search players)
- Recent/suggested players list
- Each player: avatar, name, level badge, "Invite" button
- Share invite link section: copy link button

**API:**
- `GET /api/players?q=` (search)
- League join link generation

---

### Epic 3.3 — Pending Invites

#### Task 3.3.1 — Pending Invites Screen

**File:** `app/(stack)/pending-invites.tsx`
**Wireframe:** `pending-invites.html`

**UI:**
- TopNav: back, "Pending Invites"
- List of pending placeholder invites:
  - Placeholder name, match count, date created
  - "Copy Invite Link" button
  - "Delete" danger button (with confirmation)
- Empty state: "No pending invites"

**API:**
- `GET /api/players/placeholder`
- `GET /api/players/{id}/invite-url`
- `DELETE /api/players/placeholder/{id}`

---

---

## Phase 4 — Add Games Tab (Sessions & Score Entry)

> Goal: Session creation, live session management, match/score entry flows,
> and pickup game quick entry. (AI photo capture deferred to v1.1.)

### Epic 4.1 — Add Games Entry Point

#### Task 4.1.1 — Add Games Screen

**File:** `app/(tabs)/add-games.tsx` + `src/components/sessions/AddGamesScreen.tsx`
**Wireframe:** `add-games.html`

**UI:**
- TopNav: "Add Games"
- Three entry paths as large cards:
  1. **League Game** — "Log games for a league session" → league select
  2. **Pickup Game** — "Quick game with friends" → create pickup session
  3. **AI Score Capture** — "Take a photo of the scoreboard" → **"Coming Soon" badge, non-interactive (v1.1)**
- Active sessions section (if any open):
  - "Continue Session" cards → session detail

**Navigation:**
- League Game → `add-games-league-select`
- Pickup Game → `session-create` (no league)
- AI Capture → camera permission → photo upload flow

---

#### Task 4.1.2 — League Select for Games

**File:** `src/components/sessions/LeagueSelectScreen.tsx`
**Wireframe:** `add-games-league-select.html`

**UI:**
- TopNav: back, "Select League"
- List of user's leagues:
  - League card: name, active season badge
  - Tap → session-create with league pre-selected
- "Pickup Game (No League)" option at bottom

**API:** `GET /api/users/me/leagues`

---

### Epic 4.2 — Session Management

#### Task 4.2.1 — Create Session Screen

**File:** `app/(stack)/session/create.tsx` + `src/components/sessions/CreateSessionScreen.tsx`
**Wireframe:** `session-create.html`

**UI:**
- TopNav: back, "New Session"
- Form:
  - Session Name (optional text input)
  - Date/Time picker (defaults to now)
  - Location: court picker (search, select from courts)
  - Type pills: "League" (pre-selected if from league flow) or "Pickup"
  - If league: season auto-selected (latest active)
- "Start Session" gold button → navigates to active session

**API:** `POST /api/sessions`

---

#### Task 4.2.2 — Active Session Screen

**File:** `app/(stack)/session/[code].tsx` + `src/components/sessions/ActiveSessionScreen.tsx`
**Wireframe:** `session-active.html`

**UI:**
- TopNav: back, session name, right: share + menu (three dots)
- Session info bar: code (copyable), player count, date
- Segment control: "Scores" | "Players"

**Scores view:**
- List of recorded matches:
  - Match card: team1 (2 players) vs team2 (2 players), score
  - Swipe to edit/delete (creator or admin only)
- "Add Game" button → score entry flow
- Empty state: "No games yet" + "Add your first game"

**Players view:**
- List of session participants:
  - Avatar, name, games played in session
  - "Invite" button → player search sheet
  - Leave session option (for self)

**Menu actions (bottom sheet):**
- Share session (copy code / share link)
- Edit session details
- Submit scores (if creator/admin, locks session)
- Delete session (with confirmation)

**API:**
- `GET /api/sessions/by-code/{code}`
- `GET /api/sessions/{id}/matches`
- `GET /api/sessions/{id}/participants`
- `POST /api/sessions/join`
- `PATCH /api/sessions/{id}` (submit)
- `DELETE /api/sessions/{id}`

**Requirements:**
- Session code is large, tappable-to-copy with haptic
- Real-time feel: optimistic match additions
- Submit confirmation modal warns about locking
- Share uses native share sheet

---

#### Task 4.2.3 — Session Detail (Read-Only)

**File:** `src/components/sessions/SessionDetailScreen.tsx`
**Wireframe:** `session-detail.html`

**UI:**
- Same as active session but read-only (submitted/closed sessions)
- No "Add Game" button
- Match list shows final scores
- Status badge: "Submitted" or "Closed"

---

#### Task 4.2.4 — Session Edit Details

**File:** `src/components/sessions/SessionEditScreen.tsx`
**Wireframe:** `session-edit-details.html`

**UI:**
- TopNav: "Cancel" back, "Edit Session", "Save" right
- Editable fields: name, date, court
- If league session: season selector

**API:** `PATCH /api/sessions/{id}`

---

#### Task 4.2.5 — Session Roster Management

**File:** `src/components/sessions/RosterManageSheet.tsx`
**Wireframe:** `session-roster-manage.html`

**UI (bottom sheet):**
- Current participants list with remove button
- "Add Player" section: search input
  - Search results: player cards with "Add" button
  - "Create Placeholder" option for unknown players
- Batch invite option

**API:**
- `POST /api/sessions/{id}/invite`
- `POST /api/sessions/{id}/invite_batch`
- `DELETE /api/sessions/{id}/participants/{player_id}`

---

### Epic 4.3 — Score Entry

#### Task 4.3.1 — Score Entry Screen

**File:** `src/components/sessions/ScoreEntryScreen.tsx`
**Wireframe:** `score-league.html` + `score-scoreboard.html`

**UI:**
- Full-screen score entry (modal presentation)
- Team 1 section:
  - Player 1 picker (search/select from session participants)
  - Player 2 picker
  - Score input (large number, +/- steppers or direct input)
- Team 2 section (same layout)
- Score display: large "21 - 19" center display
- "Save Game" button
- "Cancel" top-left

**Requirements:**
- Players searchable from session participants + league members + all players
- Score validation: both scores required, reasonable range (0-99)
- Haptic feedback on score change
- Quick-entry: tap player name to cycle through recent players
- Create placeholder player inline if player not found

**API:** `POST /api/matches`

**Tests:**
- Player selection works
- Score input validates
- Save creates match and returns to session
- Cancel discards without saving

---

#### Task 4.3.2 — AI Score Capture *(Deferred to v1.1)*

> **This task is out of scope for v1.** See [v1.1 Roadmap](#v11-roadmap) for details.
> The "AI Score Capture" card on the Add Games screen should still appear but show
> a "Coming Soon" badge and be non-interactive.

---

### Epic 4.4 — Pickup Game Quick Entry

#### Task 4.4.1 — Pickup Game Screen

**File:** `src/components/sessions/PickupGameScreen.tsx`
**Wireframe:** `add-games-pickup.html`

**UI:**
- TopNav: back, "Pickup Game"
- Simplified score entry (no session creation):
  - Team 1: two player pickers + score
  - Team 2: two player pickers + score
  - Date picker (defaults to today)
  - "Public Game" toggle (visible in stats)
  - "Ranked" toggle
- "Save Game" button

**API:** `POST /api/matches` (no session_id, no league_id)

---

---

## Review Gate 2 — Core Gameplay Audit

> **Trigger:** After Phases 2, 3, and 4 are complete.
> **Milestone:** "Can a user find a league, join it, play games, and see their stats?"
> This gate validates the core value loop of the app works end-to-end.

### RG2.1 — End-to-End Flow Validation

Manually test (or write E2E tests for) these critical user journeys:

- [ ] **New user journey:** Login → see empty home → find league → join league → view league dashboard → view rankings
- [ ] **Record a game:** Home → Add Games tab → select league → create session → add 2 games with scores → submit session → verify games appear in league Games tab and My Games
- [ ] **Pickup game:** Add Games → Pickup Game → enter teams + score → save → verify in My Games
- [ ] **View stats:** Home → tap stats card → My Stats screen → verify ELO, win rate, games count match expectations
- [ ] **League admin flow:** Create league → invite arrives → other user joins → admin sees member in list
- [ ] **Session sharing:** Create session → copy code → another user joins by code → both see each other in participants

### RG2.2 — Code Quality & Refactoring

- [ ] Run `/simplify` across all Phase 2-4 code.
- [ ] **Component reuse audit:** Are league cards, match cards, session cards, player cards consistent in style? Should they share a base component?
- [ ] **Hook consolidation:** Are multiple screens duplicating the same fetch-paginate-refresh pattern? Should `useInfiniteList` be enhanced rather than having custom logic per screen?
- [ ] **Service layer:** Any services growing beyond pure API wrappers? Business logic should live in hooks or components, not services.
- [ ] **State management:** Is React Context still sufficient, or are we prop-drilling or re-rendering too broadly? Consider if any context should be split.
- [ ] **File size check:** No file over 400 lines.

### RG2.3 — Test Coverage

- [ ] Run `npx jest --coverage` — verify **80%+ coverage** on all Phase 2-4 code.
- [ ] Are FlashList/infinite-scroll patterns tested? (Load initial → scroll → load more → error → retry)
- [ ] Are form flows tested? (Create league validation, score entry validation, session creation)
- [ ] Are optimistic updates tested? (Add game → shows immediately → API confirms/fails)
- [ ] **Zero test failures, zero warnings.**

### RG2.4 — Performance Check

- [ ] Home screen loads in under 2 seconds (all API calls parallelized).
- [ ] League dashboard tab switches are instant (no full re-fetch on tab change).
- [ ] Long lists (matches, players) scroll at 60fps — verify with Perf Monitor in dev menu.
- [ ] No unnecessary re-renders: use React DevTools Profiler on Home, League Dashboard, Active Session.

### RG2.5 — Requirements Clarification

**STOP and ask the human:**

- [x] **Score entry UX:** Scoreboard UI is correct — keep as wireframed.
- [x] **Session auto-join:** Same behavior as web — auto-join when navigating to a session by code.
- [x] **Photo score capture:** **Deferred to v1.1.** Camera permissions, polling, and complex state machine are out of scope for v1. See [v1.1 Roadmap](#v11-roadmap) below.
- [x] **League admin on mobile:** Full admin features are included — wireframes cover this via the "admin" toggle. Adhere to wireframes.
- [x] **Home screen layout:** Adhere to wireframes as-is. No sections cut.

### RG2.6 — Cross-Screen Consistency

- [ ] Navigation patterns consistent: all detail screens have back button in same position, all use TopNav.
- [ ] Loading states consistent: all screens use the same skeleton component pattern.
- [ ] Error states consistent: all screens show the same error UI with retry.
- [ ] Empty states consistent: all use EmptyState component with icon + text + CTA.
- [ ] Pull-to-refresh on every scrollable screen.
- [ ] Dark mode verified on every new screen.

**Exit criteria:** ALL user journeys pass, ALL tests passing (zero failures — "pre-existing" is not an exemption), all checklist items green, human questions answered, refactoring changes implemented and re-tested. Do NOT proceed to Phase 5 until everything passes.

---

---

## Phase 5 — Social Tab (Friends, Messages, Notifications)

> Goal: Friends list/requests/suggestions, direct messaging, and notification center.

### Epic 5.1 — Social Tab Shell

#### Task 5.1.1 — Social Tab Screen

**File:** `app/(tabs)/social.tsx` + `src/components/social/SocialScreen.tsx`
**Wireframe:** `messages.html` (Social tab with sub-navigation)

**UI:**
- TopNav: "Social"
- Sub-navigation (SegmentControl or TabView): Messages | Friends | Notifications
- Each sub-tab is a separate component
- Badge counts on Friends (pending requests) and Notifications (unread)

---

### Epic 5.2 — Friends

#### Task 5.2.1 — Friends Sub-Tab

**File:** `src/components/social/FriendsTab.tsx`
**Wireframe:** `friends.html`

**UI sections:**

1. **Friend Requests** (collapsible, shown if any pending):
   - Incoming requests: avatar, name, mutual friends count
     - "Accept" (green) + "Decline" (gray) buttons
   - Outgoing requests: avatar, name, "Pending" badge, "Cancel" button

2. **My Friends** (searchable list):
   - Search bar at top
   - Friend cards: avatar, name, level badge, location
   - Tap → player profile
   - Swipe left → "Remove Friend" (with confirmation)
   - Empty state: "No friends yet" + "Find Players" CTA

3. **Suggestions** (horizontal scroll):
   - "People You May Know"
   - Player cards: avatar, name, mutual friends count
   - "Add Friend" button on each
   - "See All" → find-players screen

**API:**
- `GET /api/friends` (paginated)
- `GET /api/friends/requests?direction=both`
- `GET /api/friends/suggestions`
- `POST /api/friends/request`
- `POST /api/friends/requests/{id}/accept`
- `POST /api/friends/requests/{id}/decline`
- `DELETE /api/friends/requests/{id}` (cancel outgoing)
- `DELETE /api/friends/{player_id}` (remove friend)

**Requirements:**
- Optimistic updates: accept/decline immediately updates UI
- Pull-to-refresh
- Haptic on accept/decline

**Tests:**
- Renders all three sections
- Accept/decline/cancel update UI
- Search filters friends list
- Remove friend with confirmation

---

#### Task 5.2.2 — Find Players Screen

**File:** `app/(stack)/find-players.tsx` + `src/components/social/FindPlayersScreen.tsx`
**Wireframe:** `find-players.html`

**UI:**
- TopNav: back, search mode
- Search bar (debounced, 300ms)
- Filter chips: Location, Gender, Level
- Player cards (list):
  - Avatar, name, level badge, location, games played
  - Friend status badge (none / pending / friends)
  - "Add Friend" / "Pending" / "Friends" button
- Infinite scroll pagination

**API:** `GET /api/friends/discover` with filters

**Requirements:**
- Friend status shown on each card (batch-status call or inline)
- Adding friend is optimistic
- Sort options: name, games, rating

---

### Epic 5.3 — Messages

#### Task 5.3.1 — Messages Sub-Tab (Conversation List)

**File:** `src/components/social/MessagesTab.tsx`
**Wireframe:** `messages.html`

**UI:**
- Conversation list:
  - Avatar, player name, last message preview (truncated), timestamp
  - Unread indicator (bold text + blue dot)
  - Tap → message thread
- "New Message" FAB → friend picker bottom sheet
- Empty state: "No messages yet" + "Start a conversation with a friend"

**API:** `GET /api/messages/conversations`

**Requirements:**
- Conversations sorted by most recent message
- Unread conversations visually distinct
- Real-time updates via WebSocket `direct_message` events
- Pull-to-refresh

---

#### Task 5.3.2 — Message Thread Screen

**File:** `app/(stack)/messages/[playerId].tsx` + `src/components/social/MessageThread.tsx`
**Wireframe:** `message-thread.html`

**UI:**
- TopNav: back, player name + avatar, right: player profile link
- Message list (inverted FlatList, newest at bottom):
  - Date separators: "Today", "Yesterday", weekday name
  - Sent messages: right-aligned, teal/blue bubble
  - Received messages: left-aligned, gray bubble
  - Timestamp below each message (subtle)
- Input bar (keyboard-aware):
  - Text input (multiline, max 500 chars)
  - Character counter (near limit)
  - Send button (disabled when empty, teal when active)
- "Load older messages" at top (pagination)

**API:**
- `GET /api/messages/conversations/{player_id}` (paginated, newest first)
- `POST /api/messages/send`
- `PUT /api/messages/conversations/{player_id}/read`

**Requirements:**
- Auto-scroll to bottom on open and new message
- Mark as read on open
- Real-time incoming messages via WebSocket
- Optimistic send (show message immediately, retry on failure)
- Keyboard avoidance (input bar slides up)
- 500 char limit with counter
- Haptic on send

**Tests:**
- Messages render in correct order
- Send adds message optimistically
- Date separators group correctly
- Character limit enforced

---

#### Task 5.3.3 — Friend Picker Bottom Sheet

**File:** `src/components/social/FriendPickerSheet.tsx`

**UI:**
- Bottom sheet with search bar
- Friends list (filtered by search)
- Tap friend → navigate to thread with that friend

**API:** `GET /api/friends`

---

### Epic 5.4 — Notifications

#### Task 5.4.1 — Notifications Sub-Tab

**File:** `src/components/social/NotificationsTab.tsx`
**Wireframe:** `notifications.html`

**UI:**
- Filter toggle: "Unread" | "All"
- Notification list:
  - Each notification: icon (type-specific), title, body, timestamp
  - Unread: white bg; read: slightly gray bg
  - Actionable notifications (inline):
    - Friend request: "Accept" / "Decline" buttons
    - League join request: "Approve" / "Reject" buttons (if admin)
  - Tap → deep-link navigation (to relevant screen)
- "Mark All as Read" button in header
- Empty state: "All caught up!" + bell icon

**API:**
- `GET /api/notifications?limit=20&offset=0`
- `PUT /api/notifications/{id}/read`
- `PUT /api/notifications/mark-all-read`

**Requirements:**
- Real-time: new notifications appear at top via WebSocket
- Inline actions work without leaving the screen
- Haptic on new notification arrival
- Badge count on tab updates in real-time

**Tests:**
- Renders notification list
- Filter toggle switches between unread/all
- Inline actions (accept friend request) work
- Mark all as read clears unread state
- Tap navigates to correct screen

---

---

## Phase 6 — Profile Tab & Settings

> Goal: Own profile view/edit, public player profiles, and settings screens.

### Epic 6.1 — Profile Tab

#### Task 6.1.1 — Profile Screen

**File:** `app/(tabs)/profile.tsx` + `src/components/profile/ProfileScreen.tsx`
**Wireframe:** `profile.html`

**UI:**
- Profile header:
  - Large avatar (tappable to change photo)
  - Name, nickname
  - Location, level badge, gender badge
  - "Edit Profile" button
- Stats bar: Games, Wins, Win Rate, ELO (horizontal, tappable → My Stats)
- SegmentControl: "Stats" | "Games" | "Leagues"

**Stats sub-tab:**
- Trophies/Awards section
- Quick stats grid (same as My Stats overview)
- "View Full Stats" → My Stats screen

**Games sub-tab:**
- Recent matches list (last 10)
- "View All Games" → My Games screen

**Leagues sub-tab:**
- My leagues list (compact cards)
- "Find Leagues" CTA

- Settings gear icon in TopNav right → Settings screen

**API:**
- `GET /api/users/me/player`
- `GET /api/players/{id}/stats`
- `GET /api/players/{id}/awards`
- `POST /api/matches/search` (recent, limit 10)
- `GET /api/users/me/leagues`

---

#### Task 6.1.2 — Edit Profile Modal

**File:** `src/components/profile/EditProfileModal.tsx`

**UI (full-screen modal):**
- Avatar with camera overlay (tap to change/remove)
- Form fields:
  - First Name, Last Name
  - Nickname (optional)
  - Gender (pill selector)
  - Skill Level (pill selector)
  - Location (dropdown)
  - City, State
  - Date of Birth (date picker)
  - Height (optional)
  - Preferred Side (Left/Right/Both pills)
- "Save" button
- "Cancel" top-left

**API:**
- `PUT /api/users/me/player`
- `POST /api/users/me/avatar` (photo upload)
- `DELETE /api/users/me/avatar`

**Requirements:**
- Image picker (camera or gallery)
- Image cropping (circular crop for avatar)
- Form validation (name required, location required)
- Optimistic avatar update

---

### Epic 6.2 — Public Player Profile

#### Task 6.2.1 — Player Profile Screen

**File:** `app/(stack)/player/[id].tsx` + `src/components/profile/PlayerProfileScreen.tsx`
**Wireframe:** `player-profile.html`

**UI:**
- Profile header: avatar, name, location, level, gender badges
- Friend status action:
  - Not friends: "Add Friend" button
  - Request sent: "Pending" badge
  - Friends: "Friends" badge + message icon
- Stats bar: Games, Wins, Win Rate, ELO
- Mutual friends row (if any): avatar stack + "X mutual friends"
- SegmentControl: "Stats" | "Games" | "Courts"

**Stats tab:**
- Awards/trophies
- Stats grid
- Partnership breakdown

**Games tab:**
- Recent matches list
- League filter

**Courts tab:**
- Home courts list (court cards)

- Action sheet (three dots menu): Block, Report

**API:**
- `GET /api/public/players/{id}`
- `GET /api/players/{id}/stats`
- `GET /api/players/{id}/matches`
- `GET /api/players/{id}/awards`
- `GET /api/players/{id}/home-courts`
- `GET /api/friends/mutual/{id}`
- `POST /api/friends/batch-status` (for friend status)

**Requirements:**
- Friend action is context-aware
- Message button only shown if friends
- Mutual friends tappable → their profiles

---

### Epic 6.3 — Settings

#### Task 6.3.1 — Settings Screen

**File:** `app/(stack)/settings.tsx` + `src/components/profile/SettingsScreen.tsx`
**Wireframe:** `settings.html`

**UI:**
- TopNav: back, "Settings"
- Settings sections (ListItem rows):
  - **Account**: Account Settings → settings/account
  - **Notifications**: Push Notification Preferences → settings/notifications
  - **Appearance**: Dark Mode toggle (system/light/dark)
  - **About**: App Version, Terms of Service, Privacy Policy
  - **Support**: Send Feedback (→ feedback form), Help Center
  - **Danger Zone**: "Delete Account" (red text, → confirmation flow)
  - "Log Out" button (red, bottom)

**Requirements:**
- Dark mode toggle uses ThemeContext.setThemeMode
- Version from expo-constants
- Feedback uses `POST /api/feedback`
- Logout clears tokens and navigates to welcome
- Delete account: confirmation modal → `POST /api/users/me/delete` → explanation of 30-day grace

---

#### Task 6.3.2 — Account Settings Screen

**File:** `app/(stack)/settings/account.tsx`
**Wireframe:** `settings-account.html`

**UI:**
- TopNav: back, "Account"
- Avatar (tappable to change)
- Fields: First Name, Last Name, Email, Phone (read-only)
- "Change Password" → settings/change-password
- Location settings

**API:** `PUT /api/users/me`, `PUT /api/users/me/player`

---

#### Task 6.3.3 — Notification Settings Screen

**File:** `app/(stack)/settings/notifications.tsx`
**Wireframe:** `settings-notifications.html`

**UI:**
- TopNav: back, "Notifications"
- Toggle sections:
  - **Games**: New match recorded, Session submitted
  - **Social**: Friend requests, Messages, League invites
  - **Leagues**: New season, Signup reminders, League chat
  - **General**: App updates, Tips & tricks
- Each toggle: label + description + Switch component

**Requirements:**
- Toggles persist to device (AsyncStorage or SecureStore)
- Push token registration: `POST /api/push-tokens` on enable
- Push token removal: `DELETE /api/push-tokens` on disable all

---

#### Task 6.3.4 — Change Password Screen

**File:** `app/(stack)/settings/change-password.tsx`
**Wireframe:** `change-password.html`

**UI (3 states: default, error, success):**
- TopNav: back → Account, "Change Password"
- Success banner (green, conditional)
- Error banner (red, conditional)
- Current Password input (red border on error)
- New Password input + "At least 8 characters" hint
- Confirm New Password input
- "Update Password" button

**API:** `POST /api/auth/change-password` with `{ current_password, new_password }` (auth required)

**Backend prerequisite:** This endpoint does NOT exist yet. Must be added before this
screen can function. Until it's built, show a disabled state or hide the menu item.
Add to backend: `POST /api/auth/change-password` — accepts `{ current_password, new_password }`,
validates current password, updates password, returns success.

**States:**
- Default: no banners, clean form
- Error: red banner + red border on current password + error text
- Success: green banner, form clears

---

---

## Phase 7 — Courts & Locations

> Goal: Court directory, court detail with reviews/photos/check-ins, and location browsing.

### Epic 7.1 — Courts

#### Task 7.1.1 — Courts Browser Screen

**File:** `app/(stack)/courts.tsx` + `src/components/courts/CourtsBrowserScreen.tsx`
**Wireframe:** `courts.html`

**UI:**
- TopNav: back, "Courts", search toggle
- Search bar (debounced)
- Filter chips: Location, Amenities (Lights, Free, Restrooms, Parking, Nets)
- Sort: Distance (requires location permission), Rating, Name
- Court cards (list):
  - Photo (or placeholder), name, address
  - Rating stars, review count
  - Distance (if location available)
  - Amenity badges (icons for lights, free, etc.)
  - Tap → court detail
- Map / List toggle button (switches between list and map view)
- **Map view** (react-native-maps):
  - Map centered on user's location (or default region)
  - Court pins with mini-callout (name, rating)
  - Tap pin → court detail
  - Re-search when map moves
- Infinite scroll pagination (list view)

**API:** `GET /api/public/courts` with filters (include `lat`, `lng`, `radius` for map bounds)

---

#### Task 7.1.2 — Court Detail Screen

**File:** `app/(stack)/court/[slug].tsx` + `src/components/courts/CourtDetailScreen.tsx`
**Wireframe:** `court-detail.html`

**UI:**
- Hero: court photo carousel (horizontal scroll, page dots)
- Court info card:
  - Name, address (tappable → Maps)
  - Rating (stars + count)
  - Amenities row (icon badges)
  - Hours, phone (tappable), website (tappable)
  - Cost info
  - Description
- Action buttons:
  - "Check In" / "Checked In" toggle
  - "Add to Home Courts" / "Remove" toggle
  - "Suggest Edit" → edit form
  - "Share" → native share
- Photos section: grid of photos + "See All" → court-photos
- Reviews section:
  - Average rating + breakdown bar chart
  - Review cards: avatar, name, rating stars, text, date, photos
  - "Write a Review" button → review form
- Leaderboard section: top players at this court
- Nearby courts section: horizontal scroll of other courts
- Leagues section: leagues that play here

**API:**
- `GET /api/public/courts/{slug}`
- `GET /api/public/courts/{slug}/check-ins`
- `GET /api/public/courts/{slug}/leaderboard`
- `GET /api/public/courts/{slug}/leagues`
- `POST /api/courts/{id}/check-in`
- `DELETE /api/courts/{id}/check-in`
- `POST /api/courts/{id}/reviews`

---

#### Task 7.1.3 — Court Photos Screen

**File:** `src/components/courts/CourtPhotosScreen.tsx`
**Wireframe:** `court-photos.html`

**UI:**
- TopNav: back, "Photos"
- Photo grid (3 columns)
- Tap photo → full-screen viewer with pinch-to-zoom
- "Add Photo" button (camera/gallery picker)

**API:**
- Court detail response includes photos
- `POST /api/courts/{id}/photos`

---

#### Task 7.1.4 — Submit Court Screen

**File:** `src/components/courts/SubmitCourtSheet.tsx`

**UI (bottom sheet or full screen):**
- Court name, address (with geocode autocomplete)
- Location dropdown
- Amenity toggles
- Court count, surface type
- Hours, cost info
- "Submit for Review" button

**API:** `POST /api/courts/submit`

---

### Epic 7.2 — Locations

#### Task 7.2.1 — Location integration is handled via filters on courts and players screens. No dedicated location screen needed for MVP — the web's `/beach-volleyball` directory is SEO-focused and not needed in mobile.

---

---

## Phase 8 — KOB Tournaments

> Goal: Create, manage, and view live King of the Beach tournaments.

### Epic 8.1 — Tournament List & Creation

#### Task 8.1.1 — Tournaments Screen

**File:** `app/(stack)/tournaments.tsx` + `src/components/kob/TournamentsScreen.tsx`
**Wireframe:** `tournaments.html`

**UI:**
- TopNav: back, "Tournaments"
- "My Tournaments" section:
  - Tournament cards: name, date, status badge (setup/active/completed), player count
  - Tap → tournament detail/manage
- "Create Tournament" gold button → kob/create
- "Join by Code" input → navigate to tournament

**API:** `GET /api/kob/tournaments/mine`

---

#### Task 8.1.2 — Create KOB Tournament

**File:** `app/(stack)/kob/create.tsx` + `src/components/kob/KobCreateScreen.tsx`
**Wireframe:** `kob-create.html`

**UI:**
- TopNav: back, "New Tournament"
- Form:
  - Tournament Name
  - Date picker
  - Location / Court picker
  - Number of Players (stepper, 4-32)
  - Number of Courts (stepper, 1-8)
  - Format recommendation pills (from API):
    - Each pill: format name, estimated duration, max games/player
    - Pre-computed by backend based on players + courts
  - Advanced settings (expandable):
    - Format override: Round Robin, Pool Play, Single Elim, Double Elim
    - Score to: 28, 21, 15, 11, 7
    - Games per match: 1, 2, 3
    - Pool count, playoff size, max rounds
- "Create Tournament" button

**API:**
- `GET /api/kob/recommend/pills?num_players&num_courts`
- `GET /api/kob/recommend` (full recommendation)
- `POST /api/kob/tournaments`

---

### Epic 8.2 — Tournament Management (Director)

#### Task 8.2.1 — Tournament Setup/Detail Screen

**File:** `app/(stack)/kob/manage/[id].tsx` + `src/components/kob/KobManageScreen.tsx`
**Wireframe:** `tournament-detail.html` + `tournament-edit.html`

**UI (setup state):**
- Tournament header: name, code (shareable), date, location
- Player roster:
  - Added players with seed numbers (drag to reorder)
  - "Add Player" → player search sheet
  - Remove player (swipe or X)
- "Start Tournament" button (requires minimum players)

**UI (active state):**
- TabView: Now Playing | Standings | Schedule
- Director controls:
  - Submit/edit scores for any match
  - Advance to next round
  - Drop player mid-tournament

**API:**
- `GET /api/kob/tournaments/{id}`
- `POST /api/kob/tournaments/{id}/players`
- `DELETE /api/kob/tournaments/{id}/players/{player_id}`
- `PUT /api/kob/tournaments/{id}/seeds`
- `POST /api/kob/tournaments/{id}/start`
- `POST /api/kob/tournaments/{id}/advance`
- `PATCH /api/kob/tournaments/{id}/matches/{matchup_id}`
- `POST /api/kob/tournaments/{id}/complete`

---

#### Task 8.2.2 — Tournament Invite Screen

**File:** `src/components/kob/TournamentInviteSheet.tsx`
**Wireframe:** `tournament-invite.html`

**UI (bottom sheet):**
- Share code: large code display + copy button
- Share link: "Share" button (native share)
- QR code (optional, stretch goal)
- Search + invite specific players

---

### Epic 8.3 — Live Tournament View (Public)

#### Task 8.3.1 — KOB Live Screen

**File:** `app/(stack)/kob/[code].tsx` + `src/components/kob/KobLiveScreen.tsx`
**Wireframe:** `kob-live.html`

**UI:**
- Tournament header: name, status, round indicator
- TabView: Now Playing | Standings | Schedule

**Now Playing tab:**
- Active matches:
  - Court number badge
  - Team 1 vs Team 2 (player names)
  - Score (if in progress)
  - "Submit Score" button (public, no auth required)

**Standings tab:**
- Wireframe: `kob-standings.html`
- Player standings table: rank, name, W-L record, points, +/- diff
- Pool grouping (if pool play format)

**Schedule tab:**
- Wireframe: `kob-schedule.html`
- Round-by-round match list
- Completed matches show scores
- Upcoming matches show court assignment

**API:**
- `GET /api/kob/{code}` (public, polled every 5s)
- `POST /api/kob/{code}/score?matchup_id=` (public score submission)

**Requirements:**
- Auto-refresh every 5 seconds (polling, not WebSocket)
- Public score submission: simple form, no auth
- Score submission includes optimistic update
- Tournament code prominent for sharing

---

---

## Review Gate 3 — Feature-Complete Audit

> **Trigger:** After Phases 5, 6, 7, and 8 are complete.
> **Milestone:** Every screen in the wireframe set has a working implementation.
> This is the most comprehensive review — the app should be "feature-complete"
> after this gate, with only real-time and polish remaining.

### RG3.1 — Full Feature Inventory Check

Walk through every wireframe (51 files) and confirm each has a corresponding implemented screen:

**Auth/Onboarding:**
- [ ] welcome.html → welcome screen
- [ ] login.html → login screen
- [ ] signup.html → signup screen
- [ ] forgot-password.html → forgot password (all 4 states)
- [ ] onboarding.html → onboarding wizard
- [ ] invite-claim.html → invite claim screen

**Home:**
- [ ] home.html → home tab
- [ ] my-games.html → my games screen
- [ ] my-stats.html → my stats screen (if separate from profile stats tab)

**Leagues:**
- [ ] leagues-tab.html → leagues tab
- [ ] find-leagues.html → find leagues screen
- [ ] create-league.html → create league screen
- [ ] league-dashboard.html → league dashboard (rankings tab)
- [ ] league-matches.html → league games tab
- [ ] league-chat.html → league chat tab
- [ ] league-signups.html → league signups tab
- [ ] league-info.html → league info tab
- [ ] league-player-stats.html → league player stats screen
- [ ] league-invite.html → league invite sheet
- [ ] pending-invites.html → pending invites screen

**Sessions/Scores:**
- [ ] session-create.html → create session screen
- [ ] session-active.html → active session screen
- [ ] session-detail.html → session detail (read-only)
- [ ] session-edit-details.html → session edit
- [ ] session-roster-manage.html → roster manage sheet
- [ ] session-menu.html → session action menu
- [ ] add-games.html → add games entry point
- [ ] add-games-league-select.html → league select
- [ ] add-games-pickup.html → pickup game
- [ ] score-league.html → score entry
- [ ] score-scoreboard.html → scoreboard UI
- [ ] ai-score-capture.html → AI capture (**deferred to v1.1** — wireframe kept for reference)

**Social:**
- [ ] friends.html → friends tab
- [ ] find-players.html → find players screen
- [ ] messages.html → messages tab
- [ ] message-thread.html → message thread
- [ ] notifications.html → notifications tab

**Profile/Settings:**
- [ ] profile.html → profile tab
- [ ] player-profile.html → public player profile
- [ ] settings.html → settings screen
- [ ] settings-account.html → account settings
- [ ] settings-notifications.html → notification settings
- [ ] change-password.html → change password

**Courts:**
- [ ] courts.html → courts browser
- [ ] court-detail.html → court detail
- [ ] court-photos.html → court photos

**Tournaments:**
- [ ] tournaments.html → tournaments list
- [ ] tournament-detail.html → tournament manage
- [ ] tournament-edit.html → tournament edit
- [ ] tournament-invite.html → tournament invite
- [ ] kob-create.html → KOB create
- [ ] kob-live.html → KOB live
- [ ] kob-standings.html → standings tab
- [ ] kob-schedule.html → schedule tab

### RG3.2 — Code Quality Deep Dive

- [ ] Run `/simplify` across ALL app code (not just recent phases).
- [ ] **Shared component audit:** Now that all features are built, identify components that were built independently but should be unified:
  - Player card (used in friends, find-players, league members, session participants, suggestions, KOB roster)
  - Match/game card (used in home, my-games, league games, session scores, player profile)
  - League card (used in home, leagues tab, find-leagues, profile leagues tab)
  - Court card (used in home discovery, courts browser, court detail nearby, player home courts)
- [ ] **Extract shared patterns:** If 3+ screens do the same thing, extract to a shared component or hook.
- [ ] **Dead code sweep:** Run `npx knip` or manually check for unused exports.
- [ ] **File organization:** Are files in the right directories? Any component that's used across multiple feature domains should move to `components/shared/`.
- [ ] **No file over 400 lines.**
- [ ] **Import graph:** No circular dependencies. Run `npx madge --circular src/`.

### RG3.3 — Test Coverage & Quality

- [ ] `npx jest --coverage` — **80%+ across the board**.
- [ ] **Critical path coverage:** Do the following flows have integration tests?
  - Login → home → league → games → score entry → submit
  - Friends: send request → accept → message → conversation list
  - Profile: edit → save → verify changes persist
  - Courts: browse → detail → check-in → review
  - KOB: create → add players → start → submit score → standings update
- [ ] Are edge cases covered? (empty lists, error states, network failures, token expiry mid-action)
- [ ] **Zero failures, zero warnings.**

### RG3.4 — Visual Consistency Audit

- [ ] Screenshot every screen in light mode. Screenshot every screen in dark mode. Review side-by-side.
- [ ] Spacing consistent? (Same padding/margins for similar sections across screens)
- [ ] Typography consistent? (Same heading sizes, body text sizes, caption sizes)
- [ ] Color usage consistent? (Teal for primary actions, gold for accent/CTA, red for danger everywhere)
- [ ] Card styling consistent? (Same border-radius, shadow, padding across all cards)
- [ ] Empty states consistent? (Same illustration style, text pattern)

### RG3.5 — Navigation & UX Audit

- [ ] Can you reach every screen from the tab bar within 3 taps?
- [ ] Does back navigation always work correctly? (No dead ends, no stack leaks)
- [ ] Are all action sheets/bottom sheets dismissible by swipe-down AND tap-outside?
- [ ] Is keyboard avoidance working on every form screen?
- [ ] Does rotating the device (if supported) break any layout?
- [ ] Test with system font size set to maximum — does anything break?

### RG3.6 — Requirements Clarification

**STOP and ask the human:**

- [x] **Feature parity questions:** Exclusion list documented in `mobile-audit/wireframes/README.md` (Purposely Excluded section). Refer there for the canonical list.
- [ ] **Missing screens:** Review wireframes against web flows to confirm coverage. (Deferred to Gate 3 execution.)
- [x] **Data limits:** No caps for v1. Everything available on web should be available on mobile. Mobile should eventually have MORE than web.
- [x] **Haptic feedback:** Keep as spec'd: button press, score change, friend accept, send message, pull-to-refresh, notification arrival.
- [x] **Gesture support:** Use best judgement during implementation. Likely candidates: swipe between league tabs, swipe to delete/archive where it feels natural.

**Exit criteria:** Full wireframe checklist complete, shared components extracted, ALL tests passing (zero failures — "pre-existing" is not an exemption), test coverage 80%+, visual audit clean, all human questions answered. Do NOT proceed to Phase 9 until everything passes.

---

---

## Phase 9 — Real-Time & Push Notifications

> Goal: WebSocket notifications, push notification infrastructure, and
> background handling.

### Epic 9.1 — Push Notifications

#### Task 9.1.1 — Push Notification Setup

**Dependencies:** `expo-notifications`, `expo-device`

**Files:**
- `src/lib/push.ts` (push registration, permission, and token management utilities)
- Integration in `AuthContext` (register on login, unregister on logout)

**Requirements:**
- Request push permission on first login (with explanation modal)
- Register device token: `POST /api/push-tokens { token, platform: 'ios' | 'android' }`
- Handle foreground notifications (banner via Toast)
- Handle background notifications (OS notification center)
- Handle notification tap → deep-link navigation:
  - `friend_request` → Social tab / Friends
  - `message` → Message thread
  - `league_invite` → League detail
  - `match_confirmed` → Session detail
  - `signup_reminder` → League signups
- Unregister on logout: `DELETE /api/push-tokens`

**Tests:**
- Token registration called on login
- Notification tap routes to correct screen
- Token cleared on logout

---

#### Task 9.1.2 — In-App Notification Banner

**File:** `src/components/ui/NotificationBanner.tsx`

**UI:**
- Slide-down banner when notification received while app is foregrounded
- Shows notification title + body
- Tap → navigate to relevant screen
- Auto-dismiss after 4s
- Swipe up to dismiss

---

### Epic 9.2 — WebSocket Integration

#### Task 9.2.1 — WebSocket Notifications

Already covered in Task 0.4.1 (NotificationContext). This task ensures:

- WebSocket connects after auth with `{ type: 'auth', token }`
- Handles message types: `notification`, `notification_updated`, `direct_message`
- Updates badge counts in real-time
- Triggers in-app notification banner
- DM messages update conversation list + active thread
- Reconnects on network change (NetInfo)
- Disconnects cleanly on logout / app background (>5 min)

---

---

## Review Gate 4 — Integration & Real-Time Audit

> **Trigger:** After Phase 9 is complete.
> **Milestone:** The app is fully functional with real-time features. This is the
> last technical review before polish. After this gate, only visual/UX polish
> and app store prep remain.

### RG4.1 — Real-Time Integration Testing

- [ ] **WebSocket lifecycle:** Connect on login → receive notifications → background app (5+ min) → return → reconnect automatically → logout → disconnect cleanly.
- [ ] **Notification delivery:** Send a friend request from the web app. Does mobile receive it in real-time via WebSocket? Does the badge update? Does the in-app banner appear?
- [ ] **DM delivery:** Send a message from web. Does mobile show it instantly in an open thread? Does the conversation list update? Does the unread count badge update on the Social tab?
- [ ] **Push notifications (backgrounded app):** Send a notification while app is in background. Does it appear in OS notification center? Does tapping it open the correct screen?
- [ ] **Push notification deep links:** Test every notification type routes to the correct screen:
  - `friend_request` → Social / Friends tab
  - `message` → Message thread with sender
  - `league_invite` → League detail
  - `match_confirmed` → Session detail
- [ ] **Network resilience:** Toggle airplane mode on/off. Does the WebSocket reconnect? Does the offline banner appear/disappear? Do queued mutations replay?
- [ ] **Concurrent connections:** Open the app on two devices with the same account. Do both receive notifications? No duplicate handling issues?

### RG4.2 — Full Regression Test

Run the **complete test suite** — every test from every phase:

- [ ] `npx jest --coverage` — all tests pass, **80%+ coverage overall**.
- [ ] No regressions from Phase 9 changes (WebSocket setup, notification context additions shouldn't break existing screens).
- [ ] Run E2E critical paths again (from RG2.1 + RG3.1) to catch regressions.

### RG4.3 — Security Review

- [ ] **Token handling:** Access tokens never logged, never in URL params, never in error messages sent to UI.
- [ ] **SecureStore:** Tokens stored in SecureStore (not AsyncStorage). Verified by checking all `storage` references.
- [ ] **WebSocket auth:** Token sent in message body, NOT in URL query params.
- [ ] **Input sanitization:** All user inputs that display in UI are escaped (no XSS via player names, messages, league descriptions).
- [ ] **Deep link validation:** Deep links with invalid IDs/slugs show error state, don't crash.
- [ ] **Rate limiting awareness:** UI prevents rapid-fire actions (debounced buttons, disabled-while-loading).
- [ ] **No secrets in code:** `EXPO_PUBLIC_*` env vars only contain non-secret values. API keys, if any, are server-side only.

### RG4.4 — Performance Baseline

Establish performance baselines before polish phase:

- [ ] **Cold start time:** Measure time from app launch to home screen interactive. Target: < 3 seconds.
- [ ] **Screen transition time:** Measure time from tap to fully rendered detail screen. Target: < 500ms for cached data, < 1.5s for network fetch.
- [ ] **Memory usage:** Profile with Xcode Instruments / Android Studio Profiler. No memory leaks over a 10-minute usage session (navigate all tabs, open/close 10 detail screens, send messages).
- [ ] **Bundle size:** `npx expo export` — note JS bundle size. Target: < 5MB JS bundle.
- [ ] **List scroll FPS:** 60fps on mid-range device for all FlashList screens (friends, matches, notifications, players).

### RG4.5 — Final Requirements Check

**STOP and ask the human:**

- [ ] **Launch scope confirmation:** Here's everything that's built. Is anything missing for v1 launch? Anything that should be cut?
- [ ] **Beta testing plan:** Should we do a TestFlight/internal testing round before App Store submission? Who are the beta testers?
- [ ] **Backend readiness:** Are there any backend changes needed before mobile goes live? (e.g., push notification sending, rate limit tuning for mobile traffic patterns, CORS for mobile deep links)
- [ ] **Analytics:** Should we add analytics tracking (screen views, key actions) before launch? If so, which provider? (Mixpanel, Amplitude, PostHog, etc.)
- [ ] **Error tracking:** Should we add Sentry or similar crash reporting before launch?
- [ ] **App Store metadata:** Do we have: app name, subtitle, description, keywords, screenshots, privacy policy URL, support URL?

**Exit criteria:** All real-time flows verified, ALL tests passing (zero failures — "pre-existing" is not an exemption), full regression green, security review clean, performance baselines documented, human sign-off on launch scope. Do NOT proceed to Phase 10 until everything passes.

---

---

## Phase 10 — Polish, Performance & Launch Prep

> Goal: Animations, haptics, offline resilience, performance optimization,
> and app store readiness.

### Epic 10.1 — Animations & Transitions

#### Task 10.1.1 — Screen Transitions

- Shared element transitions: league card → league detail header
- Tab switch animations (horizontal slide)
- Modal presentations: slide-up with spring physics
- Bottom sheet: gesture-driven with snap points
- List item: enter/exit animations (FadeIn from reanimated)
- Skeleton shimmer: smooth left-to-right gradient animation

#### Task 10.1.2 — Micro-interactions

- Button press: scale down 0.97 + haptic
- Pull-to-refresh: custom animated indicator
- Score change: number roll animation
- Friend request accept: confetti or checkmark animation
- Tab badge: scale bounce on count change
- Toast: spring-based slide-in/out

---

### Epic 10.2 — Performance Optimization

#### Task 10.2.1 — List Performance

- Use `@shopify/flash-list` for all long lists (friends, matches, notifications, leagues, players)
- Implement `estimatedItemSize` for each list type
- Memoize list items with `React.memo`
- Image optimization: `expo-image` with `placeholder` (blur hash) and `cachePolicy`

#### Task 10.2.2 — Bundle & Startup

- Lazy-load heavy screens (charts, camera, KOB bracket)
- Preload critical data during splash screen
- Minimize bundle with tree-shaking
- Profile with Flipper/React DevTools

---

### Epic 10.3 — Offline Resilience

#### Task 10.3.1 — Network State Handling

- NetInfo listener: show offline banner when disconnected
- Queue mutations when offline, replay on reconnect
- Cache critical data (player profile, leagues) with MMKV or AsyncStorage
- Stale-while-revalidate pattern for cached data

---

### Epic 10.4 — App Store Prep

#### Task 10.4.1 — App Configuration

- `app.json` / `app.config.js`: icons, splash, permissions, schemes
- App icons: all required sizes (iOS + Android)
- Splash screen: animated with expo-splash-screen
- Deep linking: `beachleague://` scheme + universal links
- Privacy manifest (iOS): required since iOS 17

#### Task 10.4.2 — EAS Build & Submit

- `eas.json` configuration: development, preview, production profiles
- OTA update configuration (expo-updates)
- TestFlight (iOS) and Internal Testing (Android) setup
- App Store / Play Store metadata and screenshots

---

---

## Phase 11 — CI/CD Pipeline

> Goal: Automated build, test, and deployment pipeline for the mobile app.

### Epic 11.1 — CI Pipeline

#### Task 11.1.1 — GitHub Actions Workflow

**File:** `.github/workflows/mobile-ci.yml`

**Triggers:** Push to `main`, PR targeting `main`, manual dispatch

**Jobs:**
1. **Lint & Type Check:**
   - `npx tsc --noEmit`
   - ESLint (if configured)
2. **Unit & Integration Tests:**
   - `npx jest --coverage --ci`
   - Fail if coverage < 80%
   - Upload coverage report as artifact
3. **Build Check:**
   - `npx expo export` (verify JS bundle builds)
   - Report bundle size in PR comment

**Requirements:**
- Cache `node_modules` and Expo cache between runs
- Run in ~5 minutes for PR feedback
- Block merge on failing checks

---

#### Task 11.1.2 — E2E Pipeline (Nightly)

**Triggers:** Nightly cron, manual dispatch

**Jobs:**
1. Build development client (`eas build --profile development --platform ios`)
2. Run Maestro flows against built app
3. Upload test results + screenshots as artifacts
4. Slack/GitHub notification on failure

---

### Epic 11.2 — CD Pipeline (EAS)

#### Task 11.2.1 — EAS Build Profiles

**File:** `apps/mobile/eas.json`

**Profiles:**
- `development` — Dev client with debug tools, internal distribution
- `preview` — TestFlight / Internal Testing builds (triggered by tagging `mobile-v*-rc*`)
- `production` — App Store / Play Store submission (triggered by tagging `mobile-v*`)

**Requirements:**
- Environment variables managed via EAS secrets (not committed)
- Build versioning: auto-increment `buildNumber` / `versionCode`
- OTA updates via `expo-updates` for JS-only changes between releases

---

---

## Cross-Cutting Concerns

### Dark Mode

Every screen and component MUST support dark mode. Pattern:
- NativeWind `dark:` classes for most styling
- `useTheme()` hook for dynamic values (placeholder colors, keyboard appearance, status bar)
- Test both modes visually

### Accessibility

- All interactive elements: `accessibilityLabel`, `accessibilityRole`
- Minimum 44px touch targets
- Support Dynamic Type (iOS) and font scaling (Android)
- Screen reader navigation order
- Reduced motion: respect `prefers-reduced-motion`

### Error Handling

- Network errors: retry button + error message
- Auth errors (401): redirect to login
- Server errors (500): generic error screen with retry
- Form validation: inline errors below fields
- Toast for action confirmations (success/error)

### Deep Linking

Routes that must support deep links:
- `beachleague://league/{id}`
- `beachleague://session/{code}`
- `beachleague://player/{id}`
- `beachleague://court/{slug}`
- `beachleague://kob/{code}`
- `beachleague://invite/{token}`

---

## Testing Strategy

### Unit Tests (Jest + RNTL)

- **Target: 80%+ coverage** for all new code
- Every component: renders, handles props, dark mode
- Every hook: correct state transitions, error handling
- Every service: correct API calls with mocks
- Every utility function: input/output validation

### Integration Tests (Jest + RNTL)

- Auth flow: login → home redirect
- Form submissions: validation → API call → success/error handling
- List pagination: initial load → load more → refresh
- Real-time: WebSocket message → UI update

### E2E Tests (Maestro)

Maestro is a YAML-based mobile E2E testing framework officially supported by Expo.
Maestro tests live in `apps/mobile/.maestro/` and run against a real device/simulator.

Critical flows:
1. Sign up → onboarding → home
2. Login → view leagues → view league detail
3. Create session → add game → submit
4. Send friend request → accept → send message
5. Browse courts → view detail → check in
6. Create KOB tournament → add players → start → submit score
7. Deep link: open invite link → claim matches

**Example Maestro flow (login):**
```yaml
appId: com.beachleague.mobile
---
- launchApp
- tapOn: "Continue with Phone"
- tapOn: "Phone Number"
- inputText: "+15551234567"
- tapOn: "Password"
- inputText: "testpassword123"
- tapOn: "Log In"
- assertVisible: "Home"
```

### Test Infrastructure

- **API mocking:** `axios-mock-adapter` for unit/integration tests (lightweight, works directly with the shared api-client's Axios instance)
- **Test fixtures:** Reusable player, league, session factory functions
- **CI:** Run unit + integration on every PR, Maestro E2E nightly

---

## v1.1 Roadmap

Features deferred from v1 to reduce scope and complexity. These should be built after v1 ships and stabilizes.

### AI Score Capture (from Phase 4, Task 4.3.2)

**What:** Camera-based score entry — user photographs a physical scoreboard, AI extracts match results.

**Why deferred:** Requires camera permissions, expo-camera integration, multipart upload, polling state machine (2s interval, 60s timeout), editable result review, and error/timeout handling. Most complex feature in the app with the most moving parts.

**Wireframe:** `ai-score-capture.html` (already built, kept for reference)

**Implementation when ready:**
- **File:** `src/components/sessions/AiScoreCaptureScreen.tsx`
- **Dependencies:** `expo-camera`
- **UI:** Camera viewfinder, capture button, flash toggle, gallery picker, processing animation, editable results review with "Confirm All" / "Retake" / "Edit" per match
- **API:**
  - `POST /api/leagues/{id}/matches/upload-photo` (multipart) → `{ job_id }`
  - `GET /api/leagues/{id}/matches/photo-jobs/{job_id}` (poll for status)
  - `POST /api/leagues/{id}/matches/photo-sessions/{session_id}/confirm`
- **Key requirement:** Poll for progress (NOT SSE/EventSource — React Native lacks native support). Poll job status endpoint until `status === 'completed'` or `status === 'failed'`.

### Other v1.1 Candidates (from wireframes README roadmap)

| Feature | Notes |
|---------|-------|
| Global search | Unified search across players, leagues, courts, tournaments |
| Full interactive courts map | Current courts map is a placeholder |
| Court reviews and ratings | Excluded from v1 |
| League awards | Excluded from v1 |
| Connected accounts (Google/Apple) | OAuth account linking UI exists but backend not wired |

---

## Definition of Done

A task is complete when:

- [ ] UI matches wireframe (open wireframe HTML at 390x844 and compare)
- [ ] Works in light AND dark mode
- [ ] All interactive elements have 44px+ touch targets
- [ ] Loading states (skeleton) shown during data fetch
- [ ] Error states handled (network error, server error, empty data)
- [ ] Empty states shown when no data
- [ ] Pull-to-refresh works (where applicable)
- [ ] Navigation works (forward, back, deep link)
- [ ] Unit tests pass with 80%+ coverage for new code
- [ ] No TypeScript errors
- [ ] No console warnings or errors
- [ ] Haptic feedback on key interactions
- [ ] Keyboard avoidance works on forms
- [ ] Performance: no jank on scroll, no unnecessary re-renders

---

## Phase Dependency Graph

```
Phase 0 (Foundation)
  └── Phase 1 (Auth)
        └── *** REVIEW GATE 1 *** ← human approval required
              ├── Phase 2 (Home)     ┐
              ├── Phase 3 (Leagues)  ├─ parallelizable
              └── Phase 4 (Sessions) ┘
                    └── *** REVIEW GATE 2 *** ← human approval required
                          ├── Phase 5 (Social)   ┐
                          ├── Phase 6 (Profile)  ├─ parallelizable
                          ├── Phase 7 (Courts)   │
                          └── Phase 8 (KOB)      ┘
                                └── *** REVIEW GATE 3 *** ← human approval required
                                      └── Phase 9 (Real-Time)
                                            └── *** REVIEW GATE 4 *** ← human approval required
                                                  └── Phase 10 (Polish & Launch)
                                                        └── Phase 11 (CI/CD Pipeline)
```

**Key rules:**
- **No phase starts until its review gate is passed.** Gates are blocking.
- Phases within a gate group (2-4, 5-8) can be parallelized across agents.
- Each review gate includes a **STOP** point where the agent must surface
  questions to the human and wait for answers before proceeding.
- Review gates are where we simplify, refactor, ensure coverage, and course-correct.
- If a review gate reveals issues, the fix happens *before* the next phase starts — not as tech debt carried forward.

---

## Estimated Scope

| Phase | Type | Screens | Components | Tests |
|-------|------|---------|------------|-------|
| 0 - Foundation | Build | 0 | ~20 UI primitives | ~60 |
| 1 - Auth | Build | 5 | ~8 | ~30 |
| **RG1 - Foundation Audit** | **Review** | — | — | **+fix** |
| 2 - Home | Build | 3 | ~10 | ~25 |
| 3 - Leagues | Build | 10 | ~15 | ~40 |
| 4 - Sessions | Build | 8 | ~12 | ~35 |
| **RG2 - Core Gameplay Audit** | **Review** | — | — | **+fix** |
| 5 - Social | Build | 6 | ~10 | ~30 |
| 6 - Profile | Build | 6 | ~8 | ~25 |
| 7 - Courts | Build | 4 | ~8 | ~20 |
| 8 - KOB | Build | 5 | ~10 | ~25 |
| **RG3 - Feature-Complete Audit** | **Review** | — | — | **+fix** |
| 9 - Real-Time | Build | 0 | ~3 | ~15 |
| **RG4 - Integration Audit** | **Review** | — | — | **+fix** |
| 10 - Polish | Build | 0 | ~5 | ~10 |
| 11 - CI/CD | Build | 0 | 0 | ~5 |
| **Total** | | **~47** | **~109** | **~320+** |
