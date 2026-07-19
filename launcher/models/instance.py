from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from pydantic import BaseModel, Field

from launcher.models.core import InstallationMode, Storefront


class ManagedInstance(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    name: str = Field(min_length=1, max_length=80)
    storefront: Storefront
    original_path: Path
    managed_path: Path
    mode: InstallationMode
    game_version: str | None = None
    source_manifest: list[dict[str, object]] = Field(default_factory=list)
    last_synchronized: datetime | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    melonloader_version: str | None = None
    mod_helper_version: str | None = None
