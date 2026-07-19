from __future__ import annotations

import shutil
from pathlib import Path

from launcher.models.mod import InstalledMod, SecurityState
from launcher.services.integrity import safe_extract_zip, sha256_file


class ModManager:
    def __init__(self, library: Path) -> None:
        self.library = library

    def import_manual(self, source: Path) -> InstalledMod:
        if source.suffix.lower() not in {".dll", ".zip"}:
            raise ValueError("Only DLL and ZIP files can be manually imported")
        destination = self.library / "manual" / source.stem / "unknown"
        destination.mkdir(parents=True, exist_ok=True)
        if source.suffix.lower() == ".zip":
            dlls = [
                file
                for file in safe_extract_zip(source, destination)
                if file.suffix.lower() == ".dll"
            ]
            if len(dlls) != 1:
                raise ValueError("Archive must contain exactly one DLL; user selection is required")
            imported = dlls[0]
        else:
            imported = destination / source.name
            shutil.copy2(source, imported)
        mod = InstalledMod(
            name=source.stem,
            version="unknown",
            library_path=imported,
            sha256=sha256_file(imported),
            security_state=SecurityState.MANUAL,
        )
        (destination / "metadata.json").write_text(mod.model_dump_json(indent=2), encoding="utf-8")
        return mod
