"""Iteration node -- loops over an array, executing a sub-graph for each item."""
from __future__ import annotations

import asyncio
from typing import Any

from app.workflow.nodes.base import BaseNode
from app.utils.logger import logger

log = logger.getChild("workflow.nodes.iteration")


class IterationNode(BaseNode):
    node_type = "iteration"

    async def execute(
        self,
        inputs: dict[str, Any],
        config: dict[str, Any],
        context: dict[str, Any],
    ) -> dict[str, Any]:
        """Execute the iteration node.

        Note: Full sub-graph execution requires the engine to handle
        iteration specially. This node implementation handles the simple
        case of transforming each item in an array.
        """
        input_variable = config.get("input_variable", [])
        iterator_variable = config.get("iterator_variable", "item")
        max_iterations = config.get("max_iterations", 100)
        parallel = config.get("parallel", False)

        variable_pool = context.get("variable_pool")

        # Resolve the input array
        items: list[Any] = []
        if input_variable and variable_pool:
            items = variable_pool.resolve(input_variable) or []
        elif inputs:
            items = list(inputs.values())[0] if inputs else []

        if not isinstance(items, list):
            items = [items]

        # Limit iterations
        items = items[:max_iterations]

        log.info("Iteration node: %d items, parallel=%s", len(items), parallel)

        # For the basic implementation, we collect items into an output array
        # The engine will handle sub-graph execution for complex cases
        return {
            "items": items,
            "count": len(items),
            "iterator_variable": iterator_variable,
        }

    def validate_config(self, config: dict[str, Any]) -> list[str]:
        errors = []
        if not config.get("input_variable"):
            errors.append("Iteration node requires 'input_variable' in config")
        return errors
