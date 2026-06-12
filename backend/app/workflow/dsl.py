"""DSL serialization and deserialization for workflow definitions.

Supports JSON (primary) and YAML (import/export) formats.
"""
from __future__ import annotations

import json
from typing import Any

from app.workflow.models import (
    CreateWorkflowRequest,
    EdgeDef,
    NodeDef,
    VariableDef,
    WorkflowDef,
)
from app.utils.logger import logger

log = logger.getChild("workflow.dsl")


def workflow_to_json(workflow: WorkflowDef) -> str:
    """Export a workflow definition as JSON string."""
    data = {
        "id": workflow.id,
        "name": workflow.name,
        "description": workflow.description,
        "icon": workflow.icon,
        "nodes": [n.model_dump() for n in workflow.nodes],
        "edges": [e.model_dump() for e in workflow.edges],
        "variables": [v.model_dump() for v in workflow.variables],
        "environment_variables": [v.model_dump() for v in workflow.environment_variables],
        "status": workflow.status,
        "version": workflow.version,
    }
    return json.dumps(data, ensure_ascii=False, indent=2)


def workflow_to_yaml(workflow: WorkflowDef) -> str:
    """Export a workflow definition as YAML string."""
    try:
        import yaml
    except ImportError:
        log.warning("PyYAML not installed, falling back to JSON")
        return workflow_to_json(workflow)

    data = {
        "workflow": {
            "id": workflow.id,
            "name": workflow.name,
            "description": workflow.description,
            "icon": workflow.icon,
            "version": workflow.version,
            "nodes": [n.model_dump() for n in workflow.nodes],
            "edges": [e.model_dump() for e in workflow.edges],
            "variables": [v.model_dump() for v in workflow.variables],
            "environment_variables": [v.model_dump() for v in workflow.environment_variables],
        }
    }
    return yaml.dump(data, allow_unicode=True, default_flow_style=False, sort_keys=False)


def parse_json_dsl(json_str: str) -> CreateWorkflowRequest:
    """Parse a JSON DSL string into a CreateWorkflowRequest."""
    data = json.loads(json_str)
    return _dict_to_request(data)


def parse_yaml_dsl(yaml_str: str) -> CreateWorkflowRequest:
    """Parse a YAML DSL string into a CreateWorkflowRequest."""
    try:
        import yaml
    except ImportError:
        raise ImportError("PyYAML is required to parse YAML DSL")

    data = yaml.safe_load(yaml_str)
    # Support both flat and wrapped formats
    if "workflow" in data:
        data = data["workflow"]
    return _dict_to_request(data)


def _dict_to_request(data: dict[str, Any]) -> CreateWorkflowRequest:
    """Convert a raw dict to a CreateWorkflowRequest."""
    nodes = [NodeDef(**n) for n in data.get("nodes", [])]
    edges = [EdgeDef(**e) for e in data.get("edges", [])]
    variables = [VariableDef(**v) for v in data.get("variables", [])]
    env_vars = [VariableDef(**v) for v in data.get("environment_variables", [])]

    return CreateWorkflowRequest(
        name=data.get("name", "Untitled Workflow"),
        description=data.get("description", ""),
        icon=data.get("icon", "workflow"),
        nodes=nodes,
        edges=edges,
        variables=variables,
        environment_variables=env_vars,
    )
