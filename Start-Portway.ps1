$ErrorActionPreference = 'Stop'
$portwayRoot = $PSScriptRoot
$portwayNode = (Get-Command node).Source
$portwayUrl = 'http://127.0.0.1:4173'
try { $portwayRunning = (Invoke-WebRequest -Uri "$portwayUrl/manifest.webmanifest" -TimeoutSec 2).Content -like '*Portway*' } catch { $portwayRunning = $false }
if (-not $portwayRunning) {
    Start-Process -FilePath $portwayNode -ArgumentList ('"' + (Join-Path $portwayRoot 'server.mjs') + '"') -WorkingDirectory $portwayRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $portwayRoot 'server.log') -RedirectStandardError (Join-Path $portwayRoot 'server-error.log')
    Start-Sleep -Milliseconds 700
}
Start-Process $portwayUrl
