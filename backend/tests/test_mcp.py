import json

from backend.app.engine import Engine
from backend.app.mcp import MCP
from backend.app.models import Policy
from backend.app.security import Caller


def rpc(tool: str = "get_inventory", **arguments: object) -> dict[str, object]:
    return {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {"name": tool, "arguments": arguments},
    }


def test_mcp_budget_rate_suspend_and_tool_scope(engine: Engine) -> None:
    gateway = MCP(engine)
    operator = Caller("synthetic-operator", frozenset({"Reader"}))
    inventory = Caller("synthetic-inventory-agent", frozenset({"Agent"}), "inventory")
    for _ in range(10):
        result = gateway.handle(rpc(country="Belgium"), operator, "test-correlation")
        assert result["result"]["isError"] is False
    limited = gateway.handle(rpc(country="Belgium"), operator, "test-correlation")
    assert limited["error"]["code"] == -32003
    forbidden = gateway.handle(rpc("get_shipment"), inventory, "test-correlation")
    assert forbidden["error"]["code"] == -32003
    permitted = gateway.handle(rpc(country="Belgium"), inventory, "test-correlation")
    assert json.loads(permitted["result"]["content"][0]["text"])["quantity"] == 6500
    engine.set_agent_status("inventory", "suspended", "Test suspension")
    suspended = gateway.handle(rpc(country="Belgium"), inventory, "test-correlation")
    assert suspended["error"]["code"] == -32003


def test_mcp_cost_budget_and_no_forged_context(engine: Engine) -> None:
    engine.set_policy(Policy(max_cost_eur=0.001))
    gateway = MCP(engine)
    operator = Caller("synthetic-operator", frozenset({"Reader"}))
    blocked = gateway.handle(rpc(country="Belgium"), operator, "test-correlation")
    assert "budget" in blocked["error"]["message"]
    forged = gateway.handle(
        rpc(country="Belgium", agent_id="execution"),
        operator,
        "test-correlation",
    )
    assert forged["error"]["code"] == -32602
    write = gateway.handle(rpc("create_stock_transfer"), operator, "test-correlation")
    assert write["error"]["code"] == -32003
    assert engine.store.db.execute("SELECT COUNT(*) FROM transfers").fetchone()[0] == 0
