# Feature: Placeholder Players & Invite-to-Claim Flow

**Date:** 2026-02-15 (last trimmed: 2026-05-24)
**Status:** Shipped (web + backend). Mobile inviter-side UX redesign in [invite-players-screen.md](./invite-players-screen.md).
**Related:** [invite-players-screen.md](./invite-players-screen.md), recipient claim wireframe at `mobile-audit/wireframes/invite-claim.html`

> Implementation history (epic checklists, schema migrations, component lists, internal Q&A) has been removed from this doc — git history is the source of truth for what shipped and when. This file now captures only the durable high-level requirements.

## Problem

Users want to log matches immediately after playing, but partners/opponents often aren't on Beach League yet. Forcing those people to sign up *before* their games can be recorded kills the moment. Placeholders let users record games against not-yet-registered players and invite them to claim those games later.

## Requirements

- **Inline creation.** Users can create a placeholder player by typing a new name in the player picker during match logging. No separate flow.
- **Real player records.** Placeholders are `players` rows with `user_id=NULL`, flagged `is_placeholder=true`, with `created_by_player_id` set. They appear in matches, season standings, and scoped player search like any other player.
- **Per-placeholder invite link.** Each placeholder gets a unique, non-expiring URL of the form `/invite/{token}`. The link routes to the recipient claim flow (see wireframe).
- **Claim = link or merge.** When someone claims an invite: if they have no player record yet, the placeholder is adopted (set `user_id`, clear `is_placeholder`). If they already have a player record, the placeholder is merged into it (transfer match FKs, league memberships, then retire the placeholder). The claimer's existing player ID always wins.
- **Ranked games are pending until all players are claimed.** In ranked sessions, any match containing a placeholder is `is_ranked=false` until every player in that match has been claimed. Then it flips to `is_ranked=true` and stats recalc fires.
- **Soft-delete via "Unknown Player".** Deleting a placeholder replaces it with a system "Unknown Player" record in all affected matches (matches are preserved, but become permanently unranked). Only the creator can delete.
- **League auto-membership.** Placeholders used in a league match are auto-added as `LeagueMember` with role `"placeholder"`. On claim, membership transfers to the claimer (or is cleaned up if they're already a member).
- **Notify on claim.** Creator gets a `PLACEHOLDER_CLAIMED` notification when their invite is claimed.
- **Inviter-side sharing UX is owned by [invite-players-screen.md](./invite-players-screen.md).** That doc supersedes any "Pending Invites profile section," "copy-link toast after match creation," and "manual paste" patterns that may still appear in older code or PRs.

## Out of Scope

- Bulk/CSV import of players.
- SMS / email sending from our system. Users share invite links via the OS share sheet — see [invite-players-screen.md](./invite-players-screen.md).
- Collecting phone numbers on placeholders. (Was previously specced; deferred indefinitely.)
- Auto-matching placeholders to new signups by name.
- Merging two existing (non-placeholder) player records.
- Admin tooling for managing all placeholders system-wide.
