@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-Lumi.ps1" %*
if errorlevel 1 pause
