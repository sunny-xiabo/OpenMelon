from __future__ import annotations

from pathlib import Path

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.llm_provider_registry import get_provider_defaults, normalize_provider


_ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=True,
    )

    LLM_PROVIDER: str = "openai_compat"
    APP_ENV: str = "development"
    DEBUG: bool = False
    CORS_ALLOW_ORIGINS: str = ""
    PROTECT_ADMIN_API: bool = False
    ADMIN_API_KEYS: str = ""
    ADMIN_JWT_SECRET: str = ""
    API_KEY: str = ""
    API_BASE_URL: str = ""
    CHAT_MODEL: str = ""
    EMBEDDING_MODEL: str = ""
    EMBEDDING_DIM: int = 1024

    # Testcase Generation independent slot credentials (optional, fallback to global)
    TC_TEXT_API_KEY: str = ""
    TC_TEXT_API_BASE_URL: str = ""
    TC_VISION_API_KEY: str = ""
    TC_VISION_API_BASE_URL: str = ""
    TC_EMBEDDING_API_KEY: str = ""
    TC_EMBEDDING_API_BASE_URL: str = ""
    TC_EMBEDDING_DIM: int = 0

    NEO4J_URI: str = "bolt://localhost:7687"
    NEO4J_USER: str = "neo4j"
    NEO4J_PASSWORD: str = "password"
    NEO4J_DATABASE: str = "neo4j"

    USE_EXTERNAL_VECTOR: bool = False
    VECTOR_PROVIDER: str = "qdrant"
    QDRANT_HOST: str = "localhost"
    QDRANT_PORT: int = 6333
    QDRANT_API_KEY: str = ""
    QDRANT_ENABLE_QUANTIZATION: bool = True
    QDRANT_QUANTIZATION_TYPE: str = "scalar_int8"
    QDRANT_FORCE_RECREATE_ON_QUANTIZATION: bool = True
    VECTOR_FALLBACK_TO_NEO4J: bool = True
    NEO4J_WRITE_BATCH_SIZE: int = 500

    POSTGRES_HEALTHCHECK_ENABLED: bool = False
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_DB: str = "openmelon"
    POSTGRES_USER: str = "openmelon"
    DATABASE_URL: str = ""
    POSTGRES_POOL_MIN_SIZE: int = 1
    POSTGRES_POOL_MAX_SIZE: int = 10
    POSTGRES_POOL_TIMEOUT_S: float = 30.0

    API_EXECUTION_MAX_CONCURRENT_RUNS: int = 2
    API_EXECUTION_QUEUE_WAIT_TIMEOUT_S: int = 60
    API_EXECUTION_SSE_QUEUE_SIZE: int = 100
    API_EXECUTION_EGRESS_GUARD_ENABLED: bool = True

    RETRIEVAL_TOP_K: int = 5
    RETRIEVAL_DEPTH: int = 2
    RERANKER_TOP_K: int = 5
    RERANKER_SCORE_THRESHOLD: float = 0.3

    HYBRID_GRAPH_WEIGHT: float = 0.4
    HYBRID_VECTOR_WEIGHT: float = 0.6
    RAG_RETRIEVAL_CHANNEL_TIMEOUT_S: float = 5.0
    RAG_CACHE_ENABLED: bool = True
    RAG_RETRIEVAL_CACHE_TTL_S: int = 300
    RAG_ANSWER_CACHE_TTL_S: int = 120
    RAG_RETRIEVAL_CACHE_MAX_ENTRIES: int = 256
    RAG_ANSWER_CACHE_MAX_ENTRIES: int = 128

    GENERATION_TEMPERATURE: float = 0.3
    GENERATION_MAX_TOKENS: int = 2000

    AGENTIC_MAX_STEPS: int = 3
    AGENTIC_CONFIDENCE_THRESHOLD: float = 0.7
    INTENT_CONFIDENCE_THRESHOLD: float = 0.5

    USE_RERANKER: bool = True
    RERANKER_BACKEND: str = "local"
    RERANKER_URL: str = "http://localhost:8010"
    RERANKER_TIMEOUT_SECONDS: float = 5.0
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
    EVENT_LOG_RETENTION_DAYS: int = 90
    EVENT_LOG_MAX_ROWS: int = 50000

    REVIEW_QUALITY_THRESHOLD: float = 0.75
    REVIEW_MAX_HIGH_ISSUES: int = 1
    REVIEW_MAX_REVISION_ROUNDS: int = 2

    @model_validator(mode="after")
    def apply_provider_defaults(self) -> "Settings":
        provider = normalize_provider(self.LLM_PROVIDER)
        defaults = get_provider_defaults(provider)
        self.LLM_PROVIDER = provider
        if not self.DATABASE_URL.strip():
            raise ValueError("DATABASE_URL is required for PostgreSQL-only runtime")

        if not self.API_BASE_URL:
            self.API_BASE_URL = defaults.api_base_url
        if not self.CHAT_MODEL:
            self.CHAT_MODEL = defaults.chat_model
        if not self.EMBEDDING_MODEL:
            self.EMBEDDING_MODEL = defaults.embedding_model
        if not self.EMBEDDING_DIM:
            self.EMBEDDING_DIM = defaults.embedding_dim

        return self

    @property
    def VECTOR_FALLBACK_TO_NEO(self) -> bool:
        return self.VECTOR_FALLBACK_TO_NEO4J

    @property
    def is_production(self) -> bool:
        return self.APP_ENV.lower() in {"prod", "production"}

    @property
    def admin_api_keys(self) -> list[str]:
        return [
            key.strip()
            for key in self.ADMIN_API_KEYS.split(",")
            if key.strip()
        ]

    @property
    def cors_allow_origins(self) -> list[str]:
        if self.CORS_ALLOW_ORIGINS.strip():
            return [
                origin.strip()
                for origin in self.CORS_ALLOW_ORIGINS.split(",")
                if origin.strip()
            ]
        if self.is_production:
            return []
        return ["*"]


settings = Settings()
