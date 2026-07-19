"""Async, bounded, HTTPS-only downloads with progress and cancellation."""

from __future__ import annotations

import asyncio
import os
import time
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

import httpx

from launcher.services.integrity import verify_sha256


class DownloadError(RuntimeError):
    pass


@dataclass(frozen=True)
class DownloadProgress:
    filename: str
    downloaded: int
    total: int | None
    bytes_per_second: float


class DownloadManager:
    def __init__(
        self, root: Path, trusted_hosts: set[str], maximum_size: int = 2_000_000_000
    ) -> None:
        self.root, self.trusted_hosts, self.maximum_size = root, trusted_hosts, maximum_size

    async def download(
        self,
        url: str,
        filename: str,
        expected_sha256: str | None,
        cancel: asyncio.Event,
        progress: asyncio.Queue[DownloadProgress] | None = None,
    ) -> Path:
        parsed = urlparse(url)
        if parsed.scheme != "https" or parsed.hostname not in self.trusted_hosts:
            raise DownloadError("Download source is not an approved HTTPS host")
        if Path(filename).name != filename:
            raise DownloadError("Unsafe download filename")
        self.root.mkdir(parents=True, exist_ok=True)
        destination = self.root / filename
        temporary = destination.with_suffix(destination.suffix + ".part")
        downloaded, started = 0, time.monotonic()
        try:
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(30, read=60), follow_redirects=True
            ) as client:
                async with client.stream("GET", url) as response:
                    response.raise_for_status()
                    total = (
                        int(response.headers["content-length"])
                        if response.headers.get("content-length")
                        else None
                    )
                    if total is not None and total > self.maximum_size:
                        raise DownloadError("Download exceeds configured size limit")
                    with temporary.open("wb") as output:
                        async for chunk in response.aiter_bytes(128 * 1024):
                            if cancel.is_set():
                                raise asyncio.CancelledError()
                            downloaded += len(chunk)
                            if downloaded > self.maximum_size:
                                raise DownloadError("Download exceeds configured size limit")
                            output.write(chunk)
                            if progress is not None:
                                elapsed = max(time.monotonic() - started, 0.001)
                                await progress.put(
                                    DownloadProgress(
                                        filename, downloaded, total, downloaded / elapsed
                                    )
                                )
            if expected_sha256:
                verify_sha256(temporary, expected_sha256)
            os.replace(temporary, destination)
            return destination
        except BaseException:
            temporary.unlink(missing_ok=True)
            raise
