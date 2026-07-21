; Conventional offline installer. It contains the already-built BananaForge app.
; It deliberately does not execute PowerShell, Git, npm, or downloaded code.

#define AppName "BananaForge"
#define AppVersion "0.2.4"
#define AppExeName "BananaForge.exe"

[Setup]
AppId={{A120FCF5-946F-43B2-98A9-98BA226AF123}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=BananaForge
AppComments=Local BTD6 mod workspace and browser
DefaultDirName={localappdata}\BananaForge
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=..\desktop\dist
OutputBaseFilename=BananaForge-Safe-Setup-0.2.4
SetupIconFile=..\desktop\assets\bananaforge.ico
UninstallDisplayName={#AppName}
UninstallDisplayIcon={app}\{#AppExeName}
WizardStyle=modern
AlwaysRestart=no
RestartIfNeededByRun=no
Compression=lzma2/ultra64
SolidCompression=yes
ArchitecturesInstallIn64BitMode=x64compatible

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Shortcuts:"; Flags: unchecked

[Files]
Source: "..\desktop\dist\win-unpacked\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\{#AppExeName}"; WorkingDir: "{app}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExeName}"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppExeName}"; Description: "Open BananaForge"; Flags: nowait postinstall skipifsilent
