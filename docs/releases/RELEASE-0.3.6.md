# BananaForge 0.3.6

## Game process controls

- Profile cards now show a Close BTD6 button while the game is detected as running.
- The button asks Windows to close the game normally and waits up to four seconds for it to exit. It does not force-terminate the game.
- If the game stays open, BananaForge explains that it must be saved and closed from its window.

## Verification

- `npm run check` passed.
- Installer build completed successfully. SHA-256 is in the adjacent `.sha256` file.
