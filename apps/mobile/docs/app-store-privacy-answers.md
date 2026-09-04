# App Store Connect privacy answers

> Source: `privacy-inventory.md`
> Prepared: 2026-08-07
> Apply to: the reviewed iOS 1.0 release candidate only

This is the copy-ready worksheet for App Store Connect. The Account Holder,
Admin, or App Manager must compare it with the exact release candidate and
Xcode aggregate privacy report before publishing the answers.

## Top-level answers

- **Do you or your third-party partners collect data from this app?** Yes.
- **Is any collected data used for tracking?** No.
- **Privacy Policy URL:** `https://beachleaguevb.com/privacy-policy`
- **Privacy Choices URL:** `https://beachleaguevb.com/privacy-policy` until a
  dedicated privacy-request page is published.

## Data-type answers

Select the following data types. For every row choose **App Functionality** as
the purpose, **Yes** for linked to the user's identity, and **No** for tracking.

| Category | Data type | Beach League basis |
| --- | --- | --- |
| Contact Info | Name | Account/profile identity, rosters, and social/gameplay display |
| Contact Info | Email Address | Authentication and account/support communication |
| Contact Info | Phone Number | SMS verification and authentication |
| Location | Coarse Location | Stored city/state, league location, and home courts |
| Sensitive Info | Sensitive Info | Junior/adult group, eligibility territory, assurance/declaration source, guardian-consent fact, assurance time, and profile gender; no exact birthdate is collected by the release candidate |
| User Content | Emails or Text Messages | Direct messages and league chat, including non-SMS in-app messages |
| User Content | Photos or Videos | Avatars, court photos, and review photos |
| User Content | Gameplay Content | Leagues, sessions, rosters, matches, scores, rankings, and statistics |
| User Content | Customer Support | Feedback and support/privacy requests |
| User Content | Other User Content | Reviews, captions, reports, appeals, profile fields, suggestions, and notes |
| Identifiers | User ID | Internal account/player IDs and federated-login subject identifiers |
| Identifiers | Device ID | Random installation identifier and Expo push token |
| Diagnostics | Other Diagnostic Data | Sanitized operational request, security, and error logs |

## Do not select for the current binary

- Precise Location: device coordinates are transient inputs to a nearby-results
  request and are not retained. Select this type if that retention contract
  changes.
- Contacts, Physical Address, Health, Fitness, Financial Info, Purchases,
  Browsing History, Search History, Audio Data, Environment Scanning, Hands, or
  Head: the current app does not collect them.
- Product Interaction, Advertising Data, or Other Usage Data: no product
  analytics or advertising SDK is installed and Beach League does not retain a
  behavioral event stream.
- Performance Data: performance tracing is disabled. Revisit this answer if
  tracing or profiling is enabled later.

## Sentry diagnostics

Sentry is disabled for the v1 binary: the runtime DSN is explicitly empty and
build-time symbol upload is disabled. Do **not** select Crash Data in App Store
Connect for this release. Other Diagnostic Data remains selected for the
sanitized operational logs described above.

Before enabling Sentry in a later release, update the privacy manifest, this
worksheet, the privacy inventory, and the public Privacy Policy. At that point,
select **Crash Data** and **Other Diagnostic Data** for Sentry as App
Functionality, linked through the pseudonymous internal ID, and not used for
tracking. Do not select Performance Data while tracing and profiling remain
disabled.

## Submission verification

- Confirm the binary contains `PrivacyInfo.xcprivacy` and tracking is false.
- Compare every embedded SDK manifest with the dependency inventory.
- Generate Xcode's aggregate privacy report from the signed archive and resolve
  missing or unexpected data/API declarations.
- Confirm the public policy is reachable without authentication.
- Capture the published Product Page Preview and retain it with the private
  release evidence.
