import os

# Environment-driven defaults for the BGE reranker integration
RERANKER_MODEL_NAME = os.getenv("RERANKER_MODEL_NAME", "BAAI/bge-reranker-v2-m3")
RERANKER_DEVICE = os.getenv("RERANKER_DEVICE", "cpu")
USE_RERANKER = os.getenv("USE_RERANKER", "true").lower() in ("1", "true", "yes", "on")
