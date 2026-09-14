# Propuesta 02 — Primer 1v1 real entre dos personas

**Estado:** evaluado en la vuelta 44 y **decidido**. El primer paso —fijar el
tick de simulación a 60 Hz— está **construido** (ver `docs/decisions.md` §44).
Nada de red escrito todavía.

Partida privada entre amigos por código o enlace. Sin cuentas, sin ranking y sin
matchmaking público: eso viene después y se monta encima, no en lugar de esto.

---

## 0. El punto de partida: el motor ya corre fuera del navegador

Medido en Node puro, sin DOM y sin WebGL, importando los módulos tal cual:

```
escenario: 7 oclusores, 14 rutas, 68 puntos
puntos visibles desde el spawn: 0 / 68
movement.update x14400 (1 min a 240 Hz): 17.2 ms → 1.20 µs/tick · recoveries 0
hitPlayer: head a 9.60 u → 100 de daño
```

Tres decisiones viejas lo hacen posible: `movement.js` **no importa three**,
`hitPlayer` es analítico —el jugador es una cámara, no una malla— y `sight.js` es
el único sitio que pregunta si algo se ve, con `THREE.Raycaster`, que es
geometría pura y funciona sin canvas.

Con dos jugadores moviéndose de verdad: **2.55 µs por tick**, o sea **0.015% de
un núcleo**. Una partida de diez minutos cuesta 92 ms de CPU. El servidor no es
el problema; lo caro es el netcode.

---

## 1. Transporte: WebSocket

| | WebSocket | WebRTC DataChannel | WebTransport |
|---|---|---|---|
| Transporte | TCP | UDP (SCTP/DTLS) | QUIC / HTTP-3 |
| No fiable / desordenado | no | sí | sí |
| Head-of-line blocking | **sí** | no | no |
| Servidor en Node | `ws` | `geckos.io` / binario nativo | sin stack maduro |
| Señalización / ICE / TURN | ninguna | **obligatoria** | ninguna |
| ¿Corre en Cloudflare Workers? | **sí** | no | no |
| Navegadores | universal | universal | Baseline desde marzo 2026 |

El argumento contra WebSocket es real —un paquete perdido retrasa lo que va
detrás— pero tiene un tamaño, y aquí es pequeño: dos amigos en España contra un
servidor en Madrid son 15-35 ms de RTT con menos del 0.5% de pérdida, y el
caudal es de **0.8 KB/s de subida y 2.3 KB/s de bajada** por jugador con
paquetes binarios a 60 Hz (4.5 / 9.0 en JSON). El head-of-line blocking duele al
2-5% de pérdida, no a 0.3%.

Y elegir WebRTC nos echaría del hosting bueno: Cloudflare Workers sólo habla
WebSocket, así que WebRTC obligaría a una máquina propia con puertos UDP
abiertos, señalización aparte y un binario nativo que compilar.

**WebTransport es el sucesor correcto y todavía no está** en el lado servidor.
Por eso el transporte se aísla tras tres funciones (`send`, `onMessage`,
`close`): cambiarlo el día que exista es cambiar un fichero.

---

## 2. Dónde vive el servidor: Cloudflare Durable Objects

Un Durable Object es un objeto con estado, hilo único y dirección propia, y la
dirección sale de un nombre: `idFromName("ABC123")`. **El código de partida ES el
servidor** — no hay lobby que programar, ni registro de salas, ni base de datos.

- **Coste:** plan Workers Paid **$5/mes** con 1 M de peticiones y 400.000 GB-s
  incluidos. Los mensajes WebSocket entrantes se facturan 20:1, así que una
  partida de 10 min a 60 Hz son 3.600 peticiones y 77 GB-s: **≈275 partidas al
  mes incluidas**, y cada una de más cuesta $0.0006. Para dos amigos, $5 planos.
- **Día a día:** `npx wrangler deploy`. Sin servidor que reiniciar, sin Node que
  actualizar, sin certificados. El cliente estático va en Cloudflare Pages.

