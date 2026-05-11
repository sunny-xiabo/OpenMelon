from typing import List, Dict, Any


class CoverageService:
    def __init__(self, graph_ops: Any):
        self.graph_ops = graph_ops

    async def _run_cypher(
        self, cypher: str, params: Dict[str, Any] = None
    ) -> List[Dict[str, Any]]:
        if hasattr(self.graph_ops, "run_cypher"):
            res = await self.graph_ops.run_cypher(cypher, params or {})
            return res or []
        # Fallback: return empty if no cypher runner available
        return []

    async def get_coverage_report(self) -> List[Dict[str, Any]]:
        """Aggregate module coverage with the same logic as detail API.

        Coverage caliber:
        - feature_count: Module -[:CONTAINS]-> Feature
        - preferred test_case_count: DISTINCT TestCase that COVERS those Features
        - fallback test_case_count: DISTINCT TestCase directly linked by Module -[:CONTAINS]-> TestCase
        """
        try:
            rows = await self._run_cypher(
                """
                CALL {
                    MATCH (m:Module)
                    RETURN DISTINCT m.name AS module_name
                    UNION
                    MATCH (c:DocumentChunk)
                    WHERE c.module IS NOT NULL AND trim(c.module) <> ''
                    RETURN DISTINCT c.module AS module_name
                }
                WITH DISTINCT module_name
                WHERE module_name IS NOT NULL AND trim(module_name) <> ''
                OPTIONAL MATCH (m:Module {name: module_name})-[:CONTAINS]->(f:Feature)
                WITH module_name, count(DISTINCT f) AS feature_count
                OPTIONAL MATCH (:Module {name: module_name})-[:CONTAINS]->(:Feature)<-[covers_rel]-(covered_tc:TestCase)
                WHERE type(covers_rel) = 'COVERS'
                WITH module_name, feature_count, count(DISTINCT covered_tc) AS covered_test_case_count
                OPTIONAL MATCH (:Module {name: module_name})-[:CONTAINS]->(direct_tc:TestCase)
                WITH module_name,
                     feature_count,
                     covered_test_case_count,
                     count(DISTINCT direct_tc) AS direct_test_case_count
                WITH module_name,
                     feature_count,
                     CASE
                         WHEN covered_test_case_count > 0 THEN covered_test_case_count
                         ELSE direct_test_case_count
                     END AS test_case_count
                RETURN module_name, feature_count, test_case_count
                ORDER BY module_name
                """
            )
        except Exception:
            return []

        results: List[Dict[str, Any]] = []
        for row in rows or []:
            if not isinstance(row, dict):
                continue
            module_name = row.get("module_name")
            if not module_name:
                continue
            feat_count = int(row.get("feature_count", 0))
            tc_count = int(row.get("test_case_count", 0))
            coverage = (tc_count / feat_count * 100.0) if feat_count > 0 else 0.0
            results.append(
                {
                    "module_name": module_name,
                    "feature_count": feat_count,
                    "test_case_count": tc_count,
                    "coverage_percentage": coverage,
                }
            )
        return results

    async def get_module_coverage(self, module_name: str) -> Dict[str, Any]:
        # Get detailed features for the module
        try:
            feat_res = await self.graph_ops.run_cypher(
                "MATCH (m:Module {name: $name})-[:CONTAINS]->(f:Feature) RETURN f.name AS feature_name",
                {"name": module_name},
            )
        except Exception:
            feat_res = []
        features = [
            r.get("feature_name")
            for r in (feat_res or [])
            if isinstance(r, dict) and r.get("feature_name")
        ]

        # Get test cases that cover these features
        test_cases = []
        try:
            tc_res = await self.graph_ops.run_cypher(
                """
                MATCH (m:Module {name: $name})-[:CONTAINS]->(f:Feature)<-[r]-(t:TestCase)
                WHERE type(r) = 'COVERS'
                RETURN DISTINCT t.name AS test_name
                """,
                {"name": module_name},
            )
            if tc_res:
                test_cases = [
                    r.get("test_name")
                    for r in tc_res
                    if isinstance(r, dict) and r.get("test_name")
                ]
            if not test_cases:
                fallback_tc_res = await self.graph_ops.run_cypher(
                    "MATCH (m:Module {name: $name})-[:CONTAINS]->(t:TestCase) RETURN DISTINCT t.name AS test_name",
                    {"name": module_name},
                )
                if fallback_tc_res:
                    test_cases = [
                        r.get("test_name")
                        for r in fallback_tc_res
                        if isinstance(r, dict) and r.get("test_name")
                    ]
        except Exception:
            test_cases = []
        feature_count = len(features)
        test_case_count = len(test_cases)
        coverage = (
            (test_case_count / feature_count * 100.0) if feature_count > 0 else 0.0
        )
        return {
            "module_name": module_name,
            "features": features,
            "test_cases": test_cases,
            "coverage_percentage": coverage,
        }
