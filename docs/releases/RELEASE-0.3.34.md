# BananaForge 0.3.34

## Track GitHub branch mods

- Lets users track a mod DLL from a GitHub repository folder even when its author does not publish GitHub Releases.
- Searches the BTD Mod Helper project catalog before broad GitHub searches, then verifies the selected branch DLL before tracking it.
- Checks branch updates against GitHub’s exact blob hash, downloads only the verified DLL, validates its Windows DLL signature, and preserves the current file if verification fails.
- Explains release files versus branch files in the source picker and accepts GitHub `tree` and `blob` links.
