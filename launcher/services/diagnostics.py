from __future__ import annotations
import re

_PATTERNS = (r"gh[opsu]_[A-Za-z0-9_]+", r"(?i)bearer\s+\S+", r"[\w.+-]+@[\w.-]+")


def redact(text: str) -> str:
    for pattern in _PATTERNS:
        text = re.sub(pattern, "[REDACTED]", text)
    return text
