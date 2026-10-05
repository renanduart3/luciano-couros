@echo off
chcp 65001 >nul
title Migrar dados - Central de Tecidos
cd /d "%~dp0"
echo O sistema sera parado para copiar e validar os bancos em uma pasta externa.
echo Os arquivos originais serao preservados para conferencia.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\ExecutarComoAdministrador.ps1" -Action MigrateData
set "RESULTADO=%ERRORLEVEL%"
pause
exit /b %RESULTADO%
