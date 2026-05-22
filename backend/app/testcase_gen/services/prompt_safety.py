import json
import re
from typing import Any


_PROMPT_INJECTION_MARKERS = (
    "ignore previous",
    "ignore all previous",
    "disregard previous",
    "system prompt",
    "developer message",
    "assistant message",
    "user message",
    "follow these instructions",
    "override instructions",
    "prompt injection",
    "你现在是",
    "忽略之前",
    "忽略所有之前",
    "请无视",
    "系统提示",
    "开发者消息",
    "覆盖指令",
)


def render_json_data_block(title: str, payload: Any) -> str:
    return f"{title}\n```json\n{json.dumps(payload, ensure_ascii=False, indent=2)}\n```"


def render_text_data_block(title: str, text: str) -> str:
    return render_json_data_block(title, {"text": text})


def detect_prompt_injection_signals(text: str) -> list[str]:
    normalized = re.sub(r"\s+", " ", text.lower())
    signals = []
    for marker in _PROMPT_INJECTION_MARKERS:
        if marker in normalized:
            signals.append(marker)
    return signals


def summarize_prompt_content_safety(items: list[dict[str, Any]]) -> list[str]:
    warnings: list[str] = []
    for item in items:
        label = item.get("label", "unknown")
        content = " ".join(
            str(item.get(field, "") or "")
            for field in ("name", "description", "review_summary", "content")
        )
        signals = detect_prompt_injection_signals(content)
        if signals:
            warnings.append(
                f"{label} 检测到可疑指令片段: {', '.join(sorted(set(signals)))}"
            )
    return warnings


def analyze_prompt_hub_record(record: dict[str, Any], kind: str = "record") -> dict[str, Any]:
    content = " ".join(
        str(record.get(field, "") or "")
        for field in ("name", "description", "review_summary", "content")
    )
    signals = sorted(set(detect_prompt_injection_signals(content)))
    enabled = bool(record.get("enabled", True))
    is_default = bool(record.get("is_default", False))
    risk_level = "low"
    if signals:
        risk_level = "high" if enabled and (len(signals) >= 2 or is_default) else "medium"
    return {
        "kind": kind,
        "record_id": record.get("id", ""),
        "name": record.get("name", ""),
        "enabled": enabled,
        "is_default": is_default,
        "risk_level": risk_level,
        "signals": signals,
        "signal_count": len(signals),
        "safe_to_disable": enabled and not is_default,
    }


__all__ = [name for name in globals() if not name.startswith("__")]
