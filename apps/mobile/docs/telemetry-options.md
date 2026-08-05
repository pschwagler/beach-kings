# Mobile Telemetry Options

> Decision date: 2026-08-03  
> Scope: Expo/React Native crash reporting for the first iOS release  
> Decision: Sentry Cloud for crash/error monitoring; no session replay at launch

This note compares current crash-reporting and analytics options for Beach
League Volleyball. Pricing and free-tier limits change; verify them before
creating a paid account.

## Recommendation

Use Sentry for the first release because it has the clearest Expo/EAS workflow
and unified JavaScript/native crash coverage. Start with its free Developer plan
if the team-access limits are acceptable, then upgrade only when usage or team
size requires it.

Do not enable session replay, screenshot capture, console capture, attachments,
or broad request/response logging. The app handles junior accounts, messages,
photos, and location; accidental capture would create disproportionate privacy
risk.

Defer product analytics until the team has three to five concrete questions. If
analytics becomes useful, prefer PostHog with manual named events, GeoIP disabled,
autocapture disabled, and replay disabled.

## Comparison

| Option | Strengths | Tradeoffs | Launch fit |
| --- | --- | --- | --- |
| **Sentry** | First-class Expo/EAS guidance, source-map upload, JavaScript and native crashes, performance tracing, US or Germany hosted region | Not a full product-analytics platform; replay and broad breadcrumbs require careful privacy controls | **Best v1 choice** |
| **Bugsnag** | Mature React Native/Expo crash capture, OOM/app-hang support, stability scoring | Shorter free retention and limited free team access; less integrated with the intended Expo release workflow | Strong runner-up |
| **Firebase Crashlytics** | No-cost crash service, native crashes and Android ANRs, natural pairing with Firebase Analytics | Requires React Native Firebase/native configuration; less unified JavaScript/native debugging for this non-Firebase Expo app | Best budget alternative |
| **Embrace** | Deep mobile observability, native/JS crashes, network and session timelines, OpenTelemetry export | More operational depth and cost than a low-volume v1 needs | Revisit for hard performance problems |
| **PostHog** | Best combined product analytics, feature flags, surveys, errors, and optional replay; US/EU cloud and open-source option | Native crash support requires extra integration; mobile replay records screenshot mode and is too risky for launch | Best later analytics layer |

## Sentry launch configuration

- [ ] Create a Sentry project in the selected hosted region.
- [ ] Integrate the official React Native SDK using Expo's EAS guidance.
- [ ] Upload JavaScript source maps and native symbols for every TestFlight and
  production build.
- [ ] Tag release version, iOS build number, environment, OS/device class, and
  route name.
- [ ] Identify a user only by a pseudonymous internal ID. Do not send name,
  email, phone, date of birth, or provider identity.
- [ ] Enable server-side PII and IP scrubbing.
- [ ] Implement a `beforeSend` allowlist/drop policy rather than relying only on
  key-name redaction.
- [ ] Explicitly scrub authorization headers, cookies, tokens, passwords, email,
  phone, message/review bodies, exact coordinates, photo URLs, invite codes, and
  API request/response bodies.
- [ ] Leave replay, screenshots, attachments, console capture, and broad network
  payload logging disabled.
- [ ] Capture fatal/unhandled JavaScript errors, native crashes, and only handled
  errors that are operationally actionable.
- [ ] Document diagnostics and vendor processing in the privacy inventory,
  public policy, and App Store Connect privacy answers.
- [ ] Verify one controlled JavaScript error and one controlled native crash from
  TestFlight before release, then remove/disable the test triggers.

## Pricing snapshot

Checked 2026-08-03 from official vendor pages:

- Sentry Developer: free, one user, 5,000 errors/month, 30-day lookback. Team was
  listed at $26/month with additional team capacity.
- Bugsnag: free tier listed one user, 7,500 error events/month, and seven-day
  retention.
- Firebase Crashlytics and Google Analytics for Firebase: no-cost products.
- Embrace: free tier listed one million sessions/year, five users, and three-day
  event retention; paid service started with a monthly minimum.
- PostHog: free allowances included analytics events, exceptions, and mobile
  replay, followed by usage pricing.

The launch recommendation does not depend on exact quotas: Sentry wins primarily
on Expo/EAS integration and one JS/native diagnostic workflow.

## Official references

- [Expo: using Sentry](https://docs.expo.dev/guides/using-sentry/)
- [Sentry React Native SDK](https://github.com/getsentry/sentry-react-native)
- [Sentry pricing](https://sentry.io/pricing/)
- [Bugsnag for Expo](https://docs.bugsnag.com/platforms/react-native/expo/)
- [Bugsnag pricing](https://www.bugsnag.com/pricing/)
- [Expo: using Firebase](https://docs.expo.dev/guides/using-firebase/)
- [Firebase privacy and security](https://firebase.google.com/support/privacy/)
- [Firebase pricing plans](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans)
- [Embrace React Native](https://embrace.io/docs/react-native/)
- [Embrace pricing](https://embrace.io/pricing/)
- [PostHog React Native SDK](https://posthog.com/docs/libraries/react-native)
- [PostHog mobile replay](https://posthog.com/docs/session-replay/mobile)
- [PostHog pricing](https://posthog.com/pricing)
