from __future__ import annotations

import json
from pathlib import Path

from launcher.models.settings import Settings

PRESETS = {
    "Bloons orange": ("#ff9f1c", "#ffcf56"),
    "Dart blue": ("#3f8cff", "#78b8ff"),
    "Purple": ("#9b6cff", "#c7a6ff"),
    "Red": ("#ee5d5d", "#ff9898"),
    "Green": ("#51c878", "#9ce6ae"),
    "Cyan": ("#28c6d8", "#8debf2"),
    "Yellow": ("#e4c441", "#f7e88f"),
    "Pink": ("#ef73b4", "#ffc0df"),
    "Neutral gray": ("#8793a5", "#c3ccd6"),
}


def _luminance(color: str) -> float:
    raw = color.removeprefix("#")
    if len(raw) != 6:
        raise ValueError("Color must use #RRGGBB")
    values = [int(raw[index : index + 2], 16) / 255 for index in range(0, 6, 2)]
    linear = [
        value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4 for value in values
    ]
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]


def validate_accent(color: str) -> bool:
    return abs(_luminance(color) - _luminance("#10151f")) >= 0.16


class ThemeManager:
    @staticmethod
    def export_preset(settings: Settings, destination: Path) -> None:
        destination.write_text(
            json.dumps(
                {
                    "primary_accent": settings.primary_accent,
                    "secondary_accent": settings.secondary_accent,
                    "glow_intensity": settings.glow_intensity,
                    "gradient_strength": settings.gradient_strength,
                },
                indent=2,
            ),
            encoding="utf-8",
        )

    @staticmethod
    def import_preset(source: Path, settings: Settings) -> Settings:
        data = json.loads(source.read_text(encoding="utf-8"))
        if not validate_accent(data["primary_accent"]):
            raise ValueError("Accent lacks contrast against the launcher background")
        return settings.model_copy(update=data)
