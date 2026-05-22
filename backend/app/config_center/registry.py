"""Editable runtime configuration registry."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from app.llm_provider_registry import list_provider_options
from app.runtime_config import apply_mode_for_key


ConfigValueType = Literal["string", "int", "float", "bool", "secret", "enum"]
ConfigApplyMode = Literal["hot", "restart"]


@dataclass(frozen=True)
class ConfigFieldMeta:
    key: str
    value_type: ConfigValueType = "string"
    sensitive: bool = False
    editable: bool = True
    restart_required: bool = True
    apply_mode: ConfigApplyMode = "restart"
    options: tuple[str, ...] = ()


CONFIG_FIELD_REGISTRY: dict[str, ConfigFieldMeta] = {
    "OPENMELON_DATA_DIR": ConfigFieldMeta("OPENMELON_DATA_DIR", editable=False),
    "NODE_TYPES_CONFIG_PATH": ConfigFieldMeta("NODE_TYPES_CONFIG_PATH", editable=False),
    "NO_PROXY": ConfigFieldMeta("NO_PROXY", editable=False),
    "no_proxy": ConfigFieldMeta("no_proxy", editable=False),
    "APP_ENV": ConfigFieldMeta("APP_ENV", editable=False),
    "DEBUG": ConfigFieldMeta("DEBUG", value_type="bool", editable=False),
    "CORS_ALLOW_ORIGINS": ConfigFieldMeta("CORS_ALLOW_ORIGINS", editable=False),
    "PROTECT_ADMIN_API": ConfigFieldMeta("PROTECT_ADMIN_API", value_type="bool", editable=False),
    "ADMIN_API_KEYS": ConfigFieldMeta("ADMIN_API_KEYS", value_type="secret", sensitive=True, editable=False),
    "ADMIN_JWT_SECRET": ConfigFieldMeta("ADMIN_JWT_SECRET", value_type="secret", sensitive=True, editable=False),
    "NEO4J_URI": ConfigFieldMeta("NEO4J_URI"),
    "NEO4J_USER": ConfigFieldMeta("NEO4J_USER"),
    "NEO4J_PASSWORD": ConfigFieldMeta("NEO4J_PASSWORD", value_type="secret", sensitive=True),
    "NEO4J_DATABASE": ConfigFieldMeta("NEO4J_DATABASE"),
    "USE_EXTERNAL_VECTOR": ConfigFieldMeta("USE_EXTERNAL_VECTOR", value_type="bool"),
    "VECTOR_PROVIDER": ConfigFieldMeta("VECTOR_PROVIDER", value_type="enum", options=("qdrant",)),
    "QDRANT_HOST": ConfigFieldMeta("QDRANT_HOST"),
    "QDRANT_PORT": ConfigFieldMeta("QDRANT_PORT", value_type="int"),
    "QDRANT_API_KEY": ConfigFieldMeta("QDRANT_API_KEY", value_type="secret", sensitive=True),
    "VECTOR_FALLBACK_TO_NEO4J": ConfigFieldMeta("VECTOR_FALLBACK_TO_NEO4J", value_type="bool"),
    "LLM_PROVIDER": ConfigFieldMeta(
        "LLM_PROVIDER",
        value_type="enum",
        options=list_provider_options(),
    ),
    "API_KEY": ConfigFieldMeta("API_KEY", value_type="secret", sensitive=True),
    "API_BASE_URL": ConfigFieldMeta("API_BASE_URL"),
    "CHAT_MODEL": ConfigFieldMeta("CHAT_MODEL"),
    "EMBEDDING_MODEL": ConfigFieldMeta("EMBEDDING_MODEL"),
    "EMBEDDING_DIM": ConfigFieldMeta("EMBEDDING_DIM", value_type="int"),
    "RETRIEVAL_TOP_K": ConfigFieldMeta("RETRIEVAL_TOP_K", value_type="int"),
    "RETRIEVAL_DEPTH": ConfigFieldMeta("RETRIEVAL_DEPTH", value_type="int"),
    "RERANKER_TOP_K": ConfigFieldMeta("RERANKER_TOP_K", value_type="int"),
    "RERANKER_SCORE_THRESHOLD": ConfigFieldMeta("RERANKER_SCORE_THRESHOLD", value_type="float"),
    "HYBRID_GRAPH_WEIGHT": ConfigFieldMeta("HYBRID_GRAPH_WEIGHT", value_type="float"),
    "HYBRID_VECTOR_WEIGHT": ConfigFieldMeta("HYBRID_VECTOR_WEIGHT", value_type="float"),
    "GENERATION_TEMPERATURE": ConfigFieldMeta("GENERATION_TEMPERATURE", value_type="float"),
    "GENERATION_MAX_TOKENS": ConfigFieldMeta("GENERATION_MAX_TOKENS", value_type="int"),
    "MAX_FILE_SIZE_MB": ConfigFieldMeta("MAX_FILE_SIZE_MB", value_type="int"),
    "EVENT_LOG_RETENTION_DAYS": ConfigFieldMeta("EVENT_LOG_RETENTION_DAYS", value_type="int"),
    "EVENT_LOG_MAX_ROWS": ConfigFieldMeta("EVENT_LOG_MAX_ROWS", value_type="int"),
    "API_EXECUTION_MAX_CONCURRENT_RUNS": ConfigFieldMeta("API_EXECUTION_MAX_CONCURRENT_RUNS", value_type="int"),
    "API_EXECUTION_QUEUE_WAIT_TIMEOUT_S": ConfigFieldMeta("API_EXECUTION_QUEUE_WAIT_TIMEOUT_S", value_type="int"),
    "API_EXECUTION_SSE_QUEUE_SIZE": ConfigFieldMeta("API_EXECUTION_SSE_QUEUE_SIZE", value_type="int"),
    "AGENTIC_MAX_STEPS": ConfigFieldMeta("AGENTIC_MAX_STEPS", value_type="int"),
    "AGENTIC_CONFIDENCE_THRESHOLD": ConfigFieldMeta("AGENTIC_CONFIDENCE_THRESHOLD", value_type="float"),
    "INTENT_CONFIDENCE_THRESHOLD": ConfigFieldMeta("INTENT_CONFIDENCE_THRESHOLD", value_type="float"),
    "USE_RERANKER": ConfigFieldMeta("USE_RERANKER", value_type="bool"),
    "RERANKER_BACKEND": ConfigFieldMeta("RERANKER_BACKEND", value_type="enum", options=("sidecar", "local", "disabled")),
    "RERANKER_URL": ConfigFieldMeta("RERANKER_URL"),
    "RERANKER_TIMEOUT_SECONDS": ConfigFieldMeta("RERANKER_TIMEOUT_SECONDS", value_type="float"),
    "RERANKER_MODEL_NAME": ConfigFieldMeta("RERANKER_MODEL_NAME"),
    "RERANKER_DEVICE": ConfigFieldMeta("RERANKER_DEVICE", value_type="enum", options=("cpu", "cuda")),
    "DINGTALK_WEBHOOK": ConfigFieldMeta("DINGTALK_WEBHOOK", value_type="secret", sensitive=True, editable=False),
    "DINGTALK_SECRET": ConfigFieldMeta("DINGTALK_SECRET", value_type="secret", sensitive=True, editable=False),
    "FEISHU_WEBHOOK": ConfigFieldMeta("FEISHU_WEBHOOK", value_type="secret", sensitive=True, editable=False),
    "FEISHU_VERIFICATION_TOKEN": ConfigFieldMeta("FEISHU_VERIFICATION_TOKEN", value_type="secret", sensitive=True, editable=False),
    "WECOM_WEBHOOK": ConfigFieldMeta("WECOM_WEBHOOK", value_type="secret", sensitive=True, editable=False),
    "WECOM_TOKEN": ConfigFieldMeta("WECOM_TOKEN", value_type="secret", sensitive=True, editable=False),
    "WECOM_ENCODING_AES_KEY": ConfigFieldMeta("WECOM_ENCODING_AES_KEY", value_type="secret", sensitive=True, editable=False),
    "WECOM_CORP_ID": ConfigFieldMeta("WECOM_CORP_ID", editable=False),
    "WECOM_AGENT_ID": ConfigFieldMeta("WECOM_AGENT_ID", editable=False),
    "CUSTOM_API_KEY": ConfigFieldMeta("CUSTOM_API_KEY", value_type="secret", sensitive=True),
    "CUSTOM_BASE_URL": ConfigFieldMeta("CUSTOM_BASE_URL"),
    "CUSTOM_MODEL_NAME": ConfigFieldMeta("CUSTOM_MODEL_NAME"),
    "QWEN_API_KEY": ConfigFieldMeta("QWEN_API_KEY", value_type="secret", sensitive=True),
    "QWEN_BASE_URL": ConfigFieldMeta("QWEN_BASE_URL"),
    "QWEN_MODEL_NAME": ConfigFieldMeta("QWEN_MODEL_NAME"),
    "DEEPSEEK_API_KEY": ConfigFieldMeta("DEEPSEEK_API_KEY", value_type="secret", sensitive=True),
    "DEEPSEEK_BASE_URL": ConfigFieldMeta("DEEPSEEK_BASE_URL"),
    "DEEPSEEK_MODEL_NAME": ConfigFieldMeta("DEEPSEEK_MODEL_NAME"),
    "RATE_LIMIT_RPM": ConfigFieldMeta("RATE_LIMIT_RPM", value_type="int"),
    "RATE_LIMIT_RPH": ConfigFieldMeta("RATE_LIMIT_RPH", value_type="int"),
    "RATE_LIMIT_ENABLED": ConfigFieldMeta("RATE_LIMIT_ENABLED", value_type="bool"),
    "RATE_LIMIT_BURST": ConfigFieldMeta("RATE_LIMIT_BURST", value_type="int"),
    "JWT_SECRET_KEY": ConfigFieldMeta("JWT_SECRET_KEY", value_type="secret", sensitive=True, editable=False),
    "JWT_EXPIRATION_HOURS": ConfigFieldMeta("JWT_EXPIRATION_HOURS", value_type="int"),
    "VALID_API_KEYS": ConfigFieldMeta("VALID_API_KEYS", value_type="secret", sensitive=True, editable=False),
}


CONFIG_FIELD_REGISTRY = {
    key: ConfigFieldMeta(
        key=meta.key,
        value_type=meta.value_type,
        sensitive=meta.sensitive,
        editable=meta.editable,
        restart_required=meta.restart_required,
        apply_mode=apply_mode_for_key(key),
        options=meta.options,
    )
    for key, meta in CONFIG_FIELD_REGISTRY.items()
}
