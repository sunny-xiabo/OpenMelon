from __future__ import annotations

from typing import List, Tuple
from app.config import settings


class Reranker:
    """Singleton BGE reranker wrapper with lazy model loading.

    - Lazy-loads the underlying model on first use.
    - If loading fails, falls back to a no-op scorer returning 0.0 scores.
    - Exposes a simple interface compatible with the project retrieval flow.
    """

    _instance = None  # type: ignore

    def __new__(cls, *args, **kwargs):  # type: ignore
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):  # pragma: no cover
        # Ensure idempotent init for singleton
        if getattr(self, "_initialized", False):
            return
        self.model = None  # type: ignore
        self._initialized = True

    def _load_model(self):
        if self.model is not None:
            return
        try:
            # The BGE reranker may be exposed via a FlagEmbedding/FlagReranker API
            from FlagEmbedding import FlagReranker

            # Load the model; use settings for device
            device = getattr(settings, "RERANKER_DEVICE", "cpu")
            self.model = FlagReranker.from_pretrained(
                settings.RERANKER_MODEL_NAME,
                use_fp16=False,
                device=device,  # type: ignore
            )  # type: ignore
        except Exception:
            # If anything goes wrong, keep model as None to signal unavailability
            self.model = None

    def rerank(
        self,
        query: str,
        documents: List[str],
        top_k: int = 3,
        score_threshold: float = 0.0,
    ) -> List[Tuple[int, float]]:
        """Return a list of (original_index, score) sorted by score desc.

        Only returns results with score >= score_threshold.

        If the model isn't available, return default scores of 0.0 for all docs.
        """
        if self.model is None:
            # Attempt to lazily load on first call
            self._load_model()
        if self.model is None:
            return [(i, 0.0) for i in range(min(top_k, len(documents)))]

        pairs = [[query, doc] for doc in documents]
        try:
            scores = self.model.compute_score(pairs, normalize=True)  # type: ignore
            results = [(idx, float(score)) for idx, score in enumerate(scores)]
            results.sort(key=lambda x: x[1], reverse=True)
            # Filter by score threshold
            filtered = [(i, s) for i, s in results if s >= score_threshold]
            return filtered[:top_k]
        except Exception:
            return [(i, 0.0) for i in range(min(top_k, len(documents)))]

    def is_available(self) -> bool:
        if self.model is None:
            self._load_model()
        return self.model is not None


# Singleton instance exposed for importers
reranker = Reranker()
