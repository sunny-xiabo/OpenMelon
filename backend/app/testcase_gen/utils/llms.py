import os
from pathlib import Path
from typing import Any

from dotenv import dotenv_values, load_dotenv

try:
    from autogen_ext.models.openai import OpenAIChatCompletionClient  # noqa: E402
except Exception:
    OpenAIChatCompletionClient = None  # type: ignore

from openai import AsyncOpenAI  # noqa: E402

from app.config import settings  # noqa: E402
from app.testcase_gen.tc_llm_slot_store import tc_llm_slot_store  # noqa: E402
from app.testcase_gen.utils.logger import logger  # noqa: E402

_ENV_PATH = Path(__file__).resolve().parents[4] / ".env"
load_dotenv(_ENV_PATH, override=True)

# 跨 agent 调用累积 token 用量，供上层 ai_service 读取后传入观测服务
_token_usage_acc: list[dict[str, int]] = []


def reset_token_usage() -> None:
    """重置累积的 token 用量计数器（每次生成任务开始前调用）。"""
    _token_usage_acc.clear()


def get_token_usage() -> dict[str, int]:
    """获取当前累积的 token 用量合计值。"""
    prompt_tokens = sum(u.get("prompt_tokens", 0) for u in _token_usage_acc)
    completion_tokens = sum(u.get("completion_tokens", 0) for u in _token_usage_acc)
    return {
        "input_tokens": prompt_tokens,
        "output_tokens": completion_tokens,
        "total_tokens": prompt_tokens + completion_tokens,
    }


def _patch_client_for_usage(client: Any) -> None:
    """给模型客户端的 create_stream 打补丁，捕获每次调用的 token 用量。"""
    if not hasattr(client, "create_stream"):
        return
    _original_create_stream = client.create_stream

    async def _tracking_create_stream(*args: Any, **kwargs: Any) -> Any:
        kwargs.setdefault("include_usage", True)
        async for chunk in _original_create_stream(*args, **kwargs):
            if hasattr(chunk, "usage") and chunk.usage:
                usage = chunk.usage
                _token_usage_acc.append({
                    "prompt_tokens": int(getattr(usage, "prompt_tokens", 0) or 0),
                    "completion_tokens": int(getattr(usage, "completion_tokens", 0) or 0),
                })
            yield chunk

    client.create_stream = _tracking_create_stream


def _env_values() -> dict[str, str]:
    raw = dotenv_values(_ENV_PATH)
    return {str(key): str(value or "").strip() for key, value in raw.items() if key}


def _runtime_env(key: str, default: str = "") -> str:
    return str(_env_values().get(key, default) or "").strip()


def _main_runtime_values() -> dict[str, str]:
    return {
        "api_key": (getattr(settings, "API_KEY", "") or "").strip(),
        "base_url": (getattr(settings, "API_BASE_URL", "") or "").strip().rstrip("/"),
        "provider": (getattr(settings, "LLM_PROVIDER", "") or "").strip(),
        "chat_model": (getattr(settings, "CHAT_MODEL", "") or "").strip(),
    }


def _main_fallback_model_name(use_vision: bool) -> str:
    if use_vision:
        return _runtime_env("QWEN_MODEL_NAME", "qwen-vl-max") or "qwen-vl-max"
    deepseek_model = _runtime_env("DEEPSEEK_MODEL_NAME", "")
    return deepseek_model or _main_runtime_values()["chat_model"] or "qwen-plus"


