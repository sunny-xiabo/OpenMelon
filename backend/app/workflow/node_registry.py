"""Node type registry -- factory pattern for creating node instances."""
from __future__ import annotations

from typing import Any

from app.workflow.models import NodeType
from app.workflow.nodes.base import BaseNode
from app.workflow.nodes.start import StartNode
from app.workflow.nodes.end import EndNode
from app.workflow.nodes.llm import LLMNode
from app.workflow.nodes.http import HTTPRequestNode
from app.workflow.nodes.code import CodeNode
from app.workflow.nodes.condition import ConditionNode
from app.workflow.nodes.knowledge import KnowledgeRetrievalNode
from app.workflow.nodes.template import TemplateNode
from app.workflow.nodes.variable_aggregator import VariableAggregatorNode
from app.workflow.nodes.iteration import IterationNode
from app.workflow.nodes.tool import ToolNode
from app.workflow.nodes.parameter_extractor import ParameterExtractorNode
from app.workflow.nodes.question_classifier import QuestionClassifierNode
from app.utils.logger import logger

log = logger.getChild("workflow.registry")

# Default node type mapping
_NODE_CLASSES: dict[str, type[BaseNode]] = {
    NodeType.START: StartNode,
    NodeType.END: EndNode,
    NodeType.LLM: LLMNode,
    NodeType.HTTP_REQUEST: HTTPRequestNode,
    NodeType.CODE: CodeNode,
    NodeType.IF_ELSE: ConditionNode,
    NodeType.KNOWLEDGE_RETRIEVAL: KnowledgeRetrievalNode,
    NodeType.TEMPLATE: TemplateNode,
    NodeType.VARIABLE_AGGREGATOR: VariableAggregatorNode,
    NodeType.ITERATION: IterationNode,
    NodeType.TOOL: ToolNode,
    NodeType.PARAMETER_EXTRACTOR: ParameterExtractorNode,
    NodeType.QUESTION_CLASSIFIER: QuestionClassifierNode,
}


class NodeRegistry:
    """Registry that creates node instances by type string."""

    def __init__(self) -> None:
        self._classes: dict[str, type[BaseNode]] = dict(_NODE_CLASSES)

    def register(self, node_type: str, node_class: type[BaseNode]) -> None:
        """Register a custom node type."""
        self._classes[node_type] = node_class
        log.info("Registered node type: %s", node_type)

    def create(self, node_type: str) -> BaseNode:
        """Create a node instance by type string."""
        cls = self._classes.get(node_type)
        if cls is None:
            raise ValueError(
                f"Unknown node type: {node_type}. "
                f"Available: {list(self._classes.keys())}"
            )
        return cls()

    def has_type(self, node_type: str) -> bool:
        return node_type in self._classes

    def list_types(self) -> list[str]:
        return list(self._classes.keys())
