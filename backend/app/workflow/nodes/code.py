"""Code node -- executes user-provided Python code in a restricted environment."""
from __future__ import annotations

import asyncio
import traceback
from typing import Any

from app.workflow.nodes.base import BaseNode
from app.utils.logger import logger

log = logger.getChild("workflow.nodes.code")

# Allowed builtins for sandboxed execution
_SAFE_BUILTINS = {
    "abs", "all", "any", "bool", "dict", "enumerate", "filter",
    "float", "frozenset", "getattr", "hasattr", "hash", "int",
    "isinstance", "iter", "len", "list", "map", "max", "min",
    "next", "pow", "print", "range", "repr", "reversed", "round",
    "set", "slice", "sorted", "str", "sum", "tuple", "type", "zip",
    "True", "False", "None",
}


class CodeNode(BaseNode):
    node_type = "code"

    async def execute(
        self,
        inputs: dict[str, Any],
        config: dict[str, Any],
        context: dict[str, Any],
    ) -> dict[str, Any]:
        language = config.get("language", "python")
        code = config.get("code", "")
        timeout = config.get("timeout", 10)

        if language != "python":
            raise ValueError(f"Unsupported language: {language}")

        if not code.strip():
            return {"result": None}

        # Build the execution environment
        safe_globals: dict[str, Any] = {
            "__builtins__": {k: __builtins__[k] for k in _SAFE_BUILTINS if k in __builtins__},
        }

        local_vars: dict[str, Any] = {"args": dict(inputs)}

        try:
            # Execute with timeout
            result = await asyncio.wait_for(
                _run_python(code, safe_globals, local_vars),
                timeout=timeout,
            )

            # Try to extract 'result' from local vars
            output = local_vars.get("result", result)

            log.info("Code node completed, output type: %s", type(output).__name__)
            return {"result": output}

        except asyncio.TimeoutError:
            raise RuntimeError(f"Code execution timed out after {timeout}s")
        except Exception as e:
            log.error("Code node failed: %s", e)
            raise

    def validate_config(self, config: dict[str, Any]) -> list[str]:
        errors = []
        if not config.get("code"):
            errors.append("Code node requires 'code' in config")
        lang = config.get("language", "python")
        if lang != "python":
            errors.append(f"Unsupported language: {lang}")
        return errors


async def _run_python(code: str, globals_dict: dict, locals_dict: dict) -> Any:
    """Run Python code in a thread pool to avoid blocking the event loop."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _exec_code, code, globals_dict, locals_dict)


def _exec_code(code: str, globals_dict: dict, locals_dict: dict) -> Any:
    """Synchronous code execution."""
    exec(code, globals_dict, locals_dict)  # noqa: S102
    return locals_dict.get("result")
