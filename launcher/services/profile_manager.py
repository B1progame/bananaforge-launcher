from __future__ import annotations
import shutil
import json
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from launcher.models.core import Profile
from launcher.models.profile import ManagedProfile


class ProfileManager:
    def stage(self, profile: Profile, library: Path, mods: Path) -> None:
        staging = mods.with_name(mods.name + ".staging")
        if staging.exists():
            shutil.rmtree(staging)
        staging.mkdir(parents=True)
        for relative in profile.mod_files:
            source = (library / relative).resolve()
            if library.resolve() not in source.parents or not source.is_file():
                raise ValueError(f"Unsafe or missing mod: {relative}")
            shutil.copy2(source, staging / source.name)
        old = mods.with_name(mods.name + ".previous")
        if old.exists():
            shutil.rmtree(old)
        if mods.exists():
            mods.replace(old)
        staging.replace(mods)

    @staticmethod
    def duplicate(profile: ManagedProfile, name: str) -> ManagedProfile:
        """Duplicate metadata only; never copies third-party DLLs."""
        return profile.model_copy(
            update={
                "id": str(uuid4()),
                "name": name,
                "created_at": datetime.now(timezone.utc),
                "modified_at": datetime.now(timezone.utc),
            }
        )

    @staticmethod
    def export_profile(
        profile: ManagedProfile, repository_by_mod: dict[str, str], destination: Path
    ) -> Path:
        payload = {
            "schema_version": 1,
            "profile": profile.model_dump(mode="json"),
            "sources": {
                mod_id: repository_by_mod[mod_id]
                for mod_id in profile.mod_ids
                if mod_id in repository_by_mod
            },
        }
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        return destination

    @staticmethod
    def import_profile(source: Path) -> tuple[ManagedProfile, dict[str, str]]:
        payload = json.loads(source.read_text(encoding="utf-8"))
        if payload.get("schema_version") != 1 or not isinstance(payload.get("profile"), dict):
            raise ValueError("Unsupported .bmlprofile format")
        profile = ManagedProfile.model_validate(payload["profile"]).model_copy(
            update={"id": str(uuid4()), "modified_at": datetime.now(timezone.utc)}
        )
        sources = payload.get("sources", {})
        if not isinstance(sources, dict) or not all(
            isinstance(key, str) and isinstance(value, str) for key, value in sources.items()
        ):
            raise ValueError("Profile sources are malformed")
        return profile, sources

    @staticmethod
    def stage_managed(profile: ManagedProfile, resolved_mods: dict[str, Path], mods: Path) -> None:
        """Atomically activate exactly the selected profile's files."""
        staging = mods.with_name(mods.name + ".staging")
        if staging.exists():
            shutil.rmtree(staging)
        staging.mkdir(parents=True)
        seen_names: set[str] = set()
        for mod_id in profile.mod_ids:
            source = resolved_mods.get(mod_id)
            if source is None or not source.is_file() or source.suffix.lower() != ".dll":
                raise ValueError(f"Profile dependency is missing or invalid: {mod_id}")
            if source.name.lower() in seen_names:
                raise ValueError(f"Duplicate DLL filename in profile: {source.name}")
            seen_names.add(source.name.lower())
            shutil.copy2(source, staging / source.name)
        previous = mods.with_name(mods.name + ".previous")
        if previous.exists():
            shutil.rmtree(previous)
        if mods.exists():
            mods.replace(previous)
        staging.replace(mods)
