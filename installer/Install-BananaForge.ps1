<#!
.SYNOPSIS
  BananaForge source bootstrap installer.

.DESCRIPTION
  Clones the public BananaForge repository into a temporary folder, builds the
  Electron app locally, installs the unpacked build under LocalAppData, removes
  the temporary checkout, and optionally creates the first managed BTD6 copy.
  MelonLoader remains a manual, user-confirmed install from its official page.
#>
[CmdletBinding()]
param(
    [string]$Repository = "https://github.com/B1progame/bananaforge-launcher.git",
    [string]$InstallRoot = (Join-Path $env:LOCALAPPDATA "BananaForge"),
    [string]$Btd6Source = "",
    [string]$ManagedCopyRoot = (Join-Path $env:LOCALAPPDATA "BananaForge\Instances\Main"),
    [switch]$NonInteractive,
    [switch]$NoLaunch,
    [switch]$SkipMelonLoader,
    [switch]$SkipManagedCopy
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms
$logRoot = Join-Path $env:LOCALAPPDATA "BananaForge"
New-Item -ItemType Directory -Path $logRoot -Force | Out-Null
$logFile = Join-Path $logRoot "bootstrap-installer.log"

function Write-InstallerLog([string]$Message) {
    $entry = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $Message"
    Add-Content -LiteralPath $logFile -Value $entry
    Write-Host $entry
}

function Show-Message([string]$Text, [string]$Title, [System.Windows.Forms.MessageBoxButtons]$Buttons = [System.Windows.Forms.MessageBoxButtons]::OK) {
    Write-InstallerLog "$Title :: $Text"
    if ($NonInteractive) {
        if ($Buttons -eq [System.Windows.Forms.MessageBoxButtons]::YesNo) { return [System.Windows.Forms.DialogResult]::Yes }
        return [System.Windows.Forms.DialogResult]::OK
    }
    return [System.Windows.Forms.MessageBox]::Show($Text, $Title, $Buttons, [System.Windows.Forms.MessageBoxIcon]::Information)
}

function Require-Command([string]$Name) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command '$Name' was not found. Install it, then run this installer again."
    }
}

function Choose-Folder([string]$Description) {
    $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
    $dialog.Description = $Description
    $dialog.ShowNewFolderButton = $true
    if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { return $dialog.SelectedPath }
    return ""
}

function Find-Btd6Folder {
    $candidates = @(
        "C:\Program Files (x86)\Steam\steamapps\common\BloonsTD6",
        "C:\Program Files\Steam\steamapps\common\BloonsTD6"
    )
    $steamRoots = @("C:\Program Files (x86)\Steam", "C:\Program Files\Steam")
    foreach ($steamRoot in $steamRoots) {
        $libraryFile = Join-Path $steamRoot "steamapps\libraryfolders.vdf"
        if (Test-Path $libraryFile) {
            foreach ($line in Get-Content -LiteralPath $libraryFile) {
                if ($line -match '"path"\s+"(.+)"') {
                    $library = $Matches[1].Replace('\\', '\')
                    $candidates += Join-Path $library "steamapps\common\BloonsTD6"
                }
            }
        }
    }
    foreach ($candidate in $candidates | Select-Object -Unique) {
        if (Test-Path (Join-Path $candidate "BloonsTD6.exe")) { return $candidate }
    }
    return ""
}

Require-Command git
Require-Command npm

$buildRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("BananaForge-build-" + [guid]::NewGuid().ToString("N"))
$desktopRoot = Join-Path $buildRoot "desktop"
$launchArguments = @()

try {
    Write-InstallerLog "Starting Bootstrap installer. Repository: $Repository"
    Show-Message "BananaForge will download its public source, build the Chromium modloader locally, then remove the temporary source folder." "BananaForge installer"
    & git clone --depth 1 $Repository $buildRoot
    if ($LASTEXITCODE -ne 0) { throw "Git clone failed." }

    Push-Location $desktopRoot
    try {
        & npm ci
        if ($LASTEXITCODE -ne 0) { throw "npm ci failed." }
        & npm run pack
        if ($LASTEXITCODE -ne 0) { throw "Electron packaging failed." }
    }
    finally { Pop-Location }

    $builtApp = Join-Path $desktopRoot "dist\win-unpacked"
    if (-not (Test-Path (Join-Path $builtApp "BananaForge.exe"))) { throw "The built BananaForge executable was not found." }

    if (Test-Path $InstallRoot) {
        $backup = "$InstallRoot.backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
        Move-Item -LiteralPath $InstallRoot -Destination $backup
    }
    New-Item -ItemType Directory -Path $InstallRoot -Force | Out-Null
    Get-ChildItem -LiteralPath $builtApp -Force | Copy-Item -Destination $InstallRoot -Recurse -Force
    Write-InstallerLog "Installed packaged BananaForge to $InstallRoot"

    if (-not $Btd6Source) { $Btd6Source = Find-Btd6Folder }
    if (-not $Btd6Source) {
        Show-Message "BTD6 was not found automatically. Select the folder that contains BloonsTD6.exe to continue." "Locate BTD6"
        if (-not $NonInteractive) { $Btd6Source = Choose-Folder "Choose your Steam BTD6 folder" }
        if (-not $Btd6Source) { throw "BTD6 was not selected. Run the installer again when you know its Steam folder." }
    }
    if (-not (Test-Path (Join-Path $Btd6Source "BloonsTD6.exe"))) { throw "The selected BTD6 folder does not contain BloonsTD6.exe." }

    $createCopy = Show-Message "BTD6 was found here:`n$Btd6Source`n`nCreate a separate managed copy now? BananaForge will keep this copy synchronized with new Steam game files before every launch." "BananaForge installer" ([System.Windows.Forms.MessageBoxButtons]::YesNo)
    if (-not $SkipManagedCopy -and $createCopy -eq [System.Windows.Forms.DialogResult]::Yes) {
        $sourcePath = (Resolve-Path -LiteralPath $Btd6Source).Path
        $managedPath = [System.IO.Path]::GetFullPath($ManagedCopyRoot)
        if ($sourcePath -eq $managedPath) { throw "The managed copy must have a different folder." }
        New-Item -ItemType Directory -Path $ManagedCopyRoot -Force | Out-Null
        Get-ChildItem -LiteralPath $Btd6Source -Force | Copy-Item -Destination $ManagedCopyRoot -Recurse -Force
        $launchArguments = @("--game-path", (Join-Path $sourcePath "BloonsTD6.exe"), "--instance-path", $managedPath)
        Write-InstallerLog "Created managed BTD6 copy at $managedPath"
    }

    $manualMelon = Show-Message "Install MelonLoader now? BananaForge will open its official release page. Download and run the installer manually, then select it in BananaForge Settings." "Install MelonLoader" ([System.Windows.Forms.MessageBoxButtons]::YesNo)
    if (-not $SkipMelonLoader -and $manualMelon -eq [System.Windows.Forms.DialogResult]::Yes) {
        Start-Process "https://github.com/LavaGang/MelonLoader/releases/latest"
    }

    if (-not $NoLaunch) { Start-Process -FilePath (Join-Path $InstallRoot "BananaForge.exe") -ArgumentList $launchArguments }
    Write-InstallerLog "Bootstrap installer completed successfully."
}
finally {
    if (Test-Path $buildRoot) { Remove-Item -LiteralPath $buildRoot -Recurse -Force }
    Write-InstallerLog "Temporary repository folder removed."
}
