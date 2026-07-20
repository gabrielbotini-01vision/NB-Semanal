@echo off
REM Regenera app/app_data.js a partir dos CSVs em Dados/.
REM Uso: substitua os CSVs em Dados/ pelos novos exports e de dois cliques neste arquivo.
cd /d "%~dp0"
node app\build_data.js
echo.
pause
