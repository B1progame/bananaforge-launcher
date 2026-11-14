# BananaForge 0.3.13

- Release checks now fall back to GitHub's public release feed when the REST API quota is exhausted.
- The fallback reads the actual release tag, verifies the exact expected asset with a one-byte range request, and reuses the existing download host, filename, size, and PE validation safeguards.
- Automatic mod updates and setup package downloads use the same fallback path.
- Rate-limit messages now recognize GitHub's 429 and explicit API quota response bodies.
