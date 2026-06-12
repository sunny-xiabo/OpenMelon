"""Start node -- entry point of a workflow."""
from __future__ import annotations

from typing import Any

from app.workflow.nodes.base import BaseNode


class StartNode(BaseNode):
    node_type = "start"

    async def execute(
        self,
        inputs: dict[str, Any],
        config: dict[str, Any],
        context: dict[str, Any],
    ) -> dict[str, Any]:
        # Start node simply passes through the workflow inputs
        return inputs

    def get_output_schema(self, config: dict[str, Any]) -> dict[str, Any]:
        variables = config.get("variables", [])
        return {v.get("name", ""): v.get("type", "string") for v in variables}
