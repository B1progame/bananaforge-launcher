"""Versioned compatibility manifest lookup that keeps missing data as unknown."""

from __future__ import annotations

import json
from pathlib import Path

from launcher.models.compatibility import CompatibilityState


class CompatibilityManager:
    def __init__(self, manifest_path: Path) -> None:
        self.manifest_path = manifest_path

    def load(self) -> dict[str, object]:
        try:
            data = json.loads(self.manifest_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {"schema_version": 1, "combinations": []}
        return (
            data
            if isinstance(data, dict) and data.get("schema_version") == 1
            else {"schema_version": 1, "combinations": []}
        )

    def melonloader_state(self, version: str | None) -> CompatibilityState:
        if not version:
            return CompatibilityState.DEPENDENCY_MISSING
        melon = self.load().get("melonloader", {})
        if not isinstance(melon, dict):
            return CompatibilityState.UNKNOWN
        if version in melon.get("blocked", []):
            return CompatibilityState.BLOCKED
        if version == melon.get("recommended"):
            return CompatibilityState.VERIFIED
        if version in melon.get("supported", []):
            return CompatibilityState.SUPPORTED
        return CompatibilityState.UNKNOWN

    def combination_state(
        self, btd6: str | None, melonloader: str | None, mod_helper: str | None
    ) -> CompatibilityState:
        if not all((btd6, melonloader, mod_helper)):
            return CompatibilityState.DEPENDENCY_MISSING
        combinations = self.load().get("combinations", [])
        if not isinstance(combinations, list):
            return CompatibilityState.UNKNOWN
        for item in combinations:
            if (
                isinstance(item, dict)
                and item.get("btd6") == btd6
                and item.get("melonloader") == melonloader
                and item.get("mod_helper") == mod_helper
            ):
                try:
                    return CompatibilityState(str(item.get("state", "unknown")))
                except ValueError:
                    return CompatibilityState.UNKNOWN
        return CompatibilityState.UNKNOWN
