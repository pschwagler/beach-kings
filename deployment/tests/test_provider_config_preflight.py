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
PROD_WORKFLOW_PATH = REPO_ROOT / ".github" / "workflows" / "deploy-prod.yml"


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


def valid_production_config():
    return {
        **valid_config(),
        "JWT_SECRET_KEY": "production-test-secret-with-at-least-32-bytes",
        "AWS_ACCESS_KEY_ID": "media-access-test-value",
        "AWS_SECRET_ACCESS_KEY": "media-secret-test-value",
        "AWS_S3_BUCKET": "media-bucket-test-value",
        "AWS_MODERATION_EVIDENCE_BUCKET": "moderation-evidence-test-bucket",
        "OPENAI_API_KEY": "moderation-provider-test-value",
        "MODERATION_AUTO_ENFORCE_SCORE": "0.95",
        "MODERATION_PROVIDER_TIMEOUT": "20",
        "MODERATION_FLAGSHIP_TIMEOUT": "30",
        "MODERATION_FLAGSHIP_MAX_ATTEMPTS": "2",
        "MODERATION_FLAGSHIP_MODEL": "flagship-test-model",
        "MODERATION_ALERTS_ENABLED": "true",
        "RESEND_API_KEY": "alert-mail-test-value",
        "RESEND_FROM_EMAIL": "alerts@example.test",
        "MODERATION_ALERT_EMAIL": "reviewer@example.test",
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

    def test_valid_production_runtime_configuration_reports_without_values(self):
        config = valid_production_config()
        with tempfile.TemporaryDirectory() as temp_dir:
            app_config = write_app_config(Path(temp_dir))
            output = io.StringIO()
            with redirect_stdout(output):
                passed = self.preflight.run_checks(config, app_config, production=True)

        self.assertTrue(passed)
        report = output.getvalue()
        for name in (
            "JWT_SECRET_KEY",
            "AWS_ACCESS_KEY_ID",
            "AWS_SECRET_ACCESS_KEY",
            "OPENAI_API_KEY",
            "AWS_MODERATION_EVIDENCE_BUCKET",
            "RESEND_API_KEY",
            "MODERATION_ALERT_EMAIL",
        ):
            self.assertNotIn(config[name], report)

    def test_production_runtime_misconfiguration_fails_without_values(self):
        invalid_cases = (
            ("JWT_SECRET_KEY", "change-me-in-production", "Production JWT secret"),
            ("AWS_ACCESS_KEY_ID", "", "Media access key"),
            ("AWS_SECRET_ACCESS_KEY", "", "Media secret key"),
            ("AWS_S3_BUCKET", "", "Media bucket"),
            ("OPENAI_API_KEY", "", "Moderation provider credential"),
            (
                "AWS_MODERATION_EVIDENCE_BUCKET",
                "",
                "Moderation evidence bucket",
            ),
            (
                "MODERATION_AUTO_ENFORCE_SCORE",
                "1.1",
                "Moderation auto-enforcement threshold",
            ),
            ("MODERATION_PROVIDER_TIMEOUT", "31", "Moderation provider timeout"),
            ("MODERATION_FLAGSHIP_TIMEOUT", "46", "Moderation flagship timeout"),
            (
                "MODERATION_FLAGSHIP_MAX_ATTEMPTS",
                "3",
                "Moderation flagship attempts",
            ),
            ("MODERATION_FLAGSHIP_MODEL", "", "Moderation flagship model"),
            ("MODERATION_ALERTS_ENABLED", "false", "Moderation owner alerts"),
            ("RESEND_API_KEY", "", "Moderation alert mail credential"),
            ("RESEND_FROM_EMAIL", "", "Moderation alert sender"),
            ("MODERATION_ALERT_EMAIL", "", "Moderation alert recipient"),
        )
        with tempfile.TemporaryDirectory() as temp_dir:
            app_config = write_app_config(Path(temp_dir))
            for name, invalid_value, expected_label in invalid_cases:
                with self.subTest(name=name):
                    config = valid_production_config()
                    config[name] = invalid_value
                    output = io.StringIO()
                    with redirect_stdout(output):
                        passed = self.preflight.run_checks(config, app_config, production=True)

                    self.assertFalse(passed)
                    report = output.getvalue()
                    self.assertIn(f"FAIL {expected_label}", report)
                    if invalid_value and name in {
                        "JWT_SECRET_KEY",
                        "AWS_ACCESS_KEY_ID",
                        "AWS_SECRET_ACCESS_KEY",
                        "OPENAI_API_KEY",
                        "AWS_MODERATION_EVIDENCE_BUCKET",
                        "RESEND_API_KEY",
                        "MODERATION_ALERT_EMAIL",
                    }:
                        self.assertNotIn(invalid_value, report)

    def test_production_rejects_public_bucket_reused_for_moderation_evidence(self):
        config = valid_production_config()
        config["AWS_MODERATION_EVIDENCE_BUCKET"] = f"  {config['AWS_S3_BUCKET'].upper()}  "
        with tempfile.TemporaryDirectory() as temp_dir:
            app_config = write_app_config(Path(temp_dir))
            output = io.StringIO()
            with redirect_stdout(output):
                passed = self.preflight.run_checks(config, app_config, production=True)

        self.assertFalse(passed)
        report = output.getvalue()
        self.assertIn(
            "FAIL Moderation evidence bucket is separate from public media",
            report,
        )
        self.assertNotIn(config["AWS_S3_BUCKET"], report)
        self.assertNotIn(config["AWS_MODERATION_EVIDENCE_BUCKET"].strip(), report)

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

    def test_prod_workflow_fails_closed_before_deployment(self):
        workflow = PROD_WORKFLOW_PATH.read_text(encoding="utf-8")
        self.assertIn("vars.NEXT_PUBLIC_GOOGLE_CLIENT_ID", workflow)
        self.assertIn(
            "NEXT_PUBLIC_GOOGLE_CLIENT_ID=${{ vars.NEXT_PUBLIC_GOOGLE_CLIENT_ID }}",
            workflow,
        )

        preflight_index = workflow.index("provider_config_preflight.py")
        backup_index = workflow.index("Pre-deployment database backup")
        pull_index = workflow.index("docker-compose pull frontend backend")
        self.assertIn("--production", workflow[preflight_index:backup_index])
        self.assertIn("command_timeout: 20m", workflow)
        self.assertIn(
            'export RELEASE_READINESS_GENERATION="$(git rev-parse HEAD)-$(openssl rand -hex 16)"',
            workflow,
        )
        self.assertLess(preflight_index, backup_index)
        self.assertLess(preflight_index, pull_index)


if __name__ == "__main__":
    unittest.main()
