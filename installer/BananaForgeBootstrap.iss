; Builds BananaForge from the public GitHub repository at install time.
; The temporary checkout is removed by Install-BananaForge.ps1 after packaging.

#define AppName "BananaForge Bootstrap Installer"
#define AppVersion "0.2.0"

[Setup]
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=BananaForge
DefaultDirName={autopf}\BananaForge Bootstrap
DisableDirPage=yes
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=..\desktop\dist
OutputBaseFilename=BananaForgeBootstrap-Setup
SetupIconFile=..\desktop\assets\bananaforge.ico
WizardStyle=modern
Compression=lzma2/ultra64
SolidCompression=yes

[Files]
Source: "Install-BananaForge.ps1"; DestDir: "{tmp}"; Flags: deleteafterinstall

[Run]
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{tmp}\Install-BananaForge.ps1"""; Flags: waituntilterminated
