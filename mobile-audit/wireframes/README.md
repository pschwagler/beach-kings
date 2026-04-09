# Beach League Mobile App Wireframes

Static HTML wireframes (390x844px, iPhone 14) for designing the native mobile app migration of the Beach League web app.

## Purpose

These wireframes are a **design and styling decision tool** -- not functional prototypes. They let us:

1. **Lock down mobile UI/UX** before writing any native code
2. **Import into Figma** via the HTML-to-Design capture script for polishing and handoff
3. **Identify navigation patterns** that differ from web (tab bar, back buttons, segment controls vs. full page routes)
4. **Simplify where needed** -- the web app has deep feature nesting that doesn't translate well to mobile (e.g. 6-tab league dashboard collapsed to 3 tabs)


## Viewing

```bash
cd mobile-audit/wireframes
python3 -m http.server 8888
# Open http://localhost:8888/home.html
```

Start at `welcome.html` for the unauthenticated flow or `home.html` for the logged-in experience. All pages are cross-linked via `<a>` tags.

## Pages (30 files)

**Auth**: welcome, login, signup
**Home**: home, my-games, notifications
**Leagues**: leagues-tab, find-leagues, create-league, league-dashboard, league-matches, league-info, pending-invites, session-detail, add-games
**Courts**: courts, court-detail, court-photos
**Players**: find-players, player-profile, friends
**KoB Tournaments**: kob-create, kob-live, kob-standings, kob-schedule
**Messages**: messages, message-thread
**Profile**: profile, my-stats, settings
