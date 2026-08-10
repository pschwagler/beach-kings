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
| Sensitive Info | Sensitive Info | Profile date-of-birth/age facts and gender; use the conservative declaration pending IOS-008 minimization |
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
- Crash Data or Performance Data: Sentry is approved but not installed. Add the
  Sentry launch delta below before submitting any Sentry-enabled binary.

## Required Sentry launch delta

If IOS-104 is present in the release candidate, additionally select **Crash
Data**, **Performance Data**, and **Other Diagnostic Data**. For each choose App
Functionality, linked to the user, and not used for tracking. Confirm the public
policy and app privacy manifest were updated in the same release.

## Submission verification

- Confirm the binary contains `PrivacyInfo.xcprivacy` and tracking is false.
- Compare every embedded SDK manifest with the dependency inventory.
- Generate Xcode's aggregate privacy report from the signed archive and resolve
  missing or unexpected data/API declarations.
- Confirm the public policy is reachable without authentication.
- Capture the published Product Page Preview and retain it with the private
  release evidence.
