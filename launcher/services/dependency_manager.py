from __future__ import annotations

import platform
import shutil
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class DependencyStatus:
    name: str
    ready: bool
    detail: str
    official_url: str | None = None


class DependencyManager:
    def check(self, instance_path: Path) -> list[DependencyStatus]:
        free = shutil.disk_usage(
            instance_path.parent if instance_path.parent.exists() else Path.home()
        ).free
        return [
            DependencyStatus("Windows", platform.system() == "Windows", platform.platform()),
            DependencyStatus("64-bit CPU", platform.machine().endswith("64"), platform.machine()),
            DependencyStatus(
                "Free storage", free > 2_000_000_000, f"{free // 1_000_000} MB available"
            ),
            DependencyStatus(
                "MelonLoader",
                (instance_path / "MelonLoader").exists(),
                "Expected managed-loader directory",
            ),
            DependencyStatus(
                "BTD Mod Helper",
                any((instance_path / "Mods").glob("*ModHelper*.dll"))
                if (instance_path / "Mods").exists()
                else False,
                "Expected managed Mods DLL",
            ),
        ]
