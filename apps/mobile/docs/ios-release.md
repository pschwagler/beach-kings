# iOS production release and verification

The checked-in project under `ios/` is authoritative for the first App Store
release. Do not use `expo prebuild --clean` as a release preparation step; it
can replace reviewed Xcode settings and permission declarations. Expo Doctor's
app-config-sync warning is disabled separately because the release preflight is
the drift guard for this workflow.

## EAS profiles

- `development-simulator` builds a development client for the iOS simulator
  and may connect to `http://localhost:8000`.
- `preview` is an internal build targeting `https://dev.beachleaguevb.com`.
- `production` targets `https://beachleaguevb.com` and auto-increments the
  remotely managed iOS build number.

All iOS profiles are pinned to `macos-tahoe-26.5-xcode-26.6`. The Expo project
is linked to `@pschwagler/beach-league`; signing credentials and App Store
Connect submission remain external setup steps.

## Account Holder manual checklist

These steps require the Account Holder's identity, legal assent, private
financial information, a trusted Apple device, or an Apple web workflow. They
must not be delegated to repository automation.

- Enroll as an individual for v1; the product owner does not plan to create a
  legal entity solely for this release. The Account Holder's personal legal
  name will appear as the App Store seller. If Beach League later forms an
  eligible entity, Apple accepts requests to convert an individual membership
  to an organization membership using the entity's D-U-N-S number and business
  verification.
- Create or select the Account Holder's Apple Account, enable two-factor
  authentication, and keep its legal name, address, phone, trusted number, and
  trusted devices current.
- Complete Apple Developer Program identity/entity verification, accept the
  license agreement, pay the annual membership fee, and answer any later Apple
  compliance-document requests.
- In App Store Connect, accept new Account Holder agreements when Apple presents
  them. If the app will be paid or use in-app purchases, also accept the Paid
  Apps Agreement and personally provide the required banking and tax details.
- Request App Store Connect API access, then create and download a least-
  privilege API key. Apple allows the private key to be downloaded only once;
  place it directly in the approved secret store and never in the repository or
  chat.
- In Certificates, Identifiers & Profiles, confirm the explicit App ID
  `com.beachleague.app` and enable Sign in with Apple, Push Notifications, and
  Declared Age Range. Regenerate affected profiles afterward. Repository and EAS
  automation can manage ordinary certificates/profiles once account access is
  available, but any Apple approval or Account Holder prompt remains manual.
- On a physical signed-in iPhone running the supported iOS release, exercise
  Declared Age Range sharing, guardian-declared sharing, declined sharing, and
  unavailable fallback. Simulator or unsigned CLI builds cannot prove the
  account/family behavior.
- Confirm the prepared age-rating, privacy, content-rights, export-compliance,
  review-contact, territory, and demo-account answers are truthful for the exact
  submitted build. Their entry and submission can be automated after API access,
  but the release owner must supply or approve facts that the repository cannot
  establish.

Everything else—creating the app record, uploading builds, screenshots and
metadata, TestFlight distribution, routine signing assets, release preflight,
and submission—can generally be performed through EAS, Xcode command-line
tools, or the App Store Connect API after the manual setup above.

## First-release operational checklist

This is the single checklist for production deployment, signing, App Store
Connect, TestFlight, physical-device verification, and submission evidence. The
[product readiness backlog](app-store-backlog.md) separately tracks open product
and safety work. Do not submit until both documents are complete and the release
owner records an explicit go decision.

### IOS-003 — Reproducible signed production build

- [ ] Establish protected account access, and keep signing credentials and
  provider secrets out of the repository.
- [ ] Configure production public values and protected secrets in EAS/GitHub;
  verify API, WebSocket, OAuth callback, universal-link, and support hosts use
  the intended `beachleaguevb.com` endpoints.
- [ ] Keep Sentry off for v1: verify the production profile omits
  `EXPO_PUBLIC_SENTRY_DSN`, sets `SENTRY_DISABLE_AUTO_UPLOAD=true`, and does not
  receive Sentry upload credentials. Enabling it requires IOS-005 disclosure
  updates before the build.
- [ ] With Xcode 26.4+ and the iOS 26.4+ SDK, create an Apple Distribution
  archive using the correct App Store profile and upload it without unresolved
  App Store Connect processing warnings.

### IOS-005 — Final privacy declarations

- [ ] Inspect the signed archive's privacy manifests and required-reason APIs,
  then enter App Privacy answers from the approved
  [privacy inventory](privacy-inventory.md) and
  [App Store worksheet](app-store-privacy-answers.md).
- [ ] Confirm the v1 archive sends no Sentry events and contains no enabled
  Sentry DSN; keep Crash Data unselected for this release.

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

### IOS-008 — Declared Age Range release verification

The repository implementation and Apple capability setup are complete. On a
signed physical iPhone, verify Apple sharing, declined sharing, and the
self-declared fallback without collecting an exact birthdate.

- [ ] Complete the signed-device Declared Age Range matrix.

