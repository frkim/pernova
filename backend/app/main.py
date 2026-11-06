"""Run from repository root: python -m uvicorn backend.app.main:app --port 8000.

Default binding is uvicorn's loopback. One process owns a SQLite orchestrator
database. Connected mode requires explicit JWT and optional APIM configuration.
"""

import asyncio
import hashlib
import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated, Any

from fastapi import Depends, FastAPI, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse
from opentelemetry.context import Context
from opentelemetry.trace.propagation.tracecontext import TraceContextTextMapPropagator
from starlette.exceptions import HTTPException
from starlette.middleware.cors import CORSMiddleware

from .config import Config
from .engine import Engine
from .fixtures import TERMINAL, search
from .inference import ResponsesInference
from .mcp import MCP
from .models import (
    AgentStatusRequest,
    Bootstrap,
    DecisionRequest,
    KnowledgeResults,
    Policy,
    RescoreRequest,
    SearchRequest,
    StartRequest,
    Workflow,
    WorkflowPage,
)
from .security import BoundaryMiddleware, Caller
from .store import DomainError, Store


def require(*roles: str) -> Any:
    def check(request: Request) -> Caller:
        caller: Caller = request.state.caller
        if not caller.roles.intersection(roles) or caller.agent_id:
            raise DomainError("Caller role not authorized", 403)
        return caller

    return check


def engine(request: Request) -> Engine:
    return request.app.state.engine  # type: ignore[no-any-return]


EngineDep = Annotated[Engine, Depends(engine)]
Reader = Depends(require("Reader", "Operator", "Approver", "SecurityAdmin", "Admin"))
Operator = Depends(require("Operator", "Admin"))
Approver = Depends(require("Approver", "Admin"))
Administrator = Depends(require("SecurityAdmin", "Admin"))


