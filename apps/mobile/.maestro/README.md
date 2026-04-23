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

## Flows

- `auth-smoke.yaml` — boots the app cold, exercises `welcome → login → home`,
  and confirms the home header renders with a greeting row.

## Adding new flows

Keep each flow under ~30 steps and focused on one user journey. Prefer visible
text assertions (e.g. `"Hey .*"`) over brittle testID lookups where possible.
