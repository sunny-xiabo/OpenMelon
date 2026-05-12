from typing import Any, Optional

from pydantic import BaseModel, HttpUrl


class ParseUrlRequest(BaseModel):
    url: HttpUrl
    force_refresh: bool = False


class APIOperationAsset(BaseModel):
    id: str
    method: str
    path: str
    operation_id: str
    summary: str = ""
    description: str = ""
    tags: list[str] = []
    parameters: list[dict[str, Any]] = []
    request_body: dict[str, Any] = {}
    responses: dict[str, Any] = {}
    security: list[dict[str, Any]] = []


class APISpecAsset(BaseModel):
    spec_id: str
    filename: Optional[str] = None
    source_url: Optional[str] = None
    parsed_at: str
    info: dict[str, Any] = {}
    servers: list[dict[str, Any]] = []
    tags: list[dict[str, Any]] = []
    operation_count: int = 0
    operations: list[APIOperationAsset] = []


class OpenAPIParseResponse(APISpecAsset):
    pass


class OperationsResponse(BaseModel):
    spec_id: str
    operation_count: int
    operations: list[APIOperationAsset] = []


class GenerateDslRequest(BaseModel):
    spec_id: str
    operation_ids: list[str]


class APIProjectConfig(BaseModel):
    project_id: str = ""
    name: str
    description: str = ""
    default_environment_id: str = ""
    spec_id: Optional[str] = None
    enabled: bool = True
    allow_ai_execution: bool = False
    allow_ai_repair: bool = False
    allow_scheduled_execution: bool = False
    allow_ai_generate_dsl: bool = True
    allow_overwrite_history: bool = True
    max_auto_repairs: int = 0
    max_reruns: int = 0
    max_requests_per_run: int = 0
    risk_overrides: dict[str, str] = {}
    operation_allowlist: list[str] = []
    operation_blocklist: list[str] = []
    schedule_cron: str = ""
    last_scheduled_run_at: Optional[str] = None
    last_spec_content_hash: str = ""
    last_dsl_generated_at: Optional[str] = None
    auto_generated_dsl: dict[str, Any] = {}
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class APIProjectUpsertRequest(BaseModel):
    project_id: Optional[str] = None
    name: str
    description: str = ""
    default_environment_id: str = ""
    spec_id: Optional[str] = None
    enabled: bool = True
    allow_ai_execution: bool = False
    allow_ai_repair: bool = False
    allow_scheduled_execution: bool = False
    allow_ai_generate_dsl: bool = True
    allow_overwrite_history: bool = True
    max_auto_repairs: int = 0
    max_reruns: int = 0
    max_requests_per_run: int = 0
    risk_overrides: dict[str, str] = {}
    operation_allowlist: list[str] = []
    operation_blocklist: list[str] = []
    schedule_cron: str = ""
    last_scheduled_run_at: Optional[str] = None
    last_spec_content_hash: str = ""
    last_dsl_generated_at: Optional[str] = None
    auto_generated_dsl: dict[str, Any] = {}


class APIProjectListResponse(BaseModel):
    projects: list[APIProjectConfig] = []


class APIEnvironmentConfig(BaseModel):
    environment_id: str = ""
    project_id: str
    name: str
    environment_type: str = "test"
    base_url: str = ""
    headers: dict[str, Any] = {}
    variables: dict[str, Any] = {}
    timeout_ms: int = 30000
    continue_on_failure: bool = True
    enabled: bool = True
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class APIEnvironmentUpsertRequest(BaseModel):
    environment_id: Optional[str] = None
    name: str
    environment_type: str = "test"
    base_url: str = ""
    headers: dict[str, Any] = {}
    variables: dict[str, Any] = {}
    timeout_ms: int = 30000
    continue_on_failure: bool = True
    enabled: bool = True


class APIEnvironmentListResponse(BaseModel):
    environments: list[APIEnvironmentConfig] = []


