import hashlib
from app.api.errors import InternalError, InvalidRequestError, NotFoundError, UnauthorizedError
import json
import os
import tempfile
import uuid
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated, Any

import httpx

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import Response, StreamingResponse
from starlette.concurrency import run_in_threadpool

from app.config import settings
from app.api.logging_service import log_event
from app.api_execution.schemas import (
    APIEnvironmentConfig,
    APIEnvironmentListResponse,
    APIEnvironmentUpsertRequest,
    APIFlowTemplate,
    APIFlowTemplateListResponse,
    APIFlowTemplateUpsertRequest,
    AIDslEnhanceRequest,
    AIFlowDraftRequest,
    AIFlowDraftResponse,
    AIRepairPatchRequest,
    AIPatchResponse,
    AutomationTaskCenterSummaryResponse,
    AutomationTaskListResponse,
    AutomationTaskRecord,
    APIOperationAsset,
    APIProjectConfig,
    APIProjectListResponse,
    APIProjectUpsertRequest,
    APIAssetModule,
    APIAssetModuleCreateRequest,
    APIAssetModuleMergeRequest,
    APIAssetModuleRemoveRequest,
    APIAssetModuleUpdateRequest,
    APIAssetInterface,
    APIAssetInterfaceCreateRequest,
    APIAssetSyncResponse,
    APIAssetInterfaceUpdateRequest,
    APIAssetTestPlanRequest,
    APIAssetTestPlanResponse,
    APIAgentAction,
    APIAgentContextResponse,
    APIAgentTestPlanRequest,
    APIAgentTestPlanResponse,
    APIAssetImpactResponse,
    APIProjectAssetsResponse,
    APIInterfaceListResponse,
    PolicyAuditListResponse,
    APITestCaseDsl,
    CreateRunResponse,
    DemoBootstrapResponse,
    ExportScriptRequest,
    GenerateDslRequest,
    KnowledgeIngestResponse,
    KnowledgeCandidateApproveResponse,
    KnowledgeCandidateCreateResponse,
    KnowledgeItem,
    KnowledgeReviewResponse,
    KnowledgeSearchResponse,
    KnowledgeStatusUpdateRequest,
    OpenAPIParseResponse,
    OperationsResponse,
    ParseUrlRequest,
    APIRunReport,
    APIRunHistoryResponse,
    RunScriptRequest,
    APIStepRunResult,
    ScheduledExecutionResponse,
    SpecSyncResponse,
    StorageMigrationReadinessResponse,
    ValidateDslRequest,
)
from app.api_execution.ai_assistant import (
    build_flow_draft,
    build_repair_patch,
    build_repair_patch_with_configured_ai,
    enhance_dsl_with_configured_ai,
)
from app.api_execution.storage import api_execution_store
from app.api_execution.diagnostics import enrich_run_report
from app.api_execution.dsl_generator import generate_api_dsl
from app.api_execution.knowledge import build_run_knowledge_items, write_run_to_graph_with_retry, build_graph_write_failure_task
from app.api_execution.exporters.postman_exporter import generate_postman_collection
from app.api_execution.exporters.pytest_exporter import generate_pytest_script
from app.api_execution.policy import assert_execution_allowed
from app.api_execution.run_queue import cancel_run, enqueue_run, subscribe_sse, unsubscribe_sse
from app.api_execution.runner import run_all_steps, run_single_step
from app.api_execution.spec_parser import SUPPORTED_EXTENSIONS, parse_api_description_file, parse_api_description_url
from app.api_execution.utils import execution_options as _execution_options
from app.api_execution.utils import now_iso as _now_iso

RUN_STATUSES = ("queued", "running", "passed", "failed", "cancelled")
FLOW_TEMPLATE_DEFINITION_TYPE = "flow_template"
TASK_CENTER_STATUSES = ("pending", "running", "failed", "resolved")
TASK_TYPE_LABELS = {
    "manual_review": "失败待诊断",
    "knowledge_ingest_candidate": "知识待确认",
    "knowledge_write_failure": "知识写入失败",
    "scheduled_run_review": "定时执行待处理",
    "policy_blocked": "策略阻断",
}
TASK_ACTION_BUCKETS = (
    ("failure_diagnosis", "失败待诊断", {"manual_review"}),
    ("knowledge_confirmation", "知识待确认", {"knowledge_ingest_candidate"}),
    ("policy_blocked", "策略阻断", {"policy_blocked", "scheduled_run_review"}),
    ("knowledge_write_failure", "写入失败", {"knowledge_write_failure"}),
    ("scheduled_failure", "定时失败", {"scheduled_run_review"}),
)


