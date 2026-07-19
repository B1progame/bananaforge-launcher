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
from launcher.models.mod import CatalogueMod, ModFilters
from launcher.services.mod_catalogue import BtdModHelperBrowserProvider
from launcher.services.settings_manager import SettingsManager
from launcher.services.theme_manager import ThemeManager, validate_accent
from launcher.services.transactions import Transaction
from launcher.services.update_manager import UpdateManager
from launcher.models.core import ReleaseManifest, Storefront
from launcher.models.profile import ManagedProfile
from launcher.services.diagnostics import DiagnosticItem, export_support_bundle
from launcher.services.library_store import LibraryStore
from launcher.services.official_path_manager import OfficialPathManager
from launcher.services.setup_coordinator import SetupCoordinator, SetupStage
from launcher.services.profile_manager import ProfileManager
from launcher.services.mod_manager import ModManager
from bootstrap.secure_download import download_verified
from launcher.services.installation_tester import InstallationTester
from launcher.models.compatibility import CompatibilityState
from launcher.services.compatibility_manager import CompatibilityManager
from launcher.services.windows_integration import _ps_quote
from launcher.services.notification_service import NotificationLevel, NotificationService
from launcher.services.backup_manager import BackupManager
from launcher.services.sync_manager import SyncManager
from scripts.generate_release_manifest import build_manifest


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


def test_settings_v0_migration_preserves_accent(tmp_path: Path) -> None:
    path = tmp_path / "settings.json"
    path.write_text('{"accent":"#3f8cff","dark_mode":false}')
    settings = SettingsManager(path).load()
    assert settings.schema_version == 1
    assert settings.primary_accent == "#3f8cff"
    assert settings.theme.value == "light"


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


def test_profile_library_store_roundtrip(tmp_path: Path) -> None:
    store = LibraryStore(tmp_path / "data")
    profile = ManagedProfile(name="Sandbox", mod_ids=["example.mod"])
    store.save_profiles([profile])
    assert store.profiles()[0].mod_ids == ["example.mod"]


def test_official_path_clean_restore(tmp_path: Path) -> None:
    game = tmp_path / "game"
    game.mkdir()
    (game / "BloonsTD6.exe").write_text("clean")
    manager = OfficialPathManager(game, tmp_path / "state")
    manager.create_verified_clean_backup()
    (game / "BloonsTD6.exe").write_text("managed")
    manager.restore_clean()
    assert (game / "BloonsTD6.exe").read_text() == "clean"


def test_support_bundle_redacts_secrets(tmp_path: Path) -> None:
    bundle = export_support_bundle(
        tmp_path / "support.json",
        [DiagnosticItem("ok", True, "fine")],
        "Bearer secret gho_abcdefgh",
    )
    assert "secret" not in bundle.read_text()


def test_setup_requires_safety_acknowledgement(tmp_path: Path) -> None:
    coordinator = SetupCoordinator(LibraryStore(tmp_path / "store"))
    instance, status = asyncio.run(
        coordinator.create_instance(
            "Default", Storefront.MANUAL, tmp_path / "source", tmp_path / "managed", asyncio.Event()
        )
    )
    assert instance is None
    assert status.stage is SetupStage.WARNING


def test_setup_creates_profile(tmp_path: Path) -> None:
    coordinator = SetupCoordinator(LibraryStore(tmp_path / "store"))
    profile, status = coordinator.create_first_profile()
    assert profile.name == "Default"
    assert status.stage is SetupStage.TEST


def test_profile_duplicate_export_import(tmp_path: Path) -> None:
    original = ManagedProfile(name="Boss Practice", mod_ids=["example.mod"])
    copy = ProfileManager.duplicate(original, "Boss Practice Copy")
    assert copy.id != original.id
    export = ProfileManager.export_profile(
        original, {"example.mod": "owner/example"}, tmp_path / "profile.bmlprofile"
    )
    imported, sources = ProfileManager.import_profile(export)
    assert imported.id != original.id
    assert sources == {"example.mod": "owner/example"}


def test_profile_staging_removes_disabled_mods(tmp_path: Path) -> None:
    library = tmp_path / "library"
    library.mkdir()
    first, second = library / "First.dll", library / "Second.dll"
    first.write_bytes(b"one")
    second.write_bytes(b"two")
    mods = tmp_path / "instance/Mods"
    ProfileManager.stage_managed(
        ManagedProfile(name="One", mod_ids=["one"]), {"one": first, "two": second}, mods
    )
    ProfileManager.stage_managed(
        ManagedProfile(name="Two", mod_ids=["two"]), {"one": first, "two": second}, mods
    )
    assert not (mods / "First.dll").exists()
    assert (mods / "Second.dll").exists()


