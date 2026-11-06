import json
import time
from pathlib import Path

import httpx
import jwt
import pytest
from backend.app.config import Config
from backend.app.main import create_app
from backend.app.models import Bootstrap, Workflow
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter


async def test_api_contract_lifecycle_and_evidence(data_dir: Path) -> None:
    app = create_app(Config(data_dir=data_dir, step_delay=0))
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://127.0.0.1:8000",
        ) as client:
            assert (await client.get("/health/live")).json() == {"status": "live"}
            assert (await client.get("/health/ready")).status_code == 200
            response = await client.get("/api/bootstrap")
            bootstrap = Bootstrap.model_validate(response.json())
            assert bootstrap.policy.max_tokens == 25000
            assert bootstrap.mode == "demo"
            assert response.headers["x-content-type-options"] == "nosniff"
            assert response.headers["x-correlation-id"]
            assert "login.microsoftonline.com" not in response.headers["content-security-policy"]
            foundry = next(i for i in bootstrap.integrations if i.id == "foundry")
            assert foundry.status == "not_connected"
            response = await client.post("/api/workflows", json={"preset": "nominal"})
            assert response.status_code == 202
            started = Workflow.model_validate(response.json())
            assert started.status == "running"
            await app.state.engine.wait(started.id)
            workflow = (await client.get(f"/api/workflows/{started.id}")).json()
            assert workflow["status"] == "awaiting_approval"
            payload = {
                "decision": "approve",
                "scenario_id": workflow["recommended_scenario_id"],
                "reason": "Synthetic operator approved",
            }
            response = await client.post(f"/api/workflows/{started.id}/decision", json=payload)
            assert response.status_code == 200
            approved = response.json()
            repeat = await client.post(f"/api/workflows/{started.id}/decision", json=payload)
            assert repeat.json()["transfer"] == approved["transfer"]
            assert repeat.json()["metrics"] == approved["metrics"]
            history = (await client.get("/api/workflows?limit=1&offset=0")).json()
            assert history["total"] == 1
            exported = await client.get(f"/api/workflows/{started.id}/export")
            assert "attachment" in exported.headers["content-disposition"]
            assert exported.json()["id"] == started.id
            streamed = await client.get(f"/api/workflows/{started.id}/events")
            assert "event: snapshot" in streamed.text
            assert started.trace_id in streamed.text
            knowledge = await client.post(
                "/api/knowledge/search", json={"query": "Belgium safety floor"}
            )
            assert knowledge.json()["items"][0]["id"] == "stock-policy"
            missing = await client.get("/api/unknown")
            assert missing.status_code == 404
            assert set(missing.json()) == {"detail", "correlation_id"}


async def test_incoming_w3c_context_preserves_trace_and_distinct_workflow_roots(
    data_dir: Path,
) -> None:
    app = create_app(Config(data_dir=data_dir, step_delay=0))
    trace_id = "4bf92f3577b34da6a3ce929d0e0e4736"
    parent_id = "00f067aa0ba902b7"
    exporter = InMemorySpanExporter()
    async with app.router.lifespan_context(app):
        app.state.engine.telemetry.provider.add_span_processor(SimpleSpanProcessor(exporter))
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://127.0.0.1",
        ) as client:
            workflows = []
            for _ in range(2):
                response = await client.post(
                    "/api/workflows",
                    json={"preset": "nominal"},
                    headers={"traceparent": f"00-{trace_id}-{parent_id}-01"},
                )
                assert response.status_code == 202
                started = Workflow.model_validate(response.json())
                workflow = await app.state.engine.wait(started.id)
                assert workflow.trace_id == trace_id
                assert workflow.spans[0].parent_span_id == parent_id
                assert all(event.trace_id == trace_id for event in workflow.events)
                workflows.append(workflow)
            assert workflows[0].id != workflows[1].id
            assert workflows[0].spans[0].span_id != workflows[1].spans[0].span_id
            roots = [
                span for span in exporter.get_finished_spans() if span.name == "workflow.supervisor"
            ]
            assert len(roots) == 2
            for root in roots:
                assert f"{root.context.trace_id:032x}" == trace_id
                assert f"{root.parent.span_id:016x}" == parent_id


@pytest.mark.parametrize(
    "traceparent",
    [
        "not-a-traceparent",
        "00-00000000000000000000000000000000-00f067aa0ba902b7-01",
        "00-4bf92f3577b34da6a3ce929d0e0e4736-0000000000000000-01",
        "ff-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
    ],
)
async def test_malformed_traceparent_is_ignored(data_dir: Path, traceparent: str) -> None:
    app = create_app(Config(data_dir=data_dir, step_delay=0))
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://127.0.0.1",
        ) as client:
            response = await client.post(
                "/api/workflows",
                json={},
                headers={"traceparent": traceparent},
            )
            assert response.status_code == 202
            workflow = Workflow.model_validate(response.json())
            assert workflow.spans[0].parent_span_id is None
            assert workflow.trace_id not in {
                "00000000000000000000000000000000",
                "4bf92f3577b34da6a3ce929d0e0e4736",
            }
            await app.state.engine.wait(workflow.id)


