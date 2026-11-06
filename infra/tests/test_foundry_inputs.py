"""Synthetic, offline input tests; no resource names refer to a real deployment."""

import contextlib
import io
import json
import unittest
from unittest.mock import patch

from infra.validate_foundry import (
    MODEL_DEPLOYMENTS,
    PROJECT_ENDPOINT,
    RESOURCE_ENDPOINT,
    main,
    validate_environment,
)


class FoundryInputTests(unittest.TestCase):
    def setUp(self) -> None:
        self.environment = {
            RESOURCE_ENDPOINT: "https://synthetic.services.ai.azure.com/openai/v1/",
            PROJECT_ENDPOINT: "https://synthetic.services.ai.azure.com/api/projects/synthetic",
            MODEL_DEPLOYMENTS: '["synthetic-model"]',
        }

    def test_absent_configuration_stays_disabled(self) -> None:
        self.assertEqual(validate_environment({}), [])

    def test_supported_resource_hostnames_and_trailing_slash(self) -> None:
        for host in ("services.ai.azure.com", "openai.azure.com"):
            for slash in ("", "/"):
                with self.subTest(host=host, slash=slash):
                    self.environment[RESOURCE_ENDPOINT] = (
                        f"https://synthetic.{host}/openai/v1{slash}"
                    )
                    self.assertEqual(validate_environment(self.environment), [])

    def test_each_partial_configuration_is_rejected(self) -> None:
        for missing in self.environment:
            with self.subTest(missing=missing):
                environment = self.environment.copy()
                del environment[missing]
                self.assertTrue(validate_environment(environment))

    def test_endpoint_injection_legacy_paths_and_wrong_hosts_are_rejected(self) -> None:
        for endpoint in (
            "http://synthetic.services.ai.azure.com/openai/v1/",
            "https://synthetic.openai.azure.com/openai/v1/?api-version=2024-01-01",
            "https://synthetic.openai.azure.com/openai/v1/#fragment",
            "https://synthetic.openai.azure.com/openai/v1/?",
            "https://synthetic.openai.azure.com/openai/v1/#",
            "https://token@synthetic.openai.azure.com/openai/v1/",
            "https://synthetic.openai.azure.com:443/openai/v1/",
            "https://synthetic.openai.azure.com:invalid/openai/v1/",
            "https://synthetic.openai.azure.com.evil.invalid/openai/v1/",
            "https://synthetic.openai.azure.com/openai/deployments/model",
            "https://synthetic.openai.azure.com/openai/v1/responses",
            "https://synthetic.services.ai.azure.com/api/projects/synthetic",
            "https://synthetic.openai.azure.com/openai/v1/\n",
            "\x00https://synthetic.openai.azure.com/openai/v1/",
            "x" * 2049,
        ):
            with self.subTest(endpoint=endpoint):
                self.environment[RESOURCE_ENDPOINT] = endpoint
                self.assertTrue(validate_environment(self.environment))

    def test_wrong_project_or_resource_pair_is_rejected(self) -> None:
        for project in (
            "https://other.services.ai.azure.com/api/projects/synthetic",
            "https://synthetic.openai.azure.com/api/projects/synthetic",
            "https://synthetic.api.azureml.ms",
            "https://synthetic.services.ai.azure.com/api/projects/",
            "https://synthetic.services.ai.azure.com/api/projects/synthetic/agents",
        ):
            with self.subTest(project=project):
                self.environment[PROJECT_ENDPOINT] = project
                self.assertTrue(validate_environment(self.environment))

    def test_allowlist_is_bounded_unique_and_string_only(self) -> None:
        for models in (
            None,
            {},
            True,
            [1],
            [True],
            [None],
            [""],
            ["*"],
            ["with space"],
            ["duplicate", "duplicate"],
            ["m" * 129],
            [f"model-{i}" for i in range(33)],
        ):
            with self.subTest(models=models):
                self.environment[MODEL_DEPLOYMENTS] = json.dumps(models)
                self.assertTrue(validate_environment(self.environment))
        self.environment[MODEL_DEPLOYMENTS] = json.dumps(
            [f"model-{i}" for i in range(32)]
        )
        self.assertEqual(validate_environment(self.environment), [])

    def test_invalid_or_oversized_json_is_rejected(self) -> None:
        for value in ("not json", " " * 32769, "[" * 2000):
            with self.subTest(value_length=len(value)):
                self.environment[MODEL_DEPLOYMENTS] = value
                self.assertTrue(validate_environment(self.environment))

    def test_cli_fails_without_echoing_input(self) -> None:
        self.environment[RESOURCE_ENDPOINT] += "?secret=do-not-log"
        output = io.StringIO()
        with patch.dict("os.environ", self.environment, clear=True):
            with contextlib.redirect_stderr(output):
                self.assertEqual(main(), 1)
        self.assertNotIn("do-not-log", output.getvalue())
        self.assertNotIn("synthetic", output.getvalue())


if __name__ == "__main__":
    unittest.main()
