from typing import List, Dict, Any, Optional
from app.config import settings
from app.engine.reranker import reranker


class MultiChannelRetriever:
    def __init__(self, graph_ops, vector_ops, openai_client):
        self.graph_ops = graph_ops
        self.vector_ops = vector_ops
        self.openai_client = openai_client

    async def retrieve(self, intent: str, entities: List[str], question: str) -> dict:
        if intent == "graph_query":
            return await self.graph_retrieve(entities)
        elif intent == "vector_query":
            return await self.vector_retrieve(question)
        elif intent == "hybrid_query":
            return await self.hybrid_retrieve(entities, question)
        elif intent == "visualization":
            return await self.visualize_retrieve(entities)
        else:
            return await self.vector_retrieve(question)

    async def graph_retrieve(self, entities: List[str], depth: Optional[int] = None) -> dict:
        """Retrieve subgraph for entities."""
        if depth is None:
            depth = settings.RETRIEVAL_DEPTH
        all_nodes = []
        all_rels = []
        context_parts = []

        for entity in entities:
            subgraph = await self.graph_ops.get_entity_subgraph(entity, depth=depth)
            for node in subgraph.nodes:
                if node.id not in [n["id"] for n in all_nodes]:
                    all_nodes.append(
                        {
                            "id": node.id,
                            "labels": node.labels,
                            "properties": node.properties,
                        }
                    )
            for rel in subgraph.relationships:
                all_rels.append(
                    {
                        "source": rel.source,
                        "target": rel.target,
                        "type": rel.type,
                        "properties": rel.properties,
                    }
                )
            name = entity
            context_parts.append(f"Entity: {name}")

        context_text = (
            "\n\n".join(context_parts) if context_parts else "No graph data found."
        )

        return {
            "nodes": all_nodes,
            "relationships": all_rels,
            "context_text": context_text,
        }

    async def vector_retrieve(
        self, question: str, top_k: Optional[int] = None, use_reranker: bool = True
    ) -> dict:
        """Retrieve relevant document chunks using vector similarity."""
        if top_k is None:
            top_k = settings.RETRIEVAL_TOP_K
        embedding = await self._get_embedding(question)
        results = await self.vector_ops.similarity_search(embedding, top_k=top_k)

        test_case_results = []
        if hasattr(self.vector_ops, 'search_similar_test_cases'):
            test_case_results = await self.vector_ops.search_similar_test_cases(embedding, top_k=max(2, top_k // 2))

        # Apply reranking first if available
        if (
            use_reranker
            and results
            and reranker.is_available()
            and settings.USE_RERANKER
        ):
            doc_contents = [r.get("content", "") for r in results]
            rerank_top_k = min(settings.RERANKER_TOP_K, len(results))
            rerank_results = reranker.rerank(
                question,
                doc_contents,
                top_k=rerank_top_k,
                score_threshold=settings.RERANKER_SCORE_THRESHOLD,
            )
            reranked_indices = [idx for idx, _ in rerank_results]
            results = [results[i] for i in reranked_indices]

        # Build context text from (possibly reranked) results
        context_parts = []
        for r in results:
            part = f"[{r.get('doc_type', 'unknown')}] {r.get('filename', 'unknown')} (chunk {r.get('chunk_index', '?')}):\n{r.get('content', '')}"
            context_parts.append(part)

        for tc in test_case_results:
            part = f"[Test Case] {tc.get('name', 'Unknown')} (Priority: {tc.get('priority', 'N/A')})\nDescription/Steps: {tc.get('description', '')}"
            context_parts.append(part)

        context_text = (
            "\n\n---\n\n".join(context_parts)
            if context_parts
            else "No relevant documents found."
        )

        return {
            "chunks": results,
            "test_cases": test_case_results,
            "context_text": context_text,
        }

    async def hybrid_retrieve(
        self,
        entities: List[str],
        question: str,
        depth: Optional[int] = None,
        top_k: Optional[int] = None,
    ) -> dict:
        """Combine graph and vector retrieval results with configurable weights."""
        if depth is None:
            depth = settings.RETRIEVAL_DEPTH
        if top_k is None:
            top_k = settings.RETRIEVAL_TOP_K

        graph_result = await self.graph_retrieve(entities, depth=depth)
        vector_result = await self.vector_retrieve(question, top_k=top_k)

        # Apply hybrid weights to context ordering
        graph_weight = settings.HYBRID_GRAPH_WEIGHT
        vector_weight = settings.HYBRID_VECTOR_WEIGHT

        # Weighted context: put higher-weight source first
        if vector_weight >= graph_weight:
            merged_context = f"Document Context (weight={vector_weight}):\n{vector_result['context_text']}\n\nGraph Context (weight={graph_weight}):\n{graph_result['context_text']}"
        else:
            merged_context = f"Graph Context (weight={graph_weight}):\n{graph_result['context_text']}\n\nDocument Context (weight={vector_weight}):\n{vector_result['context_text']}"

        return {
            "graph_results": graph_result,
            "vector_results": vector_result,
            "merged_context": merged_context,
            "weights": {"graph": graph_weight, "vector": vector_weight},
        }

    async def visualize_retrieve(self, entities: List[str], depth: Optional[int] = None) -> dict:
        """Retrieve graph data for visualization."""
        if depth is None:
            depth = settings.RETRIEVAL_DEPTH
        if entities:
            subgraph = await self.graph_ops.get_entity_subgraph(
                entities[0], depth=depth
            )
        else:
            subgraph = await self.graph_ops.get_full_graph(limit=500)

        nodes_for_vis = []
        for node in subgraph.nodes:
            label = node.properties.get("name", node.id)
            node_type = node.labels[0] if node.labels else "Entity"
            nodes_for_vis.append(
                {
                    "id": node.id,
                    "label": label,
                    "group": node_type,
                    "title": str(node.properties),
                }
            )

        rels_for_vis = []
        for rel in subgraph.relationships:
            rels_for_vis.append(
                {
                    "from": rel.source,
                    "to": rel.target,
                    "label": rel.type,
                }
            )

        return {
            "graph_data": {
                "nodes": nodes_for_vis,
                "relationships": rels_for_vis,
            },
            "context_text": f"Graph visualization with {len(nodes_for_vis)} nodes and {len(rels_for_vis)} relationships.",
        }

    async def _get_embedding(self, text: str) -> List[float]:
        if not settings.EMBEDDING_MODEL:
            return [0.0] * max(settings.EMBEDDING_DIM, 1024)
        try:
            model_name = settings.EMBEDDING_MODEL
            kwargs = {
                "model": model_name,
                "input": [text],
            }
            if settings.EMBEDDING_DIM and model_name and "text-embedding-3" in model_name:
                kwargs["dimensions"] = settings.EMBEDDING_DIM
            response = await self.openai_client.embeddings.create(**kwargs)
            return response.data[0].embedding
        except Exception:
            return [0.0] * max(settings.EMBEDDING_DIM, 1024)
