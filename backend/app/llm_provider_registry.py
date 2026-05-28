from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.runtime_paths import LEGACY_JSON_DIR


DEFAULT_PROVIDER = "openai_compat"
CUSTOM_PROVIDER_FILE = LEGACY_JSON_DIR / "llm_providers.json"


@dataclass(frozen=True)
class LLMProviderDefaults:
    key: str
    label: str
    api_base_url: str
    chat_model: str
    embedding_model: str = ""
    embedding_dim: int = 1024
    aliases: tuple[str, ...] = ()
    supports_chat: bool = True
    supports_embedding: bool = True
    supports_default_embedding: bool = True
    recommended_chat_models: tuple[str, ...] = ()
    recommended_embedding_models: tuple[str, ...] = ()
    default_base_url_label: str = "默认 Base URL"
    is_openai_compatible: bool = True
    template_description: str = ""


BUILTIN_PROVIDER_REGISTRY: dict[str, LLMProviderDefaults] = {
    "openai_compat": LLMProviderDefaults(
        key="openai_compat",
        label="OpenAI-compatible 网关",
        api_base_url="https://api.openai.com/v1",
        chat_model="qwen-plus",
        embedding_model="text-embedding-v3",
        aliases=("openai-compatible", "openai_compatible"),
        recommended_chat_models=("qwen-plus", "qwen-plus-latest", "gpt-4o-mini", "deepseek-chat"),
        recommended_embedding_models=("text-embedding-v3", "BAAI/bge-large-zh-v1.5", "text-embedding-3-small"),
        default_base_url_label="公司统一 OpenAI-compatible 网关",
        template_description="使用公司或自建 OpenAI-compatible 网关，适合当前默认运行方式。",
    ),
    "openai": LLMProviderDefaults(
        key="openai",
        label="OpenAI 官方",
        api_base_url="https://api.openai.com/v1",
        chat_model="gpt-4o-mini",
        embedding_model="text-embedding-3-small",
        recommended_chat_models=("gpt-4o-mini", "gpt-4o", "gpt-4.1-mini"),
        recommended_embedding_models=("text-embedding-3-small", "text-embedding-3-large"),
        default_base_url_label="OpenAI 官方默认地址",
        template_description="切换到 OpenAI 官方兼容接口，保留 API_KEY 手动填写。",
    ),
    "qwen": LLMProviderDefaults(
        key="qwen",
        label="通义千问",
        api_base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
        chat_model="qwen-plus",
        embedding_model="text-embedding-v3",
        recommended_chat_models=("qwen-plus", "qwen-plus-latest", "qwen-max"),
        recommended_embedding_models=("text-embedding-v3", "text-embedding-v2"),
        default_base_url_label="DashScope OpenAI-compatible 地址",
        template_description="切换到通义千问兼容接口，并使用通义默认聊天与 Embedding 模型。",
    ),
    "deepseek": LLMProviderDefaults(
        key="deepseek",
        label="DeepSeek",
        api_base_url="https://api.deepseek.com/v1",
        chat_model="deepseek-chat",
        embedding_model="",
        supports_embedding=False,
        supports_default_embedding=False,
        recommended_chat_models=("deepseek-chat", "deepseek-coder", "deepseek-v3.2"),
        recommended_embedding_models=(),
        default_base_url_label="DeepSeek 官方默认地址",
        template_description="切换到 DeepSeek Chat。DeepSeek 不提供默认 Embedding，需要另配知识库索引模型。",
    ),
    "mimo": LLMProviderDefaults(
        key="mimo",
        label="Mimo",
        api_base_url="https://open.mimo.work/v1",
        chat_model="mimo-v2-flash",
        embedding_model="",
        supports_embedding=False,
        supports_default_embedding=False,
        recommended_chat_models=("mimo-v2-flash",),
        recommended_embedding_models=(),
        default_base_url_label="Mimo 官方默认地址",
        template_description="切换到 Mimo Chat。Mimo 不提供默认 Embedding，需要另配知识库索引模型。",
    ),
}


