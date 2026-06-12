"""Tool node -- invokes OpenMelon internal capabilities as workflow tools."""
from __future__ import annotations

from typing import Any

from app.workflow.nodes.base import BaseNode
from app.utils.logger import logger

log = logger.getChild("workflow.nodes.tool")

# Registry of available tool types and their handlers
_TOOL_HANDLERS: dict[str, str] = {
    "testcase_gen": "_handle_testcase_gen",
    "graph_query": "_handle_graph_query",
    "doc_parse": "_handle_doc_parse",
    "api_execution": "_handle_api_execution",
    "coverage_query": "_handle_coverage_query",
}


class ToolNode(BaseNode):
    node_type = "tool"

    async def execute(
        self,
        inputs: dict[str, Any],
        config: dict[str, Any],
        context: dict[str, Any],
    ) -> dict[str, Any]:
        tool_type = config.get("tool_type", "")
        if tool_type not in _TOOL_HANDLERS:
            raise ValueError(f"Unknown tool type: {tool_type}. Available: {list(_TOOL_HANDLERS.keys())}")

        handler_name = _TOOL_HANDLERS[tool_type]
        handler = getattr(self, handler_name, None)
        if handler is None:
            raise RuntimeError(f"Handler not implemented: {handler_name}")

        log.info("Tool node: type=%s", tool_type)
        return await handler(inputs, config.get("config", {}), context)

    async def _handle_testcase_gen(
        self, inputs: dict[str, Any], tool_config: dict, context: dict
    ) -> dict[str, Any]:
        """Generate test cases using the existing AutoGen pipeline."""
        neo4j_writer = context.get("neo4j_writer")
        if neo4j_writer is None:
            return {"error": "Neo4j writer not available", "test_cases": []}

        intent = inputs.get("intent", tool_config.get("intent", ""))
        return {
            "message": f"Test case generation triggered for: {intent}",
            "status": "triggered",
        }

    async def _handle_graph_query(
        self, inputs: dict[str, Any], tool_config: dict, context: dict
    ) -> dict[str, Any]:
        """Query the knowledge graph."""
        graph_ops = context.get("graph_ops")
        if graph_ops is None:
            return {"error": "Graph operations not available", "results": []}

        query = inputs.get("query", tool_config.get("query", ""))
        return {
            "query": query,
            "results": [],
            "message": "Graph query placeholder -- integrate with graph_ops",
        }

    async def _handle_doc_parse(
        self, inputs: dict[str, Any], tool_config: dict, context: dict
    ) -> dict[str, Any]:
        """Parse documents using the existing file parser."""
        return {
            "message": "Document parsing triggered",
            "status": "placeholder",
        }

    async def _handle_api_execution(
        self, inputs: dict[str, Any], tool_config: dict, context: dict
    ) -> dict[str, Any]:
        """Execute an API test case using the existing runner."""
        return {
            "message": "API execution triggered",
            "status": "placeholder",
        }

    async def _handle_coverage_query(
        self, inputs: dict[str, Any], tool_config: dict, context: dict
    ) -> dict[str, Any]:
        """Query test coverage metrics."""
        coverage_service = context.get("coverage_service")
        if coverage_service is None:
            return {"error": "Coverage service not available"}
        return {
            "message": "Coverage query triggered",
            "status": "placeholder",
        }

    def validate_config(self, config: dict[str, Any]) -> list[str]:
        errors = []
        tool_type = config.get("tool_type", "")
        if not tool_type:
            errors.append("Tool node requires 'tool_type' in config")
        elif tool_type not in _TOOL_HANDLERS:
            errors.append(f"Unknown tool type: {tool_type}")
        return errors
