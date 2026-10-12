param([Parameter(Mandatory=$true)][string]$ExecutablePath,[switch]$Demo)
$ErrorActionPreference = 'Stop'
$artifactPath = (Resolve-Path -LiteralPath $ExecutablePath).Path
$workspace = Split-Path -Parent $PSScriptRoot
$tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\')
$testRoot = Join-Path $tempRoot ('lumi-portable-test-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testRoot | Out-Null
$oldTest = $env:LUMI_DESKTOP_TEST
$oldData = $env:LUMI_DESKTOP_USER_DATA
$startedAt = Get-Date
$wrapper = $null
$info = $null
try {
    $env:LUMI_DESKTOP_TEST = '1'
    $env:LUMI_DESKTOP_USER_DATA = $testRoot
    $launchOptions = @{FilePath=$artifactPath;WindowStyle='Hidden';PassThru=$true}
    if ($Demo) { $launchOptions.ArgumentList = '--demo' }
    $wrapper = Start-Process @launchOptions
    $readyFile = Join-Path $testRoot 'desktop-ready.json'
    $deadline = (Get-Date).AddSeconds(60)
    while ((Get-Date) -lt $deadline) {
        if (Test-Path -LiteralPath $readyFile) {
            try { $info = Get-Content -LiteralPath $readyFile -Raw | ConvertFrom-Json; break } catch { }
        }
        Start-Sleep -Milliseconds 400
    }
    if (-not $info) { throw 'The portable EXE did not start its application within 60 seconds.' }
    if ($info.origin -notmatch '^http://127\.0\.0\.1:\d+$') { throw 'Unexpected test server address.' }
    $health = Invoke-RestMethod -Uri ($info.origin + '/api/health') -TimeoutSec 5
    $boot = Invoke-RestMethod -Uri ($info.origin + '/api/bootstrap') -TimeoutSec 5
    $page = Invoke-WebRequest -Uri ($info.origin + '/') -TimeoutSec 5 -UseBasicParsing
    $packagedVersion = (Get-Content -LiteralPath (Join-Path $workspace 'package.json') -Raw | ConvertFrom-Json).version
    if (-not $health.ok -or $health.application -ne 'lumi' -or $health.version -ne $packagedVersion) { throw 'Portable health/version mismatch.' }
    if (-not $info.packaged -or $info.webPreferences.nodeIntegration -or -not $info.webPreferences.contextIsolation -or -not $info.webPreferences.sandbox) { throw 'Portable runtime security check failed.' }
    if ([bool]$info.demo -ne [bool]$Demo -or [bool]$boot.demo -ne [bool]$Demo) { throw 'Portable demo argument was not applied correctly.' }
    if ($boot.configured -or $boot.profiles.Count -ne 0) { throw 'User data was included in the portable build or test isolation failed.' }
    if ($page.StatusCode -ne 200 -or $page.Content -notmatch '/app.js') { throw 'Application interface was not served.' }
    $report = [pscustomobject]@{
        ok = $true
        verifiedAt = (Get-Date).ToUniversalTime().ToString('o')
        artifact = $artifactPath
        version = $health.version
        portableStarted = $true
        packaged = $info.packaged
        demo = $info.demo
        interfaceHttpStatus = $page.StatusCode
        initialFamilyEmpty = (-not $boot.configured)
        security = $info.webPreferences
    }
    $reportName = if ($Demo) { 'test-output\portable-demo-launch-report.json' } else { 'test-output\portable-launch-report.json' }
    $report | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $workspace $reportName) -Encoding utf8
    $report | ConvertTo-Json -Depth 5 -Compress
} finally {
    $env:LUMI_DESKTOP_TEST = $oldTest
    $env:LUMI_DESKTOP_USER_DATA = $oldData
    if ($info -and $info.pid) {
        $target = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + [int]$info.pid) -ErrorAction SilentlyContinue
        if ($target) {
            $targetPath = [System.IO.Path]::GetFullPath($target.ExecutablePath)
            if ($target.Name -eq 'Lumi.exe' -and $targetPath.StartsWith($tempRoot + '\',[System.StringComparison]::OrdinalIgnoreCase) -and $target.CreationDate -ge $startedAt.AddSeconds(-2)) {
                Stop-Process -Id ([int]$info.pid) -ErrorAction SilentlyContinue
            } else { Write-Warning 'Did not stop a process whose identity could not be verified.' }
        }
    }
    if ($wrapper) { $null = $wrapper.WaitForExit(15000) }
    $resolvedTest = [System.IO.Path]::GetFullPath($testRoot)
    if ((Split-Path -Parent $resolvedTest) -eq $tempRoot -and (Split-Path -Leaf $resolvedTest) -like 'lumi-portable-test-*') {
        for ($i = 0; $i -lt 10; $i++) {
            try { Remove-Item -LiteralPath $resolvedTest -Recurse -Force; break } catch { Start-Sleep -Milliseconds 300 }
        }
    }
}
