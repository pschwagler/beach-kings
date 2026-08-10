# iOS App Store Launch Backlog

> Status: active, launch-blocking  
> Priority: #1 mobile initiative, except active production defect fixes  
> Last requirements check: 2026-08-06
> Canonical production domain: `https://beachleaguevb.com`

This is the source of truth for getting Beach League through TestFlight and
Apple App Review. Keep implementation detail in linked issues or pull requests,
but update status and decisions here as work lands.

## Release gate

Do not submit the first App Store version until:

- Every P0 item below is complete.
- A signed production archive has passed TestFlight smoke testing on a physical
  iPhone and, if tablet support remains enabled, a physical iPad.
- The App Store Connect checklist has been completed by an Account Holder,
  Admin, or App Manager as appropriate.
- The release candidate points only to production HTTPS services under the
  `beachleaguevb.com` domain.
- The current [App Review Guidelines][apple-review] and
  [Apple upcoming requirements][apple-upcoming] have been rechecked during the
  release-candidate week.

Priority meanings:

- **P0:** expected submission blocker or required launch infrastructure.
- **P1:** high rejection, reliability, accessibility, or operational risk.
- **P2:** hardening that may follow the first approved build if explicitly
  accepted by the release owner.

## P0 — submission blockers

### IOS-001 — User-generated content safety

**Status:** Foundation and graduated account enforcement are implemented; not
submission-complete. Production automated enforcement, incident operations,
youth review, and abuse-path drills remain required.
**Decision:** Retain all UGC features. Use AI-assisted triage with accountable
human review; see D2, D3, and the [moderation plan](moderation-plan.md).

Beach League includes direct messages, league chat, player profiles, court
reviews, and user-uploaded photos. Apple Guideline 1.2 requires filtering,
reporting with timely responses, user blocking, and published contact details.

- [x] Add a server-enforced user block model and API.
- [x] Make blocking suppress direct messages, message requests, friend/invite
  actions, mentions/replies, presence/read receipts, and related notifications
  in both directions.
- [x] Keep objective shared-league information visible: roster identity,
  schedules, standings, scores, and match history.
- [x] Keep shared league chat available for league operations, but collapse
  blocked-user posts for the blocker, prevent direct replies/mentions between
  the pair, and allow the blocker to reveal a collapsed post when context is
  operationally necessary.
- [x] Add in-app report actions for profiles, messages, reviews, and photos.
- [x] Store report subject, reporter, reason, target type/ID, timestamps, and
  moderation status without exposing the reporter to the reported user.
- [x] Add an objectionable-text filtering layer and define the photo moderation
  path. Filtering must fail safely and must not silently publish unreviewed
  content when the moderation service is unavailable. Production/staging force
  enforcement mode; chat delivery, notifications, ratings, edited reviews,
  court photos, captions, review photos, and avatars respect the documented
  pending-publication boundary.
- [x] Establish a moderation queue or equivalent durable workflow; email alone
  is not the system of record.
- [x] Add server-side AI triage that classifies severity/category, snapshots the
  relevant context, detects repeat behavior, and recommends an action.
  Every report receives structured recommendation-only triage; provider
  categories, reporter-selected policy reasons, and one-year prior-case counts
  are recorded without sending unrelated identity data. Restricted evidence
  snapshots preserve reported/flagged text, profile content, and app-owned media.
- [x] Automatically acknowledge receipt to the reporter without having AI make
  factual promises about the outcome.
- [ ] Escalate ordinary cases for human disposition within 24 hours. Immediately
  quarantine and alert the human owner for credible threats, sexual exploitation,
  doxxing, stalking, or other high-severity safety signals.
  Ordinary cases have 24-hour due times; flagged content is quarantined and
  urgent triage moves the case due time to now. Owner alert delivery, repeated
  alerting until acknowledgement, and the specialist incident path remain open.
- [x] Keep human approval for bans, appeals, and ambiguous cases at launch;
  record AI output, human decision, and every enforcement action in an audit log.
- [x] Add graduated enforcement: time-bound social/UGC restrictions preserve
  normal gameplay and shared facts; suspensions and bans limit the account to
  status, human-reviewed appeal, deletion, and logout surfaces.
- [x] Add affected-user status/appeal UI and owner controls for time-bound
  restrictions, suspensions, bans, restoration, and appeal disposition.
