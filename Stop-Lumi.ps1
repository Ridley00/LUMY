$ErrorActionPreference = 'Stop'
$pidFile = Join-Path $PSScriptRoot 'lumi.pid'
if (-not (Test-Path -LiteralPath $pidFile)) { Write-Output 'No launcher PID file. Nothing stopped.'; exit }
$serverPid = [int](Get-Content -LiteralPath $pidFile -Raw)
$entry = Get-CimInstance Win32_Process -Filter "ProcessId = $serverPid" -ErrorAction SilentlyContinue
$expected = [regex]::Escape((Join-Path $PSScriptRoot 'server.mjs'))
if ($entry -and $entry.Name -eq 'node.exe' -and $entry.CommandLine -match ('(?:^|\s)"?' + $expected + '"?(?:\s|$)')) {
    Stop-Process -Id $serverPid
    Remove-Item -LiteralPath $pidFile
    Write-Output 'Lumi stopped. Family data was kept.'
} elseif ($entry) { throw 'PID belongs to another command. It was not stopped.' } else { Remove-Item -LiteralPath $pidFile; Write-Output 'Lumi is already stopped.' }
