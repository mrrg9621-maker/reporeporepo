$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$AppRoot = Join-Path $Root 'app'
Set-Location -LiteralPath $AppRoot
$Host.UI.RawUI.WindowTitle = 'EULC Screener'

try {
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
    foreach ($file in @('app\desktop\main.cjs', 'app\server\server.cjs', 'app\desktop\preload.cjs', 'app\ui\index.html', 'app\paths.cjs', 'app\package.json', 'app\package-lock.json', 'resources\certs\localhost.key', 'resources\certs\localhost.crt')) {
        if (-not (Test-Path -LiteralPath (Join-Path $Root $file) -PathType Leaf)) {
            throw "Required file missing: $file. Extract the entire ZIP, then retry."
        }
    }
    $electron = Join-Path $AppRoot 'node_modules\electron\dist\electron.exe'
    $electronInstaller = Join-Path $AppRoot 'node_modules\electron\install.js'
    function Test-ElectronRuntime {
        foreach ($file in @('node_modules\electron\dist\electron.exe', 'node_modules\electron\dist\resources\default_app.asar', 'node_modules\electron\dist\version')) {
            if (-not (Test-Path -LiteralPath (Join-Path $AppRoot $file) -PathType Leaf)) { return $false }
        }
        $package = Get-Content -LiteralPath (Join-Path $AppRoot 'node_modules\electron\package.json') -Raw | ConvertFrom-Json
        $installedVersion = (Get-Content -LiteralPath (Join-Path $AppRoot 'node_modules\electron\dist\version') -Raw).Trim().TrimStart('v')
        return $installedVersion -eq $package.version
    }
    do {
        Write-Host 'npm install ...' -ForegroundColor Cyan
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
            & $node $electronInstaller
            if ($LASTEXITCODE -ne 0 -or -not (Test-ElectronRuntime)) {
                throw 'Electron could not be installed. Check your internet connection and run the loader again.'
            }
        }
        Write-Host 'Starting EULC Screener and its HTTPS server ...' -ForegroundColor Cyan
        & $electron $AppRoot
        Write-Host "EULC stopped (exit $LASTEXITCODE)."
        $answer = Read-Host '[R] restart / any other key then Enter to close'
    } while ($answer -eq 'R')
    exit 0
}
catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
