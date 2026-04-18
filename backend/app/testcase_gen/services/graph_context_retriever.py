import asyncio
import logging
from typing import Optional, List, Dict, Any

logger = logging.getLogger("testcase_gen.graph_context")

_RETRY_ATTEMPTS = 3
_RETRY_DELAY = 1.0


async def _with_retry(fn, label: str):
    for attempt in range(1, _RETRY_ATTEMPTS + 1):
        try:
            return await fn()
        except Exception as e:
            if attempt < _RETRY_ATTEMPTS:
                logger.warning(
                    "%s 失败 (尝试 %d/%d): %s, %d秒后重试",
                    label,
                    attempt,
                    _RETRY_ATTEMPTS,
                    e,
                    _RETRY_DELAY,
                )
                await asyncio.sleep(_RETRY_DELAY * attempt)
            else:
                logger.error(
                    "%s 失败，已达最大重试次数 %d: %s", label, _RETRY_ATTEMPTS, e
                )
                return []


class GraphContextRetriever:
    """从 Neo4j 知识图谱检索结构化数据，格式化为 LLM 可读文本。

    为测试用例生成提供图谱级别的上下文：模块功能结构、已有用例覆盖、
    实体依赖关系、相关文档摘要。
    """

    def __init__(self, graph_ops):
        self._graph_ops = graph_ops

    async def retrieve(self, module: str = None, doc_type: str = None) -> str:
        """检索图谱知识，合并为一份 LLM 可读的上下文文本。

        参数:
            module: 限定模块名，为空则检索全图谱
            doc_type: 限定文档类型，为空则不限制

        返回:
            Markdown 格式的图谱上下文，无数据时返回空字符串
        """
        sections = []
        features_section = await self._build_features_section(module)
        if features_section:
            sections.append(features_section)

        tc_section = await self._build_test_cases_section(module)
        if tc_section:
            sections.append(tc_section)

        entity_section = await self._build_entity_relationships_section(
            module, doc_type
        )
        if entity_section:
            sections.append(entity_section)

        chunk_section = await self._build_chunk_summaries_section(module, doc_type)
        if chunk_section:
            sections.append(chunk_section)

        if not sections:
            return ""

        header = "# 知识图谱上下文\n\n"
        if module:
            header += f"限定模块: **{module}**\n\n"
        if doc_type:
            header += f"限定文档类型: **{doc_type}**\n\n"

        return header + "\n\n---\n\n".join(sections)

    # ------------------------------------------------------------------
    # 内部构建方法
    # ------------------------------------------------------------------

    async def _build_features_section(self, module: str = None) -> str:
        """构建模块-功能结构段落。"""
        if not module:
            return ""

        cypher = """
            MATCH (m:Module {name: $module})-[:CONTAINS]->(f:Feature)
            RETURN f.name AS feature
            ORDER BY f.name
        """
        rows = await _with_retry(
            lambda: self._graph_ops.run_cypher(cypher, {"module": module}),
            f"查询模块功能 [{module}]",
        )
        if not rows:
            return ""

        features = [r["feature"] for r in rows if r.get("feature")]
        lines = [
            f"## 模块功能结构\n\n模块 **{module}** 包含以下 {len(features)} 个功能:\n"
        ]
        for i, feat in enumerate(features, 1):
            lines.append(f"{i}. {feat}")
        return "\n".join(lines)

    async def _build_test_cases_section(self, module: str = None) -> str:
        """构建已有测试用例覆盖段落。"""
        if not module:
            return ""

        cypher = """
            MATCH (m:Module {name: $module})-[:CONTAINS]->(t:TestCase)
            RETURN t.name AS name, t.priority AS priority, t.description AS description
            ORDER BY t.name
        """
        rows = await _with_retry(
            lambda: self._graph_ops.run_cypher(cypher, {"module": module}),
            f"查询已有测试用例 [{module}]",
        )
        if not rows:
            return ""

        lines = [
            f"## 已有测试用例覆盖\n\n模块 **{module}** 已有以下 {len(rows)} 个测试用例:\n"
        ]
        for r in rows:
            name = r.get("name", "unknown")
            priority = r.get("priority", "未设置")
            desc = r.get("description", "")
            desc_preview = f" - {desc[:80]}" if desc else ""
            lines.append(f"- `{name}` (优先级: {priority}){desc_preview}")
        return "\n".join(lines)

    async def _build_entity_relationships_section(
        self, module: str = None, doc_type: str = None
    ) -> str:
        """构建实体依赖关系段落。"""
        where_clauses = [
            "NOT 'DocumentChunk' IN labels(n)",
            "NOT 'Module' IN labels(n)",
            "NOT 'Feature' IN labels(n)",
        ]
        params: Dict[str, Any] = {"limit": 50}

        if module:
            where_clauses.append("n.module = $module")
            params["module"] = module
        if doc_type:
            where_clauses.append("n.doc_type = $doc_type")
            params["doc_type"] = doc_type

        where_str = "WHERE " + " AND ".join(where_clauses)

        cypher = f"""
            MATCH (n)
            {where_str}
            OPTIONAL MATCH (n)-[r]->(m)
            WHERE NOT 'DocumentChunk' IN labels(m)
            WITH n, r, m
            LIMIT $limit
            RETURN n.name AS source, labels(n)[0] AS source_label,
                   type(r) AS rel_type,
                   m.name AS target, labels(m)[0] AS target_label
            ORDER BY source, rel_type
        """
        rows = await _with_retry(
            lambda: self._graph_ops.run_cypher(cypher, params),
            "查询实体依赖关系",
        )
        if not rows:
            return ""

        rels = []
        for r in rows:
            if r.get("rel_type") and r.get("target"):
                src_label = r.get("source_label", "Entity")
                tgt_label = r.get("target_label", "Entity")
                rels.append(
                    f"- ({r['source']}:{src_label}) "
                    f"--[{r['rel_type']}]--> "
                    f"({r['target']}:{tgt_label})"
                )

        if not rels:
            return ""

        lines = [f"## 实体依赖关系\n\n共发现 {len(rels)} 条实体关系:\n"]
        lines.extend(rels)
        return "\n".join(lines)

    async def _build_chunk_summaries_section(
        self, module: str = None, doc_type: str = None
    ) -> str:
        """构建相关文档分块摘要段落。"""
        where_clauses = []
        params: Dict[str, Any] = {"limit": 10}

        if module:
            where_clauses.append("c.module = $module")
            params["module"] = module
        if doc_type:
            where_clauses.append("c.doc_type = $doc_type")
            params["doc_type"] = doc_type

        where_str = "WHERE " + " AND ".join(where_clauses) if where_clauses else ""

        cypher = f"""
            MATCH (c:DocumentChunk)
            {where_str}
            RETURN c.filename AS filename, c.chunk_index AS chunk_index,
                   c.content[..200] AS preview
            ORDER BY c.filename, c.chunk_index
            LIMIT $limit
        """
        rows = await _with_retry(
            lambda: self._graph_ops.run_cypher(cypher, params),
            "查询文档分块摘要",
        )
        if not rows:
            return ""

        lines = [f"## 相关文档上下文\n\n以下文档分块与当前检索范围相关:\n"]
        for r in rows:
            filename = r.get("filename", "unknown")
            idx = r.get("chunk_index", "?")
            preview = r.get("preview", "")
            lines.append(f"- **{filename}** (分块 #{idx}): {preview}...")
        return "\n".join(lines)


# ------------------------------------------------------------------
# 全局实例
# ------------------------------------------------------------------

_graph_context_retriever: Optional[GraphContextRetriever] = None


def init_graph_context_retriever(graph_ops) -> GraphContextRetriever:
    """初始化全局图谱上下文检索器。"""
    global _graph_context_retriever
    _graph_context_retriever = GraphContextRetriever(graph_ops)
    logger.info("GraphContextRetriever 初始化完成")
    return _graph_context_retriever


def get_graph_context_retriever() -> Optional[GraphContextRetriever]:
    """获取全局图谱上下文检索器实例。"""
    return _graph_context_retriever
