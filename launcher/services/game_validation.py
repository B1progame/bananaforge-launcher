from __future__ import annotations

import shutil
from dataclasses import dataclass
from pathlib import Path

from launcher.constants import EXPECTED_EXECUTABLE
from launcher.services.game_copy import ensure_copy_paths_safe


@dataclass(frozen=True)
class ValidationResult:
    valid: bool
    messages: list[str]
    available_bytes: int


def validate_managed_location(source: Path, destination: Path) -> ValidationResult:
    messages: list[str] = []
    try:
        ensure_copy_paths_safe(source, destination)
    except ValueError as error:
        return ValidationResult(False, [str(error)], 0)
    executable = source / EXPECTED_EXECUTABLE
    if not executable.is_file():
        messages.append("BloonsTD6.exe is missing")
    available = shutil.disk_usage(
        destination.parent if destination.parent.exists() else source.parent
    ).free
    required = sum(
        path.stat().st_size
        for path in source.rglob("*")
        if path.is_file() and not path.is_symlink()
    )
    if available < required:
        messages.append("Not enough available disk space")
    if destination.exists() and any(destination.iterdir()):
        messages.append("Managed destination must be empty")
    return ValidationResult(not messages, messages or ["Managed destination is safe"], available)
