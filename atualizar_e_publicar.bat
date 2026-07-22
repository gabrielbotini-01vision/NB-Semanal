@echo off
REM Um comando so: busca dados novos no Astrobox, regera o app_data.js e publica no GitHub.
REM Requer ASTROBOX_TOKEN valido em %USERPROFILE%\.env (token expira em ~48h - se falhar
REM no passo 1, gere um novo em astrobox.hotmart.com e atualize o .env).
cd /d "%~dp0"

echo [1/3] Buscando dados atualizados no Astrobox...
python scripts\atualizar_dados.py
if errorlevel 1 (
  echo.
  echo Falhou ao buscar dados - veja o erro acima ^(token expirado?^).
  pause
  exit /b 1
)

echo.
echo [2/3] Regerando app_data.js...
node app\build_data.js
if errorlevel 1 (
  echo.
  echo Falhou ao gerar app_data.js.
  pause
  exit /b 1
)

echo.
echo [3/3] Publicando no GitHub...
git add app\app_data.js
git commit -m "data: atualizacao automatica"
if errorlevel 1 (
  echo Nada novo para commitar ^(dados iguais aos do ultimo commit^).
) else (
  git push
)

echo.
echo Pronto.
pause