- [ ] Contractually/configurationally prevent moderation content from being used
  to train a provider's general models; minimize submitted context and retention.
  `store: false`, pseudonymous safety identifiers, and context minimization are
  implemented; deployment-account data controls and contractual verification remain.
- [ ] Publish Community Guidelines and a moderation/support contact on
  `beachleaguevb.com`, then link them in the app. Repository pages and mobile
  links are implemented, but production returned `404` for both
  `/community-guidelines` and `/support` on 2026-08-06.
- [ ] Add backend, mobile, and abuse-path tests, including blocked-user and
  deleted-content behavior. Focused policy, moderation-worker, admin, schema,
  mobile enforcement, and notification tests exist; full abuse-path and
  deleted-target coverage remain open.

**Acceptance:** A reviewer can report each UGC type, block a user, confirm the
block takes effect, and reach the published support channel. The team can show
how reports are reviewed and violating content is removed.

### IOS-002 — Canonical legal and support links

**Status:** Repository implementation complete; production URL verification remains.

- [x] Replace every mobile Terms URL with
  `https://beachleaguevb.com/terms-of-service`.
- [x] Replace every mobile Privacy URL with
  `https://beachleaguevb.com/privacy-policy`.
- [x] Add Terms, Privacy, Community Guidelines, and Support links to Settings.
- [x] Centralize public URLs so screens cannot drift between domains/routes.
- [x] Add tests asserting the canonical HTTPS URLs.
- [ ] Verify every URL returns a public `200` response without authentication
  immediately before submission. Terms and Privacy returned `200` on
  2026-08-06; Community Guidelines and Support returned `404`. Repeat for all
  links after both new pages are deployed and again during release-candidate week.

### IOS-003 — Reproducible production build and environment

**Status:** Partially implemented — EAS profiles, strict API-origin handling,
native release settings, local preflight, and a validated private release-record
workflow are in place. Project linking, credentials, signing, and cloud builds
still require account access.
**Decision:** Use EAS-managed builds; see D4 for the remaining owner setup.

- [x] Choose and document EAS Build or a local Xcode/Fastlane pipeline.
- [x] Add real development, preview/TestFlight, and production build profiles.
- [ ] Link the Expo project if EAS is selected; do not commit credentials.
- [ ] Manage non-secret public configuration per environment and secrets in the
  selected build provider/GitHub environment. Non-secret API origins are set
  per EAS profile; protected secret storage awaits cloud account setup.
- [x] Require a production HTTPS API URL; production builds must fail rather
  than fall back to `http://localhost:8000`.
- [ ] Verify API, WebSocket, OAuth callback, universal-link, and support hosts
  use the intended `beachleaguevb.com` endpoints. HTTP and notification
  WebSocket origins now share one validated source; OAuth, universal links,
  and the deployed Support page still need release-candidate verification.
- [x] Add automatic iOS build-number incrementing and document version policy.
- [x] Add a release checklist that records commit SHA, environment, version,
  build number, toolchain, artifact, and submitter.
- [x] Correct build documentation that currently describes unconfigured files
  as already present.

### IOS-004 — Complete account and credential deletion

**Status:** Partially implemented  
**Decision:** Retain the 30-day recovery window. The user may sign in during the
window to cancel deletion; permanent provider revocation and anonymization occur
when the window expires.

- [x] Clear `apple_id` when permanent account deletion executes.
- [x] Revoke Sign in with Apple credentials using Apple's API. Native sign-in
  now sends Apple's one-time authorization code to the backend, which exchanges
  it for a refresh token, verifies the exchanged identity, and encrypts the
  token at rest. Permanent deletion transactionally moves the credential to a
  durable revocation outbox; the deletion worker retries Apple's revocation
  endpoint indefinitely with capped backoff and erases ciphertext after success.
  Migration 065 and focused provider/failure tests were validated on 2026-08-06;
  production must supply the documented Apple key/team/client/encryption secrets.
- [x] Confirm Google credentials/data access are disconnected where required.
  Beach League uses only the returned OpenID Connect ID token and persists no
  Google access token, refresh token, or scoped Google API data. Permanent
  deletion clears `google_id` and removes the imported avatar copy.
