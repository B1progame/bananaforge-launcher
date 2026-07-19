# Architecture

The launcher applies a strict separation between UI, validated models, and services. All filesystem mutation belongs in services and is staged before activation. `Transaction` journals destructive replacements and can roll them back. Profile activation stages files outside the active `Mods` directory and atomically swaps it into place.

The bootstrap accepts a typed release manifest, constrains package URLs to the configured release origin, downloads before extraction, and verifies SHA-256 before use. The launcher uses GitHub's API only for the explicit allowlisted upstream repositories.
