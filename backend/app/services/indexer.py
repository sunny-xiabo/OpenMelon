import asyncio
import os
import re
import json
import time
import logging
from typing import List, Dict, Any, Optional
from app.config import settings
from app.services.file_tracker import file_tracker

_ilog = logging.getLogger("app.services.indexer")


class DocumentIndexer:
    def __init__(
        self,
        neo4j_client: Any,
        graph_ops: Any,
        vector_ops: Any,
        openai_async_client: Any,
    ):
        self.neo4j_client = neo4j_client
        self.graph_ops = graph_ops
        self.vector_ops = vector_ops
        self.openai_async_client = openai_async_client

    def _normalize_text(self, text: str) -> str:
        text = text.replace("\r\n", "\n").replace("\r", "\n")
        text = re.sub(r"[ \t]+", " ", text)
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text.strip()

    def _get_chunking_profile(self, doc_type: str) -> Dict[str, int]:
        profiles = {
            "需求文档": {"chunk_size": 900, "overlap": 120},
            "设计文档": {"chunk_size": 900, "overlap": 120},
            "接口文档": {"chunk_size": 520, "overlap": 80},
            "测试用例": {"chunk_size": 420, "overlap": 60},
            "用户手册": {"chunk_size": 760, "overlap": 100},
            "脑图": {"chunk_size": 320, "overlap": 40},
            "表格": {"chunk_size": 360, "overlap": 40},
        }
        return profiles.get(doc_type, {"chunk_size": 800, "overlap": 100})

    def _is_structural_header(self, block: str) -> bool:
        stripped = block.strip()
        if not stripped:
            return False
        header_patterns = [
            r"^#{1,6}\s+.+",
            r"^\d+(\.\d+){0,3}\s+.+",
            r"^第[一二三四五六七八九十百千0-9]+[章节部分条]\s*.+",
            r"^---\s*(Page|Sheet|Slide)\s*[:：]?\s*.+---?$",
        ]
        return any(re.match(pattern, stripped, re.IGNORECASE) for pattern in header_patterns)

    def _get_header_level(self, block: str) -> int:
        stripped = block.strip()
        md_match = re.match(r"^(#{1,6})\s+.+", stripped)
        if md_match:
            return len(md_match.group(1))

        num_match = re.match(r"^(\d+(?:\.\d+){0,3})\s+.+", stripped)
        if num_match:
            return len(num_match.group(1).split("."))

        cn_match = re.match(r"^第[一二三四五六七八九十百千0-9]+([章节部分条])\s*.+", stripped)
        if cn_match:
            level_map = {"章": 1, "节": 2, "部": 1, "分": 2, "条": 3}
            return level_map.get(cn_match.group(1), 1)

        if re.match(r"^---\s*(Page|Sheet|Slide)\s*[:：]?\s*.+---?$", stripped, re.IGNORECASE):
            return 1

        return 1

    def _split_into_blocks(self, text: str) -> List[Dict[str, Any]]:
        text = self._normalize_text(text)
        if not text:
            return []

        raw_parts = [part.strip() for part in re.split(r"\n\s*\n", text) if part.strip()]
        blocks: List[Dict[str, Any]] = []
        current_headers: List[str] = []

        for part in raw_parts:
            if self._is_structural_header(part):
                header = part.strip()
                level = self._get_header_level(header)
                current_headers = current_headers[: max(0, level - 1)]
                current_headers.append(header)
                current_headers = current_headers[-3:]
                continue

            prefix = "\n".join(current_headers).strip()
            blocks.append(
                {
                    "content": f"{prefix}\n{part}".strip() if prefix else part,
                    "body": part,
                    "header_text": prefix,
                    "headers": list(current_headers),
                }
            )

        if not blocks:
            blocks.append(
                {"content": text, "body": text, "header_text": "", "headers": []}
            )
        return blocks

    def _extract_block_metadata(self, headers: List[str]) -> Dict[str, Any]:
        metadata: Dict[str, Any] = {
            "section_path": " > ".join(headers) if headers else "",
            "page_label": None,
            "sheet_name": None,
            "slide_label": None,
            "block_type": "paragraph",
        }

        if not headers:
            return metadata

        last_header = headers[-1]
        page_match = re.match(
            r"^---\s*Page\s*[:：]?\s*(.+?)\s*---?$", last_header, re.IGNORECASE
        )
        sheet_match = re.match(
            r"^---\s*Sheet\s*[:：]?\s*(.+?)\s*---?$", last_header, re.IGNORECASE
        )
        slide_match = re.match(
            r"^---\s*Slide\s*[:：]?\s*(.+?)\s*---?$", last_header, re.IGNORECASE
        )

        if page_match:
            metadata["page_label"] = page_match.group(1).strip()
            metadata["block_type"] = "page"
        elif sheet_match:
            metadata["sheet_name"] = sheet_match.group(1).strip()
            metadata["block_type"] = "sheet"
        elif slide_match:
            metadata["slide_label"] = slide_match.group(1).strip()
            metadata["block_type"] = "slide"
        elif any(h.lstrip().startswith("#") for h in headers):
            metadata["block_type"] = "section"

        return metadata

    def _build_chunk_record(
        self, content: str, headers: Optional[List[str]], chunk_index: int
    ) -> Dict[str, Any]:
        metadata = self._extract_block_metadata(headers or [])
        return {
            "chunk_index": chunk_index,
            "content": self._normalize_text(content),
            "section_path": metadata["section_path"],
            "page_label": metadata["page_label"],
            "sheet_name": metadata["sheet_name"],
            "slide_label": metadata["slide_label"],
            "block_type": metadata["block_type"],
        }

    def _split_long_text(self, text: str, chunk_size: int, overlap: int) -> List[str]:
        text = text.strip()
        if not text:
            return []
        if len(text) <= chunk_size:
            return [text]

        pieces: List[str] = []
        start = 0
        text_len = len(text)
        sentence_boundary = re.compile(r"(?<=[。！？；.!?;])\s+")

        while start < text_len:
            end = min(start + chunk_size, text_len)
            segment = text[start:end]
            boundary_end = None

            para_rel = segment.rfind("\n\n")
            if para_rel != -1 and para_rel > int(chunk_size * 0.4):
                boundary_end = para_rel + 2
            else:
                matches = list(sentence_boundary.finditer(segment))
                if matches:
                    boundary_end = matches[-1].end()
                else:
                    ws = segment.rfind(" ")
                    if ws > int(chunk_size * 0.4):
                        boundary_end = ws

            if boundary_end:
                end = start + boundary_end
                segment = text[start:end]

            segment = segment.strip()
            if segment:
                pieces.append(segment)

            next_start = end - max(0, overlap)
            if next_start <= start:
                next_start = end
            start = next_start

        return pieces

    def _build_semantic_chunks(
        self, blocks: List[Dict[str, Any]], chunk_size: int, overlap: int
    ) -> List[Dict[str, Any]]:
        chunks: List[Dict[str, Any]] = []
        buffer = ""
        last_tail = ""
        buffer_headers: List[str] = []

        for block in blocks:
            content = block["content"].strip()
            body = block.get("body", content).strip()
            headers = block.get("headers", [])
            if not content:
                continue

            if len(content) > chunk_size:
                if buffer.strip():
                    chunks.append(
                        self._build_chunk_record(buffer.strip(), buffer_headers, len(chunks))
                    )
                    last_tail = buffer.strip()[-overlap:] if overlap > 0 else ""
                    buffer = ""
                    buffer_headers = []

                for piece in self._split_long_text(content, chunk_size, overlap):
                    chunks.append(
                        self._build_chunk_record(piece, headers, len(chunks))
                    )
                    last_tail = piece[-overlap:] if overlap > 0 else ""
                continue

            if buffer and headers == buffer_headers:
                candidate = f"{buffer}\n\n{body}".strip()
            else:
                candidate = f"{buffer}\n\n{content}".strip() if buffer else content
            if len(candidate) <= chunk_size:
                buffer = candidate
                buffer_headers = list(headers)
                continue

            if buffer.strip():
                chunks.append(
                    self._build_chunk_record(buffer.strip(), buffer_headers, len(chunks))
                )
                overlap_prefix = last_tail.strip()
                buffer = (
                    f"{overlap_prefix}\n{content}".strip()
                    if overlap_prefix and content not in overlap_prefix
                    else content
                )
            else:
                buffer = content
            buffer_headers = list(headers)
            last_tail = chunks[-1]["content"][-overlap:] if chunks and overlap > 0 else ""

        if buffer.strip():
            chunks.append(
                self._build_chunk_record(buffer.strip(), buffer_headers, len(chunks))
            )

        deduped: List[Dict[str, Any]] = []
        seen = set()
        for chunk in chunks:
            normalized = self._normalize_text(chunk["content"])
            if len(normalized) < 30:
                continue
            if normalized in seen:
                continue
            seen.add(normalized)
            deduped.append(
                {
                    **chunk,
                    "chunk_index": len(deduped),
                    "content": normalized,
                }
            )
        return deduped

    async def chunk_document(
        self, content: str, doc_type: str, chunk_size: int = 800, overlap: int = 100
    ) -> List[Dict[str, Any]]:
        profile = self._get_chunking_profile(doc_type)
        chunk_size = profile["chunk_size"] if chunk_size == 800 else chunk_size
        overlap = profile["overlap"] if overlap == 100 else overlap
        content = self._normalize_text(content)

        _ilog.info(
            "chunk_document | text_len=%d, chunk_size=%d, overlap=%d, doc_type=%s",
            len(content),
            chunk_size,
            overlap,
            doc_type,
        )
        blocks = self._split_into_blocks(content)
        _ilog.info("chunk_document | semantic_blocks=%d", len(blocks))
        chunks = self._build_semantic_chunks(blocks, chunk_size, overlap)
        _ilog.info(
            "chunk_document | done, chunks=%d",
            len(chunks),
        )
        return chunks

    async def generate_embedding(self, text: str) -> List[float]:
        dim = settings.EMBEDDING_DIM or 1024
        if not self.openai_async_client or not settings.EMBEDDING_MODEL:
            return [0.0] * dim
        try:
            model_name = settings.EMBEDDING_MODEL
            kwargs = {
                "input": [text],
                "model": model_name,
            }
            if settings.EMBEDDING_DIM and model_name and "text-embedding-3" in model_name:
                kwargs["dimensions"] = settings.EMBEDDING_DIM
            resp = await self.openai_async_client.embeddings.create(**kwargs)
            if resp.data and len(resp.data) > 0:
                emb = resp.data[0].embedding
                if isinstance(emb, list) and len(emb) > 0:
                    return emb
        except Exception:
            pass
        return [0.0] * dim

    async def index_file(
        self,
        file_content: str,
        doc_type: str,
        module: str,
        filename: str,
        file_path: Optional[str] = None,
        update_tracker: bool = True,
    ) -> int:
        t0 = time.monotonic()
        _ilog.info("%s | step=chunk_document start", filename)
        chunks = await self.chunk_document(
            file_content, doc_type, chunk_size=800, overlap=100
        )
        t1 = time.monotonic()
        _ilog.info(
            "%s | step=chunk_document done, chunks=%d, elapsed=%.1fs",
            filename,
            len(chunks),
            t1 - t0,
        )

        valid_chunks = [c for c in chunks if c["content"].strip()]
        if not valid_chunks:
            _ilog.info("%s | no valid chunks, returning 0", filename)
            return 0

        # Concurrent embedding generation
        _ilog.info(
            "%s | step=embedding start, %d chunks",
            filename,
            len(valid_chunks),
        )
        embeddings = await asyncio.gather(
            *[self.generate_embedding(c["content"].strip()) for c in valid_chunks],
            return_exceptions=True,
        )
        t2 = time.monotonic()
        _ilog.info(
            "%s | step=embedding done, elapsed=%.1fs",
            filename,
            t2 - t1,
        )

        # Batch prepare chunk data for Neo4j
        chunk_data = []
        for chunk, embedding in zip(valid_chunks, embeddings):
            if isinstance(embedding, Exception):
                embedding = [0.0] * (settings.EMBEDDING_DIM or 1024)

            chunk_id = f"chunk:{doc_type}:{filename}:{chunk['chunk_index']}"
            chunk_data.append(
                {
                    "chunk_id": chunk_id,
                    "doc_type": doc_type,
                    "module": module,
                    "filename": filename,
                    "chunk_index": chunk["chunk_index"],
                    "content": chunk["content"].strip(),
                    "section_path": chunk.get("section_path", ""),
                    "page_label": chunk.get("page_label"),
                    "sheet_name": chunk.get("sheet_name"),
                    "slide_label": chunk.get("slide_label"),
                    "block_type": chunk.get("block_type", "paragraph"),
                    "embedding": embedding,
                }
            )

        # Batch write all chunks to Neo4j in a single query
        _ilog.info(
            "%s | step=vector_write start, %d chunks",
            filename,
            len(chunk_data),
        )
        if chunk_data:
            if hasattr(self.vector_ops, "delete_chunks_by_file"):
                await self.vector_ops.delete_chunks_by_file(filename)
            if hasattr(self.vector_ops, "batch_create_chunks"):
                await self.vector_ops.batch_create_chunks(chunk_data)
            else:
                for cd in chunk_data:
                    if hasattr(self.vector_ops, "create_document_chunk"):
                        await self.vector_ops.create_document_chunk(
                            doc_type=cd["doc_type"],
                            module=cd["module"],
                            filename=cd["filename"],
                            chunk_index=cd["chunk_index"],
                            content=cd["content"],
                            section_path=cd["section_path"],
                            page_label=cd["page_label"],
                            sheet_name=cd["sheet_name"],
                            slide_label=cd["slide_label"],
                            block_type=cd["block_type"],
                            embedding=cd["embedding"],
                        )
        t3 = time.monotonic()
        _ilog.info(
            "%s | step=vector_write done, elapsed=%.1fs",
            filename,
            t3 - t2,
        )

        indexed_chunks = len(chunk_data)

        # Extract entities and persist in the graph
        _ilog.info("%s | step=entity_extract start", filename)
        entities = await self.extract_entities_from_text(file_content)
        t4 = time.monotonic()
        _ilog.info(
            "%s | step=entity_extract done, entities=%d, elapsed=%.1fs",
            filename,
            len(entities),
            t4 - t3,
        )

        # Create Module and Feature nodes for coverage tracking
        if module and module != "通用模块":
            await self._ensure_module_node(module)
            features = await self._extract_features(file_content, module)
            if features:
                await self._create_features(module, features)
                _ilog.info(
                    "%s | created Module '%s' with %d features",
                    filename,
                    module,
                    len(features),
                )

        if entities:
            _ilog.info(
                "%s | step=graph_write start, %d entities",
                filename,
                len(entities),
            )
            if hasattr(self.graph_ops, "batch_create_entities"):
                batch_entities = [
                    {
                        "labels": [ent.get("type", "Entity")],
                        "properties": {
                            "name": ent.get("name"),
                            **(ent.get("properties", {})),
                        },
                    }
                    for ent in entities
                ]
                await self.graph_ops.batch_create_entities(batch_entities)
            elif hasattr(self.graph_ops, "create_entity"):
                await asyncio.gather(
                    *[
                        self.graph_ops.create_entity(
                            name=ent.get("name"),
                            label=ent.get("type", "Entity"),
                            properties=ent.get("properties", {}),
                        )
                        for ent in entities
                    ]
                )

            relationships = []
            for i in range(len(entities) - 1):
                relationships.append(
                    (
                        entities[i].get("name"),
                        entities[i].get("type", "Entity"),
                        entities[i + 1].get("name"),
                        entities[i + 1].get("type", "Entity"),
                    )
                )

            if relationships:
                if hasattr(self.graph_ops, "batch_create_relationships"):
                    await self.graph_ops.batch_create_relationships(relationships)
                elif hasattr(self.graph_ops, "create_relationship"):
                    await asyncio.gather(
                        *[
                            self.graph_ops.create_relationship(
                                from_name=a,
                                from_label=a_label,
                                to_name=b,
                                to_label=b_label,
                                rel_type="RELATED_TO",
                                properties={},
                            )
                            for a, a_label, b, b_label in relationships
                        ]
                    )
        t5 = time.monotonic()
        _ilog.info(
            "%s | step=graph_write done, elapsed=%.1fs",
            filename,
            t5 - t4,
        )

        # 是否需要更新文件状态追踪器
        # (重新索引时 management_routes 会传 False，因为它自己会负责精准更新那一条记录，这里就不碰了，防止生成重复的假数据)
        if update_tracker:
            # 找一下追踪器里有没有同名的文件记录
            existing = [r for r in file_tracker.get_all_records() if r.get("filename") == filename]
            if existing:
                # 如果以前传过同名文件，就直接更新老记录的信息，不要再建新的一行了
                record_id = existing[0]["id"]
                file_tracker.update_record(
                    record_id,
                    doc_type=doc_type,
                    module=module,
                    chunk_count=indexed_chunks,
                    status="indexed",
                )
                if file_path:
                    file_tracker.update_record(record_id, file_path=file_path)
            else:
                # 如果是全新的文件，就在追踪器里加一条全新的记录（会在页面表格里多出一行）
                record = file_tracker.add_record(
                    filename=filename,
                    doc_type=doc_type,
                    module=module,
                    chunk_count=indexed_chunks,
                )
                if file_path:
                    file_tracker.update_record(record["id"], file_path=file_path)

        _ilog.info(
            "%s | TOTAL=%.1fs | chunk=%.1fs embed=%.1fs "
            "vec_write=%.1fs entity=%.1fs graph=%.1fs",
            filename,
            t5 - t0,
            t1 - t0,
            t2 - t1,
            t3 - t2,
            t4 - t3,
            t5 - t4,
        )

        return indexed_chunks

    async def index_directory(
        self, directory_path: str, doc_type: str, module: str
    ) -> int:
        total_chunks = 0
        if not os.path.isdir(directory_path):
            return 0
        for root, _, files in os.walk(directory_path):
            for fname in files:
                # consider common text-based extensions
                if not any(
                    fname.lower().endswith(ext)
                    for ext in [".md", ".txt", ".rst", ".py", ".java", ".json", ".mdx"]
                ):
                    continue
                fpath = os.path.join(root, fname)
                try:
                    with open(fpath, "r", encoding="utf-8", errors="ignore") as f:
                        content = f.read()
                    chunks_indexed = await self.index_file(
                        content, doc_type, module, filename=fname
                    )
                    total_chunks += chunks_indexed
                except Exception:
                    # Ignore unreadable files gracefully
                    continue
        return total_chunks

    async def extract_entities_from_text(self, text: str) -> List[Dict[str, Any]]:
        entities: List[Dict[str, Any]] = []
        if self.openai_async_client is not None:
            try:
                resp = await self.openai_async_client.chat.completions.create(
                    model=settings.CHAT_MODEL,
                    messages=[
                        {
                            "role": "system",
                            "content": "Extract named entities from the text as a JSON array of objects with keys: name, type, properties. Return ONLY valid JSON.",
                        },
                        {"role": "user", "content": text[:4000]},
                    ],
                    temperature=0.1,
                    max_tokens=500,
                )
                content = resp.choices[0].message.content.strip()
                try:
                    items = json.loads(content)
                    if isinstance(items, list):
                        entities = items
                except json.JSONDecodeError:
                    pass
            except Exception:
                pass
        if not entities:
            pattern = r"\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b"
            for m in re.finditer(pattern, text):
                entities.append(
                    {"name": m.group(1), "type": "entity", "properties": {}}
                )
        return entities

    async def _ensure_module_node(self, module_name: str):
        if hasattr(self.graph_ops, "run_cypher"):
            await self.graph_ops.run_cypher(
                "MERGE (m:Module {name: $name})",
                {"name": module_name},
            )

    async def _extract_features(self, text: str, module_name: str) -> List[str]:
        if not self.openai_async_client:
            return []
        try:
            resp = await self.openai_async_client.chat.completions.create(
                model=settings.CHAT_MODEL,
                messages=[
                    {
                        "role": "system",
                        "content": "Extract feature/function names from the document text for the given module. Return ONLY a JSON array of strings. Each string is a feature name.",
                    },
                    {
                        "role": "user",
                        "content": f"Module: {module_name}\n\n{text[:3000]}",
                    },
                ],
                temperature=0.1,
                max_tokens=1000,
            )
            content = resp.choices[0].message.content.strip()
            features = json.loads(content)
            if isinstance(features, list):
                return [str(f) for f in features if str(f).strip()]
        except Exception:
            pass
        return []

    async def _create_features(self, module_name: str, features: List[str]):
        if not features or not hasattr(self.graph_ops, "run_cypher"):
            return
        cypher = """
            UNWIND $features AS feat
            MERGE (m:Module {name: $module})
            MERGE (f:Feature {name: feat})
            MERGE (m)-[:CONTAINS]->(f)
        """
        await self.graph_ops.run_cypher(
            cypher, {"module": module_name, "features": features}
        )
