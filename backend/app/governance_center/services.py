"""Governance center service facade.

The underlying data still lives in API automation services while the governance
domain boundary is introduced. Routes and new callers should use this module for
task queue, knowledge governance, and template governance operations.
"""

from __future__ import annotations

from typing import Any

from app.api_execution.schemas import (
    APIFlowTemplateUpsertRequest,
    KnowledgeStatusUpdateRequest,
)
from app.api_execution.services.automation_service import (
    get_task_center_summary_service as _get_task_center_summary_service,
    list_automation_tasks_service as _list_automation_tasks_service,
    resolve_automation_task_service as _resolve_automation_task_service,
)
from app.api_execution.services.knowledge_service import (
    delete_knowledge_item_service as _delete_knowledge_item_service,
    list_knowledge_review_items_service as _list_knowledge_review_items_service,
    update_knowledge_item_status_service as _update_knowledge_item_status_service,
)
from app.api_execution.services.template_service import (
    delete_flow_template_service as _delete_flow_template_service,
    list_flow_templates_service as _list_flow_templates_service,
    upsert_flow_template_service as _upsert_flow_template_service,
)


def list_task_queue(
    limit: int = 20,
    offset: int = 0,
    status: str | None = None,
    project_id: str | None = None,
) -> dict[str, Any]:
    return _list_automation_tasks_service(limit=limit, offset=offset, status=status, project_id=project_id)


def summarize_task_queue(limit: int = 50, project_id: str | None = None) -> dict[str, Any]:
    return _get_task_center_summary_service(limit=limit, project_id=project_id)


def resolve_task(task_id: str) -> dict[str, Any]:
    return _resolve_automation_task_service(task_id)


def list_knowledge_items(
    limit: int = 50,
    offset: int = 0,
    project_id: str | None = None,
    status: str | None = None,
    item_type: str | None = None,
) -> dict[str, Any]:
    return _list_knowledge_review_items_service(
        limit=limit,
        offset=offset,
        project_id=project_id,
        status=status,
        item_type=item_type,
    )


def update_knowledge_status(knowledge_id: str, request: KnowledgeStatusUpdateRequest) -> dict[str, Any]:
    return _update_knowledge_item_status_service(knowledge_id, request)


def delete_knowledge_item(knowledge_id: str) -> dict[str, bool]:
    return _delete_knowledge_item_service(knowledge_id)


def list_templates(project_id: str | None = None, limit: int = 100, offset: int = 0) -> dict[str, Any]:
    return _list_flow_templates_service(project_id=project_id, limit=limit, offset=offset)


def upsert_template(request: APIFlowTemplateUpsertRequest) -> dict[str, Any]:
    return _upsert_flow_template_service(request)


def delete_template(template_id: str) -> dict[str, bool]:
    return _delete_flow_template_service(template_id)
