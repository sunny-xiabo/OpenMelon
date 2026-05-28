from collections import OrderedDict
from fastapi import APIRouter, HTTPException, Depends, Query, Request
from app.api.errors import InternalError, InvalidRequestError, NotFoundError, UnauthorizedError
from typing import Optional
import uuid
from app.config import settings
from app.runtime_config import current_embedding_config
from app.api.logging_service import safe_log_event
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
    require_production_auth,
)

router = APIRouter(prefix="/graph", tags=["graph"])

class _LRUCache:
    """Simple LRU cache with max size for virtual node caching."""

    def __init__(self, maxsize: int = 500) -> None:
        self._maxsize = maxsize
        self._data: OrderedDict = OrderedDict()

    def __contains__(self, key: str) -> bool:
        if key in self._data:
            self._data.move_to_end(key)
            return True
        return False

    def __getitem__(self, key: str):
        self._data.move_to_end(key)
        return self._data[key]

    def __setitem__(self, key: str, value) -> None:
        if key in self._data:
            self._data.move_to_end(key)
        self._data[key] = value
        if len(self._data) > self._maxsize:
            self._data.popitem(last=False)

_virtual_node_cache = _LRUCache(maxsize=500)


def _serialize_props(props: dict) -> dict:
    result = {}
    for key, value in (props or {}).items():
        if hasattr(value, 'isoformat'):
            result[key] = value.isoformat()
        elif hasattr(value, 'to_native'):
            native = value.to_native()
            result[key] = native.isoformat() if hasattr(native, 'isoformat') else str(native)
        elif isinstance(value, (int, float, str, bool, type(None))):
            result[key] = value
        elif isinstance(value, (list, tuple)):
            converted = []
            for v in value:
                if hasattr(v, 'isoformat'):
                    converted.append(v.isoformat())
                elif hasattr(v, 'to_native'):
                    n = v.to_native()
                    converted.append(n.isoformat() if hasattr(n, 'isoformat') else str(n))
                else:
                    converted.append(v)
            result[key] = converted
        else:
            result[key] = str(value)
    return result


def _log_graph_event(level: str, event_type: str, title: str, message: str = "", **kwargs):
    return safe_log_event(level, "graph", event_type, title, message, **kwargs)


def _empty_graph_filters(reason: str = ""):
    return {
        "doc_types": [],
        "modules": [],
        "graph_available": False,
        "message": reason,
    }

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
                labels=list(n.labels),
                properties=_serialize_props(n.properties),
            )
            for n in subgraph.nodes
        ]
        rels = [
            GraphRel(source=r.source, target=r.target, label=r.type)
            for r in subgraph.relationships
        ]

        return GraphData(nodes=nodes, relationships=rels)
    except Exception as e:
        raise InternalError(details=str(e))

@router.get("/filters")
async def graph_filters(request: Request):
    graph_ops = getattr(request.app.state, "graph_ops", None)
    if graph_ops is None:
        return _empty_graph_filters("图谱服务当前不可用")
    try:
        filters = await graph_ops.get_doc_types_and_modules()
        return {
            "doc_types": sorted(filters.get("doc_types") or []),
            "modules": sorted(filters.get("modules") or []),
            "graph_available": True,
            "message": "",
        }
    except Exception as e:
        _log_graph_event(
            "warning",
            "graph_filters_degraded",
            "图谱筛选项降级为空",
            str(e),
            data={"error": str(e)},
        )
        return _empty_graph_filters("图谱筛选项暂不可用")

@router.get("/status")
async def graph_status(request: Request):
    graph_ops = getattr(request.app.state, "graph_ops", None)
    if graph_ops is None:
        return {
            "has_data": False,
            "node_count": 0,
            "relationship_count": 0,
            "graph_available": False,
            "message": "图谱服务当前不可用",
        }
    try:
        status = await graph_ops.get_graph_status()
        return {
            **status,
            "graph_available": True,
            "message": "",
        }
    except Exception as e:
        _log_graph_event(
            "warning",
            "graph_status_degraded",
            "图谱状态降级为空",
            str(e),
            data={"error": str(e)},
        )
        return {
            "has_data": False,
            "node_count": 0,
            "relationship_count": 0,
            "graph_available": False,
            "message": "图谱状态暂不可用",
        }

@router.get("/node-types", response_model=NodeTypeConfigResponse)
async def graph_node_types():
    try:
        return NodeTypeConfigResponse(node_types=list_node_type_configs())
    except Exception as e:
        raise InternalError(details=str(e))

@router.post(
    "/node-types",
    response_model=NodeTypeMutationResponse,
    dependencies=[Depends(require_production_auth)],
)
async def create_graph_node_type(payload: NodeTypeConfigUpsertRequest):
    trace_id = f"graph_type_{uuid.uuid4().hex}"
    try:
        node_type = create_node_type_config(payload.model_dump())
        _log_graph_event(
            "info",
            "graph_node_type_created",
            "图谱节点类型已创建",
            f"节点类型 {node_type['type']} 已创建",
            trace_id=trace_id,
            source_id=node_type["type"],
            refs=[node_type["type"]],
            data={"node_type": node_type},
        )
        return NodeTypeMutationResponse(
            success=True,
            message=f"节点类型 {node_type['type']} 已创建",
            node_type=node_type,
        )
    except ValueError as e:
        _log_graph_event(
            "warning",
            "graph_node_type_create_rejected",
            "图谱节点类型创建未通过",
            str(e),
            trace_id=trace_id,
            data={"payload": payload.model_dump(), "error": str(e)},
        )
        raise InvalidRequestError(message=str(str(e)))
    except Exception as e:
        _log_graph_event(
            "error",
            "graph_node_type_create_failed",
            "图谱节点类型创建失败",
            str(e),
            trace_id=trace_id,
            data={"payload": payload.model_dump(), "error": str(e)},
        )
        raise InternalError(details=str(e))

