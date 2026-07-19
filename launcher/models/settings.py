"""Persistent launcher preferences with schema migration support."""

from __future__ import annotations

from enum import StrEnum
from pathlib import Path

from pydantic import BaseModel, Field


class ThemeMode(StrEnum):
    DARK = "dark"
    LIGHT = "light"
    SYSTEM = "system"
    HIGH_CONTRAST = "high_contrast"


class MotionMode(StrEnum):
    FULL = "full"
    REDUCED = "reduced"
    NONE = "none"


class Settings(BaseModel):
    schema_version: int = 1
    theme: ThemeMode = ThemeMode.DARK
    motion: MotionMode = MotionMode.FULL
    language: str = "en"
    primary_accent: str = "#ff9f1c"
    secondary_accent: str = "#ffcf56"
    glow_intensity: float = Field(default=0.55, ge=0, le=1)
    gradient_strength: float = Field(default=0.5, ge=0, le=1)
    card_opacity: float = Field(default=0.92, ge=0.5, le=1)
    downloads_path: Path | None = None
    concurrent_downloads: int = Field(default=2, ge=1, le=4)
    retry_count: int = Field(default=3, ge=0, le=8)
    startup_page: str = "Home"
    acknowledged_modding_warning: bool = False
    default_instance_id: str | None = None
    default_profile_id: str | None = None
    update_channel: str = "stable"
    auto_check_updates: bool = True
    block_unknown_sources: bool = True
    require_manual_dll_confirmation: bool = True
