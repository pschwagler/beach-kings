# iOS v1 App Store Launch Backlog

> Status: active — single source of truth for open launch work
> Last consolidated: 2026-08-11
> Owner: product owner
> Production domain: `https://beachleaguevb.com`

This is the only issue checklist for the first iOS App Store release. Supporting
documents may explain implementation or record evidence, but they must not grow
separate launch checklists. Remove an item from this file when its acceptance
evidence is complete; do not leave completed checkboxes behind.

## V1 scope and release gate

The goal is a safe, reviewable first release—not a mature-company operating
program. Submit only when every P0 item is complete, a signed TestFlight build
has passed on a physical iPhone, public links work, and the release owner gives
an explicit go decision.

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
- Sentry Cloud uses the US region, with privacy-sensitive capture disabled.
- `expo-updates` remains disabled for v1; releases ship through App Store builds.
- Marketing email, product analytics, session replay, metadata automation, and
  build-promotion automation are outside v1 scope.

Priority meanings:

- **P0:** required before App Store submission.
- **P1:** release acceptance work that may be closed during the final TestFlight
  candidate, but not silently waived.

## P0 — submission requirements

### IOS-001 — Lean UGC safety operation

Apple's required foundation is implemented: filtering, reporting, blocking,
content enforcement, account enforcement, audited cases, automated photo review,
and independent direct-message and league-chat write controls. V1 does not
require a second generative-model review tier, automatic external reporting, or
an enterprise incident program.

- [ ] Deploy Community Guidelines and Support on `beachleaguevb.com`, publish a
  working moderation/support contact, and verify both links from the app.
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

### IOS-002 — Canonical public links

- [ ] Immediately before submission, verify Terms, Privacy Policy, Community
  Guidelines, and Support return public HTTP `200` responses without
  authentication and all in-app/App Store links use `beachleaguevb.com`.

### IOS-003 — Reproducible signed production build

- [ ] Establish protected account access, and keep signing credentials and
  provider secrets out of the repository.
- [ ] Configure production public values and protected secrets in EAS/GitHub;
  verify API, WebSocket, OAuth callback, universal-link, and support hosts use
  the intended `beachleaguevb.com` endpoints.
- [ ] With Xcode 26.4+ and the iOS 26.4+ SDK, create an Apple Distribution
  archive using the correct App Store profile and upload it without unresolved
  App Store Connect processing warnings.

### IOS-005 — Final privacy declarations

- [ ] Inspect the signed archive's privacy manifests and required-reason APIs,
  then enter App Privacy answers from the approved
  [privacy inventory](privacy-inventory.md) and
  [App Store worksheet](app-store-privacy-answers.md).

### IOS-006 — TestFlight release candidate

- [ ] Inspect the exported archive for production APNs, Sign in with Apple,
  associated domains, keychain groups, privacy manifests, and its embedded
  provisioning profile.
- [ ] On a physical iPhone, test Apple/Google login, universal links,
  API/WebSocket traffic, account deletion, clean install, upgrade, logout/login,
  offline recovery, expired credentials, denied permissions, and backend errors.
- [ ] Complete the physical-device notification matrix: foreground, background,
  terminated app, tap routing, denied permission, logout, and account switch.
- [ ] Prepare a stable App Review demo account with seeded leagues, messages,
  reviews, reporting, blocking, and deletion, stored only in the approved
  private system.

### IOS-007 — App Store Connect and listing

- [ ] Confirm paid Apple Developer enrollment, seller/legal identity,
  agreements, banking/tax state if applicable, Bundle ID
  `com.beachleague.app`, app-record ownership, and final submission authority.
- [ ] Complete Apple's current age-rating questionnaire and align the result
  with the Terms and enforced signup minimums.
- [ ] Declare the required DSA trader status, confirm the United States/Canada
  territory configuration, and keep EU storefronts disabled.
- [ ] Complete export-compliance, encryption, content-rights, availability, and
  other required compliance declarations.
