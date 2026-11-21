[CmdletBinding(SupportsShouldProcess)]
param()
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$venvPython = Join-Path $root '.venv\Scripts\python.exe'
$targets = Get-CimInstance Win32_Process | Where-Object {
    $line = [string]$_.CommandLine
    $inRepository = $line.IndexOf($root, [StringComparison]::OrdinalIgnoreCase) -ge 0
    $isLauncher = $line -match '(?:run-local\.py|run-shared\.py|main\.py)(?:["\s]|$)'
    $isLocalApi = $line.IndexOf((Join-Path $root 'server\local.mjs'), [StringComparison]::OrdinalIgnoreCase) -ge 0
    $isOurPython = [string]$_.ExecutablePath -eq $venvPython
    ($_.ProcessId -ne $PID) -and (($inRepository -and $isLauncher -and $isOurPython) -or $isLocalApi)
}
foreach ($target in $targets) {
    if ($PSCmdlet.ShouldProcess("Mạch Đồng PID $($target.ProcessId)", 'Dừng máy chủ của checkout này')) {
        Stop-Process -Id $target.ProcessId -ErrorAction SilentlyContinue
    }
}
if (-not $targets) {
    Write-Host 'Không tìm thấy máy chủ thuộc checkout này. Nếu dùng Python hệ thống, dừng bằng Ctrl+C ở terminal đã mở.'
}
