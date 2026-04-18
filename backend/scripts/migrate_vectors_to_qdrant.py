import asyncio
import os
import sys
from dotenv import load_dotenv

# load env if not loaded
load_dotenv()

# Add root folder to sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from neo4j import AsyncGraphDatabase
from app.config import settings
from app.storage.vector_ops import VectorOperations

async def migrate():
    # Force settings for migration
    settings.USE_EXTERNAL_VECTOR = True
    
    print("Connecting to Neo4j...")
    driver = AsyncGraphDatabase.driver(
        settings.NEO4J_URI,
        auth=(settings.NEO4J_USER, settings.NEO4J_PASSWORD),
    )
    
    vec_ops = VectorOperations(driver)
    print("Initializing Qdrant collections...")
    await vec_ops.init_external_collections()
    
    if not vec_ops._qdrant_client:
        print("Error: Could not initialize Qdrant client. Make sure Qdrant is running.")
        return
        
    print("Fetching document chunks from Neo4j...")
    from qdrant_client.models import PointStruct
    
    batch_size = 100
    total_migrated = 0
    
    try:
        async with driver.session() as session:
            # count first
            result = await session.run("MATCH (c:DocumentChunk) WHERE c.embedding IS NOT NULL RETURN count(c) as count")
            record = await result.single()
            total_chunks = record["count"]
            print(f"Total chunks to migrate: {total_chunks}")
            
            query = """
                MATCH (c:DocumentChunk)
                WHERE c.embedding IS NOT NULL
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
                       c.block_type AS block_type,
                       c.embedding AS embedding
            """
            result = await session.run(query)
            points = []
            
            async for record in result:
                payload = {
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
                }
                # Remove None values to avoid Qdrant payload errors
                payload = {k: v for k, v in payload.items() if v is not None}
                
                points.append(
                    PointStruct(
                        id=vec_ops._generate_uuid(record["chunk_id"]),
                        vector=record["embedding"],
                        payload=payload
                    )
                )
                
                if len(points) >= batch_size:
                    await vec_ops._qdrant_client.upsert(
                        collection_name="doc_chunks",
                        points=points
                    )
                    total_migrated += len(points)
                    print(f"Migrated {total_migrated}/{total_chunks} chunks...")
                    points = []
                    
            # Insert remainder
            if points:
                await vec_ops._qdrant_client.upsert(
                    collection_name="doc_chunks",
                    points=points
                )
                total_migrated += len(points)
                print(f"Migrated {total_migrated}/{total_chunks} chunks...")
    
        print("Data migration completed successfully!")
    except Exception as e:
        print(f"Migration failed: {e}")
    finally:
        await driver.close()

if __name__ == "__main__":
    asyncio.run(migrate())
