from copy import deepcopy
import json
import re
from typing import Any

from openai import AsyncOpenAI

from app.api.logging_service import safe_log_event
from app.config import settings
from app.api_execution.dsl_generator import generate_api_dsl
from app.api_execution.policy import evaluate_execution_policy
from app.api_execution.schemas import APITestCaseDsl


AI_ASSISTANT_TIMEOUT_SECONDS = 20


def _log_ai_event(level: str, event_type: str, title: str, message: str = "", **kwargs):
    return safe_log_event(level, "ai_assistant", event_type, title, message, **kwargs)


__all__ = [name for name in globals() if not name.startswith("__")]
