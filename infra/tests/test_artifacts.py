"""Offline artifact regression checks; not APIM C# compilation or runtime tests.

Run: python -m unittest discover -s infra/tests -v
No package restore, Azure account, container or network access is needed.
"""

import ast
import fnmatch
import json
import re
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

INFRA = Path(__file__).resolve().parents[1]


class ArtifactTests(unittest.TestCase):
    def setUp(self) -> None:
        self.main = (INFRA / "main.bicep").read_text(encoding="utf-8")
        self.policies = {
            path.stem: ET.parse(path).getroot()
            for path in (INFRA / "policies").glob("*.xml")
        }

    def test_policy_named_values_have_declarations(self) -> None:
        declarations = set(re.findall(r"'(pernova-[a-z0-9-]+)'", self.main))
        for path in (INFRA / "policies").glob("*.xml"):
            for name in re.findall(r"\{\{([^}]+)\}\}", path.read_text()):
                with self.subTest(policy=path.name, named_value=name):
                    self.assertIn(name, declarations)

    def test_each_gateway_requires_v2_entra_audience_and_role(self) -> None:
        self.assertEqual(set(self.policies), {"control", "mcp", "responses"})
        for name, policy in self.policies.items():
            with self.subTest(policy=name):
                auth = policy.find("inbound/validate-azure-ad-token")
                self.assertIsNotNone(auth)
                self.assertEqual(auth.attrib["header-name"], "Authorization")
                self.assertEqual(
                    auth.findtext("audiences/audience"), "{{pernova-api-audience}}"
                )
                self.assertEqual(
                    auth.findtext("required-claims/claim[@name='ver']/value"), "2.0"
                )
                self.assertIsNotNone(auth.find("required-claims/claim[@name='roles']"))

    def test_agent_headers_are_deleted_not_trusted(self) -> None:
        for name, policy in self.policies.items():
            with self.subTest(policy=name):
                for header in ("x-agent", "x-agent-id"):
                    entry = policy.find(f"inbound/set-header[@name='{header}']")
                    self.assertIsNotNone(entry)
                    self.assertEqual(entry.attrib["exists-action"], "delete")
        auth = self.policies["responses"].find(
            "inbound/authentication-managed-identity"
        )
        self.assertEqual(auth.attrib["client-id"], "{{pernova-gateway-client-id}}")
        self.assertEqual(auth.attrib["resource"], "https://ai.azure.com")

    def test_bounded_mcp_schema_and_route(self) -> None:
        schema = json.loads((INFRA / "schemas/json-rpc.json").read_text())
        self.assertEqual(schema["type"], "object")
        self.assertFalse(schema["additionalProperties"])
        self.assertEqual(
            schema["properties"]["method"]["enum"],
            ["initialize", "tools/list", "tools/call"],
        )
        self.assertIn("id", schema["required"])
        self.assertEqual(
            self.policies["mcp"].find("inbound/rewrite-uri").attrib["template"], "/mcp"
        )
        self.assertIn(
            "allowed.Contains", ET.tostring(self.policies["mcp"], encoding="unicode")
        )

    def test_responses_schema_is_text_only_and_does_not_store(self) -> None:
        schema = json.loads((INFRA / "schemas/responses.json").read_text())
        self.assertFalse(schema["additionalProperties"])
        self.assertEqual(schema["properties"]["input"]["type"], "string")
        self.assertEqual(schema["properties"]["input"]["maxLength"], 16000)
        self.assertEqual(schema["properties"]["model"]["type"], "string")
        self.assertEqual(schema["properties"]["instructions"]["type"], "string")
        self.assertEqual(schema["properties"]["tools"]["type"], "array")
        self.assertEqual(schema["properties"]["tools"]["maxItems"], 0)
        self.assertEqual(schema["properties"]["max_output_tokens"]["maximum"], 2048)
        for key in ("store", "stream", "background"):
            self.assertEqual(schema["properties"][key]["enum"], [False])
        self.assertTrue(
            {"model", "input", "store", "max_output_tokens"} <= set(schema["required"])
        )

    def test_content_validation_has_explicit_deployed_schema(self) -> None:
        for name, schema_id, file in (
            ("mcp", "pernova-json-rpc", "json-rpc.json"),
            ("responses", "pernova-responses", "responses.json"),
        ):
            with self.subTest(policy=name):
                validation = self.policies[name].find("inbound/validate-content")
                self.assertEqual(validation.attrib["max-size"], "32768")
                self.assertEqual(validation.attrib["size-exceeded-action"], "prevent")
                self.assertEqual(
                    validation.find("content").attrib["schema-id"], schema_id
                )
                self.assertIn(f"name: '{schema_id}'", self.main)
                self.assertIn(f"loadTextContent('schemas/{file}')", self.main)

    def test_supplemental_token_limits_and_inference_actor(self) -> None:
        policy = self.policies["responses"]
        limit = policy.find("inbound/llm-token-limit")
        self.assertEqual(limit.attrib["tokens-per-minute"], "25000")
        self.assertEqual(limit.attrib["token-quota"], "100000")
        self.assertEqual(limit.attrib["token-quota-period"], "Daily")
        self.assertEqual(
            policy.findtext(
                "inbound/validate-azure-ad-token/required-claims/claim[@name='azp']/value"
            ),
            "{{pernova-backend-client-id}}",
        )
        self.assertIn(
            "As<JObject>(preserveContent: true)",
            ET.tostring(policy, encoding="unicode")
            .replace("&lt;", "<")
            .replace("&gt;", ">"),
        )

    def test_demo_identity_network_state_and_logging_limits_are_explicit(self) -> None:
        self.assertIn("maxReplicas: 1", self.main)
        self.assertIn("external: true", self.main)
        self.assertIn("unauthenticatedClientAction: 'Return401'", self.main)
        exclusion_block = re.search(r"excludedPaths:\s*\[([^\]]*)\]", self.main)
        self.assertIsNotNone(exclusion_block)
        exclusions = re.findall(r"'([^']+)'", exclusion_block.group(1))
        self.assertEqual(
            exclusions,
            [
                "/health/live",
                "/health/ready",
                "/",
                "/assets/*",
                "/theme.js",
                "/favicon.svg",
            ],
        )
        # Static pattern guard; actual ACA matching still requires deployment tests.
        for route in ("/", "/assets/app.js", "/theme.js", "/favicon.svg"):
            with self.subTest(public_path=route):
                self.assertTrue(
                    any(fnmatch.fnmatchcase(route, path) for path in exclusions)
                )
        for route in (
            "/api/bootstrap",
            "/api/workflows",
            "/api/docs",
            "/mcp",
            "/mcp/",
            "/assets-other/app.js",
        ):
            with self.subTest(protected_path=route):
                self.assertFalse(
                    any(fnmatch.fnmatchcase(route, path) for path in exclusions)
                )
        self.assertIn("body: { bytes: 0 }", self.main)
        self.assertIn("httpCorrelationProtocol: 'W3C'", self.main)
        self.assertNotIn("Microsoft.Authorization/roleAssignments", self.main)
        self.assertNotIn("Microsoft.CognitiveServices/accounts", self.main)
        # Empty tool/model policies deny rather than invent cloud connections.
        self.assertIn("param mcpClientToolAllowlist object = {}", self.main)
        self.assertIn("param allowedModelDeployments array = []", self.main)

    def test_exact_backend_and_inference_roles(self) -> None:
        expected = {
            "control": {"Reader", "Operator", "Approver", "SecurityAdmin", "Admin"},
            "mcp": {"Agent"},
            "responses": {"Inference"},
        }
        for name, roles in expected.items():
            with self.subTest(policy=name):
                actual = self.policies[name].findall(
                    "inbound/validate-azure-ad-token/required-claims/claim[@name='roles']/value"
                )
                self.assertEqual({value.text for value in actual}, roles)
        security_source = (INFRA.parent / "backend/app/security.py").read_text(
            encoding="utf-8"
        )
        role_sets = [
            ast.literal_eval(node.value)
            for node in ast.parse(security_source).body
            if isinstance(node, ast.Assign)
            and any(
                isinstance(target, ast.Name) and target.id == "ROLES"
                for target in node.targets
            )
        ]
        self.assertEqual(role_sets, [expected["control"] | expected["mcp"]])

    def test_backend_summarize_payload_matches_schema(self) -> None:
        # Inspect the actual source without importing Azure SDKs or making a request.
        source = (INFRA.parent / "backend/app/inference.py").read_text(encoding="utf-8")
        tree = ast.parse(source)
        calls = [
            node
            for node in ast.walk(tree)
            if isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute)
            and node.func.attr == "create"
            and isinstance(node.func.value, ast.Attribute)
            and node.func.value.attr == "responses"
        ]
        self.assertEqual(len(calls), 1)
        fields = {keyword.arg: keyword.value for keyword in calls[0].keywords}
        # SDK transport headers carry W3C context; they are not Responses JSON fields.
        transport_headers = fields.pop("extra_headers", None)
        self.assertIsInstance(transport_headers, ast.Name)
        self.assertEqual(transport_headers.id, "trace_headers")
        self.assertEqual(
            set(fields),
            {"model", "input", "instructions", "max_output_tokens", "tools", "store"},
        )
        schema = json.loads(
            (INFRA / "schemas/responses.json").read_text(encoding="utf-8")
        )
        self.assertTrue(set(fields) <= set(schema["properties"]))
        self.assertEqual(ast.literal_eval(fields["tools"]), [])
        self.assertIs(ast.literal_eval(fields["store"]), False)
        self.assertEqual(schema["properties"]["tools"]["maxItems"], 0)
        constants = {
            node.targets[0].id: node.value.value
            for node in tree.body
            if isinstance(node, ast.Assign)
            and isinstance(node.targets[0], ast.Name)
            and isinstance(node.value, ast.Constant)
        }
        self.assertEqual(constants["MAX_OUTPUT_TOKENS"], 512)
        self.assertLessEqual(
            constants["MAX_OUTPUT_TOKENS"],
            schema["properties"]["max_output_tokens"]["maximum"],
        )
        self.assertLessEqual(
            len(constants["INSTRUCTIONS"]),
            schema["properties"]["instructions"]["maxLength"],
        )

    def test_application_configuration_names_are_documented(self) -> None:
        source = (INFRA.parent / "backend/app/config.py").read_text(encoding="utf-8")
        names = set(re.findall(r'"((?:PERNOVA_|AZURE_CLIENT_ID)[A-Z0-9_]*)"', source))
        guide = (INFRA.parent / "docs/deployment.md").read_text(encoding="utf-8")
        for name in names:
            with self.subTest(variable=name):
                self.assertIn(f"`{name}`", guide)
        frontend = (INFRA.parent / "frontend/src/auth.ts").read_text(encoding="utf-8")
        for name in set(re.findall(r"env\.(VITE_[A-Z0-9_]+)", frontend)):
            with self.subTest(frontend_variable=name):
                self.assertIn(f"`{name}`", guide)

    def test_bearer_cors_is_explicit_and_opt_in(self) -> None:
        fragment = ET.parse(INFRA / "fragments/browser-cors.xml").getroot()
        self.assertEqual(fragment.attrib["allow-credentials"], "false")
        self.assertEqual(
            {header.text for header in fragment.findall("allowed-headers/header")},
            {"Authorization", "Content-Type", "traceparent"},
        )
        self.assertNotIn("*", ET.tostring(fragment, encoding="unicode"))
        self.assertIn("param allowedBrowserOrigins array = []", self.main)
        self.assertIn("empty(allowedBrowserOrigins) ? ''", self.main)
        raw = (INFRA / "policies/control.xml").read_text(encoding="utf-8")
        self.assertLess(
            raw.index("BROWSER_CORS_POLICY"), raw.index("validate-azure-ad-token")
        )
        self.assertIn("httpHeaders: [{ name: 'Host', value: 'localhost' }]", self.main)


if __name__ == "__main__":
    unittest.main()
