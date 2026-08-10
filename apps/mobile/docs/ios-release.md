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

All iOS profiles are pinned to `macos-sequoia-15.6-xcode-26.2`. Expo project
linking, signing credentials, and App Store Connect submission remain external
setup steps.

## Release verification

Create a production export and run the preflight from `apps/mobile`:

```bash
EXPO_PUBLIC_API_URL=https://beachleaguevb.com npm run release:export:ios
EXPO_PUBLIC_API_URL=https://beachleaguevb.com node scripts/release-preflight.js
```

The preflight rejects missing, malformed, non-HTTPS, and localhost API origins.
It also verifies the bundle identifier, version/build values, iPhone-only
device family, reviewed permission and privacy declarations, privacy-manifest
target membership, EAS profile settings, and the absence of development-auth
markers in the exported bundle. The privacy declaration baseline comes from
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
  --xcode-version 26.2 \
  --ios-sdk-version 26.2 \
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
