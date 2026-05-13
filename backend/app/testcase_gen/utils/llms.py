import os
from pathlib import Path

from dotenv import dotenv_values, load_dotenv

try:
    from autogen_ext.models.openai import OpenAIChatCompletionClient  # noqa: E402
except Exception:
    OpenAIChatCompletionClient = None  # type: ignore

from openai import AsyncOpenAI  # noqa: E402

from app.config import settings  # noqa: E402
from app.testcase_gen.utils.logger import logger  # noqa: E402

_ENV_PATH = Path(__file__).resolve().parents[4] / ".env"
load_dotenv(_ENV_PATH, override=True)


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
    获取模型配置

    优先级：
    1. CUSTOM_API_KEY（自定义模型，最高）
    2. QWEN_API_KEY / DEEPSEEK_API_KEY（独立配置）
    3. 主模块统一配置（支持运行时热更新）
    """
    main = _main_runtime_values()
    custom_api_key = _runtime_env("CUSTOM_API_KEY")
    custom_base_url = _runtime_env("CUSTOM_BASE_URL").rstrip("/")
    custom_model_name = _runtime_env("CUSTOM_MODEL_NAME")

    if custom_api_key:
        config = {
            "api_key": custom_api_key,
            "base_url": custom_base_url or main["base_url"] or "https://one-api.miotech.com/v1",
            "model_name": custom_model_name or ("qwen-vl-max" if use_vision else "qwen-plus"),
            "provider": "custom",
            "source": "custom",
            "source_label": "testcase_gen 自定义配置",
            "use_vision": use_vision,
        }
        logger.info("使用自定义配置 - 模型: %s, Base URL: %s", config["model_name"], config["base_url"])
        return config

    qwen_api_key = _runtime_env("QWEN_API_KEY")
    qwen_base_url = _runtime_env("QWEN_BASE_URL").rstrip("/")
    qwen_model_name = _runtime_env("QWEN_MODEL_NAME", "qwen-vl-max") or "qwen-vl-max"
    deepseek_api_key = _runtime_env("DEEPSEEK_API_KEY")
    deepseek_base_url = _runtime_env("DEEPSEEK_BASE_URL").rstrip("/")
    deepseek_model_name = _runtime_env("DEEPSEEK_MODEL_NAME") or main["chat_model"] or "qwen-plus"

    if use_vision and qwen_api_key:
        config = {
            "api_key": qwen_api_key,
            "base_url": qwen_base_url or main["base_url"] or "https://dashscope.aliyuncs.com/compatible-mode/v1",
            "model_name": qwen_model_name,
            "provider": "qwen",
            "source": "qwen",
            "source_label": "testcase_gen Qwen 独立配置",
            "use_vision": use_vision,
        }
        logger.info("使用独立 Qwen 配置 - 模型: %s, Base URL: %s", config["model_name"], config["base_url"])
        return config

    if not use_vision and deepseek_api_key:
        config = {
            "api_key": deepseek_api_key,
            "base_url": deepseek_base_url or main["base_url"] or "https://api.deepseek.com/v1",
            "model_name": deepseek_model_name,
            "provider": "deepseek",
            "source": "deepseek",
            "source_label": "testcase_gen DeepSeek 独立配置",
            "use_vision": use_vision,
        }
        logger.info("使用独立 DeepSeek 配置 - 模型: %s, Base URL: %s", config["model_name"], config["base_url"])
        return config

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
            return OpenAIChatCompletionClient(**model_config)
        except Exception:
            pass
    return AsyncOpenAI(api_key=config["api_key"], base_url=config["base_url"])  # type: ignore


def get_model_client(use_vision: bool = False):
    return _create_model_client(use_vision=use_vision)


__all__ = [
    "get_model_client",
    "get_model_config",
    "get_model_runtime_info",
    "get_model_display_name",
    "get_testcase_llm_summary",
]
