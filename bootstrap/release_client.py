from __future__ import annotations

import httpx

from launcher.models.core import ReleaseManifest


class BootstrapReleaseClient:
    def __init__(self, repository: str) -> None:
        self.repository = repository

    async def latest_manifest(self) -> ReleaseManifest:
        url = f"https://api.github.com/repos/{self.repository}/releases/latest"
        async with httpx.AsyncClient(
            timeout=20, headers={"Accept": "application/vnd.github+json"}
        ) as client:
            release = await client.get(url)
            release.raise_for_status()
            assets = release.json().get("assets", [])
            manifest = next(
                (asset for asset in assets if asset["name"] == "release-manifest.json"), None
            )
            if manifest is None:
                raise RuntimeError("Release does not publish a signed release manifest")
            response = await client.get(manifest["browser_download_url"])
            response.raise_for_status()
        return ReleaseManifest.model_validate_json(response.text)
