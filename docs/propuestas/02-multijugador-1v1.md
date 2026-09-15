# Propuesta 02 — Primer 1v1 real entre dos personas

**Estado:** evaluado en la vuelta 44 y **decidido**. Dos pasos construidos:

1. **Tick de simulación fijo a 60 Hz** (vuelta 44, `docs/decisions.md` §44). El
   requisito de la predicción: reejecutar entradas sólo converge si los dos lados
   dan los mismos pasos.
2. **Transporte y movimiento sincronizado, en local** (vuelta 45, §45). Servidor
   `ws` en `net/` y dos pestañas con predicción y reconciliación. Medido: error
   de reconciliación **cero** hasta 300 ms de RTT, 0.6-0.9 µs por entrada
   reejecutada, ↓59-81 KB/s en JSON. **El punto 4 de esta propuesta queda
   validado**, salvo la compensación de retraso, que no toca hasta que haya
   disparos.

3. **Transporte aislado y disparo con compensación de retraso** (vuelta 46, §46).
   `send`/`onMessage`/`close` y nada más, con la red simulada como un transporte
   que envuelve a otro; y el disparo resuelto contra el rival rebobinado al
   instante que el tirador tenía en pantalla, con `hitPlayer` y `hasLineOfSight`
   tal cual y un tope de 200 ms. Medido: **100% de acuerdo** entre lo que ve el
   tirador y lo que decide el servidor mientras el rebobinado cabe bajo el tope,
   contra un **20%** resolviendo sin rebobinar; 4.3 µs por disparo. **El punto 4
   queda validado entero.**

4. **A la nube: un Durable Object por código de partida** (vuelta 47, §47). La
   partida sale de `net/servidor.mjs` a `net/partida.js` —un fichero sin nada de
   red— y la corren dos huéspedes: Node en local y un Durable Object en
   Cloudflare, con el mismo Worker sirviendo el juego y las salas. **El punto 2
   y el punto 5 quedan construidos**, y el 3 confirmado: los bancos de las
   vueltas 45 y 46 pasan contra el Durable Object **sin cambiar una aserción**.

Queda desplegarlo de verdad, que necesita una cuenta de Cloudflare y es el único
paso que no se puede dar desde aquí: `docs/despliegue-cloudflare.md`.

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

- **Coste: cero para empezar, y esto es una corrección de la vuelta 44.** Aquí
  se escribió que hacían falta los $5/mes del plan Workers Paid. **No:** los
  Durable Objects **con respaldo SQLite** entran en el plan gratuito, y ése es
  el que usa Vektor (`new_sqlite_classes` en `wrangler.jsonc`). Los del respaldo
  antiguo sí son de pago, y de ahí venía el error.
  Lo gratuito da **100.000 peticiones al día**, y como los mensajes entrantes se
  facturan 20:1 y dos jugadores mandan 120 por segundo, salen 6 peticiones por
  segundo de partida: **≈4,6 horas de 1v1 al día**. El otro límite —13.000 GB-s,
  unas 29 horas de sala encendida— no es el que se agota primero.
  El plan Paid ($5/mes) sube a 1 M de peticiones al mes, unas **46 horas**, y a
  partir de ahí son $0.15 por millón de peticiones y $12.50 por millón de GB-s:
  **menos de $1 por cada 100 horas de más**. O sea que el salto real son los $5
  de entrada.
- **Día a día:** `npx wrangler deploy`. Sin servidor que reiniciar, sin Node que
  actualizar, sin certificados.
- **Un solo origen, no Pages aparte** (decidido en la vuelta 47). El mismo Worker
  sirve los ficheros del juego y las salas, porque el cliente saca la dirección
  del WebSocket de la página en la que está: con dos orígenes hay una URL de
  servidor que configurar y que cambiar el día que el despliegue se mueva; con
  uno no hay nada que configurar.

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
- **Compensación de retraso.** Construida en la vuelta 46: el servidor guarda por
  paso los siete números de `playerBody()` —3.8 KB por jugador para un segundo—
  y, al llegar un disparo, rebobina y llama a `hitPlayer` y `hasLineOfSight`, las
  mismas dos funciones que ya existían. **4.3 µs por disparo**, no los 21 que
  estimé aquí. Y cuánto rebobinar **no se estima desde el ping**: lo dice el
  propio disparo, porque el cliente sabe entre qué dos fotos está dibujando al
  rival. Estimarlo contaba el RTT dos veces (§46).
- **La asimetría se acota, no se arregla:** rebobinado máximo de 200 ms, como en
  Source, y ya está puesto. Tiene precio y está medido: a 300 ms de RTT el
  tirador pide 390 ms de rebobinado, se le dan 200 y el acuerdo baja al 50%. Y
  ojo con el muro de la vuelta 43, que es justo la geometría donde la ventaja del
  que asoma se nota más.

---

## 5. Alcance del primer paso

Código de seis caracteres = nombre del Durable Object. **Construido en la vuelta
47**, con dos ajustes sobre lo que decía aquí: el enlace es `/duelo/ABC123` y no
`#ABC123` —una ruta se dicta por teléfono y una almohadilla no—, y el alfabeto
del código descarta las parejas que se confunden al dictarlo (ni O/0, ni I/L/1,
ni S/5, ni B/8), traduciéndolas en vez de rechazar el código.

Nick en memoria (`p1`/`p2`). Deathmatch 1v1 en el Plano A. Sin dummies, sin bomba
y sin estrellas. El marcador de TAB ya está construido con una rejilla que admite
la segunda fila, pero el duelo todavía es una página aparte y no lo usa.

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
   funciones. Medido en la vuelta 45 con la red estropeada a mano: andando, al
   25% de pérdida la corrección máxima es de 0.33 u y al 10% de 0.22 u. El peor
   caso es perder la pulsación de saltar, y ahí el techo es lo que desplaza un
   vuelo entero: 3.8 u.
6. **La foto se manda entera a todo el mundo** (vuelta 45). Los 24 campos del
   estado son para que reejecutes **tu** movimiento; del rival sólo se dibujan
   cinco. Mandar a cada uno lo suyo baja la foto a la mitad, y en binario (24
   `Float32` son 96 B) a menos de la sexta parte. Es la primera optimización
   obvia, y todavía no hace falta.
