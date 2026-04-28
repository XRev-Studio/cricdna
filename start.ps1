# ============================================================
#  Vite Dev Server Launcher (PowerShell)
#  - First run: installs dependencies
#  - Every run: starts dev server and opens it in your browser
# ============================================================

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot
$Host.UI.RawUI.WindowTitle = "Vite Dev Server"

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Starting project: $PWD"
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# --- Check Node.js ---
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Node.js is not installed or not in PATH." -ForegroundColor Red
    Write-Host "Download it from https://nodejs.org and try again."
    Read-Host "Press Enter to exit"
    exit 1
}

# --- First run? Install deps ---
if (-not (Test-Path "node_modules")) {
    Write-Host "[First run detected] Installing dependencies..." -ForegroundColor Yellow
    Write-Host "This may take a minute or two."
    Write-Host ""
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "[ERROR] npm install failed." -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
    Write-Host ""
    Write-Host "[OK] Dependencies installed." -ForegroundColor Green
    Write-Host ""
} else {
    Write-Host "[OK] Dependencies already installed, skipping npm install." -ForegroundColor Green
    Write-Host ""
}

# --- Background job: wait for URL and open browser ---
$logPath = Join-Path $env:TEMP "vite-launch.log"
if (Test-Path $logPath) { Remove-Item $logPath -Force }

Start-Job -ScriptBlock {
    param($log)
    while ($true) {
        if (Test-Path $log) {
            $match = Select-String -Path $log -Pattern 'http://localhost:\d+' | Select-Object -First 1
            if ($match) {
                Start-Process $match.Matches[0].Value
                break
            }
        }
        Start-Sleep -Milliseconds 400
    }
} -ArgumentList $logPath | Out-Null

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Starting Vite dev server..."
Write-Host "  Browser will open automatically."
Write-Host "  Press Ctrl+C here to stop the server."
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# --- Run Vite and tee output to log so the watcher can find the URL ---
npm run dev 2>&1 | Tee-Object -FilePath $logPath

# --- Cleanup ---
Get-Job | Stop-Job -ErrorAction SilentlyContinue
Get-Job | Remove-Job -ErrorAction SilentlyContinue
if (Test-Path $logPath) { Remove-Item $logPath -Force }

Write-Host ""
Write-Host "Server stopped."
Read-Host "Press Enter to exit"
