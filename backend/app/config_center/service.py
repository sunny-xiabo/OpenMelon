from __future__ import annotations

import os
import re
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import status

from app.api.errors import AppError, InvalidRequestError, NotFoundError
from app.api.logging_service import safe_log_event
from app.config import Settings
from app.config_center.registry import CONFIG_FIELD_REGISTRY, ConfigFieldMeta
from app.config_center.schemas import ConfigCenterStatus, ConfigField, ConfigGroup
from app.llm_provider_registry import (
    delete_custom_provider,
    get_provider_defaults,
    is_builtin_provider,
    is_known_provider,
    list_provider_metadata,
    normalize_provider,
    provider_to_metadata,
    upsert_custom_provider,
)
from app.runtime_config import HOT_RELOAD_KEYS, refresh_hot_runtime_settings


REPO_ROOT = Path(__file__).resolve().parents[3]
ENV_PATH = REPO_ROOT / ".env"
EXAMPLE_PATH = REPO_ROOT / ".env.example"
KEY_PATTERN = re.compile(r"^\s*#?\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$")
SECTION_PATTERN = re.compile(r"^#\s*(\d+(?:\.\d+)?)\.\s*(.+?)\s*(?:（.*)?$")
PROVIDER_KEY_PATTERN = re.compile(r"^[a-z][a-z0-9_-]*$")

# 专业命名映射表
PROFESSIONAL_TITLES = {
    "openmelon 主模块 llm": "核心推理引擎 (Core)",
    "testcase_gen 独立 llm": "测试增强智能 (TestGen)",
    "provider 管理": "供应商注册中心",
    "基本配置": "基础运行参数",
    "运行时数据": "基础运行参数",
    "general": "基础运行参数",
    "数据库": "结构化数据存储",
    "database": "结构化数据存储",
    "向量库": "知识索引引擎 (Vector)",
    "vector store": "知识索引引擎 (Vector)",
    "检索": "RAG 检索策略",
    "retrieval": "RAG 检索策略",
    "知识库": "知识资产管理",
    "视觉": "视觉智能分析 (Vision)",
    "图像": "视觉智能分析 (Vision)",
    "日志": "运行审计日志",
    "审计": "运行审计日志",
    "logs": "运行审计日志",
    "监控": "系统运行监测",
    "统计": "系统运行监测",
    "性能": "流量控制与调度",
    "限流": "流量控制与调度",
    "并发": "流量控制与调度",
    "缓存": "高性能缓存层",
    "redis": "高性能缓存层",
    "api": "接口访问网关",
    "认证": "鉴权与访问控制",
    "auth": "鉴权与访问控制",
    "意图": "语义意图识别",
    "多步推理": "Agent 推理链配置",
    "reranker": "Rerank 重排引擎",
    "webhook": "企业级通知回调",
    "消息接收": "异步消息网关",
    "生成": "推理参数控制",
    "安全": "安全合规控制",
    "security": "安全合规控制",
    "加密": "凭据与加密管理",
    "节点": "分布式节点配置",
}

# 排序权重表
GROUP_ORDER = [
    "基础", "基本", "数据目录",
    "openmelon 主模块",
    "testcase_gen",
    "provider",
    "检索", "知识", "向量",
    "生成", "推理",
    "多步推理", "意图", "reranker",
    "视觉", "图像",
    "数据库", "缓存",
    "控制", "性能", "限流",
    "认证", "auth",
    "api", "webhook", "消息",
    "日志", "监控",
    "安全", "加密",
    "节点"
]


class ConfigConflictError(AppError):
    def __init__(self, message: str, details: Any | None = None):
        super().__init__(
            code="CONFIG_CONFLICT",
            message=message,
            status_code=status.HTTP_409_CONFLICT,
            details=details,
        )


MINIMAL_ENV_KEYS = (
    "NEO4J_URI",
    "NEO4J_USER",
    "NEO4J_PASSWORD",
    "NEO4J_DATABASE",
    "USE_EXTERNAL_VECTOR",
    "VECTOR_PROVIDER",
    "QDRANT_HOST",
    "QDRANT_PORT",
    "QDRANT_API_KEY",
    "QDRANT_ENABLE_QUANTIZATION",
    "QDRANT_QUANTIZATION_TYPE",
    "QDRANT_FORCE_RECREATE_ON_QUANTIZATION",
    "VECTOR_FALLBACK_TO_NEO4J",
    "NEO4J_WRITE_BATCH_SIZE",
    "LLM_PROVIDER",
    "API_KEY",
    "API_BASE_URL",
    "CHAT_MODEL",
    "EMBEDDING_MODEL",
    "EMBEDDING_DIM",
    "RETRIEVAL_TOP_K",
    "RETRIEVAL_DEPTH",
    "HYBRID_GRAPH_WEIGHT",
    "HYBRID_VECTOR_WEIGHT",
    "RAG_RETRIEVAL_CHANNEL_TIMEOUT_S",
    "RAG_CACHE_ENABLED",
    "RAG_RETRIEVAL_CACHE_TTL_S",
    "RAG_ANSWER_CACHE_TTL_S",
    "RAG_RETRIEVAL_CACHE_MAX_ENTRIES",
    "RAG_ANSWER_CACHE_MAX_ENTRIES",
)


