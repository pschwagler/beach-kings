# League Invites — Design Doc

**Status:** Not started. Backend model + endpoints + mobile wiring all needed.
**Created:** 2026-04-25

---

## Problem

Commissioners need to invite players to their league. Invited players should be able to accept via a share link or in-app notification. Commissioners need a "Pending Invites" screen to track who has been invited and whether they've joined.

---

## Current state

| Layer | Status |
|-------|--------|
| DB model | Missing — no `league_invites` table |
| Notification enum | `LEAGUE_INVITE` exists in `NotificationType` |
| `PlayerInvite` model | Exists (`player_invites` table) — for placeholder players only; does NOT capture league context |
| Backend routes | None |
| Mobile screens | Scaffolded (`PendingInvitesScreen`, `usePendingInvitesScreen`, `LeagueInviteScreen`) — all use mockApi |
| Navigation | `routes.pendingInvites()` defined; `PendingInvitesBanner` exists on home screen but wired to nothing |

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

## Backend endpoints needed

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/leagues/{id}/invites` | league_admin | Send invite(s) to player(s) by player_id or phone/email |
| GET | `/api/leagues/{id}/invites` | league_admin | List invites for this league (pending + accepted) |
| GET | `/api/users/me/league-invites` | user | Invites I've received (to accept/decline) |
| POST | `/api/league-invites/{id}/accept` | invitee | Accept a league invite |
| POST | `/api/league-invites/{id}/decline` | invitee | Decline a league invite |
| DELETE | `/api/league-invites/{id}` | league_admin | Cancel/revoke an invite |

The "Share" button in the wireframe should reuse the existing `GET /api/players/{id}/invite-url` endpoint to generate a shareable deep link.

---

## Mobile screens to wire

- `usePendingInvitesScreen.ts` — currently calls `mockApi.getPendingInvites()`; wire to `GET /api/leagues/{id}/invites`
- `useLeagueInfoTab.ts` — currently calls `mockApi.getLeagueInvites(id)`; same endpoint
- `PendingInvitesBanner` on home screen — wire to `GET /api/users/me/league-invites` count, navigate to pending-invites screen
- `LeagueInviteScreen` — wire to `POST /api/leagues/{id}/invites`

---

## Open questions

1. Should non-registered users (invited by phone/email) be auto-linked to a `PlayerInvite` record so the share link enrolls them into the league on claim?
2. Do accepted invites auto-add the player as a league member, or does the commissioner still need to approve?
3. Expiry policy — do invites expire, and if so, after how long?
4. Home screen banner: does it show pending outgoing invites (commissioner POV) or pending received invites (player POV)?
