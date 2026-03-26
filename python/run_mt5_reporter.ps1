param(
  [string]$PythonExe = "$PSScriptRoot\.venv\Scripts\python.exe",
  [string]$ScriptPath = "$PSScriptRoot\mt5_reporter.py",
  [string]$LogDir = "$PSScriptRoot\logs"
)

$ErrorActionPreference = "Stop"

New-Item -ItemType Directory -Path $LogDir -Force | Out-Null

$stdoutLog = Join-Path $LogDir "mt5_reporter.out.log"
$stderrLog = Join-Path $LogDir "mt5_reporter.err.log"

if (-not (Test-Path $PythonExe)) {
  throw "Python nao encontrado em $PythonExe"
}

if (-not (Test-Path $ScriptPath)) {
  throw "Script nao encontrado em $ScriptPath"
}

$workingDir = Split-Path -Path $ScriptPath -Parent
Set-Location $workingDir

& $PythonExe $ScriptPath 1>> $stdoutLog 2>> $stderrLog
exit $LASTEXITCODE