def get_status(env_path: Path = ENV_PATH, example_path: Path = EXAMPLE_PATH) -> ConfigCenterStatus:
    env_values = _read_env_values(env_path)
    return ConfigCenterStatus(
        env_exists=env_path.exists(),
        example_exists=example_path.exists(),
        env_path=str(env_path),
        example_path=str(example_path),
        backup_count=len(list(env_path.parent.glob(".env.bak.*"))),
        writable=(env_path.exists() and os.access(env_path, os.W_OK)) or os.access(env_path.parent, os.W_OK),
        testcase_gen_llm=_build_testcase_llm_summary(env_values),
        llm_providers=list_provider_metadata(),
    )


def build_schema(env_path: Path = ENV_PATH, example_path: Path = EXAMPLE_PATH) -> list[ConfigGroup]:
    if not example_path.exists():
        raise NotFoundError(message=".env.example 不存在，无法生成运行配置目录")
    env_values = _read_env_values(env_path)
    groups: list[ConfigGroup] = []
    current_group: ConfigGroup | None = None
    pending_comments: list[str] = []
    field_positions: dict[str, tuple[ConfigGroup, int, bool]] = {}

    for raw_line in example_path.read_text().splitlines():
        line = raw_line.rstrip()
        section = SECTION_PATTERN.match(line)
        if section:
            raw_title = f"{section.group(1)}. {section.group(2)}"
            current_group = ConfigGroup(
                title=raw_title,
                display_title=_get_professional_title(raw_title),
                fields=[]
            )
            groups.append(current_group)
            pending_comments = []
            continue
        key_match = KEY_PATTERN.match(line)
        if key_match:
            key = key_match.group(1)
            example_value = key_match.group(2).strip()
            if key in CONFIG_FIELD_REGISTRY:
                if current_group is None:
                    current_group = ConfigGroup(title="未分组", display_title="未分组", fields=[])
                    groups.append(current_group)
                is_active = not line.lstrip().startswith("#")
                previous = field_positions.get(key)
                if previous:
                    previous_group, previous_index, previous_active = previous
                    if is_active and not previous_active:
                        previous_group.fields[previous_index] = _build_field(key, example_value, pending_comments, env_values)
                        field_positions[key] = (previous_group, previous_index, is_active)
                    pending_comments = []
                    continue
                current_group.fields.append(_build_field(key, example_value, pending_comments, env_values))
                field_positions[key] = (current_group, len(current_group.fields) - 1, is_active)
            pending_comments = []
            continue
        comment = line.lstrip("#").strip() if line.strip().startswith("#") else ""
        if comment and not set(comment) <= {"=", "-", " "} and not comment.startswith("|"):
            pending_comments.append(comment)
        elif not line.strip():
            pending_comments = []

    # 包含硬编码的 Provider 管理组
    groups.append(ConfigGroup(
        title="Provider 管理",
        display_title="供应商注册中心",
        fields=[]
    ))

    # 排序逻辑
    sorted_groups = sorted(groups, key=lambda g: _get_group_weight(g.title))
    return [group for group in sorted_groups if group.fields or group.title == "Provider 管理"]


def _normalize_title(title: str) -> str:
    if not title:
        return ""
    # 剥离前缀数字和点
    clean = re.sub(r"^[0-9\.\s]+", "", title)
    # 剥离结尾“配置”
    clean = re.sub(r"配置$", "", clean)
    return clean.lower().strip()


def _get_group_weight(title: str) -> int:
    key = _normalize_title(title)
    for index, order_key in enumerate(GROUP_ORDER):
        if order_key.lower() in key:
            return index
    return 999


def _get_professional_title(title: str) -> str:
    key = _normalize_title(title)
    for match_key, prof_title in PROFESSIONAL_TITLES.items():
        if match_key in key or key in match_key:
            return prof_title
    return title


def list_values(env_path: Path = ENV_PATH, example_path: Path = EXAMPLE_PATH) -> dict[str, ConfigField]:
    fields: dict[str, ConfigField] = {}
    for group in build_schema(env_path=env_path, example_path=example_path):
        for field in group.fields:
            fields[field.key] = field
    return fields


def validate_values(values: dict[str, Any]) -> dict[str, str]:
    errors: dict[str, str] = {}
    for key, value in values.items():
        meta = CONFIG_FIELD_REGISTRY.get(key)
        if meta is None:
            errors[key] = "未知配置项"
            continue
        if not meta.editable:
            errors[key] = "该配置项暂不允许在设置页编辑"
            continue
        error = _validate_value(meta, value)
        if error:
            errors[key] = error
    return errors


