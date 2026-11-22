"""Exercise failure propagation, shutdown bounds, redaction and durable reporting."""

import json
import os
import subprocess
import sys
import tempfile
import threading
import unittest
from contextlib import nullcontext
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from urllib.error import HTTPError

import backend_progress
import run_backend_tests


class ProgressTests(unittest.TestCase):
    def test_blocked_console_cannot_block_watchdog_or_accumulate_unbounded_output(self):
        release = threading.Event()

        def blocked_writer(fd, data):
            release.wait(5)
            return len(data)

        console = run_backend_tests.Console(writer=blocked_writer)
        try:
            for _ in range(100):
                console.emit("diagnostic")
            self.assertGreater(console.dropped, 0)
        finally:
            release.set()
            console.close()

    def test_teardown_remains_current_until_it_completes_and_parameters_are_removed(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "progress.json"
            with patch.dict(os.environ, BACKEND_CI_PROGRESS_FILE=str(path)):
                backend_progress.pytest_sessionstart(None)
                backend_progress.pytest_collection_finish(SimpleNamespace(items=[None]))
                item = SimpleNamespace(
                    nodeid="tests/test_auth.py::test_login[private@example.test-token]"
                )
                backend_progress.pytest_runtest_setup(item)
                backend_progress.pytest_runtest_call(item)
                backend_progress.pytest_runtest_logreport(
                    SimpleNamespace(
                        when="call",
                        outcome="passed",
                        failed=False,
                        skipped=False,
                    )
                )
                backend_progress.pytest_runtest_teardown(item, None)
                state = json.loads(path.read_text())
                self.assertEqual(state["phase"], "teardown")
                self.assertEqual(state["completed"], 0)
                self.assertEqual(state["current_test"], "tests/test_auth.py::test_login")
                self.assertNotIn("private@", path.read_text())
                backend_progress.pytest_runtest_logreport(
                    SimpleNamespace(
                        when="teardown",
                        outcome="failed",
                        failed=True,
                        skipped=False,
                        nodeid=item.nodeid,
                    )
                )
                state = json.loads(path.read_text())
                self.assertEqual(state["completed"], 1)
                self.assertEqual(state["errors"], 1)
                self.assertIsNone(state["current_test"])

    def test_github_update_only_changes_output_not_the_actual_check_result(self):
        requests = []

        def opener(request, timeout):
            requests.append(request)
            return nullcontext()

        reporter = run_backend_tests.GitHubReporter(
            {
                "GITHUB_REPOSITORY": "example/project",
                "BACKEND_CI_CHECK_RUN_ID": "123",
                "BACKEND_CI_REPORT_TOKEN": "dummy-token",
            },
            opener=opener,
            log=lambda _: None,
        )
        reporter.publish({"elapsed_seconds": 30, "current_test": "test_login[secret]"})
        body = json.loads(requests[0].data)
        self.assertEqual(set(body), {"output"})
        self.assertNotIn("secret", body["output"]["summary"])
        self.assertEqual(requests[0].method, "PATCH")

    def test_read_only_token_disables_remote_reporting_without_failing_tests(self):
        calls = []

        def opener(request, timeout):
            calls.append(request)
            raise HTTPError(request.full_url, 403, "Forbidden", {}, None)

        reporter = run_backend_tests.GitHubReporter(
            {
                "GITHUB_REPOSITORY": "example/project",
                "BACKEND_CI_CHECK_RUN_ID": "123",
                "BACKEND_CI_REPORT_TOKEN": "dummy-token",
            },
            opener=opener,
            log=lambda _: None,
        )
        reporter.publish({"elapsed_seconds": 1})
        reporter.publish({"elapsed_seconds": 2})
        self.assertEqual(len(calls), 1)


class RunnerTests(unittest.TestCase):
    def run_child(self, code, *, deadline=5):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        env = {k: v for k, v in os.environ.items() if k != "BACKEND_CI_REPORT_TOKEN"}
        result = subprocess.run(
            [
                sys.executable,
                str(Path(run_backend_tests.__file__).resolve()),
                "--deadline-seconds",
                str(deadline),
                "--heartbeat-seconds",
                "0.1",
                "--grace-seconds",
                "0.1",
                "--",
                sys.executable,
                "-c",
                code,
            ],
            check=False,
            cwd=directory.name,
            env=env,
            capture_output=True,
            text=True,
            timeout=8,
        )
        return result, Path(directory.name)

    def test_failing_child_exit_code_and_output_are_preserved(self):
        result, directory = self.run_child(
            "print('diagnostic-output', flush=True); raise SystemExit(7)"
        )
        self.assertEqual(result.returncode, 7)
        self.assertIn("diagnostic-output", (directory / "backend-ci.log").read_text())
        self.assertIn("exit code: 7", (directory / "backend-ci-summary.md").read_text())

    def test_deadline_terminates_a_stuck_process_and_writes_a_summary(self):
        result, directory = self.run_child("import time; time.sleep(30)", deadline=0.2)
        self.assertEqual(result.returncode, 124)
        self.assertIn("timed_out", (directory / "backend-ci-summary.md").read_text())

    def test_inherited_stdout_from_a_child_does_not_keep_the_job_alive(self):
        result, directory = self.run_child(
            "import subprocess,sys; subprocess.Popen([sys.executable,'-c','import time; time.sleep(30)'])"
        )
        self.assertEqual(result.returncode, 0)
        self.assertTrue((directory / "backend-ci-summary.md").exists())

    def test_reporter_credentials_are_not_inherited_by_tests(self):
        result, _ = self.run_child(
            "import os; assert not any(k in os.environ for k in ['GH_TOKEN','GITHUB_TOKEN','BACKEND_CI_REPORT_TOKEN'])"
        )
        self.assertEqual(result.returncode, 0)

    def test_real_pytest_hooks_report_failures_without_parameter_values(self):
        result, directory = self.run_child(
            "from pathlib import Path; "
            "Path('pytest.ini').write_text('[pytest]\\n'); "
            "Path('test_sample.py').write_text("
            '\'import pytest\\n@pytest.mark.parametrize(\\"value\\", [\\"private@example.test\\"])\\n\''
            "+ 'def test_fails(value):\\n    assert False\\n'); "
            "import pytest; raise SystemExit(pytest.main(['-q', '-c', 'pytest.ini', "
            "'-p', 'ci.backend_progress', 'test_sample.py']))"
        )
        self.assertEqual(result.returncode, 1)
        state = json.loads((directory / "backend-ci-progress.json").read_text())
        self.assertEqual(state["phase"], "finished")
        self.assertEqual(state["completed"], 1)
        self.assertEqual(state["failed"], 1)
        self.assertNotIn("private@", json.dumps(state))


if __name__ == "__main__":
    unittest.main()
