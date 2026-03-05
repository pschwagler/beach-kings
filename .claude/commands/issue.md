---
description: Create a GitHub issue with priority, size, and labels
argument-hint: "<issue description>"
allowed-tools: Bash(gh *), AskUserQuestion
---

Create a GitHub issue for: **$ARGUMENTS**

If `$ARGUMENTS` is vague, ask one round of clarifying questions. Otherwise go straight to creating.

Infer **type**, **priority**, and **size** from context. State your picks briefly before creating — don't ask for confirmation unless genuinely unsure.

**Labels** (one from each):
- Type: `New Feature` | `enhancement` | `bug` | `documentation` | `quick issue`
- Priority: `P1` (critical) | `P2` (important) | `P3` (normal) | `P4` (low)
- Size: `S` (<2h) | `M` (half–full day) | `L` (2–4 days) | `XL` (week+)

**Issue format:**
- Title: imperative mood, <70 chars
- Body: `## Summary` (1–3 sentences), `## Details` (acceptance criteria), `## Workflow` (always include: move to **In Progress** when starting, **In Review** when PR opened)

Print the issue URL when done.
