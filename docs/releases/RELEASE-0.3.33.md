# BananaForge 0.3.33

## Visible, reliable self-updates

- Keeps a branded progress window visible while the verified installer replaces BananaForge.
- Waits for the current app to close before starting the installer, avoiding the timing race that could leave files locked.
- Shows honest indeterminate progress while Windows Installer runs; download progress and checksum verification remain visible in the app before handoff.
- Reports installer failures with retry and reopen actions, then relaunches BananaForge after a successful update.
