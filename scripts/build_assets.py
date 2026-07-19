"""Render editable SVG branding into required Windows PNG/ICO assets."""

from pathlib import Path

from PySide6.QtCore import QByteArray, Qt
from PySide6.QtGui import QGuiApplication, QImage, QPainter
from PySide6.QtSvg import QSvgRenderer


def render(svg: Path, destination: Path, size: int) -> None:
    image = QImage(size, size, QImage.Format_ARGB32)
    image.fill(Qt.transparent)
    painter = QPainter(image)
    QSvgRenderer(QByteArray(svg.read_bytes())).render(painter)
    painter.end()
    image.save(str(destination))


def main() -> None:
    root = Path(__file__).parents[1] / "launcher/assets"
    icons = root / "icons"
    icons.mkdir(parents=True, exist_ok=True)
    source = root / "branding/bananaforge-mark.svg"
    images = []
    for size in (16, 24, 32, 48, 64, 128, 256, 512):
        target = icons / f"icon_{size}.png"
        render(source, target, size)
        images.append(QImage(str(target)))
    images[-1].save(str(icons / "BloonsModLauncher.ico"))


if __name__ == "__main__":
    app = QGuiApplication([])
    main()
