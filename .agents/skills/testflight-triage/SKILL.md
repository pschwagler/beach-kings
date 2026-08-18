---
name: testflight-triage
description: Safely synchronize, reproduce, cluster, plan, implement, review, verify, or summarize private Beach League TestFlight screenshot and crash feedback. Use for any TestFlight feedback intake or batch workflow, including requests to run the read-only App Store Connect sync, create TF-NNN issue plans, prepare an owner approval batch, process an approved issue, or prepare release evidence.
---

# TestFlight Triage

Operate the private TestFlight workflow without leaking feedback or crossing an owner gate. Keep all raw comments, screenshots, tester/device data, plans, reviews, and evidence in the gitignored `.testflight-triage/` workspace.

## Start safely

1. Read `docs/testflight-triage-workflow.md` and `references/artifact-contract.md` completely.
2. Confirm the current branch is the approved `testflight/YYYY-MM-DD-batch-N` integration branch.
3. Inspect `git status`; preserve unrelated and user-owned changes.
4. Never print, commit, publish, or send feedback artifacts, tester identities, credentials, JWTs, private-key paths, or signed attachment URLs.
5. Never mutate or delete App Store Connect feedback or remote database data.

## Synchronize feedback

Run from this skill directory or invoke the script by its repo-relative path:

```text
node .agents/skills/testflight-triage/scripts/fetch-feedback.cjs [--app-id ID] [--workspace PATH] [--since ISO_DATE]
```

Default to app ID `6801891670` and workspace `.testflight-triage/`. The command reads credentials from the owner-only metadata file named `.testflight-triage-credentials.json` beside the protected `.p8`, or from `TESTFLIGHT_TRIAGE_CREDENTIALS`. It prints counts and the private workspace path only. Treat a failed sync as non-destructive: do not update the last-successful timestamp.

## Intake and cluster

1. Preserve every Apple feedback ID in `raw/feedback.json`; never discard a source as a duplicate.
2. Cluster submissions by shared user-visible behavior and likely root cause. Assign one stable `TF-NNN` ID per canonical issue.
3. Map all source IDs to the canonical issue. Create one isolated `.testflight-triage/issues/TF-NNN.md` and `.testflight-triage/plans/TF-NNN.md` per issue.
4. Prioritize crashes, data loss, security/privacy, and blocked launch flows first; then broken actions/identity/data; reliability/navigation/accessibility; product decisions; polish/features.

## Reproduce and diagnose

Require current-behavior evidence whenever feasible. For mobile work, first read `apps/mobile/AGENTS.md` and any directly applicable docs. Use the `agent-device` skill for simulator interaction when available.

- For defects, record exact setup, steps, expected result, actual result, attempts, build/device conditions, and confidence.
- For feature requests, confirm and record the current absence or behavior.
- For intermittent behavior, record every attempt and condition; never turn uncertainty into a confirmed diagnosis.
- Use code and test inspection to explain evidence, but do not change product code before approval.

## Plan and obtain approval

Use the artifact contract exactly. Consolidate canonical plans into a dependency-ordered batch with severity, recommended product choices, acceptance criteria, risks, and deferrals.

Stop at the combined triage/batch gate. Ask the owner to approve the issue set and resolve every `DECISION_REQUIRED` choice. Do not edit product code, create builds, upload releases, publish private artifacts, or create external tickets before approval.

## Implement an approved batch

Process exactly one approved issue at a time on the integration branch:

1. Freeze its acceptance criteria and mark it `APPROVED`.
2. Give one implementation writer exclusive access. Make one focused commit with proportional tests, referencing the private ID, for example `fix(mobile): refresh avatar after upload (TF-004)`.
3. Give an independent reviewer only the source feedback, frozen criteria, diff, and test results. Do not pass the implementer's self-review.
4. Give an independent verifier the frozen criteria and reviewed build. Require automated checks plus simulator/device acceptance when relevant.
5. Resolve failures through the same single-writer loop and summarize evidence privately.

If implementation expands scope, changes privacy/moderation/account/data semantics, or reveals a new product choice, return the issue to planning and stop for owner direction.

## Complete a batch

Mark an issue `DONE` only with a defensible reproduction/diagnosis, frozen criteria, focused commit, proportional automated coverage, independent review, device evidence when relevant, and a coordinator summary. At batch completion, present commits, reviews, checks, device evidence, risks, and deferrals. Stop at release approval before building or uploading another TestFlight candidate.
