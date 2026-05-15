from pathlib import Path

import pytest

from app.api.errors import InvalidRequestError, NotFoundError
from app.config import settings
from app.config_center import service
from app.testcase_gen.utils import llms as testcase_llms


EXAMPLE_TEXT = """# 1. 基础运行配置
# NEO4J 连接地址
NEO4J_URI=bolt://localhost:7687
# NEO4J 密码
NEO4J_PASSWORD=

# 2. 模型配置
# 模板示例
# API_BASE_URL=https://template.test/v1
# 主模型 API Key
API_KEY=
# 模型服务地址
API_BASE_URL=https://example.test/v1
# embedding 维度
EMBEDDING_DIM=1024

# 3. 运行时路径
# 数据目录
OPENMELON_DATA_DIR=
"""


@pytest.fixture()
def env_files(tmp_path: Path):
    example_path = tmp_path / ".env.example"
    env_path = tmp_path / ".env"
    example_path.write_text(EXAMPLE_TEXT)
    env_path.write_text(
        "\n".join(
            [
                "NEO4J_URI=bolt://db:7687",
                "NEO4J_PASSWORD=secret",
                "API_KEY=sk-test",
                "API_BASE_URL=https://current.test/v1",
                "EMBEDDING_DIM=1024",
                "",
            ]
        )
    )
    return env_path, example_path


def test_build_schema_groups_and_masks_sensitive_values(env_files):
    env_path, example_path = env_files

    groups = service.build_schema(env_path=env_path, example_path=example_path)
    fields = {field.key: field for group in groups for field in group.fields}

    assert [group.title for group in groups] == ["1. 基础运行配置", "Provider 管理", "2. 模型配置", "3. 运行时路径"]
    assert fields["NEO4J_URI"].value == "bolt://db:7687"
    assert fields["API_KEY"].value == ""
    assert fields["API_KEY"].configured is True
    assert fields["API_KEY"].sensitive is True
    assert fields["API_BASE_URL"].example_value == "https://example.test/v1"
    assert fields["OPENMELON_DATA_DIR"].editable is False
    assert fields["OPENMELON_DATA_DIR"].source == "default"
    assert fields["OPENMELON_DATA_DIR"].value == "backend/runtime"
    assert fields["OPENMELON_DATA_DIR"].configured is False
    assert fields["API_BASE_URL"].apply_mode == "hot"
    assert fields["NEO4J_URI"].apply_mode == "restart"


def test_status_summarizes_testcase_gen_llm_fallback(env_files):
    env_path, example_path = env_files

    status = service.get_status(env_path=env_path, example_path=example_path)

    assert status.testcase_gen_llm["vision"]["source"] == "main"
    assert status.testcase_gen_llm["vision"]["source_label"] == "回退 OpenMelon 主模块配置"
    assert status.testcase_gen_llm["text"]["source"] == "main"
    assert status.testcase_gen_llm["text"]["model_name"]
    assert status.testcase_gen_llm["text"]["base_url_label"] == "使用主模块 API_BASE_URL"
    assert status.llm_providers["openai_compat"]["supports_embedding"] is True
    assert status.llm_providers["deepseek"]["supports_embedding"] is False


def test_status_summarizes_testcase_gen_independent_llm(tmp_path):
    example_path = tmp_path / ".env.example"
    env_path = tmp_path / ".env"
    example_path.write_text(EXAMPLE_TEXT)
    env_path.write_text(
        "\n".join(
            [
                "API_KEY=sk-main",
                "QWEN_API_KEY=sk-qwen",
                "QWEN_MODEL_NAME=qwen-vl-max",
                "DEEPSEEK_API_KEY=sk-deepseek",
                "DEEPSEEK_MODEL_NAME=deepseek-chat",
                "",
            ]
        )
    )

    status = service.get_status(env_path=env_path, example_path=example_path)

    assert status.testcase_gen_llm["vision"]["source"] == "qwen"
    assert status.testcase_gen_llm["vision"]["model_name"] == "qwen-vl-max"
    assert status.testcase_gen_llm["vision"]["base_url_label"] == "复用主模块 API_BASE_URL"
    assert status.testcase_gen_llm["text"]["source"] == "deepseek"
    assert status.testcase_gen_llm["text"]["model_name"] == "deepseek-chat"
    assert status.testcase_gen_llm["text"]["base_url_label"] == "复用主模块 API_BASE_URL"


