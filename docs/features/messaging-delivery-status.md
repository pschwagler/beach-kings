# Messaging delivery status (email & SMS)

Status of transactional email and SMS delivery, and what still needs to be
completed. This is a living checklist — update it as providers get wired up.

## TL;DR

- **SMS (auth): implemented.** Phone verification, add-phone, and password
  reset all send real codes through Twilio. Delivery is gated on config
  (see below), but the code path is complete and production-ready.
- **Email (auth/transactional): implemented, but a silent no-op when
  unconfigured.** Signup verification, email-based password reset, and feedback
  emails go through Resend. When the feature flag is off or the API key is
  missing, the service logs and returns success **without sending** — so an
  environment can look healthy while delivering nothing.
- **Marketing / campaign email: not built.** No campaign, list-management,
  scheduling, or unsubscribe infrastructure exists yet. Out of scope for now.

## SMS (Twilio)

Implemented and wired end-to-end:

- `services/auth_service.py::send_sms_verification` — sends via Twilio.
- Password reset (SMS): `POST /api/auth/reset-password` +
  `POST /api/auth/reset-password-verify` (phone-number based).
- Phone verification: `POST /api/auth/verify-phone`.
- Add phone to account: `POST /api/auth/phone/add/request` + `.../verify`.

Delivery gating (both must hold for a real send):

1. SMS enabled — `is_sms_enabled(session)` (DB setting first, then env).
2. Twilio credentials present — `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
   `TWILIO_PHONE_NUMBER`.

Gotcha: when SMS is **disabled**, `send_sms_verification` returns `True`
(skips sending) so flows don't break in dev/test. When SMS is **enabled but
Twilio creds are missing**, it returns `False` and the reset route surfaces a
500. Locally, codes are still persisted to `verification_codes` — fetch them
with `make dev-otp` instead of expecting a text.

To complete for a new environment: set the Twilio env vars and confirm the DB
SMS setting is on. No code changes required.

## Email (Resend)

Implemented but delivery is env-gated:

- `services/email_service.py` — `_send_code_email`, feedback email, etc.
- Signup verification: `POST /api/auth/verify-email`.
- Email-based password reset: `ResetPasswordEmailRequest` /
  `ResetPasswordEmailVerifyRequest` routes.

Delivery gating: the `email` feature flag must be on **and** `RESEND_API_KEY`
must be set. Otherwise the send functions log `"stubbed email to ..."` and
return `True` without sending. Because the stub returns success, callers cannot
distinguish "sent" from "skipped" — do not assume email is being delivered in
an environment just because auth flows succeed.

To complete for production:

- [ ] Verify the sending domain in Resend, provision an API key, and set `RESEND_API_KEY`.
- [ ] Turn on the `email` feature flag in the target environment.
- [ ] Set `RESEND_FROM_EMAIL` to an identity on the verified domain.
- [ ] Consider making the stub path observable (metric/log) so a
      misconfigured prod environment is caught rather than silently swallowing
      mail.

## Marketing campaigns (not started)

No implementation exists. When prioritized, this needs: audience/list
management, campaign composition + scheduling, unsubscribe handling and
suppression lists, and compliance (CAN-SPAM / opt-out). Tracked here so the
absence is explicit rather than assumed-present.
