@echo off
REM ============================================================
REM  Vite Dev Server Launcher
REM  - First run: installs dependencies
REM  - Every run: starts dev server and opens it in your browser
REM ============================================================

setlocal enabledelayedexpansion
cd /d "%~dp0"

title Vite Dev Server

echo.
echo ============================================
echo   Starting project: %CD%
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js is not installed or not in PATH.
    echo Download it from https://nodejs.org and try again.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo [First run detected] Installing dependencies...
    echo This may take a minute or two.
    echo.
    call npm install
    if errorlevel 1 (
        echo.
        echo [ERROR] npm install failed. See messages above.
        pause
        exit /b 1
    )
    echo.
    echo [OK] Dependencies installed.
    echo.
) else (
    echo [OK] Dependencies already installed, skipping npm install.
    echo.
)

start "" /b powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$log = '%TEMP%\vite-launch.log';" ^
    "while ($true) {" ^
    "  if (Test-Path $log) {" ^
    "    $match = Select-String -Path $log -Pattern 'http://localhost:\d+' | Select-Object -First 1;" ^
    "    if ($match) { Start-Process $match.Matches[0].Value; break }" ^
    "  }" ^
    "  Start-Sleep -Milliseconds 400" ^
    "}"

echo ============================================
echo   Starting Vite dev server...
echo   Browser will open automatically.
echo   Press Ctrl+C here to stop the server.
echo ============================================
echo.

call npm run dev 2>&1 | powershell -NoProfile -Command "$input | Tee-Object -FilePath '%TEMP%\vite-launch.log'"

del "%TEMP%\vite-launch.log" >nul 2>nul

echo.
echo Server stopped.
pause
