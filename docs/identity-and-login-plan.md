# Identity and login improvement plan

Last updated: 2026-09-16. Status: approved for implementation; live-provider
acceptance and release verification remain required.

## Goal and decisions

Let players use email, phone, Google, or Apple to access one Beach League account
on supported platforms, without replacing the existing authentication system.
Keep the established interface and make connection status and errors clear.

- The Beach League user ID identifies the account. Contact email and phone are
  attributes; verified provider subject identifiers identify provider connections.
- Different emails are allowed: a primary email, Google email, and Apple private
  relay email can belong to connections on the same Beach League account.
- A player must sign into the existing account before connecting another provider.
  Never merge accounts automatically because their emails match.
- A provider connection cannot be transferred from another account or silently
  replace a different connection. Reconnecting the same identity is idempotent.
- Connecting Apple or Google does not replace the primary email or create a
  password. Email presence alone does not imply password login is available.
- Defer self-service disconnect, provider replacement, account merging, passkeys,
  email passwordless login, and an authentication-vendor migration.
- Preserve existing credentials and remote data. Keep private acceptance evidence
  and account-console details outside this public repository.

## Baseline and target

This baseline describes the code before this implementation batch, not a claim
that every live provider flow has passed acceptance testing.

| Method         | Mobile baseline                                    | Web baseline                           | Target                                                       |
| -------------- | -------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------ |
| Email/password | Available                                          | Missing from primary login UI          | Login, signup, verification, and recovery on both            |
| Phone/SMS      | Add-phone verification exists; SMS login UI absent | SMS and phone/password login available | SMS login on both; preserve existing phone/password behavior |
| Google         | Available                                          | Available when configured              | Verify returning-user login and explicit connection on both  |
| Apple          | Native iOS flow available                          | Browser flow absent                    | Native iOS and browser login and explicit connection         |

Apple's native button remains platform-gated. This batch does not add a separate
Android Apple integration. Phone login reuses the existing supported number
format and verification infrastructure; it does not introduce a new passwordless
registration system or expand SMS delivery regions.

### Existing contracts to retain

- Password login accepts an email or phone number and password.
- SMS verification and SMS login are separate from signup verification.
- Authenticated Google and Apple connection endpoints verify provider credentials
  and enforce connection ownership conflicts.
- New provider registration retains the existing eligibility gate.
- Account deletion retains Apple credential revocation behavior.

## Implementation work

### Mobile

1. Add a phone-code option alongside existing email/password and provider login.
2. Send and verify SMS codes through the existing API client. Route successful
   login through `AuthContext`, including token persistence and identity changes.
3. Preserve centralized query cancellation and cache clearing before publishing a
   different identity. Do not introduce screen-owned server-data state.
4. Handle invalid numbers, expired codes, resend limits, cancellation, and network
   failures without losing the entered phone number or trapping the player.
5. Retain authenticated add-phone verification. Explain that SMS login requires a
   verified number attached to the account.

### Web

1. Extend authentication interfaces and forms to accept email/password alongside
   existing phone/password and SMS-code login.
2. Reuse email signup, verification, resend, and recovery endpoints. Apply the
   backend's current eligibility policy consistently.
3. Retain Google login and add Apple browser login when configured.
4. Add authenticated connection controls using the existing provider-link APIs.
   Show connection state and useful conflict guidance without exposing provider
   subject identifiers or implying that connected emails must match.
5. Preserve the Navbar on every page, accessible form focus, keyboard operation,
   narrow-screen layout, and clear pending/error states.

### Apple browser integration and shared interfaces

1. Configure an Apple Services ID associated with the existing native app and
   register the exact production HTTPS return URL and domain.
2. Add browser authorization start/completion interfaces. Bind short-lived state
   and nonce to the initiating browser, validate them server-side, and consume the
   transaction once. Bind link transactions to the authenticated account.
3. Validate provider signature, issuer, expected audience, expiry, and nonce.
   Exchange the authorization code server-side with the registered return URL.
4. Reuse existing account lookup, signup eligibility, link-conflict enforcement,
   and encrypted revocation-credential persistence. Preserve native behavior.
5. Extend authorization-code exchange to accept the registered browser return URL
   without accepting arbitrary client-supplied destinations or audiences.
6. Handle cancellation, blocked popups, expired/replayed transactions, unavailable
   configuration, and provider errors. Never put auth tokens in URLs or logs.

No account-schema migration is expected. Add shared API-client methods and types
only for the new browser transaction flow; reuse existing login/link contracts
where possible. Configuration must fail closed when incomplete.

### Apple web configuration

