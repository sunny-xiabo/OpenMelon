import os
from autogen_ext.models.openai import OpenAIChatCompletionClient

# 统一使用同一 API Key 和 Base URL（如 one-api 网关）
# 使用 strip() 避免 .env 中首尾空格导致 401
OPEN_API_KEY = (os.getenv("OPEN_API_KEY") or "").strip()
OPEN_API_BASE_URL = (os.getenv("OPEN_API_BASE_URL") or "https://one-api.miotech.com/v1").strip().rstrip("/")

# 可选：若需为某模型单独指定 key，可设置对应环境变量，否则使用 OPEN_API_KEY
QWEN_API_KEY = (os.getenv("QWEN_API_KEY") or OPEN_API_KEY).strip()
DEEPSEEK_API_KEY = (os.getenv("DEEPSEEK_API_KEY") or OPEN_API_KEY).strip()

# 模型名称（统一在此维护，便于展示与配置）
QWEN_MODEL_NAME = os.getenv("QWEN_MODEL_NAME", "qwen3-vl-32b-siliconflow")
DEEPSEEK_MODEL_NAME = os.getenv("DEEPSEEK_MODEL_NAME", "deepseek-v3.2")


def _setup_vllm_model_client():
    """设置模型客户端（Qwen 多模态）"""
    model_config = {"model": QWEN_MODEL_NAME, "api_key": OPEN_API_KEY, "model_info": {
        "vision": True,
        "function_calling": True,
        "json_output": True,
        "family": "unknown",
        "multiple_system_messages": True,
        "structured_output": True
    }, "base_url": OPEN_API_BASE_URL}

    return OpenAIChatCompletionClient(**model_config)


def _setup_deepseek_model_client():
    """设置模型客户端（DeepSeek 文本）"""
    model_config = {"model": DEEPSEEK_MODEL_NAME, "api_key": OPEN_API_KEY, "model_info": {
        "vision": False,
        "function_calling": True,
        "json_output": True,
        "family": "unknown",
        "multiple_system_messages": True,
        "structured_output": True
    }, "base_url": OPEN_API_BASE_URL}

    return OpenAIChatCompletionClient(**model_config)

model_client = _setup_vllm_model_client()
deepseek_model_client = _setup_deepseek_model_client()
