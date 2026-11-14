# BananaForge 0.3.24

## Mod runtime diagnostics

- Recognizes both MelonLoader log filename formats, including the `YY-M-D` format written by the installed v0.7.3 build.
- Shows per-mod evidence from the most recent BananaForge launch: disabled, loaded, logged an error, changed since launch, or not verified.
- Records the active profile and SHA-256 of enabled mods when launching, so later checks compare the same files and profile.
- Labels older logs as historical when their profile cannot be determined; release metadata alone is not treated as proof that a mod works.
- Shows the runtime evidence and error counts on Home, Installed Mods, and profile details.
- Explicit update checks and launch-time checks refresh GitHub release metadata so cached versions cannot hide a new release; background checks continue to use the short cache.
- Keeps the completed update result visible instead of replacing it immediately with the generic automatic-update setting.
