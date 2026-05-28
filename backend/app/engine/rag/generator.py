from openai import AsyncOpenAI
from app.config import settings
from typing import List, Dict, Any, AsyncGenerator
import time

from app.api.ai_observability_service import build_usage_from_response, safe_record_ai_call
from app.engine.llm_retry import call_llm_with_retry


class RAGGenerator:
    def __init__(self, openai_client: AsyncOpenAI):
        self.openai_client = openai_client

    async def generate_answer(
        self,
        question: str,
        context: str,
        intent: str,
        chat_history: List[Dict[str, Any]] | None = None,
    ) -> Dict[str, Any]:
        prompt = self.build_prompt(question, context, intent, chat_history or [])
        started_at = time.perf_counter()
        prompt_chars = len(prompt["system"]) + len(prompt["user"])

        try:
            model_name = settings.CHAT_MODEL
            temperature = settings.GENERATION_TEMPERATURE
            max_tokens = settings.GENERATION_MAX_TOKENS
            response = await call_llm_with_retry(
                self.openai_client,
                model=model_name,
                messages=[
                    {"role": "system", "content": prompt["system"]},
                    {"role": "user", "content": prompt["user"]},
                ],
                temperature=temperature,
                max_tokens=max_tokens,
            )
            answer = response.choices[0].message.content.strip()
            usage = build_usage_from_response(response)
            safe_record_ai_call(
                feature="rag",
                operation="generate_answer",
                provider=settings.LLM_PROVIDER,
                model=model_name,
                status="success",
                latency_ms=round((time.perf_counter() - started_at) * 1000),
                prompt_chars=prompt_chars,
                response_chars=len(answer),
                debug_snapshot={
                    "system": prompt["system"],
                    "user": prompt["user"],
                    "context": context,
                    "response": answer,
                },
                **usage,
            )
        except Exception as e:
            answer = f"Error generating answer: {str(e)}"
            safe_record_ai_call(
                feature="rag",
                operation="generate_answer",
                provider=settings.LLM_PROVIDER,
                model=settings.CHAT_MODEL,
                status="failed",
                latency_ms=round((time.perf_counter() - started_at) * 1000),
                prompt_chars=prompt_chars,
                response_chars=len(answer),
                degraded=True,
                failure_reason=str(e),
                debug_snapshot={
                    "system": prompt["system"],
                    "user": prompt["user"],
                    "context": context,
                    "response": answer,
                },
            )

        return {"answer": answer}

    async def generate_answer_stream(
        self,
        question: str,
        context: str,
        intent: str,
        chat_history: List[Dict[str, Any]] | None = None,
    ) -> AsyncGenerator[str, None]:
        """流式生成回答，逐块 yield 文本内容。"""
        prompt = self.build_prompt(question, context, intent, chat_history or [])
        started_at = time.perf_counter()
        prompt_chars = len(prompt["system"]) + len(prompt["user"])
        model_name = settings.CHAT_MODEL

        full_answer = ""
        try:
            stream = await self.openai_client.chat.completions.create(
                model=model_name,
                messages=[
                    {"role": "system", "content": prompt["system"]},
                    {"role": "user", "content": prompt["user"]},
                ],
                temperature=settings.GENERATION_TEMPERATURE,
                max_tokens=settings.GENERATION_MAX_TOKENS,
                stream=True,
            )
            async for chunk in stream:
                delta = chunk.choices[0].delta if chunk.choices else None
                if delta and delta.content:
                    full_answer += delta.content
                    yield delta.content

            usage = {}
            if hasattr(stream, "get_final_response"):
                try:
                    final = await stream.get_final_response()
                    usage = build_usage_from_response(final)
                except Exception:
                    pass

            safe_record_ai_call(
                feature="rag",
                operation="generate_answer_stream",
                provider=settings.LLM_PROVIDER,
                model=model_name,
                status="success",
                latency_ms=round((time.perf_counter() - started_at) * 1000),
                prompt_chars=prompt_chars,
                response_chars=len(full_answer),
                debug_snapshot={
                    "system": prompt["system"],
                    "user": prompt["user"],
                    "context": context[:2000],
                    "response": full_answer[:2000],
                },
                **usage,
            )
        except Exception as e:
            safe_record_ai_call(
                feature="rag",
                operation="generate_answer_stream",
                provider=settings.LLM_PROVIDER,
                model=model_name,
                status="failed",
                latency_ms=round((time.perf_counter() - started_at) * 1000),
                prompt_chars=prompt_chars,
                response_chars=len(full_answer),
                degraded=True,
                failure_reason=str(e),
            )
            if not full_answer:
                yield f"Error generating answer: {str(e)}"

    def build_prompt(
        self,
        question: str,
        context: str,
        intent: str,
        chat_history: List[Dict[str, Any]],
    ) -> dict:
        history_text = "\n".join(
            [
                f"{'User' if msg.get('role') == 'user' else 'Assistant'}: {msg.get('content', '')}"
                for msg in chat_history[-6:]
            ]
        ).strip()

        system_message = (
            "You are a documentation assistant for a software project. "
            "Answer questions ONLY based on the provided context. "
            "If the context does not contain enough information to answer the question, say so clearly. "
            "Do not make up information. "
            "Always cite your sources by mentioning the filename and document type when possible. "
            "When conversation history is provided, use it only as supplemental context to resolve references such as pronouns or omitted subjects. "
            "If conversation history conflicts with retrieved context, prefer the retrieved context. "
            "Keep answers concise and accurate. "
            "When citing sources, use numbered references [1], [2], [3] in your answer text. "
            "The numbers correspond to the order of Retrieved Context sections provided."
        )

        history_section = (
            f"""Conversation History:
{history_text}

"""
            if history_text
            else ""
        )

        user_message = f"""{history_section}Retrieved Context:
{context}

Question: {question}

Answer based on the context above:"""

        return {"system": system_message, "user": user_message}

    def extract_citations(
        self, chunks: List[Dict], source_type: str = "vector"
    ) -> List[Dict]:
        citations = []
        for chunk in chunks:
            citation = {
                "source_type": source_type,
                "filename": chunk.get("filename"),
                "doc_type": chunk.get("doc_type"),
                "chunk_index": chunk.get("chunk_index"),
            }
            citations.append(citation)
        return citations

    async def generate_visualization_summary(self, graph_data: Dict) -> str:
        nodes = graph_data.get("nodes", [])
        relationships = graph_data.get("relationships", [])

        node_summary = ", ".join(
            [n.get("label", n.get("id", "unknown")) for n in nodes[:10]]
        )
        rel_summary = ", ".join(
            [
                f"{r.get('from')} -{r.get('label', '?')}-> {r.get('to')}"
                for r in relationships[:10]
            ]
        )

        summary = (
            f"This graph shows {len(nodes)} entities and {len(relationships)} relationships. "
            f"Key entities: {node_summary}. "
            f"Key relationships: {rel_summary}."
        )

        return summary
