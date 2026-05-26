#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="${ROOT_DIR}/backend"
FRONTEND_DIR="${ROOT_DIR}/frontend"

resolve_backend_python() {
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

run_backend_checks() {
  echo "[check] backend pytest"
  if command -v uv >/dev/null 2>&1; then
    (cd "${BACKEND_DIR}" && uv run pytest)
    return
  fi

  local python_bin
  if python_bin="$(resolve_backend_python)"; then
    (cd "${BACKEND_DIR}" && "${python_bin}" -m pytest)
    return
  fi

  echo "[check] uv was not found. Install uv or set OPENMELON_PYTHON_BIN to a Python executable with pytest installed." >&2
  return 127
}

run_frontend_with_npm() {
  echo "[check] frontend lint"
  npm --prefix "${FRONTEND_DIR}" run lint

  echo "[check] frontend tests"
  npm --prefix "${FRONTEND_DIR}" test

  echo "[check] frontend build"
  npm --prefix "${FRONTEND_DIR}" run build
}

run_frontend_with_node() {
  local node_bin="$1"
  echo "[check] frontend lint"
  (cd "${FRONTEND_DIR}" && "${node_bin}" ./node_modules/eslint/bin/eslint.js .)

  echo "[check] frontend tests"
  (cd "${FRONTEND_DIR}" && "${node_bin}" ./node_modules/vitest/vitest.mjs run)

  echo "[check] frontend build"
  (cd "${FRONTEND_DIR}" && "${node_bin}" ./node_modules/vite/bin/vite.js build)
}

run_frontend_checks() {
  if command -v npm >/dev/null 2>&1; then
    run_frontend_with_npm
    return
  fi

  local node_bin
  if node_bin="$(resolve_node_bin)"; then
    run_frontend_with_node "${node_bin}"
    return
  fi

  echo "[check] npm/node was not found. Install Node.js/npm or set OPENMELON_NODE_BIN to a node executable." >&2
  return 127
}

run_backend_checks
run_frontend_checks

echo "[check] all checks passed"
