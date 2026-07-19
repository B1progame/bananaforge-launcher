from __future__ import annotations

import shutil
from pathlib import Path

from launcher.models.core import ReleaseAsset
from launcher.services.github_client import GitHubClient
from launcher.services.integrity import sha256_file


class ModHelperManager:
    repository = "gurrenm3/BTD-Mod-Helper"

    @staticmethod
    async def available_releases(client: GitHubClient) -> list[ReleaseAsset]:
        return await client.latest_assets(ModHelperManager.repository)

    @staticmethod
    def choose_dll(assets: list[ReleaseAsset]) -> ReleaseAsset:
        candidates = [asset for asset in assets if asset.name.lower().endswith(".dll")]
        if len(candidates) != 1:
            raise ValueError("Could not unambiguously select the BTD Mod Helper DLL")
        return candidates[0]

    @staticmethod
    def install_verified_dll(download: Path, instance_path: Path) -> tuple[Path, str]:
        mods = instance_path / "Mods"
        mods.mkdir(parents=True, exist_ok=True)
        destination = mods / download.name
        if destination.exists():
            shutil.copy2(destination, destination.with_suffix(destination.suffix + ".backup"))
        shutil.copy2(download, destination)
        return destination, sha256_file(destination)
