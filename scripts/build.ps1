$ErrorActionPreference = 'Stop'
python -m pip install pyinstaller
python scripts/build_assets.py
pyinstaller --noconfirm --name BananaForgeLauncher --windowed --icon launcher/assets/icons/BloonsModLauncher.ico --add-data "launcher/ui;launcher/ui" --add-data "launcher/assets;launcher/assets" launcher/main.py
pyinstaller --noconfirm --name BananaForgeBootstrap --windowed --icon launcher/assets/icons/BloonsModLauncher.ico bootstrap/main.py
if (Get-Command iscc -ErrorAction SilentlyContinue) { iscc installer/BananaForgeLauncher.iss }
