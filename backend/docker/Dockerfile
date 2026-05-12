FROM python:3.11-slim

ARG INSTALL_RERANKER=false
ARG APP_MODULE=app.main:app
ARG APP_PORT=8000

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    git \
    zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv,sharing=locked \
    if [ "$INSTALL_RERANKER" = "true" ]; then \
        uv sync --frozen --no-dev --extra reranker --no-install-project; \
    else \
        uv sync --frozen --no-dev --no-install-project; \
    fi

COPY app/ ./app
COPY config/ ./config

EXPOSE ${APP_PORT}

ENV PYTHONUNBUFFERED=1
ENV APP_MODULE=${APP_MODULE}
ENV APP_PORT=${APP_PORT}
ENV HOME=/app
ENV UV_CACHE_DIR=/app/.cache/uv
ENV UV_LINK_MODE=copy

RUN adduser --system --group appuser && chown -R appuser:appuser /app
USER appuser

CMD ["sh", "-c", "uv run uvicorn ${APP_MODULE} --host 0.0.0.0 --port ${APP_PORT}"]

