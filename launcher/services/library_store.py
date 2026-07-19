"""Atomic persistence for instances, profiles, and mod metadata."""

from __future__ import annotations

import json
import os
from pathlib import Path
from collections.abc import Sequence
from typing import TypeVar

from pydantic import BaseModel

from launcher.models.instance import ManagedInstance
from launcher.models.profile import ManagedProfile

Model = TypeVar("Model", bound=BaseModel)


class LibraryStore:
    def __init__(self, root: Path) -> None:
        self.root = root

    def _read_list(self, name: str, model: type[Model]) -> list[Model]:
        path = self.root / name
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
            return [model.model_validate(item) for item in raw]
        except (OSError, json.JSONDecodeError, ValueError):
            return []

    def _write_list(self, name: str, entries: Sequence[BaseModel]) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        target = self.root / name
        temporary = target.with_suffix(".tmp")
        temporary.write_text(
            json.dumps([entry.model_dump(mode="json") for entry in entries], indent=2),
            encoding="utf-8",
        )
        os.replace(temporary, target)

    def profiles(self) -> list[ManagedProfile]:
        return self._read_list("profiles.json", ManagedProfile)

    def save_profiles(self, profiles: list[ManagedProfile]) -> None:
        self._write_list("profiles.json", profiles)

    def instances(self) -> list[ManagedInstance]:
        return self._read_list("instances.json", ManagedInstance)

    def save_instances(self, instances: list[ManagedInstance]) -> None:
        self._write_list("instances.json", instances)
