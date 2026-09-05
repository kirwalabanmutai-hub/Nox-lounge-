# ============================================================
#  Register Nox Lounge POS to start automatically at logon
#  (uses the built-in Windows Task Scheduler - no downloads).
#
#  Run once, from this folder, in PowerShell:
#      powershell -ExecutionPolicy Bypass -File .\install-autostart.ps1
#
#  Remove later with:
#      schtasks /Delete /TN "NoxLoungePOS" /F
# ============================================================

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$bat  = Join-Path $here 'start-pos.bat'

if (-not (Test-Path $bat)) { throw "start-pos.bat not found next to this script." }

$action    = New-ScheduledTaskAction -Execute $bat -WorkingDirectory $here
$trigger   = New-ScheduledTaskTrigger -AtLogOn
$settings  = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries `
             -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName 'NoxLoungePOS' -Action $action -Trigger $trigger `
    -Settings $settings -Principal $principal -Force `
    -Description 'Starts the Nox Lounge POS server at logon (http://localhost:4000)'

Write-Host ''
Write-Host 'Done. The POS server will start automatically next time you sign in.' -ForegroundColor Green
Write-Host 'Start it now without rebooting:  schtasks /Run /TN "NoxLoungePOS"'