@router.put(
    "/node-types/{node_type}",
    response_model=NodeTypeMutationResponse,
    dependencies=[Depends(require_production_auth)],
)
async def update_graph_node_type(
    node_type: str, payload: NodeTypeConfigUpdateRequest
):
    trace_id = f"graph_type_{uuid.uuid4().hex}"
    try:
        updated = update_node_type_config(node_type, payload.model_dump())
        _log_graph_event(
            "info",
            "graph_node_type_updated",
            "图谱节点类型已更新",
            f"节点类型 {node_type} 已更新",
            trace_id=trace_id,
            source_id=node_type,
            refs=[node_type],
            data={"node_type": updated, "patch": payload.model_dump()},
        )
        return NodeTypeMutationResponse(
            success=True,
            message=f"节点类型 {node_type} 已更新",
            node_type=updated,
        )
    except ValueError as e:
        _log_graph_event(
            "warning",
            "graph_node_type_update_rejected",
            "图谱节点类型更新未通过",
            str(e),
            trace_id=trace_id,
            source_id=node_type,
            refs=[node_type],
            data={"patch": payload.model_dump(), "error": str(e)},
        )
        raise InvalidRequestError(message=str(str(e)))
    except Exception as e:
        _log_graph_event(
            "error",
            "graph_node_type_update_failed",
            "图谱节点类型更新失败",
            str(e),
            trace_id=trace_id,
            source_id=node_type,
            refs=[node_type],
            data={"patch": payload.model_dump(), "error": str(e)},
        )
        raise InternalError(details=str(e))

@router.delete(
    "/node-types/{node_type}",
    response_model=NodeTypeDeleteResponse,
    dependencies=[Depends(require_production_auth)],
)
async def delete_graph_node_type(node_type: str):
    trace_id = f"graph_type_{uuid.uuid4().hex}"
    try:
        delete_node_type_config(node_type)
        _log_graph_event(
            "info",
            "graph_node_type_deleted",
            "图谱节点类型已删除",
            f"节点类型 {node_type} 已删除",
            trace_id=trace_id,
            source_id=node_type,
            refs=[node_type],
            data={"node_type": node_type},
        )
        return NodeTypeDeleteResponse(
            success=True,
            message=f"节点类型 {node_type} 已删除",
        )
    except ValueError as e:
        _log_graph_event(
            "warning",
            "graph_node_type_delete_rejected",
            "图谱节点类型删除未通过",
            str(e),
            trace_id=trace_id,
            source_id=node_type,
            refs=[node_type],
            data={"node_type": node_type, "error": str(e)},
        )
        raise InvalidRequestError(message=str(str(e)))
    except Exception as e:
        _log_graph_event(
            "error",
            "graph_node_type_delete_failed",
            "图谱节点类型删除失败",
            str(e),
            trace_id=trace_id,
            source_id=node_type,
            refs=[node_type],
            data={"node_type": node_type, "error": str(e)},
        )
        raise InternalError(details=str(e))

@router.get("/node/{node_id}")
async def graph_node_detail(node_id: str, graph_ops = Depends(get_graph_ops)):
    try:
        if node_id in _virtual_node_cache:
            return _virtual_node_cache[node_id]
        node_data = await graph_ops.get_node_by_id(node_id)
        if not node_data:
            raise NotFoundError(message="Node not found")
        return node_data
    except HTTPException:
        raise
    except Exception as e:
        raise InternalError(details=str(e))

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
                    labels=list(n.labels),
                    properties=_serialize_props(n.properties),
                )
                for n in subgraph.nodes
            ]
            rels = [
                GraphRel(source=r.source, target=r.target, label=r.type)
                for r in subgraph.relationships
            ]
            return GraphData(nodes=nodes, relationships=rels)

        try:
            embedding_config = current_embedding_config()
            kwargs = {
                **embedding_config["kwargs"],
                "input": [name],
            }
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
                            labels=[DOCUMENT_CHUNK_NODE_TYPE],
                            properties={
                                "filename": chunk.get("filename", ""),
                                "chunk_index": chunk.get("chunk_index", 0),
                                "doc_type": chunk.get("doc_type", ""),
                                "module": chunk.get("module", ""),
                                "content": chunk.get("content", ""),
                            },
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
        raise InternalError(details=str(e))

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
        raise InternalError(details=str(e))

@router.get("/coverage/{module_name}")
async def graph_coverage_detail(module_name: str, coverage_service = Depends(get_coverage_service)):
    try:
        detail = await coverage_service.get_module_coverage(module_name)
        return detail
    except Exception as e:
        raise InternalError(details=str(e))