LLM_PROVIDER_REGISTRY: dict[str, LLMProviderDefaults] = dict(BUILTIN_PROVIDER_REGISTRY)


def _provider_aliases() -> dict[str, str]:
    return {
        alias: provider.key
        for provider in LLM_PROVIDER_REGISTRY.values()
        for alias in provider.aliases
    }


def register_provider(provider: LLMProviderDefaults, *, replace: bool = False) -> None:
    """Register a provider definition without changing env semantics."""
    if not provider.key:
        raise ValueError("provider key is required")
    if provider.key in LLM_PROVIDER_REGISTRY and not replace:
        raise ValueError(f"provider already exists: {provider.key}")
    LLM_PROVIDER_REGISTRY[provider.key] = provider


def custom_provider_file() -> Path:
    return CUSTOM_PROVIDER_FILE


def is_builtin_provider(provider: str | None) -> bool:
    key = str(provider or "").strip().lower()
    return key in BUILTIN_PROVIDER_REGISTRY


def list_custom_provider_keys() -> tuple[str, ...]:
    return tuple(key for key in LLM_PROVIDER_REGISTRY if key not in BUILTIN_PROVIDER_REGISTRY)


def _serialize_provider(provider: LLMProviderDefaults) -> dict[str, Any]:
    return {
        "key": provider.key,
        "label": provider.label,
        "api_base_url": provider.api_base_url,
        "chat_model": provider.chat_model,
        "embedding_model": provider.embedding_model,
        "embedding_dim": provider.embedding_dim,
        "aliases": list(provider.aliases),
        "supports_chat": provider.supports_chat,
        "supports_embedding": provider.supports_embedding,
        "supports_default_embedding": provider.supports_default_embedding,
        "recommended_chat_models": list(provider.recommended_chat_models),
        "recommended_embedding_models": list(provider.recommended_embedding_models),
        "default_base_url_label": provider.default_base_url_label,
        "is_openai_compatible": provider.is_openai_compatible,
        "template_description": provider.template_description,
    }


def _deserialize_provider(payload: dict[str, Any]) -> LLMProviderDefaults:
    return LLMProviderDefaults(
        key=str(payload.get("key", "")).strip().lower(),
        label=str(payload.get("label", "")).strip(),
        api_base_url=str(payload.get("api_base_url", "")).strip(),
        chat_model=str(payload.get("chat_model", "")).strip(),
        embedding_model=str(payload.get("embedding_model", "")).strip(),
        embedding_dim=int(payload.get("embedding_dim", 1024) or 1024),
        aliases=tuple(str(item).strip().lower() for item in payload.get("aliases", []) if str(item).strip()),
        supports_chat=bool(payload.get("supports_chat", True)),
        supports_embedding=bool(payload.get("supports_embedding", True)),
        supports_default_embedding=bool(payload.get("supports_default_embedding", payload.get("supports_embedding", True))),
        recommended_chat_models=tuple(
            str(item).strip() for item in payload.get("recommended_chat_models", []) if str(item).strip()
        ),
        recommended_embedding_models=tuple(
            str(item).strip() for item in payload.get("recommended_embedding_models", []) if str(item).strip()
        ),
        default_base_url_label=str(payload.get("default_base_url_label", "默认 Base URL")).strip() or "默认 Base URL",
        is_openai_compatible=bool(payload.get("is_openai_compatible", True)),
        template_description=str(payload.get("template_description", "")).strip(),
    )


def persist_custom_providers(path: Path | None = None) -> None:
    target = path or CUSTOM_PROVIDER_FILE
    target.parent.mkdir(parents=True, exist_ok=True)
    payload = [_serialize_provider(LLM_PROVIDER_REGISTRY[key]) for key in list_custom_provider_keys()]
    target.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")