- [ ] Approve and enter the proposed store name, subtitle, description, keywords,
  categories, promotional text, and copyright from the
  [v1 metadata draft](app-store-metadata.md), replacing the seller-name
  placeholder with the exact App Store Connect rights owner.
- [ ] Capture release-candidate screenshots for each required device class.

### IOS-008 — Junior accounts and youth safety

**V1 rule:** Beach League admits users aged 13 or older in the United States and
14 or older in Canada, including Québec. Anyone below the applicable minimum is
rejected before registration data is collected. A parent or guardian cannot
override the minimum. Canadian 13-year-olds are not admitted.

The repository work is complete: a neutral country/age-band gate, server-signed
eligibility proof, Apple Declared Age Range bridge and fallback, minimum-data
storage, junior privacy defaults, restricted discovery/direct messaging,
location consent, elevated report handling, and boundary/bypass tests are in
place. Eligible juniors confirm guardian permission; this is not an exception
for an otherwise ineligible user. Existing accounts were confirmed by the
product owner to belong to adults, and migration `072` records only that adult
status without deriving or retaining birthdates. Migrations `071` and `072`
have been verified locally and are applied automatically to the existing
production database by the backend entrypoint during the next deployment.

- [ ] In the Apple Developer account, enable Declared Age Range for
  `com.beachleague.app`, regenerate the distribution profile, and verify the
  Apple-sharing, declined-sharing, and self-declared fallback paths on a signed
  physical iPhone running the supported iOS version.

**Acceptance:** Production enforces US 13+ and Canada 14+ with no under-minimum
exception, the signed app carries the capability, and the physical-device paths
work without collecting an exact birthdate.

### IOS-009 — Production push credential

- [ ] Enable Expo push access-token security, store `EXPO_ACCESS_TOKEN` only in
  protected deployment configuration, and prove delivery using IOS-006's
  physical-device matrix.

### IOS-010 — Minimal crash reporting

The Sentry SDK and strict repository scrubber are installed. The US-region
project and production EAS DSN/project values are configured. The Sentry-aware
Metro serializer and native upload build phases are present, but uploads remain
inactive until the protected build token is added.

- [ ] Enable server-side PII/IP scrubbing in Sentry.
- [ ] Verify source-map and native-symbol upload in a release build.
- [ ] From TestFlight, verify one controlled JavaScript error and one controlled
  native crash are symbolicated and privacy-scrubbed, then remove the triggers.

### IOS-011 — Transactional email activation

- [ ] When launch deployment begins, verify `beachleaguevb.com` in Resend,
  provision `RESEND_API_KEY`, configure a verified `RESEND_FROM_EMAIL`, enable
  production email, and confirm `/api/ready` and a real non-sensitive delivery.

## P1 — final release acceptance

### IOS-102 — Physical accessibility acceptance

- [ ] Test every launch-critical flow with VoiceOver, Reduce Motion, Increase
  Contrast, Bold Text, and accessibility text sizes.
- [ ] Verify 44-point targets, logical reading order, error announcements, and
  non-color status indicators on a physical device.

### IOS-105 — Focused release regression

- [ ] Run the critical signup/login, league, game, message, report/block,
  notification, and deletion flows against an isolated production-like stack.
- [ ] On at least one older supported iPhone, validate cold start, scrolling,
  image upload, memory behavior, and poor-network recovery.

### IOS-106 — Delete-confirmation touch isolation

- [ ] Reproduce the delete-account alert dismissal using VoiceOver and physical
  touch. If the tap reaches the Settings control underneath, replace the native
  alert with an isolated destructive-confirmation screen or sheet without
  making immediate deletion easier to trigger.

## Evidence required for release

- Signed archive and successful App Store Connect processing record.
- TestFlight build number and completed physical-device matrix.
- Public-link verification output.
- Approved privacy inventory and App Store responses.
- Screenshots of age rating, App Privacy, DSA, and listing metadata.
- Private App Review credentials and review instructions.
- Source commit, production configuration record, artifact checksum, submitter,
  passed checks, and explicit owner go/no-go decision.

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
