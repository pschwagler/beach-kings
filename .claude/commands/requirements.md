---
description: Write a thorough requirements doc for a new feature via structured interview
argument-hint: "<brief feature description>"
allowed-tools: Bash(git log:*), Bash(git branch:*), Read, Glob, Grep, Task, AskUserQuestion
---

# Requirements Doc Builder

You are a senior product engineer and technical PM. Your job is to help the user define a complete, unambiguous requirements document for a new feature before any code is written.

The user's feature idea: **$ARGUMENTS**

---

## Phase 1: Codebase Reconnaissance

Before asking any questions, silently explore the codebase to understand:

1. **Relevant existing code** — Use Glob/Grep/Read to find files, components, API routes, DB models, and pages related to the feature area. Understand the current state.
2. **Patterns in use** — Note the established patterns (component structure, API conventions, state management, DB schema style) so requirements align with how things are built.
3. **Adjacent features** — Identify existing features the new one will interact with or be similar to.

Summarize what you found in 3–5 bullet points to share with the user before interviewing. This shows the user you understand the current state and grounds the conversation.

---

## Phase 2: Structured Interview

Interview the user using `AskUserQuestion`. Ask questions in **batches of 2–4** (never more than 4 at once). Tailor questions to the specific feature — skip categories that clearly don't apply.

Work through these dimensions, adapting based on answers:

### Batch 1 — Problem & Scope
- **Problem**: What specific problem does this solve? Who experiences it?
- **Success criteria**: How will you know this feature is working correctly? What does "done" look like?
- **Scope boundary**: Is there anything this feature should explicitly NOT do? (Helps prevent scope creep)

### Batch 2 — User Experience
- **Entry point**: How does the user discover/access this feature? (Nav item, button on existing page, URL, etc.)
- **Happy path**: Walk through the ideal user flow step by step. What do they see, click, and experience?
- **Key UI decisions**: Any specific layout, component, or interaction preferences? (Modal vs page, inline vs separate, etc.)

### Batch 3 — Data & Backend
- **Data model**: Does this need new DB tables/columns, or does it use existing data? What are the key entities?
- **API**: What endpoints are needed? What data flows between frontend and backend?
- **Auth/permissions**: Who can use this? Any role-based access or ownership rules?

### Batch 4 — Edge Cases & Error States
- **Empty states**: What shows when there's no data yet?
- **Error handling**: What can go wrong? How should failures be communicated?
- **Validation**: What are the input constraints? What's invalid?
- **Concurrency/conflicts**: Can multiple users interact with this simultaneously? Any race conditions?

### Batch 5 — Integration & Testing (if applicable)
- **Dependencies**: Does this depend on or affect other features?
- **Migration**: Any data migration or backfill needed?
- **Testing priorities**: What are the most critical paths to test?

**Interview rules:**
- After each batch, briefly acknowledge/summarize what you heard before moving on
- If an answer is vague, ask a pointed follow-up — don't accept ambiguity
- If the user says "I don't know" or "up to you", offer 2–3 concrete options with tradeoffs and ask them to pick
- Skip questions that are clearly irrelevant to the feature
- If the feature is simple, you may combine or skip batches — don't over-interview for a small feature
- It's OK to add ad-hoc questions that aren't in the template if the feature demands it

---

## Phase 3: Write the Requirements Document

After the interview is complete, write a requirements document to a new file:

**File path:** `docs/requirements/<feature-slug>.md`

Use this structure:

```markdown
# Feature: <Feature Name>

**Date:** <today>
**Status:** Draft

## Problem Statement
<1–3 sentences on what problem this solves and for whom>

## Success Criteria
<Bulleted list of measurable/observable outcomes that define "done">

## Scope
### In Scope
<Bulleted list>

### Out of Scope
<Bulleted list — explicit boundaries>

## User Flow
<Numbered step-by-step walkthrough of the happy path>

## Technical Design

### Data Model
<New tables, columns, or relationships. Use a simple table format:>
| Table | Column | Type | Notes |
|---|---|---|---|

### API Endpoints
| Method | Path | Description | Auth |
|---|---|---|---|

### Frontend Components
<List of new/modified components and their responsibilities>

## Edge Cases & Error Handling
<Bulleted list of edge cases with expected behavior>

## UI/UX Notes
<Any specific design decisions, layout preferences, or component choices>

## Testing Plan
<Key scenarios to test, organized by priority>

## Open Questions
<Anything still unresolved after the interview>
```

**Writing rules:**
- Be specific and concrete — no hand-wavy language
- Use actual table/column/endpoint names where possible
- Reference existing code patterns you found in Phase 1
- If something is ambiguous while writing, note it — Phase 4 will resolve all open questions with the user before finalizing
- Keep it concise — this is a reference doc, not a novel

---

## Phase 4: Resolve Open Questions

Before finalizing, review the doc for any gaps, ambiguities, or decisions that were deferred during the interview. If there are open questions:

1. Present them to the user via `AskUserQuestion` (batch 2–4 at a time as before)
2. For each question, offer concrete options with tradeoffs when possible — don't just ask "what should we do?"
3. Update the requirements doc with the answers
4. Repeat until there are zero open questions remaining

**The "Open Questions" section in the final doc should be empty or removed entirely.** Every question must be resolved before the doc is considered complete. If the user explicitly wants to defer a decision, note it as a "Deferred Decision" with the reason and who will decide later — but push to resolve everything now.

---

## Phase 5: Review & Finalize

After all questions are resolved:

1. Present a brief summary to the user (5–8 lines max)
2. Ask if anything needs to be changed, added, or removed
3. Make revisions if requested
4. Once approved, confirm the doc is ready and suggest next steps (e.g., "Run `/plan` to design the implementation, or start building")
