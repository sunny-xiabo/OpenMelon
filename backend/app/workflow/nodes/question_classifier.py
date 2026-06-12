"""Question classifier node -- classifies user input into predefined categories."""
from __future__ import annotations

from typing import Any

from app.workflow.nodes.base import BaseNode
from app.utils.logger import logger

log = logger.getChild("workflow.nodes.question_classifier")


class QuestionClassifierNode(BaseNode):
    node_type = "question_classifier"

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

        # Get the input text
        input_text = ""
        input_variable = config.get("input_variable", [])
        if input_variable and variable_pool:
            input_text = str(variable_pool.resolve(input_variable) or "")
        elif inputs:
            input_text = str(list(inputs.values())[0])

        categories = config.get("categories", [])
        model = config.get("model", "")

        if not input_text or not categories:
            return {"category": "", "confidence": 0.0}

        # Build classification prompt
        cat_desc = "\n".join(
            f"{i+1}. {c.get('name', '')}: {c.get('description', '')}"
            for i, c in enumerate(categories)
        )
        prompt = (
            f"请将以下问题分类到最匹配的类别中，只返回类别名称：\n\n"
            f"类别列表：\n{cat_desc}\n\n"
            f"问题：{input_text}"
        )

        try:
            response = await llm_client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0,
                max_tokens=100,
            )
            result_text = (response.choices[0].message.content or "").strip()

            # Match to known categories
            matched = ""
            for cat in categories:
                cat_name = cat.get("name", "")
                if cat_name.lower() in result_text.lower() or result_text.lower() in cat_name.lower():
                    matched = cat_name
                    break

            if not matched:
                matched = result_text

            log.info("Question classifier: '%s' -> '%s'", input_text[:50], matched)
            return {"category": matched, "raw_response": result_text}

        except Exception as e:
            log.error("Question classification failed: %s", e)
            return {"category": "", "error": str(e)}

    def validate_config(self, config: dict[str, Any]) -> list[str]:
        errors = []
        if not config.get("categories"):
            errors.append("Question classifier requires 'categories' in config")
        return errors
