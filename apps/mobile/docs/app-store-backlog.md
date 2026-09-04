# iOS v1 App Store Product Readiness Backlog

> Status: active — single source of truth for open product/safety work
> Last consolidated: 2026-08-14
> Owner: product owner
> Production domain: `https://beachleaguevb.com`

This checklist tracks open product and safety work for the first iOS App Store
release. Production deployment, signing, App Store Connect, archive inspection,
TestFlight, physical-device verification, and release evidence are owned by the
[iOS release runbook](ios-release.md). Remove an item from this file when its
acceptance evidence is complete; do not leave completed checkboxes behind.

## V1 scope and release gate

The goal is a safe, reviewable first release—not a mature-company operating
program. Product readiness is complete when this backlog is empty. Submission
also requires every item in the iOS release runbook and an explicit owner go
decision.

Locked v1 decisions:

- Distribution is limited to the United States and Canada; EU storefronts stay
  disabled.
- Minimum age is 13 in the United States and 14 in Canada.
- UGC stays enabled. Moderation is centralized with the product owner.
- Photos remain pending until automated safety review completes. Clear severe
  violations receive the bounded policy action and an immediate owner email;
  ambiguous flags stay quarantined for owner review. Multi-model adjudication
  is not a launch requirement.
- EAS-managed builds are preferred. Production promotion remains manual.
- Sentry is deferred and disabled for v1. Any later enablement requires privacy
  disclosure updates and privacy-sensitive capture must remain disabled.
- `expo-updates` remains disabled for v1; releases ship through App Store builds.
- Marketing email, product analytics, session replay, metadata automation, and
  build-promotion automation are outside v1 scope.

## Submission requirements

### IOS-001 — Lean UGC safety operation

Apple's required foundation is implemented: filtering, reporting, blocking,
content enforcement, account enforcement, audited cases, automated photo review,
and independent direct-message and league-chat write controls. V1 does not
require a second generative-model review tier, automatic external reporting, or
an enterprise incident program.

- [ ] Run one end-to-end staging acceptance pass across every UGC type: submit,
  filter/quarantine review, report, block, owner disposition, removal, and account
  restriction. Confirm the owner can review the queue at least daily while the
  service is live and receives prompt alerts for urgent quarantined material.
- [ ] Before enabling AI-assisted filtering in production, verify provider
  account data controls and contractual terms, confirm the privacy disclosure
  and consent treatment, and run one synthetic containment drill covering both
  message write switches. Keep sensitive evidence out of email and logs.

**Acceptance:** App Review can exercise filtering, reporting, blocking, and a
published contact channel. The owner can find, decide, and remove a reported
item without using database or shell access.

### IOS-002 — Security audit release blockers

A repository-wide, read-only security audit was completed on 2026-08-13 across
the FastAPI backend, Next.js web app, Expo mobile app, realtime paths,
dependencies, containers, CI/CD, and deployment scripts. No committed production
secret was confirmed, and the mobile app stores credentials in SecureStore, but
the audit found authorization, authentication, privacy, and session-management
issues that must be resolved before submission. Deployment and production
verification findings are tracked by `IOS-013` in the
[iOS release runbook](ios-release.md).

- [ ] Remove or privacy-gate legacy public season, match, ranking, award, and
  player-stat endpoints so private-league and private-profile data cannot be
  retrieved by enumerating IDs.
- [ ] Replace public KOB score mutation with director/player authorization or a
  separate, revocable, write-scoped scoring capability.
- [ ] Store refresh and password-reset tokens as keyed hashes. Move the web
  refresh token out of `localStorage` into a Secure, HttpOnly, SameSite cookie
  with the corresponding CSRF protections.
- [ ] Replace API responses containing raw exception strings with opaque error
  identifiers while retaining scrubbed server-side diagnostics.

**Acceptance:** Every item above has linked test or operational evidence; no
unresolved critical or high product-code finding remains; documented security
tests pass; and the release owner records explicit acceptance of any remaining
medium or low product risk. `IOS-013` must separately close the release and
infrastructure findings.

## Official references

- [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Upcoming requirements](https://developer.apple.com/news/upcoming-requirements/)
- [Declared Age Range](https://developer.apple.com/documentation/declaredagerange)
- [Age assurance Q&A](https://developer.apple.com/support/age-assurance)
- [App Privacy details](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/)
- [Account deletion](https://developer.apple.com/support/offering-account-deletion-in-your-app/)
- [Privacy manifests](https://developer.apple.com/documentation/bundleresources/privacy-manifest-files)
- [EU DSA trader requirements](https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-european-union-digital-services-act-trader-requirements)
- [Expo Sentry guide](https://docs.expo.dev/guides/using-sentry/)
