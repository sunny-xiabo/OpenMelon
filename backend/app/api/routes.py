import json
from fastapi import (
    APIRouter,
    HTTPException,
    Query,
    UploadFile,
    File,
    Form,
    Request,
    Response,
)
from typing import Optional, List
import os
import uuid
import asyncio
import aiofiles
import logging
from concurrent.futures import ThreadPoolExecutor
from app.models.graph_types import DOCUMENT_CHUNK_NODE_TYPE, get_primary_node_type

logger = logging.getLogger("graph_rag")

# Cache for virtual chunk nodes (from vector search fallback)
_virtual_node_cache = {}

from app.api.schemas import (
    QueryRequest,
    QueryResponse,
    Citation,
    ChatMessage,
    ContextChunk,
    GraphData,
    GraphNode,
    GraphRel,
    NodeTypeConfigResponse,
    NodeTypeConfigUpsertRequest,
    NodeTypeConfigUpdateRequest,
    NodeTypeMutationResponse,
    NodeTypeDeleteResponse,
    IndexFileRequest,
    IndexDirectoryRequest,
    IndexResponse,
    UploadResponse,
    CoverageResponse,
    ModuleCoverage,
    ErrorResponse,
)
from app.services.file_parser import (
    parse_file,
    detect_format,
    auto_detect_doc_type,
    auto_detect_module,
    SUPPORTED_FORMATS,
)
from app.services.metrics import metrics_collector
from app.services.session_manager import session_manager
from app.services.enterprise_webhook import enterprise_integration
from app.config import settings
from app.models.graph_types import (
    list_node_type_configs,
    create_node_type_config,
    update_node_type_config,
    delete_node_type_config,
)
import time

router = APIRouter(prefix="/api", tags=["api"])


@router.get("/ping")
async def ping():
    return {"status": "success", "message": "pong"}


