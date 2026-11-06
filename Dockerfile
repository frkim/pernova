# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9 AS web
WORKDIR /build
COPY .npmrc ./
COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN npm --prefix frontend ci --no-audit --no-fund
COPY frontend/ ./frontend/
RUN npm --prefix frontend run build

FROM python:3.13-slim-bookworm@sha256:a5a7017efc5969e00ae2b91c8eb0631049a569652aa4ffc4501769049ae45c72
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_INDEX_URL=https://packagefeedproxy.microsoft.io/pypi/simple \
    UV_DEFAULT_INDEX=https://packagefeedproxy.microsoft.io/pypi/simple \
    UV_CACHE_DIR=/tmp/uv-cache \
    PERNOVA_DATA_DIR=/app/data
WORKDIR /app
RUN python -m pip install --no-cache-dir uv==0.11.6 \
    && groupadd --gid 10001 pernova \
    && useradd --uid 10001 --gid 10001 --no-create-home pernova \
    && mkdir /app/data \
    && chown pernova:pernova /app/data
COPY backend/ ./backend/
RUN uv sync --project backend --locked --no-dev
COPY --from=web /build/frontend/dist/ ./frontend/dist/
USER 10001:10001
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health/live', timeout=2)"]
CMD ["uv", "run", "--project", "backend", "--no-sync", "uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
