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

Tag a version beginning with `v`. The release workflow builds both executables, creates `BananaForgeLauncher.zip`, computes its SHA-256, writes `release-manifest.json`, uploads artifacts, and opens a draft GitHub Release. Signing is intentionally optional.

For a local manifest, run:

```powershell
python scripts/generate_release_manifest.py BananaForgeLauncher.zip --version 0.1.0 --repository B1progame/bananaforge-launcher
```