- [x] Document and implement the agreed scheduling behavior: clearly mark the
  account for deletion, allow sign-in/cancellation during the 30-day window, and
  execute permanent cleanup immediately after the window expires. The app also
  offers an immediate permanent-deletion path as Apple requires.
- [x] Verify all user-created messages, reviews, and photos are deleted or
  irreversibly anonymized as promised by the privacy policy. Permanent deletion
  removes direct and league messages, court reviews, and photo database records,
  while app-owned avatar, standalone-photo, and review-photo S3 keys are written
  to a transactional cleanup outbox. The account-deletion worker retries failed
  S3 deletes indefinitely with capped backoff; focused tests cover all media
  categories plus provider failure/retry, and DB integration coverage verifies
  review deletion and durable photo enqueueing (2026-08-06). Retained moderation
  evidence follows the separately disclosed
  restricted-retention policy.
- [x] Document and enforce the narrowly retained match-history contract.
  Permanent deletion preserves only anonymous match position, score, winner,
  ranked/public flags, and session/league/season/court context needed for other
  players' history. The player row remains solely for database foreign-key
  integrity; ordinary APIs return the participant as a non-clickable `Deleted
  Player` with a null player ID and no avatar or attributes. Search, discovery,
  suggestions, invitations, rosters, sitemaps, public profiles, and direct
  interactions exclude the deleted identity. Creator/updater/inviter
  attribution is removed from retained factual records. Restricted moderation
  evidence and audit records continue under their disclosed retention rules;
  suspensions and bans remain unchanged until permanent deletion (2026-08-06).
- [ ] Add end-to-end tests for password, Google, and Apple-created accounts,
  including signing up again after deletion.

**Acceptance:** The flow meets Apple's [account deletion guidance][apple-delete]
and the public retention/deletion promises.

### IOS-005 — Privacy inventory, declarations, and permissions

**Status:** Repository inventory and declaration reconciliation complete; App
Store Connect entry and final signed-archive verification remain. The canonical
[privacy inventory](privacy-inventory.md), copy-ready
[App Store worksheet](app-store-privacy-answers.md), public policy, app privacy
manifest, and release preflight agree on the current shipping baseline. Sentry's
approved but not-yet-installed launch delta is documented explicitly.

- [x] Inventory each collected field, purpose, storage location, retention,
  sharing/processor, account-deletion behavior, and whether it is linked to the
  user or used for tracking.
- [x] Reconcile the inventory with the public Privacy Policy, App Store Connect
  App Privacy answers, and `PrivacyInfo.xcprivacy`.
- [x] Include first-party and third-party SDK behavior in App Privacy answers.
- [ ] Verify every required-reason API declaration in the final archive.
- [x] Remove the full photo-library permission request when the system picker is
  sufficient.
- [x] Remove unused Camera, Microphone, and Face ID dependencies/capabilities and
  purpose strings, or implement specific user-facing reasons if retained.
- [x] Verify location denial has a usable manual alternative and that the app
  asks only when the location feature is invoked. City/location selectors remain
  usable without GPS, denial paths are covered by mobile tests, and non-location
  dashboard/session consumers explicitly skip the device permission request.
- [x] Confirm the app does not track users; if this changes, implement App
  Tracking Transparency before tracking begins. The checked-in privacy manifest
  declares `NSPrivacyTracking` false, no tracking/advertising/product-analytics
  SDK is installed, and product analytics remains explicitly deferred.

### IOS-006 — Signed archive and TestFlight release candidate

**Status:** Simulator Release build passes; distribution archive unverified

- [ ] Build with Xcode 26.2 or later and the iOS 26.2 SDK or later. Apple uploads
  require 26.0+, while Beach League's age-assurance design needs the newer
  Declared Age Range framework capabilities.
- [ ] Archive with Apple Distribution signing and the correct App Store profile.
- [ ] Inspect the exported archive for production APNs, Sign in with Apple,
  associated domains, keychain groups, privacy manifests, and embedded profile.
- [ ] Upload successfully and resolve all App Store Connect processing warnings.
- [ ] Complete the IOS-009 physical-device push matrix from TestFlight, including
  foreground, background, terminated-app, tap routing, denied permission,
  logout, and account-switch behavior; also verify Apple/Google login, universal
  links, API/WebSocket traffic, and account deletion.
