from __future__ import annotations
from pathlib import Path
import httpx
from launcher.services.integrity import verify_sha256


async def download_verified(
    url: str, destination: Path, expected_sha256: str, allowed_prefix: str
) -> Path:
    if not url.startswith(allowed_prefix):
        raise ValueError("Update URL is outside the trusted release repository")
    destination.parent.mkdir(parents=True, exist_ok=True)
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        response = await client.get(url)
        response.raise_for_status()
        destination.write_bytes(response.content)
    verify_sha256(destination, expected_sha256)
    return destination