def validate_warnings(values: dict[str, Any], env_path: Path = ENV_PATH) -> dict[str, str]:
    merged = _merge_env_values(values, env_path=env_path)

    warnings: dict[str, str] = {}
    provider_value = merged.get("LLM_PROVIDER", "")
    provider_key = normalize_provider(provider_value)
    provider = get_provider_defaults(provider_key)

    if provider_value and not is_known_provider(provider_value):
        warnings["LLM_PROVIDER"] = "未登记的 provider 会按 openai_compat 兼容模式运行；建议后续补充 provider registry。"

    if not provider.supports_embedding and not merged.get("EMBEDDING_MODEL"):
        warnings["EMBEDDING_MODEL"] = f"{provider.label} 不提供默认 Embedding。主模型调用可继续，知识库索引需要单独配置 EMBEDDING_MODEL。"

    if not merged.get("API_KEY"):
        warnings["API_KEY"] = "主模块 API_KEY 为空，OpenMelon 主模块 LLM 调用将不可用；testcase_gen 可用独立 Key 回退。"

    for prefix, label in (
        ("CUSTOM", "testcase_gen 统一自定义模型"),
        ("QWEN", "testcase_gen 视觉分析模型"),
        ("DEEPSEEK", "testcase_gen 文本生成/评审模型"),
    ):
        api_key = f"{prefix}_API_KEY"
        model_key = f"{prefix}_MODEL_NAME"
        base_url_key = f"{prefix}_BASE_URL"
        if not merged.get(api_key):
            continue
        if not merged.get(model_key):
            warnings[model_key] = f"{label} 已配置 Key 但模型名为空，将使用程序默认模型。"
        if not merged.get(base_url_key):
            warnings[base_url_key] = f"{label} 已配置 Key 但 Base URL 为空，将优先复用主模块 API_BASE_URL。"

    return warnings


def build_effective_preview(values: dict[str, Any], env_path: Path = ENV_PATH) -> dict[str, Any]:
    merged = _merge_env_values(values, env_path=env_path)
    main_llm = _effective_main_llm_values(merged)
    effective_values = {
        **merged,
        "LLM_PROVIDER": main_llm["provider"],
        "API_BASE_URL": main_llm["base_url"],
        "CHAT_MODEL": main_llm["chat_model"],
        "EMBEDDING_MODEL": main_llm["embedding_model"],
        "EMBEDDING_DIM": str(main_llm["embedding_dim"]),
    }
    return {
        "values": {
            key: effective_values.get(key, "")
            for key in ("LLM_PROVIDER", "API_BASE_URL", "CHAT_MODEL", "EMBEDDING_MODEL", "EMBEDDING_DIM")
        },
        "main_llm": main_llm,
        "testcase_gen_llm": _build_testcase_llm_summary(effective_values),
        "warnings": validate_warnings(values, env_path=env_path),
    }


def list_providers() -> list[dict[str, Any]]:
    items = list(list_provider_metadata().values())
    return sorted(items, key=lambda item: (item.get("scope") != "builtin", str(item.get("label") or item.get("key"))))


def save_provider(provider: dict[str, Any], path: Path | None = None) -> dict[str, Any]:
    payload = _normalize_provider_payload(provider)
    _validate_provider_payload(payload)
    saved = upsert_custom_provider(payload, path=path)
    _log_config_event("provider_registry_updated", [saved.key], [])
    return provider_to_metadata(saved)


def remove_provider(provider_key: str, path: Path | None = None) -> None:
    key = str(provider_key or "").strip().lower()
    if not key:
        raise InvalidRequestError(message="Provider key 不能为空")
    if is_builtin_provider(key):
        raise InvalidRequestError(message="内置 Provider 不允许删除", details={"key": key})
    try:
        delete_custom_provider(key, path=path)
    except KeyError as exc:
        raise NotFoundError(message="Provider 不存在") from exc
    _log_config_event("provider_registry_deleted", [key], [])


def save_values(values: dict[str, Any], env_path: Path = ENV_PATH, example_path: Path = EXAMPLE_PATH) -> dict[str, Any]:
    if not env_path.exists():
        raise NotFoundError(message=".env 不存在，请先初始化运行配置")
    errors = validate_values(values)
    if errors:
        raise InvalidRequestError(message="运行配置校验失败", details=errors)
    env_values = _read_env_values(env_path)
    changed = [key for key, value in values.items() if str(env_values.get(key, "")) != _normalize_value(value)]
    if not changed:
        return {"changed_keys": [], "sensitive_keys": [], "backup_path": "", "restart_required": True}
    backup_path = _backup_env(env_path)
    _write_env_values(env_path, values)
    sensitive = sorted(key for key in changed if CONFIG_FIELD_REGISTRY[key].sensitive)
    hot_reloaded_keys = sorted(set(changed).intersection(HOT_RELOAD_KEYS))
    if hot_reloaded_keys:
        refresh_hot_runtime_settings(env_path=env_path)
    _log_config_event("config_updated", changed, sensitive)
    return {
        "changed_keys": sorted(changed),
        "sensitive_keys": sensitive,
        "backup_path": str(backup_path),
        "restart_required": any(CONFIG_FIELD_REGISTRY[key].apply_mode != "hot" for key in changed),
    }