- [ ] Test a clean install, upgrade, logout/login, offline recovery, expired
  token, denied permissions, and backend error states on physical devices.
- [ ] Provide App Review with a stable demo account and enough seeded data to
  exercise leagues, messages, reviews, reporting, blocking, and deletion.

### IOS-007 — App Store Connect compliance and listing

**Status:** Requires account access  
**Decision:** First release targets the United States and Canada, is free, and
uses “Beach League Volleyball” as the proposed store name. See D1, D5, D8, D10,
and D11 for remaining details.

- [ ] Confirm Apple Developer enrollment, legal entity/seller name, agreements,
  banking/tax state if applicable, Bundle ID `com.beachleague.app`, and app
  record ownership.
- [ ] Complete Apple's current age-rating questionnaire, declaring messaging,
  UGC, location, and moderation controls accurately.
- [ ] Align the calculated/overridden age rating with the minimum age in the
  Terms and the actual signup enforcement.
- [ ] Declare DSA trader status as Apple requires, but leave EU storefronts off
  for the first release.
- [ ] Complete export-compliance, content-rights, encryption, and availability
  declarations.
- [ ] Enter `https://beachleaguevb.com/privacy-policy` as the Privacy Policy URL.
- [ ] Publish a stable support page on `beachleaguevb.com` and use it as the
  Support URL.
- [ ] Complete App Privacy labels from IOS-005's approved inventory.
- [ ] Prepare name, subtitle, description, keywords, category, promotional text,
  copyright, and release notes without promising unavailable functionality.
- [ ] Capture screenshots from the release candidate for every required device
  class; ensure screenshots show real, reviewable app behavior.
- [ ] Write specific review notes covering demo credentials, moderation,
  location, notifications, Apple login, and account deletion.

### IOS-008 — Junior accounts and youth safety

**Status:** Product direction chosen; legal/safety design required  
**Decision:** Users under 13 are not eligible. The minimum is 13 in the United
States and 14 in Canada for v1.

- [ ] Replace the 18+ Terms language with a legally reviewed 13+ eligibility
  policy and state the guardian-consent rule for minors where applicable.
- [ ] Use a neutral age gate before collecting registration PII. Do not default
  to or coach users toward an eligible age.
- [ ] Add Apple's Declared Age Range capability/API on iOS, using age gates that
  distinguish under 13, junior, and adult users without requesting an exact
  birthdate where it is unnecessary. Handle declined/unavailable responses with
  a neutral, privacy-minimizing fallback rather than silently assuming adulthood.
- [ ] Store only the age/consent facts needed for enforcement and auditing; do
  not derive or retain an exact birthdate from an age-range response.
- [ ] Do not collect account data from a user who declares an age under 13;
  provide a safe rejection path and a process for accounts later discovered to
  belong to under-13 users.
- [ ] Enforce the agreed territory rule: 13+ in the United States and 14+ in
  Canada. Receive legal review for the country/age determination and bypass
  controls rather than relying only on a client-provided locale.
- [ ] Write a concise, age-appropriate privacy notice and consent experience for
  teens in addition to the full legal policy.
- [ ] Make junior privacy protective by default: no public exact location, no
  behavioral advertising/profiling, minimal profile fields, and careful photo
  visibility.
- [ ] Obtain explicit, understandable consent before using a junior's location;
  use it only while the relevant feature is active and provide manual selection.
- [ ] Restrict junior discovery to authenticated users who share an active
  league or are already accepted friends. Do not expose juniors in unrestricted
  global player discovery.
- [ ] Permit junior direct messaging only between mutually accepted friends who
  share an active league. For v1, organizers use shared league channels for
  junior communication rather than receiving a one-to-one messaging exemption.
- [ ] Give junior reports elevated triage and define organizer/guardian and
  emergency escalation without exposing report details inappropriately.
- [ ] Add tests for age boundaries, territory rules, guardian consent, privacy
  defaults, messaging restrictions, deletion, and attempts to bypass the gate.

**Acceptance:** The implementation has youth-privacy/legal review for the launch
territories, prevents under-13 registration, handles Québec explicitly, and
does not expose juniors to unrestricted adult contact.

### IOS-009 — Complete native push notification delivery

