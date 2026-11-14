# BananaForge 0.3.10

- Added real mod update-source discovery through GitHub and Modrinth project search.
- Search results are offered only when the linked GitHub repository's latest release contains a DLL with the exact installed filename.
- Selecting a result verifies the release again before tracking it; automatic updates then use that pinned repository and asset.
- Manual GitHub project URLs now receive the same release-asset verification before they can be tracked.
- Reworked the source dialog to show verified projects and release versions, with a manual URL option for authors that search cannot find.
