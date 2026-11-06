import asyncio
import json
import logging
from datetime import datetime
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, Mock

import jwt
import pytest
from backend.app.config import Config
from backend.app.security import LOGGER, MAX_RATE_KEYS, BoundaryMiddleware, Caller
from backend.app.store import DomainError
from starlette.types import Message, Receive, Scope, Send


def scope(method: str = "GET") -> Scope:
    return {
        "type": "http",
        "method": method,
        "path": "/api/bootstrap",
        "query_string": b"",
        "headers": [(b"host", b"127.0.0.1"), (b"content-type", b"application/json")],
        "client": ("127.0.0.1", 12345),
    }


async def receive() -> Message:
    return {"type": "http.request", "body": b"{}", "more_body": False}


@pytest.fixture
def logs(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []

    def capture(level: int, message: str) -> None:
        entry = json.loads(message)
        assert entry["level"] == logging.getLevelName(level)
        assert datetime.fromisoformat(entry["timestamp"]).utcoffset().total_seconds() == 0
        assert len(entry["correlation_id"]) == 32
        entries.append(entry)

    monkeypatch.setattr(LOGGER, "log", capture)
    return entries


async def test_unexpected_error_is_safe_correlated_and_logged(
    logs: list[dict[str, Any]],
) -> None:
    async def failing_app(scope: Scope, receive: Receive, send: Send) -> None:
        raise RuntimeError("private-token person@example.test internal.sqlite3")

    messages: list[Message] = []

    async def send(message: Message) -> None:
        messages.append(message)

    await BoundaryMiddleware(failing_app, Config())(scope(), receive, send)
    assert messages[0]["status"] == 500
    payload = json.loads(messages[1]["body"])
    assert payload == {
        "detail": "Request failed closed",
        "correlation_id": logs[0]["correlation_id"],
    }
    assert (b"x-correlation-id", payload["correlation_id"].encode()) in messages[0]["headers"]
    assert [entry["event"] for entry in logs] == ["http_request_failed", "http_request"]
    assert logs[0]["error_type"] == "RuntimeError"
    assert logs[0]["level"] == "ERROR"
    assert logs[1]["status"] == 500
    assert logs[0]["correlation_id"] == logs[1]["correlation_id"]
    for private in ["private-token", "person@example.test", "internal.sqlite3"]:
        assert private not in json.dumps(logs) + json.dumps(payload)


@pytest.mark.parametrize("mode", ["demo", "connected"])
@pytest.mark.parametrize(
    ("path", "failure"), [("/", False), ("/", True), ("/api/bootstrap", False)]
)
async def test_connected_hsts_covers_static_and_error_responses(
    mode: str, path: str, failure: bool, logs: list[dict[str, Any]]
) -> None:
    async def app(scope: Scope, receive: Receive, send: Send) -> None:
        if failure:
            raise RuntimeError("synthetic failure")
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"synthetic"})

    messages: list[Message] = []

    async def send(message: Message) -> None:
        messages.append(message)

    request_scope = scope()
    request_scope["path"] = path
    await BoundaryMiddleware(app, Config(mode=mode))(request_scope, receive, send)
    headers = dict(messages[0]["headers"])
    if mode == "connected":
        assert headers[b"strict-transport-security"] == b"max-age=31536000"
    else:
        assert b"strict-transport-security" not in headers
    assert logs[-1]["status"] == (
        500 if failure else 403 if mode == "connected" and path.startswith("/api/") else 200
    )


@pytest.mark.parametrize("status", [200, 500])
@pytest.mark.parametrize("domain_error", [False, True])
async def test_stream_errors_propagate_without_second_response(
    logs: list[dict[str, Any]], status: int, domain_error: bool
) -> None:
    error = DomainError("stream stopped") if domain_error else RuntimeError("stream stopped")

    async def streaming_app(scope: Scope, receive: Receive, send: Send) -> None:
        await send({"type": "http.response.start", "status": status, "headers": []})
        await send({"type": "http.response.body", "body": b"partial", "more_body": True})
        raise error

    messages: list[Message] = []

    async def send(message: Message) -> None:
        messages.append(message)

    with pytest.raises(type(error)) as raised:
        await BoundaryMiddleware(streaming_app, Config())(scope(), receive, send)
    assert raised.value is error
    assert [message["type"] for message in messages] == [
        "http.response.start",
        "http.response.body",
    ]
    assert logs[0]["level"] == "ERROR"
    assert logs[-1]["status"] == status


