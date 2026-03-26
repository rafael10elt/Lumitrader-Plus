@echo off
setlocal

set "ROOT=%~dp0"
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "VBS_SOURCE=%ROOT%start_mt5_reporter_hidden.vbs"
set "VBS_TARGET=%STARTUP%\Lumitrader MT5 Reporter.vbs"

if not exist "%VBS_SOURCE%" (
  echo Arquivo nao encontrado: "%VBS_SOURCE%"
  exit /b 1
)

copy /Y "%VBS_SOURCE%" "%VBS_TARGET%" >nul
if errorlevel 1 (
  echo Falha ao copiar para a pasta Startup.
  exit /b 1
)

echo Inicializacao automatica instalada em:
echo %VBS_TARGET%
echo.
echo Reinicie a VPS ou faca logoff/logon para testar.
exit /b 0