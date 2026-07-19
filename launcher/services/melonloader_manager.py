"""Official release resolution and safe archive installation; no custom injection."""

from __future__ import annotations

from pathlib import Path

from launcher.models.core import ReleaseAsset
from launcher.services.github_client import GitHubClient
from launcher.services.integrity import safe_extract_zip


class MelonLoaderManager:
    repository = "LavaGang/MelonLoader"

    @staticmethod
    async def available_releases(client: GitHubClient) -> list[ReleaseAsset]:
        return await client.latest_assets(MelonLoaderManager.repository)

    @staticmethod
    def choose_windows_x64_asset(assets: list[ReleaseAsset]) -> ReleaseAsset:
        candidates = [
            asset
            for asset in assets
            if asset.name.lower().endswith(".zip") and "windows" in asset.name.lower()
        ]
        if len(candidates) != 1:
            raise ValueError("Could not unambiguously select an official Windows MelonLoader asset")
        return candidates[0]

    @staticmethod
    def install_verified_archive(archive: Path, instance_path: Path) -> list[Path]:
        return safe_extract_zip(archive, instance_path)
