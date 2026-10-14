#Requires -Version 5.1
<#
Free offline logical database backup for DXN Supabase.
Requires the free PostgreSQL CLI utilities pg_dump and pg_restore installed on the
OWNER'S Windows computer. DO NOT publish backup files, credentials or screenshots.
The script never alters the database and never creates a paid service.
#>
param([string]$OutputDirectory = (Join-Path $env:USERPROFILE 'Documents\DXN-Private-Backups'))
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if (-not (Get-Command pg_dump -ErrorAction SilentlyContinue)) {
    throw 'pg_dump not installed. Install the free PostgreSQL client tools first. See docs/free-backup-runbook.md.'
}
if (-not (Get-Command pg_restore -ErrorAction SilentlyContinue)) {
    throw 'pg_restore not installed. Install the free PostgreSQL client tools first.'
}
$hostName = Read-Host 'Database host from Supabase Dashboard > Connect (NOT the https API URL)'
$portString = Read-Host 'Database port (usually 5432)'
if ([string]::IsNullOrWhiteSpace($portString)) { $portString = '5432' }
$userName = Read-Host 'Database username from Supabase Dashboard > Connect'
$dbName = Read-Host 'Database name (usually postgres)'
if ([string]::IsNullOrWhiteSpace($dbName)) { $dbName = 'postgres' }
if ([string]::IsNullOrWhiteSpace($hostName) -or [string]::IsNullOrWhiteSpace($userName) -or
    $portString -notmatch '^\d{1,5}$' -or [int]$portString -lt 1 -or [int]$portString -gt 65535) {
    throw 'Invalid host, username or port.'
}
$secure = Read-Host 'Database password (hidden, never send it to ChatGPT or GitHub)' -AsSecureString
if ($secure.Length -eq 0) { throw 'Password is required' }
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
    $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    $env:PGSSLMODE = 'require'
    New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
    $fileName = 'dxn-supabase-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.dump'
    $dest = Join-Path $OutputDirectory $fileName
    if (Test-Path $dest) { throw 'Backup file already exists; refusing overwrite.' }
    Write-Host 'Creating private backup. Please wait. No database changes are made.'
    & pg_dump "--host=$hostName" "--port=$portString" "--username=$userName" "--dbname=$dbName" '--format=custom' '--no-owner' '--no-acl' "--file=$dest"
    if ($LASTEXITCODE -ne 0) {
        Remove-Item -LiteralPath $dest -ErrorAction SilentlyContinue
        throw "pg_dump exited with code $LASTEXITCODE. Backup not completed."
    }
    $archive = Get-Item -LiteralPath $dest
    if ($archive.Length -lt 10240) { throw 'Archive suspiciously small: verify the connection and database privileges.' }
    # Archive readability only. A trial restore into isolated LOCAL PostgreSQL is needed
    # to prove full recoverability.
    & pg_restore '--list' $dest | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Archive verification failed (pg_restore --list).' }
    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $dest).Hash
    $manifest = [ordered]@{
        created_at = (Get-Date).ToUniversalTime().ToString('o')
        type = 'PostgreSQL custom logical dump'
        filename = $fileName
        size_bytes = $archive.Length
        sha256 = $hash
        archive_list_checked = $true
        real_restore_test_completed = $false
        note = 'This archive includes DB objects visible to the supplied PostgreSQL role; Storage object bytes and external service settings are separate.'
    }
    $manifestPath = $dest + '.manifest.json'
    $manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
    Write-Host 'Backup archive and manifest created in the private folder.'
    Write-Host ('Archive: ' + $dest)
    Write-Host ('Bytes: ' + $archive.Length)
    Write-Host ('SHA256: ' + $hash)
    Write-Host 'Next: test restoring into LOCAL isolated PostgreSQL, never production.'
}
finally {
    if ($ptr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
    Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:\PGSSLMODE -ErrorAction SilentlyContinue
}