@pytest.mark.parametrize(
    "method,path,body",
    [
        ("post", "/api/workflows", {"preset": "unlisted"}),
        ("post", "/api/workflows", {"agent_id": "execution"}),
        ("post", "/api/workflows", {"weights": {"service": 1}}),
        ("post", "/api/knowledge/search", {"query": ""}),
        ("get", "/api/workflows?limit=1000", None),
        ("put", "/api/policy", {"revision": 0}),
    ],
)
async def test_bounded_validation_without_sensitive_echo(
    data_dir: Path,
    method: str,
    path: str,
    body: object,
) -> None:
    app = create_app(Config(data_dir=data_dir, step_delay=0))
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://127.0.0.1",
        ) as client:
            response = await client.request(method, path, json=body)
            assert response.status_code == 422
            assert set(response.json()) == {"detail", "correlation_id"}
            assert response.json()["detail"] == "Invalid request input"


async def test_demo_boundary_host_origin_peer_size_and_no_role_headers(data_dir: Path) -> None:
    app = create_app(Config(data_dir=data_dir, step_delay=0))
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://127.0.0.1",
        ) as client:
            for headers in [{"host": "evil.example"}, {"origin": "https://evil.example"}]:
                response = await client.get("/api/bootstrap", headers=headers)
                assert response.status_code == 403
            assert (
                await client.get(
                    "/api/bootstrap",
                    headers={
                        "origin": "http://localhost:5173",
                    },
                )
            ).status_code == 200
            too_large = await client.post(
                "/api/workflows",
                content=json.dumps({"preset": "x" * 65536}),
                headers={"content-type": "application/json"},
            )
            assert too_large.status_code == 422
            content_type = await client.post("/api/workflows", content="x")
            assert content_type.status_code == 422
            headers = await client.get("/api/bootstrap", headers={"x-extra": "x" * 17000})
            assert headers.status_code == 422
            forged = await client.get("/api/bootstrap", headers={"x-role": "Administrator"})
            assert forged.status_code == 200
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app, client=("10.0.0.8", 12345)),
            base_url="http://127.0.0.1",
        ) as remote:
            response = await remote.get("/api/bootstrap", headers={"x-forwarded-for": "127.0.0.1"})
            assert response.status_code == 403


async def test_mcp_initialize_list_call_and_invalid_arguments(data_dir: Path) -> None:
    app = create_app(Config(data_dir=data_dir, step_delay=0))
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://127.0.0.1",
        ) as client:
            envelope = {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {
                    "protocolVersion": "2025-06-18",
                    "capabilities": {},
                    "clientInfo": {"name": "test", "version": "1"},
                },
            }
            initialized = (await client.post("/mcp", json=envelope)).json()
            assert initialized["result"]["serverInfo"]["name"] == "pernova-controlled-mcp"
            listed = (
                await client.post(
                    "/mcp",
                    json={
                        "jsonrpc": "2.0",
                        "id": 2,
                        "method": "tools/list",
                    },
                )
            ).json()
            assert "create_stock_transfer" not in {t["name"] for t in listed["result"]["tools"]}
            result = (
                await client.post(
                    "/mcp",
                    json={
                        "jsonrpc": "2.0",
                        "id": 3,
                        "method": "tools/call",
                        "params": {"name": "get_inventory", "arguments": {"country": "Belgium"}},
                    },
                )
            ).json()
            assert json.loads(result["result"]["content"][0]["text"])["quantity"] == 6500
            for args in [
                {"country": "Unknown"},
                {"country": "Belgium", "agent_id": "execution"},
                {"country": "Belgium", "workflow_id": "forged"},
            ]:
                error = (
                    await client.post(
                        "/mcp",
                        json={
                            "jsonrpc": "2.0",
                            "id": 4,
                            "method": "tools/call",
                            "params": {"name": "get_inventory", "arguments": args},
                        },
                    )
                ).json()
                assert error["error"]["code"] == -32602
            write = (
                await client.post(
                    "/mcp",
                    json={
                        "jsonrpc": "2.0",
                        "id": 5,
                        "method": "tools/call",
                        "params": {"name": "create_stock_transfer", "arguments": {}},
                    },
                )
            ).json()
            assert write["error"]["code"] == -32003
            batch = (await client.post("/mcp", json=[envelope])).json()
            assert batch["error"]["code"] == -32600
            malformed = (
                await client.post(
                    "/mcp",
                    content="{",
                    headers={"content-type": "application/json"},
                )
            ).json()
            assert malformed["error"]["code"] == -32700
            unknown = (
                await client.post(
                    "/mcp",
                    json={
                        "jsonrpc": "2.0",
                        "id": 7,
                        "method": "bogus",
                    },
                )
            ).json()
            assert unknown["error"]["code"] == -32601
            notification = await client.post(
                "/mcp",
                json={
                    "jsonrpc": "2.0",
                    "method": "notifications/initialized",
                },
            )
            assert notification.status_code == 202


