"""Explicit, journalled official-path mode. Never used without user selection."""

from __future__ import annotations

import json
import shutil
from pathlib import Path

from launcher.services.game_copy import build_manifest


class OfficialPathManager:
    def __init__(self, game_path: Path, state_root: Path) -> None:
        self.game_path, self.state_root = game_path, state_root
        self.backup = state_root / "clean-backup"
        self.journal = state_root / "official-path-journal.json"

    def create_verified_clean_backup(self) -> list[dict[str, object]]:
        if self.backup.exists():
            raise RuntimeError("A clean official-path backup already exists")
        self.state_root.mkdir(parents=True, exist_ok=True)
        shutil.copytree(self.game_path, self.backup, symlinks=False)
        manifest = build_manifest(self.backup)
        self.journal.write_text(
            json.dumps({"state": "clean-backed-up", "manifest": manifest}), encoding="utf-8"
        )
        return manifest

    def restore_clean(self) -> None:
        if not self.backup.is_dir():
            raise RuntimeError("Clean backup is unavailable")
        staging = self.game_path.with_name(self.game_path.name + ".clean-restore")
        if staging.exists():
            shutil.rmtree(staging)
        shutil.copytree(self.backup, staging, symlinks=False)
        replaced = self.game_path.with_name(self.game_path.name + ".managed-previous")
        if replaced.exists():
            shutil.rmtree(replaced)
        self.game_path.replace(replaced)
        staging.replace(self.game_path)
        self.journal.write_text(json.dumps({"state": "clean-restored"}), encoding="utf-8")

    def unfinished_operation(self) -> bool:
        try:
            state = json.loads(self.journal.read_text(encoding="utf-8")).get("state")
        except (OSError, json.JSONDecodeError):
            return False
        return state not in {"clean-backed-up", "clean-restored"}
