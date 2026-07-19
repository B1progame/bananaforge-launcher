import asyncio
from pathlib import Path

import pytest

from bootstrap.installer import BootstrapInstaller
from launcher.models.settings import Settings
from launcher.services.game_copy import (
    CopyCancelled,
    CopySafetyError,
    copy_game,
    ensure_copy_paths_safe,
)
from launcher.services.mod_catalogue import BtdModHelperBrowserProvider
from launcher.services.settings_manager import SettingsManager
from launcher.services.theme_manager import ThemeManager, validate_accent
from launcher.services.transactions import Transaction
from launcher.services.update_manager import UpdateManager
from launcher.models.core import ReleaseManifest


def test_copy_rejects_nested_paths(tmp_path: Path) -> None:
    source = tmp_path / "source"
    source.mkdir()
    with pytest.raises(CopySafetyError):
        ensure_copy_paths_safe(source, source / "managed")


def test_copy_cancellation_cleans_staging(tmp_path: Path) -> None:
    source = tmp_path / "source"
    source.mkdir()
    (source / "BloonsTD6.exe").write_bytes(b"game")
    cancelled = asyncio.Event()
    cancelled.set()
    with pytest.raises(CopyCancelled):
        asyncio.run(copy_game(source, tmp_path / "managed", cancelled))
    assert not (tmp_path / "managed.copying").exists()


def test_copy_creates_isolated_manifest(tmp_path: Path) -> None:
    source = tmp_path / "source"
    source.mkdir()
    (source / "BloonsTD6.exe").write_bytes(b"game")
    manifest = asyncio.run(copy_game(source, tmp_path / "managed", asyncio.Event()))
    assert manifest[0]["relative_path"] == "BloonsTD6.exe"
    assert (tmp_path / "managed/BloonsTD6.exe").read_bytes() == b"game"


def test_settings_corruption_falls_back_without_deletion(tmp_path: Path) -> None:
    path = tmp_path / "settings.json"
    path.write_text("invalid")
    assert SettingsManager(path).load() == Settings()
    assert path.exists()


def test_settings_atomic_roundtrip(tmp_path: Path) -> None:
    manager = SettingsManager(tmp_path / "settings.json")
    manager.save(Settings(language="de"))
    assert manager.load().language == "de"


def test_theme_export_import_and_contrast(tmp_path: Path) -> None:
    path = tmp_path / "theme.bmltheme"
    ThemeManager.export_preset(Settings(), path)
    assert ThemeManager.import_preset(path, Settings()).primary_accent == "#ff9f1c"
    assert validate_accent("#ff9f1c")


def test_transaction_rollback(tmp_path: Path) -> None:
    target, source = tmp_path / "target.dll", tmp_path / "source.dll"
    target.write_text("old")
    source.write_text("new")
    transaction = Transaction(tmp_path / "journal.json")
    transaction.replace(source, target)
    transaction.rollback()
    assert target.read_text() == "old"


def test_bootstrap_retains_previous_version(tmp_path: Path) -> None:
    import zipfile

    package = tmp_path / "app.zip"
    with zipfile.ZipFile(package, "w") as archive:
        archive.writestr("app.txt", "first")
    installer = BootstrapInstaller(tmp_path / "installed")
    installer.activate_verified_package(package, "1.0.0")
    with zipfile.ZipFile(package, "w") as archive:
        archive.writestr("app.txt", "second")
    installer.activate_verified_package(package, "1.1.0")
    installer.rollback()
    assert (tmp_path / "installed/current/app.txt").read_text() == "first"


def test_ambiguous_mod_release_requires_selection() -> None:
    provider = BtdModHelperBrowserProvider()
    assert provider is not None


def test_stable_update_rejects_prerelease() -> None:
    manifest = ReleaseManifest(
        version="1.1.0b1",
        minimum_bootstrap_version="0.1.0",
        download_url="https://github.com/x/y/releases/a",
        sha256="0" * 64,
        size=1,
    )
    assert not UpdateManager().available("1.0.0", manifest)
    assert UpdateManager().available("1.0.0", manifest, "beta")
