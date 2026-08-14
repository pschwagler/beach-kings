# Beach League Mobile App Wireframes

Static HTML wireframes (390 x 844 px, iPhone 14) for designing the native mobile app. These are a **design and styling decision tool** -- not functional prototypes.

## Purpose

1. **Lock down mobile UI/UX** before writing native code
2. **Import into Figma** via HTML-to-Design capture script for polishing and handoff
3. **Identify navigation patterns** that differ from web (tab bar, back buttons, segment controls vs full-page routes)
4. **Simplify where needed** -- the web app has deep feature nesting that doesn't translate well to mobile

## Viewing

```bash
cd mobile-audit/wireframes
python3 -m http.server 8888
# Open http://localhost:8888/welcome.html (unauth) or home.html (logged in)
```

## Design System

- `shared.css` -- base styles (reset, status bar, top nav, tab bar, state switcher, modals) + shared component patterns (content area, section title, segment control, empty state, card, form section, bottom bar, buttons, filter chip); imports design tokens and dark theme
- `design-tokens.css` -- CSS custom properties reference (colors, typography, spacing, shadows)
- `dark-theme.css` -- dark theme overrides applied via `body.dark-theme` class

### State Switcher

A sticky header bar (not production UI) lets reviewers toggle between screen states without navigating. Used in multi-state pages like invite-claim, forgot-password, score-league, score-scoreboard, tournament-detail, leagues-tab (empty), my-games (empty), messages (empty), etc.

### Shared Component Patterns (NativeWind mapping)

`shared.css` defines canonical versions of frequently-repeated patterns. Each maps to a reusable React Native / NativeWind component:

| CSS Pattern | NativeWind Component | Notes |
|---|---|---|
| `.content` | `ScrollView` with padding | `px-4 pt-3 pb-24` |
| `.section-title` | `Text` heading | `text-[15px] font-bold mb-3` |
| `.segment-control` + `.segment` | Custom `SegmentedControl` | Flex row, rounded bg, active shadow |
| `.empty-state` | Reusable `EmptyState` | Icon, title, desc, optional CTA |
| `.card` | `View` surface | `bg-white rounded-xl p-4 shadow-sm` |
| `.form-section` + `.form-row` | Form card with rows | Grouped settings pattern |
| `.bottom-bar` | Sticky bottom `View` | Action buttons above tab bar |
| `.btn-primary` / `.btn-secondary` | `Pressable` buttons | Gold CTA / outlined secondary |
| `.filter-chip` | `Pressable` pill toggle | Active state with teal bg |

## Pages (51 HTML files)

### Auth (4)
| File | Description |
|------|-------------|
| welcome | Landing page for unauthenticated users |
| login | Email/password + social (Google, Apple) login |
| signup | Registration form with profile setup |
| forgot-password | Password reset flow: request, verify OTP, new password, success |

### Home (3)
| File | Description |
|------|-------------|
| home | Dashboard: upcoming sessions, recent matches, quick actions |
| my-stats | Player stats, rating history, win/loss breakdown |
| my-games | Match history with filters |

### Leagues (11)
| File | Description |
|------|-------------|
| leagues-tab | My leagues list + join/create CTAs |
| find-leagues | Search/filter public leagues, request to join |
| create-league | League creation form |
| league-dashboard | League home: standings, upcoming, recent activity |
| league-matches | Full match history for a league |
| league-info | Public league info page |
| league-player-stats | Individual player stats within a league |
| league-chat | In-league group chat |
| league-signups | Session signup management |
| league-invite | Invite players to a league |
| pending-invites | Pending invite list with share actions |

### Sessions (4)
| File | Description |
|------|-------------|
| session-create | Start session form: date, time, location, session type, signup settings |
| session-active | Live session: checked-in players, match queue, court assignments |
| session-detail | Past session summary with all matches |
| session-menu | Session settings and actions |

### Score Entry (3)
| File | Description |
|------|-------------|
| add-games | Entry point: choose league or pickup |
| add-games-league-select | League picker for score entry |
| add-games-pickup | Quick-add for non-league games |

### Score Modals (3)
| File | Description |
|------|-------------|
| score-league | League game scoreboard (Light/Dark toggle): empty, building, scoring, error, success states |
| score-scoreboard | Pickup/session scoreboard (Light/Dark toggle): building, scoring, error, success states |
| ai-score-capture | Photo-based score capture with AI recognition |

### Courts (3)
| File | Description |
|------|-------------|
| courts | Court discovery map + list |
| court-detail | Court info, check-ins, conditions |
| court-photos | Court photo gallery |