__all__ = [
    # Stdlib
    "hashlib", "json", "os", "tempfile", "uuid", "Counter",
    "UTC", "datetime", "Path", "Annotated", "Any",
    # Third-party
    "httpx", "run_in_threadpool",
    # FastAPI
    "APIRouter", "Depends", "File", "HTTPException", "Query", "Request", "UploadFile",
    "Response", "StreamingResponse",
    # Internal infrastructure
    "settings", "log_event",
    # Internal errors
    "InternalError", "InvalidRequestError", "NotFoundError", "UnauthorizedError",
    # Internal modules
    "api_execution_store", "enrich_run_report", "generate_api_dsl",
    "build_run_knowledge_items", "write_run_to_graph_with_retry", "build_graph_write_failure_task",
    "generate_postman_collection", "generate_pytest_script",
    "assert_execution_allowed", "cancel_run", "enqueue_run", "subscribe_sse", "unsubscribe_sse",
    "run_all_steps", "run_single_step",
    "SUPPORTED_EXTENSIONS", "parse_api_description_file", "parse_api_description_url",
    "_execution_options", "_now_iso",
    # AI assistant
    "build_flow_draft", "build_repair_patch", "build_repair_patch_with_configured_ai",
    "enhance_dsl_with_configured_ai",
    # Schemas
    "APIEnvironmentConfig", "APIEnvironmentListResponse", "APIEnvironmentUpsertRequest",
    "APIFlowTemplate", "APIFlowTemplateListResponse", "APIFlowTemplateUpsertRequest",
    "AIDslEnhanceRequest", "AIFlowDraftRequest", "AIFlowDraftResponse",
    "AIRepairPatchRequest", "AIPatchResponse",
    "AutomationTaskCenterSummaryResponse", "AutomationTaskListResponse", "AutomationTaskRecord",
    "APIOperationAsset", "APIProjectConfig", "APIProjectListResponse", "APIProjectUpsertRequest",
    "APIAssetModule", "APIAssetModuleCreateRequest", "APIAssetModuleMergeRequest",
    "APIAssetModuleRemoveRequest", "APIAssetModuleUpdateRequest",
    "APIAssetInterface", "APIAssetInterfaceCreateRequest", "APIAssetSyncResponse",
    "APIAssetInterfaceUpdateRequest", "APIAssetTestPlanRequest", "APIAssetTestPlanResponse",
    "APIAgentAction", "APIAgentContextResponse", "APIAgentTestPlanRequest", "APIAgentTestPlanResponse",
    "APIAssetImpactResponse", "APIProjectAssetsResponse", "APIInterfaceListResponse",
    "PolicyAuditListResponse", "APITestCaseDsl", "CreateRunResponse", "DemoBootstrapResponse",
    "ExportScriptRequest", "GenerateDslRequest", "KnowledgeIngestResponse",
    "KnowledgeCandidateApproveResponse", "KnowledgeCandidateCreateResponse", "KnowledgeItem",
    "KnowledgeReviewResponse", "KnowledgeSearchResponse", "KnowledgeStatusUpdateRequest",
    "OpenAPIParseResponse", "OperationsResponse", "ParseUrlRequest", "APIRunReport",
    "APIRunHistoryResponse", "RunScriptRequest", "APIStepRunResult",
    "ScheduledExecutionResponse", "SpecSyncResponse", "StorageMigrationReadinessResponse",
    "ValidateDslRequest",
    # Constants
    "RUN_STATUSES", "FLOW_TEMPLATE_DEFINITION_TYPE",
    "TASK_CENTER_STATUSES", "TASK_TYPE_LABELS", "TASK_ACTION_BUCKETS",
]
