#!/usr/bin/env python3
"""Synchronize OpenMelon release version metadata."""

from __future__ import annotations

import argparse
from datetime import date
import json
from pathlib import Path
import re
import sys


REPO_ROOT = Path(__file__).resolve().parents[1]
VERSION_PATTERN = re.compile(r"^\d+\.\d+\.\d+(?:\.\d+)?(?:[-+][0-9A-Za-z.-]+)?$")


class VersionSyncError(RuntimeError):
    pass


def validate_version(version: str) -> None:
    if not VERSION_PATTERN.match(version):
        raise VersionSyncError(
            "Version must look like 0.2.8, 0.2.8.3, or include a simple prerelease/build suffix."
        )


def update_text_file(path: Path, updater, write: bool = True) -> bool:
    original = path.read_text()
    updated = updater(original)
    if updated == original:
        return False
    if write:
        path.write_text(updated)
    return True


def replace_required(pattern: str, replacement: str, text: str, path: Path, flags: int = 0) -> str:
    updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise VersionSyncError(f"Could not update version in {path}")
    return updated


def sync_changelog(version: str, release_date: str, write: bool = True) -> bool:
    path = REPO_ROOT / "CHANGELOG.md"

    def updater(text: str) -> str:
        return replace_required(
            r"^## \[[^\]]+\] - \d{4}-\d{2}-\d{2}",
            f"## [{version}] - {release_date}",
            text,
            path,
            flags=re.MULTILINE,
        )

    return update_text_file(path, updater, write=write)


def sync_backend_pyproject(version: str, write: bool = True) -> bool:
    path = REPO_ROOT / "backend" / "pyproject.toml"

    def updater(text: str) -> str:
        return replace_required(
            r'(^\[project\]\nname = "openmelon"\nversion = ")[^"]+(")',
            rf"\g<1>{version}\2",
            text,
            path,
            flags=re.MULTILINE,
        )

    return update_text_file(path, updater, write=write)


def sync_backend_lock(version: str, write: bool = True) -> bool:
    path = REPO_ROOT / "backend" / "uv.lock"

    def updater(text: str) -> str:
        return replace_required(
            r'(\[\[package\]\]\nname = "openmelon"\nversion = ")[^"]+(")',
            rf"\g<1>{version}\2",
            text,
            path,
            flags=re.MULTILINE,
        )

    return update_text_file(path, updater, write=write)


def sync_json_version(path: Path, version: str, update_root_package: bool = False, write: bool = True) -> bool:
    original = path.read_text()
    data = json.loads(original)
    data["version"] = version
    if update_root_package:
        data.setdefault("packages", {}).setdefault("", {})["version"] = version
    updated = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    if updated == original:
        return False
    if write:
        path.write_text(updated)
    return True


def sync_frontend_package(version: str, write: bool = True) -> bool:
    return sync_json_version(REPO_ROOT / "frontend" / "package.json", version, write=write)


def sync_frontend_lock(version: str, write: bool = True) -> bool:
    return sync_json_version(
        REPO_ROOT / "frontend" / "package-lock.json",
        version,
        update_root_package=True,
        write=write,
    )


def sync_all(version: str, release_date: str, write: bool = True) -> dict[str, bool]:
    return {
        "CHANGELOG.md": sync_changelog(version, release_date, write=write),
        "backend/pyproject.toml": sync_backend_pyproject(version, write=write),
        "backend/uv.lock": sync_backend_lock(version, write=write),
        "frontend/package.json": sync_frontend_package(version, write=write),
        "frontend/package-lock.json": sync_frontend_lock(version, write=write),
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Synchronize OpenMelon release version files.")
    parser.add_argument("version", help="Release version, for example: 0.2.8.4")
    parser.add_argument(
        "--date",
        default=date.today().isoformat(),
        help="Release date written to the top CHANGELOG heading. Defaults to today.",
    )
    parser.add_argument("--check", action="store_true", help="Report whether files would change without writing them.")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    try:
        validate_version(args.version)
        if args.check:
            changed = sync_all(args.version, args.date, write=False)
            would_change = [path for path, did_change in changed.items() if did_change]
            if would_change:
                print("Version files would change:")
                for path in would_change:
                    print(f"- {path}")
                return 1
            print("Version files are already synchronized.")
            return 0

        changed = sync_all(args.version, args.date)
    except VersionSyncError as exc:
        print(f"Version sync failed: {exc}", file=sys.stderr)
        return 2

    updated = [path for path, did_change in changed.items() if did_change]
    if not updated:
        print(f"Version files already synchronized at {args.version}.")
        return 0

    print(f"Synchronized OpenMelon version to {args.version}:")
    for path in updated:
        print(f"- {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
