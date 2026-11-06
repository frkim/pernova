"""Bounded JSON-RPC MCP gateway; external callers cannot acquire write authority."""

import json
import time
from collections import defaultdict, deque
from typing import Annotated, Any, Literal

from pydantic import Field, ValidationError

from .engine import Engine
from .fixtures import STOCK, TOOLS, search
from .models import Identifier, Model, SearchRequest
from .security import Caller


class RpcRequest(Model):
    jsonrpc: Literal["2.0"]
    id: Annotated[str, Field(max_length=100)] | Annotated[int, Field(strict=True)] | None = None
    method: Annotated[str, Field(min_length=1, max_length=100)]
    params: dict[str, Any] = Field(default_factory=dict)


class ClientInfo(Model):
    name: Annotated[str, Field(min_length=1, max_length=100)]
    version: Annotated[str, Field(min_length=1, max_length=100)]


class InitializeParams(Model):
    protocolVersion: Literal["2024-11-05", "2025-03-26", "2025-06-18"]
    capabilities: dict[str, Any]
    clientInfo: ClientInfo


class EmptyArgs(Model):
    pass


class ShipmentArgs(Model):
    shipment_id: Literal["SHP-PR-2048"] = "SHP-PR-2048"


class InventoryArgs(Model):
    country: Literal["Belgium", "France", "Spain"] = "Belgium"


class DemandArgs(Model):
    market: Literal["France"] = "France"


class RouteArgs(Model):
    source_country: Literal["Belgium", "Spain"] = "Belgium"
    destination_country: Literal["France"] = "France"
    quantity: Annotated[int, Field(strict=True, ge=1, le=4500)] = 4000


class CallParams(Model):
    name: Identifier
    arguments: dict[str, Any] = Field(default_factory=dict)


SCHEMAS: dict[str, type[Model]] = {
    "get_shipment": ShipmentArgs,
    "get_inventory": InventoryArgs,
    "get_demand": DemandArgs,
    "simulate_route": RouteArgs,
    "search_knowledge": SearchRequest,
}


