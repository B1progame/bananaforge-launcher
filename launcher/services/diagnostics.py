from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass
from pathlib import Path

from launcher.services.game_validation import validate_managed_location

_PATTERNS = (r"gh[opsu]_[A-Za-z0-9_]+", r"(?i)bearer\s+\S+", r"[\w.+-]+@[\w.-]+")


def redact(text: str) -> str:
    for pattern in _PATTERNS:
        text = re.sub(pattern, "[REDACTED]", text)
    return text


@dataclass(frozen=True)
class DiagnosticItem:
    name: str
    passed: bool
    detail: str


def inspect_instance(source: Path, managed: Path) -> list[DiagnosticItem]:
    location = validate_managed_location(source, managed)
    return [
        DiagnosticItem("Source location", source.is_dir(), str(source)),
        DiagnosticItem("Managed location", location.valid, "; ".join(location.messages)),
        DiagnosticItem(
            "Managed executable",
            (managed / "BloonsTD6.exe").is_file(),
            str(managed / "BloonsTD6.exe"),
        ),
        DiagnosticItem("Mods directory", (managed / "Mods").is_dir(), str(managed / "Mods")),
    ]


def export_support_bundle(
    destination: Path, diagnostics: list[DiagnosticItem], log_text: str
) -> Path:
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(
        json.dumps(
            {"diagnostics": [asdict(item) for item in diagnostics], "log": redact(log_text)},
            indent=2,
        ),
        encoding="utf-8",
    )
    return destination
