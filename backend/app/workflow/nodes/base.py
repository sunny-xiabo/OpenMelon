"""Abstract base class for all workflow node types."""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class BaseNode(ABC):
    """Base class that every node type must implement."""

    node_type: str  # Subclasses must set this to their NodeType value

    @abstractmethod
    async def execute(
        self,
        inputs: dict[str, Any],
        config: dict[str, Any],
        context: dict[str, Any],
    ) -> dict[str, Any]:
        """Execute the node and return its outputs.

        Args:
            inputs: Resolved input values from the VariablePool.
            config: Node-specific configuration from NodeDef.config.
            context: Execution context (llm_client, retriever, etc.).

        Returns:
            Output dict to be written into the VariablePool.
        """
        ...

    def get_input_selectors(self, config: dict[str, Any]) -> list[dict[str, Any]]:
        """Return the list of {name, selector} this node needs."""
        return config.get("inputs", [])

    def get_output_schema(self, config: dict[str, Any]) -> dict[str, Any]:
        """Describe the outputs this node produces."""
        return {}

    def validate_config(self, config: dict[str, Any]) -> list[str]:
        """Validate node configuration, return list of error messages."""
        return []
