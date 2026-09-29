#!/bin/bash
# Reinicia el servidor de desarrollo en el 5192 y comprueba que el que contesta
# es el nuevo (CLAUDE.md §4: un `pkill` seguido de un arranque no reinicia nada
# si el viejo no ha soltado el puerto). Se lanza solo, nunca en la misma orden
# que otra cosa: el `pkill -f` busca el nombre del servidor en la línea de órdenes.
cd "$(dirname "$0")/.."
LOG=${BANCOS_LOG:-/tmp/vektor-bancos}; mkdir -p "$LOG"
pkill -f "vite" 2>/dev/null
for i in $(seq 1 20); do
  if ! pgrep -f "vite" >/dev/null && ! (echo >/dev/tcp/127.0.0.1/5192) 2>/dev/null; then break; fi
  sleep 0.5
done
nohup npx vite --port 5192 --strictPort >"$LOG/vite.log" 2>&1 &
for i in $(seq 1 40); do
  sleep 0.5
  if curl -sf -o /dev/null http://127.0.0.1:5192/; then echo "servidor de desarrollo arriba (pid $(pgrep -f 'vite' | head -1))"; exit 0; fi
done
echo "el servidor de desarrollo NO arrancó"; tail -5 "$LOG/vite.log"; exit 1