### Tournaments (8)
| File | Description |
|------|-------------|
| tournaments | Tournament discovery and list |
| tournament-detail | Multi-role tournament view (6 states: spectator, player, organizer, etc.) |
| tournament-edit | Tournament settings editor |
| tournament-invite | Invite players to tournament |
| kob-create | King of the Beach tournament setup |
| kob-live | Live KoB bracket and scoring |
| kob-standings | KoB standings and stats |
| kob-schedule | KoB match schedule |

### Social (5)
| File | Description |
|------|-------------|
| messages | Message inbox |
| message-thread | Individual conversation |
| notifications | Notification feed with friend request actions |
| friends | Friends list with suggestions |
| find-players | Player search and discovery |

### Profile (5)
| File | Description |
|------|-------------|
| profile | User profile with edit capabilities |
| player-profile | Public player profile view |
| settings | App settings and preferences |
| settings-notifications | Push notification preferences with master toggle and sub-toggles |
| settings-account | Account security, connected accounts, privacy, delete account |

### Onboarding (2)
| File | Description |
|------|-------------|
| onboarding | First-launch walkthrough |
| invite-claim | Invite link claim flow: review games, processing, success, error |

## Navigation

**Tab Bar** (5 tabs, present on all logged-in screens):
1. Home -- home.html
2. Leagues -- leagues-tab.html
3. Add Games (FAB) -- add-games.html
4. Social -- messages.html
5. Profile -- profile.html

**Tournaments and Courts** are accessed from Home (discovery sections), not via dedicated tab bar entries.

## Purposely Excluded

The following features exist in the web app but are intentionally omitted from mobile wireframes:

| Feature | Reason |
|---------|--------|
| Admin dashboard | Web-only tool for league administrators |
| SEO content pages | Web-only marketing/landing pages |
| Privacy policy / Terms of service | Rendered as webview links from Settings, not native screens |
| Contribute page | Web-only |
| Feedback modal | Handled via app store review prompts |
| Global rankings | Covered within league standings |
| League Awards tab | Not shipping in v1 |
| Court review submission | Not shipping in v1 |
| Open sessions list | Covered as a section within home.html |
| Photo match review flow | Covered by ai-score-capture.html |
| Pending invites banner | Shown as a banner in home.html, not a separate screen |

## UX Requirements

Behaviors not captured in static wireframes but required for production implementation.

### Loading and Transitions

- **Skeleton screens**: Show content-shaped placeholders while data loads (never a blank screen or spinner-only). Match the layout of the loaded state.
- **Pull-to-refresh**: All list/feed screens (home, leagues-tab, notifications, friends, messages, courts, match history).
- **Infinite scroll**: Paginated lists (match history, notifications, find-players, find-leagues) load next page at 80% scroll.
- **Page transitions**: Push right for forward navigation, slide left for back. Modals slide up from bottom.

### Input and Keyboard

- **Keyboard avoidance**: Scroll content up so the focused input is visible above the keyboard. Score entry inputs must remain tappable during keyboard display.
- **Dismiss keyboard**: Tap outside any text input to dismiss. Score entry number pad dismisses on "Done".
- **Form validation**: Inline error messages below fields (red text, matching onboarding.html pattern). Validate on blur, re-validate on submit.

### Gestures

- **Swipe-to-dismiss**: Bottom sheet modals (score entry, session menu) can be swiped down to close.
- **Long-press**: Match cards in session-active for quick actions (edit, delete). Friend cards for remove/block.
- **Swipe actions**: Notification rows swipe left to reveal "Mark Read" / "Delete". Message threads swipe left for "Mute" / "Delete".
- **Pull-down dismiss**: Full-screen modals (score-league, score-scoreboard) can be pulled down to trigger discard confirmation.

### Feedback

- **Toast notifications**: Brief confirmation messages (bottom of screen, above tab bar, auto-dismiss after 3s). Used for: game saved, friend request sent, settings updated, invite copied.
- **Haptic feedback**: Light haptic on score +/- taps. Medium haptic on game save confirmation. Error haptic on validation failures.
- **Success animations**: Checkmark animation on game save (score-league "Save" state). Confetti on tournament win.

### Scroll Indicators

- **Horizontal scroll**: Dot pagination for horizontal card carousels (home upcoming sessions, tournament brackets). Partial card peek (show 15% of next card) to signal scrollability.
- **Vertical scroll**: Standard scroll indicator bar. "Back to top" button appears after scrolling 3+ screens.

### Connectivity

