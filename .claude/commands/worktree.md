---
description: Create a git worktree and spin up a dev instance on alternate ports
argument-hint: "<branch-name> [port-offset]"
allowed-tools: Bash(git *), Bash(cp *), Bash(cd *), Bash(make *), Bash(npm *), Bash(ls *), Bash(mkdir *), Read, Write, Edit
---

# Worktree Dev Instance

Create a git worktree and configure it to run a full dev stack on alternate ports (so it doesn't conflict with the main repo).

## Inputs

- `$ARGUMENTS` — expects `<branch-name>` and optionally a port offset (default: 10)
- Example: `/worktree my-feature` → ports 3010/8010
- Example: `/worktree my-feature 20` → ports 3020/8020

## Flow

1. **Parse args** — Extract branch name and optional port offset from `$ARGUMENTS`. Default offset = 10.
2. **Create worktree** — `git worktree add ../beach-kings-<branch> -b <branch>` (from the repo root). If the branch already exists, use `git worktree add ../beach-kings-<branch> <branch>` instead.
3. **Create .env** — Copy `.env.worktree.example` to `.env` in the new worktree. Replace all port values using the offset:
   - `FRONTEND_PORT` = 3000 + offset
   - `BACKEND_PORT` = 8000 + offset
   - `BACKEND_INTERNAL_PORT` = 8000 + offset
   - `POSTGRES_PORT` = 5432 + offset
   - `REDIS_PORT` = 6379 + offset
   - `DEBUGPY_PORT` = 5678 + offset
   - Update `COMPOSE_PROJECT_NAME` to `beach-kings-<branch>`
   - Update `ALLOWED_ORIGINS`, `BACKEND_PROXY_TARGET`, `BACKEND_INTERNAL_URL` to match the computed ports
4. **Install deps** — `cd <worktree>/apps/web && npm install --legacy-peer-deps`
5. **Report** — Print the worktree path, all configured ports, and the command to start: `cd <path> && make dev`

Do NOT automatically run `make dev` — just tell the user the command. They may want to review the .env first.
