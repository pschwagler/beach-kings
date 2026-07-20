# Mobile test-suite quirks

Two non-blocking jest quirks in `apps/mobile`, diagnosed 2026-07-18 so the
next person doesn't have to re-derive them.

## Parallel-worker exit warning

`npx jest` (default multi-worker run) prints:

> A worker process has failed to exit gracefully and has been force exited.

Findings:

- `--detectOpenHandles` (serial) reports **zero** open handles. The one real
  leak it did find — raw `QueryClient` GC timers in
  `__tests__/features/social/cache.test.ts` — was fixed by clearing clients in
  `afterEach`.
- Every quarter of the suite exits cleanly with `--maxWorkers=1`.
- The warning therefore comes from short-lived timers still pending when a
  fast parallel worker finishes its last suite; by the end of a serial run
  they have fired and nothing is detectable.

Impact: cosmetic. Suite is green either way. Revisit only if CI wall-time or
worker churn ever matters.

## Flaky NotificationsTab assertion (serial mode only)

`__tests__/components/NotificationsTab.test.tsx` — "mark-all header action ›
publishes null when all notifications are read" failed once under
`--detectOpenHandles`: an extra render re-published the header button after
the `null` publication, so `toHaveBeenLastCalledWith(null)` saw the button
element instead. Passes consistently standalone and in parallel runs. The
assertion is render-timing sensitive; if CI ever moves to serial execution,
make it wait for quiescence (e.g. `waitFor` on the final call) instead of
asserting the last call synchronously.
