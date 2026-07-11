# Mobile Maestro flows

Short, hand-driven smoke flows for the Beach League Expo app. Unlike Jest unit
tests, these drive a real app binary — they catch navigation, auth, and
hydration regressions that unit mocks can hide.

## Running

1. Install [Maestro](https://maestro.mobile.dev/getting-started/installing-maestro):
   ```sh
   curl -Ls "https://get.maestro.mobile.dev" | bash
   ```
2. Boot a simulator / emulator and install a dev build of the app
   (`pnpm expo run:ios` or `run:android`). Make sure the backend it points at
   is healthy and has a seeded test user.
3. Run a flow:
   ```sh
   cd apps/mobile
   maestro test \
     --env E2E_TEST_EMAIL=smoke@beachleague.app \
     --env E2E_TEST_PASSWORD=••••••• \
     .maestro/auth-smoke.yaml
   ```

To run the Social Hub setup and flows together:

```sh
cd apps/mobile
npm run e2e:social
```

The runner expects:

- Java available to Maestro, either on `PATH` or via `JAVA_HOME` (defaults to
  `/opt/homebrew/opt/openjdk@17`).
- Maestro installed and available on `PATH`.
- A booted iOS simulator with the dev build installed. Set `SIMULATOR_UDID` to
  target a specific simulator; otherwise the first booted simulator is used.
- Metro reachable at `METRO_URL` (defaults to `http://localhost:8081`).
- Backend reachable at `BACKEND_URL` or `EXPO_PUBLIC_API_URL` (defaults to
  `http://localhost:8000`).
- A repo `venv` with backend dependencies available for seed setup.
- `EXPO_PUBLIC_DEV_USER_EMAIL` and `EXPO_PUBLIC_DEV_USER_PASSWORD` available in
  the environment or in `.env`, matching the dev login button.

It seeds the dev user plus Bob/Carol incoming requests, opens the dev-client
bundle, authenticates with the dev login button, and runs the Social Hub and
Sessions/Games smoke flows.

To validate local/CI prerequisites and Maestro syntax without seeding data or
running flows:

```sh
cd apps/mobile
npm run e2e:check
```

For flows that start from a deep link on the iOS simulator, prefer `simctl`
before invoking Maestro. On the local iOS 26 simulator, Maestro's `openLink`
command did not reliably route the `beach-league://` custom scheme:

```sh
xcrun simctl openurl booted 'beach-league://social'
cd apps/mobile
maestro test .maestro/social-hub-smoke.yaml
```

The Social Hub flows include a guarded tap for iOS's first-run "Open in Beach
League" custom-scheme confirmation. They still assume the simulator already has
the app installed, Metro/backend are running, and the app is authenticated.

## Flows

- `auth-smoke.yaml` — boots the app cold, exercises `welcome → login → home`,
  and confirms the home header renders with a greeting row.
- `social-hub-smoke.yaml` — assumes the app is authenticated and already opened
  to `beach-league://social`; walks Messages, Notifications, Friends, and Find
  Players inside the Social hub.
- `social-friend-request-accept.yaml` — assumes the app is authenticated and
  already opened to `beach-league://social?tab=friends`; accepts a seeded
  incoming friend request and verifies the pending count drops.
- `sessions-games-smoke.yaml` — assumes the app is authenticated and already
  opened to `beach-league://add-games`; verifies the Add Games chooser and the
  pickup-game path into score entry.

## Adding new flows

Keep each flow under ~30 steps and focused on one user journey. Prefer visible
text assertions (e.g. `"Hey .*"`) over brittle testID lookups where possible.
