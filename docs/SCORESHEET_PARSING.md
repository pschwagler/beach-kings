# Scoresheet parsing

Mobile starts with a photo, then asks whether the games belong to a league or
pickup session. Reading starts after that choice so a single model request gets
the relevant player context. League entry points preselect their league; seasons
use the same current-season default as manual game entry. The action bar remains
outside the scrolling content during selection and review.

## Player context

League and pickup uploads share `services/games/scoresheet_context.py`:

- Include the uploader and up to 100 other people from shared sessions.
- Combine explicit session participants with match appearances, including legacy
  sessions without participant records. Count each person once per shared session.
- Rank shared sessions by recency and frequency, using the game date rather than
  the creation timestamp of an imported record. Future sessions and deleted
  players do not contribute candidates.
- Add every current league member, even if the combined list exceeds 100. Deduplicate
  player IDs and label membership explicitly, including non-member guests.
- Send names, nicknames, uploader/membership labels, shared-session counts, and last
  shared dates. Do not send full player profiles or contact information.

The prompt treats ranking and membership as context, not proof of identity. Names
that remain ambiguous should stay as handwritten text for manual resolution.
Unknown players can be searched globally or created using the scoreboard picker.

Uploads snapshot the candidate list in their expiring Redis draft. Corrections
reuse that snapshot, including when another league member edits the draft. Legacy
drafts reconstruct context for their original uploader.

Every correction also sends the current reviewed games, including manual player
selections and the latest scores. The server validates selected IDs and adds any
selected players outside the original candidate list. The model edits this state;
the original photo is only a reference for the requested change. Earlier selections
are incorporated into the returned review, rather than reapplied over a later
explicit identity change. A failed model correction returns the unchanged review.

## Evaluation

The evaluator uses the same prompt builders as the app. Each private manifest's
`members` entries can include `is_league_member`, `is_uploader`, `shared_sessions`,
and `last_shared_session`. The production snapshot command labels its league
roster; richer fixtures can also supply shared-history candidates and guests.
For correction regressions, a case can supply `current_review` (the structured
review state) and `correction` (the requested edit), with `expected` describing the
resulting games. This uses the same correction prompt as the application. Request
fingerprints include the full prompt, preventing reuse across changed candidate
lists, reviewed states, or instructions.

```sh
PYTHONPATH=apps:. python scripts/eval_scoresheets.py run \
  --manifest /private/scoresheet-evals/manifest.json \
  --model gpt-6.1-terra --model gpt-6.1-sol \
  --budget-usd 3 --ledger /private/scoresheet-evals/budget-ledger.json \
  --output /private/scoresheet-evals/results.json
```

Keep photos, production labels, candidate lists, and outputs outside this public
repository. Share the ledger across runs to preserve the cumulative spend limit.
The report separates agreement with recorded games from photo-reviewed accuracy
and appropriate abstention on ambiguous identities.
