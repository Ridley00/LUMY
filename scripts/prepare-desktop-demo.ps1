param([Parameter(Mandatory=$true)][string]$ExecutablePath)
$ErrorActionPreference = 'Stop'
$lumiExecutable = (Resolve-Path -LiteralPath $ExecutablePath).Path
if ((Split-Path -Leaf $lumiExecutable) -notmatch '^Lumi-\d+\.\d+\.\d+-Windows-x64\.exe$') { throw 'Expected a packaged Lumi executable.' }
$lumiWorkspace = Split-Path -Parent $PSScriptRoot
$lumiSource = Join-Path $lumiWorkspace 'data\family.json'
$lumiDemoRoot = Join-Path $env:APPDATA 'Lumi-Demo'
$lumiDemoData = Join-Path $lumiDemoRoot 'data'
$lumiDemoFamily = Join-Path $lumiDemoData 'family.json'
$lumiNormalFamily = Join-Path $env:APPDATA 'Lumi\data\family.json'
$lumiOriginalHash = if (Test-Path -LiteralPath $lumiNormalFamily) { (Get-FileHash -LiteralPath $lumiNormalFamily -Algorithm SHA256).Hash } else { $null }
if (-not (Test-Path -LiteralPath $lumiDemoFamily)) {
    $lumiBrowserFamily = Get-Content -LiteralPath $lumiSource -Raw | ConvertFrom-Json
    if (@($lumiBrowserFamily.profiles | Where-Object { $_.name -notin @('Гость','Тестовый ученик') }).Count -gt 0) { throw 'The browser data contains non-test profiles. Nothing was copied.' }
    $lumiGuest = @($lumiBrowserFamily.profiles | Where-Object { $_.name -eq 'Гость' -and $_.age -eq 9 -and $_.level -eq 3 })
    if ($lumiGuest.Count -ne 1 -or -not $lumiBrowserFamily.parent.passwordHash) { throw 'The expected test guest was not found.' }
    $lumiDemo = [ordered]@{version=1;parent=$lumiBrowserFamily.parent;profiles=@($lumiGuest[0]);attempts=@();homework=@();settings=@{aiEnabled=$false;aiModel=''}}
    New-Item -ItemType Directory -Path $lumiDemoData -Force | Out-Null
    $lumiStream = [System.IO.File]::Open($lumiDemoFamily,[System.IO.FileMode]::CreateNew,[System.IO.FileAccess]::Write,[System.IO.FileShare]::None)
    $lumiWriter = [System.IO.StreamWriter]::new($lumiStream,[System.Text.UTF8Encoding]::new($false))
    try { $lumiWriter.Write(($lumiDemo | ConvertTo-Json -Depth 12)) } finally { $lumiWriter.Dispose() }
}
$lumiDesktop = [Environment]::GetFolderPath('DesktopDirectory')
$lumiDownloads = Join-Path ([Environment]::GetFolderPath('UserProfile')) 'Downloads'
$lumiLinkPaths = @()
$lumiShell = New-Object -ComObject WScript.Shell
foreach ($lumiFolder in @($lumiDesktop,$lumiDownloads)) {
    if (-not (Test-Path -LiteralPath $lumiFolder -PathType Container)) { throw 'Shortcut destination is absent.' }
    $lumiLinkPath = Join-Path $lumiFolder 'Луми - тест ребёнка.lnk'
    $lumiLink = $lumiShell.CreateShortcut($lumiLinkPath)
    if ((Test-Path -LiteralPath $lumiLinkPath) -and ($lumiLink.Arguments -ne '--demo' -or (Split-Path -Leaf $lumiLink.TargetPath) -notmatch '^Lumi-\d+\.\d+\.\d+-Windows-x64\.exe$')) { throw 'A different shortcut already uses this name.' }
    $lumiLink.TargetPath = $lumiExecutable
    $lumiLink.Arguments = '--demo'
    $lumiLink.WorkingDirectory = Split-Path -Parent $lumiExecutable
    $lumiLink.IconLocation = $lumiExecutable + ',0'
    $lumiLink.Description = 'Тестовый кабинет Луми с отдельными учебными данными'
    $lumiLink.Save()
    $lumiLinkPaths += $lumiLinkPath
}
$lumiDataUnchanged = if ($lumiOriginalHash) { (Get-FileHash -LiteralPath $lumiNormalFamily -Algorithm SHA256).Hash -eq $lumiOriginalHash } else { -not (Test-Path -LiteralPath $lumiNormalFamily) }
if (-not $lumiDataUnchanged) { throw 'The normal family file changed during preparation. It was not written by this script.' }
[pscustomobject]@{ok=$true;executable=$lumiExecutable;shortcuts=$lumiLinkPaths;demoData=$lumiDemoFamily;normalFamilyUnchanged=$lumiDataUnchanged} | ConvertTo-Json -Depth 4 -Compress
