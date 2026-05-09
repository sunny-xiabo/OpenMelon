import json

from app.models import graph_types
from app.models.graph_types import NodeTypeStore


def _seed_configs() -> list[dict]:
    return [
        {
            "type": "Product",
            "category": "fixed",
            "color": {"bg": "#3b82f6", "border": "#2563eb"},
            "size": 30,
        },
        {
            "type": "Entity",
            "category": "fallback",
            "color": {"bg": "#94a3b8", "border": "#64748b"},
            "size": 18,
        },
    ]


def test_node_type_store_seeds_from_json_and_writes_to_sqlite(tmp_path):
    seed_path = tmp_path / "node_types.json"
    original_seed = _seed_configs()
    seed_path.write_text(json.dumps(original_seed), encoding="utf-8")

    store = NodeTypeStore(tmp_path / "node_types.db", seed_path)
    configs = store.list_configs()
    configs.append(
        {
            "type": "Service",
            "category": "extendable",
            "color": {"bg": "#14b8a6", "border": "#0f766e"},
            "size": 20,
        }
    )
    store.replace_configs(configs)

    assert [item["type"] for item in store.list_configs()] == [
        "Product",
        "Entity",
        "Service",
    ]
    assert json.loads(seed_path.read_text(encoding="utf-8")) == original_seed


def test_graph_type_mutations_use_sqlite_store(tmp_path, monkeypatch):
    seed_path = tmp_path / "node_types.json"
    original_seed = _seed_configs()
    seed_path.write_text(json.dumps(original_seed), encoding="utf-8")
    store = NodeTypeStore(tmp_path / "node_types.db", seed_path)
    monkeypatch.setattr(graph_types, "node_type_store", store)

    graph_types.reload_node_type_configs()
    created = graph_types.create_node_type_config(
        {
            "type": "Service",
            "category": "extendable",
            "color": {"bg": "#14b8a6", "border": "#0f766e"},
            "size": 20,
        }
    )
    updated = graph_types.update_node_type_config(
        "Service",
        {"color": {"bg": "#0ea5e9", "border": "#0284c7"}, "size": 22},
    )
    graph_types.delete_node_type_config("Service")

    assert created["type"] == "Service"
    assert updated["size"] == 22
    assert graph_types.list_node_type_configs() == [
        {
            **item,
            "locked": item["type"] in graph_types.SYSTEM_RESERVED_NODE_TYPES,
            "constraints": graph_types.get_node_type_constraints(
                item["type"],
                item["category"],
            ),
        }
        for item in original_seed
    ]
    assert json.loads(seed_path.read_text(encoding="utf-8")) == original_seed
