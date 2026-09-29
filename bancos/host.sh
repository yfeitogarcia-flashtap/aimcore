#!/bin/bash
# Relanza el huésped de Node en el 5199 con las variables que se le pasen
# (`bancos/host.sh VEKTOR_LOBBY=0 VEKTOR_DEBUG=1`). Sirve `dist/`: si has tocado
# el juego, `npx vite build` antes (CLAUDE.md §4). Y comprueba el proceso, no el
# puerto: un huésped viejo contestando `/salud` no es el que acabas de lanzar.
cd "$(dirname "$0")/.."
LOG=${BANCOS_LOG:-/tmp/vektor-bancos}; mkdir -p "$LOG"
for pid in $(pgrep -f "net/servidor\.mjs"); do kill "$pid"; done
for i in $(seq 1 30); do pgrep -f "net/servidor\.mjs" >/dev/null || break; sleep 0.2; done
env "$@" nohup node net/servidor.mjs > "$LOG/host.log" 2>&1 &
for i in $(seq 1 30); do curl -s -m 1 localhost:5199/salud >/dev/null && break; sleep 0.3; done
curl -s -m 2 localhost:5199/salud | head -c 200; echo
