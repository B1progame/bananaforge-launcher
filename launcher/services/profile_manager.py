from __future__ import annotations
import shutil
from pathlib import Path
from launcher.models.core import Profile


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
