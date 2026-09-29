$ErrorActionPreference = 'Stop'
$runtime = Split-Path -Parent $PSScriptRoot
$node = Join-Path $runtime 'bin\node.exe'
$setup = Join-Path $runtime 'agent\setup.mjs'
$logs = Join-Path $runtime 'logs'
New-Item -ItemType Directory -Path $logs -Force | Out-Null
# One supervisor per logged-in Windows session. Edge uses this interactive desktop.
$mutex = New-Object System.Threading.Mutex($false, 'Local\eVisaOperatorSupervisor')
$owned = $false
try {
    try { $owned = $mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $owned = $true }
    if (!$owned) { exit 0 }
    Set-Location (Join-Path $runtime 'agent')
    $env:EVISA_SETUP_SETTINGS_ONLY = '0'
    Remove-Item Env:EVISA_SETUP_PARENT -ErrorAction SilentlyContinue
    while ($true) {
        $ErrorActionPreference = 'Continue'
        & $node $setup 1>> (Join-Path $logs 'worker.log') 2>> (Join-Path $logs 'error.log')
        $ErrorActionPreference = 'Stop'
        Start-Sleep -Seconds 15
    }
} finally {
    if ($owned) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
