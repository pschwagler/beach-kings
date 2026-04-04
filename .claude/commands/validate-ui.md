---
description: Full UI validation — deploys app if needed, dynamically discovers current routes/features, runs parallel subagents for auth/navigation/CRUD/visual/data checks using agent-browser.
argument-hint: "[base-url (default: http://localhost:3000)]"
allowed-tools: Bash(agent-browser *), Bash(make *), Bash(curl *), Bash(find *), Bash(ls *), Bash(lsof *), Read, Glob, Grep, Agent
---

# Validate UI

You are a UI validation orchestrator. Validate the entire web application dynamically. Discover what the app is now by reading the codebase, then test it.

---

## Phase 0: Verify agent-browser (STOP if broken)

```bash
agent-browser --version
```

If this fails: try `npx agent-browser --version`. If both fail:
> **STOP — OUTPUT:** `BLOCKED: agent-browser not installed. Run: npm install -g agent-browser && agent-browser install`

Quick smoke test:
```bash
agent-browser open https://example.com && agent-browser snapshot -i && agent-browser close
```

If this fails:
> **STOP — OUTPUT:** `BLOCKED: agent-browser is not functional. Error: <paste error here>. Fix before running /validate-ui.`

---

## Phase 1: Ensure App is Running

Base URL: use `$ARGUMENTS` if provided, else `http://localhost:3000`.

```bash
curl -s -o /dev/null -w "%{http_code}" <BASE_URL> --max-time 5
```

If response is not 2xx or connection refused:
1. Run in background: `make dev`
2. Poll every 5s up to 60s: `curl -s -o /dev/null -w "%{http_code}" <BASE_URL> --max-time 3`
3. If still not up after 60s: **STOP** — output `BLOCKED: App failed to start. Check 'make dev' output.`

---

## Phase 2: Discover App Structure (do this before launching subagents)

### 2a. Enumerate all current routes

```bash
find apps/web/app -name "page.tsx" -o -name "page.js" | sort
```

From this output, build a list of:
- **Static routes**: paths with no `[brackets]`
- **Dynamic routes**: paths with `[param]` segments — note the param name to look up real IDs later
- **Auth-required routes**: check if the page imports from auth context or has `redirect` guards
- **Public routes**: landing pages, legal, public profiles, etc.

### 2b. Enumerate entities (what can be created/edited/deleted)

```bash
ls apps/backend/routers/
```

Each router file typically corresponds to a domain entity. Note all entity types.

### 2c. Get auth credentials

```bash
make dev-login
```

This lists available player IDs. Then get tokens:
```bash
make dev-login ID=1
make dev-login ID=2
```

Save the `access_token` and `refresh_token` values — pass them to every subagent - each subagent should test once with ID 1 and once with ID 2.

### 2d. Look up real IDs for dynamic routes

Navigate to the app with auth injected (see auth injection pattern below) and visit key pages to collect real IDs for dynamic routes (e.g., league IDs, session codes, player IDs). You need at least one real ID per dynamic route type to test those pages.

**Auth injection pattern** (use this in every subagent):
```bash
agent-browser --session <SESSION> open <BASE_URL>
agent-browser --session <SESSION> storage local set beach_access_token "<ACCESS_TOKEN>"
agent-browser --session <SESSION> storage local set beach_refresh_token "<REFRESH_TOKEN>"
agent-browser --session <SESSION> open <BASE_URL>/home
agent-browser --session <SESSION> wait --load networkidle
```

---

## Phase 3: Launch All Subagents in Parallel

Use the **Agent tool** to spawn all 6 subagents simultaneously. Each subagent must receive:
- `BASE_URL`, `ACCESS_TOKEN`, `REFRESH_TOKEN`
- The discovered routes list and entity types
- Its unique `--session` name for agent-browser isolation

Each subagent should **read the relevant parts of the codebase** to understand what currently exists before testing. This makes them self-adapting to whatever the app is now.

---

### Subagent 1 — Auth & Session
**Session name:** `validate-auth`

1. Open `<BASE_URL>` without auth — verify the page loads, take a screenshot
2. Find and use the login form — fill credentials, submit, verify redirect to authenticated state
3. Reload the page — verify session persists (still logged in)
4. Find the logout mechanism — log out, verify redirect to unauthenticated state
5. Test error states: wrong password → verify error message shown, no crash; empty fields → verify validation
6. Re-login to restore auth state
7. Take screenshots at each key step

**Report:** What passed/failed. Screenshots of login, authenticated state, logout, error states.

---

### Subagent 2 — Navigation & Link Coverage
**Session name:** `validate-nav`

1. Inject auth tokens, navigate to app
2. Read `apps/web/components` (or wherever the Navbar/layout is) to understand navigation structure
3. Visit **every static route** from the discovered routes list
4. For **dynamic routes**: use real IDs collected in Phase 2d to visit at least one example of each
5. On each page:
   - Verify the Navbar is present
   - Verify page has content (not blank, no error boundary)
   - Verify page title is set
   - Note any console errors with `agent-browser errors`
   - Take a screenshot
