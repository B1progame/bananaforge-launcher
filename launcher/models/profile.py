from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from pydantic import BaseModel, Field


class ManagedProfile(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    name: str = Field(min_length=1, max_length=80)
    icon: str = "cube"
    accent_color: str = "#ff9f1c"
    description: str = ""
    mod_ids: list[str] = Field(default_factory=list)
    launch_arguments: list[str] = Field(default_factory=list)
    configuration_overrides: dict[str, object] = Field(default_factory=dict)
    last_played_at: datetime | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    modified_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
