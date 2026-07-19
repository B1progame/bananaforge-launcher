from __future__ import annotations
import json
import re
from datetime import datetime, timezone
from pathlib import Path

import psutil  # type: ignore[import-untyped]
from launcher.constants import BTD6_STEAM_APP_ID, EXPECTED_EXECUTABLE
from launcher.models.core import GameInstallation, InstallationMode, Storefront


def validate_game(folder: Path, storefront: Storefront) -> GameInstallation:
    executable = folder / EXPECTED_EXECUTABLE
    valid = (
        executable.is_file() and (folder / "BloonsTD6_Data").is_dir() if folder.is_dir() else False
    )
    files = (
        [path for path in folder.rglob("*") if path.is_file() and not path.is_symlink()]
        if folder.is_dir()
        else []
    )
    size = sum(path.stat().st_size for path in files)
    modified = max((path.stat().st_mtime for path in files), default=0)
    mode = (
        InstallationMode.MANAGED_COPY
        if storefront in {Storefront.STEAM, Storefront.EPIC, Storefront.MANUAL}
        else InstallationMode.UNSUPPORTED
    )
    reason = (
        "Validated executable and game directory"
        if valid
        else "BloonsTD6.exe or game files are missing"
    )
    if storefront is Storefront.MICROSOFT:
        reason = "Microsoft Store/Xbox installs are detected only; automatic modification is disabled pending verification"
    return GameInstallation(
        storefront=storefront,
        path=folder,
        executable=executable,
        valid=valid,
        mode=mode,
        reason=reason,
        size_bytes=size,
        last_modified=datetime.fromtimestamp(modified, timezone.utc) if modified else None,
        game_running=_is_game_running(),
        likely_updating=_is_store_updating(storefront),
    )


def _is_game_running() -> bool:
    return any(
        process.info.get("name", "").lower() == EXPECTED_EXECUTABLE.lower()
        for process in psutil.process_iter(["name"])
    )


def _is_store_updating(storefront: Storefront) -> bool:
    names = {
        Storefront.STEAM: {"steam.exe"},
        Storefront.EPIC: {"epicgameslauncher.exe", "epicwebhelper.exe"},
    }.get(storefront, set())
    # A store process alone is not proof of an update; this remains an advisory false-by-default.
    return False if not names else False


def discover_steam(steam_root: Path) -> list[GameInstallation]:
    libraries = [steam_root]
    vdf = steam_root / "steamapps/libraryfolders.vdf"
    if vdf.exists():
        libraries += [
            Path(p) for p in re.findall(r'"path"\s+"([^"]+)"', vdf.read_text(errors="ignore"))
        ]
    found = []
    for library in libraries:
        manifest = library / "steamapps" / f"appmanifest_{BTD6_STEAM_APP_ID}.acf"
        game = library / "steamapps/common/BloonsTD6"
        if manifest.exists() or game.exists():
            found.append(validate_game(game, Storefront.STEAM))
    return found


def discover_epic(manifest_root: Path) -> list[GameInstallation]:
    found = []
    for item in manifest_root.glob("*.item"):
        try:
            data = json.loads(item.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if "bloons" in str(data.get("DisplayName", "")).lower():
            found.append(validate_game(Path(data.get("InstallLocation", "")), Storefront.EPIC))
    return found


def discover_common_locations(local_app_data: Path, program_files: Path) -> list[GameInstallation]:
    """Find only plausible desktop locations; users still confirm every selection."""
    candidates = [
        (program_files / "Steam/steamapps/common/BloonsTD6", Storefront.STEAM),
        (program_files / "Epic Games/BloonsTD6", Storefront.EPIC),
        (local_app_data / "Programs/BloonsTD6", Storefront.MANUAL),
    ]
    return [validate_game(path, storefront) for path, storefront in candidates if path.exists()]


def discover_microsoft_candidates(package_root: Path) -> list[GameInstallation]:
    """Detection only: no protected-folder writes, copying, or automatic launch assumptions."""
    if not package_root.exists():
        return []
    return [
        validate_game(path, Storefront.MICROSOFT)
        for path in package_root.glob("*Bloons*")
        if path.is_dir()
    ]
