# League Invites — Design Doc

**Status:** Implemented. DB model, backend endpoints, and mobile wiring are done. Remaining gaps: invite revocation and non-registered (phone/email) invitees.
**Created:** 2026-04-25
**Updated:** 2026-07-18

---

## Problem

Commissioners need to invite players to their league. Invited players should be able to accept via a share link or in-app notification. Commissioners need a "Pending Invites" screen to track who has been invited and whether they've joined.

---

## Current state

| Layer | Status |
|-------|--------|
| DB model | Exists — `league_invites` table, `LeagueInvite` model (`apps/backend/database/models.py`) |
| Notification enum | `LEAGUE_INVITE` exists in `NotificationType` |
| `PlayerInvite` model | Exists (`player_invites` table) — for placeholder players only; does NOT capture league context |
| Backend routes | Implemented (`apps/backend/api/routes/leagues.py`, `apps/backend/api/routes/users.py`) — see endpoint table below |
| Mobile screens | Implemented — TanStack Query hooks under `leagueKeys` calling real endpoints (`usePendingInvitesScreen`, `useReceivedInvitesScreen`, `useLeagueInviteScreen`) |
| Navigation | `routes.pendingInvites()` defined; `PendingInvitesBanner` wired on the home screen with real counts |

---

## Wireframes

- `mobile-audit/wireframes/pending-invites.html` — commissioner's view of outgoing league invites
- `mobile-audit/wireframes/league-invite.html` — invite player picker (friend search + send)
- `mobile-audit/wireframes/home.html` `.pending-invites-banner` — home screen entry point

---

## Proposed data model

```sql
CREATE TABLE league_invites (
    id SERIAL PRIMARY KEY,
    league_id INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    invited_player_id INTEGER REFERENCES players(id) ON DELETE SET NULL,
    invited_by_player_id INTEGER REFERENCES players(id) ON DELETE SET NULL,
    -- For non-registered invitees, store contact info:
    invited_phone VARCHAR,
    invited_email VARCHAR,
    status VARCHAR NOT NULL DEFAULT 'pending',  -- pending | accepted | declined | expired
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    responded_at TIMESTAMPTZ,
    -- Optional: link to a PlayerInvite token for non-registered users
    player_invite_id INTEGER REFERENCES player_invites(id) ON DELETE SET NULL
);
```

Status transitions: `pending → accepted | declined | expired`

---

## Backend endpoints (implemented)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/leagues/{id}/invitable-players` | league_admin | Players that can be invited, grouped into friends / recent opponents / suggested |
| POST | `/api/leagues/{id}/invites` | league_admin | Send invites to players by player_id; notifies each invited player with a user account |
| GET | `/api/leagues/{id}/invites` | league_admin | List invites for this league |
| GET | `/api/users/me/league-invites/sent` | user | Invites I've sent across all leagues |
| GET | `/api/users/me/league-invites/received` | user | Pending invites I've received (to accept/decline) |
| POST | `/api/leagues/{id}/invites/respond` | invitee | Accept or decline via `{ "action": "accept" \| "decline" }` |

Not yet implemented: invite revocation (`DELETE`), and invites to non-registered users by phone/email (the original proposal's `invited_phone`/`invited_email` columns were not added).

The "Share" button in the wireframe should reuse the existing `GET /api/players/{id}/invite-url` endpoint to generate a shareable deep link.

---

## Mobile wiring (implemented)

- `usePendingInvitesScreen.ts` — Query hook (`leagueKeys.pendingInvites`) calling `GET /api/users/me/league-invites/sent`
- `useReceivedInvitesScreen.ts` — Query hook (`leagueKeys.receivedInvites`) calling `GET /api/users/me/league-invites/received`
- `useLeagueInviteScreen.ts` — Query hooks for invitable players + `POST /api/leagues/{id}/invites`
- `PendingInvitesBanner` on the home screen — wired with real counts, navigates to the pending-invites screen

---

## Open questions

1. Should non-registered users (invited by phone/email) be auto-linked to a `PlayerInvite` record so the share link enrolls them into the league on claim?
2. Do accepted invites auto-add the player as a league member, or does the commissioner still need to approve?
3. Expiry policy — do invites expire, and if so, after how long?
4. Home screen banner: does it show pending outgoing invites (commissioner POV) or pending received invites (player POV)?
