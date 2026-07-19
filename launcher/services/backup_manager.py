from __future__ import annotations

import shutil
from datetime import datetime, timezone
from pathlib import Path


class BackupManager:
    def __init__(self, root: Path, retain: int = 5) -> None:
        self.root, self.retain = root, retain

    def create(self, source: Path, label: str) -> Path:
        self.root.mkdir(parents=True, exist_ok=True)
        destination = self.root / f"{label}-{datetime.now(timezone.utc):%Y%m%dT%H%M%SZ}"
        shutil.copytree(source, destination, symlinks=False)
        snapshots = sorted(self.root.iterdir(), key=lambda item: item.stat().st_mtime, reverse=True)
        for stale in snapshots[self.retain :]:
            shutil.rmtree(stale)
        return destination

    @staticmethod
    def restore(backup: Path, destination: Path) -> None:
        temporary = destination.with_name(destination.name + ".restore")
        if temporary.exists():
            shutil.rmtree(temporary)
        shutil.copytree(backup, temporary)
        if destination.exists():
            shutil.rmtree(destination)
        temporary.replace(destination)
