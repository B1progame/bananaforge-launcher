"""Async, bounded, HTTPS-only downloads with progress and cancellation."""

from __future__ import annotations

import asyncio
import os
import time
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

import httpx

from launcher.services.integrity import IntegrityError, verify_sha256


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
        self,
        root: Path,
        trusted_hosts: set[str],
        maximum_size: int = 2_000_000_000,
        retries: int = 3,
    ) -> None:
        self.root, self.trusted_hosts, self.maximum_size, self.retries = (
            root,
            trusted_hosts,
            maximum_size,
            retries,
        )

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
        downloaded, started = (
            temporary.stat().st_size if temporary.exists() else 0,
            time.monotonic(),
        )
        for attempt in range(self.retries + 1):
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(30, read=60), follow_redirects=True
            ) as client:
                try:
                    headers = {"Range": f"bytes={downloaded}-"} if downloaded else {}
                    async with client.stream("GET", url, headers=headers) as response:
                        if downloaded and response.status_code == 200:
                            downloaded = 0
                        response.raise_for_status()
                        remaining = (
                            int(response.headers["content-length"])
                            if response.headers.get("content-length")
                            else None
                        )
                        total = downloaded + remaining if remaining is not None else None
                        if total is not None and total > self.maximum_size:
                            raise DownloadError("Download exceeds configured size limit")
                        with temporary.open("ab" if downloaded else "wb") as output:
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
                except asyncio.CancelledError:
                    raise
                except (httpx.HTTPError, OSError) as error:
                    if attempt >= self.retries:
                        raise DownloadError(
                            f"Download failed after {attempt + 1} attempts: {error}"
                        ) from error
                    await asyncio.sleep(2**attempt)
                except (DownloadError, IntegrityError):
                    temporary.unlink(missing_ok=True)
                    raise
        raise DownloadError("Download did not complete")
