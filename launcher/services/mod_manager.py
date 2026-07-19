from __future__ import annotations

import shutil
from collections import defaultdict
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

    def install_official(
        self,
        downloaded_dll: Path,
        repository: str,
        version: str,
        author: str | None = None,
        dependencies: list[str] | None = None,
        release_notes: str = "",
    ) -> InstalledMod:
        """Store a verified, user-approved DLL in the library—not in a running instance."""
        if downloaded_dll.suffix.lower() != ".dll" or not downloaded_dll.is_file():
            raise ValueError("Official installation requires a downloaded DLL")
        owner, separator, project = repository.partition("/")
        if (
            not separator
            or not owner
            or not project
            or any(part in {".", ".."} for part in (owner, project))
        ):
            raise ValueError("Repository must be an owner/name identifier")
        destination = self.library / f"{owner}.{project}" / version
        destination.mkdir(parents=True, exist_ok=True)
        target = destination / downloaded_dll.name
        if target.exists() and sha256_file(target) != sha256_file(downloaded_dll):
            backup = target.with_suffix(target.suffix + ".backup")
            shutil.copy2(target, backup)
        shutil.copy2(downloaded_dll, target)
        mod = InstalledMod(
            name=project,
            version=version,
            author=author or owner,
            repository=repository,
            source_url=f"https://github.com/{repository}",
            library_path=target,
            sha256=sha256_file(target),
            security_state=SecurityState.OFFICIAL,
            dependencies=dependencies or [],
            release_notes=release_notes,
        )
        (destination / "metadata.json").write_text(mod.model_dump_json(indent=2), encoding="utf-8")
        return mod

    @staticmethod
    def duplicate_dlls(mods_folder: Path) -> dict[str, list[Path]]:
        duplicates: dict[str, list[Path]] = defaultdict(list)
        if not mods_folder.is_dir():
            return {}
        for file in mods_folder.rglob("*"):
            if not file.is_file() or file.suffix.lower() != ".dll":
                continue
            duplicates[file.name.lower()].append(file)
        return {name: files for name, files in duplicates.items() if len(files) > 1}

    @staticmethod
    def remove_library_version(mod: InstalledMod) -> None:
        """Remove only a known library version; callers must first ensure profile references are absent."""
        version_folder = mod.library_path.parent
        if not version_folder.is_dir():
            raise ValueError("Mod library version is unavailable")
        shutil.rmtree(version_folder)
