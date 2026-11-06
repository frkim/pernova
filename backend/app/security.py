"""Caller identity is resolved from verified JWT claims, never client role headers."""

import asyncio
import ipaddress
import json
import logging
import time
from collections import defaultdict, deque
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlsplit
from uuid import uuid4

import jwt
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from .config import Config
from .store import DomainError

LOGGER = logging.getLogger("pernova.security")
if not LOGGER.handlers:
    LOGGER.addHandler(logging.StreamHandler())
LOGGER.setLevel(logging.INFO)
LOGGER.propagate = False
MAX_BODY_BYTES = 65536
ROLES = {"Reader", "Operator", "Approver", "SecurityAdmin", "Admin", "Agent"}


@dataclass(frozen=True)
class Caller:
    subject: str
    roles: frozenset[str]
    agent_id: str | None = None


class Authenticator:
    def __init__(self, config: Config) -> None:
        self.config = config
        self.jwks = (
            jwt.PyJWKClient(config.jwt_jwks_url, cache_keys=True, lifespan=300, timeout=5)
            if config.jwt_jwks_url
            else None
        )

    async def caller(self, authorization: str) -> Caller:
        if self.config.mode == "demo":
            return Caller(
                "loopback-demo-operator",
                frozenset({"Operator", "Approver", "SecurityAdmin", "Reader"}),
            )
        if not authorization.startswith("Bearer ") or len(authorization) > 8192:
            raise DomainError("Verified bearer authentication required", 403)
        token = authorization[7:]
        try:
            key: Any = self.config.jwt_public_key
            if self.jwks:
                key = (await asyncio.to_thread(self.jwks.get_signing_key_from_jwt, token)).key
            claims = jwt.decode(
                token,
                key,
                algorithms=["RS256"],
                audience=self.config.jwt_audience,
                issuer=self.config.jwt_issuer,
                options={"require": ["exp", "iss", "aud", "sub"]},
            )
            roles = claims.get("roles")
            if not isinstance(roles, list) or not all(isinstance(role, str) for role in roles):
                raise DomainError("Application roles required", 403)
            granted = frozenset(roles) & ROLES
            if not granted:
                raise DomainError("Application role not authorized", 403)
            client_id = claims.get("azp", claims.get("appid", ""))
            agent_id = self.config.agent_clients.get(client_id) if "Agent" in granted else None
            if "Agent" in granted and not agent_id:
                raise DomainError("Agent client not registered", 403)
            return Caller(claims["sub"], granted, agent_id)
        except (jwt.PyJWTError, ValueError, TypeError) as exc:
            raise DomainError("Bearer token verification failed", 403) from exc


