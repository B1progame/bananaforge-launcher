# BananaForge 0.3.12

- Added a mod-name search field so projects can be found when their display name differs from the installed DLL filename.
- Source discovery now reads BTD Mod Helper `DllName` metadata and accepts the declared release DLL even when its filename differs from the installed DLL.
- Applied the same metadata-aware asset matching to manually tracked and recognized-source mods.
- Added release/search caching and limited candidate checks to reduce GitHub API quota exhaustion.
- Search failures now distinguish missing repositories, missing release assets, and GitHub rate limits instead of hiding release lookup errors.
- Added Ultimate Crosspathing as a recognized update source.
