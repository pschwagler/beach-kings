"""Run pytest with bounded shutdown and durable, sanitized GitHub breadcrumbs."""

import argparse
import json
import os
import queue
import re
import signal
import subprocess
import sys
import threading
import time
from datetime import UTC, datetime
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from backend_progress import safe_test_name


def emit(text):
    try:
        print(text, flush=True)
    except OSError:
        pass  # Durable Checks API reporting can survive a broken runner log pipe.


class Console:
    """A blocked runner log pipe must not block heartbeats or the watchdog."""

    def __init__(self, writer=os.write):
        self.messages = queue.Queue(maxsize=32)
        self.writer = writer
        self.dropped = 0
        self.thread = threading.Thread(target=self._consume, daemon=True)
        self.thread.start()

    def _consume(self):
        try:
            while (data := self.messages.get()) is not None:
                view = memoryview(data)
                while view:
                    view = view[self.writer(1, view) :]
        except OSError:
            pass

    def write(self, data):
        try:
            self.messages.put_nowait(data)
        except queue.Full:
            self.dropped += 1

    def emit(self, text):
        self.write((text + "\n").encode())

    def close(self):
        try:
            self.messages.put(None, timeout=0.1)
        except queue.Full:
            pass
        self.thread.join(timeout=1)


def read_progress(path):
    try:
        value = json.loads(path.read_text())
        return value if isinstance(value, dict) else {}
    except (OSError, ValueError):
        return {}


def checkout_revision(env):
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            capture_output=True,
            text=True,
            check=False,
            timeout=3,
            env=env,
        )
        value = result.stdout.strip() if result.returncode == 0 else ""
    except (OSError, subprocess.TimeoutExpired):
        value = env.get("GITHUB_SHA", "")
    return value if re.fullmatch(r"[0-9a-f]{40}", value) else "unknown"


def resources(pid):
    result = {}
    for path, field, key in [
        (Path(f"/proc/{pid}/status"), "VmRSS:", "rss_mib"),
        (Path("/proc/meminfo"), "MemAvailable:", "available_mib"),
    ]:
        try:
            line = next(line for line in path.read_text().splitlines() if line.startswith(field))
            result[key] = round(int(line.split()[1]) / 1024, 1)
        except (OSError, StopIteration, ValueError, IndexError):
            result[key] = None
    return result


def summary(state):
    phase = re.sub(r"[^a-z_]", "", str(state.get("phase", "starting")))[:40]
    counters = []
    for key in ("completed", "total", "passed", "failed", "skipped", "errors"):
        value = state.get(key)
        counters.append(f"{key}: {value if isinstance(value, int) else '?'}")
    return "\n".join(
        [
            "## Backend test progress",
            "",
            f"Checkout: `{state.get('source_revision', 'unknown')}`",
            f"Last heartbeat: {state.get('observed_at', 'unknown')}",
            f"Elapsed: {state['elapsed_seconds']}s · Phase: **{phase}**",
            f"Time in this phase: {state.get('phase_seconds', '?')}s",
            f"Current test: `{safe_test_name(state.get('current_test')) or 'none'}`",
            f"Last completed: `{safe_test_name(state.get('last_completed_test')) or 'none'}`",
            " · ".join(counters),
            (
                f"Test process RSS: {state.get('rss_mib')} MiB · "
                f"Host available memory: {state.get('available_mib')} MiB"
            ),
            f"Console chunks dropped: {state.get('dropped_console_chunks', 0)}",
            "",
            "Live breadcrumbs only; the test step determines success or failure.",
        ]
    )