def initialize_env(
    mode: str,
    values: dict[str, Any],
    env_path: Path = ENV_PATH,
    example_path: Path = EXAMPLE_PATH,
) -> dict[str, Any]:
    if env_path.exists():
        raise ConfigConflictError(message=".env 已存在，不能重复初始化")
    if not example_path.exists():
        raise NotFoundError(message=".env.example 不存在，无法初始化 .env")
    allowed_keys = set(CONFIG_FIELD_REGISTRY)
    unknown = sorted(set(values) - allowed_keys)
    if unknown:
        raise InvalidRequestError(message="存在未知配置项", details={"unknown_keys": unknown})
    errors = validate_values({key: value for key, value in values.items() if key in CONFIG_FIELD_REGISTRY and CONFIG_FIELD_REGISTRY[key].editable})
    if errors:
        raise InvalidRequestError(message="运行配置校验失败", details=errors)
    if mode == "from_example":
        shutil.copyfile(example_path, env_path)
        _write_env_values(env_path, values)
        changed = sorted(values)
    else:
        env_path.write_text(_minimal_env_text(values))
        changed = sorted(set(MINIMAL_ENV_KEYS).intersection(values) | {"NEO4J_URI", "NEO4J_USER", "NEO4J_DATABASE", "LLM_PROVIDER", "API_BASE_URL", "CHAT_MODEL", "EMBEDDING_MODEL", "EMBEDDING_DIM"})
    os.chmod(env_path, 0o600)
    refresh_hot_runtime_settings(env_path=env_path)
    sensitive = sorted(key for key in changed if CONFIG_FIELD_REGISTRY.get(key, ConfigFieldMeta(key)).sensitive)
    _log_config_event("config_initialized", changed, sensitive)
    return {
        "changed_keys": changed,
        "sensitive_keys": sensitive,
        "backup_path": "",
        "restart_required": True,
    }


def _build_field(key: str, example_value: str, comments: list[str], env_values: dict[str, str]) -> ConfigField:
    meta = CONFIG_FIELD_REGISTRY[key]
    default_values = _settings_default_values()
    default_value = default_values.get(key, "")
    configured = key in env_values
    current = env_values.get(key, default_value)
    value = "" if meta.sensitive else current
    source = "env" if key in env_values else ("default" if default_value else ("example" if example_value else "missing"))
    return ConfigField(
        key=key,
        value=value,
        example_value="" if meta.sensitive else example_value,
        default_value="" if meta.sensitive else default_value,
        configured=configured,
        source=source,
        description=_clean_description(comments),
        value_type=meta.value_type,
        sensitive=meta.sensitive,
        editable=meta.editable,
        restart_required=meta.apply_mode != "hot",
        apply_mode=meta.apply_mode,
        options=list(meta.options),
    )


def _settings_default_values() -> dict[str, str]:
    defaults: dict[str, str] = {}
    for key in CONFIG_FIELD_REGISTRY:
        if key in Settings.model_fields:
            field_default = Settings.model_fields[key].default
            defaults[key] = _normalize_value(field_default)
    provider = defaults.get("LLM_PROVIDER", "openai_compat")
    provider_defaults = get_provider_defaults(provider)
    provider_values = {
        "API_BASE_URL": provider_defaults.api_base_url,
        "CHAT_MODEL": provider_defaults.chat_model,
        "EMBEDDING_MODEL": provider_defaults.embedding_model,
        "EMBEDDING_DIM": provider_defaults.embedding_dim,
    }
    for key, value in provider_values.items():
        if key in CONFIG_FIELD_REGISTRY and not defaults.get(key):
            defaults[key] = _normalize_value(value)
    defaults.setdefault("OPENMELON_DATA_DIR", "backend/runtime")
    defaults.setdefault("NODE_TYPES_CONFIG_PATH", "backend/config/node_types.json")
    return defaults


def _effective_main_llm_values(env_values: dict[str, str]) -> dict[str, str | int | bool]:
    raw_provider = env_values.get("LLM_PROVIDER", "")
    normalized_provider = normalize_provider(raw_provider)
    provider = get_provider_defaults(normalized_provider)
    base_url = env_values.get("API_BASE_URL") or provider.api_base_url
    chat_model = env_values.get("CHAT_MODEL") or provider.chat_model
    embedding_model = env_values.get("EMBEDDING_MODEL") or provider.embedding_model
    embedding_dim = env_values.get("EMBEDDING_DIM") or str(provider.embedding_dim)
    try:
        embedding_dim_value: int | str = int(embedding_dim)
    except (TypeError, ValueError):
        embedding_dim_value = str(embedding_dim)
    return {
        "provider": normalized_provider,
        "provider_input": raw_provider or normalized_provider,
        "provider_label": provider.label,
        "known_provider": is_known_provider(raw_provider or normalized_provider),
        "base_url": base_url,
        "base_url_source": "env" if env_values.get("API_BASE_URL") else "provider_default",
        "chat_model": chat_model,
        "chat_model_source": "env" if env_values.get("CHAT_MODEL") else "provider_default",
        "embedding_model": embedding_model,
        "embedding_model_source": "env" if env_values.get("EMBEDDING_MODEL") else "provider_default",
        "embedding_dim": embedding_dim_value,
        "embedding_dim_source": "env" if env_values.get("EMBEDDING_DIM") else "provider_default",
        "supports_embedding": provider.supports_embedding,
        "supports_default_embedding": provider.supports_default_embedding,
        "restart_required": True,
    }


