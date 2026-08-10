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

## Closeout

- Confirm a substantive disposition is recorded: dismiss, restore/remove, warning, interaction restriction, suspension, or ban. Legal hold and acknowledgement alone do not count.
- Confirm any external response is represented by one append-only event and contains no evidence or unnecessary identity data.
- Confirm evidence retention/purge follows the legal-hold state.
- Record late disposition honestly; never rewrite the original deadline or acknowledgement time.

## Launch approval and drill record

IOS-001 must remain incomplete until all of the following are documented outside this public repository where sensitive operational details belong:

- Legal review of U.S., Canadian, and other applicable mandatory-reporting duties.
- Safety-owner approval of this runbook and the controlled `safety@` inbox workflow.
- A synthetic drill for immediate danger, self-harm, stalking/doxxing, and suspected child sexual exploitation.
- Evidence that urgent initial/repeat alerts, acknowledgement stopping repeats, ordinary digest/due-soon alerts, Resend retry visibility, and authenticated deep links work in staging.
- A real non-sensitive delivery test and an owner drill showing acknowledgement and disposition inside the promised windows.

Do not add real case data, personal contact information, credentials, or authority account details to this file.
