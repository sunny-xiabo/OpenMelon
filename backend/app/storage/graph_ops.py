import re
from typing import Any, Dict, List, Iterable, Optional

from app.config import settings
from app.models.entities import GraphNode, GraphRelationship, GraphData


_CYPHER_IDENTIFIER_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def _batched(items: List[Dict[str, Any]], size: int) -> Iterable[List[Dict[str, Any]]]:
    batch_size = max(1, int(size or 1))
    for index in range(0, len(items), batch_size):
        yield items[index:index + batch_size]


class GraphOperations:
    def __init__(self, driver):
        self._driver = driver

    async def get_graph_status(self) -> Dict[str, Any]:
        query = """
            MATCH (n)
            RETURN count(n) AS node_count
        """
        async with self._driver.session() as session:
            result = await session.run(query)
            record = await result.single()
            node_count = int(record["node_count"]) if record and record["node_count"] else 0
            return {
                "has_data": node_count > 0,
                "node_count": node_count,
            }

    async def create_entity(
        self, name: str, label: str, properties: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        props = properties or {}
        props["name"] = name
        query = f"MERGE (n:{label} {{name: $name}}) SET n += $props RETURN n"
        async with self._driver.session() as session:
            result = await session.run(query, name=name, props=props)
            record = await result.single()
            if record:
                node = record["n"]
                return {"name": name, "label": label, "properties": dict(node)}
            return {}

    async def create_relationship(
        self,
        from_name: str,
        from_label: str,
        to_name: str,
        to_label: str,
        rel_type: str,
        properties: Optional[Dict[str, Any]] = None,
    ) -> bool:
        props = properties or {}
        query = f"""
            MATCH (a:{from_label} {{name: $from_name}})
            MATCH (b:{to_label} {{name: $to_name}})
            MERGE (a)-[r:{rel_type}]->(b)
            SET r += $props
            RETURN r
        """
        async with self._driver.session() as session:
            result = await session.run(
                query, from_name=from_name, to_name=to_name, props=props
            )
            record = await result.single()
            return record is not None

    async def batch_create_relationships(self, relationships: List[Any]) -> int:
        if not relationships:
            return 0
        payload = []
        for rel in relationships:
            if isinstance(rel, dict):
                from_name = rel.get("from_name") or rel.get("source") or rel.get("from")
                from_label = rel.get("from_label") or rel.get("source_label") or rel.get("from_type") or "Entity"
                to_name = rel.get("to_name") or rel.get("target") or rel.get("to")
                to_label = rel.get("to_label") or rel.get("target_label") or rel.get("to_type") or "Entity"
                rel_type = rel.get("rel_type") or rel.get("type") or "RELATED_TO"
                properties = rel.get("properties") or {}
            else:
                from_name, from_label, to_name, to_label, *rest = rel
                rel_type = rest[0] if rest else "RELATED_TO"
                properties = rest[1] if len(rest) > 1 else {}
            if not from_name or not to_name:
                continue
            payload.append(
                {
                    "from_name": str(from_name),
                    "from_label": str(from_label or "Entity"),
                    "to_name": str(to_name),
                    "to_label": str(to_label or "Entity"),
                    "rel_type": str(rel_type or "RELATED_TO"),
                    "properties": properties or {},
                }
            )
        if not payload:
            return 0
        try:
            return await self._batch_create_relationships_with_apoc(payload)
        except Exception:
            return await self._batch_create_relationships_without_apoc(payload)

    async def _batch_create_relationships_with_apoc(self, relationships: List[Dict[str, Any]]) -> int:
        query = """
            UNWIND $relationships AS rel
            MATCH (a {name: rel.from_name})
            WHERE rel.from_label IN labels(a)
            MATCH (b {name: rel.to_name})
            WHERE rel.to_label IN labels(b)
            CALL apoc.merge.relationship(a, rel.rel_type, {}, rel.properties, b, {}) YIELD rel AS merged
            RETURN count(merged) AS created
        """
        created = 0
        async with self._driver.session() as session:
            for batch in _batched(relationships, settings.NEO4J_WRITE_BATCH_SIZE):
                result = await session.run(query, relationships=batch)
                record = await result.single()
                created += int(record["created"] or 0) if record else 0
        return created

    async def _batch_create_relationships_without_apoc(self, relationships: List[Dict[str, Any]]) -> int:
        created = 0
        grouped: Dict[tuple[str, str, str], List[Dict[str, Any]]] = {}
        for rel in relationships:
            key = (rel["from_label"], rel["to_label"], rel["rel_type"])
            grouped.setdefault(key, []).append(rel)
        async with self._driver.session() as session:
            for (from_label, to_label, rel_type), items in grouped.items():
                if not all(_CYPHER_IDENTIFIER_RE.match(value) for value in (from_label, to_label, rel_type)):
                    continue
                query = f"""
                    UNWIND $relationships AS rel
                    MATCH (a:{from_label} {{name: rel.from_name}})
                    MATCH (b:{to_label} {{name: rel.to_name}})
                    MERGE (a)-[r:{rel_type}]->(b)
                    SET r += rel.properties
                    RETURN count(r) AS created
                """
                for batch in _batched(items, settings.NEO4J_WRITE_BATCH_SIZE):
                    result = await session.run(query, relationships=batch)
                    record = await result.single()
                    created += int(record["created"] or 0) if record else 0
        return created

    async def get_entity_subgraph(self, entity_name: str, depth: int = 2) -> GraphData:
        query = """
            MATCH (center {name: $name})
            CALL apoc.path.subgraphAll(center, {
                maxLevel: $depth,
                relationshipFilter: '>',
                labelFilter: ''
            })
            YIELD nodes, relationships
            RETURN nodes, relationships
        """
        async with self._driver.session() as session:
            result = await session.run(query, name=entity_name, depth=depth)
            record = await result.single()
            if not record:
                return GraphData()

            nodes = []
            for node in record["nodes"]:
                nodes.append(
                    GraphNode(
                        id=str(node.id),
                        labels=list(node.labels),
                        properties=dict(node),
                    )
                )

            rels = []
            for rel in record["relationships"]:
                rels.append(
                    GraphRelationship(
                        source=str(rel.start_node.id),
                        target=str(rel.end_node.id),
                        type=rel.type,
                        properties=dict(rel),
                    )
                )

            return GraphData(nodes=nodes, relationships=rels)

    async def get_full_graph(
        self,
        limit: int = 1000,
        doc_type: Optional[str] = None,
        module: Optional[str] = None,
        include_chunks: bool = False,
    ) -> GraphData:
        params: Dict[str, Any] = {"limit": limit}

        if doc_type or module:
            conditions = []
            if doc_type:
                conditions.append("c.doc_type = $doc_type")
                params["doc_type"] = doc_type
            if module:
                conditions.append("c.module = $module")
                params["module"] = module

            if module:
                if include_chunks:
                    query = """
                        MATCH (m:Module)
                        WHERE m.name = $module OR m.name CONTAINS $module
                        OPTIONAL MATCH (m)-[r1]-(f)
                        WITH m, collect(DISTINCT f) AS features, collect(DISTINCT r1) AS rels1
                        MATCH (c:DocumentChunk)
                        WHERE c.module = $module OR c.module CONTAINS $module
                        WITH m, features, rels1, collect(DISTINCT c) AS chunks
                        OPTIONAL MATCH (c:DocumentChunk)-[r2]-(related)
                        WHERE related IS NOT NULL
                        WITH m, features, rels1, chunks, collect(DISTINCT related) AS chunk_related, collect(DISTINCT r2) AS rels2
                        WITH [m] + features + chunks + chunk_related AS nodes, rels1 + rels2 AS all_rels
                        LIMIT $limit
                        RETURN nodes, all_rels AS rels
                    """
                else:
                    query = """
                        MATCH (m:Module)
                        WHERE m.name = $module OR m.name CONTAINS $module
                        MATCH (m)-[r]-(f)
                        WITH m, collect(DISTINCT f) AS features, collect(DISTINCT r) AS rels
                        WITH [m] + features AS nodes, rels AS all_rels
                        LIMIT $limit
                        RETURN nodes, all_rels AS rels
                    """
            elif doc_type:
                if include_chunks:
                    query = """
                        MATCH (c:DocumentChunk)
                        WHERE c.doc_type = $doc_type
                        WITH collect(DISTINCT c) AS chunks, collect(DISTINCT c.module) AS module_names
                        OPTIONAL MATCH (c)-[r1]-(related)
                        WHERE related IS NOT NULL
                        WITH chunks, collect(DISTINCT related) AS related, collect(DISTINCT r1) AS rels1, module_names
                        WHERE size([n IN module_names WHERE n IS NOT NULL]) > 0
                        MATCH (m:Module)
                        WHERE m.name IN module_names
                        OPTIONAL MATCH (m)-[r2]-(f)
                        WITH chunks, related, rels1, collect(DISTINCT m) AS mods, collect(DISTINCT f) AS feats, collect(DISTINCT r2) AS rels2
                        WITH chunks + related + mods + feats AS nodes, rels1 + rels2 AS rels
                        LIMIT $limit
                        RETURN nodes, rels
                    """
                else:
                    query = (
                        """
                        MATCH (c:DocumentChunk)
                        WHERE c.doc_type = $doc_type
                        WITH collect(DISTINCT c.module) AS module_names
                        WHERE size([n IN module_names WHERE n IS NOT NULL]) > 0
                        MATCH (m:Module)
                        WHERE m.name IN module_names
                        OPTIONAL MATCH (m)-[r]-(f)
                        WITH collect(DISTINCT m) AS mods, collect(DISTINCT f) AS feats, collect(DISTINCT r) AS all_r
                        WITH mods + feats AS nodes, all_r AS rels
                        LIMIT $limit
                        RETURN nodes, rels
                    """
                        ""
                    )
            else:
                where_clause = "WHERE " + " AND ".join(conditions) if conditions else ""
                query = f"""
                    MATCH (c:DocumentChunk)
                    {where_clause}
                    WITH collect(c) AS chunks
                    UNWIND chunks AS chunk
                    OPTIONAL MATCH (chunk)-[r]-(n)
                    WHERE n IS NOT NULL
                    WITH chunks, collect(DISTINCT n) AS related, collect(DISTINCT r) AS all_r
                    WITH chunks + related AS nodes, all_r AS rels
                    LIMIT $limit
                    RETURN nodes, rels
                """
        else:
            where_clause = "WHERE NOT 'TestCaseVector' IN labels(n)"
            if not include_chunks:
                where_clause += " AND NOT 'DocumentChunk' IN labels(n)"
            query = f"""
                MATCH (n)
                {where_clause}
                WITH collect(n) AS all_nodes
                UNWIND all_nodes[..$limit] AS node
                OPTIONAL MATCH (node)-[r]->(m)
                WHERE m IN all_nodes[..$limit]
                WITH all_nodes[..$limit] AS limited_nodes, collect(DISTINCT r) AS rels
                RETURN limited_nodes AS nodes, rels
            """
        async with self._driver.session() as session:
            result = await session.run(query, params)
            record = await result.single()
            if not record:
                return GraphData()

            nodes = []
            for node in record["nodes"]:
                nodes.append(
                    GraphNode(
                        id=str(node.id),
                        labels=list(node.labels),
                        properties=dict(node),
                    )
                )

            rels = []
            for rel in record["rels"]:
                if rel is not None:
                    rels.append(
                        GraphRelationship(
                            source=str(rel.start_node.id),
                            target=str(rel.end_node.id),
                            type=rel.type,
                            properties=dict(rel),
                        )
                    )

            return GraphData(nodes=nodes, relationships=rels)

    async def run_cypher(
        self, cypher: str, params: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        async with self._driver.session() as session:
            result = await session.run(cypher, params or {})
            records = []
            async for record in result:
                records.append(dict(record))
            return records

    async def get_doc_types_and_modules(self) -> Dict[str, List[str]]:
        query = """
            MATCH (n:DocumentChunk)
            RETURN DISTINCT n.doc_type AS doc_type, n.module AS module
        """
        doc_types = set()
        modules = set()
        async with self._driver.session() as session:
            result = await session.run(query)
            async for record in result:
                if record.get("doc_type"):
                    doc_types.add(record["doc_type"])
                if record.get("module"):
                    modules.add(record["module"])
            
            # 同时也去正式的 Module 节点里抓取，包含由测例生成的存量模块
            module_result = await session.run("MATCH (m:Module) RETURN DISTINCT m.name AS module")
            async for record in module_result:
                if record.get("module"):
                    modules.add(record["module"])
        return {
            "doc_types": sorted(doc_types),
            "modules": sorted(modules),
        }

    async def search_entity(self, name_pattern: str) -> List[Dict[str, Any]]:
        query = """
            MATCH (n)
            WHERE n.name CONTAINS $pattern
            RETURN n, labels(n) AS labels
            LIMIT 20
        """
        async with self._driver.session() as session:
            result = await session.run(query, pattern=name_pattern)
            results = []
            async for record in result:
                node = record["n"]
                results.append(
                    {
                        "id": str(node.id),
                        "name": node.get("name"),
                        "labels": record["labels"],
                        "properties": dict(node),
                    }
                )
            return results

    async def delete_entity(self, name: str) -> bool:
        query = """
            MATCH (n {name: $name})
            DETACH DELETE n
        """
        async with self._driver.session() as session:
            result = await session.run(query, name=name)
            summary = await result.consume()
            return summary.counters.nodes_deleted > 0

    async def batch_create_entities(self, entities: List[Dict[str, Any]]) -> int:
        if not entities:
            return 0
        query = """
            UNWIND $entities AS ent
            CALL apoc.merge.node(ent.labels, {name: ent.properties.name}, ent.properties) YIELD node
            RETURN count(node) AS created
        """
        async with self._driver.session() as session:
            result = await session.run(query, entities=entities)
            record = await result.single()
            return record["created"] if record else 0

    async def get_entity_by_name(self, name: str) -> Optional[Dict[str, Any]]:
        query = """
            MATCH (n {name: $name})
            RETURN n, labels(n) AS labels
        """
        async with self._driver.session() as session:
            result = await session.run(query, name=name)
            record = await result.single()
            if record:
                node = record["n"]
                return {
                    "id": str(node.id),
                    "name": node.get("name"),
                    "labels": record["labels"],
                    "properties": dict(node),
                }
            return None

    async def get_node_by_id(self, node_id: str) -> Optional[Dict[str, Any]]:
        # Handle virtual node IDs (e.g. chunk_0 from vector search fallback)
        if not node_id.isdigit():
            # Try to find a matching DocumentChunk node by chunk_id property
            query = """
                MATCH (n:DocumentChunk)
                WHERE n.chunk_id = $node_id
                RETURN n, labels(n) AS labels
                LIMIT 1
            """
            async with self._driver.session() as session:
                result = await session.run(query, node_id=node_id)
                record = await result.single()
                if record:
                    node = record["n"]
                    return {
                        "id": str(node.id),
                        "labels": list(record["labels"]),
                        "properties": dict(node),
                    }
            # Fallback: return basic info
            return {
                "id": node_id,
                "labels": ["DocumentChunk"],
                "properties": {"name": node_id},
            }

        query = """
            MATCH (n)
            WHERE id(n) = $node_id
            RETURN n, labels(n) AS labels
        """
        node_id_int = int(node_id)

        async with self._driver.session() as session:
            result = await session.run(query, node_id=node_id_int)
            record = await result.single()
            if record:
                node = record["n"]
                return {
                    "id": str(node.id),
                    "labels": list(record["labels"]),
                    "properties": dict(node),
                }
            return None