**Status:** Repository implementation complete; EAS project linking, APNs and
Expo credentials, signed-build inspection, and physical TestFlight delivery
remain unverified.
**Decision:** Complete the existing Expo Push Service architecture for v1. Keep
WebSockets as the foreground cache transport; use Expo/APNs for background and
terminated-app delivery. Direct APNs and third-party engagement platforms are
deferred until product or operational requirements justify the added complexity.
**Execution:** The repository implementation should land as one focused pass.
Signed-build credentials and physical-device/TestFlight acceptance remain part
of IOS-006 because they cannot be proven in a simulator or unsigned build.

- [x] Add a native push manager under the authenticated mobile provider tree.
  Check the current iOS authorization state, request permission in context, get
  an Expo push token using the linked EAS project ID, and retry registration
  safely after login and when the app becomes active.
- [x] Add typed API-client methods for registering and unregistering push tokens;
  do not access Axios internals from mobile code.
- [x] Register the current token to the authenticated user and unregister it
  before logout or account switch. Handle token rotation and make retries and
  ownership transfer idempotent so a device cannot keep receiving another
  account's notifications.
- [x] Connect the in-app master notification setting to the actual iOS permission
  state. Enabling it should request authorization when possible; denied users
  should get accurate status and a path to system Settings rather than a false
  enabled state.
- [x] Standardize the push payload envelope with notification ID, type, safe
  internal link URL, and domain data. Keep message previews privacy-conscious.
- [x] Handle foreground receipt, background taps, and terminated-app cold-start
  taps. Reuse the allowlisted notification route resolver, mark the related row
  read when appropriate, and fall back safely for unsupported routes.
- [x] Define and test foreground deduplication between WebSocket and push events
  so one server notification cannot produce duplicate banners, sounds, haptics,
  unread increments, or cache entries.
- [x] Ensure every intended notification event, including repeated direct
  messages that update an existing summary row, still emits the expected push.
- [x] Move external push delivery off latency-sensitive API request paths. Add
  bounded retries, batching, Expo ticket/receipt processing, invalid-token
  cleanup, and observable failure reporting without failing creation of the
  durable in-app notification.
- [ ] Enable Expo push access-token security and keep its credential in protected
  deployment secret storage; never commit it or expose it through an
  `EXPO_PUBLIC_*` variable. The worker fails closed when delivery is enabled
  without `EXPO_ACCESS_TOKEN`; enabling enhanced security and installing the
  production secret remain owner/EAS deployment steps.
- [x] Add mobile and backend tests for permission states, registration retry,
  token rotation, logout/account switch, payload routing, cold-start handling,
  duplicate delivery, preference gating, receipt errors, and stale-token cleanup.
- [x] Document the operational test-send and receipt-diagnosis procedure without
  recording real device tokens or credentials in this public repository.

**Acceptance:** A clean TestFlight install on a physical iPhone can opt in,
receive one correctly routed notification while backgrounded and terminated,
avoid duplicates in the foreground, respect app and iOS preferences, stop
delivery after logout, transfer safely on account switch, and surface delivery
failures through the documented operational path. Complete the signed-build
matrix in IOS-006 before marking this item done.

## Current and imminent Apple requirements

These are Apple requirements already in force or announced for the current
release window:

- **SDK minimum, since 2026-04-28:** uploads must use Xcode 26 or later and the
  iOS/iPadOS 26 SDK or later. The audited local Xcode 26.1.1 toolchain satisfies
  this, but CI/build-provider images must also be pinned appropriately.
- **Updated age ratings, since 2026-01-31:** the updated questionnaire must be
  completed in App Store Connect. UGC, messaging, and parental-control answers
  must reflect the shipped product.
- **Social-media age-rating questions, required beginning 2026-09:** submissions
  must answer Apple's new social-media capability questions. If an app declares
  that social media is disabled for users under 13, Apple requires at minimum
  that it call the Declared Age Range API before enabling those features.
- **Age assurance:** Apple says developers remain responsible for their age
  restrictions. The complete current age-assurance feature set requires Xcode
  26.2 and the iOS/iPadOS 26.2 SDK or later. Adopt it for the U.S. launch,
  including the regulatory signals Apple provides in Utah and Louisiana.
- **DSA trader status:** a status declaration is required. Verified trader
  contact information is displayed for apps distributed in the EU.