def get_model_config(use_vision: bool = False):
    """
    获取模型配置 — 三槽位路由

    槽位路由:
    1. 读取数据库槽位配置 (text/vision/embedding)
    2. mode='global' → 使用全局 settings
    3. mode='same_as_text' → 跟文本槽
    4. mode='independent' → 使用 TC_TEXT_*/TC_VISION_* 凭证 + 数据库中的 provider/model

    向后兼容:
    - 旧 CUSTOM_*/QWEN_*/DEEPSEEK_* 字段仍可用（deprecated fallback）
    """
    main = _main_runtime_values()
    slot_key = "vision" if use_vision else "text"

    # --- 新路由: 读数据库槽位配置 ---
    try:
        slot_config = tc_llm_slot_store.get_effective_config(slot_key)
        if slot_config and slot_config.get("mode") == "independent":
            if slot_key == "text":
                api_key = (getattr(settings, "TC_TEXT_API_KEY", "") or "").strip()
                base_url = (getattr(settings, "TC_TEXT_API_BASE_URL", "") or "").strip().rstrip("/")
            else:
                api_key = (getattr(settings, "TC_VISION_API_KEY", "") or "").strip()
                base_url = (getattr(settings, "TC_VISION_API_BASE_URL", "") or "").strip().rstrip("/")

            slot_provider = slot_config.get("provider") or main["provider"]
            slot_model = slot_config.get("model") or main["chat_model"]

            config = {
                "api_key": api_key or main["api_key"],
                "base_url": base_url or main["base_url"] or "https://one-api.miotech.com/v1",
                "model_name": slot_model,
                "provider": slot_provider,
                "source": f"slot_{slot_key}",
                "source_label": f"用例生成 {slot_key} 槽位独立配置",
                "use_vision": use_vision,
            }
            logger.info("使用 %s 槽位独立配置 - 模型: %s, Base URL: %s", slot_key, config["model_name"], config["base_url"])
            return config
    except Exception as e:
        logger.warning("读取槽位配置失败，回退到兼容模式: %s", e)

    # --- 兼容回退: 旧 CUSTOM/QWEN/DEEPSEEK 优先级链 (deprecated) ---
    config = _legacy_model_config(use_vision, main)
    if config:
        return config

    # --- 全局 fallback ---
    if main["api_key"]:
        config = {
            "api_key": main["api_key"],
            "base_url": main["base_url"] or "https://dashscope.aliyuncs.com/compatible-mode/v1",
            "model_name": _main_fallback_model_name(use_vision),
            "provider": main["provider"],
            "source": "main",
            "source_label": "回退 OpenMelon 主模块配置",
            "use_vision": use_vision,
        }
        logger.info("使用统一配置 - 模型: %s, Base URL: %s", config["model_name"], config["base_url"])
        return config

    logger.warning("未找到任何 API 配置，模型调用可能失败")
    return {
        "api_key": "no-key",
        "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "model_name": _main_fallback_model_name(use_vision),
        "provider": "missing",
        "source": "missing",
        "source_label": "未配置",
        "use_vision": use_vision,
    }


def _legacy_model_config(use_vision: bool, main: dict[str, str]) -> dict | None:
    """Deprecated CUSTOM/QWEN/DEEPSEEK fallback. Will be removed in next minor version."""
    custom_api_key = _runtime_env("CUSTOM_API_KEY")
    if custom_api_key:
        logger.warning("CUSTOM_API_KEY is deprecated. Migrate to TC_TEXT_*/TC_VISION_* slot config.")
        custom_base_url = _runtime_env("CUSTOM_BASE_URL").rstrip("/")
        custom_model_name = _runtime_env("CUSTOM_MODEL_NAME")
        return {
            "api_key": custom_api_key,
            "base_url": custom_base_url or main["base_url"] or "https://one-api.miotech.com/v1",
            "model_name": custom_model_name or ("qwen-vl-max" if use_vision else "qwen-plus"),
            "provider": "custom",
            "source": "custom",
            "source_label": "testcase_gen 自定义配置 (deprecated)",
            "use_vision": use_vision,
        }

    qwen_api_key = _runtime_env("QWEN_API_KEY")
    deepseek_api_key = _runtime_env("DEEPSEEK_API_KEY")

    if use_vision and qwen_api_key:
        logger.warning("QWEN_API_KEY is deprecated. Migrate to TC_VISION_* slot config.")
        return {
            "api_key": qwen_api_key,
            "base_url": _runtime_env("QWEN_BASE_URL").rstrip("/") or main["base_url"] or "https://dashscope.aliyuncs.com/compatible-mode/v1",
            "model_name": _runtime_env("QWEN_MODEL_NAME", "qwen-vl-max") or "qwen-vl-max",
            "provider": "qwen",
            "source": "qwen",
            "source_label": "testcase_gen Qwen 独立配置 (deprecated)",
            "use_vision": use_vision,
        }

    if not use_vision and deepseek_api_key:
        logger.warning("DEEPSEEK_API_KEY is deprecated. Migrate to TC_TEXT_* slot config.")
        return {
            "api_key": deepseek_api_key,
            "base_url": _runtime_env("DEEPSEEK_BASE_URL").rstrip("/") or main["base_url"] or "https://api.deepseek.com/v1",
            "model_name": _runtime_env("DEEPSEEK_MODEL_NAME") or main["chat_model"] or "qwen-plus",
            "provider": "deepseek",
            "source": "deepseek",
            "source_label": "testcase_gen DeepSeek 独立配置 (deprecated)",
            "use_vision": use_vision,
        }

    return None