def test_effective_preview_merges_draft_with_provider_defaults(env_files):
    env_path, _example_path = env_files

    preview = service.build_effective_preview(
        {"LLM_PROVIDER": "qwen", "API_BASE_URL": "", "CHAT_MODEL": "", "EMBEDDING_MODEL": ""},
        env_path=env_path,
    )

    assert preview["main_llm"]["provider"] == "qwen"
    assert preview["main_llm"]["base_url"] == "https://dashscope.aliyuncs.com/compatible-mode/v1"
    assert preview["main_llm"]["base_url_source"] == "provider_default"
    assert preview["main_llm"]["chat_model"] == "qwen-plus"
    assert preview["main_llm"]["embedding_model"] == "text-embedding-v3"
    assert preview["values"]["LLM_PROVIDER"] == "qwen"
    assert preview["testcase_gen_llm"]["vision"]["provider"] == "qwen"


def test_effective_preview_keeps_testcase_gen_custom_priority(tmp_path):
    env_path = tmp_path / ".env"
    env_path.write_text(
        "\n".join(
            [
                "LLM_PROVIDER=deepseek",
                "API_BASE_URL=",
                "CHAT_MODEL=",
                "API_KEY=sk-main",
                "CUSTOM_API_KEY=sk-custom",
                "CUSTOM_MODEL_NAME=custom-chat",
                "",
            ]
        )
    )

    preview = service.build_effective_preview({}, env_path=env_path)

    assert preview["main_llm"]["provider"] == "deepseek"
    assert preview["main_llm"]["base_url"] == "https://api.deepseek.com/v1"
    assert preview["testcase_gen_llm"]["vision"]["source"] == "custom"
    assert preview["testcase_gen_llm"]["vision"]["model_name"] == "custom-chat"
    assert preview["testcase_gen_llm"]["vision"]["base_url"] == "https://api.deepseek.com/v1"


def test_save_values_updates_env_and_creates_backup(env_files, monkeypatch):
    env_path, example_path = env_files
    monkeypatch.setattr(service, "_log_config_event", lambda *args, **kwargs: None)

    result = service.save_values(
        {"API_BASE_URL": "https://new.test/v1", "EMBEDDING_DIM": "1536"},
        env_path=env_path,
        example_path=example_path,
    )

    text = env_path.read_text()
    assert "API_BASE_URL=https://new.test/v1" in text
    assert "EMBEDDING_DIM=1536" in text
    assert result["changed_keys"] == ["API_BASE_URL", "EMBEDDING_DIM"]
    assert Path(result["backup_path"]).exists()


def test_save_values_refreshes_hot_runtime_settings(env_files, monkeypatch):
    env_path, example_path = env_files
    monkeypatch.setattr(service, "_log_config_event", lambda *args, **kwargs: None)
    old_base_url = settings.API_BASE_URL

    try:
        result = service.save_values(
            {"API_BASE_URL": "https://hot-reload.test/v1"},
            env_path=env_path,
            example_path=example_path,
        )
        assert result["restart_required"] is False
        assert settings.API_BASE_URL == "https://hot-reload.test/v1"
    finally:
        settings.API_BASE_URL = old_base_url


def test_testcase_gen_runtime_uses_current_main_llm_settings(monkeypatch):
    old_api_key = settings.API_KEY
    old_base_url = settings.API_BASE_URL
    old_chat_model = settings.CHAT_MODEL
    old_provider = settings.LLM_PROVIDER
    monkeypatch.setattr(testcase_llms, "_env_values", lambda: {})

    try:
        settings.API_KEY = "sk-hot"
        settings.API_BASE_URL = "https://runtime-hot.test/v1"
        settings.CHAT_MODEL = "runtime-hot-model"
        settings.LLM_PROVIDER = "openai_compat"

        config = testcase_llms.get_model_config(use_vision=False)

        assert config["source"] == "main"
        assert config["base_url"] == "https://runtime-hot.test/v1"
        assert config["model_name"] == "runtime-hot-model"
    finally:
        settings.API_KEY = old_api_key
        settings.API_BASE_URL = old_base_url
        settings.CHAT_MODEL = old_chat_model
        settings.LLM_PROVIDER = old_provider


def test_save_values_rejects_readonly_unknown_and_missing_env(env_files):
    env_path, example_path = env_files

    with pytest.raises(InvalidRequestError) as readonly:
        service.save_values({"OPENMELON_DATA_DIR": "/tmp/openmelon"}, env_path=env_path, example_path=example_path)
    assert readonly.value.details == {"OPENMELON_DATA_DIR": "该配置项暂不允许在设置页编辑"}

    with pytest.raises(InvalidRequestError) as unknown:
        service.save_values({"UNKNOWN_KEY": "value"}, env_path=env_path, example_path=example_path)
    assert unknown.value.details == {"UNKNOWN_KEY": "未知配置项"}

    with pytest.raises(NotFoundError):
        service.save_values({"API_BASE_URL": "https://new.test/v1"}, env_path=env_path.parent / ".env.missing", example_path=example_path)


