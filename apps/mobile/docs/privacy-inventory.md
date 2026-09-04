# Beach League privacy inventory

> Status: approved repository baseline for IOS-005
> Inventory date: 2026-08-07
> Applies to: Beach League iOS 1.0 and the production API
> Tracking: no advertising tracking, data-broker sharing, or cross-company
> tracking

This document is the canonical repository inventory for App Store privacy
answers, the public Privacy Policy, and the app privacy manifest. It describes
the current shipping code. Planned services are not treated as active until
their SDK or production integration lands.

Apple uses “collect” to mean transmitting data off the device and retaining it
in readable form beyond the time needed to service the request. Data processed
only on-device, or sent to service a request and immediately discarded, is
called out separately and is not included in the App Store collected-data list.

## Collected data

All listed data is used for **App Functionality**, is not used for tracking, and
is linked to the user unless the row says otherwise.

| Apple data type | Beach League data | Trigger and purpose | Storage / processors | Retention and deletion |
| --- | --- | --- | --- | --- |
| Name | Full name, first/last name, nickname | Account/profile creation, rosters, leagues, matches, and social features | PostgreSQL; hosting/database infrastructure | Active account lifetime; removed or replaced with `Deleted Player` on permanent deletion |
| Email Address | Account email | Email/password or federated authentication, account notices, and support | PostgreSQL; Apple or Google for federated login; Resend for transactional email | Active account lifetime; deleted on permanent deletion |
| Phone Number | Account phone number | SMS verification and account authentication | PostgreSQL; Twilio for SMS delivery | Active account lifetime; deleted on permanent deletion; short-lived verification records expire |
| Coarse Location | Selected city/state, league location, and saved home courts | Nearby league/court defaults and regional features | PostgreSQL | Active account lifetime; profile location and home-court links are deleted on permanent deletion |
| Sensitive Info | Junior/adult group, eligibility country and region, assurance/declaration source, guardian-consent fact, assurance time, and profile gender | Eligibility, junior safeguards, and player-profile functionality | PostgreSQL | Active account lifetime; deleted on permanent deletion. New clients do not collect or derive an exact birthdate. Pre-gate accounts are marked adult from the product owner's account-level attestation; clearing remaining live legacy DOB values is an operator task |
| Emails or Text Messages | Direct messages and league chat | User-to-user and league communication, safety enforcement | PostgreSQL; OpenAI receives minimized content only when moderation is required | Deleted on permanent account deletion; restricted evidence may remain for 180 days after case closure or longer under legal hold |
| Photos or Videos | Avatar, court photos, and review photos | Profile and court/review features, safety enforcement | Object storage and PostgreSQL metadata; OpenAI may receive restricted safety evidence | Deleted from primary storage on permanent deletion; restricted evidence follows the moderation retention rule |
| Gameplay Content | Leagues, seasons, sessions, rosters, matches, scores, rankings, statistics, attendance, and invitations | Core league and gameplay operation | PostgreSQL; Redis may hold short-lived caches | Personal memberships/statistics are deleted. Narrow anonymous completed-match facts may remain indefinitely to preserve other players' records |
| Customer Support | Feedback and support/privacy requests submitted by the user | Responding to requests and operating support | PostgreSQL or the configured support mailbox; Resend for outbound replies | Retained while needed to resolve the request and meet legal/security obligations; account-linked product feedback is deleted where covered by permanent deletion |
| Other User Content | Profile attributes, court reviews, captions, court edit suggestions, reports, report reasons, appeals, and session notes | User-requested features, community safety, and dispute handling | PostgreSQL and restricted evidence storage; OpenAI for minimized safety classification | Primary content is deleted with the account where promised; moderation evidence up to 180 days after closure and content-free audit metadata for one year |
| User ID | Internal user/player IDs, Apple/Google subject identifiers, authentication-provider type | Authentication, authorization, account linking, security, and record ownership | PostgreSQL; Apple and Google during federated authentication | Provider and ordinary account identifiers are deleted on permanent deletion; deleted-player database row remains only for referential integrity and is not exposed through ordinary APIs |
| Device ID | Random installation ID and Expo push token | Registering a specific installation for notifications and preventing delivery after logout/account switch | PostgreSQL; Expo Push Service and Apple Push Notification service | Removed or reassigned on logout/account switch, removed when invalid, and deleted with the account |
| Other Diagnostic Data | Request time, route, response status, IP address, and sanitized error category in operational logs | Security, abuse prevention, uptime, and troubleshooting | Application/hosting logs | Up to 30 days. The release owner must verify this production-provider setting; do not intentionally log tokens, message bodies, contact details, exact coordinates, or photo URLs |

## Transient and on-device data

