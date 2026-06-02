import time
import base64
from pathlib import Path
from app.api.errors import InternalError, InvalidRequestError, NotFoundError, UnauthorizedError
import logging
import uuid
import json
from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import StreamingResponse
from app.api.logging_service import safe_log_event
from app.config import settings
from app.engine.rag.cache import (
    answer_cache,
    build_answer_cache_key,
    build_retrieval_cache_key,
    clear_rag_cache,
    get_rag_cache_status,
    retrieval_cache,
)
from app.api.schemas import (
    QueryRequest,
    QueryResponse,
    Citation,
    ChatMessage,
    ContextChunk,
    FeedbackRequest,
    GraphData,
    GraphNode,
    GraphRel,
)
from app.api.deps import (
    get_intent_router,
    get_retriever,
    get_generator,
    get_agentic_rag,
    get_session_manager,
    get_metrics_collector,
    require_production_auth,
)

logger = logging.getLogger("app")
router = APIRouter(tags=["query"])


def _log_query_event(level: str, event_type: str, title: str, message: str = "", **kwargs):
    return safe_log_event(level, "rag_query", event_type, title, message, **kwargs)


def _record_cache_feature(metrics_collector, feature: str) -> None:
    if metrics_collector is not None and hasattr(metrics_collector, "record_feature_usage"):
        metrics_collector.record_feature_usage(feature)


async def _retrieve_with_cache(
    retriever,
    metrics_collector,
    *,
    intent: str,
    entities: dict,
    question: str,
    metadata_filter: dict | None = None,
):
    if not settings.RAG_CACHE_ENABLED or intent == "visualization":
        return await retriever.retrieve(intent, entities, question, metadata_filter=metadata_filter)

    cache_key = build_retrieval_cache_key(intent, entities, question, metadata_filter=metadata_filter)
    cached = retrieval_cache.get(cache_key)
    if cached is not None:
        _record_cache_feature(metrics_collector, "rag_retrieval_cache_hit")
        return cached

    _record_cache_feature(metrics_collector, "rag_retrieval_cache_miss")
    result = await retriever.retrieve(intent, entities, question, metadata_filter=metadata_filter)
    retrieval_cache.set(
        cache_key,
        result,
        ttl_s=settings.RAG_RETRIEVAL_CACHE_TTL_S,
        max_entries=settings.RAG_RETRIEVAL_CACHE_MAX_ENTRIES,
    )
    return result


async def _describe_image(image_bytes: bytes, filename: str) -> str:
    """Use vision model to describe an uploaded image."""
    from app.testcase_gen.utils.llms import get_model_client, get_model_display_name
    b64 = base64.b64encode(image_bytes).decode()
    ext = Path(filename).suffix.lower().lstrip(".")
    mime_map = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "gif": "image/gif", "webp": "image/webp"}
    mime = mime_map.get(ext, "image/png")
    client = get_model_client(use_vision=True)
    model_name = get_model_display_name(use_vision=True)
    try:
        resp = await client.chat.completions.create(
            model=model_name,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "text", "text": "请详细描述这张图片的内容，包括文字、图表、界面元素等所有可见信息。"},
                    {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}},
                ],
            }],
            max_tokens=1000,
        )
        return resp.choices[0].message.content.strip()
    except Exception as e:
        logger.warning("Vision model failed for %s: %s", filename, e)
        return f"[图片: {filename} - 无法分析内容]"


@router.get("/query/cache/status")
async def query_cache_status():
    return get_rag_cache_status()


@router.delete("/query/cache", dependencies=[Depends(require_production_auth)])
async def clear_query_cache():
    version = clear_rag_cache("manual_api_clear")
    return {"success": True, "version": version, "status": get_rag_cache_status()}


@router.post("/query/feedback")
async def set_feedback(request: FeedbackRequest, req: Request):
    store = getattr(req.app.state, "qa_feedback_store", None)
    if store is None:
        raise InternalError(details="Feedback store not initialized")
    if request.feedback is None:
        store.delete_feedback(request.session_id, request.message_index)
    else:
        store.set_feedback(request.session_id, request.message_index, request.feedback)
    return {"success": True}


@router.get("/query/feedback/{session_id}")
async def get_feedback(session_id: str, req: Request):
    store = getattr(req.app.state, "qa_feedback_store", None)
    if store is None:
        raise InternalError(details="Feedback store not initialized")
    return {"feedbacks": store.get_feedbacks(session_id)}


