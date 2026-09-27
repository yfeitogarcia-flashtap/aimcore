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
rem **Y se avisa tambien al arrancar** (vuelta 93). Subir vive dentro del editor
rem desde esta vuelta, pero una sesion que se cerro sin pulsarlo —o un mapa
rem guardado antes de la 93— deja cambios aqui y no en el juego. Enterarse al
rem abrir es enterarse a tiempo; enterarse al cerrar, ya se ha jugado sin ellos.
rem
rem **Las dos carpetas que escribe Alchemist** (vuelta 94): los mapas y las
rem imagenes de estampado, que son media pieza de un mapa que las use.
git status --porcelain -- src/maps public/estampados > "%TEMP%\vektor-mapas.txt" 2>nul
for %%A in ("%TEMP%\vektor-mapas.txt") do set "PENDIENTE=%%~zA"
if not "!PENDIENTE!"=="0" (
  echo.
  echo   OJO: tienes cosas cambiadas en este PC y NO en el juego:
  echo.
  type "%TEMP%\vektor-mapas.txt"
  echo.
  echo   Subelos desde Alchemist: Archivo ^> Subir al juego.
)
del "%TEMP%\vektor-mapas.txt" >nul 2>&1

echo.
echo [3/3] Abriendo Alchemist...
echo.
echo   Se abrira el navegador solo. Si no:  http://localhost:5173/editor/
echo   El juego, en la misma direccion sin  /editor/
echo.
echo   Para que un mapa llegue al juego: boton "Subir al juego", en Archivo.
echo   La barra de arriba te dice si tienes alguno sin subir.
echo.
echo   Para cerrarlo: cierra esta ventana cuando hayas subido.
echo.
call npm run editor

rem ---------------------------------------------------------------------------
rem 4. Al cerrar, la red (vuelta 91, corregida en la 93).
rem
rem Guardar un mapa en Alchemist escribe src\maps\<clave>.js en ESTE PC y nada
rem mas: el juego que se juega es el que esta desplegado, y ahi llega lo que se
rem sube al repositorio.
rem
rem Esto era el unico sitio donde se subia, y por eso no subia: esta DETRAS de
rem `call npm run editor`, que no vuelve hasta que Vite muere, y las dos formas
rem de cerrar que este script anunciaba lo matan antes de llegar aqui —Ctrl+C
rem hace que cmd.exe pregunte si terminar el trabajo por lotes y aborte, y
rem cerrar la ventana se lleva el arbol de procesos entero—. Un paso inalcanzable
rem justo como se usa es un paso que no existe, y no daba ningun error.
rem
rem Desde la 93 se sube desde el editor, con un boton. Esto se queda como red
rem para cuando el proceso si vuelve por su cuenta.
rem
rem Se suben SOLO src\maps y public\estampados: si tienes cualquier otra cosa a
rem medias, se queda donde esta. Y lo normal es que si: pulsar Enter sube.
rem ---------------------------------------------------------------------------
echo.
echo ================================================
echo   Mapas e imagenes sin subir
echo ================================================
git status --porcelain -- src/maps public/estampados > "%TEMP%\vektor-mapas.txt" 2>nul
for %%A in ("%TEMP%\vektor-mapas.txt") do set "PENDIENTE=%%~zA"
if "!PENDIENTE!"=="0" (
  echo   Nada que subir: lo que hay aqui es lo que hay en el juego.
  del "%TEMP%\vektor-mapas.txt" >nul 2>&1
  goto :fin
)
echo   Esto esta cambiado en este PC y NO en el juego:
echo.
type "%TEMP%\vektor-mapas.txt"
del "%TEMP%\vektor-mapas.txt" >nul 2>&1
echo.
set "SUBIR="
set /p "SUBIR=  Subirlos ahora? [S/n] "
if /i "!SUBIR!"=="n" (
  echo   Vale, se quedan aqui. La proxima vez te lo vuelvo a preguntar.
  goto :fin
)

git add -- src/maps public/estampados
git -c core.editor=true commit -q -m "mapas: cambios desde Alchemist"
if errorlevel 1 (
  echo   No he podido anotar los cambios. Pasaselo a Code tal cual.
  goto :fin
)
rem Traer lo de fuera antes de empujar: si mientras editabas ha entrado codigo
rem nuevo, empujar sin esto se rechaza y no dice por que.
git pull --rebase --autostash origin "!RAMA!" >nul 2>&1
git push origin "!RAMA!"
if errorlevel 1 (
  echo.
  echo   No he podido subirlos. Tus mapas siguen guardados aqui, anotados y
  echo   sin perder nada: pasale a Code lo que pone arriba.
  goto :fin
)
echo.
echo   Subidos. En unos minutos estan en el juego.

:fin
echo.
pause
endlocal
