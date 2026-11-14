# Development and releases

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e ".[ui,dev]"
python -m launcher.main
pytest
ruff check .
mypy launcher bootstrap
./scripts/build.ps1
```

## Electron desktop release

Keep `desktop/package.json` and `desktop/package-lock.json` on the same semantic version. Run `npm ci`, `npm run check`, and `npm run pack` from `desktop/`; then run `./scripts/build-desktop.ps1` from the repository root to compile the Windows installer and checksum.

Push a matching `desktop-vX.Y.Z` tag (for example `desktop-v0.3.29`). The `desktop-release.yml` workflow validates the tag against the package version, builds the Windows app and installer, writes a SHA-256 sidecar, and publishes the installer and checksum to GitHub Releases. The desktop app checks only stable releases matching this tag and asset convention.

## Legacy Python bootstrap release

The separate `release.yml` workflow handles the bootstrap distribution. It uses `vX.Y.Z` tags, builds `BananaForgeLauncher.zip`, creates `release-manifest.json`, and opens a draft GitHub Release. Signing is intentionally optional.

For a local manifest, run:

```powershell
python scripts/generate_release_manifest.py BananaForgeLauncher.zip --version 0.1.0 --repository B1progame/bananaforge-launcher
```
