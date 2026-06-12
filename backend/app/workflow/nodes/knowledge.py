"""Knowledge retrieval node -- performs RAG search using the existing retriever."""
from __future__ import annotations

from typing import Any

from app.workflow.nodes.base import BaseNode
from app.utils.logger import logger

log = logger.getChild("workflow.nodes.knowledge")


class KnowledgeRetrievalNode(BaseNode):
    node_type = "knowledge_retrieval"

    async def execute(
        self,
        inputs: dict[str, Any],
        config: dict[str, Any],
        context: dict[str, Any],
    ) -> dict[str, Any]:
        retriever = context.get("retriever")
        if retriever is None:
            raise RuntimeError("Retriever not available in execution context")

        variable_pool = context.get("variable_pool")

        # Resolve the query
        query = ""
        query_variable = config.get("query_variable", [])
        if query_variable and variable_pool:
            query = variable_pool.resolve(query_variable) or ""
        elif inputs:
            query = str(list(inputs.values())[0])

        if not query:
            return {"result": [], "query": ""}

        top_k = config.get("top_k", 5)
        score_threshold = config.get("score_threshold", 0.0)

        log.info("Knowledge retrieval: query='%s', top_k=%d", query[:80], top_k)

        try:
            results = await retriever.retrieve(query=query, top_k=top_k)

            # Filter by score threshold if set
            if score_threshold > 0:
                results = [r for r in results if r.get("score", 0) >= score_threshold]

            return {
                "result": results,
                "query": query,
                "count": len(results),
            }
        except Exception as e:
            log.error("Knowledge retrieval failed: %s", e)
            return {"result": [], "query": query, "error": str(e)}

    def validate_config(self, config: dict[str, Any]) -> list[str]:
        errors = []
        if not config.get("query_variable"):
            errors.append("Knowledge retrieval node requires 'query_variable' in config")
        return errors
