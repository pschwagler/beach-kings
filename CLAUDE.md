# Project board
- Task tracking: https://github.com/users/pschwagler/projects/2

Note - this is a public repo. Don't leak any PII or anything that could compromise security.

# Rules for codebase
- All methods should aim to be DRY, refactored, and professional / production ready
- All methods should be well-documented with docstrings
- All methods should be well-tested with unit tests

# Testing
- **TDD is required.** Write tests before implementation.
- **100% test coverage** target for all new code.
- **Comprehensive E2E tests** for critical user flows.
- Run tests locally before every commit.
- When running checks or tests, always fix failing tests — even if they are pre-existing and unrelated to current changes. Leave the test suite greener than you found it.

# Database Safety — CRITICAL
- **NEVER destroy, drop, delete, or recreate the database or its data** — not even locally, not even to "fix" something.
- **Prohibited commands** (this list is NOT exhaustive — use judgment):
  - `docker compose down -v` (the `-v` flag destroys volumes)
  - `docker volume rm`, `docker volume prune`
  - `docker compose rm` on db containers
  - Any script or Makefile target that recreates the database from scratch
- If a database issue arises, **ask the user** before taking any action that could affect data.

# Navigation
- Every page in the web app MUST include the Navbar. No page should render without it — including public/unauthenticated pages (e.g. SEO landing pages, public league views).

# Components
- Functional components, exported default
- Explicit return types: `React.ReactNode` or `JSX.Element`
- Props defined as `interface` (not `type`), destructured in function signature
- Composable via spread: `{ ...rest }` with extended Chakra props (e.g., `FlexProps`)
- `'use client'` only on components/pages that need interactivity

# General
- Prefer immutability
- Many small files over few large ones (200-400 lines typical, 800 max)

# Canonical domain
- The app's production domain is `beachleaguevb.com` (web and API).

# Mobile theming (NativeWind v4)
- Components use one semantic class per role (`bg-surface`, `text-muted`) — no `dark:` color variants. See `apps/mobile/docs/theming.md`.
- Never hardcode hex colors. Use a semantic class on styled elements; for color values passed as props (icon `color=`, `style={{ ... }}`) read from `usePaletteColors()` so they track light/dark. The only exception is a deliberately non-semantic palette (e.g. per-item avatar variety), which must be commented as such.
- **NativeWind v4 collision rule:** if you add a new semantic role to `semanticColors()`, you must delete any same-named legacy entry in `tailwind.config.ts` in the same commit. Spread-last override silently fails — the bundler bakes in the legacy static hex instead of the CSS var.

# Tools

Always use headless mode when using agent-browser, playwright, chrome devtools if you can

## agent-device (iOS Simulator)

`agent-device` is the CLI tool for interacting with the iOS simulator. Key usage patterns:

When the user asks for "e2e verify", "device-browser", "use device-browser", or "use agent-device", they mean interactive device-level verification with `agent-device` on the simulator, not just Maestro CLI, Playwright, or browser-only checks. Use this path for mobile E2E verification whenever available; Maestro remains the scripted regression suite.

**Session management — always check first:**
```bash
agent-device session list          # list active sessions
agent-device --session bk <cmd>   # reuse existing session "bk" (bound to iPhone 16e)
```
Prefer an existing active Beach League session from `agent-device session list`. The session named `bk` may be pre-configured for this project, but other active sessions such as feature-specific QA sessions can exist. Always pass `--session <name>` to every command — omitting it creates a new session and causes `INVALID_ARGS` conflicts. Do not run overlapping interactions against a session another agent is actively using; wait, coordinate, or choose a separate simulator/session.

**App identifiers:**
- App display name: `Beach League`
- Bundle ID: `com.beachleague.app`

**Common commands:**
```bash
agent-device --session bk snapshot          # visible text/structure (read-only, fast)
agent-device --session bk snapshot -i       # interactive refs (@e1, @e2…) for clicking
agent-device --session bk screenshot        # save screenshot; read with Read tool
agent-device --session bk click @e3         # click by ref — NOT "tap", that command does not exist
agent-device --session bk scroll down       # scroll; re-snapshot after
agent-device --session bk open com.beachleague.app  # open/foreground the app
agent-device --session bk app-switcher      # show app switcher (fallback when "open" fails)
```

**Clicking gotchas:**
- `click` only accepts interactive refs (`@e1`, `@e2`…), never text strings — always run `snapshot -i` first to get refs.
- `back` does NOT work for in-app back buttons. Tap the back button ref found via `snapshot -i` instead.
- `open com.beachleague.app` can fail for Expo dev-client builds (`xcrun exited with code 4`). Use `app-switcher` to bring the already-running app forward, and verify the app process with `lsof -i :8081`.

**Debugging mobile API calls:**
- `agent-device network dump` does NOT capture React Native `fetch` calls — iOS Unified Logging doesn't expose them. Diagnose API issues by reading source code instead (check `packages/api-client/src/methods.ts` and `apps/mobile/src/lib/api.ts`).
- Backend and public-web origins are set in root `.env` as `EXPO_PUBLIC_API_URL`
  and `EXPO_PUBLIC_WEB_URL` (for example, `http://192.168.50.103:8000` and
  `http://192.168.50.103:3000`).

**After backend code changes:** the backend runs from a pre-built Docker image with no hot reload. Always rebuild and restart:
```bash
docker compose build backend
docker compose up -d backend
```

# Local dev utilities

These Makefile targets exist specifically to unblock agents and humans during local development and testing. Prefer them over re-deriving the same queries/scripts ad hoc. Run `make help` for the full list.

- `make dev-login ID=<player_id>` — print access + refresh tokens and a JS snippet to paste into the browser console to log in as that player. `make dev-login` with no ID lists players.
- `make dev-otp EMAIL=<email>` / `make dev-otp PHONE=<e164>` — fetch the latest unused, unexpired signup or password-reset verification code from the local DB. Use during UI/E2E validation of OTP flows (email is stubbed locally when `ENABLE_EMAIL=false`, but the code is still persisted in `verification_codes`). `make dev-otp` with no args returns the latest code for any identifier.
- `make seed-users` — create three test users with password `test1234` for quick manual exercise of auth flows.
