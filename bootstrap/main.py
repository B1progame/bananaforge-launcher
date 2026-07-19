from __future__ import annotations

import argparse
import asyncio
from pathlib import Path

from bootstrap.orchestrator import BootstrapOrchestrator
from launcher.models.core import ReleaseManifest


def main() -> int:
    parser = argparse.ArgumentParser(description="BananaForge verified bootstrap")
    parser.add_argument("manifest", type=Path, nargs="?")
    parser.add_argument("--repository", default="B1progame/bananaforge-launcher")
    parser.add_argument("--install-root", type=Path, default=Path.cwd())
    parser.add_argument(
        "--install-confirmed",
        action="store_true",
        help="Perform the verified download after an interactive confirmation",
    )
    args = parser.parse_args()
    orchestrator = BootstrapOrchestrator(args.repository, args.install_root)
    manifest = (
        ReleaseManifest.model_validate_json(args.manifest.read_text())
        if args.manifest
        else asyncio.run(orchestrator.check())
    )
    print(f"Release {manifest.version}: {manifest.size:,} bytes. Download awaits confirmation.")
    if args.install_confirmed:
        result = asyncio.run(orchestrator.install_confirmed(manifest, asyncio.Event()))
        print(f"Activated verified launcher at {result.active_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
