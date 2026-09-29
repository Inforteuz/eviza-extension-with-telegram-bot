# Installs only for the current Windows user; never copies Mac credentials/data.
[CmdletBinding()]
param([string]$InstallDirectory = (Join-Path $env:LOCALAPPDATA 'eVisa Operator'))
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Invoke-Checked([string]$Program, [string[]]$Arguments) {
    if (!(Test-Path -LiteralPath $Program)) { throw "Program not found: $Program" }
    $previousPreference = $ErrorActionPreference
    try { $ErrorActionPreference = 'Continue'; & $Program @Arguments; $code = $LASTEXITCODE }
    finally { $ErrorActionPreference = $previousPreference }
    if ($code -ne 0) { throw "Command failed: $Program (exit $code)" }
}

try {
    if ([Environment]::OSVersion.Version.Build -lt 22000) { throw 'This package targets Windows 11. Windows 10 needs a separate compatibility check.' }
    if ($env:PROCESSOR_ARCHITECTURE -ne 'AMD64') { throw 'This package requires Windows x64 (Intel or AMD).' }
    $packageRoot = Split-Path -Parent $PSScriptRoot
    if (!(Test-Path (Join-Path $packageRoot 'agent\package-lock.json'))) { throw 'Extract the complete ZIP before running Install.cmd.' }
    $InstallDirectory = [IO.Path]::GetFullPath($InstallDirectory)
    if (Test-Path (Join-Path $InstallDirectory 'agent\data')) { throw 'Existing bot data found. Use the installed shortcuts; do not reinstall over an existing bot.' }
    $oldServer = $null
    try { $oldServer = Invoke-WebRequest 'http://127.0.0.1:47831/status' -UseBasicParsing -TimeoutSec 2 } catch {}
    if ($oldServer) { throw 'An existing settings service is running on port 47831. Stop it before installing.' }
    New-Item -ItemType Directory -Path $InstallDirectory -Force | Out-Null
    # POSIX chmod does not protect files on Windows. Set inheritable Windows ACLs.
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $acl = New-Object System.Security.AccessControl.DirectorySecurity
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($identity in @($sid, [Security.Principal.SecurityIdentifier]'S-1-5-18')) {
        $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($identity, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
        $acl.AddAccessRule($rule)
    }
    Set-Acl -LiteralPath $InstallDirectory -AclObject $acl
    foreach ($folder in @('agent','lib','windows','bin','downloads')) { New-Item -ItemType Directory -Path (Join-Path $InstallDirectory $folder) -Force | Out-Null }
    Get-ChildItem (Join-Path $packageRoot 'agent') -File | Where-Object { $_.Extension -in @('.mjs','.js','.py','.json','.txt','.html','.onnx') } | Copy-Item -Destination (Join-Path $InstallDirectory 'agent') -Force
    Copy-Item (Join-Path $packageRoot 'lib\domain.ts') (Join-Path $InstallDirectory 'lib\domain.ts') -Force
    Get-ChildItem $PSScriptRoot -File | Where-Object { $_.Extension -in @('.ps1','.mjs') } | Copy-Item -Destination (Join-Path $InstallDirectory 'windows') -Force

    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Write-Host 'Downloading Node.js 24 for Windows...'
    $nodeBase = 'https://nodejs.org/dist/latest-v24.x/'
    $manifest = (Invoke-WebRequest ($nodeBase + 'SHASUMS256.txt') -UseBasicParsing).Content
    $match = [regex]::Match([string]$manifest, '(?m)^([a-f0-9]{64})\s+(node-v24\.\d+\.\d+-win-x64\.zip)\s*$')
    if (!$match.Success) { throw 'The official Node.js checksum manifest did not contain a Windows x64 release.' }
    $zipName = $match.Groups[2].Value
    $download = Join-Path $InstallDirectory ('downloads\' + $zipName)
    Invoke-WebRequest ($nodeBase + $zipName) -OutFile $download -UseBasicParsing
    if ((Get-FileHash $download -Algorithm SHA256).Hash.ToLowerInvariant() -ne $match.Groups[1].Value) { throw 'Node.js download checksum mismatch.' }
    Expand-Archive -LiteralPath $download -DestinationPath (Join-Path $InstallDirectory 'downloads') -Force
    $expanded = Join-Path $InstallDirectory ('downloads\' + [IO.Path]::GetFileNameWithoutExtension($zipName))
    Copy-Item (Join-Path $expanded '*') (Join-Path $InstallDirectory 'bin') -Recurse -Force
    $node = Join-Path $InstallDirectory 'bin\node.exe'
    $npm = Join-Path $InstallDirectory 'bin\node_modules\npm\bin\npm-cli.js'
    $env:Path = (Join-Path $InstallDirectory 'bin') + ';' + $env:Path

    $python = Join-Path $env:LOCALAPPDATA 'Programs\Python\Python312\python.exe'
    if (!(Test-Path $python)) {
        $launcher = Get-Command py.exe -ErrorAction SilentlyContinue
        if ($launcher) { try { $found = & $launcher.Source -3.12 -c 'import sys; print(sys.executable)' 2>$null; if ($LASTEXITCODE -eq 0 -and $found) { $python = [string]($found | Select-Object -Last 1) } } catch {} }
    }
    if (!(Test-Path $python)) {
        $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
        if (!$winget) { throw 'Install Python 3.12 for the current user from python.org, then rerun Install.cmd. Windows App Installer provides winget.' }
        Write-Host 'Installing Python 3.12 for this Windows user...'
        Invoke-Checked $winget.Source @('install','--id','Python.Python.3.12','--exact','--source','winget','--scope','user','--silent','--accept-source-agreements','--accept-package-agreements')
        $python = Join-Path $env:LOCALAPPDATA 'Programs\Python\Python312\python.exe'
    }
    if (!(Test-Path $python)) { throw 'Python 3.12 was not found. Install it for the current Windows user and rerun Install.cmd.' }
    Invoke-Checked $python @('-m','venv',(Join-Path $InstallDirectory 'python'))
    $venvPython = Join-Path $InstallDirectory 'python\Scripts\python.exe'
    Invoke-Checked $venvPython @('-m','pip','install','--disable-pip-version-check','-r',(Join-Path $InstallDirectory 'agent\requirements.txt'))
    Push-Location (Join-Path $InstallDirectory 'agent')
    try { Invoke-Checked $node @($npm,'ci','--omit=dev','--no-audit','--no-fund') } finally { Pop-Location }
    $env:PYTHON_BIN = $venvPython
    Invoke-Checked $node @((Join-Path $InstallDirectory 'agent\platform-check.mjs'))
    Invoke-Checked $node @((Join-Path $InstallDirectory 'windows\initialize.mjs'),$venvPython)

    $shell = New-Object -ComObject WScript.Shell
    $powerShell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $startScript = Join-Path $InstallDirectory 'windows\Start-Bot.ps1'
    foreach ($folder in @([Environment]::GetFolderPath('Desktop'),[Environment]::GetFolderPath('Startup'))) {
        $shortcut = $shell.CreateShortcut((Join-Path $folder 'eVisa Operator.lnk'))
        $shortcut.TargetPath = $powerShell
        $shortcut.Arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $startScript + '"'
        $shortcut.WorkingDirectory = $InstallDirectory
        $shortcut.Description = 'eVisa Operator Telegram bot'
        $shortcut.Save()
    }
    Set-Content -LiteralPath (Join-Path $InstallDirectory 'installed.txt') -Value 'eVisa Operator Windows installer v1' -Encoding ASCII
    Start-Process -FilePath $powerShell -ArgumentList ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $startScript + '"')
    Start-Sleep -Seconds 3
    Start-Process 'http://127.0.0.1:47831/'
    Write-Host 'Installed. Connect Telegram and the AI key in the local settings page.'
    Write-Host 'Use /saudi in Telegram to sign in on this Windows computer.'
} catch {
    Write-Host ('Installation stopped: ' + $_.Exception.Message) -ForegroundColor Red
    exit 1
}
