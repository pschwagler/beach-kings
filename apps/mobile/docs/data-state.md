# Mobile data state

## Target architecture

Beach League mobile uses TanStack Query as the client authority for server data.
Data fetched from the API—including relationships, notifications, players,
sessions, games, venues, and messages—belongs in the Query cache rather than in
a second screen-local or provider-owned copy. The server remains the ultimate
source of truth.

Local UI state stays local. Open sheets, selected tabs, transient filters, input
drafts, and similar interaction state remain in the component that owns the
interaction or in a focused context when nearby components truly share it. The
app does not replace this state with one giant Redux-style store.

This is the target architecture. Domains listed under **Migration status** may
still use the legacy `useApi` hook until their migration wave is complete.

## Module boundaries

Server-data code is organized by domain under `src/features`. Each domain owns
its query keys, `queryOptions` factories, mutations, pure cache updates, and
domain presentation helpers. Screen hooks stay beside their screens and compose
feature queries into view models.

Query lifecycle, account isolation, and shared private/public key namespaces
live under `src/infrastructure/query`. Generic `src/hooks` and `src/lib` files
must not become alternate homes for domain caches or query policy.

## Contracts

- Normalize API responses once in `@beach-kings/api-client`. Screens must not
  independently reinterpret field names, envelopes, or relationship states.
- Production API access has no mock-data fallback. Unreleased features use an
  explicit unavailable route and a rejecting adapter until their real backend
  contract ships.
- Put every personalized key under `['private', authenticatedUserId, ...]`.
  Viewer-independent data uses `['public', ...]`. Call sites use exported key
  factories rather than reconstructing either prefix.
- Authentication transitions cancel active work and clear Query's query and
  mutation caches before publishing logout or a different account. The auth
  provider owns this ordering; a cache guard is defense-in-depth only.
- Failed token refresh notifies authentication so it performs the same cleanup
  and navigation transition as explicit logout.
- Treat WebSocket events as cache inputs: update known Query values or invalidate
  affected keys. Do not maintain a separate WebSocket-backed domain store.
- Put optimistic updates, rollback, and invalidation in shared domain mutations.
  Cache operations snapshot and update only affected entities. Rollback is
  conditional so a failed mutation cannot overwrite later socket or refetch data.
- Export full `queryOptions` factories, not keys alone, so cache identity and its
  fetch, normalization, and staleness policy cannot drift apart.
- Compose cached values into view models in screen hooks. UI components render
  those view models and do not fetch, normalize, or reconcile server data.
- Connect React Native `AppState` to Query focus handling and network
  reachability to Query online handling.

## Social, notification, and messaging domains

Social query keys are user-scoped and cover friends, discovery, player
relationships, notification feeds, and unread counts. The relationship contract
has exactly five states: `self`, `none`, `friend`, `pending_outgoing`, and
`pending_incoming`, plus the pending request ID when applicable.

The notification transport owns connection lifecycle and forwards events into
Query. It is not a data provider. Notification feeds, authoritative badge counts,
and read mutations are exposed by Query-backed feature hooks. Events are upserted
by notification ID so reconnects and retries cannot duplicate rows.

The mobile notification surface is an unread inbox. Its query selector exposes
only notifications that are unread and not dismissed. Marking a notification
read removes it from every mobile notification category without deleting server
history; dismissal remains a separate backend lifecycle state for obsolete
domain events.

Backend notification links use web route shapes. Mobile resolves them through
the notification domain's route adapter before navigation; unsupported or
external links are ignored rather than passed directly to Expo Router.

Socket delivery into an unhydrated cache leaves that query stale so a later
consumer still fetches the complete server value. When an event's prior unread
state is unknown, invalidate the authoritative unread-count query rather than
guessing.

Shared friendship mutations update affected social views optimistically, roll
back only their own changes on failure, and then invalidate the user-scoped keys.

Direct-message conversations, threads, peer profiles, and true unread-message
counts are also Query-owned. Opening a thread uses one shared read mutation to
reconcile the thread, conversation row, aggregate DM count, and direct-message
summary notification. Direct-message socket events enter those same caches.

## Migration status

Social relationships and notifications are the first complete Query-owned pilot.
Messaging is now a complete Query-owned domain. Existing Query-backed
current-player, dashboard, and league data follow the same private-key and
account-transition invariants. Sessions, games, venues, and some profile flows
still contain legacy `useApi` consumers; those are explicit migration exceptions,
not examples for new code.

Migration remains incremental, one complete domain at a time:

1. Wave 1: social relationships and notifications.
2. Wave 2: Home/Profile freshness and messaging read state.
3. Wave 3: sessions, games, venues, and remaining `useApi` domains.

Do not remove `useApi` until its final consumer has migrated. Each wave must leave
tests passing and must not leave both an old and a new cache owning the same
domain.

## Domain migration definition of done

A migrated domain has:

- canonical API-client response types and normalization;
- private/public key-factory coverage and shared `queryOptions`;
- no provider, screen-local state, or `useApi` copy owning the same server data;
- centralized mutations with concurrency-safe optimistic rollback;
- socket events routed through the same cache operations, when applicable;
- tests for account separation, invalidation, rollback, and normalization;
- no old key schema or compatibility import remaining after migration.
