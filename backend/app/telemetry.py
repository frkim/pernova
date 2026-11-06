"""Real SDK spans and the matching durable local timeline.

Export is optional and only reported as configured, never connectivity-verified.
Ended workflow roots can parent later approval spans on the same trace.
"""

import os
import time
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime

from azure.identity import ManagedIdentityCredential
from opentelemetry import trace
from opentelemetry.context import Context
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.trace import NonRecordingSpan, SpanContext, Status, StatusCode, TraceFlags

from .models import Scalar, Span, Workflow
from .store import DomainError, Store, now


class Telemetry:
    def __init__(self, store: Store) -> None:
        self.store = store
        self.provider = TracerProvider(
            resource=Resource.create(
                {
                    "service.name": "pernova-backend",
                    "service.version": "0.1.0",
                    "deployment.environment.name": os.getenv("PERNOVA_MODE", "demo"),
                }
            )
        )
        self.export_configured = bool(os.getenv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT"))
        self.monitor_credential: ManagedIdentityCredential | None = None
        if self.export_configured:
            from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter

            self.provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(timeout=5)))
        connection_string = os.getenv("APPLICATIONINSIGHTS_CONNECTION_STRING", "")
        if connection_string:
            client_id = os.getenv("AZURE_CLIENT_ID")
            if not client_id:
                raise ValueError("Azure Monitor export requires AZURE_CLIENT_ID managed identity")
            os.environ["APPLICATIONINSIGHTS_STATSBEAT_DISABLED_ALL"] = "true"
            os.environ["APPLICATIONINSIGHTS_SDKSTATS_DISABLED"] = "true"
            os.environ["APPLICATIONINSIGHTS_CONTROLPLANE_DISABLED"] = "true"
            from azure.monitor.opentelemetry.exporter import AzureMonitorTraceExporter

            self.monitor_credential = ManagedIdentityCredential(client_id=client_id)
            exporter = AzureMonitorTraceExporter(
                connection_string=connection_string,
                credential=self.monitor_credential,
                disable_offline_storage=True,
                timeout=5,
            )
            self.provider.add_span_processor(BatchSpanProcessor(exporter))
            self.export_configured = True
        self.tracer = self.provider.get_tracer("pernova.workflow", "0.1.0")

    def context(self, workflow: Workflow, parent: str | None = None) -> Context:
        span_id = parent or workflow.spans[0].span_id
        return trace.set_span_in_context(
            NonRecordingSpan(
                SpanContext(
                    trace_id=int(workflow.trace_id, 16),
                    span_id=int(span_id, 16),
                    is_remote=False,
                    trace_flags=TraceFlags(TraceFlags.SAMPLED),
                )
            )
        )

    def root(self, parent_context: Context | None = None) -> trace.Span:
        return self.tracer.start_span(
            "workflow.supervisor",
            context=parent_context if parent_context is not None else Context(),
            attributes={"data.synthetic": True, "inventory.isolated": True},
        )

    def record(
        self,
        sdk_span: trace.Span,
        name: str,
        agent_id: str | None,
        parent: str | None,
        attributes: dict[str, Scalar] | None = None,
    ) -> Span:
        return Span(
            span_id=f"{sdk_span.get_span_context().span_id:016x}",
            parent_span_id=parent,
            name=name,
            agent_id=agent_id,
            started_at=now(),
            attributes=attributes or {},
        )

    @contextmanager
    def operation(
        self,
        workflow_id: str,
        name: str,
        agent_id: str | None = None,
        parent: str | None = None,
        attributes: dict[str, Scalar] | None = None,
    ) -> Iterator[trace.Span]:
        workflow = self.store.get(workflow_id)
        if len(workflow.spans) >= 512:
            raise DomainError("Workflow trace limit reached; export and start a new case")
        parent_id = parent or workflow.spans[0].span_id
        sdk = self.tracer.start_span(
            name,
            context=self.context(workflow, parent_id),
            attributes=attributes or {},
        )
        local = self.record(sdk, name, agent_id, parent_id, attributes)
        self.store.mutate(workflow_id, lambda wf, _: wf.spans.append(local))
        started = time.perf_counter()
        status = "ok"
        try:
            with trace.use_span(
                sdk, end_on_exit=False, record_exception=False, set_status_on_exception=False
            ):
                yield sdk
            sdk.set_status(Status(StatusCode.OK))
        except BaseException:
            status = "error"
            sdk.set_status(Status(StatusCode.ERROR, "Operation denied or interrupted"))
            raise
        finally:
            sdk.end()
            duration = (time.perf_counter() - started) * 1000

            def finish(wf: Workflow, _: object) -> None:
                entry = next(item for item in wf.spans if item.span_id == local.span_id)
                entry.status = status
                entry.duration_ms = round(duration, 3)

            self.store.mutate(workflow_id, finish)

    def finish_root(self, workflow_id: str, sdk: trace.Span) -> None:
        workflow = self.store.get(workflow_id)
        success = workflow.status in {"completed", "awaiting_approval"}
        sdk.set_status(Status(StatusCode.OK if success else StatusCode.ERROR))
        sdk.end()

        def finish(wf: Workflow, _: object) -> None:
            span = wf.spans[0]
            span.status = "ok" if success else "error"
            span.duration_ms = round(
                (datetime.now(UTC) - datetime.fromisoformat(span.started_at)).total_seconds()
                * 1000,
                3,
            )
            wf.metrics.duration_ms = span.duration_ms

        self.store.mutate(workflow_id, finish)

    def close(self) -> None:
        self.provider.shutdown()
        if self.monitor_credential:
            self.monitor_credential.close()
