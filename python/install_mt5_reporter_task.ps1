param(
  [string]$TaskName = "Lumitrader MT5 Reporter",
  [string]$ReporterScript = "$PSScriptRoot\run_mt5_reporter.ps1"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $ReporterScript)) {
  throw "Script nao encontrado em $ReporterScript"
}

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$ReporterScript`""
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName

Write-Host "Tarefa registrada e iniciada: $TaskName"