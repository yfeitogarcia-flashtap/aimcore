@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
goto :arrancar
rem Lo de debajo es un colchon, y va aqui a proposito: leelo en :arrancar.
                                                                      
                                                                      
                                                                      
                                                                      
                                                                      
                                                                      
                                                                      
                                                                      
                                                                      
                                                                      
                                                                      
                                                                      
                                                                      
                                                                      
                                                                      
                                                                      
                                                                      
                                                                      
                                                                      
                                                                      
                                                                      
                                                                      
                                                                      
                                                                      
                                                                      
                                                                      
                                                                      
                                                                      
                                                                      
                                                                      
                                                                      
                                                                      
                                                                      
                                                                      
                                                                      
                                                                      
                                                                      
                                                                      
                                                                      
                                                                      
rem ---------------------------------------------------------------------------
rem Aqui cae el Alchemist.bat de antes de la vuelta 99 cuando esta actualizacion
rem lo reescribe mientras corre (ver :arrancar). Solo se llega aqui asi.
rem ---------------------------------------------------------------------------
echo.
echo ================================================
echo   Alchemist se ha actualizado mientras arrancaba.
echo ================================================
echo.
echo   No he abierto el editor ni he subido nada.
echo   Cierra esta ventana y vuelve a abrir Alchemist con doble clic:
echo   a partir de ahora arranca con la version nueva.
echo.
pause
exit /b

rem ===========================================================================
rem :arrancar
rem
rem **Alchemist en un doble clic** (vuelta 81; rehecho en la 99).
rem
rem Trae lo ultimo, instala lo que haya cambiado, abre el editor y, al cerrar,
rem ofrece subir los mapas. Todo lo que toca git lo hace
rem `scripts\alchemist.mjs`, que es lo mismo que usa el boton "Subir al juego"
rem del editor y `Alchemist.command`: tres copias de "que es un conflicto" es
rem como una de las tres acabo ofreciendo subir un fichero con las marcas de
rem conflicto dentro (vuelta 99).
rem
rem **Por que este fichero se copia a %TEMP% antes de hacer nada.** cmd.exe no
rem lee un .bat entero: lo vuelve a abrir en cada linea y sigue por el byte
rem donde se quedo. Si traer la version nueva reescribe este mismo fichero, la
rem ventana sigue leyendo el nuevo por la mitad y ejecuta lo que caiga ahi.
rem Corriendo desde una copia, lo que se reescribe es otro fichero. El colchon
rem de espacios de arriba es para el .bat de antes de la 99, que no se copiaba:
rem es donde cae la primera vez, y dice que se vuelva a abrir.
rem
rem **Y una sola ventana a la vez.** Dos a la vez (un doble clic de mas)
rem peleaban por el mismo repositorio: la primera fallaba con "cannot lock ref"
rem y su camino de fallo deshacia lo que estaba haciendo la segunda. El cerrojo
rem es un fichero que esta ventana tiene abierto, y Windows lo suelta solo al
rem cerrarla: no se queda puesto si la ventana se cierra de golpe.
rem ===========================================================================
:arrancar
if /i "%~1"=="--copia" (
  set "ORIGEN=%~2"
  set "ENCOPIA=1"
  goto :empezar
)
set "COPIA=%TEMP%\vektor-alchemist-%RANDOM%%RANDOM%.bat"
copy /y "%~f0" "!COPIA!" >nul 2>&1 && "!COPIA!" --copia "%~dp0."
rem Si no se ha podido copiar se sigue desde aqui, que funciona igual salvo el
rem dia que la actualizacion cambie este mismo fichero.
set "ORIGEN=%~dp0."
set "ENCOPIA="

:empezar
cd /d "!ORIGEN!"
set "ENTRO="
9>"%TEMP%\vektor-alchemist.lock" call :principal
if not defined ENTRO (
  echo.
  echo ================================================
  echo   Ya hay otro Alchemist abierto.
  echo ================================================
  echo.
  echo   Mira en la barra de tareas: usa esa ventana. Abrir dos a la vez hace que
  echo   las dos peleen por los mismos ficheros. Esta no ha tocado nada.
  echo.
  pause
)
if not defined ENCOPIA exit /b
rem La copia de %TEMP% se borra a si misma al terminar.
(goto) 2>nul & del "%~f0"

:principal
set "ENTRO=1"
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
where node >nul 2>&1
if errorlevel 1 (
  echo No encuentro Node.js.
  echo Instalalo desde https://nodejs.org ^(version LTS^) y vuelve a abrir esto.
  goto :fin
)

rem ---------------------------------------------------------------------------
rem 1. Traer lo ultimo SIN MEZCLAR NUNCA (vuelta 99).
rem
rem Antes era `git pull --rebase --autostash`, y cuando chocaba al devolver tus
rem cambios git terminaba "bien", dejaba las marcas dentro del mapa y guardaba
rem tu copia en una pila de la que el camino de fallo sacaba luego la que no
rem era. Ahora solo se avanza si nada tuyo choca con lo nuevo; si choca, te lo
rem dice, no toca nada y pregunta. Si sale con error, aqui se para: no se abre
rem el editor.
rem ---------------------------------------------------------------------------
node scripts\alchemist.mjs actualizar
if errorlevel 1 goto :fin

rem ---------------------------------------------------------------------------
rem 2. Instalar solo si hace falta.
rem
rem Se compara el fichero de dependencias con la copia de la ultima vez que se
rem instalo de verdad. Una marca de fecha no vale: traer la version nueva
rem reescribe el fichero aunque su contenido no haya cambiado.
rem ---------------------------------------------------------------------------
echo.
echo [2/3] Revisando dependencias...
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
rem 3. Abrir el editor, avisando antes de lo que haya sin subir (vuelta 93).
rem ---------------------------------------------------------------------------
:abrir
node scripts\alchemist.mjs avisar
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
rem 4. Al cerrar, la red (vuelta 91, corregida en la 93 y en la 99).
rem
rem Solo se llega aqui si Vite vuelve por su cuenta: cerrar la ventana o Ctrl+C
rem matan el .bat antes. Por eso se sube desde el editor, con un boton. Y desde
rem la 99 esto no ofrece subir NADA si hay un conflicto dentro: lo dice y para.
rem ---------------------------------------------------------------------------
node scripts\alchemist.mjs subir

:fin
echo.
pause
exit /b
