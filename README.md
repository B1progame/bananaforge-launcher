# BananaForge

<p align="center">
  <img src="launcher/assets/branding/hero.svg" alt="BananaForge — your mods, your instance" width="100%">
</p>

<p align="center">
  <a href="https://github.com/B1progame/bananaforge-launcher/releases"><img alt="Latest desktop release" src="https://img.shields.io/github/v/release/B1progame/bananaforge-launcher?filter=desktop-v*&amp;display_name=tag&amp;label=desktop%20release"></a>
  <a href="https://github.com/B1progame/bananaforge-launcher/actions/workflows/desktop-release.yml"><img alt="Desktop release build" src="https://img.shields.io/github/actions/workflow/status/B1progame/bananaforge-launcher/desktop-release.yml?event=push&amp;label=release%20build"></a>
  <a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-f0b84b"></a>
  <img alt="Windows desktop app" src="https://img.shields.io/badge/platform-Windows-6478e8">
</p>

<p align="center">
  <strong>A tidy home for your BTD6 mod profiles.</strong><br>
  Keep collections separate, manage updates, and launch through a dedicated game copy.
</p>

<p align="center">
  <a href="https://github.com/B1progame/bananaforge-launcher/releases/latest"><img alt="Download the latest installer" src="https://img.shields.io/badge/Download-latest%20installer-f0b84b?style=for-the-badge&amp;logo=windows&amp;logoColor=18212a"></a>
  · <a href="#get-started">Get started</a>
  · <a href="docs/troubleshooting.md">Troubleshooting</a>
</p>

> **Unofficial community software.** BananaForge is not affiliated with Ninja Kiwi, Valve, Steam, or MelonLoader. Mods can break after game updates or cause crashes. Back up your saves and avoid gameplay-changing mods in races, ranked events, public multiplayer, and other competitive modes. BananaForge does not bypass DRM, ownership checks, or storefront authentication.

## Your collection, organized

| Keep profiles separate | Find and manage mods | Understand each run |
| --- | --- | --- |
| Create collections for different play styles. Import and export profile packages, then enable only the DLLs you want. | Browse mods or add a DLL, ZIP, GitHub project, release, folder, or direct download link. Review the source before installing. | Read game and MelonLoader logs, spot reported mod failures, and disable a problematic mod from its notification. |

BananaForge also checks known mod sources, can automatically update tracked mods, and verifies its app installer against the release checksum. You choose whether app updates install automatically in Settings.

## Get started

1. **[Download the Windows installer](https://github.com/B1progame/bananaforge-launcher/releases/latest).** The release includes a SHA-256 checksum beside the installer.
2. **Choose your game locations.** In **Install & setup**, select the original BTD6 installation and a separate managed location.
3. **Set up the managed copy.** Install the required loader there, then create or select a profile and add mods.
4. **Launch from BananaForge.** The selected profile is staged into the managed copy for that run.

### Steam stays the source

When Steam updates BTD6, BananaForge can sync those game changes **from Steam into the managed copy** after the game closes. Sync never copies the managed game back into Steam. Keep enough free disk space for the second copy.

## Updates you can inspect

- **Mods:** Check the active profile or turn on automatic updates for tracked sources. Unknown/manual DLLs stay identified as manual until you connect a source.
- **BananaForge:** Check for releases at startup and every six hours. With automatic app updates enabled, a verified release can install and relaunch. Otherwise, review the available update in the top-right notice and choose **Install update**.
- **BTD6:** Steam downloads the game update; BananaForge syncs it into the managed copy.

<p align="center">
  <img src="docs/images/desktop-updates.svg" alt="BananaForge desktop release and update flow" width="100%">
</p>

For details, see [update behavior](docs/updates.md) and [installation](docs/installation.md).

## Experimental: btd6ai

BananaForge can install the [btd6ai project](https://github.com/Timotheeee/btd6_mods/tree/master/btd6ai) directly from its GitHub link. Treat it as experimental: check its current BTD6 compatibility and use a separate practice profile before enabling it.

## Build from source

Requires Windows, Node.js 22 or later, and Inno Setup 6 to create the installer.

```powershell
cd desktop
npm ci
npm run check
npm start
```

To build the packaged app and Windows installer from the repository root:

```powershell
./scripts/build-desktop.ps1
```

## Guides

- [First run and safety](docs/first-run.md)
- [Installation](docs/installation.md)
- [Profiles and mods](docs/profiles.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Development and releases](docs/development.md)
- [Archived release notes](docs/releases/README.md)
- [Security policy](SECURITY.md)
- [Contributing](CONTRIBUTING.md)

## License

BananaForge is available under the [MIT License](LICENSE). BTD6, Steam, and MelonLoader remain the property of their respective owners.
