import re
from pathlib import Path

from app.config import Settings


REPO_ROOT = Path(__file__).resolve().parents[2]
ENV_EXAMPLE = REPO_ROOT / ".env.example"
RUNTIME_ENV_KEYS = {
    "OPENMELON_DATA_DIR",
    "NODE_TYPES_CONFIG_PATH",
}


def _env_example_keys() -> set[str]:
    text = ENV_EXAMPLE.read_text()
    return set(re.findall(r"^\s*#?\s*([A-Z][A-Z0-9_]+)=", text, flags=re.MULTILINE))


def test_env_example_documents_settings_fields():
    keys = _env_example_keys()

    missing = sorted(set(Settings.model_fields) - keys)

    assert missing == []


def test_env_example_documents_runtime_env_keys():
    keys = _env_example_keys()

    missing = sorted(RUNTIME_ENV_KEYS - keys)

    assert missing == []


def test_storage_backend_switch_is_not_documented():
    keys = _env_example_keys()

    assert "STORAGE_BACKEND" not in keys
    assert "STORAGE_BACKEND" not in Settings.model_fields