### IOS-009 — Production push credential

- [ ] Enable Expo push access-token security, store `EXPO_ACCESS_TOKEN` only in
  protected deployment configuration, and prove delivery using IOS-006's
  physical-device matrix.

### IOS-010 — Minimal crash reporting

The SDK, repository scrubber, US-region project, production project values, and
server-side PII/IP scrubbing are configured.

- [ ] Verify source-map and native-symbol upload in a release build.
- [ ] From TestFlight, verify one controlled JavaScript error and one controlled
  native crash are symbolicated and privacy-scrubbed, then remove the triggers.

### IOS-011 — Transactional email activation

- [ ] When launch deployment begins, verify `beachleaguevb.com` in Resend,
  provision `RESEND_API_KEY`, configure a verified `RESEND_FROM_EMAIL`, enable
  production email, and confirm `/api/ready` and a real non-sensitive delivery.

### IOS-012 — Production database backup and service release

- [ ] Complete the production service prerequisite below, including the S3
  backup rollout, isolated restore drill, protected production deployment,
  migrations, readiness checks, and public-route checks.

### IOS-013 — Security release and infrastructure verification

A repository-wide security audit was completed on 2026-08-13. Product-code
remediation is tracked by `IOS-002` in the
[product readiness backlog](app-store-backlog.md). Close these deployment and
release controls against the exact production candidate:

- [ ] Replace the dev database refresh flow with a production-side sanitized
  export or synthetic dataset. Never transfer or retain an unencrypted raw
  production dump on a hosted CI runner or dev host; verify SSH host keys,
  delete transient artifacts, and sanitize every sensitive table, including
  direct messages, moderation evidence, provider credentials, and device tokens.
- [ ] Verify retained startup and deployment logs contain no credential-bearing
  configuration. Rotate any credential whose value may have reached shared or
  retained logs and record the rotation only in the approved private evidence
  system.
- [ ] Add and verify production HSTS, a nonce-based Content Security Policy,
  Permissions Policy, and the baseline security headers without breaking OAuth,
  maps, media, public pages, or App Review flows.
- [ ] Keep root environment and credential files out of Docker build contexts;
  remove runtime-image credential copies and use BuildKit secrets or workload
  identity instead. Inspect the built image and build provenance for unintended
  secret material before promotion.
- [ ] Remediate or explicitly risk-accept the reported Python and JavaScript
  dependency advisories, make both dependency audits execute successfully, and
  make high-severity audit failures block CI instead of using
  `continue-on-error`. Keep test-only Python packages out of the production
  backend image.
- [ ] Re-run static analysis, secret scanning, dependency audits, targeted
  authorization/authentication tests, and a production-like API security pass.
  Confirm the shared Redis authentication controls are reachable, enforce the
  documented delivery and verification limits, return uniform discovery
  responses, and fail closed for new authentication when Redis is unavailable.
  Enable the durable auth-delivery worker, verify its Redis heartbeat is fresh,
  and prove queued signup and password-reset delivery through both enabled
  providers without provider latency or failures changing the public response.
  Provision an independent `AUTH_RATE_LIMIT_SECRET` and verify
  `AUTH_TRUSTED_PROXY_IPS` matches the actual Nginx-to-backend network so shared
  venue traffic is counted by client IP rather than as one proxy address.
  Review cloud IAM, S3 bucket policy, signed mobile binaries, and production
  configuration, which were outside the repository-only audit scope.

**Acceptance:** No unresolved critical or high release/infrastructure finding
remains; every check has linked evidence for the exact deployed commit and
signed candidate; and the release owner explicitly accepts any remaining medium
or low residual risk.

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

### Evidence required

- Signed archive and successful App Store Connect processing record.
- TestFlight build number and completed physical-device matrix.
- Public-link verification output.
- Approved privacy inventory and App Store responses.
- Screenshots of age rating, App Privacy, DSA, and listing metadata.
- Private App Review credentials and review instructions.
- Source commit, production configuration record, artifact checksum, submitter,
  passed checks, and explicit owner go/no-go decision.

## v1 update policy

Version 1 does not use Expo over-the-air updates. `expo-updates` is not a direct
dependency and `updates.enabled` is explicitly `false` in `app.json`; the
release preflight enforces both conditions. Every production code or asset
change therefore ships in a reviewed App Store/TestFlight binary.

OTA delivery is deferred until the binary release process is stable because an
OTA JavaScript bundle must remain compatible with the native modules and native
code already installed on each device. Before enabling it, define an explicit
runtime-version policy, separate preview and production channels, staged
rollout/monitoring, and a tested rollback procedure. Native changes will still
require a new store binary. The transitive `expo-updates-interface` package is
an Expo module contract and does not provide OTA delivery by itself.

## Release verification

### Production service prerequisite

The App Store candidate depends on the production API, authentication,
notifications, public web routes, and the database schema expected by its exact
commit. Before the final signed build is submitted, close `IOS-012` in the
operational checklist above.

