from __future__ import annotations

import shutil
from pathlib import Path

from launcher.services.integrity import safe_extract_zip


class BootstrapInstaller:
    """Activates only a package the caller has already hash-verified."""

    def __init__(self, install_root: Path) -> None:
        self.install_root = install_root

    def activate_verified_package(self, package: Path, version: str) -> Path:
        versions = self.install_root / "versions"
        target = versions / version
        staging = versions / f"{version}.staging"
        if staging.exists():
            shutil.rmtree(staging)
        staging.mkdir(parents=True, exist_ok=True)
        safe_extract_zip(package, staging)
        if not any(staging.iterdir()):
            raise RuntimeError("Verified package was empty")
        versions.mkdir(parents=True, exist_ok=True)
        if target.exists():
            shutil.rmtree(target)
        staging.replace(target)
        current = self.install_root / "current"
        previous = self.install_root / "previous"
        if previous.exists():
            shutil.rmtree(previous)
        if current.exists():
            current.replace(previous)
        shutil.copytree(target, current)
        return current

    def rollback(self) -> None:
        current, previous = self.install_root / "current", self.install_root / "previous"
        if not previous.exists():
            raise RuntimeError("No previous launcher version is available")
        failed = self.install_root / "failed"
        if failed.exists():
            shutil.rmtree(failed)
        if current.exists():
            current.replace(failed)
        previous.replace(current)