@router.post("/query/stream")
async def query_stream(
    req: Request,
    intent_router = Depends(get_intent_router),
    retriever = Depends(get_retriever),
    generator = Depends(get_generator),
    session_manager = Depends(get_session_manager),
    metrics_collector = Depends(get_metrics_collector),
):
    """流式问答端点：检索阶段完成后，以纯文本流逐块返回回答。支持 JSON 和 multipart/form-data。"""
    content_type = req.headers.get("content-type", "")

    if "multipart/form-data" in content_type:
        form = await req.form()
        question = str(form.get("question", ""))
        include_history = str(form.get("include_history", "true")).lower() == "true"
        session_id = str(form.get("session_id") or "") or None
        files = form.getlist("files")
        image_descriptions = []
        for f in files:
            data = await f.read()
            desc = await _describe_image(data, f.filename)
            image_descriptions.append(f"[图片 {f.filename}]: {desc}")
        if image_descriptions:
            question = question + "\n\n" + "\n".join(image_descriptions)
    else:
        body = await req.json()
        question = body.get("question", "")
        include_history = body.get("include_history", True)
        session_id = req.query_params.get("session_id") or None

    trace_id = session_id or f"query_{uuid.uuid4().hex}"
    start_time = time.time()
    reasoning_steps = []

    try:
        history_messages = (
            session_manager.get_history(session_id)[-6:]
            if session_id and include_history
            else []
        )

        intent_result = await intent_router.process(question, chat_history=history_messages)
        intent = intent_result["intent"]
        entities = intent_result["entities"]
        retrieval_question = intent_result.get("rewritten_query", question)
        metadata_hints = intent_result.get("metadata_hints", None)

        reasoning_steps.append(
            f"Step 1: Intent Router completed classification: intent='{intent}', entities={entities}"
        )

        if intent_result.get("rewritten_query") and intent_result.get("rewritten_query") != question:
            reasoning_steps.append(
                f"Step 2: Coreference resolution: rewritten query to '{retrieval_question}'"
            )
        else:
            reasoning_steps.append(
                f"Step 2: Coreference resolution: query already self-contained, no rewrite needed"
            )

        if metadata_hints:
            reasoning_steps.append(
                f"Step 3: Applied metadata pre-filtering: {metadata_hints}"
            )
        else:
            reasoning_steps.append(
                f"Step 3: No metadata filter hints detected, searching all partitions"
            )

        retrieval_result = await _retrieve_with_cache(
            retriever,
            metrics_collector,
            intent=intent,
            entities=entities,
            question=retrieval_question,
            metadata_filter=metadata_hints,
        )

        if intent == "visualization":
            context = retrieval_result.get("context_text", "")
            vis_summary = await generator.generate_visualization_summary(
                retrieval_result.get("graph_data", {})
            )
            async def _single_chunk():
                yield vis_summary
            return StreamingResponse(_single_chunk(), media_type="text/plain; charset=utf-8")

        if intent == "hybrid_query":
            context = retrieval_result.get("merged_context", "")
        else:
            context = retrieval_result.get("context_text", "")

        if intent == "graph_query" and len(context.strip()) < 50:
            reasoning_steps.append(
                "Step 4: Graph retrieval context insufficient, attempting fallback to vector channel"
            )
            retrieval_result = await _retrieve_with_cache(
                retriever,
                metrics_collector,
                intent="vector_query",
                entities=entities,
                question=retrieval_question,
                metadata_filter=metadata_hints,
            )
            context = retrieval_result.get("context_text", "")
            intent = "vector_query"

        if "chunks" in retrieval_result:
            reasoning_steps.append(
                f"Step 4: Concurrent retrieval successfully recalled {len(retrieval_result['chunks'])} chunks with Cross-Encoder reranking"
            )
        else:
            reasoning_steps.append(
                "Step 4: Vector retrieval returned no chunks"
            )

        if "graph_results" in retrieval_result or intent == "graph_query":
            reasoning_steps.append(
                "Step 5: Graph database topology lookup successfully fetched entity relations context"
            )
        else:
            reasoning_steps.append(
                "Step 5: Generation pipeline ready, streaming answer synthesis"
            )

        async def _stream_generator():
            full_answer = ""
            async for text_chunk in generator.generate_answer_stream(
                question, context, intent, history_messages
            ):
                full_answer += text_chunk
                yield text_chunk

            # 流结束后保存会话历史
            if session_id and full_answer:
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

                citations_data = [c.dict() if hasattr(c, "dict") else c for c in citations]
                context_chunks_data = [c.dict() if hasattr(c, "dict") else c for c in context_chunks]

                session_manager.add_message(session_id, "user", question)
                session_manager.add_message(
                    session_id,
                    "assistant",
                    full_answer,
                    citations=citations_data,
                    context_chunks=context_chunks_data,
                    reasoning_steps=reasoning_steps,
                )

            duration_ms = round((time.time() - start_time) * 1000)
            _log_query_event(
                "info",
                "rag_stream_completed",
                "RAG 流式查询完成",
                f"检索方式 {intent}",
                trace_id=trace_id,
                source_id=session_id or "",
                refs=[session_id, intent],
                data={
                    "mode": "stream",
                    "session_id": session_id or "",
                    "intent": intent,
                    "duration_ms": duration_ms,
                    "answer_chars": len(full_answer),
                },
            )
            if metrics_collector:
                metrics_collector.record_query(duration_ms=duration_ms, success=True)

        return StreamingResponse(
            _stream_generator(),
            media_type="text/plain; charset=utf-8",
        )

    except Exception as e:
        duration_ms = (time.time() - start_time) * 1000
        if metrics_collector:
            metrics_collector.record_query(duration_ms=duration_ms, success=False, error=str(e))
        _log_query_event(
            "error",
            "rag_stream_failed",
            "RAG 流式查询失败",
            str(e),
            trace_id=trace_id,
            source_id=session_id or "",
            refs=[session_id],
            data={"mode": "stream", "session_id": session_id or "", "error": str(e)},
        )
        raise InternalError(details=str(e))


