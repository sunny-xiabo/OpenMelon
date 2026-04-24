import copy
import json
import re
from datetime import UTC, datetime
from pathlib import Path
from threading import Lock
from typing import Any

from app.testcase_gen.services.prompt_hub_defaults import (
    DEFAULT_PROMPT_HUB_DATA,
    DEFAULT_SKILL_CATEGORIES,
    DEFAULT_SKILL_CATEGORY_ID,
    DEFAULT_TEMPLATE_ID,
)

MAX_PROMPT_HUB_SKILLS = 20


class PromptHubTracker:
    def __init__(self, data_file: Path | None = None) -> None:
        self._lock = Lock()
        self._data_file = data_file or (
            Path(__file__).resolve().parent.parent / "data" / "prompt_hub.json"
        )

    def load_data(self) -> dict[str, Any]:
        with self._lock:
            data = self._read_data_no_lock()
            self._validate_data(data)
            return data

    def list_templates(self, enabled_only: bool = False) -> list[dict[str, Any]]:
        return self._sort_records(self.load_data().get("templates", []), enabled_only)

    def list_skills(self, enabled_only: bool = False) -> list[dict[str, Any]]:
        return self._sort_records(self.load_data().get("skills", []), enabled_only)

    def list_skill_categories(self) -> list[dict[str, Any]]:
        return self._sort_records(self.load_data().get("skill_categories", []))

    def get_template_by_id(self, style_id: str | None) -> dict[str, Any]:
        templates = self.list_templates(enabled_only=False)
        enabled_templates = [item for item in templates if item.get("enabled")]
        by_id = {item["id"]: item for item in templates}
        if style_id and style_id in by_id and by_id[style_id].get("enabled"):
            return by_id[style_id]

        for item in enabled_templates:
            if item.get("is_default"):
                return item

        for item in enabled_templates:
            if item["id"] == DEFAULT_TEMPLATE_ID:
                return item

        if enabled_templates:
            return enabled_templates[0]

        raise ValueError("prompt hub 未配置可用模板")

    def get_skills_by_ids(self, skill_ids: list[str]) -> list[dict[str, Any]]:
        skills = {item["id"]: item for item in self.list_skills(enabled_only=True)}
        return [skills[skill_id] for skill_id in skill_ids if skill_id in skills]

    def get_options(self) -> dict[str, Any]:
        data = self.load_data()
        templates = self._sort_records(data.get("templates", []), enabled_only=True)
        skills = self._sort_records(data.get("skills", []), enabled_only=True)
        categories = {
            item["id"]: item for item in self._sort_records(data.get("skill_categories", []))
        }
        default_template = self.get_template_by_id(None)
        return {
            "version": data.get("version", 1),
            "updated_at": data.get("updated_at"),
            "default_style_id": default_template["id"],
            "templates": [
                {
                    "id": item["id"],
                    "name": item["name"],
                    "description": item.get("description", ""),
                }
                for item in templates
            ],
            "skill_categories": [
                {
                    "id": item["id"],
                    "name": item["name"],
                    "is_default": bool(item.get("is_default")),
                }
                for item in categories.values()
            ],
            "skills": [
                {
                    "id": item["id"],
                    "name": item["name"],
                    "description": item.get("description", ""),
                    "category": item.get("category", ""),
                    "category_name": categories.get(item.get("category"), {}).get(
                        "name", item.get("category", "")
                    ),
                }
                for item in skills
            ],
        }

    def create_template(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self._mutate_records("templates", payload=payload)

    def update_template(self, template_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        return self._mutate_records("templates", payload=payload, record_id=template_id)

    def delete_template(self, template_id: str) -> dict[str, Any]:
        return self._delete_record("templates", template_id)

    def create_skill(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self._mutate_records("skills", payload=payload)

    def update_skill(self, skill_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        return self._mutate_records("skills", payload=payload, record_id=skill_id)

    def delete_skill(self, skill_id: str) -> dict[str, Any]:
        return self._delete_record("skills", skill_id)

    def create_skill_category(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self._mutate_records("skill_categories", payload=payload)

    def update_skill_category(
        self, category_id: str, payload: dict[str, Any]
    ) -> dict[str, Any]:
        return self._mutate_records(
            "skill_categories", payload=payload, record_id=category_id
        )

    def delete_skill_category(self, category_id: str) -> dict[str, Any]:
        return self._delete_record("skill_categories", category_id)

    def _ensure_data_file(self) -> None:
        if self._data_file.exists():
            return
        self._data_file.parent.mkdir(parents=True, exist_ok=True)
        self._data_file.write_text(
            json.dumps(DEFAULT_PROMPT_HUB_DATA, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    def _read_data_no_lock(self) -> dict[str, Any]:
        self._ensure_data_file()
        data = json.loads(self._data_file.read_text(encoding="utf-8"))
        return self._upgrade_legacy_data(data)

    def _sort_records(
        self, records: list[dict[str, Any]], enabled_only: bool = False
    ) -> list[dict[str, Any]]:
        items = [
            copy.deepcopy(item)
            for item in records
            if not enabled_only or item.get("enabled", True)
        ]
        items.sort(key=lambda item: (item.get("sort_order", 0), item["id"]))
        return items

    def _validate_data(self, data: dict[str, Any]) -> None:
        templates = data.get("templates")
        skill_categories = data.get("skill_categories")
        skills = data.get("skills")
        if (
            not isinstance(templates, list)
            or not isinstance(skill_categories, list)
            or not isinstance(skills, list)
        ):
            raise ValueError(
                "prompt_hub.json 必须包含 templates、skill_categories 和 skills 数组"
            )
        if len(skills) > MAX_PROMPT_HUB_SKILLS:
            raise ValueError(f"prompt_hub.json 中技能数量不能超过 {MAX_PROMPT_HUB_SKILLS} 个")

        self._validate_unique_names(templates, "template")
        self._validate_unique_names(skill_categories, "skill category")
        self._validate_unique_names(skills, "skill")

        enabled_defaults = [
            item for item in templates if item.get("enabled") and item.get("is_default")
        ]
        if len(enabled_defaults) != 1:
            raise ValueError("prompt_hub.json 必须存在且仅存在一个启用中的默认模板")

        default_categories = [item for item in skill_categories if item.get("is_default")]
        if not default_categories:
            raise ValueError("prompt_hub.json 至少需要一个默认技能分类")

        category_ids = set()
        for item in skill_categories:
            if not item.get("id") or not item.get("name"):
                raise ValueError("prompt_hub.json 中的技能分类必须包含 id 和 name")
            category_ids.add(item["id"])

        for item in templates + skills:
            if not item.get("id") or not item.get("name"):
                raise ValueError("prompt_hub.json 中的模板/技能必须包含 id 和 name")
            if not item.get("content"):
                raise ValueError(
                    f"prompt_hub.json 中的配置内容不能为空: {item.get('id', '<unknown>')}"
                )
            self._validate_placeholder_content(item["content"], item["id"])

        for item in skills:
            if item.get("category") not in category_ids:
                raise ValueError(f"技能引用了不存在的分类: {item['id']}")

    def _mutate_records(
        self, kind: str, payload: dict[str, Any], record_id: str | None = None
    ) -> dict[str, Any]:
        with self._lock:
            data = self._read_data_no_lock()
            self._validate_data(data)
            records = copy.deepcopy(data[kind])
            normalized = self._normalize_payload(kind, payload, record_id)

            if kind == "skills" and record_id is None and len(records) >= MAX_PROMPT_HUB_SKILLS:
                raise ValueError(f"技能数量不能超过 {MAX_PROMPT_HUB_SKILLS} 个")
            if kind == "skills":
                category_ids = {item["id"] for item in data.get("skill_categories", [])}
                if normalized["category"] not in category_ids:
                    raise ValueError("技能分类不存在，请先创建分类")

            if record_id is None:
                normalized["id"] = self._ensure_unique_id(
                    records,
                    normalized["id"] or self._generate_record_id(normalized["name"]),
                )
                records.append(normalized)
                action = "created"
            else:
                matched = False
                for index, item in enumerate(records):
                    if item["id"] != record_id:
                        continue
                    normalized["id"] = record_id
                    if kind == "templates" and item.get("is_default") and not normalized.get(
                        "enabled"
                    ):
                        raise ValueError("不能停用当前默认模板，请先切换默认模板")
                    if kind == "skill_categories" and item.get("is_default"):
                        normalized["is_default"] = True
                    records[index] = normalized
                    matched = True
                    action = "updated"
                    break
                if not matched:
                    raise ValueError(f"{kind[:-1]} 不存在: {record_id}")

            if kind == "templates":
                records = self._normalize_default_template(records, normalized["id"])
            elif kind == "skill_categories":
                records = self._normalize_skill_categories(records)

            candidate = {**data, kind: records}
            saved = self._persist(candidate)
            return {
                "success": True,
                "message": f"{kind[:-1]} {action}",
                "version": saved["version"],
                "updated_at": saved["updated_at"],
                "record": next(item for item in saved[kind] if item["id"] == normalized["id"]),
            }

    def _delete_record(self, kind: str, record_id: str) -> dict[str, Any]:
        with self._lock:
            data = self._read_data_no_lock()
            self._validate_data(data)
            records = copy.deepcopy(data[kind])
            target = next((item for item in records if item["id"] == record_id), None)
            if not target:
                raise ValueError(f"{kind[:-1]} 不存在: {record_id}")

            if kind == "templates" and target.get("is_default"):
                raise ValueError("不允许删除唯一默认模板，请先切换默认模板")
            if kind == "skill_categories":
                if target.get("is_default"):
                    raise ValueError("默认技能分类不允许删除")
                if any(item.get("category") == record_id for item in data.get("skills", [])):
                    raise ValueError("已有技能使用该分类，请先调整技能分类后再删除")

            remaining = [item for item in records if item["id"] != record_id]
            if kind == "templates":
                remaining = self._normalize_default_template(remaining)
            elif kind == "skill_categories":
                remaining = self._normalize_skill_categories(remaining)

            candidate = {**data, kind: remaining}
            saved = self._persist(candidate)
            return {
                "success": True,
                "message": f"{kind[:-1]} deleted",
                "version": saved["version"],
                "updated_at": saved["updated_at"],
                "record": target,
            }

    def _persist(self, data: dict[str, Any]) -> dict[str, Any]:
        current_version = int(data.get("version", 1))
        candidate = copy.deepcopy(data)
        candidate["version"] = current_version + 1
        candidate["updated_at"] = (
            datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")
        )
        self._validate_data(candidate)
        self._data_file.write_text(
            json.dumps(candidate, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        return candidate

    def _normalize_payload(
        self, kind: str, payload: dict[str, Any], record_id: str | None
    ) -> dict[str, Any]:
        normalized = copy.deepcopy(payload)
        normalized["id"] = (normalized.get("id") or "").strip() or None
        normalized["name"] = (normalized.get("name") or "").strip()
        normalized["sort_order"] = int(normalized.get("sort_order", 100))

        if record_id and normalized.get("id") and normalized["id"] != record_id:
            raise ValueError("更新时不允许修改记录 id")
        if not normalized["name"]:
            raise ValueError("名称不能为空")

        if kind == "templates":
            normalized["description"] = (normalized.get("description") or "").strip()
            normalized["content"] = (normalized.get("content") or "").strip()
            normalized["review_summary"] = (normalized.get("review_summary") or "").strip()
            normalized["enabled"] = bool(normalized.get("enabled", True))
            normalized["is_default"] = bool(normalized.get("is_default", False))
            if not normalized["content"]:
                raise ValueError("内容不能为空")
            self._validate_placeholder_content(
                normalized["content"], record_id or normalized["id"] or normalized["name"]
            )
        elif kind == "skills":
            normalized["description"] = (normalized.get("description") or "").strip()
            normalized["content"] = (normalized.get("content") or "").strip()
            normalized["review_summary"] = (normalized.get("review_summary") or "").strip()
            normalized["enabled"] = bool(normalized.get("enabled", True))
            normalized["category"] = (
                normalized.get("category") or DEFAULT_SKILL_CATEGORY_ID
            ).strip()
            if not normalized["content"]:
                raise ValueError("内容不能为空")
            self._validate_placeholder_content(
                normalized["content"], record_id or normalized["id"] or normalized["name"]
            )
        else:
            normalized["is_default"] = bool(normalized.get("is_default", False))

        self._validate_unique_name_for_mutation(kind, normalized["name"], record_id)
        return normalized

    def _normalize_default_template(
        self, templates: list[dict[str, Any]], preferred_id: str | None = None
    ) -> list[dict[str, Any]]:
        enabled_templates = [item for item in templates if item.get("enabled")]
        if not enabled_templates:
            raise ValueError("至少需要保留一个启用中的模板")

        default_id = preferred_id
        if default_id:
            matched = next((item for item in enabled_templates if item["id"] == default_id), None)
            if not matched or not matched.get("is_default"):
                default_id = None

        if not default_id:
            current_default = next(
                (item["id"] for item in enabled_templates if item.get("is_default")),
                None,
            )
            default_id = current_default or enabled_templates[0]["id"]

        for item in templates:
            item["is_default"] = item["id"] == default_id

        return templates

    def _normalize_skill_categories(
        self, categories: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        if not any(item.get("is_default") for item in categories):
            raise ValueError("至少需要保留一个默认技能分类")
        return categories

    def _upgrade_legacy_data(self, data: dict[str, Any]) -> dict[str, Any]:
        candidate = copy.deepcopy(data)
        categories = candidate.get("skill_categories")
        if not isinstance(categories, list) or not categories:
            candidate["skill_categories"] = copy.deepcopy(DEFAULT_SKILL_CATEGORIES)
        category_ids = {item["id"] for item in candidate.get("skill_categories", [])}
        for item in candidate.get("skills", []):
            category_id = (item.get("category") or DEFAULT_SKILL_CATEGORY_ID).strip()
            if category_id not in category_ids:
                candidate["skill_categories"].append(
                    {
                        "id": category_id,
                        "name": category_id,
                        "is_default": False,
                        "sort_order": 900,
                    }
                )
                category_ids.add(category_id)
            item["category"] = category_id
        return candidate

    def _generate_record_id(self, name: str) -> str:
        candidate = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
        if candidate:
            return candidate
        return f"custom-{datetime.now(UTC).strftime('%Y%m%d%H%M%S')}"

    def _ensure_unique_id(self, records: list[dict[str, Any]], candidate: str) -> str:
        existing = {item["id"] for item in records}
        if candidate not in existing:
            return candidate

        suffix = 2
        while f"{candidate}-{suffix}" in existing:
            suffix += 1
        return f"{candidate}-{suffix}"

    def _validate_placeholder_content(self, content: str, label: str) -> None:
        if "{{" in content or "}}" in content:
            raise ValueError(f"检测到非法占位符语法，请移除模板占位符: {label}")

    def _validate_unique_names(self, records: list[dict[str, Any]], label: str) -> None:
        ids: set[str] = set()
        names: set[str] = set()
        for item in records:
            item_id = item.get("id")
            item_name = item.get("name")
            if item_id in ids:
                raise ValueError(f"duplicate {label} id: {item_id}")
            if item_name in names:
                raise ValueError(f"duplicate {label} name: {item_name}")
            ids.add(item_id)
            names.add(item_name)

    def _validate_unique_name_for_mutation(
        self, kind: str, name: str, record_id: str | None
    ) -> None:
        existing = self._read_data_no_lock().get(kind, [])
        for item in existing:
            if item["name"] == name and item["id"] != record_id:
                raise ValueError(f"duplicate {kind[:-1]} name: {name}")


prompt_hub_tracker = PromptHubTracker()
