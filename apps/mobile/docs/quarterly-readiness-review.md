# Quarterly release-readiness review

Owner: Product owner
Cadence: February, May, August, and November
Automation: `.github/workflows/quarterly-readiness.yml`

The scheduled workflow performs repository-safe dependency, privacy,
moderation, and release-readiness checks without production credentials or
external mutations. It can also be run manually before a release candidate.

Each run verifies:

- npm and Python dependency advisories are reported for owner triage;
- Expo dependency compatibility and the v1 no-OTA policy remain intact;
- the production iOS export and release preflight still validate the reviewed
  privacy manifest and release configuration;
- focused moderation fail-closed, escalation, and readiness contracts pass in
  isolated test infrastructure; and
- Apple's current App Review Guidelines and upcoming-requirements pages remain
  reachable for the owner's manual policy review.

Dependency audits are reporting steps rather than automatic upgrade steps.
The product owner must review reported advisories, App Review changes, privacy
inventory drift, moderation coverage/response operations, and any failed job.
Production configuration, deployments, provider settings, and remote data are
never modified by this workflow.
