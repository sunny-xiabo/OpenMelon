"""Explicit re-exports for route modules.

This module provides a flat namespace of all symbols that route files need.
Instead of wildcard imports, each symbol is explicitly imported and listed
in __all__ so the dependency graph is statically determinable.
"""

from app.api_execution.router_deps import (
    # Infrastructure
    APIRouter, Depends, File, HTTPException, Query, Request, UploadFile,
    Response, StreamingResponse,
    Annotated, Any, Counter,
    # Schemas - Project/Environment
    APIEnvironmentConfig, APIEnvironmentListResponse, APIEnvironmentUpsertRequest,
    APIProjectConfig, APIProjectListResponse, APIProjectUpsertRequest,
    # Schemas - Assets
    APIAssetModule, APIAssetModuleCreateRequest, APIAssetModuleMergeRequest,
    APIAssetModuleRemoveRequest, APIAssetModuleUpdateRequest,
    APIAssetInterface, APIAssetInterfaceCreateRequest, APIAssetInterfaceUpdateRequest,
    APIAssetSyncResponse, APIAssetTestPlanRequest, APIAssetTestPlanResponse,
    APIAssetImpactResponse, APIProjectAssetsResponse, APIInterfaceListResponse,
    # Schemas - Agent
    APIAgentAction, APIAgentContextResponse, APIAgentTestPlanRequest, APIAgentTestPlanResponse,
    # Schemas - Runs
    APIRunReport, APIRunHistoryResponse, APIStepRunResult,
    RunScriptRequest, CreateRunResponse,
    # Schemas - DSL/Spec
    APITestCaseDsl, GenerateDslRequest, ValidateDslRequest,
    OpenAPIParseResponse, OperationsResponse, ParseUrlRequest, DemoBootstrapResponse,
    # Schemas - AI
    AIDslEnhanceRequest, AIFlowDraftRequest, AIFlowDraftResponse,
    AIRepairPatchRequest, AIPatchResponse,
    # Schemas - Knowledge
    KnowledgeIngestResponse, KnowledgeSearchResponse,
    KnowledgeCandidateApproveResponse, KnowledgeCandidateCreateResponse,
    KnowledgeItem, KnowledgeReviewResponse, KnowledgeStatusUpdateRequest,
    # Schemas - Templates/Flow
    APIFlowTemplate, APIFlowTemplateListResponse, APIFlowTemplateUpsertRequest,
    # Schemas - Automation/Tasks
    AutomationTaskCenterSummaryResponse, AutomationTaskListResponse, AutomationTaskRecord,
    PolicyAuditListResponse,
    ScheduledExecutionResponse, SpecSyncResponse, StorageMigrationReadinessResponse,
    # Schemas - Export
    ExportScriptRequest,
    # Constants
    RUN_STATUSES, FLOW_TEMPLATE_DEFINITION_TYPE,
    TASK_CENTER_STATUSES, TASK_TYPE_LABELS, TASK_ACTION_BUCKETS,
)

from app.api_execution.services.agent_service import (
    get_agent_context_service,
    build_agent_test_plan_service,
)
from app.api_execution.services.asset_service import (
    get_project_assets_service,
    preview_project_assets_service,
    sync_project_assets_service,
    build_asset_test_plan_service,
    get_project_asset_impact_service,
    list_project_modules_service,
    create_project_module_service,
    update_project_module_service,
    remove_project_module_service,
    merge_project_module_service,
    delete_project_module_service,
    list_project_interfaces_service,
    create_project_interface_service,
    update_project_interface_service,
    delete_project_interface_service,
    sync_project_spec_assets,
    ensure_project_assets,
    EXECUTABLE_INTERFACE_STATUSES,
)
from app.api_execution.services.run_service import (
    auto_repair_and_rerun_service,
    run_single_step_service,
    run_all_steps_service,
    create_background_run_service,
    list_run_history_service,
    list_case_runs_service,
    get_run_report_service,
    stream_run_progress_service,
    cancel_background_run_service,
    clear_all_runs_service,
    delete_run_history_service,
    batch_delete_run_history_service,
    save_run_report,
    log_task_event,
)
from app.api_execution.services.spec_service import (
    list_projects_service,
    upsert_project_service,
    get_project_service,
    delete_project_service,
    list_project_environments_service,
    upsert_project_environment_service,
    update_environment_service,
    delete_environment_service,
    parse_openapi_file_service,
    parse_openapi_url_service,
    load_demo_openapi_service,
    bootstrap_demo_project_service,
    get_spec_operations_service,
    get_spec_service,
    generate_dsl_service,
    validate_dsl_service,
)
spec_upsert_project_service = upsert_project_service
from app.api_execution.services.ai_service import (
    enhance_dsl_service,
    build_flow_draft_service,
    build_repair_patch_service,
)
from app.api_execution.services.knowledge_service import (
    ingest_runs_to_knowledge_service,
    search_repair_knowledge_service,
    approve_knowledge_candidate_service,
    create_run_knowledge_candidate_service,
    save_knowledge_ingest_candidate,
    repair_context_query,
    search_historical_repair_context,
    list_knowledge_review_items_service,
    update_knowledge_item_status_service,
    delete_knowledge_item_service,
)
from app.api_execution.services.template_service import (
    list_flow_templates_service,
    upsert_flow_template_service,
    delete_flow_template_service,
)
from app.api_execution.services.automation_service import (
    list_policy_audits_service,
    trigger_scheduled_runs_service,
    trigger_spec_sync_service,
    get_storage_migration_readiness_service,
    list_automation_tasks_service,
    get_task_center_summary_service,
    resolve_automation_task_service,
)
from app.api_execution.services.dashboard_service import (
    get_dashboard_summary_service,
    flow_template_from_definition,
    flow_template_performance,
    task_center_summary,
)
from app.api_execution.services.export_service import (
    export_pytest_script_service,
    export_postman_collection_service,
)

