import time
import logging
from fastapi import APIRouter, HTTPException, Depends, Request
from app.api.schemas import (
    QueryRequest,
    QueryResponse,
    Citation,
    ChatMessage,
    ContextChunk,
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
)

logger = logging.getLogger("graph_rag")
router = APIRouter(tags=["query"])

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

    if use_agentic and agentic_rag:
        agentic_result = await agentic_rag.query(request.question)
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
    had_exception = False
    try:
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
        if metrics_collector:
            metrics_collector.record_query(
                duration_ms=duration_ms, success=False, error=str(e)
            )
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if not had_exception:
            duration_ms = (time.time() - start_time) * 1000
            if metrics_collector:
                metrics_collector.record_query(duration_ms=duration_ms, success=True)
