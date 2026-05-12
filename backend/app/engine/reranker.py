from __future__ import annotations

from typing import List, Tuple

import httpx

from app.config import settings


class Reranker:
    _instance = None  # type: ignore

    def __new__(cls, *args, **kwargs):  # type: ignore
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):  # pragma: no cover
        if getattr(self, "_initialized", False):
            return
        self.model = None  # type: ignore
        self._initialized = True

    @property
    def backend(self) -> str:
        if not settings.USE_RERANKER:
            return "disabled"
        return settings.RERANKER_BACKEND.strip().lower() or "local"

    def _load_model(self):
        if self.model is not None:
            return
        try:
            from FlagEmbedding import FlagReranker

            self.model = FlagReranker.from_pretrained(
                settings.RERANKER_MODEL_NAME,
                use_fp16=False,
                device=settings.RERANKER_DEVICE,
            )
        except Exception:
            self.model = None

    async def rerank(
        self,
        query: str,
        documents: List[str],
        top_k: int = 3,
        score_threshold: float = 0.0,
    ) -> List[Tuple[int, float]]:
        if not documents or self.backend == "disabled":
            return []
        if self.backend == "sidecar":
            return await self._rerank_sidecar(query, documents, top_k, score_threshold)
        return self._rerank_local(query, documents, top_k, score_threshold)

    def _rerank_local(
        self,
        query: str,
        documents: List[str],
        top_k: int,
        score_threshold: float,
    ) -> List[Tuple[int, float]]:
        if self.model is None:
            self._load_model()
        if self.model is None:
            return []

        pairs = [[query, doc] for doc in documents]
        try:
            scores = self.model.compute_score(pairs, normalize=True)  # type: ignore
            results = [(idx, float(score)) for idx, score in enumerate(scores)]
            results.sort(key=lambda x: x[1], reverse=True)
            filtered = [(i, s) for i, s in results if s >= score_threshold]
            return filtered[:top_k]
        except Exception:
            return []

    async def _rerank_sidecar(
        self,
        query: str,
        documents: List[str],
        top_k: int,
        score_threshold: float,
    ) -> List[Tuple[int, float]]:
        if not settings.RERANKER_URL:
            return []
        payload = {
            "query": query,
            "documents": documents,
            "top_k": top_k,
            "score_threshold": score_threshold,
        }
        try:
            async with httpx.AsyncClient(timeout=settings.RERANKER_TIMEOUT_SECONDS) as client:
                response = await client.post(
                    f"{settings.RERANKER_URL.rstrip('/')}/rerank",
                    json=payload,
                )
                response.raise_for_status()
            data = response.json()
            ranked = []
            for item in data.get("results", []):
                index = int(item["index"])
                score = float(item["score"])
                if 0 <= index < len(documents):
                    ranked.append((index, score))
            return ranked[:top_k]
        except Exception:
            return []

    async def is_available(self) -> bool:
        if self.backend == "disabled":
            return False
        if self.backend == "sidecar":
            if not settings.RERANKER_URL:
                return False
            try:
                async with httpx.AsyncClient(timeout=settings.RERANKER_TIMEOUT_SECONDS) as client:
                    response = await client.get(f"{settings.RERANKER_URL.rstrip('/')}/health")
                return response.status_code == 200
            except Exception:
                return False
        if self.model is None:
            self._load_model()
        return self.model is not None


reranker = Reranker()
