# Scoresheet parsing

Scan scoresheet opens a native iOS action sheet (anchored popover on iPad)
or an Android bottom sheet with Take photo, Choose from photos, and Cancel.
The native camera or photo library opens before the preview and form. Canceling
an initial selection returns to the previous screen; canceling a replacement
preserves the existing photo and review. Change photo uses the same source menu.
The checked-in iOS project declares camera use for scoresheet scanning; release
preflight requires the native and Expo camera purpose text to stay in sync.

Camera permission is checked only after choosing **Take photo**. The OS is
asked only if access has not been granted and it can still present its prompt.
Denial keeps the screen and existing review intact, offers Settings, and leaves
a direct **Choose from photos** fallback when no photo is selected. Selecting
from the system photo picker does not request camera or full-library access.

After selecting a photo, mobile asks whether the games belong to a league or
pickup session. Reading starts after that choice so a single model request gets
the relevant player context. League entry points preselect their league; seasons
use the same current-season default as manual game entry. The action bar remains
outside the scrolling content during selection and review.

The scan entry uses a camera action. Review pins an independently zoomable,
pannable photo above the game list; it can be enlarged, hidden, or opened full
screen. Matching controls appear before the games and selected identities are
shown in green with checkmarks. Compact game cards expose an inline editor for
players and scores. Edits remain local until the batch is confirmed, and the
current reviewed state is also sent to subsequent AI corrections.

The date, optional court, and league/season context can be reviewed before saving.
Pickup imports use the selected court. League imports honor it when creating a
session; an existing league session at a different court is rejected before any
games are added, so importing cannot silently reassign the session's other games.

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

New drafts expire after eight hours. Updating a draft renews that period;
viewing the review alone does not. Already-expired drafts require selecting the
photo again. Saved games and durable confirmation receipts are unaffected.

Every correction also sends the current reviewed games, including manual player
selections and the latest scores. The server validates selected IDs and adds any
selected players outside the original candidate list. The model edits this state;
the original photo is only a reference for the requested change. Earlier selections
are incorporated into the returned review, rather than reapplied over a later
explicit identity change. A failed model correction returns the unchanged review.

Correction instructions support multiple lines. While instructions are pending,
the fixed bottom action becomes **Apply correction**, including above the
keyboard. **Add games** returns after the correction is applied or the text is
cleared, so an unapplied instruction cannot be mistaken for a saved change.

## Import and recovery guarantees

### Separate backend/web and mobile releases

Backend and web can deploy before the new iOS binary. Existing league upload,
status/stream, correction, and confirmation endpoints are retained. The new
reviewed-game and court fields are optional, so existing clients can continue
using their original request bodies. Older mobile binaries do not contain the
scanning screens; over-the-air updates are disabled, so an Apple release is
required to expose them.

Deploy migrations `083`–`085` with the backend. Migration `083` enables parsing
at 100% by default, including web: the deployed web flow immediately uses the
new OpenAI parser. Verify the production `OPENAI_API_KEY` has access to the
configured `SCORESHEET_MODEL` (or its default), and smoke-test web scanning and
corrections before broadly releasing the new binary. Local model access does
not prove production credential/model access. The scoresheet flag can pause
parsing, or exclude native platforms while leaving web enabled.

The checked-in production deployment workflow is manually triggered and deploys
both web and backend; it does not publish an iOS binary. For the native release,
the camera purpose text must match in `app.json` and the authoritative native
`Info.plist`. Release preflight checks this; rebuild and test the camera on a
physical iPhone before submitting the new build.

### Atomic saves and interrupted jobs

Apply migration `085` before deploying this backend. It adds a durable import
receipt to the first processing job for each draft. Session creation, all games,
and the receipt commit together; failed batches roll back completely. Concurrent
confirmations share the same database lock, and authorized retries return the
saved result even if the Redis draft has expired. Legacy Redis completion markers
are adopted into receipts during the transition. Reviewed scores are taken from
the winning request rather than another client's changes to shared draft state.

Jobs pending or running for five minutes fail when their status is checked.
**Retry this photo** returns to the existing photo and context without requiring
another photo selection. A timed-out worker cannot change its job back to success.
The backend requires `pillow-heif` to decode HEIC/HEIF uploads; iOS additionally
requests compatible photo-library representations.

**Read scoresheet** stays enabled for missing input. Tapping it scrolls to the
first invalid field and displays its error inline. Uploads begin only after the
photo, game type, league (for league games), and date are valid.

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
