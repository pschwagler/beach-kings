# Private TestFlight artifact contract

Use these formats inside `.testflight-triage/` only. Never commit or publish completed artifacts.

## Canonical issue and plan

Create one file per canonical issue at both `issues/TF-NNN.md` and `plans/TF-NNN.md`. Do not combine canonical issues in one file.

```markdown
# TF-NNN — Short user-visible title

- State: NEW | CLUSTERED | REPRODUCED | TRIAGED | DECISION_REQUIRED | PLANNED | APPROVED | IMPLEMENTING | REVIEW | VERIFYING | USER_ACCEPTANCE | DONE | DEFERRED
- Severity: S0 | S1 | S2 | S3 | S4
- Domain: auth | profile | games | leagues | social | navigation | notifications | accessibility | reliability | other
- Source feedback IDs: Apple IDs only
- Cluster: Stable cluster label
- Dependencies: TF IDs or none

## User-visible problem

Describe the behavior without identifying the tester.

## Evidence and reproduction

- Evidence: private screenshot paths, code/tests/logs
- Setup and conditions:
- Steps:
- Expected:
- Actual/current absence:
- Attempts and result:
- Confidence: high | medium | low

## Diagnosis

- Likely cause:
- Root-cause confidence:
- Unresolved questions:

## Product choices

- Decision: exact choice, recommended option, rationale, and owner answer required; or none

## Scope

- In scope:
- Out of scope:
- Compatibility or migration:

## Acceptance criteria

1. Observable, testable criterion.

## Verification strategy

- Automated:
- Simulator/device:
- Regression:

## Risk and rollback

- Risk:
- Rollback:
```

Use severity consistently: S0 security/data-loss/critical outage; S1 crash or launch-critical blocker; S2 broken primary action or materially incorrect data/identity; S3 reliability, navigation, accessibility, or significant friction; S4 polish or feature request.

## Independent review

Write `reviews/TF-NNN.md` with the reviewed commit/diff identity, frozen acceptance criteria, supplied test results, findings ordered by severity, unanswered questions, and verdict (`APPROVED` or `CHANGES_REQUIRED`). Do not include or rely on the implementer's self-review.

## Verification evidence

Store evidence under `evidence/TF-NNN/`. Record environment/build identity, commands and results, device/simulator conditions, acceptance checks, regressions, failures/retries, and verdict (`PASS` or `FAIL`).

## Batch summary

Write `batches/batch-NNN.md` with:

1. Inventory counts and sync time.
2. Canonical issues in dependency order, with severity and source-count only.
3. Duplicate mappings by private issue without exposing feedback content.
4. Recommended product choices and explicit owner decisions required.
5. Frozen acceptance criteria only after approval.
6. Risks, dependencies, and deferred items.
7. At release gate only: commits, review verdicts, automated checks, device evidence, remaining risks, and release decision.

## State transitions

Use only:

```text
NEW -> CLUSTERED -> REPRODUCED -> TRIAGED -> DECISION_REQUIRED/PLANNED
DECISION_REQUIRED -> PLANNED -> APPROVED -> IMPLEMENTING -> REVIEW
REVIEW -> VERIFYING -> USER_ACCEPTANCE -> DONE
Any pre-approval state -> DEFERRED
```

Return from review or verification to `IMPLEMENTING` after a failure. Return to `PLANNED` when scope or product decisions change.