@router.get("/metrics")
async def get_metrics(req: Request):
    try:
        collector = getattr(req.app.state, "metrics_collector", None)
        if collector:
            return collector.get_all_metrics()
        return {"metrics": "not_configured"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/metrics/reset")
async def reset_metrics(req: Request):
    try:
        collector = getattr(req.app.state, "metrics_collector", None)
        if collector:
            collector.reset()
            return {"reset": True}
        return {"reset": False, "reason": "not_configured"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sessions")
async def list_sessions(req: Request):
    sessions = session_manager.list_sessions()
    return {"sessions": sessions}


@router.get("/history/{session_id}")
async def history(session_id: str, req: Request):
    try:
        history = session_manager.get_history(session_id)
        return {"session_id": session_id, "history": history}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/history/{session_id}")
async def delete_session_history(session_id: str, req: Request):
    try:
        deleted = session_manager.delete_session(session_id)
        return {"session_id": session_id, "deleted": deleted}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/webhook/{platform}")
async def webhook_platform(platform: str, req: Request):
    try:
        data = await req.json()
        answer = data.get("answer", "")
        question = data.get("question", "")
        configured = enterprise_integration.is_platform_configured(platform)
        if not configured:
            raise HTTPException(
                status_code=400, detail=f"Platform '{platform}' not configured"
            )
        ok = await enterprise_integration.send_answer(platform, answer, question)
        return {"platform": platform, "sent": ok}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/webhook/wecom")
async def wecom_verify_get(req: Request):
    from app.services.enterprise_webhook import enterprise_integration

    if not enterprise_integration.is_wecom_callback_configured():
        raise HTTPException(status_code=400, detail="Wecom callback not configured")

    params = req.query_params
    msg_signature = params.get("msg_signature", "")
    timestamp = params.get("timestamp", "")
    nonce = params.get("nonce", "")
    echostr = params.get("echostr", "")

    callback = enterprise_integration.wecom_callback
    decrypted = callback.verify_url(msg_signature, timestamp, nonce, echostr)

    if not decrypted:
        raise HTTPException(status_code=403, detail="Verify failed")

    return Response(content=decrypted, media_type="text/plain")


@router.post("/webhook/wecom")
async def wecom_callback(req: Request):
    from app.services.enterprise_webhook import enterprise_integration

    if not enterprise_integration.is_wecom_callback_configured():
        raise HTTPException(status_code=400, detail="Wecom callback not configured")

    params = req.query_params
    msg_signature = params.get("msg_signature", "")
    timestamp = params.get("timestamp", "")
    nonce = params.get("nonce", "")

    post_data = await req.body()
    callback = enterprise_integration.wecom_callback
    message = callback.decrypt_message(
        msg_signature, timestamp, nonce, post_data.decode("utf-8")
    )

    if not message or message.get("msg_type") != "text":
        return "success"

    user_question = message.get("content", "").strip()
    user_id = message.get("user_id", "")
    agent_id = message.get("agent_id", "")

    if not user_question:
        return "success"

    try:
        from app.engine.intent.router import IntentRouter
        from app.engine.retrieval.multi_channel import MultiChannelRetriever
        from app.engine.rag.generator import RAGGenerator

        driver = req.app.state.neo4j_driver
        retriever = MultiChannelRetriever(driver)
        router = IntentRouter(retriever)
        generator = RAGGenerator(retriever)

        intent_result = await router.route(user_question)
        retrieval_method = intent_result.get("method", "vector")
        context_chunks = intent_result.get("chunks", [])

        context_text = "\n\n".join(
            [
                f"[{c.get('filename', 'unknown')}]\n{c.get('content', '')}"
                for c in context_chunks[:5]
            ]
        )

        answer = await generator.generate(user_question, context_text)

        await enterprise_integration.send_wecom_reply(user_id, answer, agent_id)

    except Exception as e:
        await enterprise_integration.send_wecom_reply(
            user_id, f"处理出错: {str(e)}", agent_id
        )

    return "success"


@router.get("/webhook/dingtalk")
async def dingtalk_verify_get(req: Request):
    from app.services.enterprise_webhook import enterprise_integration

    if not enterprise_integration.is_dingtalk_callback_configured():
        raise HTTPException(status_code=400, detail="DingTalk callback not configured")

    params = req.query_params
    signature = params.get("signature", "")
    timestamp = params.get("timestamp", "")
    nonce = params.get("nonce", "")
    echostr = params.get("echostr", "")

    callback = enterprise_integration.dingtalk_callback
    if callback.verify_url(signature, timestamp, nonce, echostr):
        return Response(content=echostr, media_type="text/plain")
    raise HTTPException(status_code=403, detail="Verify failed")


@router.post("/webhook/dingtalk")
async def dingtalk_callback(req: Request):
    from app.services.enterprise_webhook import enterprise_integration

    if not enterprise_integration.is_dingtalk_callback_configured():
        raise HTTPException(status_code=400, detail="DingTalk callback not configured")

    params = req.query_params
    signature = params.get("signature", "")
    timestamp = params.get("timestamp", "")
    nonce = params.get("nonce", "")

    post_data = await req.body()
    post_str = post_data.decode("utf-8")

    callback = enterprise_integration.dingtalk_callback
    if not callback.verify_callback(signature, timestamp, nonce, post_str):
        raise HTTPException(status_code=403, detail="Verify failed")

    message = callback.parse_message(post_str)
    if not message or message.get("msgtype") != "text":
        return "success"

    user_question = message.get("content", {}).get("text", "").strip()
    user_id = message.get("fromUserId", "")

    if not user_question:
        return "success"

    try:
        from app.engine.intent.router import IntentRouter
        from app.engine.retrieval.multi_channel import MultiChannelRetriever
        from app.engine.rag.generator import RAGGenerator

        driver = req.app.state.neo4j_driver
        retriever = MultiChannelRetriever(driver)
        router = IntentRouter(retriever)
        generator = RAGGenerator(retriever)

        intent_result = await router.route(user_question)
        context_chunks = intent_result.get("chunks", [])

        context_text = "\n\n".join(
            [
                f"[{c.get('filename', 'unknown')}]\n{c.get('content', '')}"
                for c in context_chunks[:5]
            ]
        )

        answer = await generator.generate(user_question, context_text)

        await enterprise_integration.send_dingtalk_reply(user_id, answer)

    except Exception as e:
        await enterprise_integration.send_dingtalk_reply(user_id, f"处理出错: {str(e)}")

    return "success"


@router.get("/webhook/feishu")
async def feishu_verify_get(req: Request):
    from app.services.enterprise_webhook import enterprise_integration

    if not enterprise_integration.is_feishu_callback_configured():
        raise HTTPException(status_code=400, detail="Feishu callback not configured")

    params = req.query_params
    verification_token = params.get("verification_token", "")

    callback = enterprise_integration.feishu_callback
    if callback.verify_url(verification_token):
        challenge = params.get("challenge", "")
        return Response(content=challenge, media_type="text/plain")
    raise HTTPException(status_code=403, detail="Verify failed")


@router.post("/webhook/feishu")
async def feishu_callback(req: Request):
    from app.services.enterprise_webhook import enterprise_integration

    if not enterprise_integration.is_feishu_callback_configured():
        raise HTTPException(status_code=400, detail="Feishu callback not configured")

    data = await req.json()
    callback = enterprise_integration.feishu_callback
    message = callback.parse_message(json.dumps(data))

    if not message or message.get("msg_type") != "text":
        return {"msg_type": "success"}

    user_question = message.get("content", "").strip()
    user_id = message.get("user_id", "")

    if not user_question:
        return {"msg_type": "success"}

    try:
        from app.engine.intent.router import IntentRouter
        from app.engine.retrieval.multi_channel import MultiChannelRetriever
        from app.engine.rag.generator import RAGGenerator

        driver = req.app.state.neo4j_driver
        retriever = MultiChannelRetriever(driver)
        router = IntentRouter(retriever)
        generator = RAGGenerator(retriever)

        intent_result = await router.route(user_question)
        context_chunks = intent_result.get("chunks", [])

        context_text = "\n\n".join(
            [
                f"[{c.get('filename', 'unknown')}]\n{c.get('content', '')}"
                for c in context_chunks[:5]
            ]
        )

        answer = await generator.generate(user_question, context_text)

        await enterprise_integration.send_feishu_reply(user_id, answer)

    except Exception as e:
        await enterprise_integration.send_feishu_reply(user_id, f"处理出错: {str(e)}")

    return {"msg_type": "success"}


@router.post("/query", response_model=QueryResponse)
async def query(request: QueryRequest, req: Request):
    use_agentic = req.query_params.get("use_agentic", "false").lower() == "true"
    session_id = req.query_params.get("session_id") or None

    if use_agentic and hasattr(req.app.state, "agentic_rag"):
        agentic = req.app.state.agentic_rag
        agentic_result = await agentic.query(request.question)
        citations = []
        for c in agentic_result.get("sources", []) or []:
            try:
                citations.append(
                    Citation(source_type="vector", filename=c.get("source", ""))
                )
            except Exception:
                pass
        return QueryResponse(
            answer=agentic_result.get("answer", ""),
            citations=citations,
            retrieval_method="agentic",
            reasoning_steps=agentic_result.get("reasoning_steps"),
            session_id=session_id,
        )

    start_time = time.time()
    session_id = req.query_params.get("session_id") or None
    had_exception = False
    try:
        intent_router = req.app.state.intent_router
        retriever = req.app.state.retriever
        generator = req.app.state.generator
        history_messages = (
            session_manager.get_history(session_id)[-6:]
            if session_id and request.include_history
            else []
        )

        intent_result = await intent_router.process(request.question)
        intent = intent_result["intent"]
        entities = intent_result["entities"]

        retrieval_result = await retriever.retrieve(intent, entities, request.question)

        if intent == "visualization":
            graph_data_raw = retrieval_result.get("graph_data", {})
            context = retrieval_result.get("context_text", "")
            vis_summary = await generator.generate_visualization_summary(graph_data_raw)

            nodes = [
                GraphNode(
                    id=n.get("id", ""),
                    label=n.get("label", ""),
                    group=n.get("group", "Entity"),
                )
                for n in graph_data_raw.get("nodes", [])
            ]
            rels = [
                GraphRel(
                    source=r.get("from", ""),
                    target=r.get("to", ""),
                    label=r.get("label", ""),
                )
                for r in graph_data_raw.get("relationships", [])
            ]

            return QueryResponse(
                answer=vis_summary,
                citations=[],
                retrieval_method="visualization",
                graph_data=GraphData(nodes=nodes, relationships=rels),
                session_id=session_id,
                history_used=[
                    ChatMessage(**message) for message in history_messages
                ],
            )

        if intent == "hybrid_query":
            context = retrieval_result.get("merged_context", "")
        else:
            context = retrieval_result.get("context_text", "")

        # Fallback: 如果图谱检索返回内容过少，降级到向量检索
        if intent == "graph_query" and len(context.strip()) < 50:
            logger.info(
                f"Graph retrieval returned minimal context ({len(context)} chars), falling back to vector search"
            )
            retrieval_result = await retriever.retrieve(
                "vector_query", entities, request.question
            )
            context = retrieval_result.get("context_text", "")
            intent = "vector_query"

        answer_result = await generator.generate_answer(
            request.question, context, intent, history_messages
        )

        citations = []
        context_chunks = []
        if "chunks" in retrieval_result:
            citations = generator.extract_citations(
                retrieval_result["chunks"], "vector"
            )
            context_chunks.extend(
                [
                    ContextChunk(
                        source_type="vector",
                        filename=chunk.get("filename"),
                        doc_type=chunk.get("doc_type"),
                        chunk_index=chunk.get("chunk_index"),
                        content=chunk.get("content", ""),
                        section_path=chunk.get("section_path"),
                        page_label=chunk.get("page_label"),
                        sheet_name=chunk.get("sheet_name"),
                        slide_label=chunk.get("slide_label"),
                        block_type=chunk.get("block_type"),
                    )
                    for chunk in retrieval_result["chunks"]
                ]
            )
        if "graph_results" in retrieval_result:
            citations.append(Citation(source_type="graph"))
            graph_context = retrieval_result["graph_results"].get("context_text", "")
            if graph_context:
                context_chunks.insert(
                    0,
                    ContextChunk(
                        source_type="graph",
                        content=graph_context,
                    ),
                )
        elif intent == "graph_query" and context:
            context_chunks.append(
                ContextChunk(
                    source_type="graph",
                    content=context,
                )
            )

        method_map = {
            "graph_query": "graph",
            "vector_query": "vector",
            "hybrid_query": "hybrid",
            "visualization": "visualization",
        }

        if session_id:
            session_manager.add_message(session_id, "user", request.question)
            session_manager.add_message(
                session_id, "assistant", answer_result["answer"]
            )

        return QueryResponse(
            answer=answer_result["answer"],
            citations=citations,
            retrieval_method=method_map.get(intent, "vector"),
            session_id=session_id,
            context_chunks=context_chunks,
            history_used=[ChatMessage(**message) for message in history_messages],
        )
    except Exception as e:
        had_exception = True
        duration_ms = (time.time() - start_time) * 1000
        metrics_collector.record_query(
            duration_ms=duration_ms, success=False, error=str(e)
        )
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if not had_exception:
            duration_ms = (time.time() - start_time) * 1000
            metrics_collector.record_query(duration_ms=duration_ms, success=True)


@router.get("/graph/full", response_model=GraphData)
async def graph_full(
    req: Request,
    limit: int = Query(default=1000, ge=1, le=5000),
    doc_type: Optional[str] = Query(default=None),
    module: Optional[str] = Query(default=None),
    include_chunks: bool = Query(default=False),
):
    try:
        graph_ops = req.app.state.graph_ops
        subgraph = await graph_ops.get_full_graph(
            limit=limit, doc_type=doc_type, module=module, include_chunks=include_chunks
        )

        nodes = [
            GraphNode(
                id=n.id,
                label=n.properties.get("name", n.id),
                group=get_primary_node_type(n.labels),
            )
            for n in subgraph.nodes
        ]
        rels = [
            GraphRel(source=r.source, target=r.target, label=r.type)
            for r in subgraph.relationships
        ]

        return GraphData(nodes=nodes, relationships=rels)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/graph/filters")
async def graph_filters(req: Request):
    try:
        graph_ops = req.app.state.graph_ops
        return await graph_ops.get_doc_types_and_modules()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/graph/status")
async def graph_status(req: Request):
    try:
        graph_ops = req.app.state.graph_ops
        return await graph_ops.get_graph_status()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/graph/node-types", response_model=NodeTypeConfigResponse)
async def graph_node_types():
    try:
        return NodeTypeConfigResponse(node_types=list_node_type_configs())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/graph/node-types", response_model=NodeTypeMutationResponse)
async def create_graph_node_type(payload: NodeTypeConfigUpsertRequest):
    try:
        node_type = create_node_type_config(payload.model_dump())
        return NodeTypeMutationResponse(
            success=True,
            message=f"节点类型 {node_type['type']} 已创建",
            node_type=node_type,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/graph/node-types/{node_type}", response_model=NodeTypeMutationResponse)
async def update_graph_node_type(
    node_type: str, payload: NodeTypeConfigUpdateRequest
):
    try:
        updated = update_node_type_config(node_type, payload.model_dump())
        return NodeTypeMutationResponse(
            success=True,
            message=f"节点类型 {node_type} 已更新",
            node_type=updated,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/graph/node-types/{node_type}", response_model=NodeTypeDeleteResponse)
async def delete_graph_node_type(node_type: str):
    try:
        delete_node_type_config(node_type)
        return NodeTypeDeleteResponse(
            success=True,
            message=f"节点类型 {node_type} 已删除",
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/graph/node/{node_id}")
async def graph_node_detail(req: Request, node_id: str):
    try:
        # Check virtual node cache first
        if node_id in _virtual_node_cache:
            return _virtual_node_cache[node_id]
        graph_ops = req.app.state.graph_ops
        node_data = await graph_ops.get_node_by_id(node_id)
        if not node_data:
            raise HTTPException(status_code=404, detail="Node not found")
        return node_data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/graph/entity/{name}", response_model=GraphData)
async def graph_entity(
    req: Request, name: str, depth: int = Query(default=2, ge=1, le=5)
):
    try:
        graph_ops = req.app.state.graph_ops
        vector_ops = req.app.state.vector_ops
        llm_client = req.app.state.llm_client

        subgraph = await graph_ops.get_entity_subgraph(name, depth=depth)

        if subgraph.nodes:
            nodes = [
                GraphNode(
                    id=n.id,
                    label=n.properties.get("name", n.id),
                    group=get_primary_node_type(n.labels),
                )
                for n in subgraph.nodes
            ]
            rels = [
                GraphRel(source=r.source, target=r.target, label=r.type)
                for r in subgraph.relationships
            ]
            return GraphData(nodes=nodes, relationships=rels)

        try:
            model_name = settings.EMBEDDING_MODEL
            kwargs = {
                "model": model_name,
                "input": [name],
            }
            if settings.EMBEDDING_DIM and model_name and "text-embedding-3" in model_name:
                kwargs["dimensions"] = settings.EMBEDDING_DIM
            response = await llm_client.embeddings.create(**kwargs)
            query_embedding = response.data[0].embedding

            similar_chunks = await vector_ops.similarity_search(
                query_embedding=query_embedding,
                top_k=10,
            )

            if similar_chunks:
                nodes = []
                rels = []

                for i, chunk in enumerate(similar_chunks):
                    chunk_id = f"chunk_{i}"
                    content_preview = chunk.get("content", "")[:100].replace("\n", " ")
                    nodes.append(
                        GraphNode(
                            id=chunk_id,
                            label=chunk.get("filename", "文档")[:20],
                            group=DOCUMENT_CHUNK_NODE_TYPE,
                            title=f"{chunk.get('filename', '')} - {chunk.get('chunk_index', 0) + 1}\n{content_preview}...",
                        )
                    )
                    _virtual_node_cache[chunk_id] = {
                        "id": chunk_id,
                        "labels": [DOCUMENT_CHUNK_NODE_TYPE],
                        "properties": {
                            "filename": chunk.get("filename", ""),
                            "chunk_index": chunk.get("chunk_index", 0),
                            "doc_type": chunk.get("doc_type", ""),
                            "module": chunk.get("module", ""),
                            "content": chunk.get("content", ""),
                        },
                    }

                return GraphData(nodes=nodes, relationships=rels)

        except Exception:
            pass

        return GraphData(nodes=[], relationships=[])

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/graph/coverage", response_model=CoverageResponse)
async def graph_coverage(req: Request):
    try:
        coverage_service = req.app.state.coverage_service
        report = await coverage_service.get_coverage_report()

        modules = [
            ModuleCoverage(
                module_name=m["module_name"],
                feature_count=m["feature_count"],
                test_case_count=m["test_case_count"],
                coverage_percentage=m["coverage_percentage"],
            )
            for m in report
        ]

        return CoverageResponse(modules=modules)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/graph/coverage/{module_name}")
async def graph_coverage_detail(module_name: str, req: Request):
    try:
        coverage_service = req.app.state.coverage_service
        detail = await coverage_service.get_module_coverage(module_name)
        return detail
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/index/file", response_model=IndexResponse)
async def index_file(request: IndexFileRequest, req: Request):
    try:
        indexer = req.app.state.indexer
        chunks_indexed = await indexer.index_file(
            file_content=request.file_content,
            doc_type=request.doc_type,
            module=request.module,
            filename=request.filename,
        )

        return IndexResponse(
            success=True,
            chunks_indexed=chunks_indexed,
            message=f"Indexed {chunks_indexed} chunks from {request.filename}",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/index/directory", response_model=IndexResponse)
async def index_directory(request: IndexDirectoryRequest, req: Request):
    try:
        indexer = req.app.state.indexer
        if not os.path.isdir(request.directory_path):
            return IndexResponse(
                success=False,
                chunks_indexed=0,
                message=f"Directory not found: {request.directory_path}",
            )

        chunks_indexed = await indexer.index_directory(
            directory_path=request.directory_path,
            doc_type=request.doc_type,
            module=request.module,
        )

        return IndexResponse(
            success=True,
            chunks_indexed=chunks_indexed,
            message=f"Indexed {chunks_indexed} chunks from {request.directory_path}",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/upload", response_model=UploadResponse)
async def upload_files(
    req: Request,
    files: List[UploadFile] = File(...),
    doc_type: Optional[str] = Form(None),
    module: Optional[str] = Form(None),
):
    try:
        indexer = req.app.state.indexer
        details = []
        total_chunks = 0

        for upload_file in files:
            if not upload_file.filename:
                continue

            ext = detect_format(upload_file.filename)
            if not ext:
                details.append(
                    {
                        "filename": upload_file.filename,
                        "success": False,
                        "message": f"Unsupported format: {ext}",
                        "chunks": 0,
                    }
                )
                continue

            try:
                file_bytes = await upload_file.read()

                loop = asyncio.get_running_loop()
                text_content, filename = await loop.run_in_executor(
                    _upload_executor,
                    _parse_file_sync,
                    file_bytes,
                    upload_file.filename,
                )

                if not text_content.strip():
                    details.append(
                        {
                            "filename": filename,
                            "success": False,
                            "message": "No text content extracted",
                            "chunks": 0,
                        }
                    )
                    continue

                resolved_doc_type = doc_type or auto_detect_doc_type(
                    text_content, filename
                )
                resolved_module = module or auto_detect_module(text_content, filename)

                chunks_indexed = await indexer.index_file(
                    file_content=text_content,
                    doc_type=resolved_doc_type,
                    module=resolved_module,
                    filename=filename,
                )

                total_chunks += chunks_indexed
                details.append(
                    {
                        "filename": filename,
                        "success": True,
                        "doc_type": resolved_doc_type,
                        "module": resolved_module,
                        "chunks": chunks_indexed,
                        "message": f"Indexed {chunks_indexed} chunks",
                    }
                )

            except Exception as e:
                details.append(
                    {
                        "filename": upload_file.filename,
                        "success": False,
                        "message": str(e),
                        "chunks": 0,
                    }
                )

        files_indexed = sum(1 for d in details if d["success"])

        return UploadResponse(
            success=files_indexed > 0,
            files_indexed=files_indexed,
            total_chunks=total_chunks,
            details=details,
            message=f"Indexed {files_indexed}/{len(files)} files, {total_chunks} chunks total",
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _parse_file_sync(content_bytes: bytes, filename: str):
    from app.services.file_parser import parse_file

    class _TempFile:
        def __init__(self, content, name):
            self.file = content
            self.filename = name

        async def read(self):
            return self.file

    import asyncio as _asyncio

    return _asyncio.run(parse_file(_TempFile(content_bytes, filename)))


@router.post("/upload/directory", response_model=UploadResponse)
async def upload_directory(
    req: Request,
    files: List[UploadFile] = File(...),
    doc_type: Optional[str] = Form(None),
    module: Optional[str] = Form(None),
):
    try:
        indexer = req.app.state.indexer
        details = []
        total_chunks = 0

        for upload_file in files:
            if not upload_file.filename:
                continue

            ext = detect_format(upload_file.filename)
            if not ext:
                details.append(
                    {
                        "filename": upload_file.filename,
                        "success": False,
                        "message": f"Unsupported format",
                        "chunks": 0,
                    }
                )
                continue

            try:
                file_bytes = await upload_file.read()

                loop = asyncio.get_running_loop()
                text_content, filename = await loop.run_in_executor(
                    _upload_executor,
                    _parse_file_sync,
                    file_bytes,
                    upload_file.filename,
                )

                if not text_content.strip():
                    details.append(
                        {
                            "filename": filename,
                            "success": False,
                            "message": "No text content extracted",
                            "chunks": 0,
                        }
                    )
                    continue

                resolved_doc_type = doc_type or auto_detect_doc_type(
                    text_content, filename
                )
                resolved_module = module or auto_detect_module(text_content, filename)

                chunks_indexed = await indexer.index_file(
                    file_content=text_content,
                    doc_type=resolved_doc_type,
                    module=resolved_module,
                    filename=filename,
                )

                total_chunks += chunks_indexed
                details.append(
                    {
                        "filename": filename,
                        "success": True,
                        "doc_type": resolved_doc_type,
                        "module": resolved_module,
                        "chunks": chunks_indexed,
                        "message": f"Indexed {chunks_indexed} chunks",
                    }
                )

            except Exception as e:
                details.append(
                    {
                        "filename": upload_file.filename,
                        "success": False,
                        "message": str(e),
                        "chunks": 0,
                    }
                )

        files_indexed = sum(1 for d in details if d["success"])

        return UploadResponse(
            success=files_indexed > 0,
            files_indexed=files_indexed,
            total_chunks=total_chunks,
            details=details,
            message=f"Directory import: {files_indexed}/{len(files)} files indexed, {total_chunks} chunks total",
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/upload/formats")
async def supported_formats():
    return {"formats": list(SUPPORTED_FORMATS.keys())}


from app.services.upload_task_manager import upload_task_manager
from app.api.management_routes import router as management_router

router.include_router(management_router)


LOG_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "logs"
)

LOG_FILES = {
    "graph_rag.log": LOG_DIR,
    "graph_rag_error.log": LOG_DIR,
}


@router.get("/logs")
async def get_logs(
    filename: str = Query(default="graph_rag.log"),
    lines: int = Query(default=200, ge=1, le=5000),
):
    if filename not in LOG_FILES:
        raise HTTPException(status_code=400, detail=f"Unknown log file: {filename}")
    log_path = os.path.join(LOG_FILES[filename], filename)
    if not os.path.isfile(log_path):
        return {"filename": filename, "lines": [], "total_lines": 0}
    try:
        with open(log_path, "r", encoding="utf-8") as f:
            all_lines = f.readlines()
        tail = all_lines[-lines:] if len(all_lines) > lines else all_lines
        return {
            "filename": filename,
            "lines": [l.rstrip("\n") for l in tail],
            "total_lines": len(all_lines),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/logs/list")
async def list_logs():
    result = []
    for name, dir_path in LOG_FILES.items():
        full_path = os.path.join(dir_path, name)
        size = os.path.getsize(full_path) if os.path.isfile(full_path) else 0
        result.append(
            {"filename": name, "size_bytes": size, "exists": os.path.isfile(full_path)}
        )
    return {"logs": result}


UPLOAD_TEMP_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "uploads"
)
os.makedirs(UPLOAD_TEMP_DIR, exist_ok=True)

UPLOAD_STORE_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "uploads"
)
os.makedirs(UPLOAD_STORE_DIR, exist_ok=True)

_parse_executor = ThreadPoolExecutor(max_workers=3, thread_name_prefix="parse-worker")


def _parse_file_sync_wrapper(content_bytes: bytes, filename: str):
    from app.services.file_parser import parse_file

    class _TempFile:
        def __init__(self, content, name):
            self.file = content
            self.filename = name

        async def read(self):
            return self.file

    import asyncio as _asyncio

    return _asyncio.run(parse_file(_TempFile(content_bytes, filename)))


async def _process_upload_task(
    task,
    saved_files: list,
    doc_type: Optional[str],
    module: Optional[str],
    indexer,
):
    import sys as _sys
    import datetime as _dt

    def _log(msg):
        ts = _dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        _sys.stdout.write(f"[upload-task] [{ts}] {msg}\n")
        _sys.stdout.flush()

    task.status = "processing"
    try:
        details = []
        total_chunks = 0
        for file_path, original_name in saved_files:
            try:
                _log(f"processing file: {original_name}")
                ext = detect_format(original_name)
                if not ext:
                    details.append(
                        {
                            "filename": original_name,
                            "success": False,
                            "message": f"Unsupported format",
                            "chunks": 0,
                        }
                    )
                    task.processed += 1
                    continue

                _log(f"reading file content")
                with open(file_path, "rb") as f:
                    content_bytes = f.read()
                _log(f"file size: {len(content_bytes)} bytes")

                _log(f"parsing file {original_name} (in thread)")
                loop = asyncio.get_running_loop()
                text_content, filename = await loop.run_in_executor(
                    _parse_executor,
                    _parse_file_sync_wrapper,
                    content_bytes,
                    original_name,
                )
                _log(f"parsed, text length: {len(text_content)} chars")

                # Save file permanently for re-index
                file_id = str(uuid.uuid4())
                ext = os.path.splitext(original_name)[1]
                perm_path = os.path.join(UPLOAD_STORE_DIR, f"{file_id}{ext}")
                with open(perm_path, "wb") as f:
                    f.write(content_bytes)

                if not text_content.strip():
                    details.append(
                        {
                            "filename": filename,
                            "success": False,
                            "message": "No text content extracted",
                            "chunks": 0,
                        }
                    )
                    task.processed += 1
                    continue

                _log(f"auto-detecting doc_type and module...")
                resolved_doc_type = doc_type or auto_detect_doc_type(
                    text_content, filename
                )
                _log(f"doc_type={resolved_doc_type}")
                resolved_module = module or auto_detect_module(text_content, filename)
                _log(f"module={resolved_module}")

                _log(f"calling indexer.index_file")
                chunks_indexed = await indexer.index_file(
                    file_content=text_content,
                    doc_type=resolved_doc_type,
                    module=resolved_module,
                    filename=filename,
                    file_path=perm_path,
                )
                _log(f"index_file done, chunks: {chunks_indexed}")

                total_chunks += chunks_indexed
                details.append(
                    {
                        "filename": filename,
                        "success": True,
                        "doc_type": resolved_doc_type,
                        "module": resolved_module,
                        "chunks": chunks_indexed,
                        "message": f"Indexed {chunks_indexed} chunks",
                    }
                )

                task.processed += 1
                task.details = details
                task.total_chunks = total_chunks

            except Exception as e:
                _log(f"error processing {original_name}: {e}")
                import traceback as _tb

                _log(_tb.format_exc())
                details.append(
                    {
                        "filename": original_name,
                        "success": False,
                        "message": str(e),
                        "chunks": 0,
                    }
                )
                task.processed += 1
                task.details = details

            finally:
                try:
                    os.unlink(file_path)
                except Exception:
                    pass

        files_indexed = sum(1 for d in details if d["success"])
        task.status = "completed"
        task.message = f"Indexed {files_indexed}/{len(saved_files)} files, {total_chunks} chunks total"
        task.details = details
        task.total_chunks = total_chunks

    except Exception as e:
        _log(f"task error: {e}")
        import traceback as _tb

        _log(_tb.format_exc())
        task.status = "failed"
        task.error = str(e)
        task.message = f"Upload failed: {str(e)}"


@router.post("/upload/async")
async def upload_files_async(
    req: Request,
    files: List[UploadFile] = File(...),
    doc_type: Optional[str] = Form(None),
    module: Optional[str] = Form(None),
):
    saved_files = []
    try:
        for upload_file in files:
            if not upload_file.filename:
                continue
            file_id = str(uuid.uuid4())
            ext = os.path.splitext(upload_file.filename)[1]
            save_path = os.path.join(UPLOAD_TEMP_DIR, f"{file_id}{ext}")
            content = await upload_file.read()
            async with aiofiles.open(save_path, "wb") as f:
                await f.write(content)
            saved_files.append((save_path, upload_file.filename))

        if not saved_files:
            raise HTTPException(status_code=400, detail="No valid files provided")

        task = upload_task_manager.create(
            filename=", ".join(f[1] for f in saved_files),
            total_files=len(saved_files),
        )

        indexer = req.app.state.indexer
        asyncio.create_task(
            _process_upload_task(task, saved_files, doc_type, module, indexer)
        )

        return {
            "success": True,
            "task_id": task.task_id,
            "message": f"{len(saved_files)} file(s) saved, processing in background",
        }

    except HTTPException:
        raise
    except Exception as e:
        for file_path, _ in saved_files:
            try:
                os.unlink(file_path)
            except Exception:
                pass
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/upload/status/{task_id}")
async def upload_status(task_id: str):
    task = upload_task_manager.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail=f"Task not found: {task_id}")
    return task.to_dict()


@router.get("/upload/tasks")
async def list_upload_tasks(limit: int = Query(default=20, ge=1, le=100)):
    return {"tasks": upload_task_manager.list_tasks(limit)}
