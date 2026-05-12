from __future__ import annotations

from typing import List

from fastapi import FastAPI
from pydantic import BaseModel, Field

from app.config import settings


class RerankRequest(BaseModel):
    query: str
    documents: List[str] = Field(default_factory=list)
    top_k: int = 5
    score_threshold: float = 0.0


class RerankResult(BaseModel):
    index: int
    score: float


class RerankResponse(BaseModel):
    results: List[RerankResult]


class LocalReranker:
    def __init__(self):
        self.model = None  # type: ignore

    def load(self):
        if self.model is not None:
            return
        from FlagEmbedding import FlagReranker

        self.model = FlagReranker.from_pretrained(
            settings.RERANKER_MODEL_NAME,
            use_fp16=False,
            device=settings.RERANKER_DEVICE,
        )

    def rerank(self, request: RerankRequest) -> RerankResponse:
        if not request.documents:
            return RerankResponse(results=[])
        self.load()
        pairs = [[request.query, doc] for doc in request.documents]
        scores = self.model.compute_score(pairs, normalize=True)  # type: ignore
        ranked = [(idx, float(score)) for idx, score in enumerate(scores)]
        ranked.sort(key=lambda item: item[1], reverse=True)
        results = [
            RerankResult(index=idx, score=score)
            for idx, score in ranked
            if score >= request.score_threshold
        ]
        return RerankResponse(results=results[: request.top_k])


app = FastAPI(title="OpenMelon Reranker", version="1.0.0")
local_reranker = LocalReranker()


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "model": settings.RERANKER_MODEL_NAME}


@app.post("/rerank", response_model=RerankResponse)
def rerank(request: RerankRequest) -> RerankResponse:
    return local_reranker.rerank(request)
