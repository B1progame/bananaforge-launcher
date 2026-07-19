"""Per-user Windows integration; no elevation and no destructive original-game operations."""

from __future__ import annotations

import os
from pathlib import Path


def start_menu_folder() -> Path:
    return (
        Path(os.environ.get("APPDATA", str(Path.home() / "AppData/Roaming")))
        / "Microsoft/Windows/Start Menu/Programs/BananaForge Launcher"
    )


def desktop_folder() -> Path:
    return Path(os.environ.get("USERPROFILE", str(Path.home()))) / "Desktop"


def shortcut_instructions(executable: Path) -> str:
    return f"Create a per-user shortcut to {executable}; shortcut creation is optional and does not require administrator privileges."
