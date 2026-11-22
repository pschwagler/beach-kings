# Backend CI diagnostics

The backend job still runs the complete pytest suite and enforces 82% coverage.
Its test runner adds visibility without changing the check's result:

- A heartbeat every 30 seconds reports the active test and its setup/call/teardown
  phase, last completed test, counts, elapsed time, process RSS, and host available
  memory.
- The same snapshot updates the backend check's **Details** summary through the
  Checks API. That server-side breadcrumb remains available if the runner dies
  before uploading its logs. Only `output` is updated; GitHub owns the check's
  status and conclusion.
- Test parameter values are removed from these breadcrumbs. The reporting token
  is not inherited by pytest. Read-only fork tokens fall back to console and
  artifact reporting without affecting test outcomes.
- Pytest prints thread stacks for tests taking longer than 60 seconds. JUnit
  records individual test timings when pytest finishes.
- The watchdog stops the test process group after 22 minutes. A separate
  24-minute step limit leaves time for artifact upload before the 30-minute job
  limit. A child holding stdout open cannot keep the wrapper alive.

The `backend-diagnostics` artifact includes the console log, latest progress JSON,
resource history, final summary, and JUnit report. The job summary includes the
final snapshot. Raw test output stays in the log; live check summaries contain
only sanitized identifiers and metrics.

To inspect a running or lost job, read its Checks **Details** summary, or use the
Checks API's `output.summary`. If it shows a long-running teardown, inspect the
last test's fixture cleanup; if host available memory is falling, investigate
resource pressure. A finished pytest phase while the job stays active points
toward process shutdown or runner handling rather than a test body.

Run helper tests locally with:

```sh
python -m unittest discover -s .github/ci -p 'test_*.py'
```
