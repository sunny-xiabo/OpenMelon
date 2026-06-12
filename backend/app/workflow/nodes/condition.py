"""IF/ELSE condition node -- evaluates conditions and routes to true/false branch."""
from __future__ import annotations

import re
from typing import Any

from app.workflow.nodes.base import BaseNode
from app.utils.logger import logger

log = logger.getChild("workflow.nodes.condition")

# Supported comparison operators
_OPERATORS = {
    "contains": lambda a, b: str(b) in str(a),
    "not_contains": lambda a, b: str(b) not in str(a),
    "equals": lambda a, b: str(a) == str(b),
    "not_equals": lambda a, b: str(a) != str(b),
    "start_with": lambda a, b: str(a).startswith(str(b)),
    "end_with": lambda a, b: str(a).endswith(str(b)),
    "is_empty": lambda a, _b: a is None or str(a).strip() == "",
    "is_not_empty": lambda a, _b: a is not None and str(a).strip() != "",
    "gt": lambda a, b: _to_number(a) > _to_number(b),
    "gte": lambda a, b: _to_number(a) >= _to_number(b),
    "lt": lambda a, b: _to_number(a) < _to_number(b),
    "lte": lambda a, b: _to_number(a) <= _to_number(b),
    "regex_match": lambda a, b: bool(re.search(str(b), str(a))),
}


def _to_number(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


class ConditionNode(BaseNode):
    node_type = "if_else"

    async def execute(
        self,
        inputs: dict[str, Any],
        config: dict[str, Any],
        context: dict[str, Any],
    ) -> dict[str, Any]:
        conditions = config.get("conditions", [])
        logical_op = config.get("logical_operator", "and")

        variable_pool = context.get("variable_pool")
        results: list[bool] = []

        for cond in conditions:
            var_selector = cond.get("variable_selector", [])
            operator = cond.get("operator", "equals")
            expected_value = cond.get("value")

            # Resolve the variable value
            if variable_pool:
                actual_value = variable_pool.resolve(var_selector)
            else:
                actual_value = inputs.get(var_selector[0] if var_selector else "")

            # Evaluate condition
            op_fn = _OPERATORS.get(operator)
            if op_fn is None:
                log.warning("Unknown operator '%s', treating as false", operator)
                results.append(False)
            else:
                try:
                    result = op_fn(actual_value, expected_value)
                    results.append(bool(result))
                except Exception as e:
                    log.warning("Condition evaluation error: %s", e)
                    results.append(False)

        # Combine results with logical operator
        if not results:
            condition_met = True
        elif logical_op == "or":
            condition_met = any(results)
        else:
            condition_met = all(results)

        log.info("Condition node: %d conditions, op=%s, result=%s",
                 len(results), logical_op, condition_met)

        return {
            "condition_met": condition_met,
            "branch": "true" if condition_met else "false",
            "results": results,
        }

    def validate_config(self, config: dict[str, Any]) -> list[str]:
        errors = []
        conditions = config.get("conditions", [])
        if not conditions:
            errors.append("Condition node requires at least one condition")
        for i, cond in enumerate(conditions):
            if not cond.get("variable_selector"):
                errors.append(f"Condition {i}: missing 'variable_selector'")
            if cond.get("operator") not in _OPERATORS:
                errors.append(f"Condition {i}: unknown operator '{cond.get('operator')}'")
        return errors
