# AI-Assisted Moderation Plan

> Decision date: 2026-08-03  
> Scope: v1 messages, league chat, reviews, profiles, and photo uploads  
> Operating model: centralized automation with one human owner

This plan minimizes ongoing cost and administrative complexity while keeping a
human accountable for high-impact decisions. AI performs routine screening,
triage, evidence summarization, temporary safety actions, and response drafting.
It does not permanently ban users, decide appeals, or make legally sensitive
judgments without human approval.

## Launch principles

- Safety actions fail closed: uncertain high-risk content is quarantined rather
  than published while a model or reviewer is unavailable.
- Every user-visible content type has a report action and every user can block
  direct interaction.
- The database is the system of record. Email is an alert channel, not the case
  queue.
- Junior involvement raises severity and skips low-cost-only adjudication.
- Models recommend; policy code decides allowed automatic actions.
- Permanent bans, appeals, and legally sensitive incidents require the human
  owner at launch.
- League organizers can report and block but do not receive moderation powers in
  v1. This keeps permissions and operations centralized.

## Processing pipeline

```text
Content submission or user report
    ↓
Deterministic policy checks
    ↓
Free text/image safety classification
    ↓
Low-cost policy triage and structured case summary
    ↓
Allow / queue / quarantine / temporary interaction lock
    ↓
Flagship review for ambiguity, severity, juniors, or model disagreement
    ↓
Automatic receipt + owner alert where required
    ↓
Human decision for permanent action, appeal, or sensitive incident
    ↓
Audited enforcement and user notification
```

## Model routing

Model names and capabilities were checked against official OpenAI documentation
on 2026-08-03. Keep model IDs configurable and re-evaluate them with a fixed
moderation test set before changing production routing.

### Gate — `omni-moderation-latest`

Run on all public text/photo submissions and on all reported evidence.

- Specialized text and image harm categories.
- Free moderation endpoint.
- Immediate quarantine for high-confidence severe categories according to Beach
  League policy; do not treat category scores as the entire policy.
- If the service is unavailable, hold new public UGC in `pending` instead of
  publishing it unscreened. Direct-message delivery may retry briefly, then hold
  and tell the sender it is pending.

### Phase 1 — `gpt-5.6-luna`

Use for inexpensive policy-specific triage of ordinary reports:

- Produce schema-validated JSON only.
- Classify policy category and severity.
- Summarize only the minimum relevant evidence.
- Identify missing context, repeated behavior, and whether a junior is involved.
- Recommend allow, warn, quarantine, temporary lock, or flagship escalation.
- Draft a neutral receipt or resolution for later approval.

Phase 1 may automatically close obvious duplicate or non-actionable reports only
after evaluation demonstrates high precision. Initially, store the recommendation
and let policy code route it.

### Phase 2 — `gpt-5.6` flagship

Use when any of the following applies:

- A junior is involved in reported interpersonal conduct.
- Credible threat, stalking, doxxing, sexual exploitation, self-harm, hate, or
  severe harassment is suspected.
- Phase 1 and the moderation model disagree.
- Evidence spans conversation history or requires context-sensitive judgment.
- The proposed action is longer than a short temporary safety hold.
- An appeal is filed or the models express material uncertainty.

The flagship model produces an evidence-grounded recommendation and response
draft. It may trigger or preserve a temporary quarantine but not a permanent ban.

## Automatic action matrix

| Situation | Immediate system action | Human requirement |
| --- | --- | --- |
| Clean submission | Publish/deliver | None |
| Mild profanity without targeted abuse | Allow or warn according to policy | Sample during QA |
| Obvious spam/scam | Hide and temporarily rate-limit | Review repeat offenders |
| Targeted harassment | Quarantine reported content; temporary contact lock | Decide warning/suspension |
| Credible threat, stalking, or doxxing | Quarantine; temporary account interaction lock; urgent alert | Review as soon as possible |
| Sexual content involving a possible minor | Quarantine; preserve restricted evidence; urgent alert | Follow specialist/legal protocol |
| Ambiguous or model disagreement | Keep pending and escalate to flagship | Required for material action |
| Appeal | Preserve current safe state | Human decision required |

