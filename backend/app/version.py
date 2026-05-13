"""Application version helpers."""

from __future__ import annotations

from importlib import metadata
from pathlib import Path
import tomllib


PACKAGE_NAME = "openmelon"


def get_app_version() -> str:
    """Return the package version, falling back to local pyproject metadata."""

    try:
        return metadata.version(PACKAGE_NAME)
    except metadata.PackageNotFoundError:
        pyproject_path = Path(__file__).resolve().parents[1] / "pyproject.toml"
        with pyproject_path.open("rb") as pyproject_file:
            pyproject = tomllib.load(pyproject_file)
        return str(pyproject["project"]["version"])


APP_VERSION = get_app_version()
