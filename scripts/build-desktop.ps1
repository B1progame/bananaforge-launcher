param([string]$Compiler = 'C:\Program Files (x86)\Inno Setup 6\ISCC.exe')
$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path $PSScriptRoot -Parent
Push-Location (Join-Path $ProjectRoot 'desktop')
try {
    npm run check
    if ($LASTEXITCODE -ne 0) { throw 'JavaScript checks failed.' }
    npm run pack
    if ($LASTEXITCODE -ne 0) { throw 'Application packaging failed.' }
    $ReleaseVersion = (Get-Content package.json -Raw | ConvertFrom-Json).version
    & $Compiler "/DAppVersion=$ReleaseVersion" (Join-Path $ProjectRoot 'installer\BananaForgeWorkspace.iss')
    if ($LASTEXITCODE -ne 0) { throw 'Installer compilation failed.' }
    $ReleasePath = Join-Path (Get-Location) "dist\BananaForge-Setup-$ReleaseVersion.exe"
    $ReleaseHash = (Get-FileHash -LiteralPath $ReleasePath -Algorithm SHA256).Hash.ToLowerInvariant()
    [IO.File]::WriteAllText("$ReleasePath.sha256", "$ReleaseHash  BananaForge-Setup-$ReleaseVersion.exe`n")
    Get-Item -LiteralPath $ReleasePath | Select-Object FullName, Length
} finally { Pop-Location }