class DemoBootstrapResponse(BaseModel):
    spec: APISpecAsset
    project: APIProjectConfig
    environment: APIEnvironmentConfig
    seeded_run_ids: list[str] = []
    knowledge_item_count: int = 0
    pending_task_count: int = 0


class APIAssertion(BaseModel):
    type: str
    expected: Any | None = None
    path: Optional[str] = None
    value: Any | None = None


class APIExtraction(BaseModel):
    name: str
    source: str = "body"
    path: Optional[str] = None
    default: Any | None = None


class APIRetryConfig(BaseModel):
    max_attempts: int = 1
    delay_ms: int = 1000
    backoff_factor: float = 1.0
    retry_on: list[str] = ["status_code"]


class VariableSetup(BaseModel):
    name: str
    source: str = "static"  # static | env | random | timestamp
    value: Any = None
    env_key: str = ""
    random_type: str = ""  # uuid | string | int | float
    random_min: int = 0
    random_max: int = 100
    random_length: int = 8


class APITestStep(BaseModel):
    id: str
    name: str
    method: str
    path: str
    operation_id: str
    headers: dict[str, Any] = {}
    query: dict[str, Any] = {}
    path_params: dict[str, Any] = {}
    body: dict[str, Any] | list[Any] | str | None = None
    assertions: list[APIAssertion] = []
    extractions: list[APIExtraction] = []
    retry: APIRetryConfig | None = None
    depends_on: list[str] = []
    parallel_group: str = ""


class APITestCaseDsl(BaseModel):
    case_id: str
    name: str
    target_project: str = ""
    environment: str = ""
    base_url: str = ""
    flow_template_id: str = ""
    flow_template_name: str = ""
    flow_template_tags: list[str] = []
    ai_repair_source: str = ""
    ai_repair_applied_at: str = ""
    ai_repair_applied_operations: list[dict[str, Any]] = []
    variables: dict[str, Any] = {}
    steps: list[APITestStep] = []
    setup_variables: list[VariableSetup] = []


class ValidateDslRequest(BaseModel):
    script: APITestCaseDsl


class AIDslEnhanceRequest(BaseModel):
    script: APITestCaseDsl
    project_policy_snapshot: dict[str, Any] = {}


class AIRepairPatchRequest(BaseModel):
    script: APITestCaseDsl
    report: dict[str, Any]
    project_policy_snapshot: dict[str, Any] = {}


class AIPatchOperation(BaseModel):
    step_id: str
    field: str
    before: Any | None = None
    after: Any | None = None
    reason: str
    safe_to_apply: bool = False


class AIPatchResponse(BaseModel):
    patched_script: APITestCaseDsl
    patch_operations: list[AIPatchOperation] = []
    repair_draft: dict[str, Any] = {}
    summary: str = ""
    automatic_applicable: bool = False
    risk_level: str = "medium"
    requires_approval: bool = True
    ai_mode: str = "heuristic"
    model_name: str = ""
    fallback_reason: str = ""


class AIFlowDraftRequest(BaseModel):
    spec_id: str
    business_goal: str
    operation_ids: list[str] = []
    project_name: str = ""
    environment_name: str = ""
    base_url: str = ""
    project_policy_snapshot: dict[str, Any] = {}


class AIFlowDraftResponse(BaseModel):
    draft_script: APITestCaseDsl
    selected_operation_ids: list[str] = []
    step_summaries: list[dict[str, Any]] = []
    uncertainties: list[str] = []
    template_recommendations: list[dict[str, Any]] = []
    quality_score: dict[str, Any] = {}
    summary: str = ""
    requires_approval: bool = True
    ai_mode: str = "heuristic"
    model_name: str = ""
    fallback_reason: str = ""


class PolicyAuditRecord(BaseModel):
    audit_id: str
    created_at: str
    action: str
    run_id: Optional[str] = None
    project_id: str = ""
    environment_id: str = ""
    trigger_source: str = "manual"
    decision: dict[str, Any] = {}
    approved: bool = False
    approval_note: str = ""


