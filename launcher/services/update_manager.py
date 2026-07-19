from __future__ import annotations

from packaging.version import Version

from launcher.models.core import ReleaseManifest


class UpdateManager:
    def available(self, current: str, manifest: ReleaseManifest, channel: str = "stable") -> bool:
        if channel not in {"stable", "beta"}:
            raise ValueError("Unknown update channel")
        candidate = Version(manifest.version.removeprefix("v"))
        installed = Version(current.removeprefix("v"))
        return candidate > installed and (channel == "beta" or not candidate.is_prerelease)
