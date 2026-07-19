"""Cancellable managed-copy creation that never mutates the source."""

from __future__ import annotations

import asyncio
import shutil
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path


class CopySafetyError(ValueError):
    pass


class CopyCancelled(RuntimeError):
    pass


@dataclass(frozen=True)
class CopyProgress:
    current_file: str
    completed_files: int
    total_files: int
    copied_bytes: int
    total_bytes: int


def ensure_copy_paths_safe(source: Path, destination: Path) -> None:
    source, destination = source.resolve(), destination.resolve()
    if source == destination or source in destination.parents or destination in source.parents:
        raise CopySafetyError("Source and managed destination must be separate, non-nested folders")
    if not source.is_dir():
        raise CopySafetyError("Source game directory does not exist")


def build_manifest(source: Path) -> list[dict[str, object]]:
    manifest: list[dict[str, object]] = []
    for path in source.rglob("*"):
        if path.is_symlink() or not path.is_file():
            continue
        stat = path.stat()
        manifest.append(
            {
                "relative_path": str(path.relative_to(source)),
                "size": stat.st_size,
                "modified": datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat(),
            }
        )
    return manifest


async def copy_game(
    source: Path,
    destination: Path,
    cancel: asyncio.Event,
    progress: asyncio.Queue[CopyProgress] | None = None,
) -> list[dict[str, object]]:
    ensure_copy_paths_safe(source, destination)
    manifest = build_manifest(source)
    required = sum(int(str(item["size"])) for item in manifest)
    free = shutil.disk_usage(
        destination.parent if destination.parent.exists() else source.parent
    ).free
    if free < required:
        raise CopySafetyError("Not enough free disk space for managed copy")
    staging = destination.with_name(destination.name + ".copying")
    if staging.exists():
        shutil.rmtree(staging)
    copied = 0
    try:
        for index, entry in enumerate(manifest, start=1):
            if cancel.is_set():
                raise CopyCancelled("Copy cancelled by user")
            relative = Path(str(entry["relative_path"]))
            source_file, target = source / relative, staging / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            await asyncio.to_thread(shutil.copy2, source_file, target, follow_symlinks=False)
            copied += int(str(entry["size"]))
            if progress is not None:
                await progress.put(
                    CopyProgress(str(relative), index, len(manifest), copied, required)
                )
        if destination.exists():
            raise CopySafetyError("Managed destination already exists")
        staging.replace(destination)
        return manifest
    except BaseException:
        if staging.exists():
            shutil.rmtree(staging, ignore_errors=True)
        raise
