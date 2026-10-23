$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$backend = $null

try {
  $backendCommand = "Set-Location '$root'; " +
    "$env:CORS_ORIGINS='http://localhost:3006,http://127.0.0.1:3006'; " +
    "$env:FRONTEND_BASE_URL='http://localhost:3006'; " +
    "$env:GOOGLE_REDIRECT_URI='http://localhost:3006/api/auth/google/callback'; " +
    "$env:FACEBOOK_REDIRECT_URI='http://localhost:3006/api/auth/facebook/callback'; " +
    "& '.\.venv\Scripts\python.exe' -m uvicorn be.app.main:app --host 0.0.0.0 --port 8081 --reload --reload-dir be"

  $backend = Start-Process -FilePath "powershell.exe" -ArgumentList "-NoProfile", "-Command", $backendCommand -WorkingDirectory $root -PassThru
  $env:PORT = '3006'
  $env:BACKEND_BASE_URL = 'http://127.0.0.1:8081'
  npm --prefix fe run dev
}
finally {
  if ($backend -and -not $backend.HasExited) {
    Stop-Process -Id $backend.Id -Force
  }
}
