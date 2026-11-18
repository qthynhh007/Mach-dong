$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $projectRoot
try {
    & .\.venv\Scripts\python.exe -m PyInstaller --noconfirm --clean --onefile --windowed --name MachDong --add-data 'src/views:src/views' --add-data 'src/static:src/static' --add-data 'data/reference:data/reference' --add-data 'data/station-context:data/station-context' desktop.py
    if ($LASTEXITCODE -ne 0) { throw 'Build failed' }
    Get-Item -LiteralPath (Join-Path $projectRoot 'dist/MachDong.exe') | Select-Object FullName,Length
} finally {
    Pop-Location
}