def create_app(config: Config | None = None) -> FastAPI:
    settings = config or Config.from_env()
    settings.validate()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        store = Store(settings.data_dir / "pernova.sqlite3")
        service = Engine(
            store,
            settings.mode,
            settings.step_delay,
            inference=ResponsesInference(settings) if settings.apim_endpoint else None,
        )
        try:
            service.recover()
            app.state.engine = service
            app.state.mcp = MCP(service)
            yield
        finally:
            await service.close()

    app = FastAPI(
        title="Pernova governed supply-chain demo",
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/api/docs" if settings.mode == "demo" else None,
        redoc_url=None,
        openapi_url="/api/openapi.json" if settings.mode == "demo" else None,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.allowed_origins),
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
        expose_headers=["X-Correlation-ID"],
    )
    app.add_middleware(BoundaryMiddleware, config=settings)

    @app.exception_handler(DomainError)
    async def domain_error(request: Request, exc: DomainError) -> JSONResponse:
        return JSONResponse(
            {"detail": exc.detail, "correlation_id": request.state.correlation_id},
            status_code=exc.status_code,
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(
            {"detail": "Invalid request input", "correlation_id": request.state.correlation_id},
            status_code=422,
        )

    @app.exception_handler(HTTPException)
    async def http_error(request: Request, exc: HTTPException) -> JSONResponse:
        return JSONResponse(
            {
                "detail": "Resource not found" if exc.status_code == 404 else "Request not allowed",
                "correlation_id": request.state.correlation_id,
            },
            status_code=exc.status_code,
        )

    @app.get("/health/live")
    async def live() -> dict[str, str]:
        return {"status": "live"}

    @app.get("/health/ready")
    async def ready(service: EngineDep) -> dict[str, str]:
        service.store.policy()
        return {"status": "ready"}

    @app.get("/api/bootstrap", response_model=Bootstrap, dependencies=[Reader])
    async def bootstrap(service: EngineDep) -> Bootstrap:
        return service.bootstrap()

    @app.post("/api/workflows", status_code=202, response_model=Workflow, dependencies=[Operator])
    async def start(request: StartRequest, service: EngineDep, http_request: Request) -> Workflow:
        parent_context = TraceContextTextMapPropagator().extract(
            carrier=dict(http_request.headers),
            context=Context(),
        )
        return service.start(request, parent_context)

    @app.get("/api/workflows", response_model=WorkflowPage, dependencies=[Reader])
    async def history(
        service: EngineDep,
        limit: int = Query(20, ge=1, le=100),
        offset: int = Query(0, ge=0, le=100000),
    ) -> WorkflowPage:
        items, total = service.store.page(limit, offset)
        return WorkflowPage(items=items, total=total)

    @app.get("/api/workflows/{workflow_id}", response_model=Workflow, dependencies=[Reader])
    async def get_workflow(workflow_id: str, service: EngineDep) -> Workflow:
        return service.store.get(workflow_id)

    @app.get("/api/workflows/{workflow_id}/events", dependencies=[Reader])
    async def events(workflow_id: str, service: EngineDep, request: Request) -> StreamingResponse:
        service.store.get(workflow_id)

        async def snapshots() -> AsyncIterator[str]:
            last = ""
            for _ in range(240):
                if await request.is_disconnected():
                    break
                workflow = service.store.get(workflow_id)
                payload = workflow.model_dump_json()
                if payload != last:
                    yield f"event: snapshot\ndata: {payload}\n\n"
                    last = payload
                else:
                    yield ": keepalive\n\n"
                if workflow.status in TERMINAL:
                    break
                await asyncio.sleep(0.5)
            yield 'event: reconnect\ndata: {"status":"reconnect_required"}\n\n'

        return StreamingResponse(
            snapshots(), media_type="text/event-stream", headers={"X-Accel-Buffering": "no"}
        )

    @app.post(
        "/api/workflows/{workflow_id}/rescore", response_model=Workflow, dependencies=[Operator]
    )
    async def rescore(workflow_id: str, request: RescoreRequest, service: EngineDep) -> Workflow:
        return service.rescore(workflow_id, request.weights)

    @app.post(
        "/api/workflows/{workflow_id}/decision", response_model=Workflow, dependencies=[Approver]
    )
    async def decision(
        workflow_id: str, request: DecisionRequest, service: EngineDep, http_request: Request
    ) -> Workflow:
        caller: Caller = http_request.state.caller
        actor_hash = hashlib.sha256(caller.subject.encode()).hexdigest()
        return service.decision(workflow_id, request, actor_hash)

    @app.post(
        "/api/agents/{agent_id}/status", response_model=Bootstrap, dependencies=[Administrator]
    )
    async def agent_status(
        agent_id: str, request: AgentStatusRequest, service: EngineDep
    ) -> Bootstrap:
        return service.set_agent_status(agent_id, request.status, request.reason)

    @app.put("/api/policy", response_model=Bootstrap, dependencies=[Administrator])
    async def policy(request: Policy, service: EngineDep) -> Bootstrap:
        return service.set_policy(request)

    @app.post("/api/knowledge/search", response_model=KnowledgeResults, dependencies=[Reader])
    async def knowledge(request: SearchRequest) -> KnowledgeResults:
        return KnowledgeResults(items=search(request.query))

    @app.get("/api/workflows/{workflow_id}/export", dependencies=[Reader])
    async def evidence(workflow_id: str, service: EngineDep) -> Response:
        workflow = service.store.get(workflow_id)
        return Response(
            workflow.model_dump_json(indent=2),
            media_type="application/json",
            headers={"Content-Disposition": f'attachment; filename="pernova-{workflow.id}.json"'},
        )

    @app.post("/mcp")
    async def mcp(request: Request) -> Response:
        caller: Caller = request.state.caller
        if not caller.roles & {"Agent", "Reader", "Operator", "Approver", "SecurityAdmin", "Admin"}:
            raise DomainError("MCP caller not authorized", 403)
        try:
            body = await request.json()
        except (json.JSONDecodeError, UnicodeDecodeError):
            return JSONResponse(
                MCP.error(
                    None,
                    -32700,
                    "Parse error",
                    request.state.correlation_id,
                )
            )
        result = request.app.state.mcp.handle(body, caller, request.state.correlation_id)
        return Response(status_code=202) if result is None else JSONResponse(result)

    dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"

    @app.get("/{asset_path:path}", include_in_schema=False)
    async def static(asset_path: str) -> FileResponse:
        if asset_path.split("/", 1)[0] in {"api", "mcp", "health"}:
            raise DomainError("Resource not found", 404)
        candidate = (dist / asset_path).resolve()
        if not candidate.is_relative_to(dist.resolve()):
            raise DomainError("Resource not found", 404)
        if candidate.is_file():
            return FileResponse(candidate)
        if Path(asset_path).suffix:
            raise DomainError("Resource not found", 404)
        if not (dist / "index.html").is_file():
            raise DomainError("Frontend build not present; use UI port 5173", 404)
        return FileResponse(dist / "index.html")

    return app


app = create_app()
