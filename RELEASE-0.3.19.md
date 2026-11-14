# BananaForge 0.3.19

## Fixes

- Game compatibility errors can identify the mod assembly that emitted them and show an actionable Disable mod notification.
- Disabling a mod updates only its profile and managed game copy, while preserving the profile DLL.
- Launch buttons respect blocked compatibility launches and do not report a false success.
- Renderer errors are written to the launcher log, and a crashed UI renderer is reloaded automatically with bounded retries.
- Steam initialization failures are reported as Steam session problems instead of being blamed on a mod.
