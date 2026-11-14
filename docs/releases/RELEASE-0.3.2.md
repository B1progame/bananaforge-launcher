# BananaForge 0.3.2

## Mod update setting

- Added an opt-in **Automatically update tracked mods** setting. When enabled, BananaForge checks on startup, after profile changes, and before game launch. You can also request a check from Settings.
- Checks use the mod's latest GitHub release and only track DLLs installed from a direct, tagged GitHub release download. Manually added and imported mods are left alone.
- A new DLL must match the expected release asset, GitHub checksum when published, and Windows PE signature. It is staged before replacement; a failed download or verification leaves the installed mod in place.
- Disabled mods are skipped. The Settings page and profile contents show check and update results, and errors are recorded in the launcher log.
- Each profile is checked at most once every six hours automatically. The manual check button bypasses this interval.

## Verification

- `npm run check` passed.
- `npm test` passed (11 service tests), including update URL validation, newer/current release handling, and checksum failure protection.
- `npm run test:ui` passed, including enabling automatic checks and verifying a tracked mod was updated from a deterministic fixture.
- The Electron installer is built as `desktop/dist/BananaForge-Setup-0.3.2.exe`; its SHA-256 is written beside it.

The UI test uses synthetic release data and a synthetic game folder. It does not run the real game or validate compatibility of third-party releases.

