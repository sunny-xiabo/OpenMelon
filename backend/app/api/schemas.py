from pydantic import BaseModel
from typing import List, Optional, Dict, Any


class QueryRequest(BaseModel):
    question: str
    include_history: bool = True


class ChatMessage(BaseModel):
    role: str
    content: str
    timestamp: Optional[str] = None


class Citation(BaseModel):
    source_type: str
    filename: Optional[str] = None
    doc_type: Optional[str] = None
    chunk_index: Optional[int] = None


class ContextChunk(BaseModel):
    source_type: str
    content: str
    filename: Optional[str] = None
    doc_type: Optional[str] = None
    chunk_index: Optional[int] = None
    section_path: Optional[str] = None
    page_label: Optional[str] = None
    sheet_name: Optional[str] = None
    slide_label: Optional[str] = None
    block_type: Optional[str] = None


class GraphNode(BaseModel):
    id: str
    label: str
    group: str
    title: Optional[str] = None


class GraphRel(BaseModel):
    source: str
    target: str
    label: str


class GraphData(BaseModel):
    nodes: List[GraphNode] = []
    relationships: List[GraphRel] = []


class NodeTypeColor(BaseModel):
    bg: str
    border: str


class NodeTypeConfig(BaseModel):
    type: str
    category: str
    color: NodeTypeColor
    size: int
    locked: bool = False
    constraints: List[str] = []


class NodeTypeConfigResponse(BaseModel):
    node_types: List[NodeTypeConfig] = []


class NodeTypeConfigUpsertRequest(BaseModel):
    type: str
    category: str
    color: NodeTypeColor
    size: int


class NodeTypeConfigUpdateRequest(BaseModel):
    category: str
    color: NodeTypeColor
    size: int


class NodeTypeMutationResponse(BaseModel):
    success: bool
    message: str
    node_type: NodeTypeConfig


class NodeTypeDeleteResponse(BaseModel):
    success: bool
    message: str


class QueryResponse(BaseModel):
    answer: str
    citations: List[Citation] = []
    retrieval_method: str
    graph_data: Optional[GraphData] = None
    reasoning_steps: Optional[List[str]] = None
    session_id: Optional[str] = None
    context_chunks: List[ContextChunk] = []
    history_used: List[ChatMessage] = []


class IndexFileRequest(BaseModel):
    file_content: str
    doc_type: str
    module: str
    filename: str


class IndexDirectoryRequest(BaseModel):
    directory_path: str
    doc_type: str
    module: str


class IndexResponse(BaseModel):
    success: bool
    chunks_indexed: int
    message: str


class UploadResponse(BaseModel):
    success: bool
    files_indexed: int
    total_chunks: int
    details: List[Dict[str, Any]] = []
    message: str


class ModuleCoverage(BaseModel):
    module_name: str
    feature_count: int
    test_case_count: int
    coverage_percentage: float


class CoverageResponse(BaseModel):
    modules: List[ModuleCoverage] = []


class ErrorResponse(BaseModel):
    error: str
    detail: Optional[str] = None


class FileRecord(BaseModel):
    id: str
    filename: str
    doc_type: str
    module: str
    chunk_count: int
    indexed_at: str
    status: str


class FileListResponse(BaseModel):
    files: List[FileRecord] = []
    total: int = 0


class DeleteResponse(BaseModel):
    success: bool
    deleted_count: int
    message: str


class ReindexResponse(BaseModel):
    success: bool
    message: str


class PromptHubTemplatePayload(BaseModel):
    id: Optional[str] = None
    name: str
    description: str = ""
    content: str
    review_summary: str = ""
    enabled: bool = True
    is_default: bool = False
    sort_order: int = 100


class PromptHubSkillPayload(BaseModel):
    id: Optional[str] = None
    name: str
    description: str = ""
    content: str
    review_summary: str = ""
    enabled: bool = True
    category: str = "coverage"
    sort_order: int = 100


class PromptHubSkillCategoryPayload(BaseModel):
    id: Optional[str] = None
    name: str
    is_default: bool = False
    sort_order: int = 100


class PromptHubMutationResponse(BaseModel):
    success: bool
    message: str
    version: int
    updated_at: str
    record: Dict[str, Any]
