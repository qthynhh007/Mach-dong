[CmdletBinding()]
param([ValidateRange(1024,65535)][int]$Port = 5000)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$previousPort = $env:MACH_DONG_LOCAL_WEB_PORT
Push-Location -LiteralPath $root
try {
    $env:MACH_DONG_LOCAL_WEB_PORT = [string]$Port
    & .\.venv\Scripts\python.exe scripts/run-local.py
    if ($LASTEXITCODE -ne 0) { throw 'Không khởi động được bản cục bộ. Kiểm tra cổng và thông báo phía trên.' }
} finally {
    $env:MACH_DONG_LOCAL_WEB_PORT = $previousPort
    Pop-Location
}
