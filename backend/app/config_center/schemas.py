from typing import Any, Literal

from pydantic import BaseModel, Field


class ConfigCenterStatus(BaseModel):
    env_exists: bool
    example_exists: bool
    env_path: str
    example_path: str
    backup_count: int = 0
    writable: bool = False
    testcase_gen_llm: dict[str, Any] = Field(default_factory=dict)
    llm_providers: dict[str, Any] = Field(default_factory=dict)


class ConfigField(BaseModel):
    key: str
    value: str = ""
    example_value: str = ""
    default_value: str = ""
    configured: bool = False
    source: Literal["env", "example", "default", "missing"] = "missing"
    description: str = ""
    value_type: str = "string"
    sensitive: bool = False
    editable: bool = True
    restart_required: bool = True
    apply_mode: Literal["hot", "restart"] = "restart"
    options: list[str] = Field(default_factory=list)


class ConfigGroup(BaseModel):
    title: str
    display_title: str = ""
    fields: list[ConfigField] = Field(default_factory=list)


class ConfigSchemaResponse(BaseModel):
    status: ConfigCenterStatus
    groups: list[ConfigGroup] = Field(default_factory=list)


class ConfigValuesResponse(BaseModel):
    status: ConfigCenterStatus
    values: dict[str, ConfigField] = Field(default_factory=dict)


class ConfigSaveRequest(BaseModel):
    values: dict[str, Any] = Field(default_factory=dict)


class ConfigSaveResponse(BaseModel):
    changed_keys: list[str] = Field(default_factory=list)
    sensitive_keys: list[str] = Field(default_factory=list)
    backup_path: str = ""
    restart_required: bool = True


class ConfigInitializeRequest(BaseModel):
    mode: Literal["from_example", "minimal"] = "from_example"
    values: dict[str, Any] = Field(default_factory=dict)


class ConfigValidateResponse(BaseModel):
    valid: bool = True
    errors: dict[str, str] = Field(default_factory=dict)
    warnings: dict[str, str] = Field(default_factory=dict)


class ConfigPreviewResponse(BaseModel):
    values: dict[str, Any] = Field(default_factory=dict)
    main_llm: dict[str, Any] = Field(default_factory=dict)
    testcase_gen_llm: dict[str, Any] = Field(default_factory=dict)
    warnings: dict[str, str] = Field(default_factory=dict)


class ProviderConfigRequest(BaseModel):
    key: str
    label: str
    api_base_url: str
    chat_model: str
    embedding_model: str = ""
    embedding_dim: int = 1024
    aliases: list[str] = Field(default_factory=list)
    supports_chat: bool = True
    supports_embedding: bool = True
    supports_default_embedding: bool = True
    recommended_chat_models: list[str] = Field(default_factory=list)
    recommended_embedding_models: list[str] = Field(default_factory=list)
    default_base_url_label: str = "默认 Base URL"
    is_openai_compatible: bool = True
    template_description: str = ""


class ProviderConfigResponse(BaseModel):
    provider: dict[str, Any] = Field(default_factory=dict)


class ProviderListResponse(BaseModel):
    items: list[dict[str, Any]] = Field(default_factory=list)
