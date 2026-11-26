# Beach Kings Agent Notes

This is a public repo. Do not expose PII, secrets, tokens, credentials, or security-sensitive details.

## Safety

- Never destroy, drop, delete, recreate, or reset remote database data.

## Project Rules

- Prefer focused, production-ready changes with tests where risk warrants them.
- Every web page must include the Navbar, including public and unauthenticated pages.
- Production domain: `beachleaguevb.com`.
- Prefer immutable updates and small files; 200-400 lines is normal, 800 is a soft max.

## Deployment and Security Reviews

- Before assessing dependency or deployment status, fetch `origin` and identify the current branch, HEAD, and `origin/main`. Base production recommendations on latest `origin/main`, and check whether fixes already landed there or on another branch. Do not infer main's state from an old working tree.
- Preserve uncommitted work. Use an isolated worktree from `origin/main` when the active checkout is stale or contains unrelated changes.
- Read [BUILD_AND_DEPLOY.md](BUILD_AND_DEPLOY.md) and [deployment/release-verification.md](deployment/release-verification.md) before deployment work. Workflow files are the executable source of truth; update the docs with workflow changes.
- Production web/API releases use **Deploy Prod** after successful push CI on main or by manual dispatch. Confirm the release completed after merging to main. Verify the workflow run, source commit, deployed image digests, and health/readiness separately.
- Keep production changes within the user's authorized scope. A security review or documentation task does not authorize a deployment. Do not substitute manual host rebuilds or migrations for the workflow's security and backup gates.
- Never reset or restore a remote database, including dev. The optional Deploy Dev database refresh replaces remote dev data and must not be used under these safety rules.
- Audit the checked-in npm lockfile and `requirements-runtime.lock` for the reviewed revision; development requirements and freshly resolved ranges are not production evidence. Report dependency, container-scan, and live deployment results separately, including access failures.
- Mobile releases are separate from EC2 releases. Follow [apps/mobile/docs/ios-release.md](apps/mobile/docs/ios-release.md); v1 ships code/assets through reviewed binaries, not OTA updates.

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
