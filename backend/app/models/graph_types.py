import json
import os
import re
from pathlib import Path
from typing import Dict, List


DEFAULT_NODE_TYPES_CONFIG_PATH = (
    Path(__file__).resolve().parents[2] / "config" / "node_types.json"
)
NODE_TYPES_CONFIG_PATH = Path(
    os.getenv("NODE_TYPES_CONFIG_PATH", str(DEFAULT_NODE_TYPES_CONFIG_PATH))
).expanduser()
VALID_NODE_TYPE_CATEGORIES = {"fixed", "extendable", "fallback"}
SYSTEM_RESERVED_NODE_TYPES = {
    "Product",
    "Module",
    "Feature",
    "API",
    "TestCase",
    "Defect",
    "Person",
    "DocumentChunk",
    "Entity",
}
NODE_TYPE_NAME_PATTERN = re.compile(r"^[A-Za-z][A-Za-z0-9_]*$")

NODE_TYPE_CONFIGS: List[Dict] = []
NODE_TYPE_CONFIG_MAP: Dict[str, Dict] = {}
FIXED_NODE_TYPES: List[str] = []
CORE_NODE_TYPES: List[str] = []
FALLBACK_NODE_TYPE = "Entity"
DOCUMENT_CHUNK_NODE_TYPE = "DocumentChunk"


def _load_configs_from_disk() -> List[Dict]:
    if not NODE_TYPES_CONFIG_PATH.exists():
        raise FileNotFoundError(
            f"Node type config file not found: {NODE_TYPES_CONFIG_PATH}. "
            f"Set NODE_TYPES_CONFIG_PATH or ensure the file is packaged correctly."
        )
    with NODE_TYPES_CONFIG_PATH.open("r", encoding="utf-8") as f:
        return json.load(f)


def _write_configs_to_disk(configs: List[Dict]) -> None:
    with NODE_TYPES_CONFIG_PATH.open("w", encoding="utf-8") as f:
        json.dump(configs, f, ensure_ascii=False, indent=2)
        f.write("\n")


def _refresh_globals(configs: List[Dict]) -> None:
    fallback_type = next(
        item["type"] for item in configs if item["category"] == "fallback"
    )
    fixed_types = [item["type"] for item in configs if item["category"] == "fixed"]
    core_types = [
        node_type for node_type in fixed_types if node_type != DOCUMENT_CHUNK_NODE_TYPE
    ]

    NODE_TYPE_CONFIGS[:] = configs
    NODE_TYPE_CONFIG_MAP.clear()
    NODE_TYPE_CONFIG_MAP.update({item["type"]: item for item in configs})
    FIXED_NODE_TYPES[:] = fixed_types
    CORE_NODE_TYPES[:] = core_types

    global FALLBACK_NODE_TYPE
    FALLBACK_NODE_TYPE = fallback_type


def reload_node_type_configs() -> List[Dict]:
    configs = _load_configs_from_disk()
    _refresh_globals(configs)
    return list(NODE_TYPE_CONFIGS)


def _deep_copy_configs(configs: List[Dict]) -> List[Dict]:
    return json.loads(json.dumps(configs))


def validate_node_type_payload(payload: Dict, *, existing_type: str | None = None) -> Dict:
    node_type = (payload.get("type") or existing_type or "").strip()
    category = (payload.get("category") or "").strip()
    color = payload.get("color") or {}
    size = payload.get("size")

    if not node_type:
        raise ValueError("节点类型名称不能为空")
    if not NODE_TYPE_NAME_PATTERN.match(node_type):
        raise ValueError("节点类型名称只支持字母开头，且仅包含字母、数字和下划线")
    if category not in VALID_NODE_TYPE_CATEGORIES:
        raise ValueError("节点类型分类只支持 fixed、extendable、fallback")

    bg = str(color.get("bg") or "").strip()
    border = str(color.get("border") or "").strip()
    if not re.fullmatch(r"^#[0-9A-Fa-f]{6}$", bg):
        raise ValueError("填充色必须是 6 位十六进制颜色，例如 #1A73E8")
    if not re.fullmatch(r"^#[0-9A-Fa-f]{6}$", border):
        raise ValueError("边框色必须是 6 位十六进制颜色，例如 #2563EB")

    try:
        size_value = int(size)
    except (TypeError, ValueError):
        raise ValueError("节点尺寸必须是整数")
    if size_value < 8 or size_value > 60:
        raise ValueError("节点尺寸必须在 8 到 60 之间")

    return {
        "type": node_type,
        "category": category,
        "color": {"bg": bg, "border": border},
        "size": size_value,
    }


