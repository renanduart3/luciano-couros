@echo off
chcp 65001 >nul
title Instalar Servico - Central de Tecidos
cd /d "%~dp0"

echo Solicitando permissao de administrador...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\ExecutarComoAdministrador.ps1" -Action Install
set "RESULTADO=%ERRORLEVEL%"

echo.
if not "%RESULTADO%"=="0" (
    echo A instalacao nao foi concluida.
) else (
    echo Servico e icone da bandeja instalados com sucesso.
)
echo.
pause
exit /b %RESULTADO%
