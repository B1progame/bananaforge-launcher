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
            return Settings.model_validate_json(self.path.read_text(encoding="utf-8"))
        except (OSError, ValidationError, json.JSONDecodeError):
            return Settings()

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