@router.post("/query", response_model=QueryResponse)
async def query(
    request: QueryRequest,
    req: Request,
    intent_router = Depends(get_intent_router),
    retriever = Depends(get_retriever),
    generator = Depends(get_generator),
    agentic_rag = Depends(get_agentic_rag),
    session_manager = Depends(get_session_manager),
    metrics_collector = Depends(get_metrics_collector),
):
    use_agentic = req.query_params.get("use_agentic", "false").lower() == "true"
    session_id = req.query_params.get("session_id") or None
    trace_id = session_id or f"query_{uuid.uuid4().hex}"

    if use_agentic and agentic_rag:
        started_at = time.time()
        try:
            agentic_result = await agentic_rag.query(request.question)
            citations = []
            context_chunks = []
            for s in agentic_result.get("sources", []) or []:
                try:
                    citations.append(
                        Citation(
                            source_type=s.get("source_type", "vector"),
                            filename=s.get("filename"),
                            doc_type=s.get("doc_type"),
                            chunk_index=s.get("chunk_index"),
                        )
                    )
                    if s.get("source_type") == "vector":
                        context_chunks.append(
                            ContextChunk(
                                source_type="vector",
                                filename=s.get("filename"),
                                doc_type=s.get("doc_type"),
                                chunk_index=s.get("chunk_index"),
                                content=s.get("content", ""),
                                section_path=s.get("section_path"),
                                page_label=s.get("page_label"),
                                sheet_name=s.get("sheet_name"),
                                slide_label=s.get("slide_label"),
                                block_type=s.get("block_type"),
                            )
                        )
                except Exception:
                    pass

            if session_id:
                session_manager.add_message(session_id, "user", request.question)
                citations_data = [c.dict() if hasattr(c, "dict") else c for c in citations]
                context_chunks_data = [c.dict() if hasattr(c, "dict") else c for c in context_chunks]
                session_manager.add_message(
                    session_id,
                    "assistant",
                    agentic_result.get("answer", ""),
                    citations=citations_data,
                    context_chunks=context_chunks_data,
                    reasoning_steps=agentic_result.get("reasoning_steps", []),
                )

            _log_query_event(
                "info",
                "rag_query_completed",
                "Agentic RAG 查询完成",
                f"命中来源 {len(citations)} 个",
                trace_id=trace_id,
                source_id=session_id or "",
                refs=[session_id],
                data={
                    "mode": "agentic",
                    "session_id": session_id or "",
                    "duration_ms": round((time.time() - started_at) * 1000),
                    "citation_count": len(citations),
                    "question_chars": len(request.question or ""),
                },
            )
            return QueryResponse(
                answer=agentic_result.get("answer", ""),
                citations=citations,
                retrieval_method="agentic",
                reasoning_steps=agentic_result.get("reasoning_steps"),
                session_id=session_id,
                context_chunks=context_chunks,
            )
        except Exception as exc:
            _log_query_event(
                "error",
                "rag_query_failed",
                "Agentic RAG 查询失败",
                str(exc),
                trace_id=trace_id,
                source_id=session_id or "",
                refs=[session_id],
                data={"mode": "agentic", "session_id": session_id or "", "error": str(exc)},
            )
            raise InternalError(details=str(exc))

    start_time = time.time()
    had_exception = False
    reasoning_steps = []
    try:
        history_messages = (
            session_manager.get_history(session_id)[-6:]
            if session_id and request.include_history
            else []
        )

        intent_result = await intent_router.process(request.question, chat_history=history_messages)
        intent = intent_result["intent"]
        entities = intent_result["entities"]
        retrieval_question = intent_result.get("rewritten_query", request.question)
        metadata_hints = intent_result.get("metadata_hints", None)

        reasoning_steps.append(
            f"Step 1: Intent Router completed classification: intent='{intent}', entities={entities}"
        )

        if intent_result.get("rewritten_query") and intent_result.get("rewritten_query") != request.question:
            reasoning_steps.append(
                f"Step 2: Coreference resolution: rewritten query to '{retrieval_question}'"
            )
        else:
            reasoning_steps.append(
                f"Step 2: Coreference resolution: query already self-contained, no rewrite needed"
            )

        if metadata_hints:
            reasoning_steps.append(
                f"Step 3: Applied metadata pre-filtering: {metadata_hints}"
            )
        else:
            reasoning_steps.append(
                f"Step 3: No metadata filter hints detected, searching all partitions"
            )

        retrieval_result = await _retrieve_with_cache(
            retriever,
            metrics_collector,
            intent=intent,
            entities=entities,
            question=retrieval_question,
            metadata_filter=metadata_hints,
        )

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

        if intent == "graph_query" and len(context.strip()) < 50:
            reasoning_steps.append(
                "Step 4: Graph retrieval context insufficient, attempting fallback to vector channel"
            )
            logger.info(
                f"Graph retrieval returned minimal context ({len(context)} chars), falling back to vector search"
            )
            retrieval_result = await _retrieve_with_cache(
                retriever,
                metrics_collector,
                intent="vector_query",
                entities=entities,
                question=retrieval_question,
                metadata_filter=metadata_hints,
            )
            context = retrieval_result.get("context_text", "")
            intent = "vector_query"

        if "chunks" in retrieval_result:
            reasoning_steps.append(
                f"Step 4: Concurrent retrieval successfully recalled {len(retrieval_result['chunks'])} chunks with Cross-Encoder reranking"
            )
        else:
            reasoning_steps.append(
                "Step 4: Vector retrieval returned no chunks"
            )

        if "graph_results" in retrieval_result or intent == "graph_query":
            reasoning_steps.append(
                "Step 5: Graph database topology lookup successfully fetched entity relations context"
            )
        else:
            reasoning_steps.append(
                "Step 5: Generation pipeline ready, synthesizing answer"
            )

        answer_cache_safe = (
            settings.RAG_CACHE_ENABLED
            and intent != "visualization"
            and (not request.include_history or not history_messages)
        )
        answer_result = None
        if answer_cache_safe:
            answer_cache_key = build_answer_cache_key(
                question=request.question,
                intent=intent,
                entities=entities,
                context=context,
            )
            cached_answer = answer_cache.get(answer_cache_key)
            if cached_answer is not None:
                _record_cache_feature(metrics_collector, "rag_answer_cache_hit")
                answer_result = cached_answer
            else:
                _record_cache_feature(metrics_collector, "rag_answer_cache_miss")

        if answer_result is None:
            answer_result = await generator.generate_answer(
                request.question, context, intent, history_messages
            )
            if answer_cache_safe:
                answer_cache.set(
                    answer_cache_key,
                    answer_result,
                    ttl_s=settings.RAG_ANSWER_CACHE_TTL_S,
                    max_entries=settings.RAG_ANSWER_CACHE_MAX_ENTRIES,
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
            citations_data = [c.dict() if hasattr(c, "dict") else c for c in citations]
            context_chunks_data = [c.dict() if hasattr(c, "dict") else c for c in context_chunks]
            session_manager.add_message(
                session_id,
                "assistant",
                answer_result["answer"],
                citations=citations_data,
                context_chunks=context_chunks_data,
                reasoning_steps=reasoning_steps,
            )

        _log_query_event(
            "info",
            "rag_query_completed",
            "RAG 查询完成",
            f"检索方式 {method_map.get(intent, 'vector')}",
            trace_id=trace_id,
            source_id=session_id or "",
            refs=[session_id, intent],
            data={
                "mode": "standard",
                "session_id": session_id or "",
                "intent": intent,
                "retrieval_method": method_map.get(intent, "vector"),
                "duration_ms": round((time.time() - start_time) * 1000),
                "citation_count": len(citations),
                "context_chunk_count": len(context_chunks),
                "question_chars": len(request.question or ""),
            },
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
        if metrics_collector:
            metrics_collector.record_query(
                duration_ms=duration_ms, success=False, error=str(e)
            )
        _log_query_event(
            "error",
            "rag_query_failed",
            "RAG 查询失败",
            str(e),
            trace_id=trace_id,
            source_id=session_id or "",
            refs=[session_id],
            data={
                "mode": "standard",
                "session_id": session_id or "",
                "duration_ms": round(duration_ms),
                "error": str(e),
            },
        )
        raise InternalError(details=str(e))
    finally:
        if not had_exception:
            duration_ms = (time.time() - start_time) * 1000
            if metrics_collector:
                metrics_collector.record_query(duration_ms=duration_ms, success=True)