Do not implement silent permanent punishment. Temporary automated restrictions
must be time-bounded, disclosed to the affected user where safe, and reviewable.

## Minimal data model

Use a small database-backed workflow rather than introducing Redis/Celery only
for moderation:

- `moderation_cases`: reporter, target type/ID, reason, state, severity, junior
  involvement, assignment, deadlines, current safe action, and timestamps.
- `moderation_events`: append-only model runs, policy decisions, notifications,
  human decisions, evidence-access records, and enforcement changes.
- Existing content remains canonical. Store a limited immutable evidence
  snapshot only when necessary to review material that may be edited/deleted.

A small worker process can claim pending rows with database locking, call the
models, store structured results, and retry safely. Avoid FastAPI in-process
background tasks for the durable case workflow because deploys or crashes can
lose unfinished work.

## Owner workflow

Create one protected web admin page using the existing application Navbar and
admin authorization:

- Urgent, due soon, ordinary, and appeal queues.
- Content and minimum relevant context.
- Model category, confidence, disagreements, and recommendation.
- One-click uphold, warn, remove, temporary suspend, permanent ban, dismiss, and
  request-more-context actions.
- Editable response draft and complete audit history.

With no backup moderator, the safety mechanism is quarantine: urgent material
remains hidden if the owner cannot respond. Send immediate alerts for urgent
cases and a daily digest for ordinary cases. Repeat urgent alerts until the case
is acknowledged, without putting sensitive evidence in email.

## Privacy and junior safeguards

- Send pseudonymous internal IDs, not names, email addresses, phone numbers,
  birthdates, exact coordinates, auth data, or unrelated conversation history.
- Use the OpenAI API with data sharing disabled and never opt moderation data
  into model training.
- Use `store: false` for Responses API calls. Apply for stronger retention
  controls if available; ordinary Responses API abuse-monitoring retention may
  still apply.
- The dedicated moderation endpoint currently lists no abuse-monitoring or
  application-state retention and is eligible for Zero Data Retention.
- Image inputs submitted to OpenAI are scanned for possible child sexual abuse
  material and may be retained for manual safety review even under stronger data
  controls. Document this processor behavior and obtain legal/safety guidance
  before enabling junior photo uploads.
- Do not include report evidence in alert email. Link the authenticated owner to
  the admin case instead.
- Set explicit evidence retention and deletion windows, with stricter access
  logging for junior-related cases.

## Evaluation before automation

- Create synthetic and safely redacted examples for every policy category.
- Include slang, quoted abuse, reclaimed language, sports trash talk, sarcasm,
  threats, false positives, junior/adult interactions, and image cases.
- Measure severe-harm recall, ordinary-report precision, disagreement rate, and
  inappropriate-action rate separately.
- Launch in shadow mode: AI recommends while the owner decides.
- Enable automatic quarantine category by category only after review.
- Sample allowed content and closed cases regularly for missed harm.
- Version policy, prompts, schemas, thresholds, and model IDs in every event.
- Set API spend limits and alerts even though expected launch volume is low.

## Incident-specific limitation

AI cannot replace the owner/operator's obligations for suspected exploitation,
credible imminent threats, law-enforcement requests, or mandatory reporting.
Before launch, obtain specialist guidance and write a short incident runbook with
the appropriate official reporting and emergency channels for the launch
territories.

## Official references

- [OpenAI moderation guide](https://developers.openai.com/api/docs/guides/moderation)
- [OpenAI model guidance](https://developers.openai.com/api/docs/guides/latest-model)
- [OpenAI API pricing](https://developers.openai.com/api/docs/pricing)
- [OpenAI under-18 API guidance](https://developers.openai.com/api/docs/guides/safety-checks/under-18-api-guidance)
- [OpenAI API data controls](https://developers.openai.com/api/docs/guides/your-data)
