"""Schema statements for the API execution module."""

API_EXECUTION_SCHEMA_SQL = """
    CREATE TABLE IF NOT EXISTS runs (
        run_id TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'queued',
        project_id TEXT DEFAULT '',
        case_id TEXT DEFAULT '',
        case_name TEXT DEFAULT '',
        environment_name TEXT DEFAULT '',
        run_at TEXT DEFAULT '',
        data TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
    CREATE INDEX IF NOT EXISTS idx_runs_project ON runs(project_id);
    CREATE INDEX IF NOT EXISTS idx_runs_at ON runs(run_at);
    CREATE INDEX IF NOT EXISTS idx_runs_status_at ON runs(status, run_at);
    CREATE INDEX IF NOT EXISTS idx_runs_project_at ON runs(project_id, run_at);
    CREATE INDEX IF NOT EXISTS idx_runs_project_status_at ON runs(project_id, status, run_at);

    CREATE TABLE IF NOT EXISTS projects (
        project_id TEXT PRIMARY KEY,
        name TEXT NOT NULL DEFAULT '',
        updated_at TEXT DEFAULT '',
        data TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS environments (
        environment_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL DEFAULT '',
        updated_at TEXT DEFAULT '',
        data TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_env_project ON environments(project_id);

    CREATE TABLE IF NOT EXISTS specs (
        spec_id TEXT PRIMARY KEY,
        source_url TEXT DEFAULT '',
        content_hash TEXT DEFAULT '',
        parsed_at TEXT DEFAULT '',
        data TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_specs_content_hash ON specs(content_hash);
    CREATE INDEX IF NOT EXISTS idx_specs_source_url ON specs(source_url);

    CREATE TABLE IF NOT EXISTS api_spec_versions (
        spec_version_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL DEFAULT '',
        spec_id TEXT NOT NULL DEFAULT '',
        source_type TEXT DEFAULT '',
        source_url TEXT DEFAULT '',
        filename TEXT DEFAULT '',
        content_hash TEXT DEFAULT '',
        imported_at TEXT DEFAULT '',
        operation_count INTEGER DEFAULT 0,
        data TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_api_spec_versions_project ON api_spec_versions(project_id);
    CREATE INDEX IF NOT EXISTS idx_api_spec_versions_spec ON api_spec_versions(spec_id);
    CREATE INDEX IF NOT EXISTS idx_api_spec_versions_project_imported ON api_spec_versions(project_id, imported_at);

    CREATE TABLE IF NOT EXISTS api_modules (
        module_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL DEFAULT '',
        module_key TEXT NOT NULL DEFAULT '',
        name TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'active',
        sort_order INTEGER NOT NULL DEFAULT 100,
        updated_at TEXT DEFAULT '',
        data TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_api_modules_project ON api_modules(project_id);
    CREATE INDEX IF NOT EXISTS idx_api_modules_project_key ON api_modules(project_id, module_key);
    CREATE INDEX IF NOT EXISTS idx_api_modules_project_status ON api_modules(project_id, status);

    CREATE TABLE IF NOT EXISTS api_interfaces (
        interface_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL DEFAULT '',
        module_id TEXT NOT NULL DEFAULT '',
        interface_key TEXT NOT NULL DEFAULT '',
        method TEXT NOT NULL DEFAULT '',
        path TEXT NOT NULL DEFAULT '',
        operation_id TEXT DEFAULT '',
        summary TEXT DEFAULT '',
        risk_level TEXT DEFAULT '',
        status TEXT NOT NULL DEFAULT 'active',
        current_spec_id TEXT DEFAULT '',
        current_hash TEXT DEFAULT '',
        last_seen_at TEXT DEFAULT '',
        data TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_api_interfaces_project ON api_interfaces(project_id);
    CREATE INDEX IF NOT EXISTS idx_api_interfaces_module ON api_interfaces(module_id);
    CREATE INDEX IF NOT EXISTS idx_api_interfaces_project_key ON api_interfaces(project_id, interface_key);
    CREATE INDEX IF NOT EXISTS idx_api_interfaces_project_status ON api_interfaces(project_id, status);
    CREATE INDEX IF NOT EXISTS idx_api_interfaces_project_method ON api_interfaces(project_id, method);

    CREATE TABLE IF NOT EXISTS policy_audits (
        audit_id TEXT PRIMARY KEY,
        project_id TEXT DEFAULT '',
        action TEXT DEFAULT '',
        created_at TEXT DEFAULT '',
        data TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_audits_project ON policy_audits(project_id);

    CREATE TABLE IF NOT EXISTS automation_tasks (
        task_id TEXT PRIMARY KEY,
        status TEXT DEFAULT '',
        project_id TEXT DEFAULT '',
        updated_at TEXT DEFAULT '',
        created_at TEXT DEFAULT '',
        data TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON automation_tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_project ON automation_tasks(project_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_status_updated ON automation_tasks(status, updated_at);
    CREATE INDEX IF NOT EXISTS idx_tasks_project_status_updated ON automation_tasks(project_id, status, updated_at);

    CREATE TABLE IF NOT EXISTS automation_definitions (
        definition_id TEXT PRIMARY KEY,
        updated_at TEXT DEFAULT '',
        data TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS automation_runs (
        automation_run_id TEXT PRIMARY KEY,
        run_at TEXT DEFAULT '',
        data TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_automation_runs_at ON automation_runs(run_at);

    CREATE TABLE IF NOT EXISTS run_stage_events (
        event_id TEXT PRIMARY KEY,
        created_at TEXT DEFAULT '',
        data TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_stage_events_at ON run_stage_events(created_at);

    CREATE TABLE IF NOT EXISTS artifact_meta (
        artifact_id TEXT PRIMARY KEY,
        created_at TEXT DEFAULT '',
        data TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_artifact_at ON artifact_meta(created_at);

    CREATE TABLE IF NOT EXISTS knowledge_items (
        knowledge_id TEXT PRIMARY KEY,
        item_type TEXT DEFAULT '',
        project_id TEXT DEFAULT '',
        status TEXT DEFAULT '',
        created_at TEXT DEFAULT '',
        data TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_knowledge_type ON knowledge_items(item_type);
    CREATE INDEX IF NOT EXISTS idx_knowledge_project ON knowledge_items(project_id);

    CREATE TABLE IF NOT EXISTS event_logs (
        event_id TEXT PRIMARY KEY,
        created_at TEXT DEFAULT '',
        level TEXT DEFAULT '',
        module TEXT DEFAULT '',
        event_type TEXT DEFAULT '',
        project_id TEXT DEFAULT '',
        trace_id TEXT DEFAULT '',
        source_id TEXT DEFAULT '',
        title TEXT DEFAULT '',
        message TEXT DEFAULT '',
        data TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_event_logs_created_at ON event_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_event_logs_level ON event_logs(level);
    CREATE INDEX IF NOT EXISTS idx_event_logs_module ON event_logs(module);
    CREATE INDEX IF NOT EXISTS idx_event_logs_project ON event_logs(project_id);
    CREATE INDEX IF NOT EXISTS idx_event_logs_trace ON event_logs(trace_id);
    CREATE INDEX IF NOT EXISTS idx_event_logs_type ON event_logs(event_type);
    CREATE INDEX IF NOT EXISTS idx_event_logs_project_created ON event_logs(project_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_event_logs_module_created ON event_logs(module, created_at);
    CREATE INDEX IF NOT EXISTS idx_event_logs_level_created ON event_logs(level, created_at);
    CREATE INDEX IF NOT EXISTS idx_event_logs_project_module_created ON event_logs(project_id, module, created_at);

    CREATE TABLE IF NOT EXISTS ai_call_logs (
        call_id TEXT PRIMARY KEY,
        created_at TEXT DEFAULT '',
        feature TEXT DEFAULT '',
        operation TEXT DEFAULT '',
        provider TEXT DEFAULT '',
        model TEXT DEFAULT '',
        status TEXT DEFAULT '',
        degraded INTEGER DEFAULT 0,
        trace_id TEXT DEFAULT '',
        source_id TEXT DEFAULT '',
        latency_ms INTEGER DEFAULT 0,
        prompt_chars INTEGER DEFAULT 0,
        response_chars INTEGER DEFAULT 0,
        input_tokens INTEGER DEFAULT 0,
        output_tokens INTEGER DEFAULT 0,
        total_tokens INTEGER DEFAULT 0,
        failure_reason TEXT DEFAULT '',
        data TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ai_call_logs_created_at ON ai_call_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_ai_call_logs_feature ON ai_call_logs(feature);
    CREATE INDEX IF NOT EXISTS idx_ai_call_logs_operation ON ai_call_logs(operation);
    CREATE INDEX IF NOT EXISTS idx_ai_call_logs_model ON ai_call_logs(model);
    CREATE INDEX IF NOT EXISTS idx_ai_call_logs_status ON ai_call_logs(status);
    CREATE INDEX IF NOT EXISTS idx_ai_call_logs_trace ON ai_call_logs(trace_id);
    CREATE INDEX IF NOT EXISTS idx_ai_call_logs_feature_created ON ai_call_logs(feature, created_at);
    CREATE INDEX IF NOT EXISTS idx_ai_call_logs_status_created ON ai_call_logs(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_ai_call_logs_degraded_created ON ai_call_logs(degraded, created_at);

    CREATE TABLE IF NOT EXISTS ai_debug_settings (
        key TEXT PRIMARY KEY,
        data TEXT NOT NULL
    );
"""
