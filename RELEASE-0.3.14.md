# BananaForge 0.3.14

- Fixed a false up-to-date result when tracking an installed mod against the latest release; unknown installed versions are now verified against the downloaded DLL hash.
- Every tracked GitHub mod now checks for a newer BTD6 Thunderstore package linked to that repository, so package releases are found even when the GitHub Releases page is behind.
- Automatic source discovery now checks the BTD6 Thunderstore catalog by installed DLL name and searches GitHub by exact project name for other installed mods.
- Thunderstore package downloads are checked against the expected upstream project and DLL name, extracted from ZIP, and validated as a Windows DLL before replacing the installed mod.
- BTD6 v57's Ultimate Crosspathing 1.8.4 release can now be found even while GitHub Releases still points to 1.8.3.
- Updated the recommended MelonLoader installer to the upstream v0.7.3 requirement for the current Ultimate Crosspathing package.
