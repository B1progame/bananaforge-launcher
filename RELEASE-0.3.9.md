# BananaForge 0.3.9

## Automatic mod updates

- Automatic checks now run at BananaForge startup and every six hours while it stays open, as well as before game launch.
- Known projects, including BTD Mod Helper, are discovered and tracked automatically when the matching DLL is installed.
- Tracked mods update in the background, including disabled mods. Unknown manually installed DLLs are reported as needing a release source.
- Updates can download while BTD6 is open. BananaForge keeps them in the profile and waits to sync the managed game folder until BTD6 closes.
- Failed updates no longer delay retries for six hours; newly installed mods trigger an immediate check.

## Verification

- `npm run check` passed.
- Installer build completed successfully. SHA-256 is in the adjacent `.sha256` file.
