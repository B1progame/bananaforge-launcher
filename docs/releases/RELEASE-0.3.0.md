# BananaForge 0.3.0

Installer: `desktop/dist/BananaForge-Setup-0.3.0.exe` (Windows x64).

## Setup

Choose the application directory, workspace directory, and optional packages in the installer. On first launch, review the installation plan in **Install & setup**. Choose the original BTD6 executable, a separate managed-game destination, and a download directory. The managed copy uses your installed game files; it does not download BTD6.

Select **Managed BTD6 copy**, **MelonLoader installer**, and/or **BTD Mod Helper**. Downloads come from the authors' GitHub releases. After downloading MelonLoader, use **Open MelonLoader installer** and select the managed `BloonsTD6.exe` to finish runtime installation. Install Mod Helper into the profile you intend to play. Steam must be running and signed in.

## Profiles and logs

Profiles support descriptions, colors, search, sorting, duplication, DLL enable/disable, and `.bfpack` export/import. Exported packages contain the profile's DLLs, so share only files you have permission to distribute.

**Game logs** displays available MelonLoader, Unity Player, and launcher logs. It supports live updates, text and severity filters, pause, follow, copy, full-log export, and opening the source location. The display reads a bounded tail to keep large logs responsive.

The structure was informed by Modrinth's profile/content workflow and [instance logs](https://support.modrinth.com/en/articles/9005261-minecraft-logs).

## Fixes and checks

- Legacy instance paths pointing at `BloonsTD6.exe` are normalized to their containing folder, fixing the reported EEXIST error.
- Managed copies reject overlapping original-game paths, use staging and atomic publication, check free space, and support cancellation.
- The MelonLoader installer is fetched from `LavaGang/MelonLoader.Installer`; the previous runtime repository did not provide the expected installer asset.
- Package downloads use exact assets, bounded sizes, partial files, executable headers, and GitHub SHA-256 verification when provided.
- Profile imports validate filenames, limits, hashes, and DLL headers.
- Launcher errors are recorded and shown to the user; interrupted setup/download state is handled.
- GSAP page motion respects reduced-motion preferences.

Validation: JavaScript syntax checks, eight backend/service tests, and ten Electron UI scenarios passed. Download integration uses deterministic official-source fixtures. Real BTD6 execution, live release downloads, and MelonLoader runtime compatibility were not exercised by these tests.

Build with `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-desktop.ps1`. Requires installed desktop dependencies and Inno Setup 6.