The browser discovers availability from the backend; no additional public
frontend build-time Apple variable is needed.

| Setting                                    | Requirement                                                           |
| ------------------------------------------ | --------------------------------------------------------------------- |
| `APPLE_WEB_CLIENT_ID`                      | Registered Apple Services ID, distinct from the native app identifier |
| `APPLE_CLIENT_IDS`                         | Include the Services ID while retaining existing native audiences     |
| `APPLE_WEB_REDIRECT_URI`                   | `https://beachleaguevb.com/auth/apple/callback` in production         |
| Existing Apple signing/encryption settings | Retain the current protected configuration                            |

Leave both web settings absent for a native-only deployment. Setting only one
fails deployment preflight. The preflight rejects unapproved hosts, non-HTTPS
URLs, alternate paths, ports, credentials, queries, and fragments. Development
may use `https://dev.beachleaguevb.com/auth/apple/callback` after registering it
with Apple; production requires the production callback.

These checks validate configuration shape, not Apple-console registration.
Register the Services ID under the existing primary App ID and verify a real
returning native user signs into the same account on the web before enabling the
entry point in production.

## Connection and recovery behavior

| Situation                                            | Expected behavior                                                           |
| ---------------------------------------------------- | --------------------------------------------------------------------------- |
| Provider has a different email                       | Explicit linking succeeds if its identity is unclaimed                      |
| Apple uses Hide My Email                             | Stable provider identity reconnects to the same account                     |
| New provider login matches an existing contact email | Ask the player to use the existing sign-in method and connect from settings |
| Provider already belongs to another account          | Explain the conflict; do not transfer or merge                              |
| Same provider identity is connected again            | Succeed without duplicating or changing the account                         |
| OAuth-only account has no password                   | Do not imply password login is available merely because an email exists     |
| Player wants SMS access to a provider account        | Verify and attach a phone from authenticated settings first                 |
| Player wants to disconnect                           | No self-service disconnect in this batch; retain current supported access   |

Password creation for provider-only accounts and broader account recovery are
separate product work. Avoid presenting a recovery path as supported unless its
existing backend contract actually allows it.

## Verification and acceptance

Automated checks cover shared contracts, both authentication contexts, rendered
forms, API errors, and backend security boundaries. Independent review is required
for provider transactions, account isolation, and linking.

- Exercise every supported method on mobile and web: successful and returning
  login, signup where supported, verification, recovery, cancellation, and retry.
- Verify different provider emails, Apple Share/Hide My Email, repeated linking,
  an already-claimed provider, and matching-email accounts without automatic merge.
- Verify expired/reused SMS codes, resend throttling, invalid numbers, missing
  attached phone, and failed network requests.
- Verify Apple state/nonce mismatch, replay, wrong audience, expired credentials,
  code-exchange failure, browser binding, and atomic account/credential updates.
- Verify logout and account switching cancel old work and prevent cached data from
  another user appearing. Regression-test existing native Apple and Google login.
- Use headless browser checks, simulator checks, and physical-device acceptance
  with real provider accounts. Record the build and results privately.

Mocked provider tests are necessary but do not prove live Apple/Google setup,
email/SMS delivery, or App Store readiness. Explicitly distinguish automated,
simulator, and live-account results in the handoff.

## Coordination and rollout

Use isolated worktrees for mobile authentication, web/backend authentication,
and the separately approved mobile feedback fixes. Give shared API contracts one
writer. Integrate focused commits after independent review and targeted tests.

The companion feedback batch addresses reporting-sheet usability, useful
notification destinations, stale league-membership controls, and automatic inbox
refresh. Its source reports, issue mappings, and evidence remain private.

Before release:

1. Complete targeted and full regression checks; resolve review findings.
2. Verify provider configuration and supported live-account flows. Record any
   account-console steps requiring the owner's signed-in session.
3. Deploy compatible backend changes before clients that require them, following
   the existing backup and release-preflight procedures.
4. Produce the next allocated TestFlight build, verify processing, inspect the
   new binary's privacy report, and perform device acceptance.
5. Select the accepted build for App Review only after release gates pass and
   final owner approval is recorded. Keep public release under owner control.

Roll back affected client changes or disable an unready provider entry point if
acceptance fails. Never delete accounts, unlink identities, rotate credentials,
or reset remote data as a rollback procedure.

## Provider references

- [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect)
- [Configure Sign in with Apple for the web](https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web)
- [Apple web sign-in guidelines](https://developer.apple.com/sign-in-with-apple/usage-guidelines-for-websites-and-other-platforms/)
- [Account deletion requirements](https://developer.apple.com/support/offering-account-deletion-in-your-app/)
