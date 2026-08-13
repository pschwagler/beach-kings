# iOS release configuration

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
