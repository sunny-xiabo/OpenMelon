"""LLM node -- invokes a language model with prompt template and variable injection."""
from __future__ import annotations

import time
from typing import Any

from app.workflow.nodes.base import BaseNode
from app.utils.logger import logger

log = logger.getChild("workflow.nodes.llm")


class LLMNode(BaseNode):
    node_type = "llm"

    async def execute(
        self,
        inputs: dict[str, Any],
        config: dict[str, Any],
        context: dict[str, Any],
    ) -> dict[str, Any]:
        llm_client = context.get("llm_client")
        if llm_client is None:
            raise RuntimeError("LLM client not available in execution context")

        # Resolve prompt template with variable substitution
        prompt_template = config.get("prompt_template", "")
        variable_pool = context.get("variable_pool")
        if variable_pool:
            prompt = variable_pool.resolve_template(prompt_template)
        else:
            prompt = prompt_template

        system_prompt = config.get("system_prompt", "")
        if variable_pool and system_prompt:
            system_prompt = variable_pool.resolve_template(system_prompt)

        model = config.get("model", "")
        temperature = config.get("temperature", 0.7)
        max_tokens = config.get("max_tokens", 4096)

        # Build messages
        messages: list[dict[str, str]] = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        started_at = time.perf_counter()
        try:
            response = await llm_client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
            )
            elapsed_ms = int((time.perf_counter() - started_at) * 1000)

            text = response.choices[0].message.content or ""
            usage = {}
            if response.usage:
                usage = {
                    "prompt_tokens": response.usage.prompt_tokens,
                    "completion_tokens": response.usage.completion_tokens,
                    "total_tokens": response.usage.total_tokens,
                }

            log.info("LLM node completed: model=%s, tokens=%d, elapsed=%dms",
                     model, usage.get("total_tokens", 0), elapsed_ms)

            return {
                "text": text,
                "usage": usage,
                "elapsed_ms": elapsed_ms,
            }

        except Exception as e:
            elapsed_ms = int((time.perf_counter() - started_at) * 1000)
            log.error("LLM node failed: model=%s, error=%s, elapsed=%dms",
                      model, str(e), elapsed_ms)
            raise

    def validate_config(self, config: dict[str, Any]) -> list[str]:
        errors = []
        if not config.get("model"):
            errors.append("LLM node requires 'model' in config")
        if not config.get("prompt_template"):
            errors.append("LLM node requires 'prompt_template' in config")
        return errors
