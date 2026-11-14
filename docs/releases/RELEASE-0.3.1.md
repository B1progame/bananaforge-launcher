# BananaForge 0.3.1

## Design

Every main page now shares consistent graphite surfaces, readable typography, restrained amber actions, compact spacing, and matching navigation icons. The home screen shows the active profile and actual game/runtime readiness. Profile cards are smaller and easier to scan. Settings, Downloads, the embedded browser, and the native Create Profile dialog match the same design.

GSAP transitions keep content visible during fast navigation and respect reduced-motion preferences. All main pages are checked at the minimum 1120 × 700 window size.

## Functional changes

- Game launches are locked while startup is in progress, preventing duplicate launches and profile edits during synchronization.
- Profiles with enabled mods require a managed game and detected MelonLoader files. The UI guides incomplete setups to the setup page; the backend also validates these requirements.
- Installed Mods supports enable/disable and displays the actual state, matching the profile content page.
- Browser downloads with identical names use separate directories. Active downloads can be cancelled, and interrupted/cancelled states are shown accurately.
- Open Downloads Folder opens the configured directory even when no files have been downloaded.
- Unsaved settings survive state refreshes; native folder selections also mark settings as edited.
- Corrupt profile entries are backed up before recovery instead of preventing startup.
- Setup protects game/profile mutations while packages are being installed. Package cancellation is checked immediately before publication.
- The browser displays useful load errors with retry and external-browser actions. Browser navigation accepts HTTP/HTTPS URLs.
- Game update synchronization preserves the Plugins directory.

## Validation and limits

Eight backend/service tests pass. Thirteen Electron regression scenarios cover profiles, both mod-control pages, preflight and lock recovery, settings persistence, live logs, chosen installation folders, package download integration, duplicate browser downloads, cancellation, reduced motion, and layout on every main page.

QA uses an isolated workspace and synthetic game files; download responses are deterministic fixtures. It does not execute downloaded installers or the real game. Real BTD6/Steam gameplay and MelonLoader version compatibility remain unverified. MelonLoader runtime installation still finishes in the official installer, where the managed BloonsTD6.exe must be selected.

Installer: `desktop/dist/BananaForge-Setup-0.3.1.exe`. SHA-256 is recorded in the adjacent `.sha256` file. Build with `scripts/build-desktop.ps1`.
