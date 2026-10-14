@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -STA -File "%~dp0zip-core.ps1"
if errorlevel 1 (
    echo.
    echo zip-core failed. See the error above.
    pause
    exit /b 1
)
timeout /t 5 >nul
