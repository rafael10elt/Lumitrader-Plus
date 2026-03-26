@echo off
setlocal

set "ROOT=%~dp0"
set "PYTHON_EXE=%ROOT%.venv\Scripts\python.exe"
set "SCRIPT_PATH=%ROOT%mt5_reporter.py"
set "LOG_DIR=%ROOT%logs"
set "STDOUT_LOG=%LOG_DIR%\mt5_reporter.out.log"
set "STDERR_LOG=%LOG_DIR%\mt5_reporter.err.log"

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

if not exist "%PYTHON_EXE%" (
  echo Python nao encontrado em "%PYTHON_EXE%"
  exit /b 1
)

if not exist "%SCRIPT_PATH%" (
  echo Script nao encontrado em "%SCRIPT_PATH%"
  exit /b 1
)

cd /d "%ROOT%"
"%PYTHON_EXE%" "%SCRIPT_PATH%" 1>> "%STDOUT_LOG%" 2>> "%STDERR_LOG%"
exit /b %ERRORLEVEL%