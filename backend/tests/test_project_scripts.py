from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]


def test_project_clean_script_exists_and_targets_generated_artifacts_only():
    script_path = REPO_ROOT / "scripts" / "clean_artifacts.sh"
    content = script_path.read_text()

    assert script_path.exists()
    assert "find backend tests -type d -name \"__pycache__\"" in content
    assert "frontend/dist" in content
    assert "git clean" not in content
    assert "git reset" not in content


def test_project_check_script_runs_backend_and_frontend_checks():
    script_path = REPO_ROOT / "scripts" / "check.sh"
    content = script_path.read_text()

    assert script_path.exists()
    assert "uv run pytest" in content
    assert "npm --prefix" in content
    assert "OPENMELON_NODE_BIN" in content
    assert "vitest.mjs run" in content
    assert "vite/bin/vite.js build" in content
    assert "git clean" not in content
    assert "git reset" not in content
