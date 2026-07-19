from __future__ import annotations

from datetime import datetime, timezone
from enum import StrEnum
from pathlib import Path
from uuid import uuid4

from pydantic import BaseModel, Field


class SecurityState(StrEnum):
    OFFICIAL = "official"
    MANUAL = "manual"
    UNKNOWN = "unknown"


class InstalledMod(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    name: str
    version: str
    author: str | None = None
    repository: str | None = None
    source_url: str | None = None
    library_path: Path
    sha256: str
    security_state: SecurityState = SecurityState.UNKNOWN
    dependencies: list[str] = Field(default_factory=list)
    installed_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    release_notes: str = ""


class CatalogueMod(BaseModel):
    id: str
    name: str
    author: str | None = None
    description: str = ""
    repository: str
    version: str | None = None
    tags: list[str] = Field(default_factory=list)
    verified: bool = False


class ModFilters(BaseModel):
    author: str | None = None
    tags: list[str] = Field(default_factory=list)
    installed_only: bool = False
    verified_only: bool = False
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=30, ge=1, le=100)
