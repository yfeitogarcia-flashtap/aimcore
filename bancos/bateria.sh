#!/bin/bash
# La batería entera (vuelta 106). Cada banco sale con 1 si imprime un fallo
# (vuelta 105), así que el resumen es el código de salida de cada uno.
#
#   bash bancos/dev.sh            # antes, y en otra orden (CLAUDE.md §4)
#   npx vite build                # el huésped sirve dist/
#   bash bancos/bateria.sh        # todo
#   bash bancos/bateria.sh A E    # sólo esos grupos
#
# Los grupos son lo que cada banco necesita del huésped, porque un huésped sólo
# puede estar de una forma a la vez. No se pasan dos bancos a la vez (vuelta 61)
# ni se toca `src/` mientras corre (HMR, §4).
cd "$(dirname "$0")/.."
LOG=${BANCOS_LOG:-/tmp/vektor-bancos}; mkdir -p "$LOG"
R=$LOG/resumen.txt
GRUPOS=${*:-A E B B2 C D F}
: > "$R"
rojos=0
corre() {
  local f=$1
  timeout 480 node bancos/$f.mjs > "$LOG/$f.log" 2>&1
  local e=$?
  [ $e -ne 0 ] && rojos=$((rojos + 1))
  echo "$f exit=$e" | tee -a "$R"
}
host() { bash bancos/host.sh "$@" > /dev/null; }

# A · sin navegador ni servidor: la partida, el movimiento y el formato en Node.
A="aire88 aire91 alchemist99 apariencia84 armas90 barrera95 barrera96 compra102
   corte85 dano90 desvio88 duelo92srv escritorio97 estampado93 fang90 fang91
   gran87 gran87red granadas88 hielo84 krakov93 lobby101 paleta93 peanas105
   peanas106 perfora95 pump91 pump91red rampa93 red85 retraso101 rot101 salas100 salas97
   subir94 todos100 todos105 u286 volumen96 vuelo85"
# E · contra el servidor de desarrollo, sin huésped: el juego y Alchemist.
E="alchemist100 arco85 arm89 arm95 barrera95ed borrador99 cabina99 capas96
   coloca96 controles97 dibujo100 entreno98 escritorio98 est95
   est96 fang90ent flujo92 foto87 gizmo93 gran87nav granada102 krakov93nav
   peanas106nav sensacion106
   mapas98 menu92 pump91nav ranura92 salidas101ed subir93
   todos105ed u286nav ui92 voces91 voz91"
# B · huésped sin lobby y sin rondas, con COLOCAR: el motor y la red.
B="armeria98 armeria102 cabina99b esc105 opc104 doble103 destello90 corr103 todos100nav
   laser87 lag103 lag103b suave103 cpu103 pump102red red45 tiro46
   ficha101 ficha101t aire88red"
# B2 · sin lobby y con rondas: lo que se juega a rondas.
B2="esc101 dinero89 duelo87 cap88 duelo88 duelo92 duelo92nav
    escmenu101 doble102 doble102ent"
# C · con lobby, COLOCAR y partidas de dos bajas.
C="lobby101nav lobby101tam paridad101nav retraso101nav
   todos101nav todos105nav"
# D · el huésped de serie.
D="compra102nav"
# F · el despliegue: reconstruye dist y relanza el huésped por su cuenta.
F="cache93"

for g in $GRUPOS; do
  echo "== $g" | tee -a "$R"
  case $g in
    A|E) ;;
    B)  host VEKTOR_LOBBY=0 VEKTOR_RONDAS=0 VEKTOR_DEBUG=1 ;;
    B2) host VEKTOR_LOBBY=0 VEKTOR_DEBUG=1 ;;
    C)  host VEKTOR_DEBUG=1 VEKTOR_BAJAS=2 ;;
    D)  host ;;
  esac
  for f in ${!g}; do corre $f; done
done
echo "FIN · $rojos en rojo" | tee -a "$R"
exit $rojos
