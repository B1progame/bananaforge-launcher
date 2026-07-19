"""Small Qt bootstrap UI entry point; package transfer remains asynchronous."""

from __future__ import annotations

from pathlib import Path


def default_install_location() -> Path:
    return Path.home() / "AppData/Local/BananaForgeLauncher"
