#!/bin/sh
# **Alchemist en un doble clic** (vuelta 81; rehecho en la 99).
#
# Trae lo último, instala lo que haya cambiado, abre el editor y, al cerrar,
# ofrece subir los mapas. Todo lo que toca git lo hace `scripts/alchemist.mjs`,
# que es lo mismo que usa el botón «Subir al juego» del editor y
# `Alchemist.bat`: tres copias de «qué es un conflicto» es como una de las tres
# acabó ofreciendo subir un fichero con las marcas de conflicto dentro.
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

# --------------------------------------------------------------------------
# **Una sola ventana a la vez** (vuelta 99). Dos a la vez peleaban por el mismo
# repositorio: la primera fallaba con «cannot lock ref» y su camino de fallo
# deshacía lo que estaba haciendo la segunda.
#
# El cerrojo es una carpeta —`mkdir` es atómico— con el número del proceso
# dentro. Si la ventana se cerró de golpe y la carpeta se quedó, el número ya
# no corresponde a nadie vivo y se toma el cerrojo; así no hace falta borrarlo
# a mano nunca.
# --------------------------------------------------------------------------
CERROJO="${TMPDIR:-/tmp}/vektor-alchemist.lock"
if ! mkdir "$CERROJO" 2>/dev/null; then
  otro="$(cat "$CERROJO/pid" 2>/dev/null)"
  if [ -n "$otro" ] && kill -0 "$otro" 2>/dev/null; then
    fin "Ya hay otro Alchemist abierto: usa esa ventana. Abrir dos a la vez hace que las dos peleen por los mismos ficheros. Ésta no ha tocado nada."
  fi
  rm -rf "$CERROJO"
  mkdir "$CERROJO" 2>/dev/null || fin "No he podido tomar el cerrojo de Alchemist en $CERROJO. Pásaselo a Code."
fi
echo $$ > "$CERROJO/pid"
trap 'rm -rf "$CERROJO"' EXIT
trap 'exit 1' HUP INT TERM

echo "================================================"
echo "  Vektor · Alchemist"
echo "================================================"
echo ""

command -v git  >/dev/null 2>&1 || fin "No encuentro git. Instálalo desde https://git-scm.com y vuelve a abrir esto."
command -v node >/dev/null 2>&1 || fin "No encuentro Node.js. Instálalo desde https://nodejs.org (versión LTS) y vuelve a abrir esto."

# --------------------------------------------------------------------------
# 1. Traer lo último **sin mezclar nunca** (vuelta 99).
#
# Antes era `git pull --rebase --autostash`, y cuando chocaba al devolver tus
# cambios git terminaba «bien», dejaba las marcas dentro del mapa y guardaba
# tu copia en una pila de la que el camino de fallo sacaba luego la que no era.
# Ahora sólo se avanza si nada tuyo choca con lo nuevo; si choca, lo dice, no
# toca nada y pregunta. Si sale con error, aquí se para: no se abre el editor.
# --------------------------------------------------------------------------
node scripts/alchemist.mjs actualizar || fin "No se ha abierto el editor." 1

# --------------------------------------------------------------------------
# 2. Instalar sólo si hace falta: se compara el fichero de dependencias con la
# copia de la última vez que se instaló de verdad.
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
# 3. Abrir el editor, avisando antes de lo que haya sin subir (vuelta 93).
# --------------------------------------------------------------------------
node scripts/alchemist.mjs avisar
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

# --------------------------------------------------------------------------
# 4. Al cerrar, la red (vuelta 91, corregida en la 93 y en la 99): no ofrece
# subir NADA si hay un conflicto dentro. Lo dice y para.
# --------------------------------------------------------------------------
if node scripts/alchemist.mjs subir; then
  fin "" 0
fi
fin "" 1
