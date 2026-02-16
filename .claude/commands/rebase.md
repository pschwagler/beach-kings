---
description: Rebase current branch onto another branch with conflict-aware checks
argument-hint: "<target-branch> (e.g. main, feature/ps/placeholder-players)"
allowed-tools: Bash(git *), Read, Glob, Grep, Task
---

# Rebase Branch

Rebase the current branch onto a target branch, with pre-flight checks for common conflicts like duplicate alembic migrations.

## Step 0: Parse Arguments

`$ARGUMENTS` is the target branch to rebase onto. If empty, default to `main`.

## Step 1: Pre-flight Checks

Run all of these in parallel:

```bash
git branch --show-current          # Current branch name
git rev-parse --abbrev-ref HEAD    # Confirm not detached
git status --porcelain              # Must be clean working tree
```

**Abort conditions** (report and stop):
- Detached HEAD
- Dirty working tree (unstaged or staged changes) — tell user to commit or stash first
- Current branch IS the target branch

## Step 2: Fetch & Update Target Branch

Always fetch the latest version of the target branch before rebasing:

```bash
git fetch origin <target>
```

If the target is a local branch, also fast-forward it to match the remote:

```bash
# Update local target ref without checking it out
git fetch origin <target>:<target>
```

If the fast-forward fails (local target has diverged), warn the user but continue — the rebase will use `origin/<target>` as the base.

After fetching, compute the rebase range:

```bash
git log --oneline <target>..HEAD   # Commits that will be rebased
```

If zero commits, report "already up to date" and stop.

Print a summary: `Rebasing <current> (N commits) onto <target> (fetched latest from origin)`

## Step 3: Alembic Migration Collision Check

This is the most common rebase hazard. Both branches may have added migrations with the same sequence number.

### 3a. Detect collisions

```bash
# Migrations added on current branch (not on target)
git diff --name-only <target>...HEAD -- apps/backend/alembic/versions/

# Migrations added on target (not on merge-base)
git diff --name-only $(git merge-base HEAD <target>)...<target> -- apps/backend/alembic/versions/
```

Compare the two lists. Look for:
1. **Same filename** on both sides — hard collision
2. **Same numeric prefix** (e.g. both have `019_*.py`) — sequence collision
3. **Revision chain conflict** — read the `Revises:` line in each migration; if both revise the same parent, they will conflict

### 3b. If collision detected

Report clearly:
```
MIGRATION COLLISION DETECTED

  Target has:  019_add_court_discovery_tables.py  (Revises: 018)
  Current has: 019_add_ranked_intent.py           (Revises: 018)

Both migrations claim sequence number 019 and revise 018.
```

Then ask the user how to proceed:
1. **Auto-renumber (Recommended)** — After rebase, renumber current branch's migration(s) to the next available sequence number, update `Revision ID`, `Revises`, and `down_revision` inside the file, and rename the file.
2. **Manual** — Proceed with rebase and let the user resolve.
3. **Abort** — Stop.

### 3c. Revision chain rules

Migration files follow this pattern:
- Filename: `NNN_description.py` (zero-padded 3-digit number)
- `Revision ID: NNN` — must match filename prefix
- `Revises: NNN` — must point to the previous migration's Revision ID
- `down_revision` variable — must match `Revises`

When renumbering, update ALL of these consistently. If multiple migrations from the current branch need renumbering, maintain their relative order.

## Step 4: Overlapping File Check

Scan for files modified on both sides — these will likely conflict during rebase:

```bash
# Files changed on current branch
git diff --name-only <target>...HEAD

# Files changed on target since merge-base
git diff --name-only $(git merge-base HEAD <target>)...<target>
```

Report any files modified on BOTH sides, grouped by:
- **Backend** (`apps/backend/`)
- **Frontend** (`apps/web/`)
- **Config** (root files, docker, etc.)

This is informational only — don't abort, just warn.

## Step 5: Execute Rebase

```bash
git rebase <target>
```

### Conflict resolution

If conflicts occur during rebase, attempt intelligent auto-resolution before asking the user.

**For each conflicted file**, read the conflict markers and apply these strategies:

#### Additive / append-only files (CSS, imports, route registrations)

If both sides added NEW content to the same region (e.g. both appended CSS rules, both added imports, both added routes to routes.py), and neither side deleted or modified the other's lines:
- **Keep both additions.** Target's additions first, then current branch's.
- This is the most common conflict pattern — e.g. both branches added CSS classes to `App.css` or both added endpoints to `routes.py`.

#### models.py / schema additions

If both sides added new columns or fields to the same model class:
- **Keep both.** Maintain the target's additions in their position, then append the current branch's additions.

#### alembic migration conflicts

These should have been caught by Step 3. If one slips through:
- Do NOT auto-resolve. Report and ask the user.

#### package.json / lock files

If `package.json` or `package-lock.json` conflicts:
- Accept the target branch's version, then re-run `npm install` to regenerate the lock file.

#### True semantic conflicts

If both sides modified the SAME lines (not just adjacent additions), this is a real conflict:
- Show the conflicting hunks clearly
- Explain what each side changed and why they conflict
- Ask the user which version to keep (or how to merge them)

### Conflict resolution flow

For each commit during rebase:
1. If conflicts, list all conflicted files
2. For each file, classify the conflict type (additive, semantic, migration, etc.)
3. Auto-resolve additive conflicts — stage them with `git add`
4. For unresolvable conflicts, show the user and ask for guidance
5. Once all files resolved: `git rebase --continue`
6. If user wants to bail: `git rebase --abort`

## Step 6: Post-Rebase Migration Renumber

If Step 3 detected a migration collision and user chose auto-renumber:

1. Find the highest migration number on the rebased branch:
   ```bash
   ls apps/backend/alembic/versions/*.py | sort | tail -1
   ```
2. For each current-branch migration that needs renumbering (in order):
   - Compute new number = max existing + 1
   - Rename file: `NNN_old_description.py` → `NEW_old_description.py`
   - Inside the file, update:
     - `Revision ID: NNN` → `Revision ID: NEW`
     - `Revises: NNN` → `Revises: <correct parent>`
     - `down_revision = "NNN"` → `down_revision = "<correct parent>"`
   - `git add` the rename
3. Amend the relevant commit or create a fixup commit

## Step 7: Verify

Run these checks after successful rebase:

```bash
git log --oneline <target>..HEAD     # Verify commit history looks right
ls apps/backend/alembic/versions/    # Verify migration sequence has no gaps or dupes
```

Quick sanity checks:
- Grep all migration files for `Revision ID` and `Revises` — verify the chain is linear with no duplicates
- Confirm no leftover conflict markers in any files: `git grep -l '<<<<<<'`

Report:
- Number of commits rebased
- Any conflicts resolved (and how)
- Any migrations renumbered
- Current HEAD commit
- Reminder: `git push --force-with-lease` will be needed if branch was previously pushed (but do NOT run it — let the user decide)
