# Security policy and threat model

BananaForge treats release manifests, archives, DLLs, paths, and remote API responses as untrusted. It uses HTTPS, repository allowlists, timeouts, typed manifest validation, SHA-256 verification, safe ZIP extraction with size limits, and atomic staging. It never uses `shell=True`, downloads executable Python, disables security software, or bypasses DRM, anti-cheat, or ownership checks.

| Threat | Mitigation |
| --- | --- |
| Tampered launcher archive | SHA-256 verification before activation and origin restriction. |
| Archive traversal/bomb | resolved-path boundary checks and extracted-size cap. |
| Interrupted change | journalled replacement and rollback. |
| Sensitive diagnostic logs | token, bearer credential, and email redaction. |
| Unknown mod | source/hash shown; never automatically declared verified. |

Report vulnerabilities privately through GitHub Security Advisories. Never include credentials in an issue.
