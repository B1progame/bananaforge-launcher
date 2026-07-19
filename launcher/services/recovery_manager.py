from __future__ import annotations

import json
from pathlib import Path

from launcher.services.transactions import Transaction


class RecoveryManager:
    def pending(self, journal_root: Path) -> list[Path]:
        return list(journal_root.glob("*.json"))

    def restore(self, journal: Path) -> None:
        entries = json.loads(journal.read_text(encoding="utf-8"))
        transaction = Transaction(journal)
        transaction.actions = entries
        transaction.rollback()

    @staticmethod
    def discard(journal: Path) -> None:
        journal.unlink(missing_ok=True)
