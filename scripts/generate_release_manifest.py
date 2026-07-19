"""Generate the SHA-256 verified bootstrap manifest for a Windows release ZIP."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from packaging.version import Version

from launcher.services.integrity import sha256_file


def build_manifest(package: Path, version_input: str, repository: str) -> dict[str, object]:
    version = str(Version(version_input.removeprefix("v")))
    if not package.is_file() or package.suffix.lower() != ".zip":
        raise ValueError("Package must be an existing ZIP file")
    tag = f"v{version}"
    return {
        "schema_version": 1,
        "version": version,
        "minimum_bootstrap_version": "0.1.0",
        "platform": "windows",
        "architecture": "x86_64",
        "download_url": f"https://github.com/{repository}/releases/download/{tag}/{package.name}",
        "sha256": sha256_file(package),
        "signature_url": None,
        "size": package.stat().st_size,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("package", type=Path)
    parser.add_argument("--version", required=True)
    parser.add_argument("--repository", required=True)
    parser.add_argument("--output", type=Path, default=Path("release-manifest.json"))
    args = parser.parse_args()
    payload = build_manifest(args.package, args.version, args.repository)
    args.output.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
