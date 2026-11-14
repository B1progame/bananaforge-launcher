# BananaForge 0.3.7

## Game launch visibility and startup reporting

- Launch BTD6 and the MelonLoader installer as visible Windows desktop processes.
- Include BTD6's Steam app ID in the game process environment, including when launching a managed copy.
- Wait for Windows to detect BTD6 before reporting a successful launch. If the process exits during startup or never appears, show an actionable error instead of leaving the launcher stuck at “Game running.”

## Verification

- `npm run check` passed.
- Installer build completed successfully. SHA-256 is in the adjacent `.sha256` file.
