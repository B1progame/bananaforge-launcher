from __future__ import annotations
import argparse
import sys
from pathlib import Path
from launcher.constants import APP_NAME, VERSION
from launcher.app import ApplicationServices
from launcher.services.game_detection import validate_game
from launcher.models.core import Storefront


def resource_path(*parts: str) -> Path:
    """Return a bundled resource path in both source and PyInstaller builds."""
    base = (
        Path(sys._MEIPASS)
        if getattr(sys, "frozen", False)
        else Path(__file__).resolve().parent.parent
    )
    return base.joinpath(*parts)


def main() -> int:
    parser = argparse.ArgumentParser(description=APP_NAME)
    parser.add_argument("--headless", action="store_true")
    parser.add_argument("--game")
    args = parser.parse_args()
    services = ApplicationServices()
    if args.headless:
        print(f"{APP_NAME} {VERSION} — data: {services.data_root}")
        if args.game:
            print(validate_game(Path(args.game), Storefront.MANUAL).model_dump_json(indent=2))
        return 0
    try:
        from PySide6.QtCore import QUrl
        from PySide6.QtGui import QGuiApplication, QIcon
        from PySide6.QtQml import QQmlApplicationEngine
        from PySide6.QtWidgets import QMessageBox
    except ImportError:
        print(
            "Install the optional UI dependency: pip install -e '.[ui]'; use --headless meanwhile"
        )
        return 1
    app = QGuiApplication([])
    app.setApplicationDisplayName(APP_NAME)
    icon_path = resource_path("launcher", "assets", "icons", "BloonsModLauncher.ico")
    if icon_path.is_file():
        app.setWindowIcon(QIcon(str(icon_path)))
    engine = QQmlApplicationEngine()
    qml_path = resource_path("launcher", "ui", "Main.qml")
    engine.load(QUrl.fromLocalFile(str(qml_path)))
    if not engine.rootObjects():
        QMessageBox.critical(
            None,
            APP_NAME,
            f"The launcher interface could not be loaded.\n\nExpected file:\n{qml_path}",
        )
        return 1
    return app.exec()


if __name__ == "__main__":
    raise SystemExit(main())
