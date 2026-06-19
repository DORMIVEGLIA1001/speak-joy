$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$backend = $null

try {
  $backend = Start-Process -FilePath "npm.cmd" -ArgumentList "--prefix", "be", "run", "dev:backend" -WorkingDirectory $root -PassThru
  npm --prefix fe run dev
}
finally {
  if ($backend -and -not $backend.HasExited) {
    Stop-Process -Id $backend.Id -Force
  }
}