- **Required-reason APIs, since 2024-05-01:** the submitted app and included SDKs
  must provide approved reasons for designated APIs.

Recheck Apple's requirements, age-assurance Q&A, and developer news when the
release candidate is cut because Apple updates them independently of this
repository.

## P1 — release-risk reduction

### IOS-101 — Dependency and Expo health

- [x] Upgrade the runtime Axios dependency beyond the audited vulnerable version
  and verify the advisory is resolved.
- [x] Update Expo packages to the patch versions expected by the installed Expo
  SDK, then rerun Expo Doctor.
- [x] Restore Expo's Metro defaults while preserving monorepo requirements.
- [x] Decide whether native folders are authoritative or generated by prebuild;
  eliminate configuration drift accordingly.
- [ ] Triage remaining audit findings, distinguishing runtime dependencies from
  build-only transitive packages.

### IOS-102 — Accessibility acceptance

- [x] Expose each review rating as one value such as “4 out of 5 stars” and hide
  decorative star glyphs from VoiceOver.
- [x] Add meaningful labels or decorative treatment to review thumbnails.
- [ ] Use accessible modal/sheet primitives with announcement, focus trapping,
  escape handling, and focus restoration.
- [ ] Test every launch-critical flow with VoiceOver, Reduce Motion, Increase
  Contrast, Bold Text, and accessibility text sizes.
- [ ] Verify 44-point targets, logical reading order, error announcements, and
  non-color status indicators.

### IOS-103 — iPhone/iPad scope and responsive QA

**Decision:** Version 1 is iPhone-only; see D6.

- [ ] Replace module-load `Dimensions.get()` sizing with reactive window
  dimensions in the court photo grid.
- [ ] Test portrait/landscape, split view if supported, keyboard, safe areas,
  sheets, and navigation on supported iPads.
- [x] If iPad is not a supported v1 experience, disable tablet support before
  screenshots and submission rather than shipping an untested layout.

### IOS-104 — Observability and support operations

**Decision needed:** See D7 and D8.

- [ ] Implement Sentry Cloud for crash/error reporting using the approved
  [telemetry decision](telemetry-options.md).
- [ ] Scrub tokens, message bodies, contact details, and other personal data from
  telemetry before enabling it.
- [ ] Document production alert ownership and support/moderation coverage.
- [ ] Add a release-health view for crash-free sessions, API failures, push
  failures, and login failures if telemetry is selected.
- [ ] Create a rejection/incident runbook and an expedited kill-switch strategy
  for unsafe UGC features that does not rely on an unreviewed binary change.

### IOS-105 — Full release regression

- [ ] Keep TypeScript, ESLint, unit/integration tests, and production export green.
- [ ] Resolve existing hook/timer lint warnings that can cause stale behavior.
- [ ] Run critical E2E flows against production-like services.
- [ ] Validate cold start, memory, list scrolling, image upload, and poor-network
  behavior on at least one older supported iPhone.
- [ ] Run a focused security review for token handling, deep links, uploads,
  rate limits, authorization, and report/block abuse.

## P2 — post-approval hardening candidates

- [ ] Add mobile CI for lint, typecheck, tests, Expo Doctor, production export,
  bundle-size regression, and secret/configuration checks.
- [ ] Automate preview and production build promotion with protected GitHub/EAS
  environments and manual approval.
- [ ] Add App Store metadata and screenshot automation if release frequency makes
  it worthwhile.
- [ ] Decide whether to enable `expo-updates`; document runtime-version and
  rollback policy before shipping OTA updates.
- [ ] Add recurring quarterly privacy, dependency, moderation, and App Review
  guideline audits.

## Product and operational decisions needed

Record answers here before implementation begins; the suggested default is not
a substitute for owner sign-off.

### D1 — Minimum user age

**Decision:** Prohibit users under 13. Use 13+ in the United States and 14+ in
Canada for v1, avoiding a Canadian guardian-consent flow for 13-year-olds. Align
the Terms, neutral signup age gate, privacy notices, and App Store answers, and
receive focused youth-privacy review before launch.

### D2 — Which UGC features ship in v1?

**Decision:** Retain direct messages, league chat, court reviews, and photo
uploads. Complete IOS-001 before submission; no UGC surface receives a launch
exception from report/block/filtering requirements.

