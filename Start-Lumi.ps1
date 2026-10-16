param([switch]$LocalOnly, [switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$appRoot = $PSScriptRoot
$serverPath = Join-Path $appRoot 'server.mjs'
$port = 3477
$url = "http://localhost:$port"
$healthUrl = "http://127.0.0.1:$port/api/health"
$running = $false
try {
    $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
    $running = $health.ok -and $health.application -eq 'lumi'
} catch { }
if (-not $running) {
    $nodeCommand = Get-Command node -CommandType Application -ErrorAction SilentlyContinue
    $nodePath = if ($env:LUMI_NODE) { $env:LUMI_NODE } elseif ($nodeCommand) { $nodeCommand.Source } else { $null }
    if (!$nodePath -or !(Test-Path -LiteralPath $nodePath -PathType Leaf)) {
        throw 'Install Node.js 22+ and add it to PATH, or set LUMI_NODE to the full path to node.exe.'
    }
    $nodeVersion = & $nodePath --version
    if ($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch '^v(\d+)\.' -or [int]$Matches[1] -lt 22) {
        throw 'Node.js 22+ is required. Update Node.js, then run this launcher again.'
    }
    $logRoot = Join-Path $appRoot 'logs'
    New-Item -ItemType Directory -Path $logRoot -Force | Out-Null
    $env:LUMI_PORT = "$port"
    $env:LUMI_HOST = if ($LocalOnly) { '127.0.0.1' } else { '0.0.0.0' }
    $env:LUMI_DATA_DIR = Join-Path $appRoot 'data'
    $process = Start-Process -FilePath $nodePath -ArgumentList @(('"' + $serverPath + '"')) -WorkingDirectory $appRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logRoot 'server.log') -RedirectStandardError (Join-Path $logRoot 'server-error.log')
    Set-Content -LiteralPath (Join-Path $appRoot 'lumi.pid') -Value $process.Id -Encoding ascii
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Milliseconds 200
        try { $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2; if ($health.ok -and $health.application -eq 'lumi') { $running = $true; break } } catch { }
        if ($process.HasExited) { break }
    }
    if (-not $running) { throw "Lumi did not start. Check $logRoot\server-error.log. Port $port may be in use." }
    Set-Content -LiteralPath (Join-Path $appRoot 'lumi.pid') -Value $process.Id -Encoding ascii
}
Write-Output "Lumi: $url"
if (-not $LocalOnly) {
    Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -ne '127.0.0.1' -and $_.IPAddress -notlike '169.254.*' -and $_.PrefixOrigin -ne 'WellKnown' } | ForEach-Object { Write-Output "Android, same home network: http://$($_.IPAddress):$port" }
}
if (-not $NoBrowser) { Start-Process $url }
