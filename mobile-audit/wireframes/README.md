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

- `shared.css` -- base styles (reset, status bar, top nav, tab bar, state switcher, modals); imports design tokens
- `design-tokens.css` -- CSS custom properties reference (colors, typography, spacing, shadows)

### State Switcher

A sticky header bar (not production UI) lets reviewers toggle between screen states without navigating. Used in multi-state pages like invite-claim, forgot-password, score-league, tournament-detail, etc.

## Pages (47 HTML files)

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

### Leagues (10)
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
| pending-invites | Pending invite list with share actions |

### Sessions (3)
| File | Description |
|------|-------------|
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
| score-league | League game scoreboard (dark theme): empty, building, scoring, error states |
| score-scoreboard | Pickup/session scoreboard (dark theme): building, scoring, error states |
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

### Profile (3)
| File | Description |
|------|-------------|
| profile | User profile with edit capabilities |
| player-profile | Public player profile view |
| settings | App settings and preferences |

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
