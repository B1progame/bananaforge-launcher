# BananaForge 0.3.8

## Steam session and game crash diagnostics

- The launcher now checks Steam's active-user registry state when Windows permits it. If Steam is open but signed out, BananaForge opens Steam and stops before starting BTD6, with a clear sign-in message.
- Recent Unity crash reports are available in Game logs.
- If BTD6 exits unexpectedly, BananaForge shows a crash notification. Steam API authentication crashes receive a specific sign-in diagnosis.
- Existing game updates remain one-way: Steam source files can only update the managed copy.

## Verification

- `npm run check` passed.
- Installer build completed successfully. SHA-256 is in the adjacent `.sha256` file.