__all__ = [
    # Infrastructure
    "APIRouter", "Depends", "File", "HTTPException", "Query", "Request", "UploadFile",
    "Response", "StreamingResponse",
    "Annotated", "Any", "Counter",
    # Schemas
    "APIEnvironmentConfig", "APIEnvironmentListResponse", "APIEnvironmentUpsertRequest",
    "APIProjectConfig", "APIProjectListResponse", "APIProjectUpsertRequest",
    "APIAssetModule", "APIAssetModuleCreateRequest", "APIAssetModuleMergeRequest",
    "APIAssetModuleRemoveRequest", "APIAssetModuleUpdateRequest",
    "APIAssetInterface", "APIAssetInterfaceCreateRequest", "APIAssetInterfaceUpdateRequest",
    "APIAssetSyncResponse", "APIAssetTestPlanRequest", "APIAssetTestPlanResponse",
    "APIAssetImpactResponse", "APIProjectAssetsResponse", "APIInterfaceListResponse",
    "APIAgentAction", "APIAgentContextResponse", "APIAgentTestPlanRequest", "APIAgentTestPlanResponse",
    "APIRunReport", "APIRunHistoryResponse", "APIStepRunResult",
    "RunScriptRequest", "CreateRunResponse",
    "APITestCaseDsl", "GenerateDslRequest", "ValidateDslRequest",
    "OpenAPIParseResponse", "OperationsResponse", "ParseUrlRequest", "DemoBootstrapResponse",
    "AIDslEnhanceRequest", "AIFlowDraftRequest", "AIFlowDraftResponse",
    "AIRepairPatchRequest", "AIPatchResponse",
    "KnowledgeIngestResponse", "KnowledgeSearchResponse",
    "KnowledgeCandidateApproveResponse", "KnowledgeCandidateCreateResponse",
    "KnowledgeItem", "KnowledgeReviewResponse", "KnowledgeStatusUpdateRequest",
    "APIFlowTemplate", "APIFlowTemplateListResponse", "APIFlowTemplateUpsertRequest",
    "AutomationTaskCenterSummaryResponse", "AutomationTaskListResponse", "AutomationTaskRecord",
    "PolicyAuditListResponse",
    "ScheduledExecutionResponse", "SpecSyncResponse", "StorageMigrationReadinessResponse",
    "ExportScriptRequest",
    # Constants
    "RUN_STATUSES", "FLOW_TEMPLATE_DEFINITION_TYPE",
    "TASK_CENTER_STATUSES", "TASK_TYPE_LABELS", "TASK_ACTION_BUCKETS",
    # Service functions
    "get_agent_context_service", "build_agent_test_plan_service",
    "get_project_assets_service", "preview_project_assets_service", "sync_project_assets_service",
    "build_asset_test_plan_service", "get_project_asset_impact_service",
    "list_project_modules_service", "create_project_module_service",
    "update_project_module_service", "remove_project_module_service",
    "merge_project_module_service", "delete_project_module_service",
    "list_project_interfaces_service", "create_project_interface_service",
    "update_project_interface_service", "delete_project_interface_service",
    "sync_project_spec_assets", "ensure_project_assets", "EXECUTABLE_INTERFACE_STATUSES",
    "auto_repair_and_rerun_service", "run_single_step_service", "run_all_steps_service",
    "create_background_run_service", "list_run_history_service", "list_case_runs_service",
    "get_run_report_service", "stream_run_progress_service", "cancel_background_run_service",
    "clear_all_runs_service", "delete_run_history_service", "batch_delete_run_history_service",
    "save_run_report", "log_task_event",
    "parse_openapi_file_service", "parse_openapi_url_service", "load_demo_openapi_service",
    "bootstrap_demo_project_service", "get_spec_operations_service", "get_spec_service",
    "generate_dsl_service", "validate_dsl_service", "spec_upsert_project_service",
    "list_projects_service", "upsert_project_service", "get_project_service", "delete_project_service",
    "list_project_environments_service", "upsert_project_environment_service",
    "update_environment_service", "delete_environment_service",
    "enhance_dsl_service", "build_flow_draft_service", "build_repair_patch_service",
    "ingest_runs_to_knowledge_service", "search_repair_knowledge_service",
    "approve_knowledge_candidate_service", "create_run_knowledge_candidate_service",
    "save_knowledge_ingest_candidate", "repair_context_query", "search_historical_repair_context",
    "list_knowledge_review_items_service", "update_knowledge_item_status_service",
    "delete_knowledge_item_service",
    "list_flow_templates_service", "upsert_flow_template_service", "delete_flow_template_service",
    "list_policy_audits_service", "trigger_scheduled_runs_service", "trigger_spec_sync_service",
    "get_storage_migration_readiness_service", "list_automation_tasks_service",
    "get_task_center_summary_service", "resolve_automation_task_service",
    "get_dashboard_summary_service", "flow_template_from_definition",
    "flow_template_performance", "task_center_summary",
    "export_pytest_script_service", "export_postman_collection_service",
]
