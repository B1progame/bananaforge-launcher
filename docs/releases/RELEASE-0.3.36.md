# BananaForge 0.3.36

## Avoid GitHub API limits for branch-tracked mods

- Checks and downloads tracked GitHub branch DLLs through their exact `raw.githubusercontent.com` path instead of calling the rate-limited Contents API on every update check.
- Calculates SHA-256 from the downloaded DLL, validates its Windows `MZ` header, and keeps the installed file if verification or downloading fails.
- Applies the same raw-file verification when tracking a branch source and when searching the BTD Mod Helper project catalog.
