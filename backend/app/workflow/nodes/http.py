"""HTTP request node -- makes external API calls."""
from __future__ import annotations

import time
from typing import Any

import httpx

from app.workflow.nodes.base import BaseNode
from app.utils.logger import logger

log = logger.getChild("workflow.nodes.http")

VALID_METHODS = {"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"}


class HTTPRequestNode(BaseNode):
    node_type = "http_request"

    async def execute(
        self,
        inputs: dict[str, Any],
        config: dict[str, Any],
        context: dict[str, Any],
    ) -> dict[str, Any]:
        variable_pool = context.get("variable_pool")

        method = config.get("method", "GET").upper()
        if method not in VALID_METHODS:
            raise ValueError(f"Invalid HTTP method: {method}")

        # Resolve URL with variable substitution
        url = config.get("url", "")
        if variable_pool:
            url = variable_pool.resolve_template(url)

        # Resolve headers
        raw_headers = config.get("headers", {})
        headers = {}
        for k, v in raw_headers.items():
            headers[k] = variable_pool.resolve_template(str(v)) if variable_pool else str(v)

        # Resolve query params
        raw_params = config.get("params", {})
        params = {}
        for k, v in raw_params.items():
            params[k] = variable_pool.resolve_template(str(v)) if variable_pool else str(v)

        # Resolve body
        body = None
        body_type = config.get("body_type", "json")
        raw_body = config.get("body")
        if raw_body is not None:
            if variable_pool:
                if isinstance(raw_body, dict):
                    body = {
                        k: variable_pool.resolve_template(str(v))
                        for k, v in raw_body.items()
                    }
                elif isinstance(raw_body, str):
                    body = variable_pool.resolve_template(raw_body)
                else:
                    body = raw_body
            else:
                body = raw_body

        timeout = config.get("timeout", 30)

        started_at = time.perf_counter()
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                kwargs: dict[str, Any] = {
                    "method": method,
                    "url": url,
                    "headers": headers,
                    "params": params,
                }
                if body is not None and method in {"POST", "PUT", "PATCH"}:
                    if body_type == "json":
                        kwargs["json"] = body
                    elif body_type == "form":
                        kwargs["data"] = body
                    else:
                        kwargs["content"] = body

                response = await client.request(**kwargs)

            elapsed_ms = int((time.perf_counter() - started_at) * 1000)

            # Parse response
            response_body: Any = None
            content_type = response.headers.get("content-type", "")
            if "json" in content_type:
                try:
                    response_body = response.json()
                except Exception:
                    response_body = response.text
            else:
                response_body = response.text

            log.info("HTTP node completed: %s %s -> %d (%dms)",
                     method, url, response.status_code, elapsed_ms)

            return {
                "status_code": response.status_code,
                "headers": dict(response.headers),
                "body": response_body,
                "elapsed_ms": elapsed_ms,
            }

        except Exception as e:
            elapsed_ms = int((time.perf_counter() - started_at) * 1000)
            log.error("HTTP node failed: %s %s -> %s (%dms)",
                      method, url, str(e), elapsed_ms)
            raise

    def validate_config(self, config: dict[str, Any]) -> list[str]:
        errors = []
        if not config.get("url"):
            errors.append("HTTP node requires 'url' in config")
        method = config.get("method", "GET").upper()
        if method not in VALID_METHODS:
            errors.append(f"Invalid HTTP method: {method}")
        return errors
