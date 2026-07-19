; Inno Setup, per-user installer. Does not touch the original BTD6 installation.
#define AppName "BananaForge Launcher"
#define AppVersion "0.1.0"
[Setup]
AppName={#AppName}
AppVersion={#AppVersion}
DefaultDirName={localappdata}\BananaForge Launcher
DefaultGroupName={#AppName}
PrivilegesRequired=lowest
OutputBaseFilename=BananaForgeLauncherSetup
UninstallDisplayName={#AppName}
[Files]
Source: "..\dist\BananaForgeLauncher\*"; DestDir: "{app}"; Flags: recursesubdirs ignoreversion
[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\BananaForgeLauncher.exe"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\BananaForgeLauncher.exe"; Tasks: desktopicon
[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; Flags: unchecked
[Run]
Filename: "{app}\BananaForgeLauncher.exe"; Description: "Launch {#AppName}"; Flags: nowait postinstall skipifsilent
