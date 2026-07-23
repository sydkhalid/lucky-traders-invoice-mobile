@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found in PATH.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8095/health' -TimeoutSec 2; Write-Host ('Lucky Traders sync server is already running. Revision: ' + $health.revision); exit 0 } catch { exit 1 }"
if not errorlevel 1 (
  pause
  exit /b 0
)

echo Starting Lucky Traders sync server on the local WiFi...
node sync-server.js
