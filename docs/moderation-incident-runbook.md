# Moderation Specialist Incident Runbook

Status: **Draft — legal and safety approval required before IOS-001 launch**
Owner: Trust & Safety owner
Last source review: 2026-08-06

This runbook is for a trained human owner reviewing an urgent moderation case. The application alerts and records; it never contacts emergency services, crisis services, law enforcement, NCMEC, Cybertip.ca, or another authority automatically.

## Non-negotiable boundaries

- Work from the authenticated moderation case. Do not paste evidence, report text, identities, or contact details into email or the external-response form.
- Do not download, duplicate, or email suspected child sexual abuse material. Preserve app-held evidence with the legal-hold control and use only an approved reporting workflow.
- Treat a reporter-selected category as a routing signal, not proof. It can make review urgent but cannot by itself hide content.
- Record acknowledgement when review begins. Acknowledgement does not satisfy the disposition deadline; record a substantive decision separately.
- Record outside contact only after a human chooses the channel and jurisdiction. Store the operational note and external reference, not evidence.
- If this runbook conflicts with approved legal advice or an authority’s current instructions, stop and consult the designated safety/legal owner.

## First five minutes

1. Open the case through the authenticated admin link and confirm incident type, deadline, quarantine state, and evidence availability.
2. Acknowledge the case. This stops eight-hour urgent reminders but does not close or disposition it.
3. Assess whether available context indicates immediate danger, what jurisdiction is reasonably supported, and whether a minor may be involved. Do not infer a precise location from weak context.
4. Decide whether a legal hold is necessary under the approved retention policy.
5. Choose the applicable checklist below. If the incident type is wrong, treat the case according to the highest credible risk and record the reasoning.

## Immediate danger or credible threat

1. Assess specificity, imminence, identified target, capability, and supported location from app-held context.
2. If danger appears immediate, use the approved emergency-services or local-law-enforcement procedure for the supported jurisdiction. Do not use this application to transmit evidence.
3. If immediacy or jurisdiction is unclear, consult the designated safety specialist before outside contact.
4. Apply the proportionate content/account disposition and record the policy basis.
5. Record any human-made outside contact in the case, including channel, jurisdiction, reference, and a concise operational note.

## Self-harm

