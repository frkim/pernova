"""Environment configuration; demo is loopback-only and connected mode fails closed."""

import json
import math
import os
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlsplit

from .fixtures import TOOLS


def csv(name: str, default: str) -> tuple[str, ...]:
    return tuple(value.strip() for value in os.getenv(name, default).split(",") if value.strip())


@dataclass(frozen=True)
class Config:
    mode: str = "demo"
    data_dir: Path = field(default_factory=lambda: Path(__file__).resolve().parents[1] / "data")
    step_delay: float = 0.8
    allowed_hosts: tuple[str, ...] = ("localhost", "127.0.0.1", "[::1]")
    allowed_origins: tuple[str, ...] = (
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    )
    jwt_issuer: str = ""
    jwt_audience: str = ""
    jwt_jwks_url: str = ""
    jwt_public_key: str = ""
    agent_clients: dict[str, str] = field(default_factory=dict)
    apim_endpoint: str = ""
    apim_scope: str = ""
    model_deployment: str = ""
    model_eur_per_token: float = 0
    azure_client_id: str | None = None

    @classmethod
    def from_env(cls) -> "Config":
        public_key_file = os.getenv("PERNOVA_JWT_PUBLIC_KEY_FILE", "")
        return cls(
            mode=os.getenv("PERNOVA_MODE", "demo"),
            data_dir=Path(
                os.getenv("PERNOVA_DATA_DIR", str(Path(__file__).resolve().parents[1] / "data"))
            ),
            step_delay=float(os.getenv("PERNOVA_STEP_DELAY_SECONDS", "0.8")),
            allowed_hosts=csv("PERNOVA_ALLOWED_HOSTS", "localhost,127.0.0.1,[::1]"),
            allowed_origins=csv(
                "PERNOVA_ALLOWED_ORIGINS",
                "http://localhost:5173,http://127.0.0.1:5173,"
                "http://localhost:8000,http://127.0.0.1:8000",
            ),
            jwt_issuer=os.getenv("PERNOVA_JWT_ISSUER", ""),
            jwt_audience=os.getenv("PERNOVA_JWT_AUDIENCE", ""),
            jwt_jwks_url=os.getenv("PERNOVA_JWT_JWKS_URL", ""),
            jwt_public_key=Path(public_key_file).read_text() if public_key_file else "",
            agent_clients=json.loads(os.getenv("PERNOVA_AGENT_CLIENTS_JSON", "{}")),
            apim_endpoint=os.getenv("PERNOVA_APIM_RESPONSES_ENDPOINT", ""),
            apim_scope=os.getenv("PERNOVA_APIM_SCOPE", ""),
            model_deployment=os.getenv("PERNOVA_MODEL_DEPLOYMENT", ""),
            model_eur_per_token=float(os.getenv("PERNOVA_MODEL_EUR_PER_TOKEN", "0")),
            azure_client_id=os.getenv("AZURE_CLIENT_ID"),
        )

    def validate(self) -> None:
        if self.mode not in {"demo", "connected"}:
            raise ValueError("PERNOVA_MODE must be demo or connected")
        if not math.isfinite(self.step_delay) or not 0 <= self.step_delay <= 3:
            raise ValueError("Step delay must be finite and between zero and three seconds")
        if not self.allowed_hosts or any(
            "*" in host or "/" in host or "@" in host for host in self.allowed_hosts
        ):
            raise ValueError("Explicit allowed hosts required")
        if self.mode == "demo":
            if not set(self.allowed_hosts) <= {"localhost", "127.0.0.1", "[::1]"}:
                raise ValueError("Demo hosts must be loopback")
        for origin in self.allowed_origins:
            parsed = urlsplit(origin)
            if parsed.username or parsed.password or parsed.query or parsed.fragment:
                raise ValueError("Invalid origin")
            if parsed.path not in {"", "/"}:
                raise ValueError("Origins cannot contain paths")
            if self.mode == "demo" and (
                parsed.hostname not in {"localhost", "127.0.0.1", "::1"}
                or parsed.scheme not in {"http", "https"}
            ):
                raise ValueError("Demo origins must be loopback")
            if self.mode == "connected" and parsed.scheme != "https":
                raise ValueError("Connected browser origins must use HTTPS")
        if self.mode == "connected":
            if not self.jwt_issuer or not self.jwt_audience:
                raise ValueError("Connected mode requires JWT issuer and audience")
            if not self.jwt_public_key and not self.jwt_jwks_url:
                raise ValueError("Connected mode requires signing keys")
            if self.jwt_jwks_url and urlsplit(self.jwt_jwks_url).scheme != "https":
                raise ValueError("JWKS must use HTTPS")
        if any(agent not in TOOLS for agent in self.agent_clients.values()):
            raise ValueError("Agent client mapping contains an unknown agent")
        if self.apim_endpoint:
            parsed = urlsplit(self.apim_endpoint)
            if (
                parsed.scheme != "https"
                or not parsed.hostname
                or parsed.hostname in {"localhost", "127.0.0.1", "::1"}
                or parsed.username
                or parsed.password
                or parsed.query
                or parsed.fragment
                or not parsed.path.endswith("/v1/")
            ):
                raise ValueError("APIM Responses endpoint must be an explicit HTTPS v1 base URL")
            if self.mode != "connected":
                raise ValueError("Real inference requires connected mode")
            if not self.azure_client_id:
                raise ValueError(
                    "Connected inference requires AZURE_CLIENT_ID for managed identity"
                )
            if (
                not self.apim_scope.endswith("/.default")
                or not self.apim_scope.startswith(("api://", "https://"))
                or self.apim_scope
                in {
                    "https://cognitiveservices.azure.com/.default",
                    "https://ai.azure.com/.default",
                }
            ):
                raise ValueError(
                    "APIM caller scope must identify the gateway, not Foundry downstream"
                )
            if not self.model_deployment or not math.isfinite(self.model_eur_per_token):
                raise ValueError("Configured deployment and finite cost rate required")
            if not 0 < self.model_eur_per_token <= 0.1:
                raise ValueError("A positive conservative EUR/token rate is required")
