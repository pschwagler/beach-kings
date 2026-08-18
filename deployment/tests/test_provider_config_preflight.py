import base64
import importlib.util
import io
import json
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock


REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT_PATH = REPO_ROOT / "deployment" / "provider_config_preflight.py"
WORKFLOW_PATH = REPO_ROOT / ".github" / "workflows" / "deploy-dev.yml"


def load_preflight_module():
    spec = importlib.util.spec_from_file_location("provider_config_preflight", SCRIPT_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def valid_config():
    google_web = "google-web.example"
    google_ios = "google-ios.example.apps.googleusercontent.com"
    apple_client = "com.beachleague.app"
    return {
        "GOOGLE_CLIENT_ID": google_web,
        "GOOGLE_CLIENT_IDS": google_ios,
        "NEXT_PUBLIC_GOOGLE_CLIENT_ID": google_web,
        "APPLE_CLIENT_ID": apple_client,
        "APPLE_CLIENT_IDS": "",
        "APPLE_TEAM_ID": "TEAM123",
        "APPLE_KEY_ID": "KEY123",
        "APPLE_PRIVATE_KEY": (
            "-----BEGIN PRIVATE KEY-----\\nprivate-key-material\\n-----END PRIVATE KEY-----"
        ),
        "APPLE_TOKEN_ENCRYPTION_KEY": base64.urlsafe_b64encode(b"x" * 32).decode(),
    }


def write_app_config(directory: Path):
    path = directory / "app.json"
    path.write_text(
        json.dumps(
            {
                "expo": {
                    "ios": {
                        "bundleIdentifier": "com.beachleague.app",
                        "infoPlist": {
                            "CFBundleURLTypes": [
                                {
                                    "CFBundleURLSchemes": [
                                        "com.googleusercontent.apps.google-ios.example"
                                    ]
                                }
                            ]
                        },
                    }
                }
            }
        ),
        encoding="utf-8",
    )
    return path


def write_env_file(directory: Path, config):
    path = directory / ".env"
    path.write_text(
        "".join(f"{name}={value}\n" for name, value in config.items()),
        encoding="utf-8",
    )
    return path


class ProviderConfigPreflightTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.preflight = load_preflight_module()

    def test_valid_configuration_reports_status_without_values(self):
        config = valid_config()
        with tempfile.TemporaryDirectory() as temp_dir:
            app_config = write_app_config(Path(temp_dir))
            output = io.StringIO()
            with redirect_stdout(output):
                passed = self.preflight.run_checks(config, app_config)

        self.assertTrue(passed)
        report = output.getvalue()
        self.assertIn("Provider configuration preflight passed", report)
        for value in config.values():
            if value:
                self.assertNotIn(value, report)

    def test_mismatched_or_missing_configuration_fails_without_values(self):
        config = valid_config()
        config["GOOGLE_CLIENT_IDS"] = "wrong-mobile-audience"
        config["APPLE_PRIVATE_KEY"] = "secret-but-malformed"
        with tempfile.TemporaryDirectory() as temp_dir:
            app_config = write_app_config(Path(temp_dir))
            output = io.StringIO()
            with redirect_stdout(output):
                passed = self.preflight.run_checks(config, app_config)

        self.assertFalse(passed)
        report = output.getvalue()
        self.assertIn("FAIL Google iOS audience matches app redirect", report)
        self.assertIn("FAIL Apple private key uses escaped single-line format", report)
        self.assertNotIn("wrong-mobile-audience", report)
        self.assertNotIn("secret-but-malformed", report)

    def test_cli_rejects_incomplete_env_before_success(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            directory = Path(temp_dir)
            app_config = write_app_config(directory)
            env_file = directory / ".env"
            env_file.write_text("GOOGLE_CLIENT_ID=private-value\n", encoding="utf-8")
            result = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPT_PATH),
                    "--env-file",
                    str(env_file),
                    "--app-config",
                    str(app_config),
                ],
                check=False,
                capture_output=True,
                text=True,
            )

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Provider configuration preflight failed", result.stdout)
        self.assertNotIn("private-value", result.stdout + result.stderr)

    def test_explicit_env_file_overrides_conflicting_ambient_values(self):
        config = valid_config()
        with tempfile.TemporaryDirectory() as temp_dir:
            directory = Path(temp_dir)
            env_file = write_env_file(directory, config)
            app_config = write_app_config(directory)
            with mock.patch.dict(
                "os.environ",
                {
                    "GOOGLE_CLIENT_ID": "ambient-google-value",
                    "APPLE_PRIVATE_KEY": "ambient-apple-value",
                },
                clear=False,
            ):
                loaded = self.preflight.load_configuration(env_file)
                output = io.StringIO()
                with redirect_stdout(output):
                    passed = self.preflight.run_checks(loaded, app_config)

        self.assertTrue(passed)
        self.assertEqual(loaded["GOOGLE_CLIENT_ID"], config["GOOGLE_CLIENT_ID"])
        self.assertEqual(loaded["APPLE_PRIVATE_KEY"], config["APPLE_PRIVATE_KEY"])
        self.assertNotIn("ambient-google-value", output.getvalue())
        self.assertNotIn("ambient-apple-value", output.getvalue())

    def test_dev_workflow_wires_provider_secrets_and_checks_before_build(self):
        workflow = WORKFLOW_PATH.read_text(encoding="utf-8")
        self.assertIn("environment: dev-provider-validation", workflow)
        self.assertIn("type: choice", workflow)
        self.assertIn('- "main"', workflow)
        self.assertIn('- "testflight/2026-08-16-batch-1"', workflow)
        required_secret_names = (
            "DEV_GOOGLE_CLIENT_ID",
            "DEV_GOOGLE_CLIENT_IDS",
            "DEV_APPLE_CLIENT_ID",
            "DEV_APPLE_CLIENT_IDS",
            "DEV_APPLE_TEAM_ID",
            "DEV_APPLE_KEY_ID",
            "DEV_APPLE_PRIVATE_KEY",
            "DEV_APPLE_TOKEN_ENCRYPTION_KEY",
        )
        for name in required_secret_names:
            self.assertIn(f"secrets.{name}", workflow)

        preflight_index = workflow.index("provider_config_preflight.py")
        build_index = workflow.index("docker compose up -d --build")
        self.assertLess(preflight_index, build_index)

    def test_frontend_google_client_is_forwarded_as_a_build_argument(self):
        compose = (REPO_ROOT / "docker-compose.yml").read_text(encoding="utf-8")
        dockerfile = (REPO_ROOT / "Dockerfile.frontend").read_text(encoding="utf-8")
        dockerignore = (REPO_ROOT / ".dockerignore").read_text(encoding="utf-8")
        self.assertIn(
            "NEXT_PUBLIC_GOOGLE_CLIENT_ID=${NEXT_PUBLIC_GOOGLE_CLIENT_ID:-}",
            compose,
        )
        self.assertIn("ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID", dockerfile)
        self.assertIn(
            "ENV NEXT_PUBLIC_GOOGLE_CLIENT_ID=$NEXT_PUBLIC_GOOGLE_CLIENT_ID",
            dockerfile,
        )
        self.assertIn("\n.env\n", dockerignore)
        self.assertIn("\n.env.*\n", dockerignore)
        self.assertIn("\n!.env.example\n", dockerignore)


if __name__ == "__main__":
    unittest.main()