def keypair() -> tuple[str, str]:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()
    public = (
        key.public_key()
        .public_bytes(
            serialization.Encoding.PEM,
            serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        .decode()
    )
    return private, public


async def test_connected_jwt_signature_roles_expiry_and_agent_context(data_dir: Path) -> None:
    private, public = keypair()
    foreign_private, _ = keypair()
    config = Config(
        mode="connected",
        data_dir=data_dir,
        step_delay=0,
        allowed_hosts=("127.0.0.1",),
        allowed_origins=(),
        jwt_issuer="https://login.microsoftonline.com/demo/v2.0",
        jwt_audience="api://pernova",
        jwt_public_key=public,
        agent_clients={"registered-client": "intake"},
    )
    app = create_app(config)

    def token(granted_roles: list[str], **overrides: object) -> str:
        claims = {
            "sub": "synthetic-test-user",
            "iss": config.jwt_issuer,
            "aud": config.jwt_audience,
            "exp": int(time.time()) + 60,
            "roles": granted_roles,
            **overrides,
        }
        return jwt.encode(claims, private, algorithm="RS256")

    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://127.0.0.1",
        ) as client:
            forged_context = {
                "x-role": "Admin",
                "traceparent": "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
            }
            assert (await client.get("/api/bootstrap", headers=forged_context)).status_code == 403
            assert (
                await client.post("/api/workflows", json={}, headers=forged_context)
            ).status_code == 403
            for bad in [
                token(["Reader"], exp=1),
                token(["Reader"], aud="other"),
                token(["Reader"], iss="other"),
                token(["Reader"], roles="Admin"),
                token(["Agent"], azp="unregistered"),
                jwt.encode(
                    {
                        "sub": "x",
                        "iss": config.jwt_issuer,
                        "aud": config.jwt_audience,
                        "exp": int(time.time()) + 60,
                        "roles": ["Admin"],
                    },
                    foreign_private,
                    algorithm="RS256",
                ),
            ]:
                assert (
                    await client.get(
                        "/api/bootstrap",
                        headers={
                            "authorization": f"Bearer {bad}",
                        },
                    )
                ).status_code == 403
            reader = {"authorization": f"Bearer {token(['Reader'])}", "x-role": "Admin"}
            assert (await client.get("/api/bootstrap", headers=reader)).status_code == 200
            authenticated = await client.get("/api/bootstrap", headers=reader)
            assert (
                "https://login.microsoftonline.com"
                in authenticated.headers["content-security-policy"]
            )
            assert (await client.post("/api/workflows", json={}, headers=reader)).status_code == 403
            operator = {"authorization": f"Bearer {token(['Operator'])}"}
            started = (await client.post("/api/workflows", json={}, headers=operator)).json()
            pending = await app.state.engine.wait(started["id"])
            payload = {
                "decision": "approve",
                "scenario_id": pending.recommended_scenario_id,
                "reason": "Separated role approval",
            }
            assert (
                await client.post(
                    f"/api/workflows/{pending.id}/decision",
                    json=payload,
                    headers=operator,
                )
            ).status_code == 403
            approver = {"authorization": f"Bearer {token(['Approver'])}"}
            assert (
                await client.post(
                    f"/api/workflows/{pending.id}/decision",
                    json=payload,
                    headers=approver,
                )
            ).status_code == 200
            assert (await client.put("/api/policy", json={}, headers=operator)).status_code == 403
            agent = {"authorization": f"Bearer {token(['Agent'], azp='registered-client')}"}
            denied = (
                await client.post(
                    "/mcp",
                    headers=agent,
                    json={
                        "jsonrpc": "2.0",
                        "id": 1,
                        "method": "tools/call",
                        "params": {"name": "get_inventory", "arguments": {"country": "Belgium"}},
                    },
                )
            ).json()
            assert denied["error"]["code"] == -32003
            knowledge = (
                await client.post(
                    "/mcp",
                    headers=agent,
                    json={
                        "jsonrpc": "2.0",
                        "id": 2,
                        "method": "tools/call",
                        "params": {"name": "search_knowledge", "arguments": {"query": "stock"}},
                    },
                )
            ).json()
            assert json.loads(knowledge["result"]["content"][0]["text"])["items"] == []


def test_connected_config_fail_closed(data_dir: Path) -> None:
    with pytest.raises(ValueError, match="issuer"):
        create_app(Config(mode="connected", data_dir=data_dir, allowed_origins=()))
    with pytest.raises(ValueError, match="loopback"):
        create_app(Config(allowed_hosts=("0.0.0.0",), data_dir=data_dir))
    with pytest.raises(ValueError, match="connected"):
        create_app(Config(apim_endpoint="https://demo.azure-api.net/openai/v1/", data_dir=data_dir))