def test_validate_allows_unknown_llm_provider_and_returns_warning(env_files):
    env_path, _example_path = env_files

    errors = service.validate_values({"LLM_PROVIDER": "future_model_gateway"})
    warnings = service.validate_warnings({"LLM_PROVIDER": "future_model_gateway"}, env_path=env_path)

    assert errors == {}
    assert "LLM_PROVIDER" in warnings
    assert "openai_compat" in warnings["LLM_PROVIDER"]


def test_validate_warns_when_provider_has_no_default_embedding(env_files):
    env_path, _example_path = env_files

    warnings = service.validate_warnings(
        {"LLM_PROVIDER": "deepseek", "EMBEDDING_MODEL": ""},
        env_path=env_path,
    )

    assert "EMBEDDING_MODEL" in warnings
    assert "知识库索引" in warnings["EMBEDDING_MODEL"]


def test_validate_warns_for_missing_main_and_testcase_gen_llm_values(tmp_path):
    env_path = tmp_path / ".env"
    env_path.write_text(
        "\n".join(
            [
                "API_KEY=",
                "API_BASE_URL=https://main.test/v1",
                "CUSTOM_API_KEY=sk-custom",
                "CUSTOM_MODEL_NAME=",
                "CUSTOM_BASE_URL=",
                "QWEN_API_KEY=sk-qwen",
                "QWEN_MODEL_NAME=",
                "QWEN_BASE_URL=",
                "DEEPSEEK_API_KEY=sk-deepseek",
                "DEEPSEEK_MODEL_NAME=",
                "DEEPSEEK_BASE_URL=",
                "",
            ]
        )
    )

    warnings = service.validate_warnings({}, env_path=env_path)

    assert "API_KEY" in warnings
    for key in (
        "CUSTOM_MODEL_NAME",
        "CUSTOM_BASE_URL",
        "QWEN_MODEL_NAME",
        "QWEN_BASE_URL",
        "DEEPSEEK_MODEL_NAME",
        "DEEPSEEK_BASE_URL",
    ):
        assert key in warnings


def test_list_and_save_custom_provider(tmp_path):
    provider_file = tmp_path / "llm_providers.json"
    provider = service.save_provider(
        {
            "key": "lab_gateway",
            "label": "Lab Gateway",
            "api_base_url": "https://lab.example/v1",
            "chat_model": "lab-chat",
            "embedding_model": "lab-embedding",
            "embedding_dim": 2048,
            "aliases": ["lab-openai"],
            "recommended_chat_models": ["lab-chat"],
            "recommended_embedding_models": ["lab-embedding"],
        },
        path=provider_file,
    )

    try:
        assert provider["key"] == "lab_gateway"
        assert provider["scope"] == "custom"
        assert provider["editable"] is True
        items = service.list_providers()
        assert any(item["key"] == "lab_gateway" for item in items)
    finally:
        service.remove_provider("lab_gateway", path=provider_file)


def test_save_provider_rejects_invalid_payload():
    with pytest.raises(InvalidRequestError) as invalid:
        service.save_provider(
            {
                "key": "deepseek",
                "label": "",
                "api_base_url": "",
                "chat_model": "",
                "embedding_model": "",
                "embedding_dim": 0,
            }
        )

    assert "key" in invalid.value.details
    assert "label" in invalid.value.details
    assert "api_base_url" in invalid.value.details


def test_remove_provider_rejects_builtin():
    with pytest.raises(InvalidRequestError):
        service.remove_provider("openai")


def test_initialize_env_minimal_creates_file_without_touching_real_env(tmp_path, monkeypatch):
    env_path = tmp_path / ".env"
    example_path = tmp_path / ".env.example"
    example_path.write_text(EXAMPLE_TEXT)
    monkeypatch.setattr(service, "_log_config_event", lambda *args, **kwargs: None)

    result = service.initialize_env(
        "minimal",
        {"API_KEY": "sk-init", "NEO4J_PASSWORD": "pw"},
        env_path=env_path,
        example_path=example_path,
    )

    text = env_path.read_text()
    assert env_path.exists()
    assert "API_KEY=sk-init" in text
    assert "NEO4J_PASSWORD=pw" in text
    assert set(result["sensitive_keys"]) == {"API_KEY", "NEO4J_PASSWORD"}
