# Beach Kings Agent Notes

This is a public repo. Do not expose PII, secrets, tokens, credentials, or security-sensitive details.

## Safety

- Never destroy, drop, delete, recreate, or reset remote database data.

## Project Rules

- Prefer focused, production-ready changes with tests where risk warrants them.
- Every web page must include the Navbar, including public and unauthenticated pages.
- Production domain: `beachleaguevb.com`.
- Prefer immutable updates and small files; 200-400 lines is normal, 800 is a soft max.

## Mobile Data State

- TanStack Query owns all mobile server data; see `apps/mobile/AGENTS.md` and `apps/mobile/docs/data-state.md` before changing mobile fetching, caching, or auth transitions.

## Mobile Theming

- NativeWind v4 mobile UI uses semantic classes like `bg-surface` and `text-muted`; avoid `dark:` color variants.
- Do not hardcode hex colors in mobile UI. For color props or inline styles, use `usePaletteColors()`.
- If adding a role to `semanticColors()`, remove any same-named legacy entry from `tailwind.config.ts` in the same change.

## Local Utilities

- `make dev-login ID=<player_id>` prints local auth tokens to login when validating app.
- `make dev-otp EMAIL=<email>` or `make dev-otp PHONE=<e164>` fetches local verification codes.
- `make seed-users` creates test users with password `test1234`.
- Prefer headless mode for `agent-browser`, Playwright, and browser automation.
