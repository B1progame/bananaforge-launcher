; BananaForge Launcher setup
; Native, per-user Inno Setup installer. It installs only BananaForge itself.
; Third-party mod tools are never downloaded without a later confirmation in the launcher.

#define AppName "BananaForge Launcher"
#define AppVersion "0.1.0"
#define AppPublisher "BananaForge"
#define AppExeName "BananaForgeLauncher.exe"

[Setup]
AppId={{B5A42C2C-03D2-4E96-A39A-383D51AD0B65}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
AppComments=Unofficial local BTD6 mod workspace manager
DefaultDirName={localappdata}\BananaForge Launcher
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
OutputDir=..\dist
OutputBaseFilename=BananaForgeLauncherSetup
SetupIconFile=..\launcher\assets\icons\BloonsModLauncher.ico
UninstallDisplayName={#AppName}
UninstallDisplayIcon={app}\{#AppExeName}
WizardStyle=modern
WizardSizePercent=110
DisableWelcomePage=no
DisableReadyPage=no
Compression=lzma2/ultra64
SolidCompression=yes
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Shortcuts:"; Flags: unchecked

[Files]
Source: "..\dist\BananaForgeLauncher\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\{#AppExeName}"; WorkingDir: "{app}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExeName}"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppExeName}"; Parameters: "{code:LaunchParameters}"; Description: "Open BananaForge and begin guided setup"; Flags: nowait postinstall skipifsilent

[Code]
var
  ToolPage: TWizardPage;
  RecommendedTools: TNewCheckBox;
  MelonLoaderOnly: TNewCheckBox;
  ToolExplanation: TNewStaticText;
  HeaderText: TNewStaticText;

procedure SetDarkControl(Control: TControl);
begin
  Control.Font.Color := $00E8EEF8;
end;

procedure InitializeWizard;
begin
  { Give the normal Inno shell BananaForge's dark, high-contrast identity. }
  WizardForm.Color := $00152338;
  WizardForm.WelcomePage.Color := $00152338;
  WizardForm.SelectDirPage.Color := $00152338;
  WizardForm.ReadyPage.Color := $00152338;
  WizardForm.FinishedPage.Color := $00152338;
  WizardForm.WelcomeLabel1.Caption := 'Welcome to BananaForge';
  WizardForm.WelcomeLabel2.Caption :=
    'A safer local workspace for your BTD6 mod setup.' + #13#10 + #13#10 +
    'The installer adds BananaForge only. Your original game is never changed here.';
  WizardForm.FinishedLabel.Caption :=
    'BananaForge is installed. Open it to select BTD6, create a separate managed copy, and review any optional downloads.';
  SetDarkControl(WizardForm.WelcomeLabel1);
  SetDarkControl(WizardForm.WelcomeLabel2);
  SetDarkControl(WizardForm.FinishedLabel);

  ToolPage := CreateCustomPage(wpSelectDir,
    'Choose your setup path',
    'Pick what BananaForge should offer after installation');
  ToolPage.Surface.Color := $00152338;

  HeaderText := TNewStaticText.Create(ToolPage);
  HeaderText.Parent := ToolPage.Surface;
  HeaderText.Left := ScaleX(20);
  HeaderText.Top := ScaleY(22);
  HeaderText.Width := ToolPage.SurfaceWidth - ScaleX(40);
  HeaderText.Height := ScaleY(42);
  HeaderText.Caption := 'Start with the recommended mod tools';
  HeaderText.Font.Size := 13;
  HeaderText.Font.Style := [fsBold];
  HeaderText.Font.Color := $00F8FAFC;

  ToolExplanation := TNewStaticText.Create(ToolPage);
  ToolExplanation.Parent := ToolPage.Surface;
  ToolExplanation.Left := ScaleX(20);
  ToolExplanation.Top := ScaleY(70);
  ToolExplanation.Width := ToolPage.SurfaceWidth - ScaleX(40);
  ToolExplanation.Height := ScaleY(56);
  ToolExplanation.AutoSize := False;
  ToolExplanation.WordWrap := True;
  ToolExplanation.Caption :=
    'After BananaForge knows where your separate BTD6 instance lives, it can show the official GitHub releases for these tools. Nothing is downloaded until you see the source and approve it.';
  ToolExplanation.Font.Color := $00B8C8DE;

  RecommendedTools := TNewCheckBox.Create(ToolPage);
  RecommendedTools.Parent := ToolPage.Surface;
  RecommendedTools.Left := ScaleX(20);
  RecommendedTools.Top := ScaleY(145);
  RecommendedTools.Width := ToolPage.SurfaceWidth - ScaleX(40);
  RecommendedTools.Height := ScaleY(28);
  RecommendedTools.Caption := 'Offer MelonLoader and BTD Mod Helper in guided setup (recommended)';
  RecommendedTools.Checked := True;
  RecommendedTools.Font.Color := $00F8FAFC;

  MelonLoaderOnly := TNewCheckBox.Create(ToolPage);
  MelonLoaderOnly.Parent := ToolPage.Surface;
  MelonLoaderOnly.Left := ScaleX(20);
  MelonLoaderOnly.Top := ScaleY(181);
  MelonLoaderOnly.Width := ToolPage.SurfaceWidth - ScaleX(40);
  MelonLoaderOnly.Height := ScaleY(28);
  MelonLoaderOnly.Caption := 'Only offer MelonLoader';
  MelonLoaderOnly.Font.Color := $00D1DCEC;
end;

procedure UpdateToolChoices;
begin
  MelonLoaderOnly.Enabled := RecommendedTools.Checked;
  if not RecommendedTools.Checked then
    MelonLoaderOnly.Checked := False;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if CurPageID = ToolPage.ID then
    UpdateToolChoices;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  Options: String;
begin
  if CurStep = ssPostInstall then
  begin
    Options := '[BananaForgeSetup]' + #13#10 +
      'OfferRecommendedTools=' + IntToStr(Ord(RecommendedTools.Checked)) + #13#10 +
      'MelonLoaderOnly=' + IntToStr(Ord(MelonLoaderOnly.Checked)) + #13#10;
    SaveStringToFile(ExpandConstant('{app}\installer-options.ini'), Options, False);
  end;
end;

function LaunchParameters(Param: String): String;
begin
  Result := '--guided-setup';
  if RecommendedTools.Checked then
    Result := Result + ' --recommended-tools';
end;
