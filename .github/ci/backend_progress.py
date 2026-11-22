"""Pytest progress breadcrumbs without fixture values or failure payloads."""

import json
import os
import re
import time
from pathlib import Path


def safe_test_name(value):
    """Parameterized node IDs can contain emails, tokens, or other test data."""
    name = str(value or "").split("[", 1)[0]
    return re.sub(r"[^A-Za-z0-9_./:-]", "_", name)[:300]


_state = {}


def _write(**changes):
    if any(
        key in changes and changes[key] != _state.get(key) for key in ("phase", "current_test")
    ):
        changes["phase_started_at"] = time.time()
    _state.update(changes)
    target = os.environ.get("BACKEND_CI_PROGRESS_FILE")
    if target:
        path = Path(target)
        temporary = path.with_suffix(".tmp")
        temporary.write_text(json.dumps(_state))
        temporary.replace(path)


def pytest_sessionstart(session):
    _state.clear()
    _write(phase="collecting", completed=0, passed=0, failed=0, skipped=0, errors=0)


def pytest_collection_finish(session):
    _write(phase="collected", current_test=None, total=len(session.items))


def pytest_collectstart(collector):
    _write(phase="collecting", current_test=safe_test_name(collector.nodeid))


def pytest_runtest_setup(item):
    _write(
        phase="setup",
        current_test=safe_test_name(item.nodeid),
        test_started_at=time.time(),
    )


def pytest_runtest_call(item):
    _write(phase="call")


def pytest_runtest_teardown(item, nextitem):
    _write(phase="teardown")


def pytest_runtest_logreport(report):
    if report.when == "call" or (report.when == "setup" and report.skipped):
        _state[report.outcome] += 1
    elif report.failed:
        _state["errors"] += 1
    if report.when == "teardown":
        _write(
            phase="between_tests",
            current_test=None,
            last_completed_test=safe_test_name(report.nodeid),
            completed=_state["completed"] + 1,
        )
    else:
        _write()


def pytest_sessionfinish(session, exitstatus):
    _write(phase="finished", current_test=None, exit_code=int(exitstatus))
