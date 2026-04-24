from fastapi import APIRouter, HTTPException

from app.api.schemas import (
    PromptHubMutationResponse,
    PromptHubSkillCategoryPayload,
    PromptHubSkillPayload,
    PromptHubTemplatePayload,
)
from app.services.prompt_hub_tracker import prompt_hub_tracker

router = APIRouter(prefix="/prompt-hub", tags=["prompt-hub"])


@router.get("/options")
async def get_prompt_hub_options():
    try:
        return prompt_hub_tracker.get_options()
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/templates")
async def get_prompt_hub_templates():
    try:
        return {"templates": prompt_hub_tracker.list_templates(enabled_only=False)}
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/skills")
async def get_prompt_hub_skills():
    try:
        return {"skills": prompt_hub_tracker.list_skills(enabled_only=False)}
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/skill-categories")
async def get_prompt_hub_skill_categories():
    try:
        return {"skill_categories": prompt_hub_tracker.list_skill_categories()}
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/templates", response_model=PromptHubMutationResponse)
async def create_prompt_hub_template(payload: PromptHubTemplatePayload):
    try:
        return prompt_hub_tracker.create_template(payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.put("/templates/{template_id}", response_model=PromptHubMutationResponse)
async def update_prompt_hub_template(
    template_id: str, payload: PromptHubTemplatePayload
):
    try:
        return prompt_hub_tracker.update_template(template_id, payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/templates/{template_id}", response_model=PromptHubMutationResponse)
async def delete_prompt_hub_template(template_id: str):
    try:
        return prompt_hub_tracker.delete_template(template_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/skills", response_model=PromptHubMutationResponse)
async def create_prompt_hub_skill(payload: PromptHubSkillPayload):
    try:
        return prompt_hub_tracker.create_skill(payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.put("/skills/{skill_id}", response_model=PromptHubMutationResponse)
async def update_prompt_hub_skill(skill_id: str, payload: PromptHubSkillPayload):
    try:
        return prompt_hub_tracker.update_skill(skill_id, payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/skills/{skill_id}", response_model=PromptHubMutationResponse)
async def delete_prompt_hub_skill(skill_id: str):
    try:
        return prompt_hub_tracker.delete_skill(skill_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/skill-categories", response_model=PromptHubMutationResponse)
async def create_prompt_hub_skill_category(payload: PromptHubSkillCategoryPayload):
    try:
        return prompt_hub_tracker.create_skill_category(payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.put("/skill-categories/{category_id}", response_model=PromptHubMutationResponse)
async def update_prompt_hub_skill_category(
    category_id: str, payload: PromptHubSkillCategoryPayload
):
    try:
        return prompt_hub_tracker.update_skill_category(category_id, payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/skill-categories/{category_id}", response_model=PromptHubMutationResponse)
async def delete_prompt_hub_skill_category(category_id: str):
    try:
        return prompt_hub_tracker.delete_skill_category(category_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
