# Mobile Agent Notes

TanStack Query owns all server data. The full contract is
[`docs/data-state.md`](docs/data-state.md) — read it before touching data
fetching, caching, or auth transitions. The hard rules:

- New server data lives in a domain module under `src/features/<domain>/`
  (keys, `queryOptions` factories, mutations, pure cache updates). Screen
  hooks compose feature queries into view models; UI components never fetch,
  normalize, or reconcile server data.
- Every personalized query key goes under `privateKeys.user(userId)` from
  `src/infrastructure/query/keys.ts`; viewer-independent data uses
  `publicKeys`. Always use the exported key factories — never hand-build the
  prefix.
- Never add new `useApi` consumers. The remaining ones (Sessions, Games,
  Tournaments, Venues, Settings, Kob) are migration exceptions
  scheduled for Wave 3, not examples to copy.
- No mock-data fallback in production API access. Unreleased features use an
  explicit unavailable route and a rejecting adapter
  (`src/features/tournaments/unavailableApi.ts`).
- Auth transitions (logout, account switch, refresh failure) are owned by
  `AuthContext`: cancel queries, clear the Query cache, then publish identity.
  Don't add parallel cleanup elsewhere.
- WebSocket events are cache inputs: reconcile into Query via the feature's
  cache operations or invalidate affected keys. No socket-backed side stores.
- Optimistic mutations use token-tagged patches with conditional rollback so a
  failed mutation cannot overwrite newer socket/refetch data. See
  `src/features/social/useFriendshipMutations.ts` for the pattern.

Query lifecycle plumbing (AppState focus, NetInfo online) lives in
`src/infrastructure/query/client.ts` — don't re-wire it per screen.

Remember dev-login script when trying to validate work.
