from __future__ import annotations

from enum import StrEnum


class CompatibilityState(StrEnum):
    VERIFIED = "verified"
    SUPPORTED = "supported"
    PROBABLY_COMPATIBLE = "probably_compatible"
    UNKNOWN = "unknown"
    OUTDATED = "outdated"
    BLOCKED = "blocked"
    DEPENDENCY_MISSING = "dependency_missing"
    CONFLICTING = "conflicting"
    BROKEN = "broken"
