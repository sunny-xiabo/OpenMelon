# OpenMelon UI Execution Plan

## 1. Goal

OpenMelon will evolve from a test-case generation and management system into a UI execution platform that can run generated test cases against external web projects.

The recommended direction is:

```text
Step DSL first
Playwright as the stable execution runtime
MidsceneJS as the semantic and visual resolver
```

This keeps the platform fast and controllable for known flows, while still allowing later execution against unfamiliar projects with weak DOM structure, unstable selectors, canvas-heavy pages, or incomplete accessibility metadata.

## 2. Core Principles

- OpenMelon should not bind generated test cases directly to Playwright locators or Midscene prompts.
- Generated cases should first become a structured UI Step DSL.
- Playwright should handle browser lifecycle, isolation, navigation, screenshots, traces, videos, network observation, file upload/download, and deterministic assertions.
- MidsceneJS should be called only when semantic understanding is needed, such as locating an unknown element, interpreting a visual region, or recovering from locator failure.
- Successful execution should create reusable project knowledge so later runs become faster, cheaper, and more stable.

## 3. Target Architecture

```text
Test Case Generation
        |
        v
UI Step DSL
        |
        v
Execution Orchestrator
        |
        +--> Project Config
        |       - base URL
        |       - credentials and variables
        |       - browser settings
        |       - timeout and retry policy
        |       - Midscene enablement policy
        |
        +--> Locator Knowledge Store
        |       - target project
        |       - URL pattern
        |       - natural language target
        |       - locator candidates
        |       - success rate and evidence
        |
        +--> Playwright Runner
        |       - deterministic actions
        |       - screenshots, videos, traces
        |       - network and console logs
        |       - upload, download, dialogs
        |
        +--> Midscene Resolver
        |       - semantic locate
        |       - visual action
        |       - visual assertion
        |       - recovery suggestions
        |
        v
Execution Report
        |
        v
OpenMelon UI and Knowledge Base
```

## 4. Initial Step DSL

The first DSL version should stay small and practical.

```json
{
  "case_id": "TC_LOGIN_001",
  "name": "User can log in successfully",
  "target_project": "demo-crm",
  "base_url": "https://demo.example.com",
  "variables": {
    "USERNAME": "test_user",
    "PASSWORD": "******"
  },
  "steps": [
    {
      "id": "s1",
      "action": "goto",
      "target": "/login"
    },
    {
      "id": "s2",
      "action": "input",
      "target": "username input",
      "value": "${USERNAME}"
    },
    {
      "id": "s3",
      "action": "input",
      "target": "password input",
      "value": "${PASSWORD}",
      "sensitive": true
    },
    {
      "id": "s4",
      "action": "click",
      "target": "login button"
    },
    {
      "id": "s5",
      "action": "assert_text",
      "target": "page",
      "value": "Home"
    }
  ]
}
```

Recommended first action set:

- `goto`
- `click`
- `input`
- `select`
- `assert_text`
- `assert_url`
- `assert_visible`
- `wait`
- `upload_file`
- `download_file`
- `api_check`

## 5. Execution Routing

Each step should be routed by cost and determinism.

```text
goto, wait, assert_url, upload_file, download_file, api_check
=> Playwright

click, input, select, assert_text, assert_visible
=> locator cache first
=> Playwright locator strategies second
=> MidsceneJS only when needed

visual assertion, canvas interaction, unknown element, repeated locator failure
=> MidsceneJS

MidsceneJS success
=> save evidence and locator candidates
=> prefer Playwright on later runs
```

## 6. Locator Strategy

The Playwright runner should try stable strategies before falling back to AI:

- Known locator from project knowledge store.
- `data-testid` or configured test id attribute.
- ARIA role and accessible name.
- Label text.
- Placeholder text.
- Exact visible text.
- CSS or XPath from project mapping.
- MidsceneJS semantic resolve.

The knowledge store should track:

- `project_id`
- `url_pattern`
- `target_text`
- `action`
- `locator_type`
- `locator_value`
- `success_count`
- `failure_count`
- `last_success_at`
- `last_failure_at`
- `screenshot_path`
- `trace_path`
- `notes`

## 7. Implementation Phases

### Phase 1: Execution Foundation

Deliver a minimum working UI execution backend.

Scope:

- Add a backend `ui_execution` module.
- Define Pydantic schemas for project config, test case DSL, execution task, step result, and report.
- Add task APIs:
  - `POST /api/ui-execution/projects`
  - `POST /api/ui-execution/runs`
  - `GET /api/ui-execution/runs/{run_id}`
  - `GET /api/ui-execution/runs/{run_id}/report`
- Add a Playwright service process or Node runner.
- Support `goto`, `click`, `input`, `assert_text`, `assert_url`, and screenshot capture.
- Persist run result JSON and screenshots.

Acceptance:

- A generated DSL case can run against a simple external demo site.
- Each step has status, duration, error message, and screenshot.
- Failed runs can be inspected from stored artifacts.

### Phase 2: DSL Generation and Review

Connect OpenMelon's generated test cases to the DSL.

Scope:

- Extend test-case generation prompts to output structured steps.
- Add a parser for existing Markdown test cases.
- Add frontend DSL preview and edit panel.
- Support variables such as `${USERNAME}`, `${PASSWORD}`, and `${BASE_URL}`.
- Mark sensitive variables so they are masked in logs and reports.

Acceptance:

- A user can generate a case, inspect the DSL, edit step targets, and submit an execution run.
- Sensitive values do not appear in logs, screenshots metadata, or JSON reports.

### Phase 3: Locator Knowledge Store

Reduce cost and improve speed through reuse.

Scope:

