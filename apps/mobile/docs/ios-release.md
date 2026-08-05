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
device family, reviewed permission declarations, EAS profile settings, and the
absence of development-auth markers in the exported bundle.

For a local unsigned simulator build, use the checked-in workspace:

```bash
xcodebuild -workspace ios/BeachLeague.xcworkspace \
  -scheme BeachLeague -configuration Release -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
```
