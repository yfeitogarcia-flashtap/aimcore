@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"

rem **Alchemist en un doble clic** (vuelta 81).
rem
rem Hace lo que antes habia que escribir a mano y en orden —traer lo ultimo,
rem instalar lo que haya cambiado y abrir el editor—, y si algo sale mal lo dice
rem en castellano en vez de dejar un error de git en una ventana que se cierra.
rem
rem En Windows: doble clic en este fichero. Nada mas.
rem En Mac o Linux no es este: es `Alchemist.command`, al lado.

echo ================================================
echo   Vektor . Alchemist
echo ================================================
echo.

where git >nul 2>&1
if errorlevel 1 (
  echo No encuentro git.
  echo Instalalo desde https://git-scm.com y vuelve a abrir esto.
  goto :fin
)
where npm >nul 2>&1
if errorlevel 1 (
  echo No encuentro Node.js.
  echo Instalalo desde https://nodejs.org ^(version LTS^) y vuelve a abrir esto.
  goto :fin
)

rem ---------------------------------------------------------------------------
rem 1. Traer lo ultimo SIN PERDER TUS MAPAS.
rem
rem Tu editas mapas en src\maps y nosotros tocamos codigo: las dos cosas caen en
rem el mismo repositorio. `--autostash` guarda lo tuyo, trae lo nuestro y lo
rem vuelve a poner encima. Solo choca si hemos tocado el mismo fichero que tu, y
rem en ese caso se deshace solo y te lo dice, en vez de dejarte a medias.
rem ---------------------------------------------------------------------------
echo [1/3] Trayendo la ultima version...
for /f "delims=" %%r in ('git rev-parse --abbrev-ref HEAD') do set "RAMA=%%r"
echo       rama: !RAMA!

git pull --rebase --autostash origin "!RAMA!"
if errorlevel 1 (
  git rebase --abort >nul 2>&1
  git stash pop >nul 2>&1
  echo.
  echo No he podido traer la ultima version sin pisar algo tuyo.
  echo Tus cambios siguen donde estaban: no se ha perdido nada.
  echo Pasaselo a Code tal cual y lo resolvemos.
  goto :fin
)

rem ---------------------------------------------------------------------------
rem 2. Instalar solo si hace falta.
rem ---------------------------------------------------------------------------
echo.
echo [2/3] Revisando dependencias...
rem Se compara el fichero de dependencias con la copia que se guardo la ultima
rem vez que se instalo de verdad. Una marca de fecha no vale: `git pull` reescribe
rem el fichero aunque su contenido no haya cambiado, y entonces se instalaria en
rem cada arranque.
if not exist "node_modules\.vektor-instalado" goto :instalar
fc /b package-lock.json "node_modules\.vektor-instalado" >nul 2>&1
if errorlevel 1 goto :instalar
echo       todo al dia, no hay nada que instalar.
goto :abrir

:instalar
call npm install
if errorlevel 1 (
  echo.
  echo La instalacion de dependencias ha fallado.
  echo Pasale a Code lo que pone arriba.
  goto :fin
)
copy /y package-lock.json "node_modules\.vektor-instalado" >nul

rem ---------------------------------------------------------------------------
rem 3. Abrir el editor.
rem
rem `npm run editor` levanta Vite y abre el navegador en /editor/. Con el
rem levantado, el juego tambien esta en la raiz de esa misma direccion.
rem ---------------------------------------------------------------------------
:abrir
echo.
echo [3/3] Abriendo Alchemist...
echo.
echo   Se abrira el navegador solo. Si no:  http://localhost:5173/editor/
echo   El juego, en la misma direccion sin  /editor/
echo.
echo   Para cerrarlo: pulsa Ctrl+C aqui, o cierra esta ventana.
echo.
call npm run editor

:fin
echo.
pause
endlocal
