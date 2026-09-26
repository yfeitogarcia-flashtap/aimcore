#!/bin/sh
# **Alchemist en un doble clic** (vuelta 81).
#
# Hace lo que antes había que escribir a mano y en orden —traer lo último,
# instalar lo que haya cambiado y abrir el editor—, y si algo sale mal lo dice
# en castellano en vez de dejar un error de git en una ventana que se cierra.
#
# En **macOS**: doble clic en este fichero. La primera vez, si el sistema no lo
# deja ejecutar, abre la Terminal en esta carpeta y pega `chmod +x
# Alchemist.command` una sola vez.
# En **Linux**: doble clic (Ejecutar en terminal) o `./Alchemist.command`.
# En **Windows** no es éste: es `Alchemist.bat`, al lado.

cd "$(dirname "$0")" || exit 1

fin() {
  echo ""
  echo "$1"
  echo ""
  echo "Pulsa Intro para cerrar."
  read -r _
  exit "${2:-1}"
}

echo "================================================"
echo "  Vektor · Alchemist"
echo "================================================"
echo ""

command -v git  >/dev/null 2>&1 || fin "No encuentro git. Instálalo desde https://git-scm.com y vuelve a abrir esto."
command -v node >/dev/null 2>&1 || fin "No encuentro Node.js. Instálalo desde https://nodejs.org (versión LTS) y vuelve a abrir esto."

# --------------------------------------------------------------------------
# 1. Traer lo último **sin perder tus mapas**.
#
# Tú editas mapas en `src/maps/` y nosotros tocamos código: las dos cosas caen
# en el mismo repositorio. `--autostash` guarda lo tuyo, trae lo nuestro y lo
# vuelve a poner encima. Sólo choca si hemos tocado el mismo fichero que tú, y
# en ese caso se deshace solo y te lo dice, en vez de dejarte a medias.
# --------------------------------------------------------------------------
echo "[1/3] Trayendo la última versión..."
rama="$(git rev-parse --abbrev-ref HEAD 2>/dev/null)"
echo "      rama: $rama"

if ! git pull --rebase --autostash origin "$rama"; then
  git rebase --abort >/dev/null 2>&1
  git stash pop    >/dev/null 2>&1
  fin "No he podido traer la última versión sin pisar algo tuyo.
Tus cambios siguen donde estaban: no se ha perdido nada.
Pásaselo a Code tal cual y lo resolvemos."
fi

# --------------------------------------------------------------------------
# 2. Instalar sólo si hace falta.
#
# Se compara el fichero de dependencias con la copia que se guardó la última
# vez que se instaló de verdad. Una marca de fecha no vale: `git pull` reescribe
# el fichero aunque su contenido no haya cambiado, y entonces se instalaría en
# cada arranque.
# --------------------------------------------------------------------------
echo ""
echo "[2/3] Revisando dependencias..."
if [ ! -d node_modules ] || ! cmp -s package-lock.json node_modules/.vektor-instalado; then
  npm install || fin "La instalación de dependencias ha fallado. Pásale a Code lo que pone arriba."
  cp package-lock.json node_modules/.vektor-instalado
else
  echo "      todo al día, no hay nada que instalar."
fi

# --------------------------------------------------------------------------
# 3. Abrir el editor.
#
# `npm run editor` levanta Vite y abre el navegador en `/editor/`. Con él
# levantado, el juego también está en la raíz de esa misma dirección.
# --------------------------------------------------------------------------
# **Y se avisa también al arrancar** (vuelta 93). Subir vive dentro del editor
# desde esta vuelta, pero una sesión que se cerró sin pulsarlo —o un mapa
# guardado antes de la 93— deja cambios aquí y no en el juego.
sin_subir="$(git status --porcelain -- src/maps 2>/dev/null)"
if [ -n "$sin_subir" ]; then
  echo ""
  echo "  OJO: tienes mapas cambiados en este ordenador y NO en el juego:"
  echo ""
  echo "$sin_subir"
  echo ""
  echo "  Súbelos desde Alchemist: Archivo > Subir al juego."
fi

echo ""
echo "[3/3] Abriendo Alchemist..."
echo ""
echo "  Se abrirá el navegador solo. Si no:  http://localhost:5173/editor/"
echo "  El juego, en la misma dirección sin  /editor/"
echo ""
echo "  Para que un mapa llegue al juego: botón \"Subir al juego\", en Archivo."
echo "  La barra de arriba te dice si tienes alguno sin subir."
echo ""
echo "  Para cerrarlo: cierra esta ventana cuando hayas subido."
echo ""
npm run editor

# -----------------------------------------------------------------------------
# 4. Al cerrar, la red (vuelta 91, corregida en la 93).
#
# Guardar un mapa en Alchemist escribe src/maps/<clave>.js en ESTE ordenador y
# nada más: el juego que se juega es el desplegado, y ahí llega lo que se sube
# al repositorio.
#
# Esto era el único sitio donde se subía, y por eso no subía: está DETRÁS de
# `npm run editor`, que no vuelve hasta que Vite muere, y las dos formas de
# cerrar que este script anunciaba lo matan antes de llegar aquí —Ctrl+C va al
# grupo de procesos entero, incluido este script, y cerrar la ventana también—.
# Un paso inalcanzable justo como se usa es un paso que no existe, y no daba
# ningún error. Desde la 93 se sube desde el editor; esto es la red.
#
# Se sube SÓLO src/maps: si tienes cualquier otra cosa a medias, se queda donde
# está. Y lo normal es que sí: pulsar Intro sube.
# -----------------------------------------------------------------------------
echo ""
echo "================================================"
echo "  Mapas sin subir"
echo "================================================"
pendientes="$(git status --porcelain -- src/maps 2>/dev/null)"
if [ -z "$pendientes" ]; then
  fin "Nada que subir: lo que hay aquí es lo que hay en el juego." 0
fi
echo "  Estos mapas están cambiados en este ordenador y NO en el juego:"
echo ""
echo "$pendientes"
echo ""
printf "  ¿Subirlos ahora? [S/n] "
read -r subir
case "$subir" in
  n|N)
    fin "Vale, se quedan aquí. La próxima vez te lo vuelvo a preguntar." 0
    ;;
esac

git add -- src/maps
if ! git commit -q -m "mapas: cambios desde Alchemist"; then
  fin "No he podido anotar los cambios. Pásaselo a Code tal cual." 1
fi
# Traer lo de fuera antes de empujar: si mientras editabas ha entrado código
# nuevo, empujar sin esto se rechaza y no dice por qué.
git pull --rebase --autostash origin "$rama" >/dev/null 2>&1
if ! git push origin "$rama"; then
  fin "No he podido subirlos. Tus mapas siguen aquí, anotados y sin perder nada: pásale a Code lo que pone arriba." 1
fi

fin "Subidos. En unos minutos están en el juego." 0
