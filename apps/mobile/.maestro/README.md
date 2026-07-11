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

## Adding new flows

Keep each flow under ~30 steps and focused on one user journey. Prefer visible
text assertions (e.g. `"Hey .*"`) over brittle testID lookups where possible.
