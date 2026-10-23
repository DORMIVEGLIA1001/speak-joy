param(
  [string]$LocalDatabaseUrl = $env:LOCAL_DATABASE_URL,
  [string]$SupabaseDatabaseUrl = $env:SUPABASE_DATABASE_URL,
  [string]$OutputFile = "kids_english_backup.sql",
  [string]$PostgresBin = $env:POSTGRES_BIN
)

$ErrorActionPreference = "Stop"

if (-not $LocalDatabaseUrl) {
  throw "Missing LOCAL_DATABASE_URL. Example: `$env:LOCAL_DATABASE_URL='postgresql://postgres:password@localhost:5432/kids_english'"
}

if (-not $SupabaseDatabaseUrl) {
  throw "Missing SUPABASE_DATABASE_URL. Set it to your Supabase PostgreSQL connection string."
}

if (-not $PostgresBin) {
  $pgDumpCommand = Get-Command pg_dump.exe -ErrorAction SilentlyContinue
  if ($pgDumpCommand) {
    $PostgresBin = Split-Path $pgDumpCommand.Source
  } elseif (Test-Path "D:\postgresql-18.3-2-windows-x64-binaries\bin\pg_dump.exe") {
    $PostgresBin = "D:\postgresql-18.3-2-windows-x64-binaries\bin"
  } else {
    throw "Could not find pg_dump.exe. Set POSTGRES_BIN to the PostgreSQL bin folder."
  }
}

$pgDump = Join-Path $PostgresBin "pg_dump.exe"
$psql = Join-Path $PostgresBin "psql.exe"

if (-not (Test-Path $pgDump)) {
  throw "pg_dump.exe not found at $pgDump"
}

if (-not (Test-Path $psql)) {
  throw "psql.exe not found at $psql"
}

Write-Host "Dumping local database to $OutputFile ..."
& $pgDump $LocalDatabaseUrl --clean --if-exists --no-owner --no-privileges -f $OutputFile

Write-Host "Restoring $OutputFile to Supabase ..."
& $psql $SupabaseDatabaseUrl -v ON_ERROR_STOP=1 -f $OutputFile

Write-Host "Done. Tables in public schema:"
& $psql $SupabaseDatabaseUrl -c "\dt public.*"
