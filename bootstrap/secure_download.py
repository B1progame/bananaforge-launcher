from __future__ import annotations

import asyncio
from pathlib import Path

import httpx

from launcher.services.integrity import verify_sha256


async def download_verified(
    url: str,
    destination: Path,
    expected_sha256: str,
    allowed_prefix: str,
    cancel: asyncio.Event | None = None,
) -> Path:
    if not url.startswith(allowed_prefix):
        raise ValueError("Update URL is outside the trusted release repository")
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(destination.suffix + ".part")
    try:
        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            async with client.stream("GET", url) as response:
                response.raise_for_status()
                with temporary.open("wb") as output:
                    async for chunk in response.aiter_bytes(128 * 1024):
                        if cancel is not None and cancel.is_set():
                            raise asyncio.CancelledError()
                        output.write(chunk)
        verify_sha256(temporary, expected_sha256)
        temporary.replace(destination)
        return destination
    except BaseException:
        temporary.unlink(missing_ok=True)
        raise