**Alternativas evaluadas.** Fly.io (~$5-10/mes, soporta UDP, pero mantienes tú el
proceso) y Render/Railway ($5-7/mes, mismo perfil de mantenimiento). Descartadas
las plataformas especializadas en game servers: **Hathora cerró el 5 de mayo de
2026**. Cloudflare y Fly son infraestructura general.

---

## 3. Qué se reutiliza: el 45% del motor, sin tocarlo

| | Líneas | Qué pasa |
|---|---|---|
| `config.js` | 2.814 | **Tal cual**, compartido por los dos lados |
| `movement.js` | 1.081 | **Tal cual**, con un adaptador de ~20 líneas para la cámara |
| `scenario.js` | 518 | **Tal cual**; ya corre en Node |
| `player.js` | 344 | **Tal cual**; `hitPlayer` es matemática pura |
| `scoring.js` + `sight.js` | ~160 | **Tal cual** |
| **Reutilizado** | **≈4.900** | sin tocar una línea |
| `engine.js` → módulo compartido | ~450 de 1.768 | disparo, cadencia, recarga, recoil, cobertura: **se mudan** |
| `targets.js` + `enemyFire.js` | 1.660 | **no se usan en 1v1**; se quedan donde están |
| Netcode de servidor, nuevo | 900-1.400 | sala, cola de entradas, tick, snapshots, historial |
| Netcode de cliente, nuevo | 500-700 | predicción, reconciliación, interpolación, avatar remoto |

`movement.js` toca la cámara en 14 sitios, siempre para leer o escribir
`position.{x,y,z}` y `rotation.y`: en el servidor se le pasa un objeto plano con
esa forma y no cambia nada del fichero.

---

## 4. Predicción y compensación de retraso

**La costura ya existe:** `movement.keys.forward = true` seguido de
`movement.update(dt, t)`. El servidor no necesita una segunda física.

- **Predicción local.** El cliente numera cada entrada, la aplica al instante y
  guarda ~1 s en un anillo. El servidor responde con `(últimaSecuencia, estado)`;
  el cliente coloca el estado y **reejecuta** lo posterior por el mismo módulo.
- **El requisito es el paso fijo**, y es la razón de que la vuelta 44 vaya antes
  que el netcode: reejecutar sólo converge si los dos lados dan los mismos pasos.
  Hecho y medido (`docs/decisions.md` §44).
- **Compensación de retraso.** El servidor guarda por tick los siete números de
  `playerBody()` —3.3 KB por segundo con dos jugadores— y, al llegar un disparo,
  rebobina al instante que el tirador tenía en pantalla (`RTT/2 + interpolación`,
  ≈45 ms) y llama a `hitPlayer` y `hasLineOfSight`, las mismas dos funciones que
  ya existen. **21 µs por disparo.**
- **La asimetría se acota, no se arregla:** rebobinado máximo de 200 ms, como en
  Source. Y ojo con el muro de la vuelta 43, que es justo la geometría donde la
  ventaja del que asoma se nota más.

---

## 5. Alcance del primer paso

Código de seis caracteres = nombre del Durable Object. Enlace `#ABC123`. Nick en
memoria. Deathmatch 1v1 en el Plano A. Sin dummies, sin bomba y sin estrellas.
El marcador de TAB ya está construido con una rejilla que admite la segunda fila.

## Riesgos

1. **El tick fijo cambia el feel del aire.** Medido y resuelto en la vuelta 44:
   a 60 Hz no cambia nada, a 240 Hz se pierde un 1.36% de marcha final en el
   banco de cuatro segundos. **Sobrevive.**
2. **Dos sitios donde vive la verdad.** Mitigación dura: el servidor importa
   *el mismo* `config.js`, no una copia.
3. **Riesgo de plataforma.** Por eso infraestructura general y no game servers.
4. **Trampas.** Con servidor autoritativo siguen siendo posibles el aimbot y el
   wallhack. Entre amigos da igual; el día del matchmaking público, no.
5. **WebSocket con mala línea.** Mitigación: el transporte aislado tras tres
   funciones.
