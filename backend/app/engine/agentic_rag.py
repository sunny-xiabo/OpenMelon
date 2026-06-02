from typing import List, Optional, Dict, Any

from openai import AsyncOpenAI

from app.config import settings
from app.engine.llm_retry import call_llm_with_retry


class AgenticRAG:
    """Agentic RAG: multi-step reasoning with query rewriting and evaluation."""

    def __init__(
        self,
        llm_client: AsyncOpenAI,
        retriever,
        max_steps: Optional[int] = None,
        confidence_threshold: Optional[float] = None,
    ) -> None:
        self.llm_client = llm_client
        self.retriever = retriever
        self.max_steps = max_steps
        self.confidence_threshold = confidence_threshold

    def _runtime_max_steps(self) -> int:
        return self.max_steps if self.max_steps is not None else settings.AGENTIC_MAX_STEPS

    def _runtime_confidence_threshold(self) -> float:
        return (
            self.confidence_threshold
            if self.confidence_threshold is not None
            else settings.AGENTIC_CONFIDENCE_THRESHOLD
        )

    async def _is_answer_sufficient(self, question: str, answer: str) -> float:
        system_prompt = (
            "You are an evaluation expert. Evaluate if the following answer sufficiently "
            "addresses the user's question. Return a confidence score between 0 and 1, where 1 "
            "means fully sufficient and 0 means completely insufficient. Return ONLY a number."
        )
        user_message = f"Question: {question}\nAnswer: {answer}\nConfidence:"
        try:
            model_name = settings.CHAT_MODEL
            resp = await call_llm_with_retry(
                self.llm_client,
                model=model_name,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_message},
                ],
                temperature=0.0,
                max_tokens=64,
            )
            text = resp.choices[0].message.content.strip()
            val = float(text)
            if val < 0:
                val = 0.0
            if val > 1:
                val = 1.0
            return val
        except Exception:
            return 0.5

    async def _rewrite_query(self, question: str, previous_context: str) -> str:
        system_prompt = (
            "You are a query optimization expert. Based on the user's question and previous context, "
            "generate a more specific and precise query for information retrieval. The optimized query "
            "should be more concrete and contain more keywords. Return ONLY the optimized query."
        )
        user_message = f"Question: {question}\nPrevious Context:\n{previous_context}\nOptimized Query:"
        try:
            model_name = settings.CHAT_MODEL
            resp = await call_llm_with_retry(
                self.llm_client,
                model=model_name,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_message},
                ],
                temperature=0.3,
                max_tokens=256,
            )
            optimized = resp.choices[0].message.content.strip()
            return optimized if optimized else question
        except Exception:
            return question

    def _validate_retrieval_result(self, chunks: list) -> tuple:
        """Validate retrieval results and return (is_valid, reason).

        Checks for empty results, low-quality content, and excessive duplication.
        Returns a tuple of (bool, str) indicating validity and reason.
        """
        if not chunks:
            return False, "empty_results"

        valid_chunks = [
            c for c in chunks
            if isinstance(c.get("content"), str) and len(c["content"].strip()) > 30
        ]
        if not valid_chunks:
            return False, "low_quality_content"

        # Detect excessive duplication by comparing first 100 chars of each chunk
        unique_prefixes = set(c["content"][:100] for c in valid_chunks)
        if len(unique_prefixes) < max(1, len(valid_chunks) // 2):
            return False, "high_duplication"

        return True, "ok"

    async def _generate_answer_with_reasoning(
        self, question: str, contexts: List[str], reasoning_steps: List[str]
    ) -> str:
        contexts_block = "\n\n".join(
            [f"[Source {i + 1}]\n{c}" for i, c in enumerate(contexts)]
        )
        system_prompt = (
            "You are a professional knowledge assistant. Based on the retrieved information and reasoning steps, "
            "generate a comprehensive and accurate answer. Requirements: 1. Strictly base your answer on the provided information. "
            "2. If no relevant information is found, clearly state so. 3. Be concise, accurate, and well-organized."
        )
        reasoning_text = (
            "Reasoning steps:\n" + "\n".join(reasoning_steps)
            if reasoning_steps
            else "Reasoning steps: none"
        )
        user_message = f"Question: {question}\n\nContext:\n{contexts_block}\n\n{reasoning_text}\n\nProvide a final answer based on the above."
        try:
            model_name = settings.CHAT_MODEL
            resp = await call_llm_with_retry(
                self.llm_client,
                model=model_name,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_message},
                ],
                temperature=0.2,
                max_tokens=2000,
            )
            answer = resp.choices[0].message.content.strip()
        except Exception:
            answer = "无法生成答案。"
        return answer

    async def query(self, question: str, top_k: int = 5) -> dict:
        reasoning_steps: List[str] = []
        all_contexts: List[str] = []
        all_sources: List[Dict[str, Any]] = []
        current_query = question

        confidence_threshold = self._runtime_confidence_threshold()
        max_steps = self._runtime_max_steps()
        for step in range(1, max_steps + 1):
            if step > 1:
                prior_context = "\n".join(all_contexts[-3:]) if all_contexts else ""
                current_query = await self._rewrite_query(question, prior_context)

            retrieval = await self.retriever.vector_retrieve(current_query, top_k=top_k)
            chunks = retrieval.get("chunks", [])
            is_valid, reason = self._validate_retrieval_result(chunks)
            if not is_valid:
                reasoning_steps.append(
                    f"Step {step}: Retrieval validation failed ({reason}), attempting graph fallback"
                )
                # Try graph fallback on first failure
                if step == 1 and hasattr(self.retriever, 'graph_retrieve'):
                    try:
                        graph_result = await self.retriever.graph_retrieve(
                            [current_query], depth=2
                        )
                        graph_context = graph_result.get("context_text", "")
                        if graph_context and len(graph_context.strip()) > 50:
                            all_contexts.append(f"[Graph Context]\n{graph_context}")
                            all_sources.append({"source_type": "graph"})
                            reasoning_steps.append(
                                f"Step {step}: Graph fallback succeeded with {len(graph_context)} chars"
                            )
                    except Exception:
                        pass
                break

            for idx, chunk in enumerate(chunks):
                content = chunk.get("content", "")
                src_ref = {
                    "source_type": "vector",
                    "filename": chunk.get("filename"),
                    "doc_type": chunk.get("doc_type"),
                    "chunk_index": chunk.get("chunk_index"),
                    "content": content,
                    "section_path": chunk.get("section_path"),
                    "page_label": chunk.get("page_label"),
                    "sheet_name": chunk.get("sheet_name"),
                    "slide_label": chunk.get("slide_label"),
                    "block_type": chunk.get("block_type"),
                }
                all_sources.append(src_ref)
                all_contexts.append(f"[Source {len(all_contexts) + 0}]\n{content}")

            refs_text = "\n---\n".join(
                [c.get("content", "") for c in chunks if c.get("content")]
            )
            sufficient = await self._is_answer_sufficient(question, refs_text or "")
            reasoning_steps.append(
                f"Step {step}: Retrieved {len(chunks)} chunks; sufficiency score={sufficient:.3f}"
            )
            if sufficient >= confidence_threshold:
                break

        if not all_contexts:
            return {
                "answer": "抱歉，未能检索到相关信息来回答您的问题。",
                "sources": [],
                "reasoning_steps": reasoning_steps,
            }

        seen = set()
        dedup_sources: List[Dict[str, Any]] = []
        for s in all_sources:
            key = (s.get("filename"), s.get("doc_type"), s.get("chunk_index"))
            if key in seen:
                continue
            seen.add(key)
            dedup_sources.append(s)

        answer = await self._generate_answer_with_reasoning(
            question, all_contexts, reasoning_steps
        )

        return {
            "answer": answer,
            "sources": dedup_sources[:top_k],
            "reasoning_steps": reasoning_steps,
        }
