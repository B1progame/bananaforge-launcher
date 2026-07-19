"""Per-user Windows shortcuts and file associations; no elevation required."""

from __future__ import annotations

import os
import subprocess
from pathlib import Path


def start_menu_folder() -> Path:
    return (
        Path(os.environ.get("APPDATA", str(Path.home() / "AppData/Roaming")))
        / "Microsoft/Windows/Start Menu/Programs/BananaForge Launcher"
    )


def desktop_folder() -> Path:
    return Path(os.environ.get("USERPROFILE", str(Path.home()))) / "Desktop"


def startup_folder() -> Path:
    return (
        Path(os.environ.get("APPDATA", str(Path.home() / "AppData/Roaming")))
        / "Microsoft/Windows/Start Menu/Programs/Startup"
    )


def _ps_quote(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def create_shortcut(target: Path, shortcut: Path, description: str, arguments: str = "") -> Path:
    if os.name != "nt":
        raise OSError("Windows shortcuts are only available on Windows")
    if not target.is_file():
        raise FileNotFoundError(target)
    shortcut.parent.mkdir(parents=True, exist_ok=True)
    script = (
        "$shell=New-Object -ComObject WScript.Shell; $link=$shell.CreateShortcut("
        + _ps_quote(str(shortcut))
        + "); $link.TargetPath="
        + _ps_quote(str(target))
        + "; $link.WorkingDirectory="
        + _ps_quote(str(target.parent))
        + "; $link.Description="
        + _ps_quote(description)
        + "; $link.Arguments="
        + _ps_quote(arguments)
        + "; $link.Save()"
    )
    subprocess.run(
        ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script],
        check=True,
        shell=False,
        capture_output=True,
    )
    return shortcut


def install_shortcuts(executable: Path, desktop: bool, startup: bool) -> list[Path]:
    created = [
        create_shortcut(
            executable,
            start_menu_folder() / "BananaForge Launcher.lnk",
            "Open BananaForge Launcher",
        )
    ]
    if desktop:
        created.append(
            create_shortcut(
                executable,
                desktop_folder() / "BananaForge Launcher.lnk",
                "Open BananaForge Launcher",
            )
        )
    if startup:
        created.append(
            create_shortcut(
                executable,
                startup_folder() / "BananaForge Launcher.lnk",
                "Start BananaForge Launcher",
            )
        )
    return created


def register_profile_associations(executable: Path) -> None:
    if os.name != "nt":
        raise OSError("File associations are only available on Windows")
    import winreg

    for extension, prog_id, description in [
        (".bmlprofile", "BananaForge.Profile", "BananaForge Profile"),
        (".bmltheme", "BananaForge.Theme", "BananaForge Theme"),
    ]:
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, f"Software\\Classes\\{extension}") as key:
            winreg.SetValueEx(key, "", 0, winreg.REG_SZ, prog_id)
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, f"Software\\Classes\\{prog_id}") as key:
            winreg.SetValueEx(key, "", 0, winreg.REG_SZ, description)
        with winreg.CreateKey(
            winreg.HKEY_CURRENT_USER, f"Software\\Classes\\{prog_id}\\shell\\open\\command"
        ) as key:
            winreg.SetValueEx(key, "", 0, winreg.REG_SZ, f'"{executable}" "%1"')


def shortcut_instructions(executable: Path) -> str:
    return f"Create optional per-user shortcuts to {executable}; no administrator privileges are required."
