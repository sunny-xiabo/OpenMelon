from neo4j import AsyncGraphDatabase, AsyncDriver
from neo4j.exceptions import ServiceUnavailable
from typing import Any, Dict, List, Optional
import logging

from app.config import settings
from app.models.graph_types import CORE_NODE_TYPES, DOCUMENT_CHUNK_NODE_TYPE

logger = logging.getLogger(__name__)


class Neo4jClient:
    def __init__(self):
        self._driver: Optional[AsyncDriver] = None

    async def connect(self) -> AsyncDriver:
        if self._driver is None:
            self._driver = AsyncGraphDatabase.driver(
                settings.NEO4J_URI,
                auth=(settings.NEO4J_USER, settings.NEO4J_PASSWORD),
                max_connection_pool_size=50,
            )
            logger.info(f"Connected to Neo4j at {settings.NEO4J_URI}")
        return self._driver

    async def close(self):
        if self._driver:
            await self._driver.close()
            self._driver = None
            logger.info("Neo4j connection closed")

    @property
    def driver(self) -> AsyncDriver:
        if self._driver is None:
            raise RuntimeError("Neo4j client not connected. Call connect() first.")
        return self._driver

    async def health_check(self) -> bool:
        try:
            await self.connect()
            async with self.driver.session(database=settings.NEO4J_DATABASE) as session:
                result = await session.run("RETURN 1 AS ok")
                record = await result.single()
                return record is not None and record["ok"] == 1
        except ServiceUnavailable:
            logger.error("Neo4j health check failed: service unavailable")
            return False
        except Exception as e:
            logger.error(f"Neo4j health check failed: {e}")
            return False

    async def run_query(
        self, query: str, parameters: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        await self.connect()
        async with self.driver.session(database=settings.NEO4J_DATABASE) as session:
            result = await session.run(query, parameters or {})
            records = []
            async for record in result:
                records.append(dict(record))
            return records

    async def run_write(
        self, query: str, parameters: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        return await self.run_query(query, parameters)

    async def initialize_indexes(self):
        """Create vector indexes and constraints on first run."""
        await self.connect()
        dim = settings.EMBEDDING_DIM or 1024

        async with self.driver.session(database=settings.NEO4J_DATABASE) as session:
            # Create constraints for entity uniqueness
            constraints = [
                f"CREATE CONSTRAINT {node_type.lower()}_name IF NOT EXISTS FOR (n:{node_type}) REQUIRE n.name IS UNIQUE"
                for node_type in CORE_NODE_TYPES
            ]
            constraints.append(
                f"CREATE CONSTRAINT chunk_id IF NOT EXISTS FOR (c:{DOCUMENT_CHUNK_NODE_TYPE}) REQUIRE c.chunk_id IS UNIQUE"
            )
            constraints.append(
                "CREATE CONSTRAINT testcase_vector_id IF NOT EXISTS FOR (tc:TestCaseVector) REQUIRE tc.vector_id IS UNIQUE"
            )
            for constraint in constraints:
                try:
                    await session.run(constraint)
                except Exception as e:
                    logger.warning(f"Constraint creation warning: {e}")

            # Detect existing embedding dimension and clear if mismatched
            existing_dim = None
            try:
                result = await session.run(
                    "MATCH (c:DocumentChunk) WHERE c.embedding IS NOT NULL "
                    "RETURN size(c.embedding) AS dim LIMIT 1"
                )
                record = await result.single()
                if record:
                    existing_dim = record["dim"]
            except Exception:
                pass

            if existing_dim and existing_dim != dim:
                logger.warning(
                    f"检测到向量维度变更: {existing_dim} -> {dim}，"
                    f"正在清除旧向量数据，请重新上传文档进行索引"
                )
                await session.run(
                    "MATCH (c:DocumentChunk) WHERE c.embedding IS NOT NULL "
                    "REMOVE c.embedding"
                )

            # Create vector index on DocumentChunk embeddings
            try:
                await session.run("DROP INDEX chunk_embeddings IF EXISTS")
                await session.run(f"""
                    CREATE VECTOR INDEX chunk_embeddings
                    FOR (c:DocumentChunk) ON (c.embedding)
                    OPTIONS {{indexConfig: {{
                        `vector.dimensions`: {dim},
                        `vector.similarity_function`: 'cosine'
                    }}}}
                """)
                logger.info(
                    f"Vector index 'chunk_embeddings' created/verified (dim={dim})"
                )
            except Exception as e:
                logger.warning(f"Vector index creation warning: {e}")

            # Create vector index on entity embeddings
            try:
                await session.run("DROP INDEX entity_embeddings IF EXISTS")
                await session.run(f"""
                    CREATE VECTOR INDEX entity_embeddings
                    FOR (e:Entity) ON (e.embedding)
                    OPTIONS {{indexConfig: {{
                        `vector.dimensions`: {dim},
                        `vector.similarity_function`: 'cosine'
                    }}}}
                """)
                logger.info(f"Vector index 'entity_embeddings' created/verified (dim={dim})")
            except Exception as e:
                logger.warning(f"Entity vector index creation warning: {e}")

            # Create vector index on TestCaseVector embeddings
            try:
                await session.run("DROP INDEX testcase_vector_embeddings IF EXISTS")
                await session.run(f"""
                    CREATE VECTOR INDEX testcase_vector_embeddings
                    FOR (tc:TestCaseVector) ON (tc.embedding)
                    OPTIONS {{indexConfig: {{
                        `vector.dimensions`: {dim},
                        `vector.similarity_function`: 'cosine'
                    }}}}
                """)
                logger.info(
                    f"Vector index 'testcase_vector_embeddings' created/verified (dim={dim})"
                )
            except Exception as e:
                logger.warning(f"TestCaseVector index creation warning: {e}")
