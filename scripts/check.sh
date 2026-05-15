#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="${ROOT_DIR}/frontend"

run_backend_checks() {
  echo "[check] backend pytest"
  (cd "${ROOT_DIR}/backend" && uv run pytest)
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

  if [[ -n "${OPENMELON_NODE_BIN:-}" && -x "${OPENMELON_NODE_BIN}" ]]; then
    run_frontend_with_node "${OPENMELON_NODE_BIN}"
    return
  fi

  echo "[check] npm was not found. Install Node.js/npm or set OPENMELON_NODE_BIN to a node executable." >&2
  return 127
}

run_backend_checks
run_frontend_checks

echo "[check] all checks passed"
