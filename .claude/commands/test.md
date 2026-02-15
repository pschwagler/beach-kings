---
description: Run tests (backend, e2e, or all) with optional isolation
argument-hint: "[backend | e2e | all] [optional: file path, test name, or grep pattern]"
allowed-tools: Bash(make *), Bash(docker compose *), Bash(npx playwright *), Bash(npm run *), Bash(cd *), Read, Glob, Grep
---

# Run Tests

You are a test runner. Parse the arguments below and run the correct tests, reporting results clearly.

## Step 1: Parse Arguments

Based on `$ARGUMENTS`:

| Input | Behavior |
|-------|----------|
| Empty or `all` | Run **both** backend (Docker) and E2E |
| `backend` | Run all backend tests in Docker |
| `backend <path-or-pattern>` | Run isolated backend test(s) — see Step 2 |
| `e2e` | Run all E2E tests (Chromium) |
| `e2e <path-or-pattern>` | Run isolated E2E test(s) — see Step 3 |

If the first argument doesn't match `backend`, `e2e`, or `all`, infer intent:
- `.py` file path or `test_` prefix → backend
- `.spec.js` file path or E2E directory name (auth, league, game, session) → e2e
- Otherwise ask the user

---

## Step 2: Backend Tests (Docker)

### Run all backend tests
```bash
make test
```
This runs `docker compose -f docker-compose.test.yml up --build --abort-on-container-exit --exit-code-from test-runner` which:
- Builds test containers (Python 3.11 + PostgreSQL 16 + Redis 7)
- Runs `pytest apps/backend/tests/ -v --tb=short --cov`
- Tears down containers on completion

### Isolate specific backend tests

To run a subset, override the test-runner command via `docker compose run`:

**By file:**
```bash
docker compose -f docker-compose.test.yml run --rm test-runner pytest backend/tests/test_auth_service.py -v --tb=short
```

**By test class:**
```bash
docker compose -f docker-compose.test.yml run --rm test-runner pytest backend/tests/test_avatar_service.py::TestValidateAvatar -v --tb=short
```

**By test function:**
```bash
docker compose -f docker-compose.test.yml run --rm test-runner pytest backend/tests/test_avatar_service.py::TestValidateAvatar::test_valid_jpeg -v --tb=short
```

**By keyword (-k flag):**
```bash
docker compose -f docker-compose.test.yml run --rm test-runner pytest backend/tests/ -k "search_public" -v --tb=short
```

**Multiple files or patterns:**
```bash
docker compose -f docker-compose.test.yml run --rm test-runner pytest backend/tests/test_s3_service.py backend/tests/test_avatar_service.py -v --tb=short
```

IMPORTANT: The Docker container maps `apps/backend` → `/app/backend`, so paths inside the container use `backend/tests/...` (no `apps/` prefix). Always ensure test infrastructure is running first — if the `run` command fails because postgres/redis aren't up, start them:
```bash
docker compose -f docker-compose.test.yml up -d postgres-test redis-test
```
Then retry the `run` command. When done with isolated runs, clean up with:
```bash
docker compose -f docker-compose.test.yml down
```

### Backend test structure
- Config: `pytest.ini` (asyncio_mode=auto, testpaths=apps/backend/tests)
- Pattern: `test_*.py`, classes `Test*`, functions `test_*`
- Fixtures: `conftest.py` provides `test_engine` + `db_session` (auto-truncates tables between tests)
- 373+ tests across 17 test files

---

## Step 3: E2E Tests (Playwright)

All commands run from `apps/web/`.

### Run all E2E tests
```bash
cd apps/web && npm run test:e2e
```
This auto-starts test infrastructure (postgres-test, redis-test, backend-test containers on ports 5433/6380/8001) and launches Playwright against a dev server on port 3002.

### Isolate specific E2E tests

**By file:**
```bash
cd apps/web && npm run test:e2e -- tests/e2e/auth/login.spec.js
```

**By test name (grep):**
```bash
cd apps/web && npm run test:e2e -- --grep "should successfully login"
```

**By line number:**
```bash
cd apps/web && npm run test:e2e -- tests/e2e/auth/login.spec.js:42
```

**By directory (all specs in a folder):**
```bash
cd apps/web && npm run test:e2e -- tests/e2e/league/
```

**Specific browser:**
```bash
cd apps/web && npm run test:e2e -- --project=chromium
cd apps/web && npm run test:e2e -- --project=firefox
cd apps/web && npm run test:e2e -- --project=webkit
```

### Debugging E2E tests

| Command | Use case |
|---------|----------|
| `npm run test:e2e:ui` | Interactive UI mode — pick and rerun tests visually |
| `npm run test:e2e:debug` | Step-through debugger with Playwright Inspector |
| `npm run test:e2e:headed` | See the browser while tests run |

### E2E test structure
- Config: `playwright.config.js` (60s timeout, HTML reporter)
- Tests: `tests/e2e/{auth,game,league,session}/*.spec.js`
- Page objects: `tests/e2e/pages/` (AuthPage, HomePage, LeaguePage, SessionPage)
- Fixtures: `tests/e2e/fixtures/test-fixtures.js` (testUser, authedPage, leagueWithPlayers, sessionWithMatches)
- Helpers: `tests/e2e/utils/test-helpers.js`
- Local: Chromium only, parallel workers, no retries
- CI (`CI=true`): All 3 browsers, single worker, 2 retries

---

## Step 4: Report Results

After tests complete, report:

1. **Pass/fail count** — extract from pytest or Playwright output
2. **Failed test names** — list each with file:line if available
3. **Error summary** — for each failure, one-line description of what went wrong
4. **Coverage** — if backend, note overall coverage % from pytest-cov output

If all tests pass, keep it brief: "All N tests passed." with coverage %.

If tests fail, **do not attempt to fix them** unless the user explicitly asks. Just report the failures clearly.
