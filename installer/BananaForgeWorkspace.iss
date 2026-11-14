; Bundled application installs offline. Optional packages use the app's setup queue.
#define AppName "BananaForge"
#ifndef AppVersion
  #define AppVersion "0.3.0"
#endif
#ifndef AppFilesDir
  #define AppFilesDir "..\desktop\dist\win-unpacked"
#endif
#define AppExeName "BananaForge.exe"

[Setup]
AppId={{A120FCF5-946F-43B2-98A9-98BA226AF123}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=BananaForge
AppComments=BTD6 profiles, game logs, and package setup
DefaultDirName={localappdata}\BananaForge\App
UsePreviousAppDir=yes
DisableDirPage=no
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=..\desktop\dist
OutputBaseFilename=BananaForge-Setup-{#AppVersion}
SetupIconFile=..\desktop\assets\bananaforge.ico
UninstallDisplayName={#AppName}
UninstallDisplayIcon={app}\{#AppExeName}
WizardStyle=modern
WizardSizePercent=120
AlwaysRestart=no
RestartIfNeededByRun=no
Compression=lzma2
SolidCompression=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=yes
SetupLogging=yes

[Types]
Name: "full"; Description: "Launcher + guided modding setup"
Name: "compact"; Description: "Launcher only"
Name: "custom"; Description: "Choose packages"; Flags: iscustom

[Components]
Name: "launcher"; Description: "BananaForge application (included, required)"; Types: full compact custom; Flags: fixed
Name: "managed"; Description: "Configure a separate BTD6 game copy on first launch"; Types: full
Name: "melonloader"; Description: "Download the official MelonLoader installer on first launch"; Types: full
Name: "modhelper"; Description: "Download BTD Mod Helper into a selected profile on first launch"; Types: full

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Shortcuts:"; Flags: unchecked

[Files]
Source: "{#AppFilesDir}\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\{#AppExeName}"; WorkingDir: "{app}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExeName}"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppExeName}"; Parameters: "--setup"; Description: "Open BananaForge and review selected packages"; Flags: nowait postinstall skipifsilent

[Code]
var
  WorkspacePage: TInputDirWizardPage;

procedure InitializeWizard;
begin
  WorkspacePage := CreateInputDirPage(wpSelectComponents,
    'Choose your workspace location',
    'Where should profiles, downloads, and managed games live?',
    'Application files use the installation folder selected earlier. The workspace is kept when you uninstall BananaForge. You can choose a different managed-game and download folder in the app.', False, '');
  WorkspacePage.Add('Workspace folder:');
  WorkspacePage.Values[0] := GetPreviousData('WorkspaceRoot', ExpandConstant('{localappdata}\BananaForge'));
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if CurPageID = WorkspacePage.ID then
  begin
    if (Length(Trim(WorkspacePage.Values[0])) < 4) or
       (ExtractFileDrive(WorkspacePage.Values[0]) = '') then
    begin
      MsgBox('Choose a full folder path, for example D:\Games\BananaForge.', mbError, MB_OK);
      Result := False;
    end;
  end;
end;

function ComponentValue(Name: String): String;
begin
  if WizardIsComponentSelected(Name) then Result := '1' else Result := '0';
end;

function IsAutomaticUpdate: Boolean;
begin
  Result := Pos('/AUTOMATICUPDATE', Uppercase(GetCmdTail)) > 0;
end;

procedure RegisterPreviousData(PreviousDataKey: Integer);
begin
  SetPreviousData(PreviousDataKey, 'WorkspaceRoot', WorkspacePage.Values[0]);
end;

procedure CurStepChanged(CurStep: TSetupStep);
var OptionsFile, EscapedRoot, Payload: String;
begin
  if (CurStep = ssPostInstall) and not IsAutomaticUpdate then
  begin
    OptionsFile := ExpandConstant('{app}\setup-options.json');
    EscapedRoot := WorkspacePage.Values[0];
    StringChangeEx(EscapedRoot, '\', '\\', True);
    StringChangeEx(EscapedRoot, '"', '\"', True);
    Payload := '{"root":"' + EscapedRoot + '","managed":"' + ComponentValue('managed') +
      '","melonloader":"' + ComponentValue('melonloader') + '","modhelper":"' + ComponentValue('modhelper') + '"}';
    if not SaveStringToFile(OptionsFile, UTF8Encode(Payload), False) then
      RaiseException('Could not save the selected workspace and packages.');
  end;
end;