def reload_custom_providers(path: Path | None = None) -> None:
    target = path or CUSTOM_PROVIDER_FILE
    for key in list(list_custom_provider_keys()):
        LLM_PROVIDER_REGISTRY.pop(key, None)
    if not target.exists():
        return
    data = json.loads(target.read_text() or "[]")
    items = data.get("items", []) if isinstance(data, dict) else data
    for item in items:
        provider = _deserialize_provider(item)
        if not provider.key or is_builtin_provider(provider.key):
            continue
        register_provider(provider, replace=True)


def upsert_custom_provider(payload: dict[str, Any], path: Path | None = None) -> LLMProviderDefaults:
    provider = _deserialize_provider(payload)
    if not provider.key:
        raise ValueError("provider key is required")
    if is_builtin_provider(provider.key):
        raise ValueError("builtin provider cannot be overwritten")
    register_provider(provider, replace=True)
    persist_custom_providers(path)
    return provider


def delete_custom_provider(provider: str, path: Path | None = None) -> None:
    key = str(provider or "").strip().lower()
    if not key:
        raise ValueError("provider key is required")
    if is_builtin_provider(key):
        raise ValueError("builtin provider cannot be deleted")
    if key not in LLM_PROVIDER_REGISTRY:
        raise KeyError(key)
    LLM_PROVIDER_REGISTRY.pop(key, None)
    persist_custom_providers(path)


def normalize_provider(provider: str | None, *, fallback: str = DEFAULT_PROVIDER) -> str:
    key = str(provider or "").strip().lower()
    if not key:
        return fallback
    normalized = _provider_aliases().get(key, key)
    return normalized if normalized in LLM_PROVIDER_REGISTRY else fallback


def is_known_provider(provider: str | None) -> bool:
    key = str(provider or "").strip().lower()
    return _provider_aliases().get(key, key) in LLM_PROVIDER_REGISTRY


def get_provider_defaults(provider: str | None) -> LLMProviderDefaults:
    return LLM_PROVIDER_REGISTRY[normalize_provider(provider)]


def list_provider_options() -> tuple[str, ...]:
    return tuple(LLM_PROVIDER_REGISTRY)


def provider_to_metadata(provider: LLMProviderDefaults) -> dict[str, object]:
    return {
        "key": provider.key,
        "scope": "builtin" if is_builtin_provider(provider.key) else "custom",
        "editable": not is_builtin_provider(provider.key),
        "label": provider.label,
        "api_base_url": provider.api_base_url,
        "chat_model": provider.chat_model,
        "embedding_model": provider.embedding_model,
        "embedding_dim": provider.embedding_dim,
        "aliases": list(provider.aliases),
        "supports_chat": provider.supports_chat,
        "supports_embedding": provider.supports_embedding,
        "supports_default_embedding": provider.supports_default_embedding,
        "recommended_chat_models": list(provider.recommended_chat_models),
        "recommended_embedding_models": list(provider.recommended_embedding_models),
        "default_base_url_label": provider.default_base_url_label,
        "is_openai_compatible": provider.is_openai_compatible,
        "template": provider_to_template(provider),
        "template_description": provider.template_description,
    }


def list_provider_metadata() -> dict[str, dict[str, object]]:
    return {key: provider_to_metadata(provider) for key, provider in LLM_PROVIDER_REGISTRY.items()}


def provider_to_template(provider: LLMProviderDefaults) -> dict[str, str | int]:
    return {
        "LLM_PROVIDER": provider.key,
        "API_BASE_URL": provider.api_base_url,
        "CHAT_MODEL": provider.chat_model,
        "EMBEDDING_MODEL": provider.embedding_model,
        "EMBEDDING_DIM": provider.embedding_dim,
    }


def get_provider_template(provider: str | None) -> dict[str, str | int]:
    return provider_to_template(get_provider_defaults(provider))


def list_provider_templates() -> dict[str, dict[str, str | int]]:
    return {key: provider_to_template(provider) for key, provider in LLM_PROVIDER_REGISTRY.items()}


reload_custom_providers()
