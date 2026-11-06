from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest
from backend.app.config import Config
from backend.app.inference import MAX_OUTPUT_TOKENS, RESERVED_TOKENS, ResponsesInference
from backend.app.store import DomainError
from opentelemetry.context import Context
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.trace.propagation.tracecontext import TraceContextTextMapPropagator


def connected_config(data_dir: Path, **overrides: Any) -> Config:
    return Config(
        mode="connected",
        data_dir=data_dir,
        allowed_origins=(),
        jwt_issuer="https://login.microsoftonline.com/synthetic/v2.0",
        jwt_audience="api://pernova",
        jwt_public_key="synthetic-test-only",
        apim_endpoint="https://synthetic.azure-api.net/openai/v1/",
        apim_scope="api://synthetic-gateway/.default",
        model_deployment="approved-deployment",
        model_eur_per_token=0.0001,
        **overrides,
    )


async def test_responses_uses_uami_gateway_scope_no_tools_and_actual_usage(
    data_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    observed: dict[str, Any] = {}

    class Credential:
        def __init__(self, client_id: str) -> None:
            observed["client_id"] = client_id

        async def get_token(self, scope: str) -> Any:
            observed["scope"] = scope
            return SimpleNamespace(token="synthetic-managed-identity-token")

        async def close(self) -> None:
            observed["credential_closed"] = True

    class Client:
        def __init__(self, **kwargs: Any) -> None:
            observed["client"] = kwargs
            self.responses = self

        async def create(self, **kwargs: Any) -> Any:
            observed["request"] = kwargs
            observed["bearer"] = await observed["client"]["api_key"]()
            return SimpleNamespace(
                status="completed",
                usage=SimpleNamespace(total_tokens=250),
                output_text="Synthetic Belgian route summary.",
            )

        async def close(self) -> None:
            observed["client_closed"] = True

    monkeypatch.setattr("backend.app.inference.ManagedIdentityCredential", Credential)
    monkeypatch.setattr("backend.app.inference.AsyncOpenAI", Client)
    config = connected_config(data_dir, azure_client_id="synthetic-uami-id")
    config.validate()
    inference = ResponsesInference(config)
    trace_id = "4bf92f3577b34da6a3ce929d0e0e4736"
    remote = TraceContextTextMapPropagator().extract(
        {"traceparent": f"00-{trace_id}-00f067aa0ba902b7-01"},
        context=Context(),
    )
    provider = TracerProvider()
    try:
        with provider.get_tracer("test.responses").start_as_current_span(
            "inference.responses",
            context=remote,
        ) as span:
            result = await inference.summarize(
                "logistics",
                "Synthetic Belgium stock 6500; floor 2000.",
            )
            outgoing = observed["request"]["extra_headers"]["traceparent"].split("-")
            assert outgoing[1] == trace_id
            assert outgoing[2] == f"{span.get_span_context().span_id:016x}"
            assert outgoing[2] != "00f067aa0ba902b7"
    finally:
        provider.shutdown()
    assert result.tokens == 250 and result.cost_eur == pytest.approx(0.025)
    assert observed["client_id"] == config.azure_client_id
    assert observed["scope"] == config.apim_scope
    assert observed["client"]["base_url"].endswith("/v1/")
    assert observed["client"]["max_retries"] == 0
    assert observed["request"]["model"] == config.model_deployment
    assert observed["request"]["store"] is False
    assert observed["request"]["tools"] == []
    assert observed["request"]["max_output_tokens"] == MAX_OUTPUT_TOKENS
    assert observed["request"]["instructions"]
    with pytest.raises(DomainError, match="Sensitive"):
        await inference.summarize("intake", "Do not send synthetic.person@example.test")
    with pytest.raises(DomainError, match="reservation"):
        await inference.summarize("intake", "x" * RESERVED_TOKENS)
    await inference.close()
    assert observed["credential_closed"] and observed["client_closed"]


@pytest.mark.parametrize(
    "overrides,expected",
    [
        ({}, "AZURE_CLIENT_ID"),
        ({"azure_client_id": "synthetic-uami"}, None),
    ],
)
def test_connected_inference_uami_required(
    data_dir: Path,
    overrides: dict[str, Any],
    expected: str | None,
) -> None:
    config = connected_config(data_dir, **overrides)
    if expected:
        with pytest.raises(ValueError, match=expected):
            config.validate()
    else:
        config.validate()
