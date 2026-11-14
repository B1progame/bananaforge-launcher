# BananaForge 0.3.5

## One-way game updates

- Game refresh now copies only from the configured original game installation into the managed copy.
- Existing managed files are replaced only when the source file has a strictly newer modified timestamp. A different file size by itself never triggers a replacement.
- Missing files are added to the managed copy. Mod and user data folders remain excluded, and identical or nested source/destination folders are rejected.
- Added regression coverage for newer source files, older source files with different sizes, and overlapping roots.

## Verification

- `npm run check` passed.
- `npm test` passed (15 service tests).
- Installer build completed successfully. SHA-256 is in the adjacent `.sha256` file.
