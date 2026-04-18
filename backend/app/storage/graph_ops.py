from typing import Any, Dict, List, Optional
from app.models.entities import GraphNode, GraphRelationship, GraphData


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
                    query = f"""
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
                    query = f"""
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
                    query = f"""
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
                        f"""
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
            where_clause = (
                "WHERE NOT 'DocumentChunk' IN labels(n)" if not include_chunks else ""
            )
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
