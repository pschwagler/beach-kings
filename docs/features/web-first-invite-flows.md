# Feature: Web-First Invite Flows (Claim Enrichment + League Share Link)

**Date:** 2026-06-28
**Status:** Design — pending decisions (see [Open Decisions](#open-decisions)), then implementation
**Related:**
- [invite-players-screen.md](../requirements/invite-players-screen.md) (inviter-side share screen — shipped)
- [placeholder-players.md](../requirements/placeholder-players.md) (broader claim/merge feature — shipped)
- [league-invites.md](./league-invites.md) (commissioner league-invite feature)
**Wireframes:** `mobile-audit/wireframes/invite-claim.html`, `mobile-audit/wireframes/league-invite.html`
**GitHub issue:** #166

## Problem Statement

Two invite affordances are stubbed or thin:

1. **Claim screen shows no real games.** When an invited placeholder player opens their invite link, the landing page lists only a *count* of games ("5 matches waiting"), not the actual games. The backend `GET /api/invites/{token}` returns `match_count` but no per-match data, so neither the web claim page nor the mobile claim screen can show what the recipient is actually claiming. Seeing the real games ("yes, those are my matches") is the core trust/conversion moment.

2. **League "Share Link" is a no-op.** `LeagueInviteScreen` has a `Share Link` button whose handler is empty (`// TODO(backend): share league invite link`). Commissioners can invite registered players one-by-one, but cannot hand out a shareable link.

## Key Constraint: Links Open the Web, Not the App

The mobile app registers only a custom scheme (`beach-league://`); there is **no universal-links / App-Links setup** (no `associatedDomains`, no `apple-app-site-association`, no `assetlinks.json`). Therefore every `https://` link a recipient taps opens the **web app**, never the native app.

Consequences:
- The **web** claim page (`apps/web/app/invite/[token]/page.tsx`) is the surface real invitees actually reach. The mobile claim screen (`apps/mobile/app/(stack)/invite/[token].tsx`) is effectively unreachable by external links today.
- A placeholder player is by definition someone *without* the app and *without* an account. The happy path must let them see and claim their games **on the web first**, then upsell the app — not gate the games behind an install.

This is why this design is explicitly **web-first**.

## Happy Path

### Claim flow

```
INVITER (mobile)                RECIPIENT (mobile browser -> web)          AFTER
-----------------               ----------------------------------         --------------
Share placeholder    --SMS-->    /invite/{token}                           download app
invite link                      1. REVIEW  (see the games)                (upsell, not a
                                 2. SIGN UP / LOG IN (web)                   gate)
                                 3. CLAIM -> merge                          -> claimed games
                                 4. SUCCESS + "Get the app"                    already in stats
                                                                              on first login
```

Ordering is deliberate: **show the games before asking to sign up.**

### League share flow

```
COMMISSIONER (mobile)                       RECIPIENT (mobile browser -> web)
---------------------                       ---------------------------------
LeagueInviteScreen                 --SMS-->  /league/{id}  (EXISTING public page)
  "Share Link" -> OS share sheet             - open league   -> "Sign up / Log in to join"
  message + https://.../league/{id}          - invite-only   -> "Request to join" -> approve
```

No new recipient screen — the public league page already exists with working join CTAs.

## Scope

### In Scope

**B1 — Backend (shared, serves web + mobile)**
- Extend `GET /api/invites/{token}` (`get_invite_details`) to return a `matches[]` array alongside the existing `match_count`.
- New `InviteMatchSummary` response model.
- Query reuses the established 4-FK-column match lookup + `my_games_service` mapping helpers; filtered to public matches; ordered most-recent first; capped (see data contract).

**B2 — Web claim page (highest leverage)**
- Render real match cards in the REVIEW state, visible to unauthenticated visitors (before the sign-up CTA).
- Add a SUCCESS-state "Get the app" upsell (App Store / Google Play) alongside the existing "Go to my stats" CTA.

**A — League share link (MVP)**
- Wire `LeagueInviteScreen`'s `Share Link` button to the OS share sheet with `https://beachleaguevb.com/league/{id}` plus a framing message.
- Surface the league name on the share screen so the message can name the league.

### Out of Scope (this pass)

- **B3 — Mobile claim cards** (rendering the same cards on the mobile claim screen). Low leverage until universal links exist. *Candidate to fold in cheaply once B1 lands — see Open Decisions #4.*
- **B4 — Universal links / App Links** (`associatedDomains` + AASA + `assetlinks.json`) so taps open the native app when installed. Separate infra project; the prerequisite for B3 to matter.
- **Token-based league invite flow** (per-league invite token, dedicated landing/claim screen, expiry/approval rules). No mockup exists; tracked separately in [league-invites.md](./league-invites.md).
- **"This isn't me" / deactivate-invite** flow from the claim wireframe (needs a new deactivate endpoint + inviter notification).
- Web/mobile share-copy reconciliation beyond the templates defined here.

## Data Contract (B1)

`InviteDetailsResponse` adds `matches: InviteMatchSummary[]`. `match_count` stays as the true total (so "showing 3 of 5" copy works).

`InviteMatchSummary` (high level):

| Field | Example | Notes |
|---|---|---|
| `session_label` | "Sunday morning" | nullable |
| `date` | "Apr 6" | normalized via `_normalize_session_date()` |
| `league_name` | "Tuesday B+ Co-Ed" | nullable (pickup) |
| `partner_name` | "Karim Fadel" | the placeholder's teammate; nullable |
| `opponent_names` | ["Mike B.", "Jake R."] | |
| `my_score` / `opp_score` | 21 / 18 | from the placeholder's perspective |
| `result` | "W" / "L" / "D" | data carries it; UI decides whether to render a badge |

**Reuse:** `my_games_service._build_entry()` + `_normalize_session_date()` produce nearly this shape already (without the ELO join).
**Privacy:** display names only — **no numeric player IDs**; filtered to `Match.is_public == True`.
**Cap:** return the **10 most recent** matches; `match_count` remains the full total.

## Screen Designs (high-level)

### Web claim — REVIEW

```
+--------------------------------------------+
| [NavBar]                                   |
|              [Beach League logo]           |
|            You've Been Invited!            |
|   Karim Fadel recorded 5 matches with you  |
|                                            |
|   Recent games on this profile             |
|   Showing 3 most recent of 5               |
|   +------------------------------------+   |
|   | Sunday morning             Apr 6   |   |
|   | You + Karim Fadel  21-18   Mike B. |   |
|   |                            + Jake R.|  |
|   +------------------------------------+   |
|   | Sunday morning             Apr 6   |   |
|   | You + Mike Bennett 21-15   Karim F.|   |
|   +------------------------------------+   |
|   | Saturday morning           Apr 5   |   |
|   | Devon + Jake       19-21   You + …  |  |
|   +------------------------------------+   |
|   [ Tuesday B+ Co-Ed ]  <- league badge    |
|                                            |
|   Sign up or log in to claim your matches. |
|   [   Sign Up   ]    [   Log In   ]        |
+--------------------------------------------+
```

After auth, the CTA reactively becomes **[ Claim My Matches ]** (existing pattern). Card style follows `invite-claim.html`: session label + date header, "You" highlighted, score, opponents.

### Web claim — SUCCESS + app upsell

```
+--------------------------------------------+
|              (check)  Matches Claimed!     |
|   5 games are now part of your account.     |
|   Record added · 3W - 2L                    |
|                                             |
|   ------  Get the Beach League app  ------  |
|   Track your stats, RSVP, and score games   |
|   [  App Store  ]    [  Google Play  ]      |
|                                             |
|   [  Go to my stats  ]                      |
+--------------------------------------------+
```

### League share message (MVP)

> Join **{League Name}** on Beach League: {url}

(Recipient lands on the existing public league page; no new screen.)

## Open Decisions

Recommendations in **bold**; to be confirmed before spec/implementation.

1. **Privacy** — **Show display names, no IDs, public matches only.** Token-holder was a participant in these exact games; token is 256-bit; filter to `is_public`.
2. **Result indicator** — **Add a subtle W/L** to each web card. The `invite-claim.html` mockup omits it (outcome implied by score), but a web list reads ambiguously without it.
3. **"This isn't me" / deactivate** — **Defer** (needs new endpoint + notification).
4. **Mobile claim cards (B3)** — **Include cheaply** once B1 lands, for surface consistency, even though few users reach the mobile screen pre-universal-links. Alternative: strictly web-only this pass.
5. **League share wording** — choose: "Join {League} on Beach League: {url}" *(recommended)* vs "{Commissioner} invited you to join {League}: {url}".

## Affected Code (orientation, not a task list)

- Backend: `apps/backend/api/routes/players.py` (`get_invite_details`), `apps/backend/models/schemas.py` (`InviteDetailsResponse`, new `InviteMatchSummary`), `apps/backend/services/placeholder_service.py` (match query), reusing `apps/backend/services/my_games_service.py` mapping helpers.
- Web: `apps/web/app/invite/[token]/page.tsx` (review cards + success upsell), web invite styles.
- Mobile (Feature A): `apps/mobile/src/components/screens/Leagues/LeagueInviteScreen.tsx` + `useLeagueInviteScreen.ts` (share handler + league name), `apps/mobile/src/utils/share.ts` (reuse `shareLink`).
- Mobile (Feature B3, if included): `apps/mobile/app/(stack)/invite/[token].tsx`, shared invite-details type in `packages/shared`.

## Testing (per project TDD policy)

- Backend: `get_invite_details` returns correct `matches[]` (perspective, partner/opponents, score, result, `is_public` filtering, 10-cap, no IDs) — extend existing placeholder tests.
- Web: review state renders cards from `matches[]`; unauthenticated visitors see cards; success state renders app-store CTAs.
- Mobile (Feature A): `Share Link` invokes `shareLink` with the correct league URL + message.
- Mobile (Feature B3, if included): claim screen maps `matches[]` to cards.
