"""Model presets API — dynamic model dropdown options for testcase_gen."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import require_production_auth
from app.llm_provider_registry import list_provider_metadata
from app.testcase_gen.tc_llm_slot_store import tc_llm_slot_store

PRESETS_FILE = Path(__file__).resolve().parent / "model_presets.json"

DEFAULT_PRESETS: dict[str, list[str]] = {
    "custom": ["deepseek-ai/DeepSeek-V3", "qwen-plus", "gpt-4o-mini"],
    "vision": ["qwen-vl-max", "qwen3-vl-32b-siliconflow", "qwen2.5-vl-72b-instruct"],
    "text": ["deepseek-v4-pro", "deepseek-v4-flash", "deepseek-reasoner", "deepseek-chat", "deepseek-v3.2", "qwen-plus"],
}

DEPRECATED_MODELS: list[str] = [
    "deepseek-chat",
    "deepseek-reasoner",
]


def _load_presets() -> dict[str, Any]:
    if PRESETS_FILE.exists():
        try:
            return json.loads(PRESETS_FILE.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            pass
    return {
        "presets": dict(DEFAULT_PRESETS),
        "deprecated": list(DEPRECATED_MODELS),
    }


def _save_presets(data: dict[str, Any]) -> None:
    PRESETS_FILE.parent.mkdir(parents=True, exist_ok=True)
    PRESETS_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


router = APIRouter(prefix="/model-presets", tags=["model-presets"])


@router.get("")
async def get_model_presets() -> dict[str, Any]:
    """获取当前模型预设列表和弃用标记。"""
    return _load_presets()


@router.put("", dependencies=[Depends(require_production_auth)])
async def update_model_presets(payload: dict[str, Any]) -> dict[str, Any]:
    """更新模型预设列表。"""
    presets = payload.get("presets")
    deprecated = payload.get("deprecated")
    if presets is not None and not isinstance(presets, dict):
        raise HTTPException(status_code=422, detail="presets 必须是一个字典")
    if deprecated is not None and not isinstance(deprecated, list):
        raise HTTPException(status_code=422, detail="deprecated 必须是一个字符串列表")
    current = _load_presets()
    if presets is not None:
        current["presets"] = presets
    if deprecated is not None:
        current["deprecated"] = deprecated
    _save_presets(current)
    return current


@router.get("/slot-config")
async def get_slot_config() -> dict[str, Any]:
    """获取三槽位运行时配置 + 可用 providers。"""
    slots = tc_llm_slot_store.get_all_slots()
    providers = list_provider_metadata()
    return {
        "slots": slots,
        "providers": providers,
    }


@router.put("/slot-config", dependencies=[Depends(require_production_auth)])
async def update_slot_config(payload: dict[str, Any]) -> dict[str, Any]:
    """更新槽位配置。payload.slots = {text: {...}, vision: {...}, embedding: {...}}"""
    slots_data = payload.get("slots", {})
    if not isinstance(slots_data, dict):
        raise HTTPException(status_code=422, detail="slots 必须是字典")
    valid_keys = {"text", "vision", "embedding"}
    valid_modes = {"global", "independent", "same_as_text"}
    for key, config in slots_data.items():
        if key not in valid_keys:
            raise HTTPException(status_code=422, detail=f"无效的槽位 key: {key}")
        mode = config.get("mode", "global")
        if mode not in valid_modes:
            raise HTTPException(status_code=422, detail=f"无效的 mode: {mode}")
        if key != "vision" and mode == "same_as_text":
            raise HTTPException(status_code=422, detail="只有 vision 槽位可以使用 same_as_text 模式")
        tc_llm_slot_store.save_slot(key, config)
    return {"slots": tc_llm_slot_store.get_all_slots()}
