#!/usr/bin/env python3
import asyncio
import os
import sys
import logging

# 将项目根目录添加到系统路径中以引入 app.config
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from neo4j import AsyncGraphDatabase
from qdrant_client import AsyncQdrantClient
from app.config import settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("clear_vector_db")

async def clear_all():
    print("=" * 60)
    print("⚠️   危险操作警告！")
    print("⚠️   此脚本将永久彻底清空系统的所有向量数据和切片数据！")
    print("⚠️   请开发者慎用该操作。该操作【不可逆】！")
    print("=" * 60)
    print("清理范围包含：")
    print("  1. Neo4j 中的文档切片节点 (DocumentChunk)")
    print("  2. Neo4j 中的测试用例缓存节点 (TestCaseVector)")
    print("  3. Qdrant 中的 `doc_chunks` 集合 (如果开启了外部存储)")
    print("=" * 60)
    
    confirm = input("你确定要彻底清空向量库吗？如要继续，请输入大写的 'YES': ")
    if confirm.strip() != 'YES':
        print("输入错误或未确认，操作已取消。")
        return

    print("\n-------------------------------------------")
    
    # 1. 尝试清理 Neo4j 数据库
    try:
        logger.info(f"正在连接 Neo4j 数据库 ({settings.NEO4J_URI})...")
        driver = AsyncGraphDatabase.driver(
            settings.NEO4J_URI, 
            auth=(settings.NEO4J_USER, settings.NEO4J_PASSWORD)
        )
        async with driver.session() as session:
            logger.info("正在删除 Neo4j 中的所有知识图谱和向量节点 (包含 Document, Entity, Feature, Chunk 等)...")
            # 采用 MATCH (n) DETACH DELETE n 彻底全盘清空所有类型节点与关系
            res = await session.run("MATCH (n) DETACH DELETE n RETURN count(n) AS count")
            record = await res.single()
            logger.info(f"已彻底删除 Neo4j 中多达 {record['count'] if record else 0} 个各类图结构与向量节点。")
            
            
        await driver.close()
        logger.info("Neo4j 节点清理完成 ✅")
    except Exception as e:
        logger.error(f"清理 Neo4j 失败，请检查数据库状态: {e}")
        
    print("\n-------------------------------------------")
        
    # 2. 尝试清理 Qdrant 数据库（如果启用了该选项）
    if getattr(settings, "USE_EXTERNAL_VECTOR", False) and getattr(settings, "VECTOR_PROVIDER", "") == "qdrant":
        try:
            logger.info(f"系统启用了外部向量库，正在连接 Qdrant ({settings.QDRANT_HOST}:{settings.QDRANT_PORT})...")
            qdrant = AsyncQdrantClient(
                host=settings.QDRANT_HOST, 
                port=settings.QDRANT_PORT,
                api_key=settings.QDRANT_API_KEY if getattr(settings, "QDRANT_API_KEY", None) else None
            )
            
            collections_res = await qdrant.get_collections()
            collection_names = [c.name for c in collections_res.collections]
            
            if "doc_chunks" in collection_names:
                logger.info("正在删除 Qdrant 集合 'doc_chunks'...")
                await qdrant.delete_collection(collection_name="doc_chunks")
                logger.info("Qdrant 集合 'doc_chunks' 删除完成 ✅")
            else:
                logger.info("Qdrant 集合 'doc_chunks' 不存在，无需删除。")
                
            if "test_cases" in collection_names:
                logger.info("正在删除 Qdrant 集合 'test_cases'...")
                await qdrant.delete_collection(collection_name="test_cases")
                logger.info("Qdrant 集合 'test_cases' 删除完成 ✅")
            else:
                logger.info("Qdrant 集合 'test_cases' 不存在，无需删除。")
        except Exception as e:
            logger.warning(f"清理 Qdrant 过程中出现提示 (请检查 Qdrant 容器是否启动): {e}")
    else:
        logger.info("系统未启用外部 Qdrant 向量库存储 (USE_EXTERNAL_VECTOR=False)，跳过外部清理。")

    print("\n🎉 所有符合要求的向量数据执行清理流程完毕！")
    
if __name__ == "__main__":
    try:
        asyncio.run(clear_all())
    except KeyboardInterrupt:
        print("\n操作强制终止。")
