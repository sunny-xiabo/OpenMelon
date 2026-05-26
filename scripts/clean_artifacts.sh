#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"

echo "[clean] removing Python bytecode and tool caches"
find backend tests -type d -name "__pycache__" -prune -exec rm -rf {} +
find backend tests -type f \( -name "*.pyc" -o -name "*.pyo" \) -delete
rm -rf .pytest_cache .ruff_cache backend/.pytest_cache backend/.ruff_cache

echo "[clean] removing frontend build caches"
rm -rf frontend/dist frontend/.vite frontend/.cache frontend/test-results

echo "[clean] done"