1. Assess whether the content indicates intent, instructions, a timeframe, means, or otherwise imminent risk.
2. Consult the designated safety specialist when identity or jurisdiction is uncertain. The app must never initiate a crisis or emergency contact.
3. For a human-reviewed U.S. response, use the official [988 Suicide & Crisis Lifeline guidance](https://988lifeline.org/get-help/). It describes free call, text, and chat support; use emergency services for immediate physical danger under the approved procedure.
4. For a human-reviewed Canadian response, use the official [9-8-8 Suicide Crisis Helpline](https://988.ca/), which provides 24/7 call and text support and directs immediate safety emergencies to 9-1-1.
5. Record the human decision and substantive moderation disposition. Avoid exposing the reporter or escalating the situation through direct moderator contact unless an approved protocol explicitly requires it.

## Stalking or doxxing

1. Assess ongoing access, repeated unwanted contact, location exposure, threats, account compromise, and immediate danger.
2. Preserve relevant app-held context. Do not contact the reported person or repeat exposed personal information in notes.
3. Apply immediate interaction restrictions or content removal when supported by review; an urgent category alone is not evidence for automatic removal.
4. If immediate danger is credible, follow the immediate-danger checklist. Otherwise consult the designated stalking/safety specialist for protective next steps.
5. Record the disposition and any human-reviewed outside contact.

## Suspected child sexual exploitation

1. Stop unnecessary viewing. Do not download, copy, forward, or email suspected exploitative material.
2. Preserve app-held evidence under the approved retention/legal-hold policy and identify the supported jurisdiction.
3. For the United States, follow the approved reporting procedure using the official [NCMEC CyberTipline](https://www.missingkids.org/gethelpnow/cybertipline). NCMEC describes it as the centralized reporting system for suspected online child exploitation and makes reports available to appropriate law enforcement for possible investigation.
4. For Canada, follow the approved procedure based on [Public Safety Canada’s child-exploitation resources](https://www.canada.ca/en/public-safety-canada/campaigns/online-child-sexual-exploitation/key-resources.html), which identifies Cybertip.ca as Canada’s online tip line and directs immediate danger to 911 or local police.
5. Do not guess jurisdiction or submit duplicate reports. Consult the designated specialist when jurisdiction, reporting duty, or material classification is unclear.
6. Record the human-made channel, jurisdiction, external reference, and operational note, then record the substantive moderation disposition.

## Underage account or junior-safety report

1. Treat any report involving a junior as elevated: acknowledge it promptly and complete human disposition within four hours. The queue derives the junior flag from server-held account facts; never ask a reporter to provide a birthdate or identity document in report text.
2. For a credible report that an account holder is below the launch minimum (under 13 in the United States or under 14 in Canada, including Québec), suspend the account&apos;s social access while the owner reviews the case. Do not contact the reported child directly to investigate.
3. If age or consent clarification is appropriate, contact the account&apos;s parent or legal guardian only through the approved support workflow. Share the minimum information necessary and never reveal the reporter or report details.
4. If the account is confirmed below the minimum, use the existing permanent-deletion workflow. Preserve only material that legal/safety review requires, and keep that evidence in the restricted moderation store. Do not alter or reset unrelated remote data.
5. If the concern relates to league operations rather than abuse, an authenticated organizer may be told only what action is needed to protect participation. Do not share the reporter, evidence, private messages, or the junior&apos;s age-assurance details.
6. If the report indicates immediate danger, exploitation, stalking/doxxing, or self-harm, follow the corresponding specialist checklist above. A guardian or organizer is not a substitute for emergency or mandatory-reporting procedures.

## Closeout

- Confirm a substantive disposition is recorded: dismiss, restore/remove, warning, interaction restriction, suspension, or ban. Legal hold and acknowledgement alone do not count.
- Confirm any external response is represented by one append-only event and contains no evidence or unnecessary identity data.
- Confirm evidence retention/purge follows the legal-hold state.
- Record late disposition honestly; never rewrite the original deadline or acknowledgement time.

## Emergency message containment

The product owner may independently pause new direct messages or new league-chat
messages through the protected server configuration. This is an operational
containment measure, not a moderation disposition and not a substitute for
reviewing reports.

1. Disable only the affected message surface unless the incident spans both.
2. Confirm `/api/ready` reports the intended disabled state. Missing or invalid
   production/staging configuration must fail closed for new message writes.
3. Confirm existing message and league-fact reads still work, along with
   reporting, blocking, appeals, account deletion, and logout.
4. Record the owner, time, affected surface, reason category, and restoration
   criteria in the private incident record. Do not put message content or user
   identity in deployment logs.
5. Restore writes only after the underlying risk is contained and a synthetic
   send/read/report/block check passes.

Photo uploads do not use this emergency switch. They remain subject to the
existing manual-review publication boundary chosen by the product owner.

### Reproducible local containment rehearsal

This rehearsal uses only the isolated pytest database. It does not connect to
staging or production, change remote settings, or use real message or case
data.

```bash
venv/bin/pytest -q \
  apps/backend/tests/test_message_write_policy.py \
  apps/backend/tests/test_readiness_route.py \
  apps/backend/tests/test_direct_message_service.py \
  apps/backend/tests/test_moderation_admin_service_unit.py::test_report_context_capture_failure_does_not_block_reporting \
  apps/backend/tests/test_interaction_policy_unit.py \
  apps/backend/tests/test_account_deletion.py::test_schedule_account_deletion \
  apps/backend/tests/test_auth_routes_missing.py::TestLogout::test_logout_success
```

The rehearsal proves all of the following:

- direct-message and league-chat writes begin enabled, can be disabled one at
  a time, and can both be restored;
- a disabled surface rejects its new writes without disabling the other
  surface;
- missing, invalid, or unreadable protected-environment configuration fails
  closed, and `/api/ready` reports `misconfigured` while treating an intentional
  disable as ready;
- pre-existing direct-message and league-chat rows remain readable during
  containment, and synthetic sends and reads succeed after restoration;
- reporting, blocking, account-deletion scheduling, and logout remain available
  independently of the write switches.

Passing this local rehearsal is code-level evidence only. The staging drill and
provider-account/privacy checks in the App Store backlog remain required before
production AI-assisted filtering is enabled.

### Local v1 UGC acceptance record — 2026-08-12

Local acceptance covered profiles, direct messages, league chat, court reviews,
court photos, and review photos. It verified submission screening or pending
review, reporting and evidence capture, duplicate-report handling, bilateral
blocking, owner queue actions, content removal and restoration, interaction
restrictions, suspension and banning, and media-deletion scheduling. Reporter
identity remained absent from owner summaries and alerts.

The isolated verification runs passed 124 backend service and policy tests, 25
backend route tests, 155 mobile tests with 5 skipped, and 21 web owner-console
tests. Database-backed pytest groups were run sequentially because their local
fixtures share and truncate the same test database. The message-containment
rehearsal also passed all 50 tests in its documented command.

This establishes repository-level v1 acceptance only. It does not replace the
remaining staging delivery drill, owner review routine, or provider-account and
privacy confirmations tracked in the App Store backlog.

## Launch approval and drill record

IOS-001 must remain incomplete until all of the following are documented outside this public repository where sensitive operational details belong:

- Legal review of U.S., Canadian, and other applicable mandatory-reporting duties.
- Safety-owner approval of this runbook and the controlled `safety@` inbox workflow.
- A synthetic drill for immediate danger, self-harm, stalking/doxxing, and suspected child sexual exploitation.
- Evidence that urgent initial/repeat alerts, acknowledgement stopping repeats, ordinary digest/due-soon alerts, Resend retry visibility, and authenticated deep links work in staging.
- A real non-sensitive delivery test and an owner drill showing acknowledgement and disposition inside the promised windows.
- A synthetic drill that independently disables and restores direct-message and
  league-chat writes while proving read and safety/account routes remain usable.

Do not add real case data, personal contact information, credentials, or authority account details to this file.
