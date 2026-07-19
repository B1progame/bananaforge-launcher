"""GitHub API client with trusted upstream allowlist, ETag caching, and rate-limit state."""

from __future__ import annotations

from dataclasses import dataclass

import httpx

from launcher.constants import TRUSTED_GITHUB_REPOS
from launcher.models.core import ReleaseAsset


@dataclass(frozen=True)
class RateLimit:
    remaining: int | None
    reset_epoch: int | None


class GitHubClient:
    def __init__(self, token: str | None = None) -> None:
        self.headers = {"Accept": "application/vnd.github+json"}
        if token:
            self.headers["Authorization"] = f"Bearer {token}"
        self.etags: dict[str, tuple[str, object]] = {}
        self.rate_limit = RateLimit(None, None)

    def _update_rate_limit(self, response: httpx.Response) -> None:
        remaining = response.headers.get("x-ratelimit-remaining")
        reset = response.headers.get("x-ratelimit-reset")
        self.rate_limit = RateLimit(
            int(remaining) if remaining else None, int(reset) if reset else None
        )

    async def _get_json(self, url: str, client: httpx.AsyncClient) -> object:
        headers: dict[str, str] = {}
        cached = self.etags.get(url)
        if cached:
            headers["If-None-Match"] = cached[0]
        response = await client.get(url, headers=headers)
        self._update_rate_limit(response)
        if response.status_code == 304 and cached:
            return cached[1]
        response.raise_for_status()
        payload: object = response.json()
        if etag := response.headers.get("etag"):
            self.etags[url] = (etag, payload)
        return payload

    async def releases(
        self, repository: str, include_prereleases: bool = False
    ) -> list[dict[str, object]]:
        if repository not in TRUSTED_GITHUB_REPOS:
            raise ValueError("Untrusted release repository")
        url = f"https://api.github.com/repos/{repository}/releases?per_page=100"
        async with httpx.AsyncClient(timeout=20, headers=self.headers) as client:
            payload = await self._get_json(url, client)
        if not isinstance(payload, list):
            raise RuntimeError("Unexpected GitHub releases response")
        releases = [item for item in payload if isinstance(item, dict)]
        return (
            releases
            if include_prereleases
            else [item for item in releases if not item.get("prerelease")]
        )

    async def latest_assets(
        self, repository: str, include_prereleases: bool = False
    ) -> list[ReleaseAsset]:
        releases = await self.releases(repository, include_prereleases)
        if not releases:
            return []
        assets = releases[0].get("assets", [])
        if not isinstance(assets, list):
            return []
        return [
            ReleaseAsset(
                name=str(asset["name"]),
                url=str(asset["browser_download_url"]),
                size=int(asset["size"]),
            )
            for asset in assets
            if isinstance(asset, dict) and {"name", "browser_download_url", "size"} <= asset.keys()
        ]
