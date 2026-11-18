[CmdletBinding()]
param(
    [ValidateRange(1024, 65535)]
    [int]$Port = 5000
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node.exe -ErrorAction Stop).Source
$python = Join-Path $root '.venv\Scripts\python.exe'
$worker = $null
$previousUrl = $env:SIMULATION_API_URL
$previousMode = $env:SIMULATION_LOCAL_MODE

if (-not (Test-Path -LiteralPath $python)) {
    throw 'Chưa có môi trường Python .venv. Hãy cài theo README.'
}

Push-Location -LiteralPath $root
try {
    $nodeArguments = @()
    foreach ($file in @('.env', '.env.local')) {
        if (Test-Path -LiteralPath $file -PathType Leaf) { $nodeArguments += "--env-file=$file" }
    }
    $nodeArguments += 'server/local.mjs'
    $worker = Start-Process -FilePath $node -ArgumentList $nodeArguments -WindowStyle Hidden -PassThru
    $catalogReady = $false
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        if ($worker.HasExited) { throw 'Máy chủ mô phỏng dừng khi khởi động. Kiểm tra Node.js và cổng 8787.' }
        try {
            $health = Invoke-RestMethod 'http://127.0.0.1:8787/api/health' -TimeoutSec 1
            if ($health.data.status -eq 'ok') {
                $catalogReady = $true
                break
            }
        } catch { Start-Sleep -Milliseconds 200 }
    }
    if (-not $catalogReady) { throw 'Máy chủ mô phỏng chưa phản hồi ở cổng 8787.' }

    $env:SIMULATION_API_URL = 'http://127.0.0.1:8787'
    $env:SIMULATION_LOCAL_MODE = '1'
    & $python -m flask --app main:app run --host 127.0.0.1 --port $Port
} finally {
    if ($worker -and -not $worker.HasExited) { Stop-Process -Id $worker.Id }
    $env:SIMULATION_API_URL = $previousUrl
    $env:SIMULATION_LOCAL_MODE = $previousMode
    Pop-Location
}