async def test_body_timeout_is_bounded_contract_error(
    logs: list[dict[str, Any]], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr("backend.app.security.BODY_TIMEOUT_SECONDS", 0)
    pending: asyncio.Future[Message] = asyncio.get_running_loop().create_future()

    async def unused_app(scope: Scope, receive: Receive, send: Send) -> None:
        pytest.fail("A timed out body must not reach the application")

    async def stalled_receive() -> Message:
        return await pending

    messages: list[Message] = []

    async def send(message: Message) -> None:
        messages.append(message)

    await BoundaryMiddleware(unused_app, Config())(scope("POST"), stalled_receive, send)
    assert messages[0]["status"] == 422
    assert json.loads(messages[1]["body"]) == {
        "detail": "Request body read timed out",
        "correlation_id": logs[-1]["correlation_id"],
    }
    assert len(logs) == 1
    assert pending.cancelled()


async def test_request_cancellation_is_not_translated(logs: list[dict[str, Any]]) -> None:
    async def cancelled_app(scope: Scope, receive: Receive, send: Send) -> None:
        raise asyncio.CancelledError

    async def send(message: Message) -> None:
        pytest.fail("Cancellation must not generate a replacement response")

    with pytest.raises(asyncio.CancelledError):
        await BoundaryMiddleware(cancelled_app, Config())(scope(), receive, send)
    assert logs[-1]["event"] == "http_request"


def test_rate_tracking_is_bounded_pruned_and_preserves_active_limits() -> None:
    async def unused_app(scope: Scope, receive: Receive, send: Send) -> None:
        pass

    boundary = BoundaryMiddleware(unused_app, Config())
    for identity in range(MAX_RATE_KEYS):
        boundary.check_rate(str(identity), 100)
    with pytest.raises(DomainError, match="capacity") as error:
        boundary.check_rate("overflow", 100)
    assert error.value.status_code == 409
    assert len(boundary.rates) == MAX_RATE_KEYS
    for _ in range(239):
        boundary.check_rate("0", 100)
    with pytest.raises(DomainError, match="rate limit"):
        boundary.check_rate("0", 100)
    boundary.check_rate("new", 160)
    assert list(boundary.rates) == ["new"]


async def test_failed_authentication_is_limited_before_further_jwks_work(
    logs: list[dict[str, Any]], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr("backend.app.security.time", SimpleNamespace(monotonic=lambda: 100.0))

    async def unused_app(scope: Scope, receive: Receive, send: Send) -> None:
        pytest.fail("Rejected authentication must not reach the application")

    boundary = BoundaryMiddleware(unused_app, Config(mode="connected"))
    lookup = Mock(side_effect=jwt.InvalidTokenError("synthetic invalid token"))
    monkeypatch.setattr(boundary.auth, "jwks", SimpleNamespace(get_signing_key_from_jwt=lookup))
    messages: list[Message] = []

    async def send(message: Message) -> None:
        messages.append(message)

    for _ in range(240):
        messages.clear()
        request_scope = scope()
        request_scope["headers"].append((b"authorization", b"Bearer synthetic-invalid-token"))
        await boundary(request_scope, receive, send)
        assert messages[0]["status"] == 403
    assert lookup.call_count == 240

    messages.clear()
    request_scope = scope()
    request_scope["headers"].extend(
        [
            (b"authorization", b"Bearer synthetic-invalid-token"),
            (b"x-forwarded-for", b"192.0.2.99"),
        ]
    )
    await boundary(request_scope, receive, send)
    assert messages[0]["status"] == 409
    assert json.loads(messages[1]["body"]) == {
        "detail": "Request rate limit exceeded",
        "correlation_id": logs[-1]["correlation_id"],
    }
    assert lookup.call_count == 240
    assert list(boundary.rates) == ["auth_peer:127.0.0.1"]
    assert len(boundary.rates["auth_peer:127.0.0.1"]) == 240


async def test_principal_limit_is_retained_across_peer_addresses(
    logs: list[dict[str, Any]], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr("backend.app.security.time", SimpleNamespace(monotonic=lambda: 100.0))

    async def app(scope: Scope, receive: Receive, send: Send) -> None:
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"synthetic"})

    boundary = BoundaryMiddleware(app, Config(mode="connected"))
    caller = AsyncMock(return_value=Caller("synthetic-reader", frozenset({"Reader"})))
    monkeypatch.setattr(boundary.auth, "caller", caller)
    for _ in range(239):
        boundary.check_rate("principal:synthetic-reader", 100)
    messages: list[Message] = []

    async def send(message: Message) -> None:
        messages.append(message)

    await boundary(scope(), receive, send)
    assert messages[0]["status"] == 200
    messages.clear()
    request_scope = scope()
    request_scope["client"] = ("192.0.2.2", 12345)
    await boundary(request_scope, receive, send)
    assert messages[0]["status"] == 409
    assert caller.await_count == 2
    assert len(boundary.rates["principal:synthetic-reader"]) == 240
    assert len(boundary.rates["auth_peer:127.0.0.1"]) == 1
    assert len(boundary.rates["auth_peer:192.0.2.2"]) == 1


@pytest.mark.parametrize(
    ("path", "method"),
    [
        ("/", "GET"),
        ("/health/live", "GET"),
        ("/health/ready", "GET"),
        ("/api/bootstrap", "OPTIONS"),
    ],
)
async def test_public_requests_count_once_without_authentication(
    path: str, method: str, logs: list[dict[str, Any]], monkeypatch: pytest.MonkeyPatch
) -> None:
    async def app(scope: Scope, receive: Receive, send: Send) -> None:
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"synthetic"})

    boundary = BoundaryMiddleware(app, Config(mode="connected"))
    caller = AsyncMock(side_effect=AssertionError("Public endpoints must not authenticate"))
    monkeypatch.setattr(boundary.auth, "caller", caller)
    messages: list[Message] = []

    async def send(message: Message) -> None:
        messages.append(message)

    request_scope = scope(method)
    request_scope["path"] = path
    await boundary(request_scope, receive, send)
    assert messages[0]["status"] == 200
    caller.assert_not_awaited()
    assert list(boundary.rates) == ["public_peer:127.0.0.1"]
    assert len(boundary.rates["public_peer:127.0.0.1"]) == 1