### D3 — Moderation operating model

**Decision:** Keep moderation centralized for the quickest maintainable v1;
league organizers may report/block but do not moderate. Use the layered
[AI-assisted moderation plan](moderation-plan.md): deterministic checks, free
text/image safety classification, low-cost `gpt-5.6-luna` triage, and `gpt-5.6`
flagship escalation. The product owner is the sole human moderator initially.
AI may classify, summarize, prioritize, quarantine temporarily, and draft; it
does not permanently ban users or decide appeals. Ordinary cases target a
24-hour review, while urgent material is quarantined and repeatedly alerts the
owner.  
**Open:** Define evidence retention and the specialist incident path for
suspected exploitation or credible imminent threats. The affected-user appeal
flow and human grant/uphold workflow are implemented; operational response-time
and abuse-drill validation remain.

### D4 — Build and submission owner

**Direction:** Prefer EAS-managed builds/submission with protected environments,
auto-incremented builds, and manual production approval.  
**Decision:** No legal entity exists, so enrollment would be individual and the
owner's legal name would appear publicly as the App Store seller. A personal
Apple Account with two-factor authentication exists.  
**Open:** Confirm acceptance of the public seller name, enroll that account in
the paid Apple Developer Program, create/confirm the Expo account, and retain
final submission authority with the owner.

### D5 — Launch territories and DSA status

**Decision:** First public release is United States and Canada; EU storefronts
remain off. Apple still requires a trader/non-trader status declaration.  
**Open:** Determine the appropriate trader status and complete the Canadian,
provincial, and U.S. youth-privacy review for a 13+ social product.

### D6 — iPad at launch

**Decision:** Make v1 iPhone-only. Remove declared native iPad support before
creating store screenshots and verify the resulting device-family settings in
the signed archive. Native iPad support can be added in a later release.

### D7 — Crash reporting and analytics

**Decision:** Use Sentry Cloud for privacy-scrubbed JavaScript/native crash and
error monitoring at launch. Keep session replay, screenshots, attachments,
console capture, and broad network payload logging off. See the
[vendor comparison and configuration](telemetry-options.md).  
**Open:** Choose the Sentry hosted region and dashboard owner. Product analytics
remains separate and is deferred until events, retention, and privacy declarations
are intentionally designed; PostHog is the leading later candidate.

### D8 — Public support and moderation identity

**Decision:** Create role aliases on `beachleaguevb.com`, initially forwarding
to the existing shared Gmail inbox, with the ability to add moderators/support
staff later. At minimum create `support@` and `safety@`; consider `privacy@`.  
**Verified:** Cloudflare and Google public DNS resolvers both report Mailgun's
mail exchangers for the domain. Repository email sending uses Resend, which is
separate. The owner does not currently recognize having Mailgun account access.  
**Implementation:** Search the owner's email/password manager for the Mailgun
account and recover it if practical. Otherwise replace the inbound MX records at
the DNS provider with a controlled forwarding/mail service. Then add role
forwards, test delivery, and configure authenticated outbound “send as” behavior.
Migrate moderation into an auditable queue rather than treating the mailbox as
the case database.

### D9 — Beta cohort and exit criteria

**Decision:** Recruit approximately ten testers. Run at least one week of
TestFlight with organizers and players, multiple physical device generations,
zero open P0 defects, and explicit release-owner signoff.  
**Open:** Name the testers/devices and the person with ship/no-ship authority.

### D10 — Store identity and positioning

**Direction:** Use “Beach League Volleyball” as the proposed App Store display
name, subject to availability and final metadata review.  
**Open:** Choose subtitle, primary/secondary categories, seller/legal identity,
and launch description.  
**Constraint:** all public URLs use `beachleaguevb.com`; metadata and screenshots
must describe only functionality enabled in the reviewed build.

### D11 — Monetization

**Decision:** Version 1 is completely free: no subscriptions, paid digital
features, advertising, or league-fee collection in the app. Revisit App Store
payment rules and privacy declarations before introducing any monetization.

## First readiness-wave evidence — 2026-08-04

- `npx expo-doctor`: 17/17 enabled checks passed. The native app-config sync
  check is intentionally disabled because the checked-in iOS project is
  authoritative; `release:preflight` is the drift guard.
