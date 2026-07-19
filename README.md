# BananaForge Launcher

BananaForge Launcher is an unofficial, safety-first Windows manager for a separately managed BTD6 mod instance. It keeps the original installation untouched whenever a supported storefront permits an independent copy.

> Modding is unofficial. It can break after game updates, crash the game, or corrupt saves. Do not use gameplay-changing mods in public multiplayer, races, ranked events, leaderboards, or other competitive modes. This project does not bypass DRM, anti-cheat, ownership checks, account protections, or storefront authentication, and cannot guarantee account safety. Back up your data.

## Current scope

The repository includes a working guided launcher shell, Steam/Epic/manual discovery, secure download primitives, safe archive extraction, managed-copy validation/copying, profile staging, transactional recovery, official GitHub release clients, mod-catalogue URL integration, diagnostics redaction, bootstrap updater logic, packaging configuration, and automated tests. Store-managed installations are detected but not automatically modified: their independent-copy behavior requires per-version verification.

## Development

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e ".[ui,dev]"
bananaf
pytest
ruff check .
mypy launcher bootstrap
```

Without the optional Qt dependency, `python -m launcher.main --headless` runs the setup/state engine. Build scripts are in `scripts/`.

## Architecture

`launcher/services` contains I/O and policy; `launcher/models` validates persistent state; `launcher/ui` is a small QML shell; `bootstrap` is a separate verifier/updater. No component executes a downloaded file before a trusted hash is verified.

See [documentation](docs/architecture.md), [security policy](SECURITY.md), [storefront support](docs/storefront-support.md), and [research notes](docs/research.md).
