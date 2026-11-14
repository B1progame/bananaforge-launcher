# BananaForge 0.3.37

## Keep self-updates working during GitHub API throttling

- Falls back to GitHub’s public Releases Atom feed when the unauthenticated Releases API returns an error, including HTTP 403 rate limits.
- Resolves the versioned installer and checksum from the release tag, then continues to verify SHA-256 before installation.
- Keeps the normal API path when it is available and reports both API and feed errors if neither source can be reached.
