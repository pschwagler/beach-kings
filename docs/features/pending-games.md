# Pending Games

## Ranked vs. Unranked: Session-Level Setting

**Ranked/unranked is set on the session, not on individual matches.** When a user creates or manages a session, they choose whether it is ranked. All matches within that session inherit this intent.

- **Ranked session** (`ranked_intent = true`): Matches produce ELO changes once all players are registered.
- **Unranked session** (`ranked_intent = false`): No ELO changes ever, regardless of whether players are registered or not. Win/loss records are still tracked.

`ranked_intent` is set once when the session is submitted and does not change after that.

## What is a pending game?

A game is **pending** when it was submitted in a ranked session but at least one player has not yet registered (linked) their account to Beach League. The match data is captured in full -- scores, teams, date -- but ELO calculations are deferred until every player is a registered user.

A match is pending when:

- `ranked_intent` is `true` (the session is ranked), AND
- `is_ranked` is `false` (one or more players are still placeholders/unregistered)

**Important:** If a session is unranked (`ranked_intent = false`), matches are never pending -- they are simply unranked. The presence of placeholder players in an unranked session has no effect on match status because there are no ELO changes to defer.

## W/L badges on pending games

Win and loss badges **are** shown on pending games for registered players. This is expected and correct: the score was recorded, the outcome is known, and it will appear in the player's history. ELO points are NOT applied until the match becomes ranked.

This also applies to unranked matches: W/L is displayed, but no ELO delta is shown or calculated.

## Lifecycle: pending → ranked

Once every player in a pending match creates an account and links their placeholder entry to their registered profile, the match automatically becomes **ranked** (`is_ranked` flips to `true`). ELO updates are then calculated and applied retroactively for that match.

A submitted session can therefore contain a mix of ranked and pending games -- e.g., if three out of four players in a match are registered, that match stays pending until the fourth joins.

**This lifecycle only applies to ranked sessions.** Unranked sessions never transition to ranked, even if all placeholders are claimed.

## The Invite button

When a match card displays a placeholder (unregistered) player, an **Invite** button appears next to that player's name. This generates a shareable link that pre-fills the player's name and connects the registration to the placeholder slot in that match. When the invited player completes registration via that link, the placeholder is resolved and the match can transition to ranked (if the session was ranked).

## UI indicators

- A **Pending** badge is shown on match cards where `ranked_intent = true` and `is_ranked = false`.
- The badge includes a tooltip that identifies the specific unregistered player(s) by name when available: "Waiting for [Name] to register to finalize this game".
- In match history tables, pending rows show "Pending" in the rating column instead of an ELO delta.
- Unranked matches show no ELO delta and no Pending badge -- just W/L results.

## Data model notes

- `ranked_intent`: session-level setting. Set to `true` when the session is submitted as ranked. Inherited by all matches in the session. Does not change after submission.
- `is_ranked`: computed at match time. For ranked sessions, becomes `true` once all placeholder players have registered accounts. For unranked sessions, stays `false` permanently.
- Placeholder players are stored with `is_placeholder = true` on the `LeagueMember` or session participant record.
