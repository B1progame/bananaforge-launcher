"""Explicit bootstrap update flow; UI invokes it only after confirmation."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from pathlib import Path

from bootstrap.installer import BootstrapInstaller
from bootstrap.release_client import BootstrapReleaseClient
from bootstrap.secure_download import download_verified
from launcher.models.core import ReleaseManifest


@dataclass(frozen=True)
class BootstrapResult:
    manifest: ReleaseManifest
    active_path: Path


class BootstrapOrchestrator:
    def __init__(self, repository: str, install_root: Path) -> None:
        self.repository, self.install_root = repository, install_root
        self.releases = BootstrapReleaseClient(repository)

    async def check(self) -> ReleaseManifest:
        return await self.releases.latest_manifest()

    async def install_confirmed(
        self, manifest: ReleaseManifest, cancel: asyncio.Event
    ) -> BootstrapResult:
        package = await download_verified(
            manifest.download_url,
            self.install_root / "downloads" / f"launcher-{manifest.version}.zip",
            manifest.sha256,
            f"https://github.com/{self.repository}/releases/download/",
            cancel,
        )
        installer = BootstrapInstaller(self.install_root)
        try:
            active = installer.activate_verified_package(package, manifest.version)
        except BaseException:
            try:
                installer.rollback()
            except RuntimeError:
                pass
            raise
        return BootstrapResult(manifest, active)