- Focused mobile integration run: 9 suites and 134 tests passed, covering auth
  legal links, Settings deletion choices, API-origin/preflight behavior,
  notification transport, photo picking, court photos, and review ratings.
- `npm run lint` in `apps/mobile`: zero errors and nine pre-existing warnings.
- Database-free user-route/auth suite: 37 tests passed. Database-backed deletion
  tests were updated but not run because no approved isolated database was
  provided; no database recovery/reset/recreation action was performed.
- API-client suite: 128 tests passed. `npm audit --omit=dev` reports no direct
  Axios or Next.js finding; 27 transitive production findings remain to triage.
- Next.js 16.3 production build passed, and Expo Doctor confirms `expo-camera`
  is absent. CocoaPods were refreshed and no longer contain ExpoCamera or
  ZXingObjC.
- Production iOS export and release preflight passed for
  `https://beachleaguevb.com`; missing configuration and localhost both failed
  as intended. The preflight scanned 25 export files for development-auth
  markers.
- An unsigned arm64 Release simulator build succeeded on local Xcode 26.1.1.
  Inspection confirmed bundle ID `com.beachleague.app`, display name
  “Beach League,” version `1.0.0 (1)`, device family `1`, portrait-only phone
  orientations, only the location purpose string, and the checked-in privacy
  manifest with tracking disabled.
- Public HTTPS checks on 2026-08-06 returned `200` for Terms and Privacy, while
  Community Guidelines and Support returned `404`; `/api/health` passed in the
  earlier readiness run. Deploy both public pages, then repeat the complete
  public-link check during release-candidate week.

## Evidence required to close the launch gate

- Link to the approved product decisions above.
- Links to merged PRs for all P0 implementation work.
- Final privacy inventory and App Store Connect response worksheet.
- Exported entitlements/profile inspection from the signed archive.
- TestFlight build number and physical-device test matrix.
- Final validated release record with source commit, production environment,
  toolchain, artifact SHA-256, submitter, passed checks, and go/no-go decision.
- Screenshots of completed age rating, App Privacy, DSA, and listing metadata.
- App Review demo instructions and credentials stored in the approved private
  system, never in this public repository.
- Named release owner and explicit go/no-go signoff.

## Official Apple references

- [App Review Guidelines][apple-review]
- [Upcoming requirements][apple-upcoming]
- [Social-media questionnaire requirement][apple-social-questions]
- [Declared Age Range API][apple-age-range]
- [Age assurance Q&A][apple-age-assurance]
- [Set an app age rating][apple-age]
- [Manage App Privacy details][apple-privacy]
- [Offering account deletion][apple-delete]
- [Privacy manifests][apple-manifest]
- [EU DSA trader requirements][apple-dsa]
- [FTC COPPA business guidance][ftc-coppa]
- [Canada: consent and children][canada-consent]
- [Canada: youth privacy by design][canada-youth]
- [Québec private-sector privacy law, section 4.1][quebec-privacy]

[apple-review]: https://developer.apple.com/app-store/review/guidelines/
[apple-upcoming]: https://developer.apple.com/news/upcoming-requirements/
[apple-social-questions]: https://developer.apple.com/news/?id=tlur8uvi
[apple-age-range]: https://developer.apple.com/documentation/declaredagerange/requesting-people-share-their-age-range-with-your-app
[apple-age-assurance]: https://developer.apple.com/support/age-assurance
[apple-age]: https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating/
[apple-privacy]: https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/
[apple-delete]: https://developer.apple.com/support/offering-account-deletion-in-your-app/
[apple-manifest]: https://developer.apple.com/documentation/bundleresources/privacy-manifest-files
[apple-dsa]: https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-european-union-digital-services-act-trader-requirements
[ftc-coppa]: https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions
[canada-consent]: https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/the-personal-information-protection-and-electronic-documents-act-pipeda/p_principle/principles/p_consent/
[canada-youth]: https://www.priv.gc.ca/en/about-the-opc/what-we-do/provincial-and-territorial-collaboration/joint-resolutions-with-provinces-and-territories/bg_231005_01/
[quebec-privacy]: https://www.legisquebec.gouv.qc.ca/en/pdf/cs/P-39.1.pdf
