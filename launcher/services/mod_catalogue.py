"""Official-mod-browser-compatible catalogue provider."""

from __future__ import annotations

from typing import Protocol
from urllib.parse import quote_plus

import httpx

from launcher.models.mod import CatalogueMod, InstalledMod, ModFilters

OFFICIAL_BROWSER = "https://gurrenm3.github.io/BTD-Mod-Helper/mod-browser?search="


def official_browser_url(query: str) -> str:
    return OFFICIAL_BROWSER + quote_plus(query)


class ModCatalogueProvider(Protocol):
    async def search_mods(self, query: str, filters: ModFilters) -> list[CatalogueMod]: ...
    async def get_mod(self, mod_id: str) -> CatalogueMod: ...
    async def resolve_download(self, mod_id: str, version: str | None = None) -> str: ...
    async def check_update(self, installed_mod: InstalledMod) -> bool: ...


class BtdModHelperBrowserProvider:
    """Uses GitHub structured data, not fragile rendered HTML scraping."""

    async def search_mods(self, query: str, filters: ModFilters) -> list[CatalogueMod]:
        expression = f"{query} topic:btd6 topic:melonloader".strip()
        if filters.author:
            expression += f" user:{filters.author}"
        async with httpx.AsyncClient(
            timeout=20, headers={"Accept": "application/vnd.github+json"}
        ) as client:
            response = await client.get(
                "https://api.github.com/search/repositories",
                params={
                    "q": expression,
                    "sort": "updated",
                    "order": "desc",
                    "page": filters.page,
                    "per_page": filters.page_size,
                },
            )
            response.raise_for_status()
        return [
            CatalogueMod(
                id=item["full_name"],
                name=item["name"],
                author=item["owner"]["login"],
                description=item.get("description") or "",
                repository=item["full_name"],
                tags=item.get("topics") or [],
            )
            for item in response.json().get("items", [])
        ]

    async def get_mod(self, mod_id: str) -> CatalogueMod:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.get(f"https://api.github.com/repos/{mod_id}")
            response.raise_for_status()
        item = response.json()
        return CatalogueMod(
            id=item["full_name"],
            name=item["name"],
            author=item["owner"]["login"],
            description=item.get("description") or "",
            repository=item["full_name"],
            tags=item.get("topics") or [],
        )

    async def resolve_download(self, mod_id: str, version: str | None = None) -> str:
        suffix = f"/tags/{version}" if version else "/latest"
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.get(f"https://api.github.com/repos/{mod_id}/releases{suffix}")
            response.raise_for_status()
        assets = [
            item
            for item in response.json().get("assets", [])
            if item["name"].lower().endswith(".dll")
        ]
        if len(assets) != 1:
            raise ValueError(
                "Mod release has zero or multiple DLL assets; user selection is required"
            )
        return str(assets[0]["browser_download_url"])

    async def check_update(self, installed_mod: InstalledMod) -> bool:
        if not installed_mod.repository:
            return False
        current = await self.get_mod(installed_mod.repository)
        return current.version is not None and current.version != installed_mod.version
