from typing import Any, Dict, List, Optional
import hashlib
import uuid
import logging
import asyncio
from app.config import settings

logger = logging.getLogger(__name__)


class VectorOperations:
    def __init__(self, driver):
        self._driver = driver
        self._qdrant_client = None
        
        if settings.USE_EXTERNAL_VECTOR and settings.VECTOR_PROVIDER == "qdrant":
            try:
                from qdrant_client import AsyncQdrantClient
                scheme = "https" if str(settings.QDRANT_PORT) == "443" else "http"
                qdrant_url = f"{scheme}://{settings.QDRANT_HOST}:{settings.QDRANT_PORT}"
                self._qdrant_client = AsyncQdrantClient(
                    url=qdrant_url,
                    api_key=settings.QDRANT_API_KEY if settings.QDRANT_API_KEY else None,
                    check_compatibility=False,
                    timeout=5.0,
                    # 显式禁用代理，防止公司代理拦截 localhost 请求导致 502
                    http2=False,
                )
            except Exception as e:
                logger.warning(f"Failed to init Qdrant client, fallback to Neo4j. Error: {e}")
                self._qdrant_client = None

    def _generate_uuid(self, string_id: str) -> str:
        """Convert a string ID to a valid UUID for external vector db."""
        return str(uuid.uuid5(uuid.NAMESPACE_URL, string_id))

    async def init_external_collections(self):
        """Initialize required collections in the external vector database."""
        if not self._qdrant_client:
            return
        last_error = None
        for attempt in range(1, 6):
            try:
                from qdrant_client.models import VectorParams, Distance
                collections = await self._qdrant_client.get_collections()
                collection_names = [c.name for c in collections.collections]
                
                if "doc_chunks" not in collection_names:
                    await self._qdrant_client.create_collection(
                        collection_name="doc_chunks",
                        vectors_config=VectorParams(
                            size=max(settings.EMBEDDING_DIM, 1024),
                            distance=Distance.COSINE
                        )
                    )
                    logger.info("Created Qdrant collection: doc_chunks")
                    
                if "test_cases" not in collection_names:
                    await self._qdrant_client.create_collection(
                        collection_name="test_cases",
                        vectors_config=VectorParams(
                            size=max(settings.EMBEDDING_DIM, 1024),
                            distance=Distance.COSINE
                        )
                    )
                    logger.info("Created Qdrant collection: test_cases")
                return
            except Exception as e:
                last_error = e
                if attempt < 5:
                    logger.warning(
                        f"Qdrant 初始化失败，第 {attempt}/5 次重试: {e}"
                    )
                    await asyncio.sleep(1)
                else:
                    logger.warning(f"Failed to initialize Qdrant collections: {last_error}")

    async def create_document_chunk(
        self,
        doc_type: str,
        module: str,
        filename: str,
        chunk_index: int,
        content: str,
        section_path: Optional[str],
        page_label: Optional[str],
        sheet_name: Optional[str],
        slide_label: Optional[str],
        block_type: Optional[str],
        embedding: List[float],
    ) -> bool:
        chunk_id = f"chunk:{doc_type}:{filename}:{chunk_index}"
        query = """
            MERGE (c:DocumentChunk {chunk_id: $chunk_id})
            SET c.doc_type = $doc_type,
                c.module = $module,
                c.filename = $filename,
                c.chunk_index = $chunk_index,
                c.content = $content,
                c.section_path = $section_path,
                c.page_label = $page_label,
                c.sheet_name = $sheet_name,
                c.slide_label = $slide_label,
                c.block_type = $block_type,
                c.embedding = $embedding
            RETURN c
        """
        async with self._driver.session() as session:
            result = await session.run(
                query,
                chunk_id=chunk_id,
                doc_type=doc_type,
                module=module,
                filename=filename,
                chunk_index=chunk_index,
                content=content,
                section_path=section_path,
                page_label=page_label,
                sheet_name=sheet_name,
                slide_label=slide_label,
                block_type=block_type,
                embedding=embedding,
            )
            record = await result.single()
            neo4j_success = record is not None

        if neo4j_success and settings.USE_EXTERNAL_VECTOR and self._qdrant_client:
            try:
                from qdrant_client.models import PointStruct
                await self._qdrant_client.upsert(
                    collection_name="doc_chunks",
                    points=[PointStruct(
                        id=self._generate_uuid(chunk_id),
                        vector=embedding,
                        payload={
                            "chunk_id": chunk_id,
                            "doc_type": doc_type,
                            "module": module,
                            "filename": filename,
                            "chunk_index": chunk_index,
                            "content": content,
                            "section_path": section_path,
                            "page_label": page_label,
                            "sheet_name": sheet_name,
                            "slide_label": slide_label,
                            "block_type": block_type,
                        }
                    )]
                )
            except Exception as e:
                logger.warning(f"Failed to write chunk {chunk_id} to external vector db: {e}")

        return neo4j_success

    async def similarity_search(
        self,
        query_embedding: List[float],
        top_k: int = 5,
        filters: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        # External Vector DB Search First
        if settings.USE_EXTERNAL_VECTOR and self._qdrant_client:
            try:
                from qdrant_client.models import Filter, FieldCondition, MatchValue
                qdrant_filter = None
                if filters:
                    must_conditions = [
                        FieldCondition(key=k, match=MatchValue(value=v))
                        for k, v in filters.items()
                    ]
                    qdrant_filter = Filter(must=must_conditions)
                
                qdrant_response = await self._qdrant_client.query_points(
                    collection_name="doc_chunks",
                    query=query_embedding,
                    limit=top_k,
                    query_filter=qdrant_filter,
                    with_payload=True
                )
                
                return [
                    {
                        "chunk_id": hit.payload.get("chunk_id"),
                        "doc_type": hit.payload.get("doc_type"),
                        "module": hit.payload.get("module"),
                        "filename": hit.payload.get("filename"),
                        "chunk_index": hit.payload.get("chunk_index"),
                        "content": hit.payload.get("content"),
                        "section_path": hit.payload.get("section_path"),
                        "page_label": hit.payload.get("page_label"),
                        "sheet_name": hit.payload.get("sheet_name"),
                        "slide_label": hit.payload.get("slide_label"),
                        "block_type": hit.payload.get("block_type"),
                        "score": hit.score,
                    }
                    for hit in qdrant_response.points
                ]
            except Exception as e:
                logger.warning(f"External vector query failed: {e}. Falling back to Neo4j...")
                if not settings.VECTOR_FALLBACK_TO_NEO4J:
                    raise e

        where_clause = ""
        params = {"query_embedding": query_embedding, "top_k": top_k}

        if filters:
            filter_parts = []
            for key, value in filters.items():
                param_name = f"filter_{key}"
                filter_parts.append(f"c.{key} = ${param_name}")
                params[param_name] = value
            where_clause = "WHERE " + " AND ".join(filter_parts)

        query = f"""
            CALL db.index.vector.queryNodes('chunk_embeddings', $top_k, $query_embedding)
            YIELD node, score
            {where_clause}
            RETURN node["chunk_id"] AS chunk_id,
                   node["doc_type"] AS doc_type,
                   node["module"] AS module,
                   node["filename"] AS filename,
                   node["chunk_index"] AS chunk_index,
                   node["content"] AS content,
                   node["section_path"] AS section_path,
                   node["page_label"] AS page_label,
                   node["sheet_name"] AS sheet_name,
                   node["slide_label"] AS slide_label,
                   node["block_type"] AS block_type,
                   score
            ORDER BY score DESC
        """
        async with self._driver.session() as session:
            result = await session.run(query, **params)
            results = []
            async for record in result:
                results.append(
                    {
                        "chunk_id": record["chunk_id"],
                        "doc_type": record["doc_type"],
                        "module": record["module"],
                        "filename": record["filename"],
                        "chunk_index": record["chunk_index"],
                        "content": record["content"],
                        "section_path": record["section_path"],
                        "page_label": record["page_label"],
                        "sheet_name": record["sheet_name"],
                        "slide_label": record["slide_label"],
                        "block_type": record["block_type"],
                        "score": record["score"],
                    }
                )
            return results

    async def get_chunk_by_id(
        self, doc_type: str, filename: str, chunk_index: int
    ) -> Optional[Dict[str, Any]]:
        chunk_id = f"chunk:{doc_type}:{filename}:{chunk_index}"
        query = """
            MATCH (c:DocumentChunk {chunk_id: $chunk_id})
            RETURN c.chunk_id AS chunk_id,
                   c.doc_type AS doc_type,
                   c.module AS module,
                   c.filename AS filename,
                   c.chunk_index AS chunk_index,
                   c.content AS content,
                   c.section_path AS section_path,
                   c.page_label AS page_label,
                   c.sheet_name AS sheet_name,
                   c.slide_label AS slide_label,
                   c.block_type AS block_type
        """
        async with self._driver.session() as session:
            result = await session.run(query, chunk_id=chunk_id)
            record = await result.single()
            if record:
                return dict(record)
            return None

    async def batch_create_chunks(self, chunks: List[Dict[str, Any]]) -> int:
        if not chunks:
            return 0
        query = """
            UNWIND $chunks AS chunk
            MERGE (c:DocumentChunk {chunk_id: chunk.chunk_id})
            SET c.doc_type = chunk.doc_type,
                c.module = chunk.module,
                c.filename = chunk.filename,
                c.chunk_index = chunk.chunk_index,
                c.content = chunk.content,
                c.section_path = chunk.section_path,
                c.page_label = chunk.page_label,
                c.sheet_name = chunk.sheet_name,
                c.slide_label = chunk.slide_label,
                c.block_type = chunk.block_type,
                c.embedding = chunk.embedding
            RETURN count(c) AS created
        """
        async with self._driver.session() as session:
            result = await session.run(query, chunks=chunks)
            record = await result.single()
            neo4j_created = record["created"] if record else 0

        if neo4j_created > 0 and settings.USE_EXTERNAL_VECTOR and self._qdrant_client:
            try:
                from qdrant_client.models import PointStruct
                points = []
                for chunk in chunks:
                    payload = {k: v for k, v in chunk.items() if k != "embedding"}
                    points.append(PointStruct(
                        id=self._generate_uuid(chunk["chunk_id"]),
                        vector=chunk["embedding"],
                        payload=payload
                    ))
                await self._qdrant_client.upsert(
                    collection_name="doc_chunks",
                    points=points
                )
            except Exception as e:
                logger.warning(f"Failed to batch write chunks to Qdrant: {e}")

        return neo4j_created

    async def delete_chunks_by_file(self, filename: str) -> int:
        query = """
            MATCH (c:DocumentChunk {filename: $filename})
            WITH collect(c) AS chunks
            WITH chunks, size(chunks) AS deleted
            FOREACH (chunk IN chunks | DETACH DELETE chunk)
            RETURN deleted
        """
        async with self._driver.session() as session:
            result = await session.run(query, filename=filename)
            record = await result.single()
            deleted = record["deleted"] if record else 0

        if deleted > 0 and settings.USE_EXTERNAL_VECTOR and self._qdrant_client:
            try:
                from qdrant_client.models import Filter, FieldCondition, MatchValue
                await self._qdrant_client.delete(
                    collection_name="doc_chunks",
                    points_selector=Filter(
                        must=[FieldCondition(key="filename", match=MatchValue(value=filename))]
                    )
                )
            except Exception as e:
                logger.warning(f"Failed to delete chunks by file from Qdrant: {e}")

        return deleted

    async def check_vector_status(self) -> Dict[str, Any]:
        """检查向量库状态"""
        try:
            async with self._driver.session() as session:
                try:
                    query = "SHOW INDEXES YIELD name, state, type WHERE type = 'VECTOR' RETURN name, state, type"
                    result = await session.run(query)
                    records = [record async for record in result]
                except Exception:
                    query = "CALL db.index.vector.listIndexes() YIELD name, state, type RETURN name, state, type"
                    result = await session.run(query)
                    records = [record async for record in result]

                indexes = []
                for record in records:
                    indexes.append(
                        {
                            "name": record.get("name"),
                            "state": record.get("state"),
                            "type": record.get("type"),
                        }
                    )

                chunk_index = next(
                    (i for i in indexes if "chunk_embeddings" in i.get("name", "")),
                    None,
                )

                return {
                    "available": len(indexes) > 0,
                    "indexes": indexes,
                    "chunk_index_ready": chunk_index.get("state") == "ONLINE"
                    if chunk_index
                    else False,
                    "message": "向量库正常" if indexes else "未找到向量索引",
                }
        except Exception as e:
            return {
                "available": False,
                "indexes": [],
                "chunk_index_ready": False,
                "message": f"向量库检查失败: {str(e)}",
            }

    async def create_test_case_vector(
        self,
        test_case_id: str,
        test_case_name: str,
        description: str,
        steps: str,
        embedding: List[float],
        module: str = None,
        priority: str = None,
    ) -> Dict[str, Any]:
        """
        将测试用例存入向量库

        返回: {
            "success": bool,
            "action": "created" | "exists" | "error",
            "message": str
        }
        """
        try:
            content_hash = hashlib.md5(
                f"{test_case_name}:{description[:100]}".encode()
            ).hexdigest()[:12]
            vector_id = f"tc:{content_hash}"

            check_query = """
                MATCH (tc:TestCaseVector {vector_id: $vector_id})
                RETURN tc.test_case_name AS name
            """
            async with self._driver.session() as session:
                result = await session.run(check_query, vector_id=vector_id)
                record = await result.single()

                if record:
                    return {
                        "success": True,
                        "action": "exists",
                        "message": f"测试用例 '{record['name']}' 已存在于向量库",
                    }

            create_query = """
                MERGE (tc:TestCaseVector {vector_id: $vector_id})
                SET tc.test_case_id = $test_case_id,
                    tc.test_case_name = $test_case_name,
                    tc.description = $description,
                    tc.steps = $steps,
                    tc.module = $module,
                    tc.priority = $priority,
                    tc.embedding = $embedding,
                    tc.created_at = datetime()
                RETURN tc
            """
            async with self._driver.session() as session:
                await session.run(
                    create_query,
                    vector_id=vector_id,
                    test_case_id=test_case_id,
                    test_case_name=test_case_name,
                    description=description[:2000] if description else "",
                    steps=steps[:5000] if steps else "",
                    module=module,
                    priority=priority,
                    embedding=embedding,
                )

                if settings.USE_EXTERNAL_VECTOR and self._qdrant_client:
                    try:
                        from qdrant_client.models import PointStruct
                        await self._qdrant_client.upsert(
                            collection_name="test_cases",
                            points=[PointStruct(
                                id=self._generate_uuid(vector_id),
                                vector=embedding,
                                payload={
                                    "test_case_id": test_case_id,
                                    "test_case_name": test_case_name,
                                    "description": description[:2000] if description else "",
                                    "steps": steps[:5000] if steps else "",
                                    "module": module,
                                    "priority": priority
                                }
                            )]
                        )
                    except Exception as e:
                        logger.warning(f"Failed to write test case to external vector db: {e}")

                return {
                    "success": True,
                    "action": "created",
                    "message": f"测试用例 '{test_case_name}' 已存入向量库",
                }
        except Exception as e:
            return {
                "success": False,
                "action": "error",
                "message": f"存储失败: {str(e)}",
            }

    async def batch_create_test_case_vectors(
        self,
        test_cases: List[Dict[str, Any]],
        embeddings: List[List[float]],
        module: str = None,
    ) -> Dict[str, Any]:
        """批量存储测试用例到向量库"""
        if len(test_cases) != len(embeddings):
            return {
                "success": False,
                "message": "用例数量与向量数量不匹配",
                "created": 0,
                "skipped": 0,
            }

        created = 0
        skipped = 0
        errors = []

        for i, (tc, emb) in enumerate(zip(test_cases, embeddings)):
            result = await self.create_test_case_vector(
                test_case_id=tc.get("id", f"tc_{i}"),
                test_case_name=tc.get("title", tc.get("name", f"TestCase_{i}")),
                description=tc.get("description", ""),
                steps=self._format_steps(tc.get("steps", [])),
                embedding=emb,
                module=module or tc.get("module"),
                priority=tc.get("priority"),
            )
            if result["action"] == "created":
                created += 1
            elif result["action"] == "exists":
                skipped += 1
            else:
                errors.append(result["message"])

        return {
            "success": True,
            "message": f"完成: 新增 {created}, 跳过 {skipped}",
            "created": created,
            "skipped": skipped,
            "errors": errors[:5] if errors else [],
        }

    def _format_steps(self, steps: List[Dict]) -> str:
        """格式化测试步骤"""
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

    async def search_similar_test_cases(
        self,
        query_embedding: List[float],
        top_k: int = 5,
        module: str = None,
    ) -> List[Dict[str, Any]]:
        """检索相似的测试用例"""
        if settings.USE_EXTERNAL_VECTOR and self._qdrant_client:
            try:
                from qdrant_client.models import Filter, FieldCondition, MatchValue
                qdrant_filter = None
                if module:
                    qdrant_filter = Filter(must=[FieldCondition(key="module", match=MatchValue(value=module))])
                
                qdrant_response = await self._qdrant_client.query_points(
                    collection_name="test_cases",
                    query=query_embedding,
                    limit=top_k,
                    query_filter=qdrant_filter,
                    with_payload=True
                )
                
                return [
                    {
                        "id": hit.payload.get("test_case_id"),
                        "name": hit.payload.get("test_case_name"),
                        "description": hit.payload.get("description"),
                        "module": hit.payload.get("module"),
                        "priority": hit.payload.get("priority"),
                        "similarity_score": hit.score,
                    }
                    for hit in qdrant_response.points
                ]
            except Exception as e:
                logger.warning(f"External testcase query failed: {e}. Falling back to Neo4j...")
                if not settings.VECTOR_FALLBACK_TO_NEO4J:
                    return []

        try:
            params = {"query_embedding": query_embedding, "top_k": top_k}
            where_clause = ""

            if module:
                where_clause = "WHERE tc.module = $module"
                params["module"] = module

            query = f"""
                MATCH (tc:TestCaseVector)
                {where_clause}
                WITH tc, tc.embedding AS embedding, gds.similarity.cosine(embedding, $query_embedding) AS score
                ORDER BY score DESC
                LIMIT $top_k
                RETURN tc.test_case_id AS id,
                       tc.test_case_name AS name,
                       tc.description AS description,
                       tc.module AS module,
                       tc.priority AS priority,
                       score
            """

            async with self._driver.session() as session:
                result = await session.run(query, **params)
                results = []
                async for record in result:
                    results.append(
                        {
                            "id": record.get("id"),
                            "name": record.get("name"),
                            "description": record.get("description"),
                            "module": record.get("module"),
                            "priority": record.get("priority"),
                            "similarity_score": record.get("score", 0),
                        }
                    )
                return results
        except Exception as e:
            return []

    async def get_test_case_count(self) -> int:
        """获取向量库中测试用例数量"""
        try:
            query = "MATCH (tc:TestCaseVector) RETURN count(tc) AS count"
            async with self._driver.session() as session:
                result = await session.run(query)
                record = await result.single()
                return record.get("count", 0) if record else 0
        except:
            return 0
