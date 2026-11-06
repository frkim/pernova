from pathlib import Path
from typing import Any

import pytest
from backend.app.store import Store
from backend.app.telemetry import Telemetry
from opentelemetry.sdk.trace.export import SpanExporter


def test_azure_monitor_uses_uami_and_disables_offline_storage(
    data_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    observed: dict[str, Any] = {}

    class Credential:
        def __init__(self, client_id: str) -> None:
            observed["client_id"] = client_id

        def close(self) -> None:
            observed["credential_closed"] = True

    class Exporter(SpanExporter):
        def __init__(self, **kwargs: Any) -> None:
            observed["exporter"] = kwargs

        def shutdown(self) -> None:
            observed["exporter_closed"] = True

    monkeypatch.setenv("APPLICATIONINSIGHTS_CONNECTION_STRING", "synthetic-test-connection")
    monkeypatch.setenv("AZURE_CLIENT_ID", "synthetic-uami")
    for variable in [
        "APPLICATIONINSIGHTS_STATSBEAT_DISABLED_ALL",
        "APPLICATIONINSIGHTS_SDKSTATS_DISABLED",
        "APPLICATIONINSIGHTS_CONTROLPLANE_DISABLED",
    ]:
        monkeypatch.setenv(variable, "")
    monkeypatch.setattr("backend.app.telemetry.ManagedIdentityCredential", Credential)
    monkeypatch.setattr(
        "azure.monitor.opentelemetry.exporter.AzureMonitorTraceExporter",
        Exporter,
    )
    store = Store(data_dir / "monitor.sqlite3")
    telemetry = Telemetry(store)
    assert telemetry.export_configured
    assert observed["client_id"] == "synthetic-uami"
    assert observed["exporter"]["disable_offline_storage"] is True
    assert isinstance(observed["exporter"]["credential"], Credential)
    telemetry.close()
    store.close()
    assert observed["credential_closed"] and observed["exporter_closed"]


def test_azure_monitor_fails_closed_without_managed_identity(
    data_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("APPLICATIONINSIGHTS_CONNECTION_STRING", "synthetic-test-connection")
    monkeypatch.delenv("AZURE_CLIENT_ID", raising=False)
    store = Store(data_dir / "monitor-invalid.sqlite3")
    try:
        with pytest.raises(ValueError, match="AZURE_CLIENT_ID"):
            Telemetry(store)
    finally:
        store.close()