- Add persistent storage for locator candidates and execution evidence.
- Save successful locators from Playwright runs.
- Save MidsceneJS-assisted resolutions once Midscene is introduced.
- Add success and failure counters.
- Prefer high-confidence historical locators before trying new strategies.

Acceptance:

- Re-running the same case on the same project uses stored locators.
- Repeated runs become faster and require fewer resolver attempts.
- Failed locators are downgraded or retired after repeated failures.

### Phase 4: MidsceneJS Resolver

Add AI-assisted execution only where it creates clear value.

Scope:

- Add MidsceneJS integration through the Playwright runner.
- Support semantic actions:
  - `ai_click`
  - `ai_input`
  - `ai_select`
  - `ai_assert`
  - `ai_locate`
- Add routing policy:
  - disabled
  - fallback only
  - smart mode
- Track model name, duration, token estimate, screenshot evidence, and retry count.
- Save successful AI-assisted resolutions back to the locator knowledge store.

Acceptance:

- A case can execute against an unfamiliar page without predefined selectors.
- MidsceneJS is called only according to the configured policy.
- Reports show which steps used AI and why.

### Phase 5: Platform Operations

Make execution usable as a product capability.

Scope:

- Add project-level config UI.
- Add run history and report UI.
- Add retry from failed step.
- Add manual correction for failed target descriptions.
- Add concurrency limits and queue status.
- Add artifact cleanup policy.
- Add optional webhook notification after run completion.

Acceptance:

- Users can configure a target project, run cases, view reports, retry failures, and inspect artifacts without reading server files.
- Execution cost, AI usage, and failure reasons are visible.

## 8. Suggested Repository Layout

Backend:

```text
backend/app/ui_execution/
├── __init__.py
├── schemas.py
├── routers.py
├── service.py
├── storage.py
├── runner_client.py
└── prompt_builder.py
```

Runner:

```text
ui-runner/
├── package.json
├── playwright.config.ts
├── src/
│   ├── index.ts
│   ├── dsl.ts
│   ├── runner.ts
│   ├── locatorResolver.ts
│   ├── midsceneResolver.ts
│   ├── artifacts.ts
│   └── report.ts
└── tests/
```

Artifacts:

```text
backend/app/data/ui_execution/
├── projects.json
├── runs/
├── locators.json
└── artifacts/
```

Frontend:

```text
frontend/src/pages/UIExecutionPage.jsx
frontend/src/components/uiExecution/
├── ProjectConfigPanel.jsx
├── DslPreview.jsx
├── RunHistoryTable.jsx
├── ExecutionReport.jsx
└── StepResultTimeline.jsx
```

## 9. API Sketch

Create or update target project:

```json
{
  "id": "demo-crm",
  "name": "Demo CRM",
  "base_url": "https://demo.example.com",
  "variables": {
    "USERNAME": "test_user",
    "PASSWORD": "******"
  },
  "browser": "chromium",
  "headless": true,
  "timeout_ms": 30000,
  "midscene_policy": "fallback_only"
}
```

Start run:

```json
{
  "project_id": "demo-crm",
  "case": {
    "case_id": "TC_LOGIN_001",
    "name": "User can log in successfully",
    "steps": []
  },
  "options": {
    "trace": true,
    "video": false,
    "screenshot": "on_each_step",
    "retry": 1
  }
}
```

Step result:

```json
{
  "step_id": "s4",
  "action": "click",
  "target": "login button",
  "status": "passed",
  "duration_ms": 842,
  "engine": "playwright",
  "locator": {
    "type": "role",
    "value": "button[name='Login']"
  },
  "screenshot": "artifacts/run-001/s4.png",
  "error": null
}
```

## 10. Cost and Speed Controls

- Default MidsceneJS policy should be `fallback_only`.
- Set maximum AI calls per case.
- Set maximum AI retries per step.
- Cache successful resolutions.
- Prefer stored locators on later runs.
- Track AI usage in every report.
- Allow project-level switch to disable MidsceneJS.
- Run Playwright deterministic steps in the fastest possible path.

## 10.1 Storage Direction

The recommended storage path is:

```text
MVP: JSON files
Knowledge layer: Neo4j + Qdrant
Platform scale: PostgreSQL
```

SQLite can remain an optional single-machine local deployment choice, but it is not the recommended long-term target. MySQL is not needed for this project direction.

The first implementation should still define a store interface, so JSON storage can later be replaced by PostgreSQL without changing runner and service logic.

## 11. Risks

- Unknown projects may require login, test data, captcha handling, or environment setup.
- MidsceneJS results may vary across model providers, viewport sizes, and UI changes.
- Visual execution can be slower than selector-based execution.
- Sensitive values must be masked in logs and artifacts.
- Storing screenshots and traces can consume disk quickly.
- Cross-origin iframes, browser permissions, and file downloads need explicit handling.

## 12. Open Questions

- Should the first runner live inside the FastAPI backend process, or as a separate Node service?
- Should execution be synchronous for MVP, or always queued as background tasks?
- Which PostgreSQL schema should be used once JSON MVP storage is no longer enough?
- Should MidsceneJS be available in MVP, or added only after Playwright reports are stable?
- What demo target project should be used as the first validation site?

## 13. Recommended MVP

Build the first version without MidsceneJS, but design all schemas and routing so MidsceneJS can be added cleanly.

MVP scope:

- Step DSL schema.
- Project config schema.
- Playwright runner.
- Run task API.
- Basic report persistence.
- Screenshot on every step.
- Trace on failure.
- Frontend report view.

MVP success criteria:

- OpenMelon can take a structured test case, run it against a configured external web project, and show a step-by-step report with evidence.
- The design leaves a clear extension point for MidsceneJS fallback execution.
