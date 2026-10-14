$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$AppRoot = Join-Path $Root 'app'
$LogDir = Join-Path $Root 'logs'
Set-Location -LiteralPath $AppRoot
$Host.UI.RawUI.WindowTitle = 'EULC Screener'

# The loader window is only needed while packages install or when something
# fails. On a normal launch it hides at once and closes when the app has started.
Add-Type -Namespace EulcLoader -Name Window -MemberDefinition @'
[DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();
[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
'@
function Set-LoaderVisible([bool]$visible) {
    # Cosmetic only: never let window handling stop the app from starting.
    try {
        $handle = [EulcLoader.Window]::GetConsoleWindow()
        if ($handle -and $handle -ne [IntPtr]::Zero) { [void][EulcLoader.Window]::ShowWindow($handle, $(if ($visible) { 5 } else { 0 })) }
    } catch {}
}

$electron = Join-Path $AppRoot 'node_modules\electron\dist\electron.exe'
$installStamp = Join-Path $AppRoot 'node_modules\.eulc-install-stamp'

function Test-ElectronRuntime {
    foreach ($file in @('node_modules\electron\package.json', 'node_modules\electron\dist\electron.exe', 'node_modules\electron\dist\resources\default_app.asar', 'node_modules\electron\dist\version')) {
        if (-not (Test-Path -LiteralPath (Join-Path $AppRoot $file) -PathType Leaf)) { return $false }
    }
    $package = Get-Content -LiteralPath (Join-Path $AppRoot 'node_modules\electron\package.json') -Raw | ConvertFrom-Json
    $installedVersion = (Get-Content -LiteralPath (Join-Path $AppRoot 'node_modules\electron\dist\version') -Raw).Trim().TrimStart('v')
    return $installedVersion -eq $package.version
}

function Get-LockHash {
    (Get-FileHash -LiteralPath (Join-Path $AppRoot 'package-lock.json') -Algorithm SHA256).Hash
}

# Packages are reinstalled only when package-lock.json changed since the last
# successful install, or the Electron runtime is missing or damaged.
function Test-InstallCurrent {
    if (-not (Test-Path -LiteralPath $installStamp -PathType Leaf)) { return $false }
    if ((Get-Content -LiteralPath $installStamp -Raw).Trim() -ne (Get-LockHash)) { return $false }
    return (Test-ElectronRuntime)
}

function Install-Packages {
    Set-LoaderVisible $true
    $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
    $node = if ($nodeCommand) { $nodeCommand.Source } else { Join-Path $env:ProgramFiles 'nodejs\node.exe' }
    if (-not (Test-Path -LiteralPath $node -PathType Leaf)) {
        throw 'Node.js was not found. Install Node.js LTS from https://nodejs.org/, then retry.'
    }
    $npm = Join-Path (Split-Path -Parent $node) 'npm.cmd'
    if (-not (Test-Path -LiteralPath $npm -PathType Leaf)) {
        throw "npm.cmd was not found beside Node.js: $npm"
    }
    # npm lifecycle scripts must also be able to find this Node installation.
    $env:Path = (Split-Path -Parent $node) + ';' + $env:Path

    Write-Host 'Installing packages (first launch or after an update) ...' -ForegroundColor Cyan
    # Electron is a development dependency and must be installed even in production environments.
    & $npm install --include=dev --ignore-scripts=false --no-audit --no-fund --loglevel=error
    if ($LASTEXITCODE -ne 0) {
        Write-Host 'npm install failed. Checking existing packages before attempting startup...' -ForegroundColor Yellow
    }
    & $npm ls --include=dev --depth=0
    if ($LASTEXITCODE -ne 0) {
        throw 'Required packages are missing or incompatible. Restore network access and run the loader again.'
    }
    if (-not (Test-ElectronRuntime)) {
        Write-Host 'Installing or repairing the Electron desktop runtime ...' -ForegroundColor Cyan
        & $node (Join-Path $AppRoot 'node_modules\electron\install.js')
        if ($LASTEXITCODE -ne 0 -or -not (Test-ElectronRuntime)) {
            throw 'Electron could not be installed. Check your internet connection and run the loader again.'
        }
    }
    Set-Content -LiteralPath $installStamp -Value (Get-LockHash) -Encoding ASCII
}

try {
    foreach ($file in @('app\desktop\main.cjs', 'app\server\server.cjs', 'app\desktop\preload.cjs', 'app\ui\index.html', 'app\paths.cjs', 'app\package.json', 'app\package-lock.json', 'resources\certs\localhost.key', 'resources\certs\localhost.crt')) {
        if (-not (Test-Path -LiteralPath (Join-Path $Root $file) -PathType Leaf)) {
            throw "Required file missing: $file. Extract the entire ZIP, then retry."
        }
    }

    if (Test-InstallCurrent) { Set-LoaderVisible $false } else { Install-Packages }

    # The app's own output goes to logs\ instead of a window. Keep the last 10 launches.
    New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
    Get-ChildItem -LiteralPath $LogDir -Filter 'eulc-*.log' | Sort-Object LastWriteTime -Descending | Select-Object -Skip 20 | Remove-Item -Force -ErrorAction SilentlyContinue
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $process = Start-Process -FilePath $electron -ArgumentList ('"' + $AppRoot + '"') -WorkingDirectory $AppRoot -PassThru `
        -RedirectStandardOutput (Join-Path $LogDir "eulc-$stamp.log") -RedirectStandardError (Join-Path $LogDir "eulc-$stamp-errors.log")

    # A crash during the first seconds is shown here; after that the loader exits.
    if ($process.WaitForExit(4000) -and $process.ExitCode -ne 0) {
        throw "EULC stopped right after starting (exit $($process.ExitCode)). See logs\eulc-$stamp-errors.log"
    }
    exit 0
}
catch {
    Set-LoaderVisible $true
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