For the first release containing the backup work, follow the one-time setup in
the [production backup runbook](../../../deployment/backups/README.md). This
requires human-controlled AWS and EC2 configuration: create or select the
private S3 bucket, attach the least-privilege instance role, install
`/etc/beach-kings/backup.env` and the systemd units, run a real backup, verify
its checksum object, enable the timer, and pass the isolated restore drill.
Never put AWS access keys in the repository or server environment file.

After that one-time setup, release the production service before submitting the
mobile binary:

1. Merge the exact reviewed service/mobile commit to `main` after CI succeeds.
2. Confirm the newest scheduled S3 archive is no more than 26 hours old.
3. Run **Deploy Prod** manually for `main` with `skip_build: false`.
4. Confirm the workflow's pre-deployment S3 backup succeeds before images are
   pulled and before the backend can apply Alembic migrations.
5. Confirm `/api/health`, `/api/ready`, frontend health, and both local and
   public required-route checks pass.
6. Record the production workflow run and commit in the private release
   evidence, then exercise the production-dependent TestFlight matrix using
   non-sensitive test data.

Do not submit the App Store build if the backup service is missing, the backup
or deployment fails, production readiness is degraded, or the deployed commit
does not match the release candidate. Do not use a database restore as an
automatic deployment rollback; restores require a separate incident decision
and should first target an isolated replacement database.

Create a production export and run the preflight from `apps/mobile`:

```bash
EXPO_PUBLIC_API_URL=https://beachleaguevb.com EXPO_PUBLIC_WEB_URL=https://beachleaguevb.com npm run release:export:ios
EXPO_PUBLIC_API_URL=https://beachleaguevb.com EXPO_PUBLIC_WEB_URL=https://beachleaguevb.com node scripts/release-preflight.js
```

The preflight rejects missing, malformed, non-HTTPS, and localhost API and
public-web origins. It also verifies the bundle identifier, version/build
values, iPhone-only device family, reviewed permission and privacy declarations,
privacy-manifest target membership, EAS profile settings, and the absence of
development-auth markers in the exported bundle. It also rejects accidental
OTA enablement while the v1 policy is active. The privacy declaration baseline comes from
[`privacy-inventory.md`](privacy-inventory.md); update the inventory, App Store
worksheet, public policy, manifest, and preflight together whenever data use
changes.

For the signed release candidate, open the archive in Xcode Organizer and
generate the aggregate privacy report. Compare every collected-data type,
tracking declaration, required-reason API, and embedded SDK manifest with
[`app-store-privacy-answers.md`](app-store-privacy-answers.md). Store the report
with the private release evidence; do not commit device identifiers, signing
details, or credentials. Simulator builds and the checked-in manifest cannot
close the final-archive verification item by themselves.

For a local unsigned simulator build, use the checked-in workspace:

```bash
xcodebuild -workspace ios/BeachLeague.xcworkspace \
  -scheme BeachLeague -configuration Release -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
```

## Release record

Every preview promoted to a release candidate and every production submission
must have a schema-versioned release record. The checked-in
[`release-record-template.json`](release-record-template.json) documents the
fields; generate records with the script so the commit and artifact digest are
captured rather than transcribed.

Run the generator from a clean checkout of the exact commit used by EAS after
downloading the `.ipa`. Copy the Xcode and iOS SDK versions from the EAS build
log, not from the local machine:

```bash
npm run release:record:create -- \
  --output ../../.release-records/ios-1.0.0-build-42.json \
  --build-number 42 \
  --eas-build-id EAS_BUILD_ID \
  --artifact /private/path/BeachLeague.ipa \
  --submitter RELEASE_SUBMITTER \
  --xcode-version 26.6 \
  --ios-sdk-version 26.6 \
  --toolchain-source eas-build-log
```

The local `.release-records/` directory is ignored by git. Generated files use
owner-only permissions, but the authoritative copy belongs in the approved
private release evidence system. Never put credentials, signing details, demo
account credentials, device identifiers, or real push tokens in a release
record.

Update the generated record as the release advances:

- Set each check to `passed` only when its evidence exists: release preflight,
  production configuration, signed-archive inspection, aggregate privacy
  report, App Store processing, TestFlight smoke matrix, and demo account.
- Set `status` to `approved` only after the release owner chooses `go`; record
  the owner and ISO decision timestamp under `approval`.
- Keep failed attempts as separate private records. Do not overwrite an
  existing record or reuse a checksum/build number for another artifact.

Draft validation checks the schema and captured source/configuration fields:

```bash
npm run release:record:validate -- --file ../../.release-records/ios-1.0.0-build-42.json
```

Final validation is the release-ready gate. It additionally requires a clean
production commit, numeric build number, EAS build ID, EAS-log toolchain,
artifact filename/size/SHA-256, submitter, all checks passed, and explicit
go approval:

```bash
npm run release:record:validate -- \
  --file ../../.release-records/ios-1.0.0-build-42.json \
  --final
```
