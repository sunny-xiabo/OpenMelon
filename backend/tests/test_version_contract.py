import json
import re
import tomllib
from pathlib import Path

from app.version import APP_VERSION


REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = REPO_ROOT / "backend"


def test_release_version_sources_are_aligned():
    pyproject = tomllib.loads((BACKEND_ROOT / "pyproject.toml").read_text())
    package_json = json.loads((REPO_ROOT / "frontend" / "package.json").read_text())
    changelog = (REPO_ROOT / "CHANGELOG.md").read_text()

    latest_changelog_version = re.search(r"^## \[(?P<version>[^\]]+)\]", changelog, re.MULTILINE)

    assert latest_changelog_version is not None
    assert pyproject["project"]["version"] == latest_changelog_version.group("version")
    assert package_json["version"] == latest_changelog_version.group("version")
    assert APP_VERSION == latest_changelog_version.group("version")


def test_version_sync_script_exists():
    sync_script = REPO_ROOT / "scripts" / "sync_version.py"

    assert sync_script.exists()