6. Click through all primary navigation links; verify each lands on expected content

**Report:** All pages visited (pass/fail). Any missing Navbar. Any blank pages or error states. Any broken navigation links. Screenshots of each page.

---

### Subagent 3 — Create Operations
**Session name:** `validate-create`

1. Inject auth, navigate to app
2. Read `apps/web/app` directory tree and `apps/backend/routers/` to identify all entity types that support creation
3. For **each entity type** that has a create flow:
   - Find the create button/link by navigating the UI and using `agent-browser snapshot -i`
   - Fill out the creation form with valid test data — use clearly labeled names like `"UI Validation Test - <timestamp>"` so test data is identifiable
   - Submit and verify success (success message, redirect, or item appears in list)
   - Take a screenshot of the created result
   - Note the new entity's ID/identifier for subagent 5 to clean up
4. Test invalid submission: attempt to submit an empty required form — verify errors appear, no crash

**Report:** All entity types tested (pass/fail). Created entity IDs/names. Any failures. Screenshots.

---

### Subagent 4 — Update Operations
**Session name:** `validate-update`

1. Inject auth, navigate to app
2. Read `apps/web/app` and `apps/backend/routers/` to identify all entity types that support editing
3. For **each entity type** that has an edit flow:
   - Navigate to an existing item (prefer items created by Subagent 3, or use existing data)
   - Open edit mode — find the edit button/link
   - Modify at least one field to a new value
   - Save — verify success feedback
   - Re-navigate to the item and verify the change persisted
   - Take a screenshot of before (editing) and after (saved result)
4. Test validation: try to save with an invalid field (e.g., too-long text, invalid date) — verify errors are shown without crashing

**Report:** All entity types tested (pass/fail). Any fields that didn't persist. Screenshots before/after.

---

### Subagent 5 — Delete Operations
**Session name:** `validate-delete`

1. Inject auth, navigate to app
2. Read codebase to identify all entity types that support deletion
3. For **each deletable entity type**:
   - Create a fresh test entity first (label it `"UI Validation Cleanup Test"`) — never delete user's real data
   - Find the delete action (button, menu item, etc.)
   - Verify a confirmation dialog or step appears before deletion executes
   - Confirm the deletion
   - Verify the item no longer appears in the list/page
   - Take screenshots of: the delete confirmation, and the empty state after deletion
4. Verify that bulk or cascading operations (if any) warn the user before executing

**Report:** All entity types tested (pass/fail). Any deletions that didn't confirm first. Any items that remained after deletion. Screenshots.

---

### Subagent 6 — Data Integrity & Visual Quality
**Session name:** `validate-visual`

1. Inject auth, navigate to app
2. **Spot-check displayed numbers** for plausibility across all pages:
   - Ratings/scores: check range is sensible (e.g., not 0, not astronomical values)
   - Record counters (wins, losses, etc.): verify totals add up (wins + losses = total if that's the logic)
   - Date/time displays: verify no "Invalid Date", "NaN", or epoch timestamps (1970)
   - Percentages: verify 0–100% range
   - Count badges on tabs/sections: verify badge count matches the number of items in the list
   - For each suspicious value: note what it shows vs. what would be expected
3. **Full-page screenshots** (use `agent-browser screenshot --full`):
   - Desktop viewport (default 1280x720) — every major page
   - Mobile viewport: `agent-browser set viewport 375 812` then re-shoot key pages
4. **Visual quality checks** on screenshots:
   - Text/content clipping (sentences cut off, elements overflowing their container)
   - Broken images (look for alt-text placeholders or 0-size image elements)
   - Layout anomalies (overlapping elements, misaligned grids, unexpected whitespace)
   - Empty sections that appear to need content (loading spinners that never resolved, "No data" where data should exist)
   - Dark mode inconsistencies (if app supports it)

**Report:** Suspicious numbers found (with context). Visual issues (described + screenshot path). All pages screenshotted.

---

## Phase 4: Aggregate & Report

After all subagents complete, compile:

```
## UI Validation Report
Generated: <timestamp>
Base URL: <BASE_URL>

### Summary
| Subagent          | Status    | Issues |
|-------------------|-----------|--------|
| Auth & Session    | PASS/FAIL | N      |
| Navigation        | PASS/FAIL | N      |
| Create            | PASS/FAIL | N      |
| Update            | PASS/FAIL | N      |
| Delete            | PASS/FAIL | N      |
| Data & Visual     | PASS/FAIL | N      |

Total issues: N critical, N warnings

### Critical Issues (fix before shipping)
- [Subagent] [Page/Feature]: description

### Warnings (should fix)
- [Subagent] [Page/Feature]: description

### Passed
- Summary of what was verified successfully

### Screenshots
- [path]: description
```

Clean up:
```bash
agent-browser close --all
```

If any **Critical** issues were found, end with:
> `ACTION REQUIRED: N critical issues found. See report above.`

If only warnings:
> `WARNINGS: N non-blocking issues found. App is functional but has quality issues.`

If everything passed:
> `ALL CLEAR: UI validation passed across all subagents.`
