from __future__ import annotations
import json
import os
import shutil
from pathlib import Path


class Transaction:
    def __init__(self, journal: Path) -> None:
        self.journal, self.actions = journal, []

    def record(self, action: dict[str, str]) -> None:
        self.actions.append(action)
        self.journal.parent.mkdir(parents=True, exist_ok=True)
        self.journal.write_text(json.dumps(self.actions))

    def replace(self, source: Path, destination: Path) -> None:
        backup = destination.with_suffix(destination.suffix + ".bananaf-backup")
        if destination.exists():
            shutil.copy2(destination, backup)
        os.replace(source, destination)
        self.record({"destination": str(destination), "backup": str(backup)})

    def rollback(self) -> None:
        for item in reversed(self.actions):
            dest, backup = Path(item["destination"]), Path(item["backup"])
            if backup.exists():
                os.replace(backup, dest)
        self.journal.unlink(missing_ok=True)

    def commit(self) -> None:
        self.journal.unlink(missing_ok=True)
