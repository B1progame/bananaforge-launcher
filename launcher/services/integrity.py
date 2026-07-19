from __future__ import annotations
import hashlib
import os
from pathlib import Path
from zipfile import ZipFile


class IntegrityError(ValueError):
    pass


def sha256_file(path: Path, chunk_size: int = 1024 * 1024) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while block := handle.read(chunk_size):
            digest.update(block)
    return digest.hexdigest()


def verify_sha256(path: Path, expected: str) -> None:
    if sha256_file(path).lower() != expected.lower():
        raise IntegrityError("SHA-256 verification failed")


def safe_extract_zip(
    archive: Path, destination: Path, limit_bytes: int = 2_000_000_000
) -> list[Path]:
    destination = destination.resolve()
    extracted: list[Path] = []
    with ZipFile(archive) as bundle:
        total = sum(item.file_size for item in bundle.infolist())
        if total > limit_bytes:
            raise IntegrityError("Archive exceeds extraction limit")
        for item in bundle.infolist():
            target = (destination / item.filename).resolve()
            if os.path.commonpath([destination, target]) != str(destination):
                raise IntegrityError("Unsafe archive path")
            if item.is_dir():
                target.mkdir(parents=True, exist_ok=True)
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            with bundle.open(item) as src, target.open("wb") as dst:
                dst.write(src.read())
            extracted.append(target)
    return extracted
