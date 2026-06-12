"""General-purpose variable pool with scope resolution and parallel isolation.

Variable source layers (highest priority first):
  1. Node outputs:  node_outputs[node_id][key]
  2. User inputs:   user_inputs[key]
  3. Global vars:   global_vars[key]
  4. Environment:   env_vars[key]   (read-only)
  5. System:        system_vars[key] (read-only)
"""
from __future__ import annotations

import asyncio
import copy
import re
from datetime import datetime
from typing import Any

from app.utils.logger import logger

log = logger.getChild("workflow.variable_pool")

# Pattern for {{selector.path}} in templates
_SELECTOR_RE = re.compile(r"\{\{\s*([\w.\-]+(?:\.[\w.\-]+)*)\s*\}\}")


class VariablePool:
    """Central variable store for a single workflow execution."""

    def __init__(self) -> None:
        self._node_outputs: dict[str, dict[str, Any]] = {}
        self._user_inputs: dict[str, Any] = {}
        self._global_vars: dict[str, Any] = {}
        self._env_vars: dict[str, Any] = {}
        self._system_vars: dict[str, Any] = {}
        self._snapshots: dict[str, dict[str, Any]] = {}
        self._lock = asyncio.Lock()

    # ── Setters ────────────────────────────────────────────────────

    def set_system(self, key: str, value: Any) -> None:
        self._system_vars[key] = value

    def set_user_inputs(self, inputs: dict[str, Any]) -> None:
        self._user_inputs = dict(inputs)

    def set_global_variables(self, variables: list[dict[str, Any]]) -> None:
        for var in variables:
            name = var.get("name", "")
            default = var.get("default")
            if name:
                self._global_vars[name] = default

    def set_environment_variables(self, variables: list[dict[str, Any]]) -> None:
        import os
        for var in variables:
            name = var.get("name", "")
            if name:
                self._env_vars[name] = os.environ.get(name, var.get("default"))

    async def set_node_outputs(self, node_id: str, outputs: dict[str, Any]) -> None:
        async with self._lock:
            self._node_outputs[node_id] = dict(outputs)
            self._snapshots[node_id] = {
                "outputs": copy.deepcopy(outputs),
                "timestamp": datetime.utcnow().isoformat(),
            }

    # ── Resolution ─────────────────────────────────────────────────

    def resolve(self, selector: list[str]) -> Any:
        """Resolve a variable selector like ["start", "query"] -> value."""
        if not selector or len(selector) < 1:
            return None

        source = selector[0]

        # System variables
        if source == "sys":
            return self._system_vars.get(selector[1]) if len(selector) > 1 else None

        # Environment variables
        if source == "env":
            return self._env_vars.get(selector[1]) if len(selector) > 1 else None

        # User inputs
        if source == "inputs":
            if len(selector) == 1:
                return self._user_inputs
            return self._deep_get(self._user_inputs, selector[1:])

        # Global variables
        if source == "global":
            if len(selector) == 1:
                return self._global_vars
            return self._deep_get(self._global_vars, selector[1:])

        # Node outputs
        node_output = self._node_outputs.get(source)
        if node_output is not None:
            if len(selector) == 1:
                return node_output
            return self._deep_get(node_output, selector[1:])

        return None

    def resolve_template(self, template: str) -> str:
        """Replace all {{selector.path}} references in a template string."""
        def _replacer(match: re.Match) -> str:
            selector_str = match.group(1)
            selector = selector_str.split(".")
            value = self.resolve(selector)
            if value is None:
                return match.group(0)  # keep original if not found
            if isinstance(value, (dict, list)):
                import json
                return json.dumps(value, ensure_ascii=False)
            return str(value)

        return _SELECTOR_RE.sub(_replacer, template)

    def resolve_inputs(self, input_selectors: list[dict[str, Any]]) -> dict[str, Any]:
        """Resolve a list of {name, selector} to actual values."""
        resolved: dict[str, Any] = {}
        for inp in input_selectors:
            name = inp.get("name", "")
            selector = inp.get("selector", [])
            resolved[name] = self.resolve(selector)
        return resolved

    # ── Query ──────────────────────────────────────────────────────

    def get_node_outputs(self, node_id: str) -> dict[str, Any]:
        return dict(self._node_outputs.get(node_id, {}))

    def get_snapshot(self, node_id: str) -> dict[str, Any] | None:
        return self._snapshots.get(node_id)

    def get_all_outputs(self) -> dict[str, Any]:
        """Return all node outputs (for final result collection)."""
        return copy.deepcopy(self._node_outputs)

    def get_all_user_inputs(self) -> dict[str, Any]:
        return dict(self._user_inputs)

    # ── Internal ───────────────────────────────────────────────────

    @staticmethod
    def _deep_get(data: Any, path: list[str]) -> Any:
        """Traverse nested dicts/lists by path segments."""
        current = data
        for part in path:
            if current is None:
                return None
            if isinstance(current, dict):
                current = current.get(part)
            elif isinstance(current, list):
                try:
                    idx = int(part)
                    current = current[idx] if 0 <= idx < len(current) else None
                except (ValueError, IndexError):
                    return None
            else:
                return None
        return current
