"""Pydantic data models for the workflow orchestration module."""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


# ── Node type enumeration ──────────────────────────────────────────

class NodeType(str, Enum):
    START = "start"
    END = "end"
    LLM = "llm"
    CODE = "code"
    HTTP_REQUEST = "http_request"
    KNOWLEDGE_RETRIEVAL = "knowledge_retrieval"
    IF_ELSE = "if_else"
    TEMPLATE = "template"
    VARIABLE_AGGREGATOR = "variable_aggregator"
    ITERATION = "iteration"
    TOOL = "tool"
    PARAMETER_EXTRACTOR = "parameter_extractor"
    QUESTION_CLASSIFIER = "question_classifier"


# ── Variable types ─────────────────────────────────────────────────

class VariableType(str, Enum):
    STRING = "string"
    NUMBER = "number"
    OBJECT = "object"
    ARRAY_STRING = "array[string]"
    ARRAY_OBJECT = "array[object]"
    FILE = "file"
    BOOLEAN = "boolean"


class VariableDef(BaseModel):
    """Definition of a workflow variable (input, output, or global)."""
    name: str
    type: VariableType = VariableType.STRING
    description: str = ""
    default: Any = None
    required: bool = False


# ── Node definition ────────────────────────────────────────────────

class NodeDef(BaseModel):
    """A single node in the workflow graph."""
    id: str
    type: NodeType
    title: str
    description: str = ""
    config: dict[str, Any] = Field(default_factory=dict)
    position: dict[str, float] = Field(
        default_factory=lambda: {"x": 0.0, "y": 0.0}
    )
    width: int = 244
    height: int = 90


# ── Edge definition ────────────────────────────────────────────────

class EdgeDef(BaseModel):
    """A directed edge connecting two nodes."""
    id: str
    source: str
    target: str
    source_handle: str = "source"
    target_handle: str = "target"


# ── Workflow definition ────────────────────────────────────────────

class WorkflowDef(BaseModel):
    """Complete workflow definition persisted in the database."""
    id: str
    name: str
    description: str = ""
    icon: str = "workflow"
    nodes: list[NodeDef] = Field(default_factory=list)
    edges: list[EdgeDef] = Field(default_factory=list)
    variables: list[VariableDef] = Field(default_factory=list)
    environment_variables: list[VariableDef] = Field(default_factory=list)
    status: str = "draft"  # draft | published
    version: int = 1
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


# ── Run results ────────────────────────────────────────────────────

class NodeRunResult(BaseModel):
    """Execution result for a single node."""
    node_id: str
    status: str = "pending"  # pending | running | succeeded | failed | skipped
    inputs: dict[str, Any] = Field(default_factory=dict)
    outputs: dict[str, Any] = Field(default_factory=dict)
    error: str | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None
    elapsed_ms: int = 0
    token_usage: dict[str, Any] | None = None


class WorkflowRunResult(BaseModel):
    """Execution result for an entire workflow run."""
    run_id: str
    workflow_id: str
    status: str = "queued"  # queued | running | succeeded | failed | cancelled
    inputs: dict[str, Any] = Field(default_factory=dict)
    outputs: dict[str, Any] = Field(default_factory=dict)
    node_results: dict[str, NodeRunResult] = Field(default_factory=dict)
    started_at: datetime | None = None
    finished_at: datetime | None = None
    elapsed_ms: int = 0
    error: str | None = None


# ── API request/response models ────────────────────────────────────

class CreateWorkflowRequest(BaseModel):
    name: str
    description: str = ""
    icon: str = "workflow"
    nodes: list[NodeDef] = Field(default_factory=list)
    edges: list[EdgeDef] = Field(default_factory=list)
    variables: list[VariableDef] = Field(default_factory=list)
    environment_variables: list[VariableDef] = Field(default_factory=list)


class UpdateWorkflowRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    icon: str | None = None
    nodes: list[NodeDef] | None = None
    edges: list[EdgeDef] | None = None
    variables: list[VariableDef] | None = None
    environment_variables: list[VariableDef] | None = None


class RunWorkflowRequest(BaseModel):
    inputs: dict[str, Any] = Field(default_factory=dict)
    response_mode: str = "blocking"  # blocking | streaming


class WorkflowListResponse(BaseModel):
    workflows: list[WorkflowDef]
    total: int


class WorkflowEvent(BaseModel):
    """An event yielded during workflow execution (for SSE streaming)."""
    type: str  # workflow_started | node_started | node_finished | node_error
              # | node_skipped | workflow_finished | workflow_error | text_chunk
    node_id: str | None = None
    node_type: str | None = None
    status: str | None = None
    data: dict[str, Any] = Field(default_factory=dict)
    timestamp: datetime = Field(default_factory=datetime.utcnow)


# ── Template models ────────────────────────────────────────────────

class WorkflowTemplate(BaseModel):
    template_id: str
    name: str
    description: str = ""
    category: str = "custom"  # custom | builtin
    tags: list[str] = Field(default_factory=list)
    data: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class CreateTemplateRequest(BaseModel):
    name: str
    description: str = ""
    category: str = "custom"
    tags: list[str] = Field(default_factory=list)
    data: dict[str, Any] = Field(default_factory=dict)
