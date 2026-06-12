"""Variable aggregator node -- merges variables from parallel branches."""
from __future__ import annotations

from typing import Any

from app.workflow.nodes.base import BaseNode
from app.utils.logger import logger

log = logger.getChild("workflow.nodes.aggregator")


class VariableAggregatorNode(BaseNode):
    node_type = "variable_aggregator"

    async def execute(
        self,
        inputs: dict[str, Any],
        config: dict[str, Any],
        context: dict[str, Any],
    ) -> dict[str, Any]:
        aggregations = config.get("aggregations", [])
        variable_pool = context.get("variable_pool")

        result: dict[str, Any] = {}

        if aggregations:
            for agg in aggregations:
                output_name = agg.get("output_name", "")
                input_sources = agg.get("input_sources", [])
                # Take the first non-None value from the sources
                value = None
                for source_selector in input_sources:
                    if variable_pool:
                        value = variable_pool.resolve(source_selector)
                    if value is not None:
                        break
                result[output_name] = value
        else:
            # Simple mode: merge all inputs
            result = dict(inputs)

        log.info("Variable aggregator: merged %d keys", len(result))
        return result

    def validate_config(self, config: dict[str, Any]) -> list[str]:
        # Aggregator is flexible, no strict validation needed
        return []
