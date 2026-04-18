import hashlib
import logging
from typing import List, Dict, Any, Optional

logger = logging.getLogger("testcase_gen.neo4j_writer")


class Neo4jWriter:
    def __init__(self, driver, embedding_func=None, vector_ops=None):
        self._driver = driver
        self._embedding_func = embedding_func
        self.vector_ops = vector_ops

    def set_embedding_func(self, func):
        self._embedding_func = func

    def _format_steps(self, steps) -> str:
        if isinstance(steps, str):
            return steps
        if not steps:
            return ""
        lines = []
        for i, step in enumerate(steps, 1):
            desc = step.get("description", "")
            expected = step.get("expected_result", "")
            if expected:
                lines.append(f"{i}. {desc} -> 预期: {expected}")
            else:
                lines.append(f"{i}. {desc}")
        return "\n".join(lines)

    async def write_test_cases(
        self,
        test_cases: List[Dict[str, Any]],
        module: Optional[str] = None,
        store_vector: bool = False,
    ) -> Dict[str, Any]:
        if not test_cases or not self._driver:
            return {"graph_written": 0, "vector_written": 0, "vector_skipped": 0}

        graph_written = 0
        vector_written = 0
        vector_skipped = 0
        vector_errors = []

        for tc in test_cases:
            name = tc.get("name") or tc.get("title") or tc.get("id", "unknown")
            description = tc.get("description", "")
            steps = tc.get("steps", "")
            if isinstance(steps, list):
                steps = self._format_steps(steps)
            expected = tc.get("expected", "")
            priority = tc.get("priority", "medium")

            try:
                async with self._driver.session() as session:
                    if module:
                        await session.run(
                            """
                            MERGE (m:Module {name: $module})
                            MERGE (t:TestCase {name: $name})
                            SET t.description = $desc,
                                t.steps = $steps,
                                t.expected = $expected,
                                t.priority = $priority,
                                t.updated_at = datetime()
                            MERGE (m)-[:CONTAINS]->(t)
                            """,
                            {
                                "module": module,
                                "name": name,
                                "desc": description,
                                "steps": steps,
                                "expected": expected,
                                "priority": priority,
                            },
                        )
                    else:
                        await session.run(
                            """
                            MERGE (t:TestCase {name: $name})
                            SET t.description = $desc,
                                t.steps = $steps,
                                t.expected = $expected,
                                t.priority = $priority,
                                t.updated_at = datetime()
                            """,
                            {
                                "name": name,
                                "desc": description,
                                "steps": steps,
                                "expected": expected,
                                "priority": priority,
                            },
                        )
                    graph_written += 1
            except Exception as e:
                logger.warning(f"Failed to write TestCase '{name}': {e}")

            if store_vector and self._embedding_func:
                try:
                    content_for_embedding = f"{name}\n{description}\n{steps}"
                    embedding = await self._embedding_func(content_for_embedding)

                    async with self._driver.session() as session:
                        content_hash = hashlib.md5(
                            f"{name}:{description[:100]}".encode()
                        ).hexdigest()[:12]
                        vector_id = f"tc:{content_hash}"

                        check_result = await session.run(
                            "MATCH (tc:TestCaseVector {vector_id: $vid}) RETURN tc",
                            {"vid": vector_id},
                        )
                        existing = await check_result.single()

                        if existing:
                            vector_skipped += 1
                        else:
                            await session.run(
                                """
                                MERGE (tc:TestCaseVector {vector_id: $vector_id})
                                SET tc.test_case_name = $name,
                                    tc.description = $desc,
                                    tc.steps = $steps,
                                    tc.module = $module,
                                    tc.priority = $priority,
                                    tc.embedding = $embedding,
                                    tc.created_at = datetime()
                                """,
                                {
                                    "vector_id": vector_id,
                                    "name": name,
                                    "desc": description[:2000],
                                    "steps": steps[:5000],
                                    "module": module,
                                    "priority": priority,
                                    "embedding": embedding,
                                },
                            )
                            vector_written += 1
                            
                            from app.config import settings
                            if settings.USE_EXTERNAL_VECTOR and getattr(self, "vector_ops", None) and getattr(self.vector_ops, "_qdrant_client", None):
                                try:
                                    from qdrant_client.models import PointStruct
                                    await self.vector_ops._qdrant_client.upsert(
                                        collection_name="test_cases",
                                        points=[PointStruct(
                                            id=self.vector_ops._generate_uuid(vector_id),
                                            vector=embedding,
                                            payload={
                                                "test_case_id": vector_id,
                                                "test_case_name": name,
                                                "description": description[:2000],
                                                "steps": steps[:5000],
                                                "module": module,
                                                "priority": priority
                                            }
                                        )]
                                    )
                                except Exception as e:
                                    logger.warning(f"Failed to sync test case to Qdrant: {e}")
                except Exception as e:
                    vector_errors.append(f"{name}: {str(e)}")
                    logger.warning(f"Failed to write TestCaseVector '{name}': {e}")

        logger.info(
            f"Wrote {graph_written}/{len(test_cases)} test cases to Neo4j (vector: +{vector_written}, skipped: {vector_skipped})"
        )
        return {
            "graph_written": graph_written,
            "vector_written": vector_written,
            "vector_skipped": vector_skipped,
            "vector_errors": vector_errors[:5] if vector_errors else [],
        }


neo4j_writer: Optional[Neo4jWriter] = None


def init_neo4j_writer(driver, embedding_func=None, vector_ops=None):
    global neo4j_writer
    neo4j_writer = Neo4jWriter(driver, embedding_func, vector_ops)
    return neo4j_writer
