from __future__ import annotations

from pathlib import Path

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


_ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=True,
    )

    LLM_PROVIDER: str = "openai_compat"
    API_KEY: str = ""
    API_BASE_URL: str = ""
    CHAT_MODEL: str = ""
    EMBEDDING_MODEL: str = ""
    EMBEDDING_DIM: int = 1024

    NEO4J_URI: str = "neo4j://localhost:7687"
    NEO4J_USER: str = "neo4j"
    NEO4J_PASSWORD: str = "password"
    NEO4J_DATABASE: str = "neo4j"

    USE_EXTERNAL_VECTOR: bool = False
    VECTOR_PROVIDER: str = "qdrant"
    QDRANT_HOST: str = "localhost"
    QDRANT_PORT: int = 6333
    QDRANT_API_KEY: str = ""
    VECTOR_FALLBACK_TO_NEO4J: bool = True

    RETRIEVAL_TOP_K: int = 5
    RETRIEVAL_DEPTH: int = 2
    RERANKER_TOP_K: int = 5
    RERANKER_SCORE_THRESHOLD: float = 0.3

    HYBRID_GRAPH_WEIGHT: float = 0.4
    HYBRID_VECTOR_WEIGHT: float = 0.6

    GENERATION_TEMPERATURE: float = 0.3
    GENERATION_MAX_TOKENS: int = 2000

    AGENTIC_MAX_STEPS: int = 3
    AGENTIC_CONFIDENCE_THRESHOLD: float = 0.7
    INTENT_CONFIDENCE_THRESHOLD: float = 0.5

    USE_RERANKER: bool = True
    RERANKER_MODEL_NAME: str = "BAAI/bge-reranker-v2-m3"
    RERANKER_DEVICE: str = "cpu"

    DINGTALK_WEBHOOK: str = ""
    DINGTALK_SECRET: str = ""
    FEISHU_WEBHOOK: str = ""
    FEISHU_VERIFICATION_TOKEN: str = ""
    WECOM_WEBHOOK: str = ""
    WECOM_TOKEN: str = ""
    WECOM_ENCODING_AES_KEY: str = ""
    WECOM_CORP_ID: str = ""

    MAX_FILE_SIZE_MB: int = 10

    @model_validator(mode="after")
    def apply_provider_defaults(self) -> "Settings":
        provider_aliases = {
            "openai-compatible": "openai_compat",
            "openai_compatible": "openai_compat",
        }
        provider = provider_aliases.get(
            self.LLM_PROVIDER.strip().lower(), self.LLM_PROVIDER.strip().lower()
        )

        provider_defaults = {
            "openai_compat": {
                "API_BASE_URL": "https://one-api.miotech.com/v1",
                "CHAT_MODEL": "qwen-plus",
                "EMBEDDING_MODEL": "text-embedding-v3",
                "EMBEDDING_DIM": 1024,
            },
            "openai": {
                "API_BASE_URL": "https://api.openai.com/v1",
                "CHAT_MODEL": "gpt-4o-mini",
                "EMBEDDING_MODEL": "text-embedding-3-small",
                "EMBEDDING_DIM": 1024,
            },
            "qwen": {
                "API_BASE_URL": "https://dashscope.aliyuncs.com/compatible-mode/v1",
                "CHAT_MODEL": "qwen-plus",
                "EMBEDDING_MODEL": "text-embedding-v3",
                "EMBEDDING_DIM": 1024,
            },
            "deepseek": {
                "API_BASE_URL": "https://api.deepseek.com/v1",
                "CHAT_MODEL": "deepseek-chat",
                "EMBEDDING_MODEL": "",
                "EMBEDDING_DIM": 1024,
            },
            "mimo": {
                "API_BASE_URL": "https://open.mimo.work/v1",
                "CHAT_MODEL": "mimo-v2-flash",
                "EMBEDDING_MODEL": "",
                "EMBEDDING_DIM": 1024,
            },
        }

        defaults = provider_defaults.get(provider, provider_defaults["openai_compat"])
        self.LLM_PROVIDER = provider

        if not self.API_BASE_URL:
            self.API_BASE_URL = defaults["API_BASE_URL"]
        if not self.CHAT_MODEL:
            self.CHAT_MODEL = defaults["CHAT_MODEL"]
        if not self.EMBEDDING_MODEL:
            self.EMBEDDING_MODEL = defaults["EMBEDDING_MODEL"]
        if not self.EMBEDDING_DIM:
            self.EMBEDDING_DIM = defaults["EMBEDDING_DIM"]

        return self

    @property
    def VECTOR_FALLBACK_TO_NEO(self) -> bool:
        return self.VECTOR_FALLBACK_TO_NEO4J


settings = Settings()
