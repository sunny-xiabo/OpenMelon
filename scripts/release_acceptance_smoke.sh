#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="${ROOT_DIR}/backend"
FRONTEND_DIR="${ROOT_DIR}/frontend"
API_BASE="${OPENMELON_API_BASE:-http://localhost:8000/api}"

cd "$ROOT_DIR"

echo "[release-smoke] API base: ${API_BASE}"

resolve_python_bin() {
  if [[ -n "${OPENMELON_PYTHON_BIN:-}" && -x "${OPENMELON_PYTHON_BIN}" ]]; then
    printf '%s\n' "${OPENMELON_PYTHON_BIN}"
    return 0
  fi

  if [[ -x "${BACKEND_DIR}/.venv/bin/python" ]]; then
    printf '%s\n' "${BACKEND_DIR}/.venv/bin/python"
    return 0
  fi

  if command -v python3 >/dev/null 2>&1; then
    command -v python3
    return 0
  fi

  if command -v python >/dev/null 2>&1; then
    command -v python
    return 0
  fi

  return 1
}

resolve_node_bin() {
  if [[ -n "${OPENMELON_NODE_BIN:-}" && -x "${OPENMELON_NODE_BIN}" ]]; then
    printf '%s\n' "${OPENMELON_NODE_BIN}"
    return 0
  fi

  local codex_node="${HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
  if [[ -x "${codex_node}" ]]; then
    printf '%s\n' "${codex_node}"
    return 0
  fi

  if command -v node >/dev/null 2>&1; then
    command -v node
    return 0
  fi

  return 1
}

run_backend_smoke_tests() {
  local tests=(
    tests/test_api_execution_demo_assets.py
    tests/test_api_execution_dashboard.py
    tests/test_api_execution_project_environment.py
    tests/test_api_execution_knowledge.py
    tests/test_api_execution_ai_assistant.py
    tests/test_api_execution_flow_draft.py
    tests/test_api_execution_runner.py
    tests/test_event_logs.py
  )

  if command -v uv >/dev/null 2>&1; then
    (cd "${BACKEND_DIR}" && uv run pytest "${tests[@]}")
    return
  fi

  local python_bin
  if python_bin="$(resolve_python_bin)"; then
    (cd "${BACKEND_DIR}" && "${python_bin}" -m pytest "${tests[@]}")
    return
  fi

  echo "[release-smoke] uv was not found. Install uv or set OPENMELON_PYTHON_BIN to a Python executable with pytest installed." >&2
  return 127
}

run_frontend_with_npm() {
  npm --prefix "${FRONTEND_DIR}" run lint
  npm --prefix "${FRONTEND_DIR}" run build
}

run_frontend_with_node() {
  local node_bin="$1"
  (cd "${FRONTEND_DIR}" && "${node_bin}" ./node_modules/eslint/bin/eslint.js .)
  (cd "${FRONTEND_DIR}" && "${node_bin}" ./node_modules/vite/bin/vite.js build)
}

run_frontend_smoke_checks() {
  if command -v npm >/dev/null 2>&1; then
    run_frontend_with_npm
    return
  fi

  local node_bin
  if node_bin="$(resolve_node_bin)"; then
    run_frontend_with_node "${node_bin}"
    return
  fi

  echo "[release-smoke] npm/node was not found. Install Node.js/npm or set OPENMELON_NODE_BIN to a node executable." >&2
  return 127
}

if ! PYTHON_BIN="$(resolve_python_bin)"; then
  echo "[release-smoke] python was not found. Install Python or set OPENMELON_PYTHON_BIN." >&2
  exit 127
fi

json_get() {
  local path="$1"
  curl -fsS "${API_BASE}${path}"
}

json_post() {
  local path="$1"
  curl -fsS -X POST "${API_BASE}${path}"
}

assert_json() {
  local label="$1"
  local expression="$2"
  "${PYTHON_BIN}" -c '
import json, sys
label = sys.argv[1]
expression = sys.argv[2]
payload = json.load(sys.stdin)
if not eval(expression, {"__builtins__": {}}, {"data": payload, "isinstance": isinstance, "list": list, "dict": dict, "len": len}):
    raise SystemExit(f"{label} validation failed: {expression}\npayload={payload!r}")
print(f"[release-smoke] {label}: ok")
' "$label" "$expression"
}

echo "[release-smoke] 1/6 Demo 初始化"
json_post "/api-execution/demo/bootstrap" \
  | assert_json "demo/bootstrap" "data.get('project', {}).get('project_id') == 'demo-api-flow'"

echo "[release-smoke] 2/6 Demo OpenAPI 资产"
json_get "/api-execution/demo/openapi" \
  | assert_json "demo/openapi" "data.get('operation_count', 0) >= 1 and isinstance(data.get('operations'), list)"

echo "[release-smoke] 3/6 API 执行概览"
json_get "/api-execution/dashboard/summary?project_id=demo-api-flow&limit=50" \
  | assert_json "dashboard/summary" "data.get('project_id') == 'demo-api-flow' and len(data.get('recent_runs') or []) >= 1"

echo "[release-smoke] 4/6 任务中心聚合"
json_get "/api-execution/automation/task-center/summary?project_id=demo-api-flow&limit=50" \
  | assert_json "task-center/summary" "isinstance(data.get('status_counts'), dict) and isinstance(data.get('type_counts'), list) and isinstance(data.get('action_buckets'), list)"

echo "[release-smoke] 5/6 日志中心接口"
json_get "/logs/summary?project_id=demo-api-flow" \
  | assert_json "logs/summary" "'total' in data and 'module_counts' in data and 'event_type_counts' in data"
json_get "/logs/events?project_id=demo-api-flow&limit=10&offset=0" \
  | assert_json "logs/events" "'total' in data and isinstance(data.get('items'), list)"

echo "[release-smoke] 6/6 自动化测试与前端构建"
run_backend_smoke_tests
run_frontend_smoke_checks

echo "[release-smoke] all checks passed"