def _build_testcase_llm_summary(env_values: dict[str, str]) -> dict[str, dict[str, str | bool]]:
    main_effective = _effective_main_llm_values(env_values)
    main_provider = str(main_effective["provider"])
    main_base_url = str(main_effective["base_url"] or "")
    main_chat_model = str(main_effective["chat_model"] or "")

    # --- 新三槽位: 优先从数据库读取 ---
    try:
        from app.testcase_gen.tc_llm_slot_store import tc_llm_slot_store

        slots = tc_llm_slot_store.get_all_slots()
        result: dict[str, dict[str, str | bool]] = {}

        # 1. 解析文本槽位
        text_slot = slots.get("text", {})
        text_mode = text_slot.get("mode", "global")
        if text_mode == "independent":
            text_model = text_slot.get("model") or main_chat_model
            tc_base_url = env_values.get("TC_TEXT_API_BASE_URL") or main_base_url
            result["text"] = _llm_summary_item(
                text_slot.get("provider") or main_provider,
                "用例生成及评审 槽位独立配置",
                "slot_text",
                text_model,
                tc_base_url,
                "使用 TC_TEXT_API_BASE_URL" if env_values.get("TC_TEXT_API_BASE_URL") else "复用主模块 API_BASE_URL",
                False,
            )
        else:
            # 兼容回退: CUSTOM / DEEPSEEK 优先级链 (deprecated)
            if env_values.get("CUSTOM_API_KEY"):
                custom_model = env_values.get("CUSTOM_MODEL_NAME") or "qwen-plus"
                custom_base_url = env_values.get("CUSTOM_BASE_URL") or main_base_url or "https://one-api.miotech.com/v1"
                custom_base_label = _base_url_label(env_values.get("CUSTOM_BASE_URL"), main_base_url, "CUSTOM_BASE_URL", "OpenAI-compatible 默认 Base URL")
                result["text"] = _llm_summary_item(
                    "custom", "testcase_gen 自定义配置 (deprecated)", "custom",
                    custom_model, custom_base_url, custom_base_label, False
                )
            elif env_values.get("DEEPSEEK_API_KEY"):
                deepseek_model = env_values.get("DEEPSEEK_MODEL_NAME") or main_chat_model or "qwen-plus"
                deepseek_base_url = env_values.get("DEEPSEEK_BASE_URL") or main_base_url or "https://api.deepseek.com/v1"
                deepseek_base_label = _base_url_label(env_values.get("DEEPSEEK_BASE_URL"), main_base_url, "DEEPSEEK_BASE_URL", "DeepSeek 默认 Base URL")
                result["text"] = _llm_summary_item(
                    "deepseek", "testcase_gen DeepSeek 独立配置 (deprecated)", "deepseek",
                    deepseek_model, deepseek_base_url, deepseek_base_label, False
                )
            else:
                result["text"] = _llm_summary_item(
                    main_provider, "回退 OpenMelon 主模块配置", "main",
                    main_chat_model, main_base_url, "使用主模块 API_BASE_URL", False,
                )

        # 2. 解析视觉槽位
        vision_slot = slots.get("vision", {})
        vision_mode = vision_slot.get("mode", "same_as_text")
        
        resolved_vision_mode = vision_mode
        if vision_mode == "same_as_text":
            resolved_vision_mode = text_mode

        if resolved_vision_mode == "independent":
            if vision_mode == "same_as_text":
                text_model = text_slot.get("model") or main_chat_model
                tc_base_url = env_values.get("TC_TEXT_API_BASE_URL") or main_base_url
                result["vision"] = _llm_summary_item(
                    text_slot.get("provider") or main_provider,
                    "跟随文本槽位配置", "slot_text", text_model,
                    tc_base_url, "跟随文本槽位 Base URL", True,
                )
            else:
                vision_model = vision_slot.get("model") or main_chat_model
                tc_base_url = env_values.get("TC_VISION_API_BASE_URL") or main_base_url
                result["vision"] = _llm_summary_item(
                    vision_slot.get("provider") or main_provider,
                    "视觉场景理解 槽位独立配置", "slot_vision", vision_model,
                    tc_base_url, "使用 TC_VISION_API_BASE_URL" if env_values.get("TC_VISION_API_BASE_URL") else "复用主模块 API_BASE_URL",
                    True,
                )
        else:
            # 兼容回退: CUSTOM / QWEN 优先级链 (deprecated)
            if env_values.get("CUSTOM_API_KEY"):
                custom_model = env_values.get("CUSTOM_MODEL_NAME") or "qwen-vl-max"
                custom_base_url = env_values.get("CUSTOM_BASE_URL") or main_base_url or "https://one-api.miotech.com/v1"
                custom_base_label = _base_url_label(env_values.get("CUSTOM_BASE_URL"), main_base_url, "CUSTOM_BASE_URL", "OpenAI-compatible 默认 Base URL")
                result["vision"] = _llm_summary_item(
                    "custom", "testcase_gen 自定义配置 (deprecated)", "custom",
                    custom_model, custom_base_url, custom_base_label, True
                )
            elif env_values.get("QWEN_API_KEY"):
                qwen_model = env_values.get("QWEN_MODEL_NAME") or "qwen-vl-max"
                qwen_base_url = env_values.get("QWEN_BASE_URL") or main_base_url or "https://dashscope.aliyuncs.com/compatible-mode/v1"
                qwen_base_label = _base_url_label(env_values.get("QWEN_BASE_URL"), main_base_url, "QWEN_BASE_URL", "DashScope 默认 Base URL")
                result["vision"] = _llm_summary_item(
                    "qwen", "testcase_gen Qwen 独立配置 (deprecated)", "qwen",
                    qwen_model, qwen_base_url, qwen_base_label, True
                )
            else:
                result["vision"] = _llm_summary_item(
                    main_provider, "回退 OpenMelon 主模块配置", "main",
                    main_chat_model, main_base_url, "使用主模块 API_BASE_URL", True,
                )

        # 3. 解析向量嵌入槽位
        emb_slot = slots.get("embedding", {})
        emb_mode = emb_slot.get("mode", "global")
        emb_model = str(main_effective.get("embedding_model") or "")
        emb_dim = main_effective.get("embedding_dim", 1024)
        if emb_mode == "independent":
            emb_model = emb_slot.get("model") or emb_model
            emb_dim = emb_slot.get("dim") or emb_dim
        result["embedding"] = {
            "mode": emb_mode,
            "model": emb_model,
            "dimension": emb_dim,
            "provider": emb_slot.get("provider") or main_provider if emb_mode == "independent" else main_provider,
            "source": "slot_embedding" if emb_mode == "independent" else "main",
            "source_label": "嵌入槽位独立配置" if emb_mode == "independent" else "跟随全局配置",
        }

        if not env_values.get("API_KEY") and not any(
            env_values.get(k) for k in ("TC_TEXT_API_KEY", "TC_VISION_API_KEY", "CUSTOM_API_KEY", "QWEN_API_KEY", "DEEPSEEK_API_KEY")
        ):
            for key in ("vision", "text"):
                result[key]["source"] = "missing"
                result[key]["source_label"] = "未配置"

        return result
    except Exception:
        pass

    # --- 兼容回退: 旧 CUSTOM/QWEN/DEEPSEEK 逻辑 ---
    qwen_model = env_values.get("QWEN_MODEL_NAME") or "qwen-vl-max"
    deepseek_model = env_values.get("DEEPSEEK_MODEL_NAME") or main_chat_model or "qwen-plus"

    if env_values.get("CUSTOM_API_KEY"):
        custom_model = env_values.get("CUSTOM_MODEL_NAME") or "qwen-plus"
        custom_base_url = env_values.get("CUSTOM_BASE_URL") or main_base_url or "https://one-api.miotech.com/v1"
        custom_base_label = _base_url_label(env_values.get("CUSTOM_BASE_URL"), main_base_url, "CUSTOM_BASE_URL", "OpenAI-compatible 默认 Base URL")
        return {
            "vision": _llm_summary_item("custom", "testcase_gen 自定义配置 (deprecated)", "custom", env_values.get("CUSTOM_MODEL_NAME") or "qwen-vl-max", custom_base_url, custom_base_label, True),
            "text": _llm_summary_item("custom", "testcase_gen 自定义配置 (deprecated)", "custom", custom_model, custom_base_url, custom_base_label, False),
        }

    vision = (
        _llm_summary_item("qwen", "testcase_gen Qwen 独立配置 (deprecated)", "qwen", qwen_model,
            env_values.get("QWEN_BASE_URL") or main_base_url or "https://dashscope.aliyuncs.com/compatible-mode/v1",
            _base_url_label(env_values.get("QWEN_BASE_URL"), main_base_url, "QWEN_BASE_URL", "DashScope 默认 Base URL"), True)
        if env_values.get("QWEN_API_KEY")
        else _llm_summary_item(main_provider, "回退 OpenMelon 主模块配置", "main", qwen_model, main_base_url, "使用主模块 API_BASE_URL", True)
    )
    text = (
        _llm_summary_item("deepseek", "testcase_gen DeepSeek 独立配置 (deprecated)", "deepseek", deepseek_model,
            env_values.get("DEEPSEEK_BASE_URL") or main_base_url or "https://api.deepseek.com/v1",
            _base_url_label(env_values.get("DEEPSEEK_BASE_URL"), main_base_url, "DEEPSEEK_BASE_URL", "DeepSeek 默认 Base URL"), False)
        if env_values.get("DEEPSEEK_API_KEY")
        else _llm_summary_item(main_provider, "回退 OpenMelon 主模块配置", "main", deepseek_model, main_base_url, "使用主模块 API_BASE_URL", False)
    )
    if not env_values.get("API_KEY") and not env_values.get("QWEN_API_KEY") and not env_values.get("DEEPSEEK_API_KEY"):
        vision["source"] = "missing"
        vision["source_label"] = "未配置"
        text["source"] = "missing"
        text["source_label"] = "未配置"
    return {"vision": vision, "text": text}


