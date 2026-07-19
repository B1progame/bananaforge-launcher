from __future__ import annotations
from datetime import datetime, timezone
from enum import StrEnum
from pathlib import Path
from pydantic import BaseModel, Field


class Storefront(StrEnum):
    STEAM = "steam"
    EPIC = "epic"
    MICROSOFT = "microsoft"
    MANUAL = "manual"


class InstallationMode(StrEnum):
    MANAGED_COPY = "managed_copy"
    OFFICIAL_PATH = "official_path"
    UNSUPPORTED = "unsupported"


class Profile(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    mod_files: list[str] = Field(default_factory=list)
    launch_arguments: list[str] = Field(default_factory=list)
    modified_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class GameInstallation(BaseModel):
    storefront: Storefront
    path: Path
    executable: Path
    valid: bool = False
    mode: InstallationMode = InstallationMode.UNSUPPORTED
    reason: str = "Not validated"


class ReleaseAsset(BaseModel):
    name: str
    url: str
    size: int = Field(ge=0)
    sha256: str | None = None


class ReleaseManifest(BaseModel):
    schema_version: int = 1
    version: str
    minimum_bootstrap_version: str
    platform: str = "windows"
    architecture: str = "x86_64"
    download_url: str
    sha256: str = Field(pattern=r"^[a-fA-F0-9]{64}$")
    signature_url: str | None = None
    size: int = Field(ge=0)
