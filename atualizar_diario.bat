@echo off
REM atualizar_diario.bat - rodado automaticamente todo dia pelo Agendador de Tarefas do
REM Windows (16/08/2026, a pedido do Gabriel). SEM interacao nenhuma (sem "pause") - se travar
REM esperando tecla, a tarefa agendada nunca conclui.
REM
REM O que faz: busca dado novo no Astrobox, regera app_data.js e COMMITA LOCALMENTE.
REM O que NAO faz: git push. Decisao explicita do Gabriel - o site publicado so atualiza
REM quando ele conferir os numeros e rodar "git push" na mao (ou usar
REM atualizar_e_publicar.bat, que ja faz tudo incluindo o push, pro fluxo manual do dia a dia).
REM
REM Se o token do Astrobox (~/.env) tiver expirado (~48h de validade), o passo 1 falha e o
REM script para ai, sem tentar os passos seguintes - confira o log em logs\ e renove o token
REM (ver README.md, secao "Como renovar o token do Astrobox").
REM
REM ATENCAO codificacao: este arquivo eh salvo sem acento de proposito (cmd.exe as vezes
REM engasga em REM/echo com caractere acentuado dependendo do code page ativo).
cd /d "%~dp0"

if not exist "logs" mkdir "logs"
set LOGFILE=logs\atualizacao_%date:~-4,4%-%date:~-7,2%-%date:~-10,2%.log

echo ============================================== >> "%LOGFILE%"
echo Atualizacao diaria automatica - %date% %time% >> "%LOGFILE%"
echo ============================================== >> "%LOGFILE%"

echo [1/3] Buscando dados atualizados no Astrobox... >> "%LOGFILE%"
py scripts\atualizar_dados.py >> "%LOGFILE%" 2>&1
if errorlevel 1 (
  echo FALHOU ao buscar dados - token do Astrobox provavelmente expirado. >> "%LOGFILE%"
  echo Renove em astrobox.hotmart.com e atualize %%USERPROFILE%%\.env. >> "%LOGFILE%"
  exit /b 1
)

echo [2/3] Regerando app_data.js... >> "%LOGFILE%"
node app\build_data.js >> "%LOGFILE%" 2>&1
if errorlevel 1 (
  echo FALHOU ao gerar app_data.js. >> "%LOGFILE%"
  exit /b 1
)

echo [3/3] Commitando localmente (SEM push - confira e publique na mao quando quiser)... >> "%LOGFILE%"
git add app\app_data.js app\validacao_onboarding_data.js >> "%LOGFILE%" 2>&1
git commit -m "data: atualizacao automatica %date%" >> "%LOGFILE%" 2>&1
if errorlevel 1 (
  echo Nada novo para commitar - dados iguais aos do ultimo commit. >> "%LOGFILE%"
) else (
  echo Commit local criado. Rode "git push" quando quiser publicar. >> "%LOGFILE%"
)

echo Concluido - %time% >> "%LOGFILE%"
exit /b 0
