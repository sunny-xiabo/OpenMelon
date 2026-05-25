from __future__ import annotations

from pathlib import Path
from typing import Any

from dotenv import dotenv_values

from app.config import Settings, settings

HOT_RELOAD_KEYS: tuple[str, ...] = (
    "LLM_PROVIDER",
    "API_KEY",
    "API_BASE_URL",
    "CHAT_MODEL",
    "EMBEDDING_MODEL",
    "EMBEDDING_DIM",
    "RETRIEVAL_TOP_K",
    "RETRIEVAL_DEPTH",
    "RERANKER_TOP_K",
    "RERANKER_SCORE_THRESHOLD",
    "HYBRID_GRAPH_WEIGHT",
    "HYBRID_VECTOR_WEIGHT",
    "RAG_RETRIEVAL_CHANNEL_TIMEOUT_S",
    "RAG_CACHE_ENABLED",
    "RAG_RETRIEVAL_CACHE_TTL_S",
    "RAG_ANSWER_CACHE_TTL_S",
    "RAG_RETRIEVAL_CACHE_MAX_ENTRIES",
    "RAG_ANSWER_CACHE_MAX_ENTRIES",
    "NEO4J_WRITE_BATCH_SIZE",
    "GENERATION_TEMPERATURE",
    "GENERATION_MAX_TOKENS",
    "API_EXECUTION_EGRESS_GUARD_ENABLED",
    "AGENTIC_MAX_STEPS",
    "AGENTIC_CONFIDENCE_THRESHOLD",
    "INTENT_CONFIDENCE_THRESHOLD",
    "USE_RERANKER",
    "RERANKER_BACKEND",
    "RERANKER_URL",
    "RERANKER_TIMEOUT_SECONDS",
    "RERANKER_MODEL_NAME",
    "RERANKER_DEVICE",
    "EVENT_LOG_RETENTION_DAYS",
    "EVENT_LOG_MAX_ROWS",
)


def apply_mode_for_key(key: str) -> str:
    return "hot" if key in HOT_RELOAD_KEYS else "restart"


def load_settings_snapshot(env_path: Path | None = None) -> Settings:
    if env_path is None:
        return Settings()
    values = {
        str(key): value
        for key, value in dotenv_values(env_path).items()
        if key is not None
    }
    return Settings(_env_file=None, **values)


def refresh_hot_runtime_settings(env_path: Path | None = None) -> dict[str, Any]:
    snapshot = load_settings_snapshot(env_path=env_path)
    applied: dict[str, Any] = {}
    for key in HOT_RELOAD_KEYS:
        value = getattr(snapshot, key)
        setattr(settings, key, value)
        applied[key] = value
    return applied


def current_embedding_config() -> dict[str, Any]:
    model_name = settings.EMBEDDING_MODEL or ""
    embedding_dim = int(settings.EMBEDDING_DIM or 1024)
    kwargs: dict[str, Any] = {"model": model_name}
    if embedding_dim and model_name and "text-embedding-3" in model_name:
        kwargs["dimensions"] = embedding_dim
    return {
        "provider": settings.LLM_PROVIDER,
        "model": model_name,
        "dimension": embedding_dim,
        "kwargs": kwargs,
    }


def current_chat_config() -> dict[str, Any]:
    return {
        "provider": settings.LLM_PROVIDER,
        "api_key": settings.API_KEY,
        "base_url": settings.API_BASE_URL,
        "model": settings.CHAT_MODEL,
        "temperature": settings.GENERATION_TEMPERATURE,
        "max_tokens": settings.GENERATION_MAX_TOKENS,
    }
