from __future__ import annotations
import argparse
from pathlib import Path
from launcher.models.core import ReleaseManifest


def main() -> int:
    parser = argparse.ArgumentParser(description="BananaForge verified bootstrap")
    parser.add_argument("manifest", type=Path)
    args = parser.parse_args()
    manifest = ReleaseManifest.model_validate_json(args.manifest.read_text())
    print(f"Verified manifest schema for {manifest.version}; download is intentionally explicit.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
