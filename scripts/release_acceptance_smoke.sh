#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_BASE="${OPENMELON_API_BASE:-http://localhost:8000/api}"

cd "$ROOT_DIR"

echo "[release-smoke] API base: ${API_BASE}"

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
  python -c '
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
uv run pytest \
  backend/tests/test_api_execution_demo_assets.py \
  backend/tests/test_api_execution_dashboard.py \
  backend/tests/test_api_execution_project_environment.py \
  backend/tests/test_api_execution_knowledge.py \
  backend/tests/test_api_execution_ai_assistant.py \
  backend/tests/test_api_execution_flow_draft.py \
  backend/tests/test_api_execution_runner.py \
  backend/tests/test_event_logs.py

npm --prefix frontend run lint
npm --prefix frontend run build

echo "[release-smoke] all checks passed"
