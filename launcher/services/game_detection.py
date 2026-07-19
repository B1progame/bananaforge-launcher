from __future__ import annotations
import json
import re
from pathlib import Path
from launcher.constants import BTD6_STEAM_APP_ID, EXPECTED_EXECUTABLE
from launcher.models.core import GameInstallation, InstallationMode, Storefront


def validate_game(folder: Path, storefront: Storefront) -> GameInstallation:
    executable = folder / EXPECTED_EXECUTABLE
    valid = executable.is_file() and any(folder.iterdir()) if folder.is_dir() else False
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
    )


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
