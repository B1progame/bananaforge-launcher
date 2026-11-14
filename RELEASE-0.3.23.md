# BananaForge 0.3.23

## Game log and storage fixes

- Cleans managed MelonLoader logs older than seven days at startup and periodically while the game is closed, keeping the three newest logs per log folder.
- Removes a closed game's single log when it grows beyond 512 MiB, preventing a repeated exception from consuming multiple gigabytes.
- Applies the same log retention to the managed MelonLoader rollback snapshots without touching their loader binaries or the Steam game installation.
- Reads large logs in bounded windows so mod compatibility errors can still be attributed to the loaded DLL without loading a multi-gigabyte file into memory.
- Watches a running BananaForge-launched game for repeated tracked mod errors and offers a save-and-close action before disabling the implicated mod.
