import os
from autogen_ext.models.openai import OpenAIChatCompletionClient

# 从环境变量读取API密钥，如果没有则使用默认值（不推荐，仅用于开发）
QWEN_API_KEY = os.getenv("QWEN_API_KEY", "sk-febcbe89db6d4a5382554fdb53c52bde")
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "sk-e24d15fa820f4849a50a90fc86e1a3f4")


def _setup_vllm_model_client():
    """设置模型客户端"""
    model_config = {"model": "qwen-vl-max-latest", "api_key": QWEN_API_KEY, "model_info": {
        "vision": True,
        "function_calling": True,
        "json_output": True,
        "family": "unknown",
        "multiple_system_messages": True,
        "structured_output": True
    }, "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1"}

    return OpenAIChatCompletionClient(**model_config)


def _setup_deepseek_model_client():
    """设置模型客户端"""
    model_config = {"model": "deepseek-chat", "api_key": DEEPSEEK_API_KEY, "model_info": {
        "vision": False,
        "function_calling": True,
        "json_output": True,
        "family": "unknown",
        "multiple_system_messages": True,
        "structured_output": True
    }, "base_url": "https://api.deepseek.com/v1"}

    return OpenAIChatCompletionClient(**model_config)

model_client = _setup_vllm_model_client()
deepseek_model_client = _setup_deepseek_model_client()
