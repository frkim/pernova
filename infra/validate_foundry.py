"""Offline Foundry input gate for main.demo.bicepparam; never contacts Azure."""

import json
import os
import re
import sys
from collections.abc import Mapping
from urllib.parse import urlsplit

RESOURCE_ENDPOINT = "PERNOVA_FOUNDRY_OPENAI_V1_ENDPOINT"
PROJECT_ENDPOINT = "PERNOVA_FOUNDRY_PROJECT_ENDPOINT"
MODEL_DEPLOYMENTS = "PERNOVA_MODEL_DEPLOYMENTS_JSON"


def _resource_name(value: str, *, project: bool) -> str | None:
    max_length = 2048 if project else 2000
    if len(value) > max_length or any(
        character.isspace() or not character.isprintable() for character in value
    ):
        return None
    try:
        url = urlsplit(value)
        if (
            url.scheme != "https"
            or url.username is not None
            or url.password is not None
            or url.port is not None
            or url.query
            or url.fragment
            or "?" in value
            or "#" in value
        ):
            return None
    except ValueError:
        return None
    suffix = (
        r"services\.ai\.azure\.com"
        if project
        else (r"(?:services\.ai\.azure\.com|openai\.azure\.com)")
    )
    host = re.fullmatch(rf"([a-z0-9][a-z0-9-]*[a-z0-9]|[a-z0-9])\.{suffix}", url.netloc)
    path = r"/api/projects/[A-Za-z0-9][A-Za-z0-9._-]*/?" if project else r"/openai/v1/?"
    if host is None or re.fullmatch(path, url.path) is None:
        return None
    return host.group(1)


def validate_environment(environment: Mapping[str, str]) -> list[str]:
    """Validate shape/consistency, not resource kind, RBAC, region or connectivity."""
    endpoint = environment.get(RESOURCE_ENDPOINT, "")
    project = environment.get(PROJECT_ENDPOINT, "")
    raw_models = environment.get(MODEL_DEPLOYMENTS, "[]")
    if len(raw_models) > 32768:
        return [f"{MODEL_DEPLOYMENTS}: input exceeds 32768 characters"]
    try:
        models = json.loads(raw_models)
    except (ValueError, RecursionError):
        return [f"{MODEL_DEPLOYMENTS}: expected a JSON deployment-name array"]
    if (
        not isinstance(models, list)
        or len(models) > 32
        or any(
            not isinstance(model, str)
            or re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}", model) is None
            for model in models
        )
    ):
        return [f"{MODEL_DEPLOYMENTS}: expected at most 32 bounded deployment names"]
    if len(set(models)) != len(models):
        return [f"{MODEL_DEPLOYMENTS}: duplicate deployment names are not allowed"]
    if not endpoint and not project and not models:
        return []
    errors = []
    if not endpoint or not project or not models:
        errors.append(
            "Foundry inference requires both endpoints and a nonempty deployment allowlist"
        )
    resource_name = _resource_name(endpoint, project=False)
    project_resource_name = _resource_name(project, project=True)
    if resource_name is None:
        errors.append(
            f"{RESOURCE_ENDPOINT}: expected a public Azure HTTPS OpenAI v1 base URL"
        )
    if project_resource_name is None:
        errors.append(
            f"{PROJECT_ENDPOINT}: expected a public Azure HTTPS Foundry project URL"
        )
    if (
        resource_name
        and project_resource_name
        and resource_name != project_resource_name
    ):
        errors.append(
            "Foundry resource and project endpoints must use the same resource subdomain"
        )
    return errors


def main() -> int:
    errors = validate_environment(os.environ)
    if errors:
        # Never echo supplied URLs, model names, tokens or query strings.
        for error in errors:
            print(error, file=sys.stderr)
        return 1
    print(
        "Foundry input shape passed; resource provenance and Azure runtime remain unverified."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
