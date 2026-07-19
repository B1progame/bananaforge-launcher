"""Validated, atomic JSON settings storage; secrets remain in keyring."""

from __future__ import annotations

import json
import os
from pathlib import Path

import keyring
from pydantic import ValidationError

from launcher.models.settings import Settings


class SettingsManager:
    def __init__(self, path: Path) -> None:
        self.path = path

    def load(self) -> Settings:
        try:
            raw = json.loads(self.path.read_text(encoding="utf-8"))
            if not isinstance(raw, dict):
                raise ValueError("Settings root must be an object")
            settings = Settings.model_validate(self._migrate(raw))
            if raw != settings.model_dump(mode="json"):
                self.save(settings)
            return settings
        except (OSError, ValidationError, json.JSONDecodeError, ValueError):
            return Settings()

    @staticmethod
    def _migrate(raw: dict[str, object]) -> dict[str, object]:
        version = raw.get("schema_version", 0)
        if not isinstance(version, int) or version > Settings().schema_version:
            raise ValueError("Unsupported settings schema")
        migrated = dict(raw)
        if version == 0:
            if "accent" in migrated and "primary_accent" not in migrated:
                migrated["primary_accent"] = migrated.pop("accent")
            if "dark_mode" in migrated and "theme" not in migrated:
                migrated["theme"] = "dark" if migrated.pop("dark_mode") else "light"
            migrated["schema_version"] = 1
        return migrated

    def save(self, settings: Settings) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(".tmp")
        temporary.write_text(settings.model_dump_json(indent=2), encoding="utf-8")
        os.replace(temporary, self.path)

    @staticmethod
    def save_github_token(token: str) -> None:
        keyring.set_password("BananaForgeLauncher", "github-token", token)

    @staticmethod
    def get_github_token() -> str | None:
        return keyring.get_password("BananaForgeLauncher", "github-token")
