from typing import Any

from pydantic import BaseModel


class EventLogRecord(BaseModel):
    event_id: str
    created_at: str
    level: str = "info"
    module: str = ""
    event_type: str = ""
    project_id: str = ""
    trace_id: str = ""
    source_id: str = ""
    title: str = ""
    message: str = ""
    refs: list[str] = []
    data: dict[str, Any] = {}


class EventLogListResponse(BaseModel):
    total: int = 0
    limit: int = 50
    offset: int = 0
    items: list[EventLogRecord] = []


class EventLogCountItem(BaseModel):
    label: str
    count: int = 0


class EventLogSummaryResponse(BaseModel):
    total: int = 0
    error_count: int = 0
    warning_count: int = 0
    module_counts: list[EventLogCountItem] = []
    event_type_counts: list[EventLogCountItem] = []
    latest_error_at: str = ""


class EventLogSchemaResponse(BaseModel):
    schema_version: str = ""
    modules: list[str] = []
    event_types: dict[str, list[str]] = {}
    event_type_prefixes: dict[str, list[str]] = {}
    trace_id_rule: str = ""
    refs_rule: str = ""


class EventLogDeleteResponse(BaseModel):
    deleted: int = 0
    remaining: int = 0
    older_than: str = ""
    level: str = "non_error"


class EventLogCleanupRequest(BaseModel):
    older_than_days: int = 90
    level: str = "non_error"
    project_id: str = ""
    module: str = ""


class AICallLogRecord(BaseModel):
    call_id: str
    created_at: str = ""
    feature: str = ""
    operation: str = ""
    provider: str = ""
    model: str = ""
    status: str = "success"
    latency_ms: int = 0
    prompt_chars: int = 0
    response_chars: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    degraded: bool = False
    failure_reason: str = ""
    trace_id: str = ""
    source_id: str = ""
    data: dict[str, Any] = {}


class AICallLogListResponse(BaseModel):
    total: int = 0
    limit: int = 50
    offset: int = 0
    items: list[AICallLogRecord] = []


class AICallLogSummaryResponse(BaseModel):
    total: int = 0
    failed_count: int = 0
    degraded_count: int = 0
    avg_latency_ms: int = 0
    prompt_chars: int = 0
    response_chars: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    model_counts: list[EventLogCountItem] = []
    feature_counts: list[EventLogCountItem] = []
    failure_reason_counts: list[EventLogCountItem] = []


class AIDebugSettingsRequest(BaseModel):
    enabled: bool = False
    retention_minutes: int = 30
    max_chars: int = 4000


class AIDebugSettingsResponse(BaseModel):
    enabled: bool = False
    retention_minutes: int = 30
    max_chars: int = 4000
    updated_at: str = ""


class AIDebugSnapshotResponse(BaseModel):
    call_id: str
    enabled: bool = True
    created_at: str = ""
    expires_at: str = ""
    redacted: bool = True
    system: str = ""
    user: str = ""
    context: str = ""
    response: str = ""
