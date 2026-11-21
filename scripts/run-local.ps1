[CmdletBinding()]
param(
    [ValidateRange(1024,65535)][int]$Port = 5000,
    [ValidateRange(1024,65535)][int]$ApiPort = 0,
    [switch]$Restart,
    [switch]$Check
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $root
try {
    $python = Join-Path $root '.venv\Scripts\python.exe'
    if (-not (Test-Path -LiteralPath $python)) {
        Write-Host 'Tạo môi trường Python cho máy này...'
        if (Get-Command py -ErrorAction SilentlyContinue) {
            & py -3 -m venv .venv
        } elseif (Get-Command python -ErrorAction SilentlyContinue) {
            & python -m venv .venv
        } else {
            throw 'Cần cài Python 3.12 trở lên (bật Add Python to PATH), rồi mở lại PowerShell.'
        }
        if ($LASTEXITCODE -ne 0) { throw 'Không tạo được môi trường Python.' }
    }
    & $python -c "import sys; sys.exit(0 if sys.version_info >= (3,12) else 1)"
    if ($LASTEXITCODE -ne 0) { throw 'Cần Python 3.12 trở lên. Tạo lại .venv bằng đúng phiên bản.' }
    $requirementsHash = & $python -c "import hashlib; from pathlib import Path; print(hashlib.sha256(Path('requirements.txt').read_bytes()).hexdigest())"
    if ($LASTEXITCODE -ne 0) { throw 'Không đọc được requirements.txt.' }
    $stamp = Join-Path $root '.venv\mach-dong-requirements.sha256'
    if (-not (Test-Path -LiteralPath $stamp) -or (Get-Content -LiteralPath $stamp -Raw).Trim() -ne $requirementsHash) {
        Write-Host 'Cài các thư viện Python (lần đầu cần Internet)...'
        & $python -m pip install -r requirements.txt
        if ($LASTEXITCODE -ne 0) { throw 'Cài thư viện thất bại. Kiểm tra Internet rồi chạy lại.' }
        Set-Content -LiteralPath $stamp -Value $requirementsHash
    }
    if ($Check) {
        & $python scripts/run-local.py --check
        if ($LASTEXITCODE -ne 0) { throw 'Backend chưa sẵn sàng. Xem thông báo phía trên; chế độ shared không yêu cầu key trên máy này.' }
        return
    }
    if ($Restart) {
        & "$PSScriptRoot\stop-local.ps1"
    }
    $previousPort = $env:MACH_DONG_LOCAL_WEB_PORT
    $previousApiPort = $env:MACH_DONG_LOCAL_API_PORT
    try {
        $env:MACH_DONG_LOCAL_WEB_PORT = [string]$Port
        if ($ApiPort -gt 0) {
            $env:MACH_DONG_LOCAL_API_PORT = [string]$ApiPort
        } elseif ($Port -ne 5000) {
            $env:MACH_DONG_LOCAL_API_PORT = [string](8787 + ($Port - 5000))
        }
        & $python scripts/run-local.py
        if ($LASTEXITCODE -ne 0) { throw 'Không khởi động được bản cục bộ. Kiểm tra cổng và thông báo phía trên.' }
    } finally {
        $env:MACH_DONG_LOCAL_WEB_PORT = $previousPort
        $env:MACH_DONG_LOCAL_API_PORT = $previousApiPort
    }
} finally {
    Pop-Location
}
