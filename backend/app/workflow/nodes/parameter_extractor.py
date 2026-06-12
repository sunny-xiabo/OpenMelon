"""Parameter extractor node -- uses LLM to extract structured parameters from text."""
from __future__ import annotations

import json
from typing import Any

from app.workflow.nodes.base import BaseNode
from app.utils.logger import logger

log = logger.getChild("workflow.nodes.parameter_extractor")


class ParameterExtractorNode(BaseNode):
    node_type = "parameter_extractor"

    async def execute(
        self,
        inputs: dict[str, Any],
        config: dict[str, Any],
        context: dict[str, Any],
    ) -> dict[str, Any]:
        llm_client = context.get("llm_client")
        if llm_client is None:
            raise RuntimeError("LLM client not available")

        variable_pool = context.get("variable_pool")

        # Get the text to extract from
        input_text = ""
        input_variable = config.get("input_variable", [])
        if input_variable and variable_pool:
            input_text = str(variable_pool.resolve(input_variable) or "")
        elif inputs:
            input_text = str(list(inputs.values())[0])

        # Get the extraction schema
        parameters = config.get("parameters", [])
        model = config.get("model", "")

        if not input_text or not parameters:
            return {"extracted": {}}

        # Build extraction prompt
        param_desc = "\n".join(
            f"- {p.get('name', '')}: {p.get('description', '')} (type: {p.get('type', 'string')})"
            for p in parameters
        )
        prompt = (
            f"从以下文本中提取参数，以JSON格式返回：\n\n"
            f"需要提取的参数：\n{param_desc}\n\n"
            f"文本内容：\n{input_text}\n\n"
            f"请只返回JSON对象，不要其他内容。"
        )

        try:
            response = await llm_client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0,
                max_tokens=1024,
            )
            text = response.choices[0].message.content or "{}"
            # Extract JSON from response
            text = text.strip()
            if text.startswith("```"):
                text = text.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
            extracted = json.loads(text)
            return {"extracted": extracted}
        except Exception as e:
            log.error("Parameter extraction failed: %s", e)
            return {"extracted": {}, "error": str(e)}

    def validate_config(self, config: dict[str, Any]) -> list[str]:
        errors = []
        if not config.get("parameters"):
            errors.append("Parameter extractor requires 'parameters' in config")
        return errors