| Data | Handling | App Store treatment |
| --- | --- | --- |
| Precise device location | Requested only when the user invokes a nearby-location feature. Latitude/longitude is sent to the API to rank locations or courts and is discarded after the response; it is not written to a user/location-history table. Manual city, league-location, and home-court selection remain available. | Not declared as collected while this no-retention contract remains true. The stored city/home-court result is declared as Coarse Location. |
| Session and refresh tokens on device | Stored in iOS Keychain/Secure Store and sent only to authenticate API requests. Server refresh-token records are security credentials, not shared or used for tracking. | Covered by User ID/App Functionality; never disclose token values in documentation or telemetry. |
| Image-picker library contents | The system picker returns only photos the user affirmatively selects. The app does not request full photo-library access. | Only uploaded selections are collected and declared as Photos or Videos. |
| Notification permission state | Read from iOS to present accurate settings. | On-device state is not collected; the user's server-side notification preferences are functional account settings. |
| Query/cache state | TanStack Query and local preference storage cache app data and UI choices on device. | On-device processing is not collected. |

## Processors and disclosures

| Processor | Data and purpose | Restrictions |
| --- | --- | --- |
| Hosting, PostgreSQL, Redis, and object storage providers | Application records, short-lived cache data, photos, and restricted evidence | Service operation only; access-controlled production infrastructure |
| Apple | Sign in with Apple, credential revocation, and APNs delivery | Authentication/notification functionality; no advertising use by Beach League |
| Google | Google OpenID Connect authentication | Beach League stores the returned subject identifier and does not retain Google access or refresh tokens |
| Twilio | Phone number and one-time verification message | SMS authentication only |
| Resend | Recipient email and transactional message | Account, moderation, and support communication only |
| Expo Push Service | Expo push token and privacy-conscious notification payload | Background/terminated-app delivery; enhanced access-token security is required before production enablement |
| OpenAI | Minimized reported/flagged text or image evidence and pseudonymous safety identifiers | Safety classification and recommendation-only triage; response storage disabled where supported; no training opt-in; deployment-account controls still require owner verification |
| Geocoding provider | User-entered city/place search text and, when supplied, transient coordinates | Return autocomplete/nearby results; do not build a user location history |
| Sentry (deferred) | No data in v1. The SDK remains installed but runtime transmission and build-time symbol upload are disabled. | Do not configure or enable until the privacy manifest, App Store answers, public policy, and this inventory are updated together |

## Sentry launch configuration

Sentry is off for v1. Every checked-in EAS profile omits
`EXPO_PUBLIC_SENTRY_DSN` and sets `SENTRY_DISABLE_AUTO_UPLOAD=true`. The runtime also
requires a valid HTTPS DSN before enabling transmission. Do not supply Sentry
organization, project, or upload credentials to a v1 build.

Enabling Sentry in a later release requires privacy approval and disclosure
changes before the DSN or build upload is activated. The intended technical
boundary for that future review is:

- Only a pseudonymous internal user ID is attached; names, email addresses,
  phone numbers, and provider identities are excluded.
- JavaScript request/response data, breadcrumbs, arbitrary extras, exception
  messages, stack-frame variables/source context, mechanism data, tokens,
  cookies, content, exact coordinates, photo URLs, and invite codes are
  discarded by a strict allowlist scrubber.
- Performance tracing, replay, screenshots, attachments, console capture, and
  broad network capture are disabled. Touch breadcrumbs, diagnostic logs,
  client reports, and product-interaction tracking are also disabled.
- Automatic release-health sessions record only the release/environment,
  pseudonymous user identity, start/status, and error/crash outcome needed to
  calculate crash-free session rates; they do not record screens or actions.
- Native crash envelopes do not pass through the JavaScript allowlist. The
  native SDK is separately configured with default PII, breadcrumbs, extra
  threads, screenshots, view hierarchy, failed-request capture, tracing, and
  logs disabled. Native crash diagnostics can still contain app/device/OS
  metadata and the crashing stack required to diagnose the failure.
- Crash Data and Other Diagnostic Data would be used for App Functionality,
  linked through the pseudonymous ID, and never used for tracking.

## Maintenance contract

Any change that adds a provider, SDK, stored field, telemetry, advertising,
location retention, or new use of existing data must update this inventory,
`app-store-privacy-answers.md`, the public Privacy Policy, and
`PrivacyInfo.xcprivacy` in the same release. The release owner must regenerate
Xcode's aggregate privacy report from the signed archive and verify the
30-day operational-log retention setting before submission.
Before enabling Sentry in a later release, update the disclosures above, enable
server-side PII/IP scrubbing, and verify sanitized JavaScript and native test
events in the approved project.
