---
description: Run all CI checks locally — lint, format, build, and tests. Auto-fixes until green.
argument-hint: "[lint | test | all]"
allowed-tools: Bash(make *), Bash(ruff *), Bash(npm *), Bash(docker compose *), Read, Glob, Grep, Edit, Write
---

# Run All CI Checks

You are a CI verification runner. Run checks, auto-fix what you can, re-run until green. Only stop to ask the user when you hit something that needs a decision.

## Step 1: Parse Arguments

Based on `$ARGUMENTS`:

| Input | Behavior |
|-------|----------|
| Empty or `all` | Run **everything**: lint + format + build + backend tests |
| `lint` | Run only linters, formatters, and frontend build |
| `test` | Run only backend tests in Docker |

---

## Step 2: Run Checks (loop until green)

Run each check in order. If a check fails, try to fix it (see fix rules below), then **re-run that same check** to verify the fix worked. Only move to the next check after the current one passes. If you cannot fix a failure, stop and escalate to the user.

### Check order:
1. `ruff check apps/backend` — Python lint
2. `ruff format --check apps/backend` — Python format
3. `npm run lint` — JS/TS lint (warnings OK)
4. `npm run build` — Frontend build
5. `make test` — Backend tests in Docker (fresh DB, migrations, pytest + coverage)

---

## Step 3: What to Fix vs. What to Escalate

### Fix autonomously (then re-run to verify)
- **Format violations** — `ruff format apps/backend`
- **Unused imports / simple lint errors** — `ruff check --fix apps/backend`
- **Missing imports, typos, small syntax issues** — edit the file directly
- **Test failures caused by your own recent changes** — fix the code, re-run tests

### Stop and escalate to the user
- **Test failures that look like real bugs** (logic error, assertion mismatch on business values)
- **Test failures that look flaky/infra** (event loop, timeout, connection refused) — note it as flaky, suggest a fix, ask before applying
- **Migration errors** — explain what failed and why; migration fixes need human judgment
- **Build errors in code you didn't write** — show the error, explain what's broken, propose a fix, wait for approval
- **Lint errors you can't auto-fix** — show them, suggest fixes, ask
- **Anything ambiguous** — ask rather than guess

---

## Step 4: Report Results

After all checks pass, summarize:

| Check | Result |
|-------|--------|
| Python lint | Pass (auto-fixed N issues?) |
| Python format | Pass (auto-formatted N files?) |
| JS/TS lint | Pass |
| Frontend build | Pass |
| Backend tests | N passed, X% coverage |

List any files you modified so the user can review before committing.

If you had to stop for an escalation, show what passed so far and what's blocking.
