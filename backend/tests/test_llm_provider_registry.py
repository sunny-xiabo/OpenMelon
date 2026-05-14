from pathlib import Path

from app.config import Settings
from app.llm_provider_registry import (
    BUILTIN_PROVIDER_REGISTRY,
    LLM_PROVIDER_REGISTRY,
    LLMProviderDefaults,
    delete_custom_provider,
    get_provider_defaults,
    get_provider_template,
    is_builtin_provider,
    is_known_provider,
    list_provider_metadata,
    list_provider_options,
    list_provider_templates,
    normalize_provider,
    reload_custom_providers,
    register_provider,
    upsert_custom_provider,
)


def _settings(**values):
    defaults = {
        "API_KEY": "",
        "API_BASE_URL": "",
        "CHAT_MODEL": "",
        "EMBEDDING_MODEL": "",
        "EMBEDDING_DIM": 1024,
    }
    defaults.update(values)
    return Settings(_env_file=None, **defaults)


def test_provider_registry_contains_current_options():
    assert list_provider_options() == ("openai_compat", "openai", "qwen", "deepseek", "mimo")


def test_provider_registry_exposes_stage_two_metadata():
    metadata = list_provider_metadata()

    assert metadata["openai_compat"]["supports_chat"] is True
    assert metadata["openai_compat"]["supports_embedding"] is True
    assert "qwen-plus" in metadata["openai_compat"]["recommended_chat_models"]
    assert "text-embedding-v3" in metadata["openai_compat"]["recommended_embedding_models"]
    assert metadata["deepseek"]["supports_embedding"] is False
    assert metadata["deepseek"]["recommended_embedding_models"] == []
    assert metadata["openai"]["scope"] == "builtin"
    assert metadata["openai"]["editable"] is False
    assert metadata["qwen"]["template"]["API_BASE_URL"] == "https://dashscope.aliyuncs.com/compatible-mode/v1"
    assert metadata["deepseek"]["template_description"]


def test_provider_templates_do_not_include_api_keys():
    templates = list_provider_templates()

    assert templates["openai_compat"]["LLM_PROVIDER"] == "openai_compat"
    assert templates["openai_compat"]["CHAT_MODEL"] == "qwen-plus"
    assert "API_KEY" not in templates["openai_compat"]
    assert get_provider_template("deepseek")["EMBEDDING_MODEL"] == ""


def test_provider_alias_normalizes_to_openai_compat():
    assert normalize_provider("openai-compatible") == "openai_compat"
    assert normalize_provider("openai_compatible") == "openai_compat"

    settings = _settings(LLM_PROVIDER="openai-compatible")

    assert settings.LLM_PROVIDER == "openai_compat"
    assert settings.API_BASE_URL == "https://one-api.miotech.com/v1"
    assert settings.CHAT_MODEL == "qwen-plus"
    assert settings.EMBEDDING_MODEL == "text-embedding-v3"


def test_provider_defaults_fill_empty_values_without_overriding_explicit_values():
    settings = _settings(
        LLM_PROVIDER="qwen",
        API_BASE_URL="https://custom.example/v1",
        CHAT_MODEL="custom-chat",
        EMBEDDING_MODEL="custom-embedding",
        EMBEDDING_DIM=1536,
    )

    assert settings.LLM_PROVIDER == "qwen"
    assert settings.API_BASE_URL == "https://custom.example/v1"
    assert settings.CHAT_MODEL == "custom-chat"
    assert settings.EMBEDDING_MODEL == "custom-embedding"
    assert settings.EMBEDDING_DIM == 1536


def test_qwen_provider_defaults_are_preserved():
    settings = _settings(LLM_PROVIDER="qwen", API_BASE_URL="", CHAT_MODEL="", EMBEDDING_MODEL="")

    assert settings.API_BASE_URL == "https://dashscope.aliyuncs.com/compatible-mode/v1"
    assert settings.CHAT_MODEL == "qwen-plus"
    assert settings.EMBEDDING_MODEL == "text-embedding-v3"
    assert settings.EMBEDDING_DIM == 1024


