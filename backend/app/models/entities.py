from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from app.models.graph_types import CORE_NODE_TYPES


# --- Entity Types ---
ENTITY_TYPES = CORE_NODE_TYPES

# --- Relationship Types ---
REL_CONTAINS = "CONTAINS"
REL_DEPENDS_ON = "DEPENDS_ON"
REL_COVERS = "COVERS"
REL_BELONGS_TO = "BELONGS_TO"
REL_ASSIGNED_TO = "ASSIGNED_TO"
REL_REPORTS = "REPORTS"
REL_TESTS = "TESTS"
REL_RELATED_TO = "RELATED_TO"


class Product(BaseModel):
    name: str
    description: Optional[str] = None


class Module(BaseModel):
    name: str
    product: Optional[str] = None
    description: Optional[str] = None


class Feature(BaseModel):
    name: str
    module: Optional[str] = None
    description: Optional[str] = None


class APIEntity(BaseModel):
    name: str
    module: Optional[str] = None
    method: Optional[str] = None
    path: Optional[str] = None
    description: Optional[str] = None


class TestCase(BaseModel):
    name: str
    feature: Optional[str] = None
    module: Optional[str] = None
    description: Optional[str] = None


class Defect(BaseModel):
    name: str
    feature: Optional[str] = None
    severity: Optional[str] = None
    description: Optional[str] = None


class Person(BaseModel):
    name: str
    role: Optional[str] = None
    department: Optional[str] = None


class DocumentChunk(BaseModel):
    id: Optional[str] = None
    doc_type: str
    module: str
    filename: str
    chunk_index: int
    content: str
    section_path: Optional[str] = None
    page_label: Optional[str] = None
    sheet_name: Optional[str] = None
    slide_label: Optional[str] = None
    block_type: Optional[str] = None
    embedding: Optional[List[float]] = None

    def node_id(self) -> str:
        return f"chunk:{self.doc_type}:{self.filename}:{self.chunk_index}"


class GraphNode(BaseModel):
    id: str
    labels: List[str]
    properties: Dict[str, Any] = {}


class GraphRelationship(BaseModel):
    source: str
    target: str
    type: str
    properties: Dict[str, Any] = {}


class GraphData(BaseModel):
    nodes: List[GraphNode] = []
    relationships: List[GraphRelationship] = []
