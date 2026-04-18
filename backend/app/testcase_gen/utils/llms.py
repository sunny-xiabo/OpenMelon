import os
from pathlib import Path
from dotenv import load_dotenv

# 加载 .env 文件到环境变量
_env_path = Path(__file__).resolve().parents[4] / ".env"
load_dotenv(_env_path, override=True)

try:
    # Prefer AutoGen's client when available, but source config from OpenMelon settings
    from autogen_ext.models.openai import OpenAIChatCompletionClient
except Exception:
    OpenAIChatCompletionClient = None  # type: ignore
from openai import AsyncOpenAI
from app.config import settings
from typing import Any
from app.testcase_gen.utils.logger import logger

# 模型配置管理
# 优先级：统一配置 > 单独配置

OPEN_API_KEY = (getattr(settings, "API_KEY", "") or "").strip()
OPEN_API_BASE_URL = (getattr(settings, "API_BASE_URL", "") or "").strip().rstrip("/")

# 单独模型配置（通过 os.getenv 直接读取，绕过 pydantic extra=ignore）
QWEN_API_KEY = (os.getenv("QWEN_API_KEY", "") or "").strip()
QWEN_BASE_URL = (os.getenv("QWEN_BASE_URL", "") or "").strip().rstrip("/")
DEEPSEEK_API_KEY = (os.getenv("DEEPSEEK_API_KEY", "") or "").strip()
DEEPSEEK_BASE_URL = (os.getenv("DEEPSEEK_BASE_URL", "") or "").strip().rstrip("/")

# 自定义模型配置（优先级最高）
CUSTOM_API_KEY = (os.getenv("CUSTOM_API_KEY", "") or "").strip()
CUSTOM_BASE_URL = (os.getenv("CUSTOM_BASE_URL", "") or "").strip().rstrip("/")
CUSTOM_MODEL_NAME = os.getenv("CUSTOM_MODEL_NAME", "")

# 模型名称
QWEN_MODEL_NAME = os.getenv("QWEN_MODEL_NAME", "qwen-vl-max")
DEEPSEEK_MODEL_NAME = (
    os.getenv("DEEPSEEK_MODEL_NAME", "")
    or getattr(settings, "CHAT_MODEL", "")
    or "qwen-plus"
)


def get_model_config(use_vision=False):
    """
    获取模型配置

    优先级：
    1. CUSTOM_API_KEY（自定义模型，最高）
    2. QWEN_API_KEY / DEEPSEEK_API_KEY（独立配置）
    3. OPEN_API_KEY（统一配置，最低）
    """
    if CUSTOM_API_KEY:
        config = {
            "api_key": CUSTOM_API_KEY,
            "base_url": CUSTOM_BASE_URL,
            "model_name": CUSTOM_MODEL_NAME
            or ("qwen-vl-max" if use_vision else "qwen-plus"),
        }
        logger.info(
            f"使用自定义配置 - 模型: {config['model_name']}, Base URL: {config['base_url']}"
        )
        return config

    if use_vision:
        if QWEN_API_KEY:
            config = {
                "api_key": QWEN_API_KEY,
                "base_url": QWEN_BASE_URL
                or OPEN_API_BASE_URL
                or "https://dashscope.aliyuncs.com/compatible-mode/v1",
                "model_name": QWEN_MODEL_NAME,
            }
            logger.info(
                f"使用独立 Qwen 配置 - 模型: {config['model_name']}, Base URL: {config['base_url']}"
            )
            return config
    else:
        if DEEPSEEK_API_KEY:
            config = {
                "api_key": DEEPSEEK_API_KEY,
                "base_url": DEEPSEEK_BASE_URL
                or OPEN_API_BASE_URL
                or "https://api.deepseek.com/v1",
                "model_name": DEEPSEEK_MODEL_NAME,
            }
            logger.info(
                f"使用独立 DeepSeek 配置 - 模型: {config['model_name']}, Base URL: {config['base_url']}"
            )
            return config

    if OPEN_API_KEY:
        config = {
            "api_key": OPEN_API_KEY,
            "base_url": OPEN_API_BASE_URL
            or "https://dashscope.aliyuncs.com/compatible-mode/v1",
            "model_name": QWEN_MODEL_NAME if use_vision else DEEPSEEK_MODEL_NAME,
        }
        logger.info(
            f"使用统一配置 - 模型: {config['model_name']}, Base URL: {config['base_url']}"
        )
        return config

    logger.warning("未找到任何 API 配置，模型调用可能失败")
    return {
        "api_key": "no-key",
        "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "model_name": QWEN_MODEL_NAME if use_vision else DEEPSEEK_MODEL_NAME,
    }


def _create_model_client(use_vision=False):
    """
    创建模型客户端

    参数：
        use_vision: 是否创建视觉模型客户端

    返回：
        OpenAIChatCompletionClient 实例
    """
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

    # Prefer AutoGen's client, but fall back to a simple AsyncOpenAI wrapper if needed
    if OpenAIChatCompletionClient is not None:
        try:
            return OpenAIChatCompletionClient(**model_config)
        except Exception:
            pass
    # Fallback: use AsyncOpenAI client configured from OpenMelon settings
    llm = AsyncOpenAI(api_key=config["api_key"], base_url=config["base_url"])
    return llm  # type: ignore


# 创建全局模型客户端实例
model_client = _create_model_client(use_vision=True)  # Qwen视觉模型
deepseek_model_client = _create_model_client(use_vision=False)  # DeepSeek文本模型

# 导出模型名称供其他模块使用
__all__ = [
    "model_client",
    "deepseek_model_client",
    "QWEN_MODEL_NAME",
    "DEEPSEEK_MODEL_NAME",
    "get_model_config",
]