def test_deepseek_and_mimo_do_not_supply_default_embedding_model():
    deepseek = _settings(LLM_PROVIDER="deepseek", API_BASE_URL="", CHAT_MODEL="", EMBEDDING_MODEL="")
    mimo = _settings(LLM_PROVIDER="mimo", API_BASE_URL="", CHAT_MODEL="", EMBEDDING_MODEL="")

    assert deepseek.API_BASE_URL == "https://api.deepseek.com/v1"
    assert deepseek.CHAT_MODEL == "deepseek-chat"
    assert deepseek.EMBEDDING_MODEL == ""
    assert get_provider_defaults("deepseek").supports_default_embedding is False
    assert mimo.API_BASE_URL == "https://open.mimo.work/v1"
    assert mimo.CHAT_MODEL == "mimo-v2-flash"
    assert mimo.EMBEDDING_MODEL == ""
    assert get_provider_defaults("mimo").supports_default_embedding is False


def test_unknown_provider_keeps_stage_one_compatibility_fallback():
    assert is_known_provider("not-a-provider") is False
    assert normalize_provider("not-a-provider") == "openai_compat"

    settings = _settings(LLM_PROVIDER="not-a-provider")

    assert settings.LLM_PROVIDER == "openai_compat"
    assert settings.API_BASE_URL == "https://one-api.miotech.com/v1"


def test_registry_can_register_future_provider_without_strict_mode():
    provider = LLMProviderDefaults(
        key="future_gateway",
        label="Future Gateway",
        api_base_url="https://future.example/v1",
        chat_model="future-chat",
        embedding_model="future-embedding",
        aliases=("future-compatible",),
    )

    try:
        register_provider(provider)

        assert is_known_provider("future-compatible") is True
        assert normalize_provider("future-compatible") == "future_gateway"
        assert get_provider_template("future_gateway")["CHAT_MODEL"] == "future-chat"
    finally:
        LLM_PROVIDER_REGISTRY.pop("future_gateway", None)


def test_custom_provider_can_persist_reload_and_delete(tmp_path: Path):
    provider_file = tmp_path / "llm_providers.json"
    payload = {
        "key": "custom_gateway",
        "label": "Custom Gateway",
        "api_base_url": "https://custom.example/v1",
        "chat_model": "custom-chat",
        "embedding_model": "custom-embedding",
        "embedding_dim": 1536,
        "aliases": ["custom-openai"],
        "recommended_chat_models": ["custom-chat"],
        "recommended_embedding_models": ["custom-embedding"],
        "template_description": "custom provider",
    }

    custom_keys = [key for key in LLM_PROVIDER_REGISTRY if key not in BUILTIN_PROVIDER_REGISTRY]
    for key in custom_keys:
        LLM_PROVIDER_REGISTRY.pop(key, None)

    try:
        provider = upsert_custom_provider(payload, path=provider_file)
        assert provider.key == "custom_gateway"
        assert is_builtin_provider("custom_gateway") is False
        assert is_known_provider("custom-openai") is True
        assert provider_file.exists()

        LLM_PROVIDER_REGISTRY.pop("custom_gateway", None)
        reload_custom_providers(provider_file)
        assert normalize_provider("custom-openai") == "custom_gateway"
        assert get_provider_defaults("custom_gateway").chat_model == "custom-chat"

        delete_custom_provider("custom_gateway", path=provider_file)
        assert "custom_gateway" not in LLM_PROVIDER_REGISTRY
        assert provider_file.read_text().strip() == "[]"
    finally:
        for key in [key for key in LLM_PROVIDER_REGISTRY if key not in BUILTIN_PROVIDER_REGISTRY]:
            LLM_PROVIDER_REGISTRY.pop(key, None)
