from __future__ import annotations

import subprocess
from pathlib import Path

import psutil  # type: ignore[import-untyped]

from launcher.constants import EXPECTED_EXECUTABLE


class LaunchError(RuntimeError):
    pass


def game_is_running() -> bool:
    return any(
        process.info.get("name", "").lower() == EXPECTED_EXECUTABLE.lower()
        for process in psutil.process_iter(["name"])
    )


class LaunchManager:
    def launch(
        self, instance: Path, arguments: list[str] | None = None, console: bool = False
    ) -> subprocess.Popen[bytes]:
        executable = instance / EXPECTED_EXECUTABLE
        if not executable.is_file():
            raise LaunchError("Managed game executable is missing")
        if game_is_running():
            raise LaunchError("BTD6 is already running")
        creationflags = subprocess.CREATE_NEW_CONSOLE if console else 0
        return subprocess.Popen(
            [str(executable), *(arguments or [])],
            cwd=instance,
            shell=False,
            creationflags=creationflags,
        )

    def launch_clean(self, original: Path) -> subprocess.Popen[bytes]:
        return self.launch(original)