def _llm_summary_item(
    provider: str,
    source_label: str,
    source: str,
    model_name: str,
    base_url: str,
    base_url_label: str,
    use_vision: bool,
) -> dict[str, str | bool]:
    return {
        "provider": provider,
        "source": source,
        "source_label": source_label,
        "model_name": model_name,
        "base_url": base_url,
        "base_url_label": base_url_label,
        "use_vision": use_vision,
    }


def _base_url_label(explicit_base_url: str | None, main_base_url: str, explicit_label: str, default_label: str) -> str:
    if explicit_base_url:
        return f"使用 {explicit_label}"
    if main_base_url:
        return "复用主模块 API_BASE_URL"
    return f"使用{default_label}"


def _read_env_values(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    values: dict[str, str] = {}
    for line in path.read_text().splitlines():
        match = KEY_PATTERN.match(line)
        if match and not line.lstrip().startswith("#"):
            values[match.group(1)] = match.group(2).strip()
    return values


def _merge_env_values(values: dict[str, Any], env_path: Path = ENV_PATH) -> dict[str, str]:
    merged = _read_env_values(env_path)
    merged.update({key: _normalize_value(value) for key, value in values.items()})
    return merged


def _normalize_provider_payload(provider: dict[str, Any]) -> dict[str, Any]:
    return {
        "key": str(provider.get("key", "")).strip().lower(),
        "label": str(provider.get("label", "")).strip(),
        "api_base_url": str(provider.get("api_base_url", "")).strip(),
        "chat_model": str(provider.get("chat_model", "")).strip(),
        "embedding_model": str(provider.get("embedding_model", "")).strip(),
        "embedding_dim": provider.get("embedding_dim", 1024),
        "aliases": [str(item).strip().lower() for item in provider.get("aliases", []) if str(item).strip()],
        "supports_chat": bool(provider.get("supports_chat", True)),
        "supports_embedding": bool(provider.get("supports_embedding", True)),
        "supports_default_embedding": bool(provider.get("supports_default_embedding", provider.get("supports_embedding", True))),
        "recommended_chat_models": [str(item).strip() for item in provider.get("recommended_chat_models", []) if str(item).strip()],
        "recommended_embedding_models": [
            str(item).strip() for item in provider.get("recommended_embedding_models", []) if str(item).strip()
        ],
        "default_base_url_label": str(provider.get("default_base_url_label", "默认 Base URL")).strip() or "默认 Base URL",
        "is_openai_compatible": bool(provider.get("is_openai_compatible", True)),
        "template_description": str(provider.get("template_description", "")).strip(),
    }


def _validate_provider_payload(provider: dict[str, Any]) -> None:
    errors: dict[str, str] = {}
    key = str(provider.get("key", "")).strip().lower()
    if not key:
        errors["key"] = "Provider key 不能为空"
    elif not PROVIDER_KEY_PATTERN.match(key):
        errors["key"] = "Provider key 只能包含小写字母、数字、下划线或中划线，且需以字母开头"
    elif is_builtin_provider(key):
        errors["key"] = "不能覆盖内置 Provider"
    if not str(provider.get("label", "")).strip():
        errors["label"] = "Provider 名称不能为空"
    if not str(provider.get("api_base_url", "")).strip():
        errors["api_base_url"] = "Base URL 不能为空"
    if not str(provider.get("chat_model", "")).strip():
        errors["chat_model"] = "Chat 模型不能为空"
    try:
        embedding_dim = int(provider.get("embedding_dim", 1024) or 1024)
        if embedding_dim <= 0:
            errors["embedding_dim"] = "Embedding 维度必须大于 0"
        provider["embedding_dim"] = embedding_dim
    except (TypeError, ValueError):
        errors["embedding_dim"] = "Embedding 维度必须是整数"
    aliases = list(provider.get("aliases", []))
    alias_conflicts = [alias for alias in aliases if alias == key or is_builtin_provider(alias)]
    if alias_conflicts:
        errors["aliases"] = "别名不能与内置 Provider 或自身 key 冲突"
    if provider.get("supports_embedding") and not provider.get("embedding_model"):
        errors["embedding_model"] = "支持 Embedding 时需要提供默认 Embedding 模型"
    if errors:
        raise InvalidRequestError(message="Provider 配置校验失败", details=errors)


def _write_env_values(path: Path, values: dict[str, Any]) -> None:
    lines = path.read_text().splitlines()
    remaining = {key: _normalize_value(value) for key, value in values.items()}
    updated: list[str] = []
    for line in lines:
        match = KEY_PATTERN.match(line)
        if match and not line.lstrip().startswith("#") and match.group(1) in remaining:
            key = match.group(1)
            updated.append(f"{key}={remaining.pop(key)}")
        else:
            updated.append(line)
    if remaining:
        updated.append("")
        updated.append("# Added by OpenMelon config center")
        updated.extend(f"{key}={value}" for key, value in remaining.items())
    path.write_text("\n".join(updated) + "\n")
    os.chmod(path, 0o600)


def _backup_env(path: Path) -> Path:
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = path.with_name(f".env.bak.{stamp}")
    shutil.copyfile(path, backup_path)
    os.chmod(backup_path, 0o600)
    return backup_path


def _minimal_env_text(values: dict[str, Any]) -> str:
    defaults = {
        "NEO4J_URI": "bolt://localhost:7687",
        "NEO4J_USER": "neo4j",
        "NEO4J_PASSWORD": "",
        "NEO4J_DATABASE": "neo4j",
        "USE_EXTERNAL_VECTOR": "false",
        "VECTOR_PROVIDER": "qdrant",
        "QDRANT_HOST": "localhost",
        "QDRANT_PORT": "6333",
        "QDRANT_API_KEY": "",
        "QDRANT_ENABLE_QUANTIZATION": "true",
        "QDRANT_QUANTIZATION_TYPE": "scalar_int8",
        "QDRANT_FORCE_RECREATE_ON_QUANTIZATION": "true",
        "VECTOR_FALLBACK_TO_NEO4J": "true",
        "NEO4J_WRITE_BATCH_SIZE": "500",
        "LLM_PROVIDER": "openai_compat",
        "API_KEY": "",
        "API_BASE_URL": "",
        "CHAT_MODEL": "qwen-plus",
        "EMBEDDING_MODEL": "text-embedding-v3",
        "EMBEDDING_DIM": "1024",
        "RETRIEVAL_TOP_K": "5",
        "RETRIEVAL_DEPTH": "2",
        "HYBRID_GRAPH_WEIGHT": "0.4",
        "HYBRID_VECTOR_WEIGHT": "0.6",
        "RAG_RETRIEVAL_CHANNEL_TIMEOUT_S": "5.0",
        "RAG_CACHE_ENABLED": "true",
        "RAG_RETRIEVAL_CACHE_TTL_S": "300",
        "RAG_ANSWER_CACHE_TTL_S": "120",
        "RAG_RETRIEVAL_CACHE_MAX_ENTRIES": "256",
        "RAG_ANSWER_CACHE_MAX_ENTRIES": "128",
    }
    merged = {**defaults, **{key: _normalize_value(value) for key, value in values.items() if key in MINIMAL_ENV_KEYS}}
    return "\n".join([
        "# OpenMelon minimal runtime config",
        *[f"{key}={merged[key]}" for key in MINIMAL_ENV_KEYS],
        "",
    ])


def _normalize_value(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value or "").strip()


def _validate_value(meta: ConfigFieldMeta, value: Any) -> str:
    text = _normalize_value(value)
    if text == "":
        return ""
    if meta.value_type == "int":
        try:
            int(text)
        except ValueError:
            return "必须是整数"
    elif meta.value_type == "float":
        try:
            float(text)
        except ValueError:
            return "必须是数字"
    elif meta.value_type == "bool" and text.lower() not in {"true", "false", "1", "0", "yes", "no", "on", "off"}:
        return "必须是布尔值"
    elif meta.value_type == "enum" and meta.options and text and text not in meta.options and meta.key != "LLM_PROVIDER":
        return f"只能是: {', '.join(meta.options)}"
    return ""


def _clean_description(comments: list[str]) -> str:
    useful = [
        comment
        for comment in comments[-3:]
        if not comment.startswith("默认:")
        and not comment.startswith("示例:")
        and not comment.startswith("可选值:")
        and not comment.startswith("---")
    ]
    return " ".join(useful).strip()


def _log_config_event(event_type: str, changed_keys: list[str], sensitive_keys: list[str]) -> None:
    safe_log_event(
        "warning",
        "system",
        event_type,
        "运行配置已更新" if event_type == "config_updated" else "运行配置已初始化",
        "配置变更已写入 .env，重启后生效",
        source_id="config_center",
        refs=["config_center"],
        data={"changed_keys": changed_keys, "sensitive_keys": sensitive_keys, "restart_required": True},
    )