class GitHubReporter:
    def __init__(self, env, opener=urlopen, log=emit):
        self.token = env.get("BACKEND_CI_REPORT_TOKEN", "")
        repo = env.get("GITHUB_REPOSITORY", "")
        run_id = env.get("BACKEND_CI_CHECK_RUN_ID", "")
        self.url = (
            f"https://api.github.com/repos/{repo}/check-runs/{run_id}"
            if re.fullmatch(r"[\w.-]+/[\w.-]+", repo) and run_id.isdigit()
            else None
        )
        self.opener = opener
        self.log = log

    def publish(self, state):
        if not self.token or not self.url:
            return
        # Never change status/conclusion: only GitHub's actual test job owns them.
        body = {"output": {"title": "Backend test progress", "summary": summary(state)}}
        request = Request(
            self.url,
            data=json.dumps(body).encode(),
            method="PATCH",
            headers={
                "Authorization": f"Bearer {self.token}",
                "Accept": "application/vnd.github+json",
                "Content-Type": "application/json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
        )
        try:
            with self.opener(request, timeout=3):
                pass
        except HTTPError as error:
            self.log(f"[backend-ci] Progress API unavailable (HTTP {error.code})")
            if error.code in (401, 403, 404):
                self.url = None  # Fork PRs may have a read-only token.
            error.close()
        except (URLError, OSError):
            self.log("[backend-ci] Progress API temporarily unavailable")


def terminate_group(process, grace):
    for sig in (signal.SIGTERM, signal.SIGKILL):
        try:
            os.killpg(process.pid, sig)
        except ProcessLookupError:
            return
        try:
            process.wait(timeout=grace)
        except subprocess.TimeoutExpired:
            continue
        if sig == signal.SIGTERM:
            # The group may still contain children holding stdout open.
            continue
        return


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--deadline-seconds", type=float, default=22 * 60)
    parser.add_argument("--heartbeat-seconds", type=float, default=30)
    parser.add_argument("--grace-seconds", type=float, default=5)
    parser.add_argument("command", nargs=argparse.REMAINDER)
    args = parser.parse_args(argv)
    command = args.command[1:] if args.command[:1] == ["--"] else args.command
    command = command or [
        sys.executable,
        "-u",
        "-m",
        "pytest",
        "apps/backend/tests/",
        "-v",
        "--tb=short",
        "--timeout=90",
        "--timeout-method=signal",
        "-o",
        "faulthandler_timeout=60",
        "--cov=backend",
        "--cov-report=xml:apps/backend/coverage.xml",
        "--cov-report=term",
        "--cov-fail-under=82",
        "--junitxml=backend-ci-junit.xml",
        "-p",
        "ci.backend_progress",
    ]
    progress = Path("backend-ci-progress.json").resolve()
    progress.unlink(missing_ok=True)
    env = dict(os.environ)
    console = Console()
    reporter = GitHubReporter(env, log=console.emit)
    for key in ("BACKEND_CI_REPORT_TOKEN", "GITHUB_TOKEN", "GH_TOKEN"):
        env.pop(key, None)
    env["BACKEND_CI_PROGRESS_FILE"] = str(progress)
    env["PYTHONUNBUFFERED"] = "1"
    env["PYTHONPATH"] = os.pathsep.join(
        filter(
            None,
            [
                env.get("PYTHONPATH"),
                str(Path(__file__).resolve().parents[1]),
            ],
        )
    )
    revision = checkout_revision(env)
    process = subprocess.Popen(
        command,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        env=env,
        start_new_session=True,
    )
    interrupted = threading.Event()
    previous_handlers = {}
    for sig in (signal.SIGINT, signal.SIGTERM):
        previous_handlers[sig] = signal.signal(sig, lambda *_: interrupted.set())
    started = time.monotonic()
    with Path("backend-ci.log").open("wb", buffering=0) as log:

        def stream():
            try:
                while data := os.read(process.stdout.fileno(), 65536):
                    log.write(data)
                    console.write(data)
            except (OSError, ValueError):
                pass

        reader = threading.Thread(target=stream, daemon=True)
        reader.start()
        next_heartbeat = 0
        exit_code = None
        state = {}
        try:
            with Path("backend-ci-resources.jsonl").open("w") as samples:
                while True:
                    elapsed = time.monotonic() - started
                    if elapsed >= next_heartbeat or process.poll() is not None:
                        state = read_progress(progress)
                        state.update(
                            elapsed_seconds=round(elapsed),
                            dropped_console_chunks=console.dropped,
                            source_revision=revision,
                            observed_at=datetime.now(UTC).isoformat(timespec="seconds"),
                            **resources(process.pid),
                        )
                        if isinstance(state.get("phase_started_at"), (int, float)):
                            state["phase_seconds"] = round(
                                max(0, time.time() - state["phase_started_at"])
                            )
                        samples.write(json.dumps(state) + "\n")
                        samples.flush()
                        console.emit("\n[backend-ci] " + summary(state).replace("\n", " | "))
                        reporter.publish(state)
                        next_heartbeat = elapsed + args.heartbeat_seconds
                    if process.poll() is not None:
                        exit_code = process.returncode
                        break
                    if interrupted.is_set() or elapsed >= args.deadline_seconds:
                        exit_code = 130 if interrupted.is_set() else 124
                        console.emit(f"\n[backend-ci] Stopping test process (exit {exit_code})")
                        break
                    interrupted.wait(0.1)
        finally:
            terminate_group(process, args.grace_seconds)
            reader.join(timeout=2)  # An escaped child cannot keep the job's pipe alive.
            process.stdout.close()
            for sig, handler in previous_handlers.items():
                signal.signal(sig, handler)
            state.update(elapsed_seconds=round(time.monotonic() - started))
            state["phase"] = (
                "timed_out"
                if exit_code == 124
                else "cancelled"
                if exit_code == 130
                else "finished"
            )
            text = summary(state) + f"\n\nTest process exit code: {exit_code}\n"
            Path("backend-ci-summary.md").write_text(text)
            if target := os.environ.get("GITHUB_STEP_SUMMARY"):
                with Path(target).open("a") as output:
                    output.write(text)
            reporter.publish(state)
            console.close()
    if exit_code is None:
        return 1
    return exit_code if exit_code >= 0 else 128 - exit_code


if __name__ == "__main__":
    sys.exit(main())
