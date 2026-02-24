---
description: Commit, push, and create a PR into develop
argument-hint: "[commit message (optional)]"
allowed-tools: Bash(git *), Bash(gh *)
---

# Commit, Push, and PR to Develop

Commit all changes, push, and open a PR targeting `develop`. Use `$ARGUMENTS` as the commit message if provided, otherwise infer from the diff.

## Branch Guard

If on `develop` or `main`, create a new feature branch first:
- Derive the branch name from `$ARGUMENTS` or the staged diff (e.g., `add-friend-suggestions`)
- Format: kebab-case, no prefix needed
- `git checkout -b <branch-name>`

## Flow

1. **Assess** — `git status`, `git diff`, `git diff --staged`, `git branch --show-current`, `git log --oneline develop..HEAD`
2. **Branch** — If on develop/main, create and switch to a new branch (see above)
3. **Commit** — If there are uncommitted changes, stage and commit. If clean + no commits ahead of develop, stop — nothing to PR.
4. **Push** — `git push -u origin <branch>`. Never force push.
5. **PR** — `gh pr create --base develop`. If a PR already exists, print its URL instead.
6. **Report** — Print the PR URL.