class PolicyAuditListResponse(BaseModel):
    audits: list[PolicyAuditRecord] = []


class AutomationTaskRecord(BaseModel):
    task_id: str
    created_at: str
    updated_at: str
    task_type: str
    status: str = "pending"
    run_id: Optional[str] = None
    project_id: str = ""
    environment_id: str = ""
    risk_level: str = "medium"
    reason: str = ""
    summary: dict[str, Any] = {}
    decision: dict[str, Any] = {}
    result_run_id: Optional[str] = None
    resolved_at: Optional[str] = None
    resolution_note: str = ""


class AutomationTaskListResponse(BaseModel):
    tasks: list[AutomationTaskRecord] = []


class AutomationTaskCountItem(BaseModel):
    label: str
    count: int = 0


class AutomationTaskTypeSummary(BaseModel):
    task_type: str
    label: str
    count: int = 0
    pending_count: int = 0
    failed_count: int = 0
    resolved_count: int = 0


class AutomationTaskActionBucket(BaseModel):
    bucket: str
    label: str
    count: int = 0
    pending_count: int = 0
    task_types: list[str] = []


class AutomationTaskCenterSummaryResponse(BaseModel):
    total_task_count: int = 0
    pending_task_count: int = 0
    failed_task_count: int = 0
    resolved_task_count: int = 0
    status_counts: dict[str, int] = {}
    risk_counts: list[AutomationTaskCountItem] = []
    type_counts: list[AutomationTaskTypeSummary] = []
    action_buckets: list[AutomationTaskActionBucket] = []
    recent_tasks: list[AutomationTaskRecord] = []


class ScheduledExecutionItem(BaseModel):
    project_id: str
    project_name: str = ""
    status: str
    run_id: Optional[str] = None
    reason: str = ""


class ScheduledExecutionResponse(BaseModel):
    triggered_at: str
    items: list[ScheduledExecutionItem] = []


class SpecSyncItem(BaseModel):
    project_id: str
    project_name: str = ""
    status: str
    spec_id: str = ""
    operation_count: int = 0
    reason: str = ""


class SpecSyncResponse(BaseModel):
    triggered_at: str
    items: list[SpecSyncItem] = []


class AutomationDefinition(BaseModel):
    definition_id: str
    automation_type: str = "api"
    name: str
    project_id: str = ""
    source_id: str = ""
    status: str = "active"
    policy_snapshot: dict[str, Any] = {}
    created_at: str
    updated_at: str


class APIFlowTemplate(BaseModel):
    template_id: str
    project_id: str = ""
    name: str
    description: str = ""
    tags: list[str] = []
    script: dict[str, Any]
    version: str = "v1"
    deprecated: bool = False
    scope: str = ""
    performance_snapshot: dict[str, Any] = {}
    created_at: str
    updated_at: str


class APIFlowTemplateUpsertRequest(BaseModel):
    template_id: Optional[str] = None
    project_id: str = ""
    name: str
    description: str = ""
    tags: list[str] = []
    script: APITestCaseDsl


class APIFlowTemplateListResponse(BaseModel):
    templates: list[APIFlowTemplate] = []


class AutomationRun(BaseModel):
    automation_run_id: str
    automation_type: str = "api"
    source_run_id: str
    definition_id: str = ""
    project_id: str = ""
    environment_id: str = ""
    status: str
    run_at: str
    summary: dict[str, Any] = {}
    policy_snapshot: dict[str, Any] = {}


class RunStageEvent(BaseModel):
    event_id: str
    automation_run_id: str
    stage: str
    status: str
    created_at: str
    detail: dict[str, Any] = {}


class ArtifactMeta(BaseModel):
    artifact_id: str
    automation_run_id: str
    artifact_type: str
    name: str
    created_at: str
    metadata: dict[str, Any] = {}


