"""Synchronize changed official game files without overwriting managed mods."""

from __future__ import annotations

import shutil
from dataclasses import dataclass
from pathlib import Path

from launcher.services.backup_manager import BackupManager
from launcher.services.game_copy import build_manifest


@dataclass(frozen=True)
class SyncResult:
    changed_files: list[str]
    backup: Path


class SyncManager:
    @staticmethod
    def changed_paths(
        previous: list[dict[str, object]], current: list[dict[str, object]]
    ) -> list[str]:
        before = {
            str(item["relative_path"]): (item.get("size"), item.get("modified"))
            for item in previous
        }
        after = {
            str(item["relative_path"]): (item.get("size"), item.get("modified")) for item in current
        }
        return sorted(
            path for path in set(before) | set(after) if before.get(path) != after.get(path)
        )

    def synchronize(
        self,
        source: Path,
        managed: Path,
        previous_manifest: list[dict[str, object]],
        backup_manager: BackupManager,
    ) -> SyncResult:
        current = build_manifest(source)
        changed = self.changed_paths(previous_manifest, current)
        backup = backup_manager.create(managed, "pre-sync")
        try:
            for relative in changed:
                if relative.replace("\\", "/").lower().startswith("mods/"):
                    continue
                original = (source / relative).resolve()
                target = (managed / relative).resolve()
                if (
                    source.resolve() not in original.parents
                    or managed.resolve() not in target.parents
                ):
                    raise ValueError(f"Unsafe manifest path: {relative}")
                if original.is_file():
                    target.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(original, target)
                else:
                    target.unlink(missing_ok=True)
            return SyncResult(changed, backup)
        except BaseException:
            BackupManager.restore(backup, managed)
            raise
