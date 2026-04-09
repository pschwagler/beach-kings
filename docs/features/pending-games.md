# Pending Games

## What is a pending game?

A game is **pending** when at least one player in the match has not yet registered (linked) their account to Beach League. The match data is captured in full — scores, teams, date — but ELO calculations are deferred until every player is a registered user.

A match is pending when:

- `ranked_intent` is `true` (the session was submitted as a ranked session), AND
- `is_ranked` is `false` (one or more players are still placeholders/unregistered)

## W/L badges on pending games

Win and loss badges **are** shown on pending games for registered players. This is expected and correct: the score was recorded, the outcome is known, and it will appear in the player's history. ELO points are NOT applied until the match becomes ranked.

## Lifecycle: pending → ranked

Once every player in a pending match creates an account and links their placeholder entry to their registered profile, the match automatically becomes **ranked**. ELO updates are then calculated and applied retroactively for that match.

A submitted session can therefore contain a mix of ranked and pending games — e.g., if three out of four players in a match are registered, that match stays pending until the fourth joins.

## The Invite button

When a match card displays a placeholder (unregistered) player, an **Invite** button appears next to that player's name. This generates a shareable link that pre-fills the player's name and connects the registration to the placeholder slot in that match. When the invited player completes registration via that link, the placeholder is resolved and the match can transition to ranked.

## UI indicators

- A **Pending** badge is shown on match cards where `ranked_intent = true` and `is_ranked = false`.
- The badge includes a tooltip that identifies the specific unregistered player(s) by name when available: "Waiting for [Name] to register to finalize this game".
- In match history tables, pending rows show "Pending" in the rating column instead of an ELO delta.

## Data model notes

- `ranked_intent`: set to `true` when the session is locked in as a ranked session. Does not change after submission.
- `is_ranked`: computed at match time. Becomes `true` once all placeholder players have registered accounts.
- Placeholder players are stored with `is_placeholder = true` on the `LeagueMember` or session participant record.
