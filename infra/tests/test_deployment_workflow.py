"""Offline workflow execution with fake Azure/curl boundaries; no cloud access.

Run: python -m unittest discover -s infra/tests -v
"""

import copy
import json
import os
import re
import shutil
import subprocess
import sys
import textwrap
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / ".github" / "workflows" / "deploy-azure.yml"
IMAGE = "testregistry.azurecr.io/pernova/api@sha256:" + "a" * 64


class DeploymentWorkflowTests(unittest.TestCase):
    def setUp(self) -> None:
        self.source = WORKFLOW.read_text(encoding="utf-8")
        self.scripts = [
            textwrap.dedent(match)
            for match in re.findall(
                r"^        run: \|\n((?:          [^\n]*\n|\n)+)",
                self.source,
                re.MULTILINE,
            )
        ]
        self.python_scripts = [
            match
            for script in self.scripts
            for match in re.findall(r"python3 - <<'PY'\n(.*?)\nPY", script, re.DOTALL)
        ]
        self.environment = {
            key: os.environ[key]
            for key in ("PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP")
            if key in os.environ
        }
        self.environment.update(
            {
                "AZURE_CREDENTIALS": json.dumps(
                    {
                        "clientId": "00000000-0000-4000-8000-000000000001",
                        "tenantId": "00000000-0000-4000-8000-000000000002",
                        "subscriptionId": "00000000-0000-4000-8000-000000000003",
                    }
                ),
                "RESOURCE_GROUP": "rg-pernova-test",
                "CONTAINER_APP": "ca-pernova-test",
                "REGISTRY_SERVER": "testregistry.azurecr.io",
                "CONTAINER_IMAGE": IMAGE,
            }
        )
        self.app = {
            "properties": {
                "configuration": {
                    "activeRevisionsMode": "Single",
                    "ingress": {
                        "external": True,
                        "allowInsecure": False,
                        "targetPort": 8000,
                        "fqdn": "ca-pernova-test.region.azurecontainerapps.io",
                    },
                    "registries": [
                        {
                            "server": "testregistry.azurecr.io",
                            "identity": "/subscriptions/test/resourceGroups/test/providers/"
                            "Microsoft.ManagedIdentity/userAssignedIdentities/test",
                        }
                    ],
                },
                "template": {
                    "scale": {"maxReplicas": 1},
                    "containers": [
                        {
                            "name": "api",
                            "env": [{"name": "PERNOVA_MODE", "value": "connected"}],
                        }
                    ],
                },
            }
        }
        self.auth = {
            "properties": {
                "platform": {"enabled": True},
                "globalValidation": {
                    "unauthenticatedClientAction": "Return401",
                    "excludedPaths": [
                        "/",
                        "/assets/*",
                        "/theme.js",
                        "/favicon.svg",
                        "/health/live",
                        "/health/ready",
                    ],
                },
                "httpSettings": {"requireHttps": True},
                "identityProviders": {"azureActiveDirectory": {"enabled": True}},
            }
        }

    def run_python(
        self, index: int, overrides: dict[str, str] | None = None
    ) -> subprocess.CompletedProcess[bytes]:
        environment = self.environment | (overrides or {})
        return subprocess.run(
            [sys.executable, "-"],
            input=self.python_scripts[index].encode(),
            capture_output=True,
            env=environment,
            timeout=10,
            check=False,
        )

    def run_guard(
        self, app: dict | None = None, auth: dict | None = None
    ) -> subprocess.CompletedProcess[bytes]:
        return self.run_python(
            1,
            {
                "APP_CONFIG": json.dumps(app if app is not None else self.app),
                "AUTH_CONFIG": json.dumps(auth if auth is not None else self.auth),
            },
        )

    def run_readiness(self, **overrides: str) -> subprocess.CompletedProcess[bytes]:
        bash = shutil.which("bash")
        self.assertIsNotNone(
            bash, "Bash is required to execute the workflow regression checks."
        )
        # Functions fake external boundaries, so this cannot contact Azure or HTTP.
        boundary = """
        az() {
          case "$*" in
            *properties.template.containers*) printf '%s\\n' "$FAKE_IMAGE" ;;
            *properties.provisioningState*) printf '%s\\n' "$FAKE_STATE" ;;
            *properties.latestReadyRevisionName*) printf '%s\\n' "$FAKE_READY_REVISION" ;;
            *properties.configuration.ingress.fqdn*) printf '%s\\n' "$FAKE_HOST" ;;
            *) echo "Unexpected Azure command" >&2; return 97 ;;
          esac
        }
        curl() { printf '%s\\n' "$FAKE_RESPONSE"; return "$FAKE_CURL_STATUS"; }
        sleep() { :; }
        python3() { "$TEST_PYTHON" "$@"; }
        """
        environment = (
            self.environment
            | {
                "REVISION": "ca-pernova-test--gh-123-1",
                "FAKE_IMAGE": IMAGE,
                "FAKE_STATE": "Provisioned",
                "FAKE_READY_REVISION": "ca-pernova-test--gh-123-1",
                "FAKE_HOST": "ca-pernova-test.region.azurecontainerapps.io",
                "FAKE_RESPONSE": '{"status":"ready"}',
                "FAKE_CURL_STATUS": "0",
                "GITHUB_STEP_SUMMARY": "/dev/null",
                "TEST_PYTHON": sys.executable,
            }
            | overrides
        )
        return subprocess.run(
            [bash, "--noprofile", "--norc"],
            input=(textwrap.dedent(boundary) + self.scripts[3]).encode(),
            capture_output=True,
            env=environment,
            timeout=20,
            check=False,
        )

    def test_workflow_is_manual_main_only_and_environment_protected(self) -> None:
        triggers = self.source.split("\non:\n")[1].split("\npermissions:")[0]
        self.assertIn("  workflow_dispatch:", triggers)
        self.assertNotRegex(
            triggers, r"\b(push|pull_request|pull_request_target|schedule):"
        )
        self.assertIn("if: github.ref == 'refs/heads/main'", self.source)
        self.assertIn("environment: azure-demo", self.source)
        self.assertIn("timeout-minutes: 15", self.source)
        self.assertIn("cancel-in-progress: true", self.source)
        self.assertIn("group: deploy-azure-demo", self.source)

    def test_oidc_is_job_scoped_and_secret_is_not_interpolated_into_shell(self) -> None:
        self.assertIn("\npermissions:\n  contents: read\n", self.source)
        self.assertIn("      id-token: write", self.source)
        self.assertNotIn("creds:", self.source)
        for field in ("clientId", "tenantId", "subscriptionId"):
            self.assertIn(f"fromJSON(secrets.AZURE_CREDENTIALS).{field}", self.source)
        for script in self.scripts:
            self.assertNotIn("${{", script)
            self.assertNotIn('echo "$AZURE_CREDENTIALS"', script)

    def test_workflow_uses_no_package_restore_or_resource_creation(self) -> None:
        self.assertIn("AZURE_EXTENSION_USE_DYNAMIC_INSTALL: 'no'", self.source)
        self.assertIn('--image "$CONTAINER_IMAGE"', self.source)
        self.assertIn("--container-name api", self.source)
        self.assertNotRegex(
            self.source,
            r"\b(?:npm|npx|pip|uv|docker)\b|\baz\s+(?:deployment|role|ad|acr)\b",
        )
        self.assertNotIn("az containerapp create", self.source)
        self.assertNotIn("az extension add", self.source)

    def test_all_embedded_scripts_parse(self) -> None:
        self.assertEqual(len(self.scripts), 4)
        self.assertEqual(len(self.python_scripts), 3)
        bash = shutil.which("bash")
        self.assertIsNotNone(bash, "Bash is required for workflow syntax checks.")
        for script in self.scripts:
            with self.subTest(script=script.splitlines()[0]):
                result = subprocess.run(
                    [bash, "--noprofile", "--norc", "-n"],
                    input=script.encode(),
                    capture_output=True,
                    timeout=10,
                    check=False,
                )
                self.assertEqual(result.returncode, 0, result.stderr.decode())
        for script in self.python_scripts:
            compile(script, str(WORKFLOW), "exec")

    def test_valid_oidc_metadata_and_digest_pass(self) -> None:
        result = self.run_python(0)
        self.assertEqual(result.returncode, 0, result.stderr.decode())
        self.assertEqual(result.stdout, b"")

    def test_invalid_identity_metadata_fails_without_echoing_input(self) -> None:
        credentials = json.loads(self.environment["AZURE_CREDENTIALS"])
        for value in (
            "",
            "{",
            "[]",
            json.dumps(credentials | {"clientSecret": "synthetic-rejected-value"}),
            json.dumps(credentials | {"clientId": "not-a-guid"}),
            json.dumps(credentials | {"tenantId": 42}),
        ):
            with self.subTest(value=value):
                result = self.run_python(0, {"AZURE_CREDENTIALS": value})
                self.assertNotEqual(result.returncode, 0)
                self.assertIn(b"AZURE_CREDENTIALS", result.stderr)
                self.assertNotIn(b"synthetic-rejected-value", result.stderr)
                self.assertEqual(result.stdout, b"")

    def test_mutable_other_registry_and_injected_images_are_rejected(self) -> None:
        for image in (
            "testregistry.azurecr.io/pernova:latest",
            "otherregistry.azurecr.io/pernova@sha256:" + "a" * 64,
            IMAGE + "; echo unsafe",
            IMAGE[:-1],
            IMAGE.replace("sha256:", "sha512:"),
            IMAGE.upper(),
        ):
            with self.subTest(image=image):
                result = self.run_python(0, {"CONTAINER_IMAGE": image})
                self.assertNotEqual(result.returncode, 0)
                self.assertIn(b"immutable digest URI", result.stderr)

    def test_missing_or_unsafe_target_settings_are_rejected(self) -> None:
        for key, value in (
            ("RESOURCE_GROUP", ""),
            ("RESOURCE_GROUP", "--subscription"),
            ("CONTAINER_APP", "app; echo unsafe"),
            ("REGISTRY_SERVER", "https://testregistry.azurecr.io"),
            ("REGISTRY_SERVER", "unapproved.example"),
        ):
            with self.subTest(setting=key, value=value):
                result = self.run_python(0, {key: value})
                self.assertNotEqual(result.returncode, 0)
                self.assertIn(key.encode(), result.stderr)

    def test_existing_connected_single_replica_app_passes(self) -> None:
        result = self.run_guard()
        self.assertEqual(result.returncode, 0, result.stderr.decode())

    def test_demo_multiple_containers_and_multiple_replicas_fail(self) -> None:
        app = copy.deepcopy(self.app)
        app["properties"]["template"]["containers"][0]["env"][0]["value"] = "demo"
        self.assertIn(b"connected mode", self.run_guard(app).stderr)
        app = copy.deepcopy(self.app)
        app["properties"]["template"]["containers"].append({"name": "sidecar"})
        self.assertIn(b"exactly one api", self.run_guard(app).stderr)
        app = copy.deepcopy(self.app)
        app["properties"]["template"]["scale"]["maxReplicas"] = 2
        self.assertIn(b"maxReplicas=1", self.run_guard(app).stderr)
        app = copy.deepcopy(self.app)
        app["properties"]["configuration"]["activeRevisionsMode"] = "Multiple"
        self.assertIn(b"Single revision", self.run_guard(app).stderr)

    def test_registry_password_and_missing_identity_fail(self) -> None:
        for registry in (
            {"server": "testregistry.azurecr.io", "passwordSecretRef": "password"},
            {"server": "testregistry.azurecr.io", "identity": "system"},
            {"server": "otherregistry.azurecr.io", "identity": "/subscriptions/test"},
        ):
            with self.subTest(registry=registry):
                app = copy.deepcopy(self.app)
                app["properties"]["configuration"]["registries"] = [registry]
                result = self.run_guard(app)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn(b"user-assigned managed identity", result.stderr)

    def test_weakened_auth_or_wildcard_public_exclusions_fail(self) -> None:
        for field, value in (
            ("unauthenticatedClientAction", "AllowAnonymous"),
            ("excludedPaths", ["/*"]),
            (
                "excludedPaths",
                self.auth["properties"]["globalValidation"]["excludedPaths"]
                + ["/api/*"],
            ),
        ):
            with self.subTest(field=field):
                auth = copy.deepcopy(self.auth)
                auth["properties"]["globalValidation"][field] = value
                result = self.run_guard(auth=auth)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn(b"Entra bearer-auth", result.stderr)
        auth = copy.deepcopy(self.auth)
        auth["properties"]["platform"]["enabled"] = False
        self.assertIn(b"Entra bearer-auth", self.run_guard(auth=auth).stderr)

    def test_new_revision_readiness_succeeds(self) -> None:
        result = self.run_readiness()
        self.assertEqual(result.returncode, 0, result.stderr.decode())

    def test_old_ready_revision_does_not_count_as_success(self) -> None:
        result = self.run_readiness(FAKE_READY_REVISION="old-revision")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(b"did not become ready within 30 checks", result.stdout)

    def test_wrong_image_and_failed_provisioning_fail(self) -> None:
        result = self.run_readiness(FAKE_IMAGE=IMAGE[:-1] + "b")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(b"does not contain the requested image", result.stdout)
        result = self.run_readiness(FAKE_STATE="Failed")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(b"failed provisioning", result.stdout)

    def test_http_failure_wrong_response_and_unsafe_host_fail(self) -> None:
        for overrides in (
            {"FAKE_CURL_STATUS": "22"},
            {"FAKE_RESPONSE": '{"status":"live"}'},
            {"FAKE_RESPONSE": "invalid-json"},
            {"FAKE_HOST": "unapproved.example"},
        ):
            with self.subTest(overrides=overrides):
                self.assertNotEqual(self.run_readiness(**overrides).returncode, 0)


if __name__ == "__main__":
    unittest.main()
