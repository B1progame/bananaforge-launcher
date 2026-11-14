# Updates and synchronization

Updates are independent: BananaForge desktop releases, Steam-managed BTD6 source changes, MelonLoader, BTD Mod Helper, mods, and compatibility data. Compatibility remains unknown unless verified data says otherwise. BananaForge does not automatically install an incompatible mod update.

The Windows desktop app checks published `desktop-vX.Y.Z` GitHub Releases at startup and every six hours when automatic updates are enabled. With automatic updates off, use **Check for updates** in Settings; BananaForge shows an **Install update** action when a newer version is found. Downloads must include the expected versioned setup file and a matching SHA-256 checksum before installation. Automatic installs restart BananaForge; manual checks never install without the explicit action. A top-right toast reports available, downloading, and installation states. If the release or checksum is missing or invalid, the current app stays installed.

To publish a desktop release, set `desktop/package.json` to the new semantic version, commit and push the change, then push a matching `desktop-vX.Y.Z` tag. The desktop release workflow verifies the tag matches the package version, builds the Windows app and installer, generates a SHA-256 sidecar, and publishes both files to GitHub Releases. BananaForge reads those releases from `B1progame/bananaforge-launcher`.

Steam remains responsible for downloading BTD6 updates. When the Steam app manifest reports a different build, BananaForge syncs changed Steam files into the configured managed copy after the game closes. The sync is one-way (Steam to managed copy), preserves the profile mods, MelonLoader, plugins, and user data folders, and never writes into the Steam installation. Removed game files are retained in the managed copy so mod-loader files are not deleted automatically.

Before a game-source sync, back up the managed instance and preserve managed mod configuration. Use recovery journals and one-click rollback if activation fails.
