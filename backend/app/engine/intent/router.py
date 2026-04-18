from openai import AsyncOpenAI
from app.config import settings
from typing import List
import json
import re


class IntentRouter:
    def __init__(self, openai_client: AsyncOpenAI, graph_ops=None):
        self.openai_client = openai_client
        self.graph_ops = graph_ops

    async def validate_entities(self, entities: List[str]) -> List[str]:
        """Filter entities to only those that exist in the graph database."""
        if not self.graph_ops or not entities:
            return entities

        valid_entities = []
        for entity in entities:
            try:
                # Check if entity exists by searching for it
                result = await self.graph_ops.search_entity(entity)
                if result and result.nodes:
                    valid_entities.append(entity)
            except Exception:
                # Keep entity if check fails
                valid_entities.append(entity)
        return valid_entities if valid_entities else entities

    async def classify_intent(self, question: str) -> dict:
        system_prompt = """You are an intent classifier for a Graph RAG system. Classify user questions into one of four categories:

1. graph_query: User asks about specific entity relationships, properties, or containment structure.
   Examples: "What features does the login module have?", "What are the parameters of getUser API?", "登录模块有哪些功能", "getUser接口的参数是什么"

2. vector_query: User asks about concepts, processes, best practices, or design approaches.
   Examples: "How to handle concurrency?", "Design approach for login feature?", "如何处理并发问题", "登录功能的设计思路"

3. hybrid_query: Needs both structured graph info and document content. Often involves impact analysis or coverage questions.
   Examples: "Which test cases are affected by changing payment feature?", "Test coverage of login module?", "修改支付功能影响哪些测试用例", "登录模块的测试覆盖率如何"

4. visualization: User explicitly asks for graphs, relationship diagrams, dependency maps.
   Examples: "Draw module relationship diagram for user center", "Show payment dependency chain", "画出用户中心的模块关系图", "展示支付功能的依赖链路"

Return ONLY a JSON object with format:
{"intent": "graph_query|vector_query|hybrid_query|visualization", "confidence": 0.0-1.0}"""

        try:
            response = await self.openai_client.chat.completions.create(
                model=settings.CHAT_MODEL,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": question},
                ],
                temperature=0.0,
                max_tokens=100,
            )
            content = response.choices[0].message.content.strip()
            result = json.loads(content)
            intent = result.get("intent", "vector_query")
            confidence = float(result.get("confidence", 0.5))

            # Fallback to hybrid_query when confidence is low
            if confidence < settings.INTENT_CONFIDENCE_THRESHOLD:
                intent = "hybrid_query"

            return {"intent": intent, "confidence": confidence}
        except Exception:
            # On error, fallback to hybrid_query for safety
            return {"intent": "hybrid_query", "confidence": 0.0}

    def extract_entities(self, question: str) -> list:
        patterns = [
            r'["\u201c\u201d]([^"\u201c\u201d]{2,30})["\u201c\u201d]',
            r"\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)\b",
        ]
        entities = set()
        for pattern in patterns:
            matches = re.findall(pattern, question)
            for match in matches:
                if len(match) > 1:
                    entities.add(match.strip())

        keywords = []
        skip_words = {
            "what",
            "how",
            "which",
            "when",
            "where",
            "who",
            "why",
            "the",
            "a",
            "an",
            "is",
            "are",
            "do",
            "does",
            "did",
            "what",
            "how",
            "draw",
            "show",
            "display",
            "tell",
            "什么",
            "哪些",
            "如何",
            "怎么",
            "多少",
            "的",
            "了",
            "画出",
            "展示",
            "查看",
            "影响",
            "修改",
        }
        words = re.findall(r"[\u4e00-\u9fff]{2,10}|[a-zA-Z]{3,20}", question)
        for word in words:
            if word.lower() not in skip_words:
                keywords.append(word)
                entities.add(word)

        return list(entities)

    async def process(self, question: str) -> dict:
        intent_result = await self.classify_intent(question)
        entities = self.extract_entities(question)

        # Validate entities against graph if available
        if self.graph_ops and entities:
            entities = await self.validate_entities(entities)

        return {
            "intent": intent_result["intent"],
            "entities": entities,
            "confidence": intent_result["confidence"],
        }
