import json
from pathlib import Path
from typing import Any

import pytest
from backend.app.config import Config


@pytest.mark.parametrize("name", ["PERNOVA_STEP_DELAY_SECONDS", "PERNOVA_MODEL_EUR_PER_TOKEN"])
@pytest.mark.parametrize("value", ["not-a-number", "nan", "inf", "-inf"])
def test_numeric_environment_errors_name_key_not_value(
    monkeypatch: pytest.MonkeyPatch, name: str, value: str
) -> None:
    monkeypatch.setenv(name, value)
    with pytest.raises(ValueError, match=name) as error:
        Config.from_env()
    assert str(error.value) == f"{name} must be a finite number"
    assert error.value.__cause__ is not None


@pytest.mark.parametrize(
    "value",
    [
        None,
        [],
        "value",
        {"": "intake"},
        {"client": []},
        {"client": "unknown"},
        {"x" * 101: "intake"},
        {str(i): "intake" for i in range(101)},
    ],
)
def test_agent_client_configuration_requires_bounded_mapping(
    monkeypatch: pytest.MonkeyPatch, value: Any
) -> None:
    monkeypatch.setenv("PERNOVA_AGENT_CLIENTS_JSON", json.dumps(value))
    with pytest.raises(ValueError, match="PERNOVA_AGENT_CLIENTS_JSON"):
        Config.from_env().validate()


def test_malformed_agent_json_and_unreadable_key_are_named(
    monkeypatch: pytest.MonkeyPatch, data_dir: Path
) -> None:
    monkeypatch.setenv("PERNOVA_AGENT_CLIENTS_JSON", "{")
    with pytest.raises(ValueError, match="PERNOVA_AGENT_CLIENTS_JSON") as error:
        Config.from_env()
    assert error.value.__cause__ is not None
    monkeypatch.setenv("PERNOVA_AGENT_CLIENTS_JSON", '{"client":"intake"}')
    monkeypatch.setenv("PERNOVA_JWT_PUBLIC_KEY_FILE", str(data_dir / "missing-key"))
    with pytest.raises(ValueError, match="PERNOVA_JWT_PUBLIC_KEY_FILE") as error:
        Config.from_env()
    assert str(data_dir) not in str(error.value)
    assert error.value.__cause__ is not None


@pytest.mark.parametrize(
    "origin",
    ["https://", "https:///missing-host", "https://example.test:bad", "https://example.test:0"],
)
def test_connected_origins_fail_fast(origin: str) -> None:
    with pytest.raises(ValueError, match="PERNOVA_ALLOWED_ORIGINS"):
        Config(mode="connected", allowed_origins=(origin,)).validate()


@pytest.mark.parametrize("name", ["jwt_issuer", "jwt_jwks_url"])
@pytest.mark.parametrize(
    "value",
    ["http://example.test", "https://", "https://user:password@example.test", "https://x:bad"],
)
def test_connected_identity_urls_are_explicit_https(name: str, value: str) -> None:
    settings = {
        "jwt_issuer": "https://login.microsoftonline.com/synthetic/v2.0",
        "jwt_jwks_url": "https://login.microsoftonline.com/synthetic/keys",
        name: value,
    }
    with pytest.raises(ValueError, match=f"PERNOVA_{name.upper()}"):
        Config(
            mode="connected", allowed_origins=(), jwt_audience="synthetic", **settings
        ).validate()


def test_valid_environment_mapping_and_numeric_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PERNOVA_STEP_DELAY_SECONDS", "0.25")
    monkeypatch.setenv("PERNOVA_MODEL_EUR_PER_TOKEN", "0.001")
    monkeypatch.setenv("PERNOVA_AGENT_CLIENTS_JSON", '{"registered-client":"intake"}')
    config = Config.from_env()
    config.validate()
    assert config.step_delay == 0.25
    assert config.model_eur_per_token == 0.001
    assert config.agent_clients == {"registered-client": "intake"}