def get_embedding_config() -> dict[str, Any]:
    """获取嵌入模型配置 — 嵌入槽位路由"""
    try:
        slot_config = tc_llm_slot_store.get_effective_config("embedding")
        if slot_config and slot_config.get("mode") == "independent":
            api_key = (getattr(settings, "TC_EMBEDDING_API_KEY", "") or "").strip()
            base_url = (getattr(settings, "TC_EMBEDDING_API_BASE_URL", "") or "").strip().rstrip("/")
            dim = slot_config.get("dim") or int(getattr(settings, "TC_EMBEDDING_DIM", 0) or 0)
            model_name = slot_config.get("model") or settings.EMBEDDING_MODEL
            return {
                "mode": "independent",
                "api_key": api_key or settings.API_KEY,
                "base_url": base_url or settings.API_BASE_URL,
                "model": model_name,
                "dimension": dim or int(settings.EMBEDDING_DIM or 1024),
                "provider": slot_config.get("provider") or settings.LLM_PROVIDER,
            }
    except Exception as e:
        logger.warning("读取嵌入槽位配置失败: %s", e)
    # Global fallback
    return {
        "mode": "global",
        "api_key": settings.API_KEY,
        "base_url": settings.API_BASE_URL,
        "model": settings.EMBEDDING_MODEL,
        "dimension": int(settings.EMBEDDING_DIM or 1024),
        "provider": settings.LLM_PROVIDER,
    }


def get_model_runtime_info(use_vision: bool = False) -> dict[str, str | bool]:
    config = get_model_config(use_vision=use_vision)
    return {
        "provider": str(config.get("provider") or ""),
        "source": str(config.get("source") or ""),
        "source_label": str(config.get("source_label") or ""),
        "model_name": str(config.get("model_name") or ""),
        "base_url": str(config.get("base_url") or ""),
        "use_vision": bool(config.get("use_vision")),
    }


def get_model_display_name(use_vision: bool = False) -> str:
    info = get_model_runtime_info(use_vision=use_vision)
    return str(info["model_name"] or "未配置")


def get_testcase_llm_summary() -> dict[str, dict[str, str | bool]]:
    return {
        "vision": get_model_runtime_info(use_vision=True),
        "text": get_model_runtime_info(use_vision=False),
        "embedding": get_embedding_config(),
    }


def _create_model_client(use_vision: bool = False):
    config = get_model_config(use_vision=use_vision)
    model_config = {
        "model": config["model_name"],
        "api_key": config["api_key"],
        "base_url": config["base_url"],
        "model_info": {
            "vision": use_vision,
            "function_calling": True,
            "json_output": True,
            "family": "unknown",
            "multiple_system_messages": True,
            "structured_output": True,
        },
    }
    if OpenAIChatCompletionClient is not None:
        try:
            client = OpenAIChatCompletionClient(**model_config)
            _patch_client_for_usage(client)
            return client
        except Exception:
            pass
    return AsyncOpenAI(api_key=config["api_key"], base_url=config["base_url"])  # type: ignore


def get_model_client(use_vision: bool = False):
    return _create_model_client(use_vision=use_vision)


__all__ = [
    "get_model_client",
    "get_model_config",
    "get_embedding_config",
    "get_model_runtime_info",
    "get_model_display_name",
    "get_testcase_llm_summary",
    "get_token_usage",
    "reset_token_usage",
]
