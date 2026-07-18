# Mobile data state

## Direction

Beach League mobile uses TanStack Query as the owner of server data. Data fetched
from the API—including social relationships, notifications, players, sessions,
games, venues, and messages—belongs in the Query cache rather than in a second
screen-local or provider-owned copy.

Local UI state stays local. Open sheets, selected tabs, transient filters, input
drafts, and other interaction state should remain in the component that owns the
interaction or in a small, focused context when several nearby components truly
share it. The app should not replace its current mix of state with one giant
Redux-style store.

## Contracts

- Normalize API responses once in the API client. Screens must not independently
  reinterpret field names, envelopes, or relationship states.
- Include the authenticated user ID in every personalized query key. A query for
  one account must never be readable as another account's data.
- Remove private cached data on logout and before an account change becomes
  visible. Authentication transitions own this cleanup.
- Treat WebSocket events as cache inputs: update a known Query value or invalidate
  the affected keys. Do not maintain a separate WebSocket-backed domain store.
- Put optimistic updates, rollback, and invalidation in shared domain mutation
  hooks. Screens call those mutations rather than duplicating request state.
- Compose cached domain values into view models in screen hooks. UI components
  render those view models and do not fetch, normalize, or reconcile server data.
- Connect React Native `AppState` to Query focus handling and network reachability
  to Query online handling so focus and reconnect behavior work outside the web.

## Social pilot

Task A migrates friendship and notification data first. Social query keys are
user-scoped and cover friends, discovery, player relationships, notification
feeds, and unread counts. The relationship contract has exactly five states:
`self`, `none`, `friend`, `pending_outgoing`, and `pending_incoming`, plus the
pending request ID when applicable.

The notification provider is transport-only: it owns connection lifecycle and
forwards events into Query. Notification feeds and badge counts are Query data.
Events are upserted by notification ID so reconnects and retries cannot duplicate
rows. Shared friendship mutations update every affected social view optimistically,
roll back on failure, then invalidate the user-scoped keys.

## Current findings

The audit found TanStack Query mixed with roughly two dozen local `useApi`
consumers. Notification feed and unread state were duplicated outside Query, query
keys were not consistently personalized, and the long-lived `QueryClient` was not
cleared when a user logged out or changed accounts. Those conditions explain why
screens can disagree even when each screen looks correct in isolation.

## Migration rollout

Migration is incremental, one complete domain at a time:

1. Wave 1: Task A social relationships and notifications.
2. Wave 2: Home/Profile freshness and messaging read state, matching backlog
   Tasks C and D.
3. Wave 3: sessions, games, venues, and the remaining `useApi` domains.

Do not remove `useApi` until its final consumer has migrated. Each wave must leave
tests passing and must not leave both an old and a new cache owning the same
domain. This preserves a gradual rollout without accepting mixed authority inside
the domain currently being migrated.
