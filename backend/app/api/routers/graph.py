from fastapi import APIRouter, HTTPException, Depends, Query, Request
from typing import Optional
from app.config import settings
from app.models.graph_types import (
    DOCUMENT_CHUNK_NODE_TYPE,
    get_primary_node_type,
    list_node_type_configs,
    create_node_type_config,
    update_node_type_config,
    delete_node_type_config,
)
from app.api.schemas import (
    GraphData,
    GraphNode,
    GraphRel,
    NodeTypeConfigResponse,
    NodeTypeConfigUpsertRequest,
    NodeTypeConfigUpdateRequest,
    NodeTypeMutationResponse,
    NodeTypeDeleteResponse,
    CoverageResponse,
    ModuleCoverage,
)
from app.api.deps import (
    get_graph_ops,
    get_vector_ops,
    get_llm_client,
    get_coverage_service,
)

router = APIRouter(prefix="/graph", tags=["graph"])

_virtual_node_cache = {}

@router.get("/full", response_model=GraphData)
async def graph_full(
    limit: int = Query(default=1000, ge=1, le=5000),
    doc_type: Optional[str] = Query(default=None),
    module: Optional[str] = Query(default=None),
    include_chunks: bool = Query(default=False),
    graph_ops = Depends(get_graph_ops)
):
    try:
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

@router.get("/filters")
async def graph_filters(graph_ops = Depends(get_graph_ops)):
    try:
        return await graph_ops.get_doc_types_and_modules()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/status")
async def graph_status(graph_ops = Depends(get_graph_ops)):
    try:
        return await graph_ops.get_graph_status()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/node-types", response_model=NodeTypeConfigResponse)
async def graph_node_types():
    try:
        return NodeTypeConfigResponse(node_types=list_node_type_configs())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/node-types", response_model=NodeTypeMutationResponse)
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

@router.put("/node-types/{node_type}", response_model=NodeTypeMutationResponse)
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

@router.delete("/node-types/{node_type}", response_model=NodeTypeDeleteResponse)
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

@router.get("/node/{node_id}")
async def graph_node_detail(node_id: str, graph_ops = Depends(get_graph_ops)):
    try:
        if node_id in _virtual_node_cache:
            return _virtual_node_cache[node_id]
        node_data = await graph_ops.get_node_by_id(node_id)
        if not node_data:
            raise HTTPException(status_code=404, detail="Node not found")
        return node_data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/entity/{name}", response_model=GraphData)
async def graph_entity(
    name: str, 
    depth: int = Query(default=2, ge=1, le=5),
    graph_ops = Depends(get_graph_ops),
    vector_ops = Depends(get_vector_ops),
    llm_client = Depends(get_llm_client)
):
    try:
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
                    content_preview = chunk.get("content", "")[:100].replace("\\n", " ")
                    nodes.append(
                        GraphNode(
                            id=chunk_id,
                            label=chunk.get("filename", "文档")[:20],
                            group=DOCUMENT_CHUNK_NODE_TYPE,
                            title=f"{chunk.get('filename', '')} - {chunk.get('chunk_index', 0) + 1}\\n{content_preview}...",
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

@router.get("/coverage", response_model=CoverageResponse)
async def graph_coverage(coverage_service = Depends(get_coverage_service)):
    try:
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

@router.get("/coverage/{module_name}")
async def graph_coverage_detail(module_name: str, coverage_service = Depends(get_coverage_service)):
    try:
        detail = await coverage_service.get_module_coverage(module_name)
        return detail
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
