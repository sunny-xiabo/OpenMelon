import asyncio
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

        normalized_cases = []
        for tc in test_cases:
            name = tc.get("name") or tc.get("title") or tc.get("id", "unknown")
            description = tc.get("description", "")
            steps = tc.get("steps", "")
            if isinstance(steps, list):
                steps = self._format_steps(steps)
            normalized_cases.append(
                {
                    "name": name,
                    "description": description,
                    "steps": steps,
                    "expected": tc.get("expected", ""),
                    "priority": tc.get("priority", "medium"),
                    "module": module or tc.get("module"),
                    "source": tc,
                }
            )

        graph_written = 0
        vector_written = 0
        vector_skipped = 0
        vector_errors = []

        graph_groups: dict[str | None, list[dict[str, Any]]] = {}
        for item in normalized_cases:
            graph_groups.setdefault(item["module"], []).append(item)

        async with self._driver.session() as session:
            for group_module, items in graph_groups.items():
                payload = [
                    {
                        "name": item["name"],
                        "desc": item["description"],
                        "steps": item["steps"],
                        "expected": item["expected"],
                        "priority": item["priority"],
                    }
                    for item in items
                ]
                if group_module:
                    query = """
                        UNWIND $items AS item
                        MERGE (m:Module {name: $module})
                        MERGE (t:TestCase {name: item.name})
                        SET t.description = item.desc,
                            t.steps = item.steps,
                            t.expected = item.expected,
                            t.priority = item.priority,
                            t.updated_at = datetime()
                        MERGE (m)-[:CONTAINS]->(t)
                        RETURN count(t) AS written
                    """
                    params = {"module": group_module, "items": payload}
                else:
                    query = """
                        UNWIND $items AS item
                        MERGE (t:TestCase {name: item.name})
                        SET t.description = item.desc,
                            t.steps = item.steps,
                            t.expected = item.expected,
                            t.priority = item.priority,
                            t.updated_at = datetime()
                        RETURN count(t) AS written
                    """
                    params = {"items": payload}
                try:
                    result = await session.run(query, **params)
                    record = await result.single()
                    graph_written += int(record["written"] or 0) if record else len(payload)
                except Exception as e:
                    logger.warning("Failed to write TestCase batch for module %s: %s", group_module, e)

        if store_vector and self._embedding_func:
            try:
                contents = [
                    f"{item['name']}\n{item['description']}\n{item['steps']}"
                    for item in normalized_cases
                ]
                embeddings = await asyncio.gather(
                    *[self._embedding_func(content) for content in contents]
                )
                vector_result = await self.vector_ops.batch_create_test_case_vectors(
                    [item["source"] for item in normalized_cases],
                    list(embeddings),
                    module=module,
                ) if getattr(self, "vector_ops", None) else {
                    "created": 0,
                    "skipped": len(normalized_cases),
                    "errors": [],
                }
                vector_written = int(vector_result.get("created", 0) or 0)
                vector_skipped = int(vector_result.get("skipped", 0) or 0)
                vector_errors = list(vector_result.get("errors", []) or [])
            except Exception as e:
                vector_errors.append(str(e))
                logger.warning("Failed to batch write TestCaseVector set: %s", e)

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
