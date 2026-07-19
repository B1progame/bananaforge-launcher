from __future__ import annotations
import argparse
from pathlib import Path
from launcher.constants import APP_NAME, VERSION
from launcher.services.game_detection import validate_game
from launcher.models.core import Storefront


def main() -> int:
    parser = argparse.ArgumentParser(description=APP_NAME)
    parser.add_argument("--headless", action="store_true")
    parser.add_argument("--game")
    args = parser.parse_args()
    if args.headless:
        print(f"{APP_NAME} {VERSION}")
        if args.game:
            print(validate_game(Path(args.game), Storefront.MANUAL).model_dump_json(indent=2))
        return 0
    try:
        from PySide6.QtCore import QUrl
        from PySide6.QtGui import QGuiApplication
        from PySide6.QtQml import QQmlApplicationEngine
    except ImportError:
        print(
            "Install the optional UI dependency: pip install -e '.[ui]'; use --headless meanwhile"
        )
        return 1
    app = QGuiApplication([])
    engine = QQmlApplicationEngine()
    engine.load(QUrl.fromLocalFile(str(Path(__file__).parent / "ui/Main.qml")))
    return app.exec() if engine.rootObjects() else 1


if __name__ == "__main__":
    raise SystemExit(main())