def get_node_type_constraints(node_type: str, category: str) -> List[str]:
    constraints = [
        "节点类型名称对应 Neo4j Label，建议保持稳定，避免频繁变更。",
        "前端颜色和尺寸调整只影响展示，不会自动修改已写入数据库的节点标签。",
    ]
    if node_type in SYSTEM_RESERVED_NODE_TYPES:
        constraints.append("系统保留类型不可删除。")
    if category == "fallback":
        constraints.append("兜底类型只能保留一个，且不建议修改分类。")
    if category == "fixed":
        constraints.append(
            "固定类型的 Neo4j 唯一约束在服务初始化时创建；新增固定类型后需重启服务，且默认要求节点具备 name 属性。"
        )
    if category == "extendable":
        constraints.append("扩展类型默认不自动创建 Neo4j 唯一约束。")
    return constraints


def list_node_type_configs() -> List[Dict]:
    return [
        {
            **item,
            "locked": item["type"] in SYSTEM_RESERVED_NODE_TYPES,
            "constraints": get_node_type_constraints(item["type"], item["category"]),
        }
        for item in NODE_TYPE_CONFIGS
    ]


def get_primary_node_type(labels) -> str:
    if not labels:
        return FALLBACK_NODE_TYPE
    return labels[0]


def get_node_type_category(node_type: str) -> str:
    item = NODE_TYPE_CONFIG_MAP.get(node_type)
    if item:
        return item["category"]
    return "extendable"


def get_node_visual_meta(node_type: str):
    item = NODE_TYPE_CONFIG_MAP.get(node_type)
    if item:
        return {
            "color": item["color"],
            "size": item["size"],
        }
    fallback = NODE_TYPE_CONFIG_MAP[FALLBACK_NODE_TYPE]
    return {
        "color": fallback["color"],
        "size": fallback["size"],
    }


def create_node_type_config(payload: Dict) -> Dict:
    data = validate_node_type_payload(payload)
    if data["type"] in NODE_TYPE_CONFIG_MAP:
        raise ValueError(f"节点类型 {data['type']} 已存在")
    if data["category"] == "fallback":
        raise ValueError("不允许新增额外的 fallback 类型")

    configs = _deep_copy_configs(NODE_TYPE_CONFIGS)
    configs.append(data)
    _write_configs_to_disk(configs)
    _refresh_globals(configs)
    return next(item for item in list_node_type_configs() if item["type"] == data["type"])


def update_node_type_config(node_type: str, payload: Dict) -> Dict:
    existing = NODE_TYPE_CONFIG_MAP.get(node_type)
    if not existing:
        raise ValueError(f"节点类型 {node_type} 不存在")

    merged_payload = {
        "type": node_type,
        "category": payload.get("category", existing["category"]),
        "color": payload.get("color", existing["color"]),
        "size": payload.get("size", existing["size"]),
    }
    data = validate_node_type_payload(merged_payload, existing_type=node_type)

    if node_type in SYSTEM_RESERVED_NODE_TYPES and data["category"] != existing["category"]:
        raise ValueError("系统保留类型不允许修改分类")
    if existing["category"] == "fallback" and data["category"] != "fallback":
        raise ValueError("兜底类型不允许修改为其他分类")
    if data["category"] == "fallback" and node_type != FALLBACK_NODE_TYPE:
        raise ValueError("只有当前兜底类型允许保留 fallback 分类")

    configs = _deep_copy_configs(NODE_TYPE_CONFIGS)
    for index, item in enumerate(configs):
        if item["type"] == node_type:
            configs[index] = data
            break

    _write_configs_to_disk(configs)
    _refresh_globals(configs)
    return next(item for item in list_node_type_configs() if item["type"] == node_type)


def delete_node_type_config(node_type: str) -> None:
    existing = NODE_TYPE_CONFIG_MAP.get(node_type)
    if not existing:
        raise ValueError(f"节点类型 {node_type} 不存在")
    if node_type in SYSTEM_RESERVED_NODE_TYPES:
        raise ValueError("系统保留类型不可删除")

    configs = [item for item in _deep_copy_configs(NODE_TYPE_CONFIGS) if item["type"] != node_type]
    _write_configs_to_disk(configs)
    _refresh_globals(configs)


reload_node_type_configs()