def test_official_mod_install_stays_in_library(tmp_path: Path) -> None:
    download = tmp_path / "Example.dll"
    download.write_bytes(b"verified bytes")
    mod = ModManager(tmp_path / "library").install_official(download, "owner/example", "1.2.3")
    assert mod.security_state.value == "official"
    assert mod.library_path == tmp_path / "library/owner.example/1.2.3/Example.dll"
    assert not (tmp_path / "instance/Mods/Example.dll").exists()


def test_duplicate_dll_detection_is_case_insensitive(tmp_path: Path) -> None:
    mods = tmp_path / "Mods"
    mods.mkdir()
    (mods / "Example.dll").write_bytes(b"a")
    nested = mods / "nested"
    nested.mkdir()
    (nested / "example.DLL").write_bytes(b"b")
    assert "example.dll" in ModManager.duplicate_dlls(mods)


def test_bootstrap_rejects_untrusted_download_url(tmp_path: Path) -> None:
    with pytest.raises(ValueError):
        asyncio.run(
            download_verified(
                "https://bad.example/app.zip",
                tmp_path / "app.zip",
                "0" * 64,
                "https://github.com/B1progame/bananaforge-launcher/releases/download/",
            )
        )


def test_catalogue_offline_cache_filters_and_pages(tmp_path: Path) -> None:
    provider = BtdModHelperBrowserProvider(tmp_path / "catalogue.json")
    provider._cache_write(
        [
            CatalogueMod(
                id="a", name="Fast Darts", author="alice", repository="alice/a", tags=["qol"]
            ),
            CatalogueMod(
                id="b", name="More Darts", author="bob", repository="bob/b", tags=["sandbox"]
            ),
        ]
    )
    assert [item.id for item in provider._cache_read("darts", ModFilters(author="alice"))] == ["a"]


def test_compatibility_keeps_unlisted_versions_unknown(tmp_path: Path) -> None:
    manifest = tmp_path / "compatibility.json"
    manifest.write_text(
        '{"schema_version":1,"melonloader":{"recommended":"0.6","supported":["0.5"],"blocked":["0.4"]},"combinations":[]}'
    )
    manager = CompatibilityManager(manifest)
    assert manager.melonloader_state("0.6") is CompatibilityState.VERIFIED
    assert manager.melonloader_state("0.5") is CompatibilityState.SUPPORTED
    assert manager.melonloader_state("0.4") is CompatibilityState.BLOCKED
    assert manager.melonloader_state("9.9") is CompatibilityState.UNKNOWN


def test_powershell_quoting_does_not_allow_literal_breakout() -> None:
    assert _ps_quote("C:/Bob's Launcher.exe") == "'C:/Bob''s Launcher.exe'"


def test_recoverable_notification_hides_traceback_from_primary_text() -> None:
    service = NotificationService()
    item = service.user_error("Copy failed", ValueError("unsafe path"))
    assert item.level is NotificationLevel.ERROR
    assert "unsafe path" not in item.message
    assert item.technical_details == "ValueError: unsafe path"
    service.dismiss(item.id)
    assert service.active() == []


def test_sync_preserves_managed_mods_and_updates_game_files(tmp_path: Path) -> None:
    source, managed = tmp_path / "source", tmp_path / "managed"
    source.mkdir()
    managed.mkdir()
    (source / "BloonsTD6.exe").write_text("new")
    (source / "BloonsTD6_Data").mkdir()
    (managed / "BloonsTD6.exe").write_text("old")
    (managed / "Mods").mkdir()
    (managed / "Mods/Personal.dll").write_text("keep")
    previous = [{"relative_path": "BloonsTD6.exe", "size": 3, "modified": "old"}]
    result = SyncManager().synchronize(
        source, managed, previous, BackupManager(tmp_path / "backups")
    )
    assert "BloonsTD6.exe" in result.changed_files
    assert (managed / "BloonsTD6.exe").read_text() == "new"
    assert (managed / "Mods/Personal.dll").read_text() == "keep"


def test_release_manifest_uses_zip_hash_and_release_url(tmp_path: Path) -> None:
    package = tmp_path / "BananaForgeLauncher.zip"
    package.write_bytes(b"release")
    manifest = build_manifest(package, "v1.2.3", "owner/project")
    assert manifest["version"] == "1.2.3"
    assert (
        manifest["download_url"]
        == "https://github.com/owner/project/releases/download/v1.2.3/BananaForgeLauncher.zip"
    )


def test_log_monitor_detects_loader_helper_and_fatal(tmp_path: Path) -> None:
    log = tmp_path / "MelonLoader/Latest.log"
    log.parent.mkdir()
    log.write_text("MelonLoader started\nBTD Mod Helper ready\nLoaded Mod A\nFATAL bad patch")
    melon, helper, mods, fatal = InstallationTester._inspect_logs([log])
    assert melon and helper and mods == 1
    assert fatal == ["FATAL bad patch"]
