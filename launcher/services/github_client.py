from __future__ import annotations
import httpx
from launcher.constants import TRUSTED_GITHUB_REPOS
from launcher.models.core import ReleaseAsset


class GitHubClient:
    def __init__(self, token: str | None = None) -> None:
        self.headers = {
            "Accept": "application/vnd.github+json",
            **({"Authorization": f"Bearer {token}"} if token else {}),
        }

    async def latest_assets(self, repository: str) -> list[ReleaseAsset]:
        if repository not in TRUSTED_GITHUB_REPOS:
            raise ValueError("Untrusted release repository")
        async with httpx.AsyncClient(timeout=20, headers=self.headers) as client:
            response = await client.get(
                f"https://api.github.com/repos/{repository}/releases/latest"
            )
            response.raise_for_status()
        return [
            ReleaseAsset(name=a["name"], url=a["browser_download_url"], size=a["size"])
            for a in response.json().get("assets", [])
        ]