class KnowledgeItem(BaseModel):
    knowledge_id: str
    item_type: str
    source_run_id: str = ""
    project_id: str = ""
    created_at: str
    status: str = "active"
    invalidated_at: Optional[str] = None
    revoked_at: Optional[str] = None
    governance_note: str = ""
    summary: str = ""
    payload: dict[str, Any] = {}


class KnowledgeIngestResponse(BaseModel):
    ingested_at: str
    run_count: int = 0
    knowledge_count: int = 0
    graph_written: int = 0
    vector_written: int = 0
    graph_available: bool = False
    vector_available: bool = False
    errors: list[str] = []


class KnowledgeCandidateApproveResponse(KnowledgeIngestResponse):
    task_id: str
    run_id: Optional[str] = None


class KnowledgeCandidateCreateResponse(BaseModel):
    task_id: str
    run_id: str
    status: str = "pending"
    risk_level: str = "medium"
    reason: str = ""
    candidate_item_count: int = 0
    has_repair_history: bool = False
    already_resolved: bool = False


class KnowledgeSearchResponse(BaseModel):
    query: str
    items: list[KnowledgeItem] = []


class KnowledgeReviewResponse(BaseModel):
    items: list[KnowledgeItem] = []


class KnowledgeStatusUpdateRequest(BaseModel):
    status: str
    note: str = ""


class RunScriptRequest(BaseModel):
    script: APITestCaseDsl
    step_id: Optional[str] = None
    step_ids: list[str] = []
    project_id: Optional[str] = None
    environment_id: Optional[str] = None
    environment_snapshot: dict[str, Any] = {}
    project_policy_snapshot: dict[str, Any] = {}
    base_url: Optional[str] = None
    global_headers: dict[str, Any] = {}
    timeout_ms: int = 30000
    run_timeout_ms: Optional[int] = None
    max_steps: Optional[int] = None
    continue_on_failure: bool = True
    replace_run_id: Optional[str] = None
    flow_template_id: str = ""
    flow_template_name: str = ""
    flow_template_tags: list[str] = []


class ExportScriptRequest(BaseModel):
    script: APITestCaseDsl


class CreateRunResponse(BaseModel):
    run_id: str
    status: str


class AssertionResult(BaseModel):
    type: str
    passed: bool
    expected: Any | None = None
    actual: Any | None = None
    path: Optional[str] = None
    message: str = ""


class FailureDiagnostic(BaseModel):
    step_id: str
    step_name: str = ""
    category: str
    severity: str = "medium"
    assertion_type: Optional[str] = None
    explanation: str
    suggestions: list[str] = []


class APIStepRunResult(BaseModel):
    step_id: str
    name: str
    method: str
    url: str
    status: str
    status_code: Optional[int] = None
    duration_ms: int
    assertions: list[AssertionResult] = []
    extracted: dict[str, Any] = {}
    request: dict[str, Any] = {}
    response: dict[str, Any] = {}
    error: Optional[str] = None
    diagnostics: list[FailureDiagnostic] = []


class APIRunReport(BaseModel):
    run_id: Optional[str] = None
    run_at: Optional[str] = None
    queued_at: Optional[str] = None
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    case_id: str = ""
    target_project: str = ""
    case_name: str = ""
    mode: str = ""
    script: Optional[APITestCaseDsl] = None
    execution_options: dict[str, Any] = {}
    status: str
    failure_reason: Optional[str] = None
    failure_diagnostics: list[FailureDiagnostic] = []
    repair_suggestions: list[str] = []
    automation_summary: dict[str, Any] = {}
    repair_history: list[dict[str, Any]] = []
    progress_total: int = 0
    progress_completed: int = 0
    current_step_id: Optional[str] = None
    current_step_name: Optional[str] = None
    duration_ms: int
    total: int
    passed: int
    failed: int
    skipped: int = 0
    attempt: int = 1
    parent_run_id: Optional[str] = None
    results: list[APIStepRunResult] = []


class APIRunHistoryResponse(BaseModel):
    runs: list[APIRunReport] = []
