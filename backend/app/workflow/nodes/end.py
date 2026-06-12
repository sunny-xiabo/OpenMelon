"""End node -- terminal node that collects final outputs."""
from __future__ import annotations

from typing import Any

from app.workflow.nodes.base import BaseNode


class EndNode(BaseNode):
    node_type = "end"

    async def execute(
        self,
        inputs: dict[str, Any],
        config: dict[str, Any],
        context: dict[str, Any],
    ) -> dict[str, Any]:
        # End node collects the specified output variables
        output_selectors = config.get("outputs", [])
        if not output_selectors:
            return inputs

        result: dict[str, Any] = {}
        for out in output_selectors:
            name = out.get("name", "")
            value = out.get("value")
            result[name] = value if value is not None else inputs.get(name)
        return result

    def get_input_selectors(self, config: dict[str, Any]) -> list[dict[str, Any]]:
        return config.get("inputs", [])