class BoundaryMiddleware:
    def __init__(self, app: ASGIApp, config: Config) -> None:
        self.app = app
        self.config = config
        self.auth = Authenticator(config)
        self.rates: dict[str, deque[float]] = defaultdict(deque)
        self.sse_connections = 0

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        correlation = uuid4().hex
        scope.setdefault("state", {})["correlation_id"] = correlation
        headers = {key.decode().lower(): value.decode() for key, value in scope["headers"]}
        path = scope["path"]
        started = time.monotonic()
        sse = path.endswith("/events") and path.startswith("/api/workflows/")
        status_code = 500

        async def guarded_send(message: Message) -> None:
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
                identity_origin = (
                    b" https://login.microsoftonline.com"
                    if self.config.mode == "connected"
                    else b""
                )
                csp = (
                    b"default-src 'self'; script-src 'self'; "
                    b"style-src 'self' 'unsafe-inline'; connect-src 'self'"
                    + identity_origin
                    + b"; frame-src 'self'"
                    + identity_origin
                    + b"; img-src 'self' data:; font-src 'self'; "
                    b"frame-ancestors 'none'; base-uri 'self'"
                )
                extra = [
                    (b"x-correlation-id", correlation.encode()),
                    (b"x-content-type-options", b"nosniff"),
                    (b"x-frame-options", b"DENY"),
                    (b"referrer-policy", b"no-referrer"),
                    (b"cache-control", b"no-store"),
                    (b"content-security-policy", csp),
                ]
                message["headers"] = list(message.get("headers", [])) + extra
            await send(message)

        async def error(detail: str, code: int) -> None:
            await JSONResponse({"detail": detail, "correlation_id": correlation}, status_code=code)(
                scope, receive, guarded_send
            )

        try:
            if sum(len(key) + len(value) for key, value in scope["headers"]) > 16384:
                raise DomainError("Headers exceed size limit", 422)
            if len(scope.get("query_string", b"")) > 4096 or len(path) > 2048:
                raise DomainError("Request target exceeds input limits", 422)
            host = urlsplit("//" + headers.get("host", "")).hostname
            normalized = f"[{host}]" if host == "::1" else host
            if normalized not in self.config.allowed_hosts:
                raise DomainError("Host not authorized", 403)
            if self.config.mode == "demo":
                peer = scope.get("client")
                if not peer or not ipaddress.ip_address(peer[0]).is_loopback:
                    raise DomainError("Demo access requires a loopback connection", 403)
            origin = headers.get("origin")
            if origin and origin not in self.config.allowed_origins:
                raise DomainError("Origin not authorized", 403)
            if headers.get("sec-fetch-site") == "cross-site" and not origin:
                raise DomainError("Cross-site access not authorized", 403)
            api = path.startswith("/api/") or path == "/mcp"
            if api and scope["method"] != "OPTIONS":
                scope["state"]["caller"] = await self.auth.caller(headers.get("authorization", ""))
            caller: Caller | None = scope["state"].get("caller")
            key = caller.subject if caller else (scope.get("client") or ("unknown",))[0]
            queue = self.rates[key]
            while queue and queue[0] <= started - 60:
                queue.popleft()
            if len(queue) >= 240:
                raise DomainError("Request rate limit exceeded", 409)
            queue.append(started)
            if sse and self.sse_connections >= 8:
                raise DomainError("Event connection limit exceeded", 409)
            if api and scope["method"] in {"POST", "PUT"}:
                if headers.get("content-type", "").split(";")[0] != "application/json":
                    raise DomainError("JSON content type required", 422)
                try:
                    size = int(headers.get("content-length", "0"))
                except ValueError as exc:
                    raise DomainError("Invalid content length", 422) from exc
                if size < 0 or size > MAX_BODY_BYTES:
                    raise DomainError("Request body exceeds size limit", 422)
                body = bytearray()
                while True:
                    message = await receive()
                    if message["type"] == "http.disconnect":
                        return
                    body.extend(message.get("body", b""))
                    if len(body) > MAX_BODY_BYTES:
                        raise DomainError("Request body exceeds size limit", 422)
                    if not message.get("more_body"):
                        break
                try:
                    parsed_body = json.loads(body)
                except (json.JSONDecodeError, UnicodeDecodeError):
                    parsed_body = None
                except (RecursionError, ValueError) as exc:
                    raise DomainError("JSON structure exceeds input limits", 422) from exc
                stack = [(parsed_body, 0)]
                while stack:
                    value, depth = stack.pop()
                    if depth > 16:
                        raise DomainError("JSON nesting exceeds input limits", 422)
                    if isinstance(value, (dict, list)):
                        if len(value) > 100:
                            raise DomainError("JSON collection exceeds input limits", 422)
                        stack.extend(
                            (child, depth + 1)
                            for child in (value.values() if isinstance(value, dict) else value)
                        )
                delivered = False

                async def buffered_receive() -> Message:
                    nonlocal delivered
                    if not delivered:
                        delivered = True
                        return {"type": "http.request", "body": bytes(body), "more_body": False}
                    return await receive()

                await self.app(scope, buffered_receive, guarded_send)
            else:
                if sse:
                    self.sse_connections += 1
                try:
                    await self.app(scope, receive, guarded_send)
                finally:
                    if sse:
                        self.sse_connections -= 1
        except DomainError as exc:
            await error(exc.detail, exc.status_code)
        except Exception:
            if status_code == 500:
                await error("Request failed closed", 500)
        finally:
            LOGGER.info(
                json.dumps(
                    {
                        "event": "http_request",
                        "method": scope["method"],
                        "route": "api" if path.startswith("/api/") else "service",
                        "status": status_code,
                        "correlation_id": correlation,
                        "duration_ms": round((time.monotonic() - started) * 1000, 3),
                    }
                )
            )
