"""Official-mod-browser-compatible catalogue provider."""

from __future__ import annotations

import json
from pathlib import Path
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

    def __init__(self, cache_path: Path | None = None) -> None:
        self.cache_path = cache_path

    def _cache_write(self, mods: list[CatalogueMod]) -> None:
        if self.cache_path is None:
            return
        self.cache_path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.cache_path.with_suffix(".tmp")
        temporary.write_text(
            json.dumps([item.model_dump(mode="json") for item in mods]), encoding="utf-8"
        )
        temporary.replace(self.cache_path)

    def _cache_read(self, query: str, filters: ModFilters) -> list[CatalogueMod]:
        if self.cache_path is None:
            return []
        try:
            items = [
                CatalogueMod.model_validate(item)
                for item in json.loads(self.cache_path.read_text(encoding="utf-8"))
            ]
        except (OSError, json.JSONDecodeError, ValueError):
            return []
        selected = [
            item
            for item in items
            if query.lower() in item.name.lower() or query.lower() in item.description.lower()
        ]
        if filters.author:
            selected = [item for item in selected if item.author == filters.author]
        if filters.tags:
            selected = [item for item in selected if set(filters.tags) <= set(item.tags)]
        start = (filters.page - 1) * filters.page_size
        return selected[start : start + filters.page_size]

    async def search_mods(self, query: str, filters: ModFilters) -> list[CatalogueMod]:
        expression = f"{query} topic:btd6 topic:melonloader".strip()
        if filters.author:
            expression += f" user:{filters.author}"
        try:
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
            mods = [
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
            self._cache_write(mods)
            return mods
        except httpx.HTTPError:
            return self._cache_read(query, filters)

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
