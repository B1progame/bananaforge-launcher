from __future__ import annotations

from pathlib import Path

from platformdirs import user_data_path

from launcher.services.library_store import LibraryStore
from launcher.services.settings_manager import SettingsManager
from launcher.services.setup_coordinator import SetupCoordinator


class ApplicationServices:
    def __init__(self) -> None:
        self.data_root = user_data_path("BananaForgeLauncher", ensure_exists=True)
        self.settings = SettingsManager(self.data_root / "settings.json")
        self.library = LibraryStore(self.data_root / "library")
        self.setup = SetupCoordinator(self.library)

    @property
    def downloads_path(self) -> Path:
        path = self.settings.load().downloads_path or self.data_root / "Downloads"
        path.mkdir(parents=True, exist_ok=True)
        return path
