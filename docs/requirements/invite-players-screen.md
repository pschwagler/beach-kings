# Feature: Invite Players Screen (Reusable)

**Date:** 2026-05-24
**Status:** Design — pending implementation
**Related:** [placeholder-players.md](./placeholder-players.md) (broader claim/merge feature), [mobile-stub-replacement.md](../features/mobile-stub-replacement.md) (unresolved designs)
**Wireframe:** `mobile-audit/wireframes/session-invite-players.html`

## Problem Statement

Placeholder players (users without an account, created inline during match logging — see [placeholder-players.md](./placeholder-players.md)) need to be invited to claim their profile so their games count toward stats and rankings. Today the invite-link UX is scattered: the session detail banner is wired only for league sessions and routes to a league-wide invite screen, while pickup sessions have a dead banner. We need one reusable screen that lists unclaimed placeholders in a given context and lets the user share their invite link.

## Scope

### In Scope

- A single reusable mobile screen — `InvitePlayersScreen` — that renders a scoped list of placeholder (unclaimed) players and provides a per-row Share action.
- Multiple entry points (see [Trigger Sources](#trigger-sources)).
- Per-row action fires the **OS share sheet** (`react-native` `Share.share`) with a pre-filled message + invite URL.
- Ephemeral, in-memory "Sent ✓" indicator on rows the user just tapped (resets on screen remount).
- Empty state for when every player in the scope is claimed.

### Out of Scope

- Backend tracking of "was this invite sent" (the only durable state remains `claimed` vs `unclaimed`).
- Bulk share / "share all" action.
- Custom in-app SMS or email sending (no contact data on placeholders today; see [placeholder-players.md §Out of Scope](./placeholder-players.md)).
- Inline "add phone/email to placeholder" UI.
- Re-ordering or filtering which apps appear in the OS share sheet.
- Server-generated short links or QR codes (link format is owned by the existing claim flow).

## Trigger Sources

The screen is invoked with a **scope** (list of placeholders + context label). Initial sources:

1. **Session Detail** — banner "Invite players to claim their Beach League profile." Scope = placeholders in this session. (Replaces current league-only routing on the banner.)
2. **Match Detail** (future) — "Invite N players" action when a match has placeholders. Scope = placeholders in this match.
3. **Profile → Pending Invites** (future) — "Manage invites." Scope = all placeholders created by the current user.
4. **League Detail** (future, if needed) — placeholders within a league's roster.

The screen itself is source-agnostic; each caller passes its own scope and labels.

## Screen Contract

```ts
type InvitePlayersScreenParams = {
  title?: string;            // default "Invite Players"
  contextLabel: string;      // e.g. "Sunday Pickup · Apr 6"
  contextSubLabel?: string;  // e.g. "3 unclaimed players"
  players: Array<{
    id: string;
    name: string;
    initials: string;        // for avatar
    metaLabel: string;       // e.g. "3 games", "in League X"
    inviteUrl: string;       // from existing placeholder invite-link API
  }>;
  shareMessageTemplate?: string;
  // default: "Hey {firstName}, claim your Beach League profile so our games count: {url}"
  emptyStateCopy?: string;   // default "All players on Beach League"
};
```

Callers are responsible for fetching/filtering the placeholder list. The screen does no data fetching of its own beyond honoring the params it receives.

## User Flow

1. User triggers the screen from any source above.
2. Screen renders the context strip + one row per placeholder. Claimed players are never shown (claim = soft-delete from this screen).
3. User taps **Send** on a row → `Share.share({ message: renderTemplate(template, player), url: player.inviteUrl })` opens the OS share sheet.
4. After the share sheet closes (success or cancel), the row shows a transient "Sent ✓" indicator. State is in-memory only; no API call.
5. User navigates back when done. No save / confirm step.
6. If the scope is empty (all claimed), the empty state renders instead of the list.

## Pre-filled Share Message

Template (callers may override):

> Hey {firstName}, claim your Beach League profile so the games we played together count toward your stats: {url}

Rendered per-player at tap time. Keep it under 160 chars so it fits in a single SMS.

## Visual & Interaction Notes

- Reuse the existing wireframe `session-invite-players.html` (state 1 = list, state 5 = empty). Other states in the file (already-invited section, custom share sheet, add-contact, bulk share) are **deprecated by this requirements doc** and should not be implemented.
- Per-row Send button is the primary action; tapping anywhere on the row also fires the share.
- "Sent ✓" indicator: replace the Send button with a green check + "Sent" label for ~3s after share sheet dismissal, then revert to Send. No row reordering.
- Empty state: green check, "All players on Beach League," subtitle "Everyone in this session already has an account, so all games count automatically." Single secondary action: Back.

## Open Questions

- **Share message copy** — needs product review of exact wording (currently a placeholder).
- **Should "Sent ✓" persist for the screen's lifetime or revert after 3s?** Leaning revert, so the user can re-send easily during the same session if needed.
- **Match Detail entry point** — defer to follow-up; not required for the Session Detail rewire.
