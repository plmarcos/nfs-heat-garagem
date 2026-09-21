@echo off
rem Abre a Garagem 3D NFS Heat.
rem
rem Tenta primeiro a janela propria (pywebview + WebView2). Se ela nao subir --
rem o WebView2 falha em algumas maquinas e a janela fica cinza, sem responder --
rem cai para o navegador, que e' o caminho que sempre funciona.
rem
rem Passe a pasta do acervo se ela nao estiver em F:\CarsNfSHeat:
rem     Garagem.bat --acervo "D:\CarsNfSHeat"
setlocal
cd /d "%~dp0"

where py >nul 2>&1 && (set "PY=py -3.11") || (set "PY=python")

echo Abrindo a garagem numa janela propria...
%PY% garagem_desktop.py %*
if errorlevel 1 (
  echo.
  echo A janela nao abriu. Abrindo no navegador em vez disso...
  echo.
  %PY% garagem.py %*
  if errorlevel 1 (
    echo.
    echo Tambem falhou. Se faltar dependencia, rode:
    echo     %PY% -m pip install -r requirements.txt
    pause
  )
)
endlocal
