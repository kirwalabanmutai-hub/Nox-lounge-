@echo off
REM ============================================================
REM  Open the POS as a full-screen "app" window.
REM  Uses Chrome or Edge in --app mode with silent receipt
REM  printing (--kiosk-printing prints to the DEFAULT printer
REM  with no dialog - set your receipt printer as default).
REM ============================================================
set URL=http://localhost:4000
set FLAGS=--app=%URL% --kiosk-printing --start-maximized

set CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe
if exist "%CHROME%" ( start "" "%CHROME%" %FLAGS% & exit /b )

set CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe
if exist "%CHROME%" ( start "" "%CHROME%" %FLAGS% & exit /b )

set EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe
if exist "%EDGE%" ( start "" "%EDGE%" %FLAGS% & exit /b )

REM Fallback: default browser, normal window
start "" "%URL%"
