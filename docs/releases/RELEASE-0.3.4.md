# BananaForge 0.3.4

## Game launch and file sync

- BananaForge now checks Windows for an already-running BloonsTD6 process, including games started through Steam. The launcher shows that state and blocks profile or game-file changes while the game is open, instead of attempting a write that fails with `EBUSY`.
- Game updates are staged beside the destination and renamed into place. A locked file is left intact and produces a clear close-the-game message.

## Mod updates

- Existing DLLs can now be tracked from a GitHub project or release page. BananaForge checks for a latest-release DLL whose filename exactly matches the installed file.
- Added one-click source discovery for Ascended Upgrades, AutoNudge, BTD Mod Helper, Copy/Paste Towers, and Faster Forward. BananaForge confirms the named DLL exists in the latest release before saving the source.
- Update status reports the current mod, progress, skipped count, and whether updated files must wait for the game to close before syncing.
- Direct downloads still use checksum validation; manually linked sources are checked against the local DLL hash and GitHub's release digest when available.

## Verification

- `npm run check` passed.
- `npm test` passed (13 service tests).
- `npm run test:ui` passed, including entering a project URL for an existing DLL, enabling updates, and verifying both tracked mods update.
- Installer: `desktop/dist/BananaForge-Setup-0.3.4.exe`; SHA-256 is in the adjacent `.sha256` file.

The test game and release files are synthetic fixtures. No third-party DLL or the real game was executed by the tests.
