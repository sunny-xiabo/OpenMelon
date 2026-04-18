from openai import AsyncOpenAI
from app.config import settings
from typing import List, Dict, Any


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

        try:
            response = await self.openai_client.chat.completions.create(
                model=settings.CHAT_MODEL,
                messages=[
                    {"role": "system", "content": prompt["system"]},
                    {"role": "user", "content": prompt["user"]},
                ],
                temperature=settings.GENERATION_TEMPERATURE,
                max_tokens=settings.GENERATION_MAX_TOKENS,
            )
            answer = response.choices[0].message.content.strip()
        except Exception as e:
            answer = f"Error generating answer: {str(e)}"

        return {"answer": answer}

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
            "Keep answers concise and accurate."
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
