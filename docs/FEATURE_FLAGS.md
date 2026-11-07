# Feature flags

Feature flags separate deployment from release for web and mobile. Manage them
at **Admin Panel → Feature flags** (`/admin-view?tab=feature-flags`). Only system
admins can read configuration or change it. Flags apply to the database/environment
where they are configured; development and production are independent deployments.

## Roll out or pause a feature

1. Open a flag and select its allowed platforms.
2. Enable it, set rollout to **0%**, and enter selected **account user IDs** from
   the Users tab. These are not player IDs. Save with a reason.
3. Increase the percentage or use **100%** for everyone, including signed-out
   visitors. The same account stays in a stable cohort across allowed platforms.
4. Uncheck **Enabled** to disable access for everyone, including selected users.

Selected users are included in addition to the percentage rollout. Disallowed
platforms stay disabled. Percentage cohorts use a stable hash of flag key and user
ID; increasing the percentage keeps previously included users. Anonymous visitors
only receive a flag at 100%. Flag/platform targeting is a release control, not a
replacement for authorization or permissions.

Every edit requires a reason and records the actor, time, and before/after values.
**View change history** shows the latest 50 changes. Concurrent edits return a
conflict: cancel, reload, and review the latest configuration before saving again.
New flags start disabled. Creating a flag does not automatically connect application
code to it.

## Tournament controls

Migration `081` seeds two flags enabled at 100% to preserve existing web behavior:

| Key | Effect |
| --- | --- |
| `kob_tournaments` | Gates all KOB API routes and web create/manage/live routes; mobile tournament entry also checks this flag. |
| `kob_tournament_creation` | Gates creation of new KOB events. Disable this to pause new events while allowing existing events to continue. |

The unfinished mobile tournament screens remain explicitly unavailable even when
access is enabled. Flags do not implement those screens or replace their rejecting
API adapter. Existing mobile binaries without flag integration cannot change their
UI, though backend gates still apply to API requests.

Turning off `kob_tournaments` also blocks public tournament links and operations
on existing events. Prefer disabling creation when existing events can safely
continue. Flags do not undo matches, notifications, database migrations, or other
completed work.

## Connecting another feature

- Create a flag with a stable lowercase key, for example `tournament_builder`.
- Backend: use `Depends(require_feature("tournament_builder"))` from
  `backend.api.routes.feature_flags` on the relevant routes. Keep normal auth and
  resource-permission dependencies. Disabled/unknown flags return HTTP 403 with
  `detail.code = FEATURE_DISABLED`.
- Web: wrap the route's content in `FeatureGate` from
  `src/components/ui/FeatureGate`. Its loading and unavailable states preserve the
  Navbar. It can require several flags. `useFeatureFlags()` is available for
  navigation and individual controls.
- Mobile: use `useFeatureFlag("tournament_builder")` from
  `src/features/feature-flags/queries`. Gate navigation and direct routes. Its
  TanStack Query data uses the existing public/private key factories and clears
  through the established auth-transition lifecycle.
- Shared API client: `api.getFeatureFlags(platform, { signal })` returns only
  resolved booleans. Targeting configuration/user lists stay in admin endpoints.

Web evaluates as `web`; native clients use `ios`/`android`. Mobile sends
`X-Client-Platform` on API requests, and the backend defaults absent headers to
`web` for older clients. This header is a client hint, not a security boundary.
Both clients refresh every 30 seconds while active and on return to the app/tab.
Backend operations evaluate the current database configuration on each request;
there is no process-local flag cache. Unknown flags and failed client evaluations
remain disabled. An offline/suspended client cannot receive changes until it
reconnects, while backend enforcement still blocks disabled operations.

## Release and maintenance

Apply migrations through the normal release process before deploying the new
API. There are no startup schema writes. Database configuration is read at runtime;
changing flags needs no web rebuild or mobile release once the checks are shipped.
Keep backend contracts compatible with supported mobile versions. Platform flags
do not perform app-version compatibility checks.

Test enabled/disabled behavior and direct API/deep-link access for each connected
feature. Remove temporary release flags and their checks after the rollout and
rollback window have ended. Keep operational pause switches deliberately.
