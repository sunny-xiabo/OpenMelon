"""Centralized runtime data paths.

All runtime-generated artifacts (database, logs, uploads, results, legacy
JSON files) are computed from a single root directory.  The root defaults to
``backend/runtime`` (a sibling of ``backend/app``), but can be overridden
with the ``OPENMELON_DATA_DIR`` environment variable so that deployments can
point at an external persistent volume without touching source code.

Every module that needs a runtime path should import from here instead of
computing paths relative to its own ``__file__``.
"""

from __future__ import annotations

import os
from pathlib import Path

_BACKEND_DIR = Path(__file__).resolve().parent.parent  # …/backend

#: Root for all generated runtime artifacts.
#: Override via ``OPENMELON_DATA_DIR`` env var.
RUNTIME_ROOT: Path = Path(
    os.environ.get("OPENMELON_DATA_DIR") or str(_BACKEND_DIR / "runtime")
).resolve()

# ---- sub-directories -------------------------------------------------------

#: Runtime data directory for app-local artifacts and legacy compatibility files
DB_DIR: Path = RUNTIME_ROOT / "data"

#: Log files (openmelon.log, openmelon_error.log)
LOG_DIR: Path = RUNTIME_ROOT / "logs"

#: Temporary upload staging area (files pending processing)
UPLOAD_TEMP_DIR: Path = RUNTIME_ROOT / "uploads"

#: Permanent uploaded-file storage (indexed documents)
UPLOAD_STORE_DIR: Path = RUNTIME_ROOT / "data" / "uploads"

#: Generated Excel / XMind export files
RESULTS_DIR: Path = RUNTIME_ROOT / "results"

#: Legacy JSON data directory (file_tracker.json, prompt_hub.json, etc.)
LEGACY_JSON_DIR: Path = RUNTIME_ROOT / "data"

# ---- concrete file paths ----------------------------------------------------

DB_PATH: Path = DB_DIR / "openmelon.db"
FILE_TRACKER_JSON: Path = LEGACY_JSON_DIR / "file_tracker.json"
PROMPT_HUB_JSON: Path = LEGACY_JSON_DIR / "prompt_hub.json"

# ---- ensure directories exist on import ------------------------------------

for _d in (DB_DIR, LOG_DIR, UPLOAD_TEMP_DIR, UPLOAD_STORE_DIR, RESULTS_DIR, LEGACY_JSON_DIR):
    _d.mkdir(parents=True, exist_ok=True)
