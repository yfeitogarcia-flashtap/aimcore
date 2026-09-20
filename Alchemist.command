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
echo ""
echo "[3/3] Abriendo Alchemist..."
echo ""
echo "  Se abrirá el navegador solo. Si no:  http://localhost:5173/editor/"
echo "  El juego, en la misma dirección sin  /editor/"
echo ""
echo "  Para cerrarlo: pulsa Ctrl+C aquí, o cierra esta ventana."
echo ""
npm run editor

fin "Alchemist se ha cerrado." 0