class MCP:
    def __init__(self, engine: Engine) -> None:
        self.engine = engine
        self.rates: dict[str, deque[float]] = defaultdict(deque)
        self.failures: dict[str, int] = defaultdict(int)
        self.usage: dict[str, tuple[int, float, int]] = {}

    def allowed(self, caller: Caller) -> set[str]:
        if caller.agent_id:
            agent = self.engine.store.agent(caller.agent_id)
            if agent.status != "active":
                return set()
            return set(TOOLS[agent.id]) & set(SCHEMAS) & set(agent.tools)
        return set(SCHEMAS)

    @staticmethod
    def error(request_id: Any, code: int, message: str, correlation: str) -> dict[str, Any]:
        return {
            "jsonrpc": "2.0",
            "id": request_id,
            "error": {
                "code": code,
                "message": message,
                "data": {"correlation_id": correlation},
            },
        }

    def handle(self, body: Any, caller: Caller, correlation: str) -> dict[str, Any] | None:
        request_id = body.get("id") if isinstance(body, dict) else None
        if not isinstance(request_id, (str, int, type(None))) or isinstance(request_id, bool):
            request_id = None
        try:
            request = RpcRequest.model_validate(body)
        except ValidationError:
            return self.error(request_id, -32600, "Invalid JSON-RPC request", correlation)
        notification = "id" not in request.model_fields_set
        try:
            if request.method == "notifications/initialized":
                EmptyArgs.model_validate(request.params)
                return (
                    None
                    if notification
                    else self.error(
                        request.id,
                        -32600,
                        "Initialized must be a notification",
                        correlation,
                    )
                )
            if request.method == "initialize":
                params = InitializeParams.model_validate(request.params)
                if len(json.dumps(params.capabilities)) > 4096:
                    raise ValueError("Capabilities exceed limit")
                result: Any = {
                    "protocolVersion": params.protocolVersion,
                    "capabilities": {"tools": {"listChanged": False}},
                    "serverInfo": {"name": "pernova-controlled-mcp", "version": "1.0.0"},
                    "instructions": "Synthetic read-only data. Agent context is server-resolved.",
                }
            elif request.method == "tools/list":
                EmptyArgs.model_validate(request.params)
                result = {
                    "tools": [
                        {
                            "name": name,
                            "description": f"Read-only synthetic {name.replace('_', ' ')}",
                            "inputSchema": SCHEMAS[name].model_json_schema(),
                            "annotations": {"readOnlyHint": True, "destructiveHint": False},
                        }
                        for name in sorted(self.allowed(caller))
                        if name not in self.engine.store.policy().blocked_tools
                    ]
                }
            elif request.method == "tools/call":
                params_call = CallParams.model_validate(request.params)
                if params_call.name not in self.allowed(caller):
                    return self.error(request.id, -32003, "Tool not authorized", correlation)
                args = SCHEMAS[params_call.name].model_validate(params_call.arguments)
                denial = self.reserve(caller, params_call.name)
                if denial:
                    return self.error(request.id, -32003, denial, correlation)
                with self.engine.telemetry.tracer.start_as_current_span(
                    f"mcp.{params_call.name}",
                    attributes={
                        "caller.context": caller.agent_id or "read-only-operator",
                        "data.synthetic": True,
                    },
                ):
                    value = self.call(params_call.name, args, caller)
                self.failures[caller.subject] = 0
                result = {
                    "content": [{"type": "text", "text": json.dumps(value)}],
                    "isError": False,
                }
            else:
                return (
                    None
                    if notification
                    else self.error(
                        request.id,
                        -32601,
                        "Method not found",
                        correlation,
                    )
                )
        except (ValidationError, ValueError):
            self.failures[caller.subject] += 1
            return (
                None
                if notification
                else self.error(
                    request.id,
                    -32602,
                    "Invalid method parameters",
                    correlation,
                )
            )
        return None if notification else {"jsonrpc": "2.0", "id": request.id, "result": result}

    def reserve(self, caller: Caller, tool: str) -> str | None:
        policy = self.engine.store.policy()
        if self.engine.store.agent("supervisor").status != "active":
            return "Supervisor suspended"
        if tool in policy.blocked_tools:
            return "Tool blocked by policy"
        if self.failures[caller.subject] >= 3:
            return "MCP circuit breaker open"
        if caller.agent_id and self.engine.store.agent(caller.agent_id).status != "active":
            return "Agent suspended"
        timestamp = time.monotonic()
        queue = self.rates[caller.subject]
        while queue and queue[0] <= timestamp - 30:
            queue.popleft()
        if not queue:
            self.usage[caller.subject] = (0, 0, 0)
        tokens, cost, calls = self.usage.get(caller.subject, (0, 0, 0))
        if len(queue) >= 10 or calls + 1 > policy.max_tool_calls:
            return "MCP tool rate limit exceeded"
        if tokens + 80 > policy.max_tokens or round(cost + 0.005, 6) > policy.max_cost_eur:
            return "MCP usage budget exceeded"
        queue.append(timestamp)
        self.usage[caller.subject] = (tokens + 80, round(cost + 0.005, 6), calls + 1)
        return None

    def call(self, tool: str, args: Model, caller: Caller) -> Any:
        values = args.model_dump()
        if tool == "search_knowledge":
            return {
                "items": [
                    doc.model_dump()
                    for doc in search(
                        values["query"],
                        caller.agent_id or "operator",
                    )
                ]
            }
        if tool == "get_inventory":
            return {
                "country": values["country"],
                "quantity": STOCK[values["country"]],
                "safety_floor": 2000,
                "synthetic": True,
                "inventory_scope": "fixture-baseline",
            }
        if tool == "get_shipment":
            return {
                "shipment_id": values["shipment_id"],
                "quantity": 12000,
                "market": "France",
                "delay_days": 7,
                "synthetic": True,
            }
        if tool == "get_demand":
            return {
                "market": "France",
                "promotion": 8500,
                "priority": 2000,
                "standard": 1500,
                "synthetic": True,
            }
        return {
            "source_country": values["source_country"],
            "destination_country": "France",
            "quantity": values["quantity"],
            "delay_days": 2,
            "cost_eur": round(values["quantity"] * 4.625, 2),
            "synthetic": True,
        }
