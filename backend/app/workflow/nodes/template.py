"""Template transform node -- Jinja2-based text formatting."""
from __future__ import annotations

from typing import Any

from app.workflow.nodes.base import BaseNode
from app.utils.logger import logger

log = logger.getChild("workflow.nodes.template")


class TemplateNode(BaseNode):
    node_type = "template"

    async def execute(
        self,
        inputs: dict[str, Any],
        config: dict[str, Any],
        context: dict[str, Any],
    ) -> dict[str, Any]:
        template_str = config.get("template", "")
        variable_pool = context.get("variable_pool")

        if not template_str:
            return {"output": ""}

        try:
            # Try Jinja2 rendering first
            from jinja2 import Template, Environment
            env = Environment(
                autoescape=False,
                undefined=_SilentUndefined,
            )
            # Gather all available variables for the template context
            template_vars: dict[str, Any] = {}
            if variable_pool:
                # Add all node outputs as top-level keys
                all_outputs = variable_pool.get_all_outputs()
                for node_id, outputs in all_outputs.items():
                    template_vars[node_id] = outputs
                # Add user inputs
                template_vars["inputs"] = variable_pool.get_all_user_inputs()

            template_vars.update(inputs)

            tmpl = env.from_string(template_str)
            output = tmpl.render(**template_vars)

        except ImportError:
            # Fallback to simple {{variable}} substitution
            if variable_pool:
                output = variable_pool.resolve_template(template_str)
            else:
                output = template_str
        except Exception as e:
            log.warning("Jinja2 render failed, falling back to simple substitution: %s", e)
            if variable_pool:
                output = variable_pool.resolve_template(template_str)
            else:
                output = template_str

        return {"output": output}

    def validate_config(self, config: dict[str, Any]) -> list[str]:
        errors = []
        if not config.get("template"):
            errors.append("Template node requires 'template' in config")
        return errors


try:
    from jinja2 import Undefined as _JinjaUndefined
except ImportError:
    _JinjaUndefined = object  # fallback so the class definition still parses


class _SilentUndefined(_JinjaUndefined):
    """Silent undefined for Jinja2 -- returns empty string for missing variables."""
    def __str__(self):
        return ""
    def __iter__(self):
        return iter([])
    def __bool__(self):
        return False
