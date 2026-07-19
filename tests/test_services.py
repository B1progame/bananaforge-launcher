import hashlib
import zipfile
from pathlib import Path
import pytest
from launcher.services.integrity import IntegrityError, safe_extract_zip, verify_sha256
from launcher.services.mod_catalogue import official_browser_url
from launcher.services.diagnostics import redact
from launcher.services.game_detection import validate_game
from launcher.models.core import Storefront, InstallationMode


def test_hash_verification(tmp_path: Path) -> None:
    file = tmp_path / "x"
    file.write_bytes(b"safe")
    verify_sha256(file, hashlib.sha256(b"safe").hexdigest())
    with pytest.raises(IntegrityError):
        verify_sha256(file, "0" * 64)


def test_zip_rejects_traversal(tmp_path: Path) -> None:
    archive = tmp_path / "bad.zip"
    with zipfile.ZipFile(archive, "w") as z:
        z.writestr("../escape.txt", "no")
    with pytest.raises(IntegrityError):
        safe_extract_zip(archive, tmp_path / "out")


def test_search_url_encoding() -> None:
    assert official_browser_url("cash & bananas").endswith("cash+%26+bananas")


def test_redaction() -> None:
    assert "ghp_" not in redact("Bearer secret gho_abcdefghijklmnop x@y.test")


def test_manual_validation(tmp_path: Path) -> None:
    (tmp_path / "BloonsTD6.exe").write_bytes(b"x")
    result = validate_game(tmp_path, Storefront.MANUAL)
    assert result.valid and result.mode is InstallationMode.MANAGED_COPY
