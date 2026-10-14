# Archives the portable EULC project and copies the ZIP file to the Windows clipboard.
# Includes all file types, including resources/data, HTTPS certificates, icons and scripts.
# Excludes downloads, installed npm packages, Git metadata and existing ZIP/partial archives.
# Source files are read only; no project files or folders are removed.
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$SkipDirNames = @('node_modules', 'downloads', '.git')
$SkipExtensions = @('.zip', '.partial')

try { $CairoZone = [TimeZoneInfo]::FindSystemTimeZoneById('Egypt Standard Time') }
catch { $CairoZone = [TimeZoneInfo]::FindSystemTimeZoneById('Africa/Cairo') }
$hashAlgorithm = [Security.Cryptography.SHA256]::Create()
try { $hashBytes = $hashAlgorithm.ComputeHash([Text.Encoding]::UTF8.GetBytes($Root.ToLowerInvariant())) }
finally { $hashAlgorithm.Dispose() }
$projectId = ([BitConverter]::ToString($hashBytes).Replace('-', '').ToLowerInvariant()).Substring(0, 16)
$Cache = Join-Path ([IO.Path]::GetTempPath()) "EULC Screener Clipboard\$projectId"
$mutex = [Threading.Mutex]::new($false, "Local\EULCScreenerZip_$projectId")
$locked = $false
$RunDir = $null
$ZipPath = $null
$ZipName = $null
$archive = $null
$keepZip = $false

function Get-SourceFiles([string]$Dir, [string]$Rel) {
    foreach ($item in Get-ChildItem -LiteralPath $Dir -Force) {
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { continue }
        $childRel = if ($Rel) { "$Rel/$($item.Name)" } else { $item.Name }
        if ($item.PSIsContainer) {
            if ($SkipDirNames -contains $item.Name.ToLowerInvariant()) { continue }
            Get-SourceFiles $item.FullName $childRel
        }
        elseif ($SkipExtensions -notcontains $item.Extension.ToLowerInvariant()) {
            [pscustomobject]@{ Full = $item.FullName; Rel = $childRel; ModifiedUtc = $item.LastWriteTimeUtc }
        }
    }
}

try {
    try { $locked = $mutex.WaitOne(0) }
    catch [Threading.AbandonedMutexException] { $locked = $true }
    if (-not $locked) { throw 'Another archive is running. Wait for it to finish, then retry.' }
    foreach ($required in @('app\package.json', 'app\desktop\main.cjs', 'scripts\loader\Start EULC.cmd', 'resources\certs\localhost.crt', 'resources\certs\localhost.key')) {
        if (-not (Test-Path -LiteralPath (Join-Path $Root $required) -PathType Leaf)) {
            throw "Required project file missing: $required. Place this tool in the project's scripts\zipper folder."
        }
    }
    $files = @(Get-SourceFiles $Root '' | Sort-Object Rel)
    if ($files.Count -eq 0) { throw "No project files found under $Root" }
    $projectTime = [TimeZoneInfo]::ConvertTimeFromUtc([DateTime]::UtcNow, $CairoZone)
    $ZipName = "EULC Screener $($projectTime.ToString('yyyy-MM-dd HHmmss')).zip"
    $RunDir = Join-Path $Cache ("clip-" + [Guid]::NewGuid().ToString('N'))
    [void][IO.Directory]::CreateDirectory($RunDir)
    $ZipPath = Join-Path $RunDir $ZipName
    $partial = "$ZipPath.partial"
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [IO.Compression.ZipFile]::Open($partial, [IO.Compression.ZipArchiveMode]::Create)
    foreach ($file in $files) {
        $entry = $archive.CreateEntry("eulc-screener/$($file.Rel)", [IO.Compression.CompressionLevel]::Optimal)
        $wallTime = [TimeZoneInfo]::ConvertTimeFromUtc($file.ModifiedUtc, $CairoZone)
        if ($wallTime.Year -lt 1980) { $wallTime = [DateTime]::new(1980, 1, 1) }
        if ($wallTime.Year -gt 2107) { $wallTime = [DateTime]::new(2107, 12, 31, 23, 59, 58) }
        # ZIP stores wall-clock fields without a timezone.
        $entry.LastWriteTime = [DateTimeOffset]::new([DateTime]::SpecifyKind($wallTime, [DateTimeKind]::Unspecified), [TimeSpan]::Zero)
        # Set metadata before Open(): Create-mode entries become immutable once written.
        $inputStream = $null
        $entryStream = $null
        try {
            $inputStream = [IO.File]::OpenRead($file.Full)
            $entryStream = $entry.Open()
            $inputStream.CopyTo($entryStream)
        }
        finally {
            if ($entryStream) { $entryStream.Dispose() }
            if ($inputStream) { $inputStream.Dispose() }
        }
    }
    $archive.Dispose()
    $archive = $null
    Move-Item -LiteralPath $partial -Destination $ZipPath
    # Retain a complete ZIP if copying to the clipboard fails.
    $keepZip = $true
    Add-Type -AssemblyName System.Windows.Forms
    $list = New-Object Collections.Specialized.StringCollection
    [void]$list.Add($ZipPath)
    $data = New-Object Windows.Forms.DataObject
    $data.SetFileDropList($list)
    $data.SetData('Preferred DropEffect', (New-Object IO.MemoryStream (,[byte[]](1, 0, 0, 0))))
    [Windows.Forms.Clipboard]::SetDataObject($data, $true)
    foreach ($dir in Get-ChildItem -LiteralPath $Cache -Directory -Filter 'clip-*') {
        if ($dir.FullName -ne $RunDir) {
            try { Remove-Item -LiteralPath $dir.FullName -Recurse -Force }
            catch { Write-Warning "Could not clear previous temporary ZIP: $($_.Exception.Message)" }
        }
    }
    Write-Host "ZIP copied to clipboard: $ZipName ($($files.Count) files)" -ForegroundColor Green
    Write-Host 'Paste it where needed. The next successful archive replaces the temporary file.'
}
catch {
    $message = $_.Exception.Message
    if ($archive) { $archive.Dispose(); $archive = $null }
    if ($RunDir -and -not $keepZip) { Remove-Item -LiteralPath $RunDir -Recurse -Force -ErrorAction SilentlyContinue }
    Write-Host $message -ForegroundColor Red
    if ($keepZip) { Write-Host "ZIP saved at: $ZipPath" }
    exit 1
}
finally {
    if ($locked) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
