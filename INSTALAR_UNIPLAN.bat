@echo off
setlocal
cd /d "%~dp0"
title Instalar UniPlan 3.0
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar.ps1"
if errorlevel 1 (
  echo.
  echo A instalacao falhou. Consulta a mensagem acima.
  pause
  exit /b 1
)
echo.
pause
