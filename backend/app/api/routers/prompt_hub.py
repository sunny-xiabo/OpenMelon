from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from app.api.errors import InternalError, InvalidRequestError, NotFoundError, UnauthorizedError

from app.api.deps import require_production_auth
from app.api.logging_service import safe_log_event
from app.api.schemas import (
    PromptHubMutationResponse,
    PromptHubSkillCategoryPayload,
    PromptHubSkillPayload,
    PromptHubTemplatePayload,
)
from app.services.prompt_hub_tracker import prompt_hub_tracker
from app.services.prompt_hub_safety import (
    annotate_prompt_hub_records,
    execute_prompt_hub_safety_action_service,
    list_prompt_hub_safety_recommendations_service,
)

router = APIRouter(prefix="/prompt-hub", tags=["prompt-hub"])


class PromptHubSafetyActionRequest(BaseModel):
    action: str
    record_kind: str
    record_id: str
    confirm: bool = False
    params: dict[str, Any] = Field(default_factory=dict)


def _log_prompt_event(level: str, event_type: str, title: str, message: str = "", **kwargs):
    return safe_log_event(level, "prompt_hub", event_type, title, message, **kwargs)


def _log_prompt_mutation(kind: str, action: str, record_id: str, result: dict):
    _log_prompt_event(
        "info",
        f"prompt_hub_{kind}_{action}",
        "Prompt Hub 配置已变更",
        result.get("message", ""),
        source_id=record_id,
        refs=[record_id, kind],
        data={"kind": kind, "action": action, "record_id": record_id, "result": result},
    )


@router.get("/options")
async def get_prompt_hub_options():
    try:
        return prompt_hub_tracker.get_options()
    except ValueError as exc:
        raise InternalError(details=str(exc)) from exc


@router.get("/templates")
async def get_prompt_hub_templates():
    try:
        return {"templates": annotate_prompt_hub_records(prompt_hub_tracker.list_templates(enabled_only=False), "template")}
    except ValueError as exc:
        raise InternalError(details=str(exc)) from exc


@router.get("/skills")
async def get_prompt_hub_skills():
    try:
        return {"skills": annotate_prompt_hub_records(prompt_hub_tracker.list_skills(enabled_only=False), "skill")}
    except ValueError as exc:
        raise InternalError(details=str(exc)) from exc


@router.get("/safety/recommendations")
async def get_prompt_hub_safety_recommendations():
    try:
        return list_prompt_hub_safety_recommendations_service()
    except ValueError as exc:
        raise InternalError(details=str(exc)) from exc


@router.post(
    "/safety/actions",
    dependencies=[Depends(require_production_auth)],
)
async def execute_prompt_hub_safety_action(payload: PromptHubSafetyActionRequest):
    try:
        return execute_prompt_hub_safety_action_service(
            action=payload.action,
            record_kind=payload.record_kind,
            record_id=payload.record_id,
            confirm=payload.confirm,
        )
    except ValueError as exc:
        raise InvalidRequestError(message=str(exc)) from exc


@router.get("/skill-categories")
async def get_prompt_hub_skill_categories():
    try:
        return {"skill_categories": prompt_hub_tracker.list_skill_categories()}
    except ValueError as exc:
        raise InternalError(details=str(exc)) from exc


@router.post(
    "/templates",
    response_model=PromptHubMutationResponse,
    dependencies=[Depends(require_production_auth)],
)
async def create_prompt_hub_template(payload: PromptHubTemplatePayload):
    try:
        result = prompt_hub_tracker.create_template(payload.model_dump())
        _log_prompt_mutation("template", "created", result.get("record", {}).get("id", ""), result)
        return result
    except ValueError as exc:
        raise InvalidRequestError(message=str(exc)) from exc


@router.put(
    "/templates/{template_id}",
    response_model=PromptHubMutationResponse,
    dependencies=[Depends(require_production_auth)],
)
async def update_prompt_hub_template(
    template_id: str, payload: PromptHubTemplatePayload
):
    try:
        result = prompt_hub_tracker.update_template(template_id, payload.model_dump())
        _log_prompt_mutation("template", "updated", template_id, result)
        return result
    except ValueError as exc:
        raise InvalidRequestError(message=str(exc)) from exc


@router.delete(
    "/templates/{template_id}",
    response_model=PromptHubMutationResponse,
    dependencies=[Depends(require_production_auth)],
)
async def delete_prompt_hub_template(template_id: str):
    try:
        result = prompt_hub_tracker.delete_template(template_id)
        _log_prompt_mutation("template", "deleted", template_id, result)
        return result
    except ValueError as exc:
        raise InvalidRequestError(message=str(exc)) from exc


@router.post(
    "/skills",
    response_model=PromptHubMutationResponse,
    dependencies=[Depends(require_production_auth)],
)
async def create_prompt_hub_skill(payload: PromptHubSkillPayload):
    try:
        result = prompt_hub_tracker.create_skill(payload.model_dump())
        _log_prompt_mutation("skill", "created", result.get("record", {}).get("id", ""), result)
        return result
    except ValueError as exc:
        raise InvalidRequestError(message=str(exc)) from exc


@router.put(
    "/skills/{skill_id}",
    response_model=PromptHubMutationResponse,
    dependencies=[Depends(require_production_auth)],
)
async def update_prompt_hub_skill(skill_id: str, payload: PromptHubSkillPayload):
    try:
        result = prompt_hub_tracker.update_skill(skill_id, payload.model_dump())
        _log_prompt_mutation("skill", "updated", skill_id, result)
        return result
    except ValueError as exc:
        raise InvalidRequestError(message=str(exc)) from exc


@router.delete(
    "/skills/{skill_id}",
    response_model=PromptHubMutationResponse,
    dependencies=[Depends(require_production_auth)],
)
async def delete_prompt_hub_skill(skill_id: str):
    try:
        result = prompt_hub_tracker.delete_skill(skill_id)
        _log_prompt_mutation("skill", "deleted", skill_id, result)
        return result
    except ValueError as exc:
        raise InvalidRequestError(message=str(exc)) from exc


@router.post(
    "/skill-categories",
    response_model=PromptHubMutationResponse,
    dependencies=[Depends(require_production_auth)],
)
async def create_prompt_hub_skill_category(payload: PromptHubSkillCategoryPayload):
    try:
        result = prompt_hub_tracker.create_skill_category(payload.model_dump())
        _log_prompt_mutation("skill_category", "created", result.get("record", {}).get("id", ""), result)
        return result
    except ValueError as exc:
        raise InvalidRequestError(message=str(exc)) from exc


@router.put(
    "/skill-categories/{category_id}",
    response_model=PromptHubMutationResponse,
    dependencies=[Depends(require_production_auth)],
)
async def update_prompt_hub_skill_category(
    category_id: str, payload: PromptHubSkillCategoryPayload
):
    try:
        result = prompt_hub_tracker.update_skill_category(category_id, payload.model_dump())
        _log_prompt_mutation("skill_category", "updated", category_id, result)
        return result
    except ValueError as exc:
        raise InvalidRequestError(message=str(exc)) from exc


@router.delete(
    "/skill-categories/{category_id}",
    response_model=PromptHubMutationResponse,
    dependencies=[Depends(require_production_auth)],
)
async def delete_prompt_hub_skill_category(category_id: str):
    try:
        result = prompt_hub_tracker.delete_skill_category(category_id)
        _log_prompt_mutation("skill_category", "deleted", category_id, result)
        return result
    except ValueError as exc:
        raise InvalidRequestError(message=str(exc)) from exc