- **Offline banner**: Persistent banner below status bar: "No connection -- scores will sync when back online". Score entry and game saving must work offline with local queue.
- **Retry**: Failed network requests show inline "Tap to retry" with the error context.

### Push Notifications

Destination map (where tapping a notification navigates):

| Notification Type | Destination |
|---|---|
| Game result | match detail (within session-detail or league-matches) |
| League update | league-dashboard |
| Friend request | friends (requests section) |
| Tournament alert | tournament-detail |
| Chat message | message-thread |
| Ranking change | my-stats |
| Session starting | session-active |
| Court check-in nearby | court-detail |

### Deep Links

URL scheme: `beachleague://`

| Pattern | Screen |
|---|---|
| `beachleague://league/:id` | league-dashboard |
| `beachleague://session/:id` | session-active |
| `beachleague://player/:id` | player-profile |
| `beachleague://court/:id` | court-detail |
| `beachleague://tournament/:id` | tournament-detail |
| `beachleague://invite/:code` | invite-claim |
| `beachleague://kob/:code` | kob-live |

## Icon Library

Wireframes use emoji placeholders for icons (volleyball, trophy, bell, etc.). Production implementation should use a single consistent icon library:

- **Recommended**: [Phosphor Icons](https://phosphoricons.com/) (React Native package: `phosphor-react-native`) -- clean, consistent weight options, good sport/activity coverage
- **Alternative**: SF Symbols (iOS) + Material Symbols (Android) for platform-native feel, but requires maintaining two icon sets
- **Rule**: Pick one library. Do not mix icon families within the app.

Emoji-to-icon mapping will be defined during implementation. The wireframe emoji choices indicate the semantic intent (e.g. bell = notifications, magnifying glass = search).

## Component Inventory

Mapping from wireframe CSS patterns to React Native (Expo) components for implementation reference.

| Wireframe Pattern | React Native Component | Notes |
|---|---|---|
| `.tab-bar` + `.tab` | `expo-router` Tabs layout | 5 tabs, custom FAB for center tab |
| `.top-nav` | `Stack.Screen` options (headerStyle, headerTitle) | Back button, title, optional action |
| `.status-bar` | `expo-status-bar` StatusBar | `barStyle="light-content"` on brand bg |
| `.modal-overlay` + `.modal-box` | React Native Modal or `@gorhom/bottom-sheet` | Score entry = bottom sheet, confirmations = centered modal |
| `.state-switcher` | Dev-only, not shipped | Design review tool; omit from production |
| `.sw-pill` buttons | `SegmentedControl` (where user-facing, e.g. map/list toggle) | Only courts map/list toggle ships as segment control |
| Settings toggle rows | `Switch` + custom row component | Master toggle disables children |
| `.form-input` / `.form-select` | `TextInput` / picker library | 48px min height, 12px border radius |
| Match cards | Custom `MatchCard` component | Team names, score, date, status badge |
| Player chips (score entry) | Custom `PlayerChip` with avatar | Selected state: colored border + tinted bg |
| Empty state pattern | Reusable `EmptyState` component | Icon, title, description, optional CTA buttons |
| Horizontal card scroll | `FlatList` horizontal | Dot pagination, partial next-card peek |
| Notification rows | `FlatList` with `Swipeable` (react-native-gesture-handler) | Swipe actions, unread dot indicator |
| Friend request cards | Custom card with accept/decline buttons | 48px min tap targets |
| Court list items | Custom row with distance, rating, conditions | Map pin markers for map view |
| Toast messages | `react-native-toast-message` or custom | Above tab bar, auto-dismiss 3s |
| Skeleton loading | `react-native-skeleton-placeholder` | Match layout shape of loaded content |

## Roadmap (Post-v1)

Features identified during design review that are deferred past the initial mobile release:

| Feature | Priority | Notes |
|---|---|---|
| Full dark mode | High | Light/Dark toggle already in score wireframes; extend to all screens. Design tokens in `design-tokens.css` support theming. |
| Global search | Medium | Unified search across players, leagues, courts, tournaments. Tab bar does not include search -- likely triggered from home screen. |
| Full interactive map | Medium | Courts map view is a placeholder; production needs MapView with clustering, filters, real-time check-in pins. |
| Per-league notification tuning | Low | Currently all-or-nothing toggles in settings-notifications. Per-league mute/unmute is a future enhancement. |
| Connected accounts (Google/Apple) | Low | UI exists in settings-account but backend OAuth linking is not yet implemented. |
| Court reviews and ratings | Low | Excluded from v1. Court detail shows conditions but no user-submitted reviews. |
| League awards | Low | Excluded from v1 per "Purposely Excluded" table. |
