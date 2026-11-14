# BananaForge 0.3.17

- Diagnose missing-method game crashes from MelonLoader logs and identify the exact loaded mod DLL by its hash.
- Before the next launch, automatically disable a matching incompatible DLL in the active profile, preserve the original profile file, and let the normal Steam-to-managed-copy sync exclude it.
- After a crash, disable the identified mod and refresh the profile UI so the remaining enabled mods can be tried safely.
