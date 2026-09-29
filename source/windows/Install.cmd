@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install.ps1"
if errorlevel 1 (
  echo Installation needs attention. Read the message above.
  pause
  exit /b 1
)
pause
