@echo off
REM ============================================================
REM  Nox Lounge POS - start the local server
REM  Double-click this file, then open http://localhost:4000
REM ============================================================
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Get the LTS from https://nodejs.org  ^(need v22.5+^)
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo First run - installing dependencies ^(needs internet once^)...
  call npm install --no-audit --no-fund
)

echo.
echo   Nox Lounge POS  ->  http://localhost:4000
echo   Keep this window open while the shop is trading. Close it to stop.
echo.
node src\server.js
pause
