# CLAUDE.md — Vektor by FlickLAB

Contexto operativo del repositorio. Léelo entero antes de tocar nada: está
pensado para que cualquier sesión nueva arranque orientada sin tener que
reconstruir el historial.

---

## 1. Qué es Vektor

Vektor es un **aim trainer local** (estilo Kovaak's / Aim Lab) construido como
prototipo para validar puntería, rendimiento y *feel* antes de invertir en
backend, cuentas o metajuego. Todo ocurre en el navegador, en local, sin red.

**Relación con FlickLAB:** FlickLAB es la marca paraguas; Vektor es un producto
independiente con su propio repositorio y su propio ciclo. El único vínculo
formal es la identidad visual (negro `#0A0A0A`, naranja `#E4462B`, verde de
acción `#2FCB82`) y el crédito "by FlickLAB" bajo el logotipo. **No** se asume
infraestructura compartida: nada de Supabase, cuentas, telemetría ni backend en
esta fase.

---

## 2. Arquitectura

**Stack:** Vite 6 + React 18 + Three.js 0.170. Sin librerías de UI, sin router,
sin gestor de estado. Tres dependencias de producción y nada más.

**Sin assets externos, de ningún tipo:**

- **Audio:** todo sintetizado en tiempo real con la Web Audio API
  (`src/audio/sfx.js`): osciladores + un buffer de ruido pregenerado. No hay ni un
  fichero de sonido en el repositorio. **La única puerta abierta es el disparo**
  (vuelta 39): un arma puede traer su muestra grabada en
  `Reference/Audio/weapons/<clave-del-arma>.mp3` —y opcionalmente
  `-suppressed.mp3`—, que `npm run audio:weapons` copia a `public/audio/weapons/`
  y declara en `src/audio/weaponSamples.js`. **La síntesis no se sustituye, se
  queda debajo**: sin fichero, con un fichero que no se decodifica o mientras
  todavía viaja, suena el disparo sintetizado de siempre. Hoy no hay ninguno, así
  que suena todo sintetizado. El resto del audio no tiene esta puerta.
- **Siluetas de armas, logotipo e iconos:** vectorizados con `potrace` a partir de
  `Reference/Weapons/` —donde la convención es `<arma>.png` y `ghost-<arma>.png`,
  la misma arma con silenciador—, `Reference/Logo/` y `Reference/Icons/` mediante los
  scripts *one-off* `npm run trace:weapons`, `trace:logo` y `trace:icons`, que
  emiten `src/ui/weaponPaths.js`, `src/ui/logoPaths.js`, `src/ui/iconPaths.js` y
  `public/favicon.svg`. Los tres scripts comparten máscara, opciones de potrace y
  utilidades en `scripts/lib/trace.mjs`: tres pipelines de vectorización acaban
  dando contornos con distinto detalle según la carpeta de origen. Las PNG de referencia
  **nunca** entran en el build: son material de trazado, no assets. Verifica que
  no aparezcan en `dist/` si tocas esa zona.
- **Geometría y texturas:** todo procedural (rejilla, dianas, sala).

**Reparto de responsabilidades:**

| Capa | Dónde | Qué hace |
|---|---|---|
| Motor | `src/game/` | Bucle rAF, input, raycast, dianas, armas, panel de acciones. **Vive fuera de React.** El mundo avanza en **pasos fijos de 60 Hz** (`_advanceSimulation` / `_simStep`); el frame sólo dibuja. Con `usarRed(cliente)` la verdad del movimiento, el disparo, la vida y la reaparición pasa al servidor (vuelta 56). |
| Escenario | `src/game/scenario.js` | Convierte los datos de `SCENARIOS` en mallas, colisionadores, oclusores y **rutas**. Y publica su sala (`scenario.room`) y su zona de aparición (`isInSpawnZone`). |
| Línea de visión | `src/game/sight.js` | `hasLineOfSight`: el **único** raycast de «¿se ve eso desde aquí?». Lo usan la aparición y los marcadores. |
| Sala | `src/game/scene.js` | Rejilla y paredes, reconstruibles con `setRoom`: cada escenario tiene su tamaño. |
| Audio espacial | `src/audio/spatial.js` | Listener en la cámara y emisores posicionados. **Genérico:** no sabe del explosivo. |
| Muestras | `src/audio/samples.js` | Disparos grabados, **con la síntesis siempre detrás**. Único camino de audio de un disparo. |
| Explosivo | `src/game/objective.js` | Aparición, cuenta atrás, pitido y desactivación. No publica nada al HUD a propósito. |
| Puntuación | `src/game/scoring.js` | Variables normalizadas, media ponderada y estrellas. |
| Transición | `src/game/transition.js` | **Módulo sustituible entero.** Contrato único: `run(build)` tapa la escena, llama a `build()` y destapa. Nada más del motor sabe qué forma tiene. |
| React | `src/App.jsx`, `src/ui/` | Sólo conoce la *fase* (inicio / juego / pausa / resumen) y el resumen final. |
| Armería | `src/ui/Armoury.jsx` | Panel de equipo (tecla B): silueta, ficha y «Equipar» por arma. Escribe en el store de ajustes, como opciones. |
| HUD | `src/ui/Hud.jsx` | Se actualiza **imperativamente por refs** desde el bucle. Cero `setState` por frame. |
| Cuerpo | `src/game/body.js` | **La única forma de figura humana**: la usan las dianas y el avatar. |
| Avatar | `src/game/avatar.js` | El cuerpo del jugador, tintado con su equipo. Geometría, sin lógica. |
| Grilla | `src/game/grid.js` | Generador de líneas. Lo usan la sala **y** la piel del avatar. |
| Jugador | `src/game/player.js` | Vida, escudo, casco, reaparición y **dónde te han dado**. |
| Fuego enemigo | `src/game/enemyFire.js` | Los muñecos disparando: visión, reacción, cadencia y cono. Y **publica en qué fase está cada uno**. |
| Marcadores | `src/game/markers.js` | Brújula, iconos `?` / `!` y ficha arma+nick sobre cada muñeco. Sólo dibuja, y la brújula **sólo a quien se ve de verdad**. |
| Fogonazo | `src/game/muzzleFlash.js` | El destello de cada disparo enemigo. Pool de estrellas aditivas; sólo dibuja. |
| Recogibles | `src/game/pickups.js` | Cruces de vida, cargas de escudo y casco por el suelo. |
| Música | `src/audio/music.js` | Ambiente de menús, generado. Su propio volumen. |
| Config | `src/config.js` | Todo el tuning, sin excepción. |
| Partida (servidor) | `net/partida.js` | **Todo lo que decide el servidor**, sin saber por dónde viaja: entradas, pasos, disparo, rebobinado y fotos. Un jugador entra con una función `enviar(texto)` y nada más. **No hay red en este fichero.** |
| Huésped de Node | `net/servidor.mjs` | Node + `ws`, y desde la vuelta 58 **el del despliegue**: encamina por código de sala, lleva un reloj por sala y sirve `dist/`. El mismo fichero en local y en Fly. |
| Huésped de Cloudflare | `worker/sala.js` | El Durable Object. Lo mismo, con las piezas de Cloudflare. **Respaldo** desde la 58; ya no es donde se juega. |
| Portero | `worker/index.js` | `/sala/<código>` → `idFromName(código)`; todo lo demás, los ficheros del juego. |
| Código de sala | `net/codigo.js` | Alfabeto, normalización y forma de la ruta. **Lo usan el cliente y el Worker.** |
| Duelo (pantalla) | `net/prueba.html`, `net/prueba.js` | La página del 1v1. **Hospeda el motor completo** (vuelta 56) y se queda con lo suyo: código de partida, menú, avisos, pausas y los números detrás de **F3**. |
| Red (cliente) | `net/cliente.js`, `net/transporte.js` | Predicción, reconciliación, interpolación del rival y disparo. El transporte, detrás de tres funciones. |
| Transporte | `net/transporte.js` | `send` / `onMessage` / `close`, y nada más. La red simulada es un transporte que envuelve a otro. |
| Disparo en red | `net/disparo.js` | `hitPlayer` + `hasLineOfSight` en el orden que cuesta menos. **Lo llaman los dos extremos.** |
| Ajustes | `src/settings.js` | Store + persistencia en localStorage + saneado. |
| Teclas | `src/keybinds.js` | Store de binds: mismo patrón que los ajustes, almacén aparte. |

**El bucle caliente no asigna memoria.** Vectores temporales a nivel de módulo,
pools fijos de objetos, geometrías reutilizadas, `THREE.Vector2(0,0)` constante
para el raycast desde el centro de pantalla. Si añades algo al bucle, se
mantiene esa regla.

---

## 3. Convenciones establecidas

Estas no son preferencias estéticas: cada una nació de un bug concreto.
El porqué está en `docs/decisions.md`.

**Todo el tuning en `config.js`.** Ninguna constante de juego vive suelta en un
módulo. Si necesitas un número nuevo, va a `config.js` aunque lo use un solo
sitio.

**Una sola fuente de verdad para lógica compartida.** Cuando dos sistemas
necesitan el mismo cálculo (separación angular de spawn, límites de sala,
velocidad efectiva de movimiento), se extrae a una función y se llama desde los
dos. Duplicar la fórmula es cómo se desincronizan.

**Saneado de localStorage, siempre.** `sanitizeSettings()` parte de los valores
por defecto y **sólo copia claves conocidas y válidas**: numéricos acotados,
booleanos comprobados por tipo, enumerados contra catálogo. Consecuencia
deliberada: una clave obsoleta desaparece del almacenamiento en el siguiente
guardado. `STORAGE_KEY` se mantiene en `aimcore.settings.v1` a propósito —
cambiarlo borraría los ajustes de los usuarios existentes.

**Presupuesto de rendimiento: ~0.2 ms p99 por frame.** A 240 Hz hay 4.17 ms
disponibles. Todo lo medido hasta ahora se mueve en 0.1–0.2 ms p99. Cualquier
cambio que se acerque a 1 ms es una regresión aunque "se vea bien". Desde la
vuelta 44 el presupuesto se mide **por paso de mundo**, no por frame: un paso
cuesta 0.07 ms p99 con ocho muñecos, y a 240 Hz sólo uno de cada cuatro frames
gasta paso. El peor frame posible son seis pasos seguidos tras un parón —0.42
ms—, que es el techo que pone `SIM.maxFrameDeltaMs`.

**El mundo avanza en pasos de tamaño fijo, y el monitor sólo decide cuándo se
dibuja** (vuelta 44). `_advanceSimulation` acumula el tiempo real del frame y
gasta pasos de `SIM_STEP_MS` (60 Hz) mientras quepan, **guardando el sobrante**:
es el mismo acumulador con arrastre y tolerancia que el limitador de FPS, y por
la misma razón —sin tolerancia, un monitor a 60 Hz entrega frames de 16.666 ms
contra un paso de 16.667 y el primero se escaparía por los pelos—. Un paso es
`_simStep`, y ahí dentro va **todo** lo que antes hacía el frame.

Con esto se cierra la excepción de la vuelta 32: el modelo vectorial del aire es
una integración cuya entrada es el ratón, y con delta variable su resultado
dependía del refresco. Medido: la dispersión entre 60 y 360 Hz pasa del **1.53%
al 0.07%**, y en un monitor múltiplo de 60 el resultado es **idéntico hasta el
último decimal**. Es además el requisito de la predicción de cliente —reejecutar
entradas sólo converge si los dos lados dan los mismos pasos—; ver
`docs/propuestas/02-multijugador-1v1.md`.

**`_simTime` no es un reloj aparte: es un instante real**, el que representa el
final de ese paso, un resto por detrás del frame. Por eso el aterrizaje que
despeja la parábola sale ya en tiempo real y se compara sin traducir con el
`timeStamp` de un evento de teclado. Traducirlo —que fue lo primero que se
probó— es lo que metería un error de hasta un paso entero. Y se **re-ancla**
(`_simTime = now − _simAccumulator`) porque un parón largo acota el delta y si no
los dos relojes se separarían para siempre.

**Hay un reloj del mundo, y es `engine.gameTime`.** Suma un paso **sólo** mientras
se juega, así que pausar es dejar de sumarle. De él cuelgan todos los tiempos del
mundo: cadencia, recarga, aparición, cuenta atrás del explosivo, reaparición y
carga del escudo. `performance.now()` se queda donde sigue teniendo sentido —el
limitador de FPS, la media de frames y el movimiento, que compara contra el
`timeStamp` del navegador—. Y las tres actualizaciones del mundo
(`targets.update`, `_updateCombat`, `_updateObjective`) van **tras la condición de
fase**: las dos cosas juntas, porque cada una sola dejaba un agujero —pasar delta
cero congelaba lo que iba por delta y dejaba corriendo lo que iba por fecha, que
es cómo los muñecos siguieron disparando en pausa hasta la vuelta 42, y parar el
reloj sin dejar de llamar habría dejado colar el disparo que tocaba justo en el
frame de pausar—. Desde la 44 esa condición es **una sola**, la de `_simStep`. Si
añades algo temporizado al mundo, va con `gameTime` y dentro del paso.

**Y el dibujado sí sigue al monitor.** Un tick fijo sin interpolación de dibujado
es medio tick fijo: a 240 Hz la cámara daría sesenta pasos por segundo y se
vería a tirones. Se guardan las dos poses del último paso (`_simPrev`,
`_simCurr`) y `_applyRenderPose` dibuja el punto intermedio que toque. Dos reglas
que **son** el mecanismo:

- **La pose interpolada vive sólo lo que dura el dibujado.** `_applyRenderPose`
  la pone antes de `render()` y `_restoreSimPose` la quita después: fuera de esas
  tres líneas `camera.position` **es** la posición autoritativa, como siempre. No
  lo cambies por guardar la buena aparte y restaurarla al simular: eso convierte
  `camera.position` en una copia y se lleva por delante a cualquiera que la
  escriba desde fuera —una reaparición, la vista de depuración, una prueba
  colocando al jugador—. Pasó, y lo cazaron `binds.mjs` y `live.mjs` (ver
  `docs/decisions.md` §44).
- **Un teletransporte no se interpola.** `movement.reset()` sube `poseEpoch` y un
  paso con la época cambiada no interpola — reaparecer dibujaría un barrido por
  medio mapa. La marca vive donde ocurre el salto, no en una comprobación de
  distancia en quien dibuja.

**La red vive en `net/`, y no entra en el juego** (vuelta 45). El duelo es una
página aparte (`net/prueba.html`), no una fase de `App.jsx`: no tiene menú, ni
armería, ni dianas, ni puntuación. Desde la vuelta 47 **Vite empaqueta las dos
páginas** —el juego y el duelo—, porque el duelo dejó de ser una herramienta para
mirar dos pestañas en local y pasó a ser lo que se le manda a un amigo. Lo que
sigue sin entrar en `dist/` son las PNG de `Reference/`: compruébalo si tocas la
configuración del build. Tres reglas que **son** el diseño, y las tres nacieron
de un fallo concreto (`docs/decisions.md` §45):

- **El reloj de la red es el número de paso, no el de nadie.** Cada entrada viaja
  sellada con su paso `n` y los dos extremos la ejecutan con
  `now = n · SIM_STEP_MS`. El reloj del cliente y el del servidor no tienen por
  qué coincidir; el número de paso sí. Y la pulsación de salto viaja con **su
  fracción de paso**: redondearla costaría 16.7 ms en una ventana que mide 130.
- **El servidor no adivina.** Sin entrada para un paso, ese jugador no avanza y
  ya se pondrá al día. Repetir la última entrada mete un paso que el cliente
  nunca predijo, o sea una corrección inventada por el servidor.
- **El rival se dibuja con el reloj de las fotos, no con el propio.** El cliente
  corre por delante del servidor lo que tarda el viaje, así que «mi paso menos el
  retraso» cae por delante de la última foto recibida y no hay entre qué
  interpolar: medido, 770 ms de retraso en vez de 50.

Y una cuarta que es aritmética y no se ve: **hay que adelantarse el RTT entero,
no la mitad.** La foto que dice en qué paso va el servidor ya salió hace un viaje
de ida, y la entrada que mandes ahora tardará otro. Con la mitad, el servidor se
queda sin entrada en un tercio de los pasos.

**El transporte son cuatro funciones: `send`, `onMessage`, `close`, `onClose`**
(vuelta 46; la cuarta, en la 51). La regla de la 46 sigue en pie en lo que decía
—**no se expone si está abierto**, que es preguntar por un estado, y que hay
partida lo dice la bienvenida, que es del protocolo—. Lo que la 51 añadió es que
**un cable que se corta no manda ningún mensaje**: el `ADIOS` cubre «me han
echado», pero una caída no dice nada de nada, así que no hay forma de enterarse
por el protocolo. `onClose` es un **aviso**, no un estado. Inventarse un mensaje
dentro de `onMessage` habría puesto al transporte a redactar un protocolo que no
es suyo.
El netcode no sabe qué hay debajo, y por eso la red simulada —latencia, jitter,
pérdida— **es un transporte que envuelve a otro** (`conRedSimulada`) y no un
puñado de `setTimeout` dentro del cliente: son propiedades del cable.

**Y ese aislamiento no se rompe nunca por comodidad, por un motivo que va más
allá de la limpieza:** el día que Vektor quiera sostener partidas de nivel
competitivo real hará falta un cliente nativo con **UDP**, y con el transporte
aislado eso es escribir estas cuatro funciones otra vez — no rehacer predicción,
reconciliación ni compensación de retraso, que es lo que han costado las vueltas
45 a 58. Si alguien propone llamar al socket desde `cliente.js` porque es más
corto, la respuesta está en `docs/decisions.md` §0.2. De ahí se siguen dos reglas
que ya están en pie: **nada de netcode pregunta por el estado del cable**, y **el
reloj de la red es el número de paso**, que sobrevive a que los mensajes lleguen
desordenados. Ninguna de
las tres dice si está abierto, a propósito: lo que se manda antes de la apertura
se tira y la entrada siguiente sale 16 ms después, y que hay partida lo dice el
primer mensaje que llega —que es del protocolo, no del cable—.

**Un disparo se juzga contra lo que el tirador tenía en pantalla, y ese instante
no se estima: lo dice el disparo.** El cliente dibuja al rival interpolando entre
dos fotos, así que sabe en qué paso del servidor lo tiene puesto, y manda ese
número. La primera versión lo derivaba del ping (`RTT + interpolación`) y salía
**hasta el doble**, porque el RTT se cuenta dos veces sin verse: la foto que el
cliente reconoce ya es vieja de un viaje, y su entrada espera en la cola del
servidor justo lo que el cliente se adelanta, que es otro RTT. Medido: con 25 ms
de ida el rebobinado ya se comía el tope de 200 ms.

Lo que sí es del servidor es **el tope** (`NET.maxRewindMs`, 200 ms). El número
lo manda el cliente, así que el tope es lo que acota a quien mienta, y es también
lo que acota la asimetría que sufre el que recibe: «me han matado detrás de la
pared» no puede pasar de ahí.

**Y el disparo lo resuelven los dos extremos con el mismo código**
(`net/disparo.js`): el servidor contra el cuerpo rebobinado, el cliente contra el
que está dibujando. Comparar los dos veredictos es la medida de si la
compensación funciona, y esa medida sólo significa algo si el código es uno —dos
copias de la fórmula y una discrepancia ya no diría nada de la red—. Por debajo
no hay nada nuevo: `hitPlayer` y `hasLineOfSight`, en el orden que cuesta menos
—primero el corte, que es aritmética; el rayo **sólo si entra**—, que es el
reparto de `engine._isBlockedByCover`.

**Una proporción necesita que se vea su denominador.** En la vuelta 46 la tabla
del disparo salió cinco veces seguidas «100% de acuerdo», y cinco veces estaba
vacía: el tirador no había salido del spawn y su propio muro le tapaba todos los
disparos, así que las dos columnas coincidían **en el fallo**. Lo que lo delató
no fue afinar nada, fue añadir la columna de impactos (`tú / servidor / sin
rebobinar`): con `0/0/0` delante, un 100% se lee al instante como lo que es. Si
una suite nueva mide un porcentaje, que enseñe de cuántos — y que compruebe su
propia premisa antes de medir.

**Y un techo necesita que se vea su suelo**, que es lo mismo por la otra punta
(vuelta 57). «No se mueve más rápido de lo que permite el juego (≤ 9.5 u/s)» lo
cumple igual de bien un jugador que anda que uno congelado, así que el brazo que
guardaba el arreglo del avance rápido salía verde con la medida rota debajo.
`fondo49` afirma ahora la **velocidad sostenida** del tramo **antes** que el
techo: si el jugador no anda de verdad, el resto de la fila no significa nada.

**El huésped pone el reloj y el cable; la partida pone el mundo** (vuelta 47).
Desde que hay más de un huésped —hoy tres: Node en local, Node en Fly y un Durable
Object en Cloudflare— las reglas viven en `net/partida.js` y ninguno de ellos las
conoce: un jugador entra con una función `enviar(texto)` y quién la implementa no
se sabe desde ahí. Ése es el motivo de que mudarse de nube en la vuelta 58 fuera
una vuelta y no un proyecto: `partida.js` no cambió ni una línea. Es la
convención de siempre («una sola fuente de verdad para lógica compartida»)
aplicada al servidor, y es la misma idea que el transporte del cliente, aplicada
al otro extremo. Si añades una regla de juego al servidor, va en `partida.js`; si
añades algo del reloj o del socket, va en el huésped.

**El código de la partida es la dirección del Durable Object.**
`env.SALAS.idFromName(código)` es determinista, así que dos personas que teclean
el mismo código acaban en el mismo mundo **sin que nadie lleve una lista de
partidas**: no hay registro de salas, no hay matchmaking y no hay nada que
limpiar cuando una partida acaba. Tres consecuencias:

- **La normalización del código vive en `net/codigo.js`, y la usan los dos
  extremos.** Si el cliente y el Worker normalizaran cada uno a su manera,
  teclear el código en minúsculas llevaría a una sala distinta que teclearlo en
  mayúsculas — y el síntoma sería dos amigos solos en dos salas, sin un error en
  ninguna pantalla.
- **El alfabeto no tiene parejas que se confundan al dictar** (ni O/0, ni I/L/1,
  ni S/5, ni B/8), y lo que se teclea mal **se traduce en vez de rechazarse**: un
  código se dicta por voz, y «código no válido» castiga a quien lo dictó bien.
- **La dirección de la barra y el enlace que se manda no son lo mismo.**
  `enlaceDeSala` es el limpio, el que se copia; `direccionDeLaBarra` conserva la
  consulta de la página. Escribir el limpio en la barra con `replaceState` se
  llevó por delante `?worker=1` y dejó a las dos pestañas hablando con servidores
  distintos, sin un solo error (`docs/decisions.md` §47).

**Una sala vacía no gasta reloj, y aun así el mundo no se olvida** (la regla es
de la 47; la segunda mitad se hizo explícita en la 58). El reloj arranca al entrar
el primero y para al salir el último —60 pasos por segundo con nadie dentro se
pagan enteros— pero **el número de paso se conserva**, que es lo que hace que
volver a entrar con el mismo código no sea empezar otra partida.

**Son dos cosas, no una**, y en Cloudflare parecían la misma porque la plataforma
desalojaba el objeto por su cuenta. En un proceso propio no desaloja nadie:
borrar la sala al quedarse vacía pondría el paso a cero y no borrarla nunca
dejaría una sala por cada código que alguien haya tecleado. Por eso el huésped de
Node para el reloj al instante y olvida el mundo a los `NET.salaOlvidadaMs`. Y el atraso se acota con
`SIM.maxFrameDeltaMs` —**el mismo número** que acota el frame largo del
navegador—: volver de un parón largo apuntando al instante exacto serían cientos
de pasos de golpe y una ráfaga de fotos a los dos clientes.

**La marca de teletransporte viaja en la foto, y no se interpola por encima de
ella** (vuelta 50). `poseEpoch` es el único campo del estado que no dice *dónde*
está el jugador sino *cómo* llegó, y va en `snapshot()` porque **el que dibuja no
puede deducirla**: una comprobación de distancia en el cliente confundiría un
teletransporte con un jugador rápido, que es la misma razón por la que la época
existe desde la 44 en vez de mirar cuánto se ha movido la cámara.

`poseDelRival()` no mezcla dos estados con épocas distintas: se queda en el lado
viejo hasta que el reloj de las fotos cruza al nuevo, y así el salto cae en su
instante exacto y en un frame. Sin esto, una reaparición se dibujaba como un
barrido de 14 u a 400 u/s —contra los 6.5 de carrera— pasando por posiciones en
las que el rival nunca estuvo. **La vista del propio jugador no necesitaba
arreglo** y conviene no tocarla: la reaparición llega por `_reconciliar`, que
corre entre frames, así que el paso siguiente ya lee el spawn y no hay dos poses
entre las que interpolar.

**El estado serializable del movimiento vive en `movement.js`**
(`snapshot()`/`restore()`, 25 campos). Va junto a los campos y no en el módulo de
red por la razón de siempre: una lista de nombres escrita en otro sitio se
desincroniza el día que alguien añada estado. Si añades algo al movimiento que
sobreviva a un frame, añádelo también ahí.

**Y pausar es una sola cosa**: `_suspend()`. Apaga controles y movimiento, suelta
el gatillo y pasa a pausa, y lo llaman las dos formas de dejar de jugar sin
terminar —soltar el ratón con Escape y abrir la armería—. Dos trozos parecidos es
como acaba una pausa con el gatillo todavía pulsado.

**Sólo se vuelve a sembrar si el tablero ha dejado de valer.** `targets.configure`
devuelve si tuvo que rehacer las mallas, y ése es el único caso en que
`_applySettings` llama a `beginSession`. Hasta la vuelta 42 sembraba con
**cualquier** ajuste: tocar el silenciador en la pausa, con tres muñecos ya
abatidos, borraba la ronda y la volvía a llenar entera —y desde la posición del
jugador parado, o sea encima de él—. El cupo de ronda sí se recalcula siempre:
eso no necesita rehacer nada.

**El tiempo del juego no puede depender de cuándo dibuja el monitor.** Se aplica
en tres sitios y vale para cualquier mecánica temporizada que se añada:

- *El paso del mundo*: desde la vuelta 44 es **fijo** (60 Hz). Lo de abajo sigue
  valiendo tal cual —y con el paso fijo sale reforzado, no sustituido: lo que
  está resuelto en forma cerrada no acumula error aunque el paso cambie de
  tamaño, que es justo lo que hace falta cuando un día el servidor simule a otro
  ritmo—.
- *Cadencia y recoil*: `_nextShotAt` se calcula desde el instante en que el
  disparo **tocaba**, no desde `performance.now()` del frame que lo ejecuta. Sin
  esto un arma de 600 RPM dispara distinto a 60 que a 240 Hz. Y el techo del
  fuego automático —un disparo por paso— pasa a ser **3600 RPM en cualquier
  máquina**: antes iba con el monitor y con el limitador de FPS, que con el tope
  en 30 habría dejado un arma automática en 1800.
- *Salto*: la vertical **no se integra frame a frame**. Se guarda el estado del
  despegue y se evalúa la parábola —`y = y0 + v0·t − ½gt²`— desde `_airTime`.
  Integrar por pasos acumula error de Euler y ese error va con el tamaño del
  paso. La velocidad de impacto sale de la energía (`v² = v0² + 2g·Δy`), no del
  frame en que se detecta el suelo, que llega pasado de largo.

**La sala la manda el escenario, no `ROOM`.** `ROOM` es la de la sala vacía;
`scenarioRoom(key)` devuelve la del escenario y `scenario.room` es el único sitio
del que leerla. De ahí salen la rejilla y las paredes (`scene.setRoom`), el
límite de movimiento, el acotado del muestreo de dianas y las medidas del
tablero de acciones (`actionPanelMetrics`, que escala con la sala y a 80 da
exactamente los valores de siempre). Si añades algo que dependa del tamaño de la
sala, sale de ahí: un `ROOM` suelto convierte el Plano A en un mapa con un
anillo de suelo inalcanzable alrededor.

**La zona de aparición del jugador sale del grafo por construcción, no por una
comprobación.** Un escenario declara su `spawnZone` —**como una caja**: esquina
mínima, ancho y fondo, la misma convención que `boxes`— y `scenario.js` descarta
al montar cualquier punto de ruta que caiga dentro, con el radio del cuerpo de
margen (`isInSpawnZone`, la única fuente de la exclusión). No hay dónde aparecer
ni a dónde patrullar, y vale para **todos los modos** porque el grafo es uno. Una
comprobación de distancia al sembrar habría sido una regla que hay que acordarse
de aplicar en cada sitio nuevo que haga aparecer algo.

**Y es una banda que cruza la sala, no una bolsa alrededor del spawn** (vuelta
43). La regla es «de la línea del muro hacia atrás no aparece nadie». Con una
bolsa quedaban muñecos a los costados y no había forma de estar del todo tapado
al reaparecer, que es justo lo que hay que poder hacer.

**Un solo muro, y se sale por los dos extremos.** El recinto de tres piezas de la
vuelta 42 era una ratonera: una única boca, y todo lo que hubiera enfrente te
veía por ella. Ahora hay **una pieza atravesada** delante del spawn, más alta que
cualquier jugador, y detrás de ella se está a cubierto de todo el grafo; salir es
rodearla por un lado o por el otro, y eso convierte el spawn en un sitio donde se
practica el asomo en vez de un pasillo. Los tres números **se midieron**
(`muro43.mjs`, `pantalla43.mjs`; el porqué en `docs/decisions.md` §43):

- **14 u de largo.** Por debajo de 12 el jugador plantado en el spawn ya es
  visible para algún punto; con 14 no lo ve **ninguno de los 68**, asomarse
  cuesta 0.34 s por el oeste y 0.90 por el este, y cruzarlo de punta a punta
  2.38 s.
- **`media` (1.9) y no `alta` (3.6).** Con 3.6 a metro y medio de la cara el muro
  ocupa **el 100% del encuadre**: se aparece mirando una pared gris. Con 1.9
  ocupa el 60% y por encima se ve el mapa — y tapa igual, porque una recta entre
  dos puntos por debajo de 1.9 que cruce su huella está cortada, y tanto los ojos
  del jugador (1.7) como los de un muñeco (1.44) están por debajo. Lo que se
  paga: `targetRadius` por encima de **0.59** hace un muñeco tan alto que asoma;
  el de serie es 0.45.
- **El spawn, pegado al fondo** (z 17.5 de 20). Así la banda sin muñecos son 4.8
  u —el 12% de la sala— en vez de un tercio del mapa.

**Desde el spawn no se ve nada, y ésa es ahora la regla.** Hasta la vuelta 42 dos
tests exigían lo contrario —que se viese algún punto de frente y a media sala,
porque el jugador empezaba a campo abierto—. Ahora empieza tapado: lo que se
exige es que **no le vea nadie** y que asomándose por **los dos** extremos vea
mapa de frente y lejos. Consecuencia que no es un fallo: la primera diana de la
sesión sale por la salida de emergencia (donde no se ve), y elegir punto cuesta
el barrido entero —68 raycasts en el peor caso, una vez por aparición, no por
frame—.

Y el tablero de acciones, que se ancla al spawn: con el spawn a 2.5 u de la pared
ya no cabe entero detrás, así que `actionPanelMetrics` **acota el ancla**, que es
para lo que ese acotado existe. Sigue apagado.

**Un umbral en unidades sueltas es un umbral que se rompe al reescalar.** Todo
lo que en las auditorías era «a 10 u del spawn», «a 8 u del tablero», «a más de
20 u» pasó a medirse en fracciones de `room.width` cuando el Plano A bajó a
40×40. Lo mismo vale para los tests: ninguno escribe ya una coordenada del plano
a mano — la Espina, las rampas, las troneras y el bordillo se localizan en los
datos. Un test que sabe que la Espina está en x −15 no prueba la Espina, prueba
un número.

**Ojo con las alturas de `COVER`:** el bordillo (0.6) y ahora también la
cobertura baja (1.25) se saltan; la Media (1.9) sólo se supera subido a un
bordillo. Si tocas `jumpSpeed` o `gravity`, revisa esa tabla.

**El salto encadenado conserva, no multiplica.** Pulsar SPACE dentro de
`MOVEMENT.chainJumpWindowMs` —a cada lado del aterrizaje— arranca el vuelo nuevo
con la marcha que se traía al tocar el suelo en vez de recalcularla desde el
suelo. Nada más: ni impulso vertical extra, ni factor, ni ganancia por
encadenar. Lo que acelera es el air-strafe, y encadenar es lo que deja seguir
usando lo ganado. Y la pulsación se **gasta** al despegar, así que dejar
SPACE apoyada sigue rebotando con saltos normales: encadenar es acertar el
tiempo, no apoyar la tecla.

Los dos extremos de la ventana se miden en tiempo real: la pulsación sale de
`event.timeStamp` (no del frame que la atiende) y el aterrizaje, de despejar la
parábola —`t = (v0 + velocidadDeImpacto) / g`— en lugar del frame que lo detecta,
que llega hasta un frame tarde. Medido: el umbral sale en 130.00 ms a 60, 144 y
240 Hz, con una diferencia de 0.000 ms entre ellos.

**Hay dos modelos de aire conviviendo tras `MOVEMENT.airVector`, y uno se
borrará.** El interruptor es de prueba, no un ajuste de juego: no está en el
panel. `true` (por defecto) es el **vector de velocidad**; `false`, la **marcha
escalar** de antes de la vuelta 32. **El suelo es el mismo en los dos** —medido:
un paseo largo por el Plano A acaba en la misma coordenada hasta el último
decimal—, y el techo (`airStrafeMaxSpeed`) también.

**Modelo vectorial: la marcha tiene dirección, y eso trae inercia.** En el aire
hay una velocidad de verdad (`_airVelX`/`_airVelZ`) que se siembra al despegar y
se acelera con el `airAccelerate` clásico: proyectar la velocidad sobre la
dirección pedida, mirar cuánto falta para `airWishFactor · speed`, sumar esa
diferencia acotada por `airAccel · wishSpeed · dt`. Cuatro consecuencias que son
el mecanismo entero:

- **Soltar W conserva hacia dónde ibas**, que es para lo que se hizo. Medido:
  corriendo de frente y estrafeando a 40°/s, el rumbo gira de 0° a −29° en un
  vuelo; con el escalar saltaba a −90° en el primer frame.
- **La condición «W suelta» desaparece porque sobra.** Con la vista puesta donde
  vas, la proyección ya vale 6.5 —muy por encima de los 0.78 de `wishSpeed`— y no
  se gana nada. Sale de la geometría, no de un `if`.
- **Girar rápido frena.** Medido en seis saltos: 40°/s → 8.32 u/s, 140°/s → 3.82.
  Es justo al revés que en el escalar, que premiaba girar hasta su tope.
- **Hay inercia**: sin teclas se sigue volando. Es lo que hace que el aire tenga
  dirección, y toca a todos los saltos, no sólo al air-strafe.

**Con vector, sólo pierde la marcha lo que te seguiría parando en el ápice.**
Anular la componente bloqueada es lo correcto contra un muro —si no, empujar
contra él guarda velocidad para soltarla al doblar la esquina— pero rompía saltar
encima de la cobertura baja: se le roza la cara subiendo, y con `stepHeight` a
0.25 esa caja bloquea hasta que los pies pasan de 1.0. Medido, la regresión era
de 12 de 12 a **0 de 12**. La regla que lo arregla no necesita saber qué pieza
frenó: se resuelve **el mismo paso contra la misma colisión** con los pies en el
ápice (`_clearsAtApex`), y si allí pasa, no se pierde nada. La pared de la sala
va aparte: no tiene techo que superar, así que siempre corta. Medido después, la
ventana para subirse a la Baja vuelve a ser idéntica en los dos modelos (de 0.6 a
2.7 u de anticipo, a 60, 144 y 240 Hz).

**La excepción del refresco se cerró en la vuelta 44, y así es como estaba.** El
vector es una integración y no tiene forma cerrada, porque la entrada es el
ratón. Medido en la 32 con un jugador que gira sin parar y encadena durante 4 s:
**1.38%** de diferencia entre 60 y 240 Hz. De eso, **0.57 puntos ya existían**
con el modelo escalar en el mismo banco: el contacto con el suelo entre saltos se
cuantizaba al frame y a 60 Hz se volaba 75 ms menos. Dos cosas se arreglaron
entonces porque eran cuantización evitable: el frame del despegue no aceleraba
(se corrige pasando `dt` a `_takeOff`) y el del aterrizaje aceleraba de más (se
acota al tiempo que queda de vuelo, `_airTimeLeft`). Subdividir la integración
**no** ayudaba: el residuo era que el ratón se muestrea una vez por frame.

Lo que lo arregla es quitar el frame de la ecuación. Con el paso fijo el ratón se
muestrea una vez **por paso**, y medido en el mismo banco (`tick44.mjs` [2]):

- **1.53% → 0.07%** de dispersión entre 60 y 360 Hz.
- En un monitor **múltiplo de 60** (60, 120, 240, 360) el resultado es idéntico
  hasta el último decimal: 8.7350 clavado, dispersión 0.000000%.
- Lo que queda es fase de muestreo en 144 y 165 Hz, que no son múltiplos: un
  residuo acotado, no una divergencia que se acumule.
- El tiempo en el aire pasa a ser **3900 ms en los seis refrescos** (antes
  3900–3983): ése era el 0.57 heredado del escalar.
- La curva de ritmo de giro a 240 Hz es ahora **la misma fila** que a 60, dígito a
  dígito, y el óptimo sigue en **40°/s**.

Lo que se paga: un jugador de 240 Hz pierde un **1.36%** de marcha final en ese
banco y uno de 60 Hz no pierde nada, porque el juego pasa a comportarse en todas
partes como se comportaba a 60 —que es la referencia con la que se calibró—.
Ver `docs/decisions.md` §32 y §44.

**Modelo escalar (`airVector: false`): el air-strafe es el único sitio donde sube
`_airSpeed`, y tiene techo duro.**
En el aire, con estrafe puro —A o D, con **W suelta**— y girando el ratón hacia
el mismo lado que la tecla, la marcha sube. Cuatro propiedades, y las cuatro son
el mecanismo:

- **Se paga por ángulo, no por tiempo** (`airStrafeGainPerRad`): lo que acelera
  es mover el ratón, no mantener la tecla. De ahí sale gratis la independencia
  del refresco — el ángulo de un giro es el mismo se dibuje en 35 frames o en
  140. Medido: 0.942478 u/s de ganancia en 500 ms a 60, 144 y 240 Hz, con
  diferencia **0** entre ellos.
- **El giro que cuenta va acotado por velocidad angular**
  (`airStrafeMaxYawRateDeg`), y el tope se aplica como `rate · dt`, nunca por
  frame. Sin eso un flick de un frame regalaría el techo entero; medido, 90° de
  golpe dan exactamente lo de un frame.
- **El techo es duro** (`airStrafeMaxSpeed`): 120 saltos encadenados girando el
  doble de rápido de lo que cuenta acaban en 9.5 clavado. Por inducción,
  `_airSpeed` nace de `currentSpeed` o de un `_landingSpeed` anterior, y el
  **único** sitio que lo sube es `_updateAirStrafe`, que no pasa del techo.
- **Dejar de cumplir las condiciones no frena**: se deja de sumar y ya. Perder
  la marcha es cosa del aterrizaje, y ahí manda la regla de siempre —sólo la
  conserva un encadenado dentro de la ventana—.

El giro se mide sobre el yaw de la **cámara**, que incluye el empuje del arma.
Es deliberado: el retroceso mueve la mira de verdad y aporta décimas de grado con
el signo alternando, contra los 140°/s que cuentan. Si algún día el recoil se
hace grande y de un solo sentido, esto hay que revisarlo.

**Con cobertura, las dianas salen en puntos de ruta, no por muestreo.** Un cono
no sabe poner una diana en una tronera. Un escenario declara **rutas**, y una
ruta es un conjunto de puntos donde cada par es alcanzable en línea recta. **No
hay dos clases de punto:** cualquier punto de cualquier ruta sirve para nacer y
para patrullar. Antes eran dos listas —anclajes por un lado, grupos de patrulla
por otro— con dos vocabularios y dos auditorías para lo mismo, y con el efecto
raro de que un muñeco podía patrullar por sitios donde nunca nacía.

Se sortea **entre los visibles**: se baraja el orden y se coge el primero que
pase el test de visibilidad, que es un sorteo uniforme entre los visibles y de
paso ahorra raycasts. Con 68 puntos las pasadas encadenadas repetirían el mismo
raycast varias veces, así que cada elección lleva un **sello** y ningún punto se
mira dos veces: peor caso medido, 33 raycasts y 0.4 ms p99 por aparición.

El sorteo va **sesgado hacia delante**: con `SPAWN.forwardBiasChance` se restringe
a los que caen en el cono de `SPAWN.forwardBiasConeDeg`, medido **sólo en
horizontal** —mirar al suelo no debe dejar de considerar "delante" lo que tienes
delante—. Si no hay ninguno visible en el cono, se cae al conjunto completo:
antes una diana a la espalda que ninguna diana.

**Desde el spawn no tiene que verse nada, y asomándose sí** — y hasta la vuelta
42 era exactamente al revés. Con el jugador empezando a campo abierto había que
garantizar que viese algo de frente y lejos, o lo primero que veía quien probaba
el mapa era una sala vacía (el porqué de entonces, en `docs/decisions.md` §23 y
§24). Desde la 43 empieza **detrás de su muro**, así que los dos tests que lo
guardaban (`fixes.mjs` y `live.mjs`) exigen lo contrario: **cero puntos visibles
desde el punto de aparición**, y **al menos uno de frente y a `room.width / 4` o
más asomándose por cada extremo** — 20 puntos por el oeste, 23 por el este, y
sólo 2 en común, que es lo que hace que elegir lado signifique algo.

Consecuencia que no es un fallo: la primera diana de la sesión sale por la salida
de emergencia —donde no se ve—, y elegir punto con el jugador tapado cuesta el
barrido entero (68 raycasts en el peor caso, una vez por aparición y nunca por
frame).

**Un límite duro por encima de las preferencias: el cupo de zona.** Una zona del
mapa no puede acumular más de `SPAWN.zoneShare` (0.5, la mitad redondeando hacia
arriba) de los muñecos vivos, así que **en cuanto hay dos, hay dos zonas**. No es
una preferencia con la que se negocie: una zona en su cupo queda fuera del sorteo
aunque sea la única que se vea. Nació de un fallo real —plantado en la pasarela
del Balcón sólo se ven puntos de dos zonas, y las reapariciones acababan todas
allí— y la garantía es de bulto, no estadística: el cupo se mide sobre los que
**habrá** cuando salga éste, de modo que con dos vivos el cupo es 1.

Si con el cupo puesto no queda **nada visible**, el muñeco sale donde no se ve.
Es el único caso en que eso pasa y es deliberado: significa que el jugador está
plantado donde sólo se ve una zona, y la alternativa era dárselos todos ahí. Ir a
buscarlos es la respuesta al campeo, no un efecto secundario. Medido: con el cupo
de serie esa salida no hace falta en ningún puesto del Plano A (0% de
apariciones a ciegas); apretando `zoneShare` a 0.34 sí, y entonces los que salen
sin verse caen a 9.6 u frente a los 1.8 u del más cercano normal.

**Cuatro preferencias encadenadas al elegir dónde nace una diana**, en este
orden, porque cada una puede quedarse sin candidatos: (1) **delante**, el sesgo
de siempre; (2) **rutas libres**, sin otro muñeco patrullando ya por ellas; (3)
**nunca donde caíste** — el punto donde murió ese mismo muñeco queda descartado,
y es regla dura: si no hay otro sitio no se aparece y se reintenta, antes que
reaparecer bajo el punto de mira; (4) **no repetir la zona del último que salió**,
blanda, y sólo se intenta **exigiendo ruta libre**: cambiar de zona no vale tanto
como para meter a dos muñecos en el mismo recorrido. Medido, esa condición no
sólo no costó reparto de rutas sino que lo subió: con el sesgo puesto se reparte
el **98%** de las veces (antes el 42%), y el cupo de zona apenas lo toca —98.2%
contra el 100% de soltarlo—.

**Las rutas se miden, no se eligen a ojo.** Cuántas caben y de cuántos puntos lo
dice un barrido (`rutas-buscar.mjs`) que exige a la vez: suelo a nivel, cuerpo de
0.6 u libre de geometría, fuera del volumen del tablero, a más de `sala/8` del
spawn del jugador, 2.5 u entre puntos, 10 u de diámetro máximo por ruta y áreas
de rutas disjuntas. En el Plano A a 40×40 entran **14 rutas y 68 puntos**. Si
tocas geometría, vuelve a pasar `rutas.mjs`: donde no hay conjunto limpio, no hay
ruta.

**Hay un fondo de saco en el Largo** —entre el extremo sur de la Espina (z −11) y
la plataforma (z −12) queda una ranura de 1 u por la que pasa el jugador (cuerpo
0.8) y no un muñeco (1.2)—. Dentro no cabe ninguna ruta y no se ve ni un punto:
3 de 361 puestos del mapa. Está medido en `spawner.mjs` y anotado aquí a
propósito; arreglarlo es tocar el Plano A.

**El logo se vectoriza, no se incrusta, y se pinta relleno con `fill-rule:
evenodd`.** Tres cosas que hay que saber antes de tocarlo:

- La marca es un **dibujo de línea**, así que el contorno que devuelve potrace
  rodea cada línea por sus dos lados: se pinta **rellena** y sale exactamente el
  original. Un `stroke` —lo que sí llevan las siluetas de armas, que son manchas
  macizas— dibujaría dos filos por línea. `colision.mjs` no lo ve; a 26 px se ve
  enseguida.
- **`evenodd` no es decoración.** Potrace mete los huecos en el mismo trazado
  contando con esa regla; con la de por defecto (`nonzero`) la marca se rellena
  entera y sale **un disco blanco**. Va como atributo del SVG —en el componente y
  en el favicon generado— y no en la hoja de estilos, para que no se caiga en un
  refactor de CSS. `logo.mjs` lo guarda midiendo con `isPointInFill` que el
  centro de la marca está hueco.
- **Las referencias son de 2000 px y se reducen a 600 antes de trazar**
  (`TRACE_SIZE`). A tamaño completo potrace persigue el temblor del rotulador:
  18 KB de trazado por marca que a 26 px no se distinguen de 5.7 KB.

El logo completo lleva **dos tintas** y el canal alfa no las separa: se traza dos
veces la misma imagen filtrando por saturación —el blanco no tiene, el naranja
sí—, y como los dos trazados salen de la misma imagen comparten `viewBox` y se
superponen solos. Es el único sitio del pipeline donde el color decide algo, y
decide **partir** una imagen en dos, no inventar una forma.

**Los iconos del HUD se trazan con potrace, como las armas y el logo.**
`npm run trace:icons` vectoriza `Reference/Icons/` y emite `src/ui/iconPaths.js`;
al navegador no llega ni potrace ni la imagen. Dos cosas que hay que saber:

- **El casco lleva dos contornos en el mismo trazado** —la silueta y la visera—
  y se pinta con `fill-rule: evenodd`, que es lo que convierte el segundo en un
  hueco. La silueta exterior sola es un pentágono redondeado que no se lee como
  casco: lo que lo delata es la visera. Es la misma regla del logotipo, y el mismo
  fallo si se olvida. `dummies.mjs` lo guarda midiendo con `isPointInFill` que el
  centro de la visera está hueco.
- **La cruz de vida no se cambió por el corazón de la referencia**, y no es un
  olvido: el icono del HUD y el recogible del suelo son **el mismo objeto visto en
  dos sitios**, y cambiar sólo uno los separa. El trazado está hecho y espera en
  `iconPaths.js` a que cambien los dos a la vez.

**Un contorno plano no es un objeto.** El casco del suelo no se puede vectorizar:
se reconstruye con la misma disciplina que el avatar —cúpula, faldón y una visera
**que sobresale**—, porque sin luces lo único que distingue una pieza de otra es
la silueta, y una visera metida dentro de la cúpula no cambia la silueta.

**El jugador también es un blanco, y sus zonas son las del muñeco.** Desde que
los muñecos disparan, un disparo recibido tiene que caer en algún sitio, y ese
sitio sale de `TARGET_TYPES.hitbox.parts` escalado a la altura de ojos del
momento (`playerBody`, en `player.js`): agacharse baja las tres zonas sin una
segunda tabla de alturas. El cuerpo es **el mismo cilindro que usa la
colisión** (`COVER.playerRadius`) y el corte se resuelve analíticamente, sin
malla: el jugador es una cámara, y montarle un cuerpo invisible sólo para que le
disparen serían dos cuerpos que se desincronizan.

**La dificultad de los muñecos es un nivel, no dos sliders.** Precisión
(`spreadDeg`) y reacción (`reactionMs`) van juntas en `ENEMY_DIFFICULTIES` y las
elige el ajuste `enemyDifficulty`; **no están además sueltas en `ENEMY`**. Dos
mandos separados producen combinaciones que no corresponden a ninguna dificultad
real —un tirador de élite que tarda un segundo en reaccionar— y lo que se nota
jugando es una sola cosa: cuánto aprietan. Los tres niveles (15°/900, 9°/650,
5°/400) son **puntos de partida a calibrar jugando**: Normal es exactamente lo
que había hasta la vuelta 37.

**La fase de un muñeco la publica quien la tiene, no la deduce quien la pinta.**
`enemyFire.phaseOf()` devuelve `idle` / `alert` / `firing` a partir del estado que
ese módulo ya lleva, y `markers.js` sólo lo dibuja. Deducir «está en su ventana de
reacción» desde fuera mirando relojes sería una segunda copia de la misma máquina
de estados, y se desincronizarían a la primera.

**La brújula sale a quien se ve de verdad; los iconos, siempre.** Desde la vuelta
42 la cuña sólo se dibuja si el muñeco está **dentro del encuadre y sin geometría
por medio**, y el test es **el mismo** que decide dónde puede nacer un muñeco:
`sight.js` es el único sitio del motor donde se pregunta si algo se ve, y de ahí
llaman la aparición y los marcadores. Dos copias del mismo raycast —que es lo que
había— es cómo un marcador acaba contradiciendo al sistema de aparición.

Las dos mitades se resuelven en el orden que cuesta menos: el **encuadre** es
aritmética (un `Frustum` por frame y una esfera por muñeco, centrada en la
brújula y no en el cuerpo, porque es el marcador lo que se decide dibujar), y sólo
a quien entra en él se le gasta **rayo**, con el reparto de siempre —cada
`MARKERS.sight.recheckMs` y como mucho `raysPerFrame` por frame—. La vista se
invierte a mano en vez de leer `camera.matrixWorldInverse`: ese campo lo escribe
el renderer al dibujar, o sea después, y daría el encuadre del frame anterior.

El rayo va **a la cabeza**, que es lo que se ve de un muñeco asomado y justo donde
va la brújula; la aparición pregunta por el cuerpo a media altura. Por eso los dos
veredictos pueden diferir, y sólo pueden hacerlo **en un sentido**: la cabeza se
ve antes que el pecho. El sentido contrario significaría que el marcador ve a
través de algo.

Y los iconos `?` y `!` **no** pasan por aquí, a propósito: la brújula es
información pasiva sobre un cuerpo que tienes delante, y los iconos son avisos de
que te han visto o de que te disparan — un aviso que sólo llega cuando ya puedes
ver al que dispara llega tarde.

**La brújula no se billboardea; los iconos sí.** No es una inconsistencia: es que
dicen cosas distintas. La brújula dice **hacia dónde mira el muñeco**, así que va
paralela al suelo y gira sólo en yaw —girada hacia la cámara apuntaría siempre al
jugador y no diría nada—. Los iconos `?` y `!` sólo tienen que leerse, y para eso
mirar a la cámara es lo correcto.

**Un triángulo perfectamente plano a la altura de los ojos no se ve.** Medido: con
`rise: 0` y la cámara a la altura exacta de la brújula, el marcador ocupa **cero
píxeles**. No se lee mal: no está. Por eso los dos vértices de la cola van
levantados (`MARKERS.compass.rise`), que deja una cuña cuya pendiente sigue
diciendo hacia dónde apunta al ras y sigue siendo un triángulo desde arriba.
Medido a 12 u y promediando tres orientaciones: 28 px con la cola a cero contra
80 con 0.10.

**El tamaño de un marcador se mide contra lo que marca, no contra la escena.**
La brújula de la vuelta 38 salió proporcional a la altura del muñeco y ocupaba,
de lado, **el 105% del ancho de su silueta**: el marcador era más grande que el
objeto marcado. El barrido de la 39 (`brujula39.mjs`) mide dos cosas sobre los
píxeles exactos del marcador —los que cambian entre dibujar el frame con brújula
y sin ella— y las dos deciden a la vez:

- **Discreción**: largo aparente contra el ancho de la silueta del muñeco. A 0.6
  del tamaño de la 38 queda en el **61-64%**.
- **Legibilidad**: área en píxeles a media distancia, con el listón de la vuelta
  37 —80 px se leen, 28 no—. A 0.6 quedan **105 px a 12 u y 106 a 20 u**; el
  escalón siguiente (0.5) cae a 72 y se sale del listón.

Ojo con el área relativa, que engaña: a 4 u la brújula vieja era sólo el 9.6% de
los píxeles del muñeco y aun así se comía la silueta. Un cuerpo es alto y
estrecho, y lo que se compara al mirar son anchos, no áreas.

**Y para medir píxeles, render target, no captura de pantalla.** Una captura pasa
por el compositor y el bucle del motor dibuja entre una y otra: la diferencia
entre dos frames que deberían ser idénticos salía con ~3.000 píxeles de ruido
—más que el marcador que se estaba midiendo—. Dibujando a un destino fuera de
pantalla y leyendo sus píxeles en el mismo turno, dos frames iguales dan
diferencia cero.

**Y un marcador de mundo deja de encoger a partir de cierta distancia.** Más allá
de `MARKERS.referenceDistance` escala **con** la distancia, así que conserva su
tamaño en pantalla, con tope. Sin eso, a 30 u —el largo del Plano A— un icono son
cuatro píxeles, y lo que no se ve no se cuenta.

**Hay dos colores nuevos y ninguno reutiliza los que ya significan algo.** El `?`
es amarillo limón (`COLORS.alert`) y **no** el ámbar del explosivo; el `!` es rojo
puro (`COLORS.threat`) y **no** el naranja de las dianas — un aviso que se dibuja
encima de un muñeco naranja no puede ser naranja. La brújula va en el **verde
FlickLAB** (`COLORS.action`), y es el único sitio donde un color de la paleta
significa dos cosas: se admite porque no coinciden nunca en pantalla —los botones
son de menú y la brújula es del mundo—.

**Y su cola va más oscura, que tampoco es decoración.** Justo de frente y justo de
espaldas la silueta de una cuña es la misma —su rectángulo de cola— y en esta
escena no hay ni una luz, así que no hay sombreado que las separe: un muñeco
encarado y uno de espaldas se verían igual. Con la tapa de la cola al 45% del
verde, de frente se ve el claro y de espaldas el oscuro.

**Y desde la vuelta 40 el morro cae, que es la otra mitad de lo mismo.** Las dos
señales de orientación no se solapan: **se reparten los ángulos**.

- **De frente y de espaldas** la silueta es casi la misma —8×8 px contra 8×10 a
  12 u— y lo que separa es el **tono**: Δ de luminancia 34-62.
- **De perfil** el tono no dice nada, porque se ven las dos caras a la vez, y lo
  que habla es la **pendiente**. Con `noseDrop: 0` el perfil era un rombo
  simétrico; con 0.5 es un triángulo que baja hacia la punta.

Antes de quitar una de las dos, mira a qué ángulo deja ciego.

**El contorno negro cuesta verde y compra filo, y las dos cosas están medidas.**
Es la técnica de siempre —`EdgesGeometry` sobre la propia malla y `LineSegments`
encima, con `polygonOffset` en las caras para que la línea gane el desempate—.

- **Lo que compra:** sobre las piezas claras del mapa (`alta`, `parapeto`,
  `bloque`) el verde se queda en **1.26-1.34 de contraste**, o sea sin filo, y el
  negro da 7.46-12.55. Con el par verde+negro el peor caso de todo el mapa sube a
  **3.96**; ninguno de los dos colores cubre la rampa de grises solo.
- **Lo que costaba, y cómo se arregló.** Opaco, el contorno **borraba el anillo
  exterior** de píxeles del marcador: a 12 u caía de 117 a 75 px, por debajo del
  listón de 80 de la vuelta 37. En WebGL el grosor de una línea no se toca
  —`linewidth` se ignora—, así que lo único afinable es la opacidad, y se barrió
  (`br41.mjs`): **a 0.5 quedan 116 px de 117 y se conserva el 96% del filo**. El
  anillo exterior son píxeles de antialias a medio cubrir, así que a media
  opacidad vuelven a ser verde a medias en vez de desaparecer, y el filo apenas
  lo nota. Ése es el valor: `MARKERS.compass.outlineOpacity`.
- **Ojo con el contraste de dos colores contra el contraste medido.** La vuelta
  40 anotó 7.46 para el negro contra el gris `alta`; **en pantalla son 2.69**,
  porque una línea de un píxel con antialias nunca se pinta negra del todo.
  Contra ese gris ninguna opacidad cruza el 3.0 de la norma —el contorno ayuda,
  no lo arregla—; contra `bloque`, el más claro, sobra.

**La ficha flotante no sale por estar a la vista, sale por apuntar.** Una ficha
por cada muñeco visible es una pantalla de rótulos; el gesto de sostener la mira
es lo que dice a cuál estás mirando, y `MARKERS.nameplate.dwellMs` es cuánto hay
que sostenerla. Dos detalles que no son evidentes:

- **El «apuntar» se mide por ángulo, no con un rayo por frame.** Un rayo por
  muñeco y por frame es justo lo que el presupuesto no admite (misma regla que la
  visión del enemigo). El rayo se lanza **una vez**, al cumplirse el tiempo, para
  descartar que haya cobertura por medio, y se repite cada `recheckMs` mientras la
  ficha siga puesta, con un presupuesto de uno por frame.
- **Ese rayo va a la cabeza, no al pecho.** Por ángulo daría igual, pero asomado
  por encima de una caja lo que se ve de un muñeco es la cabeza: un rayo al pecho
  choca contra la caja y dejaría sin ficha justo al que estás mirando.

Y el día que haya equipos, **a un compañero se le ve siempre** (`instance.friendly`):
saber quién juega contigo no se gana apuntando. Hoy el campo existe y está en
false para todos, y el nick es la ranura del pool (`VK-01`) hasta que haya
identidades de verdad.

**Con el explosivo armado, el selector de simultáneas es el total de la ronda.**
`maxAlive` y `roundBudget` conviven porque miden cosas distintas —techo de a la
vez y total de la sesión—, y con bomba los fija el mismo selector: los muertos no
se reponen. Una fuente infinita de muñecos mientras corre una cuenta atrás
convierte la ronda en una carrera contra el respawn; con cupo, limpiar el mapa es
una forma legítima de llegar a la bomba. **El cupo se descuenta cuando la diana
sale, no cuando se intenta** —un intento sin punto visible se reintenta— y se
comprueba también dentro de `_spawn`, porque la primera la siembra `beginSession`
por su cuenta. Fuera de ese modo, el respawn es el de siempre.

**Las estrellas puntúan cumplir un objetivo, así que en Deathmatch no salen.** La
mitad de la nota es el tiempo, y ese tiempo se mide contra lo que tardaste en
desactivar: sin bomba, media fórmula se cae o se inventa. Además, en un modo sin
límite cualquier métrica acumulativa sube por estar ahí, y las normalizadas
—precisión, KD— ya se leen solas. Los cortes de `starThresholds` están calibrados
contra una ronda de 45 s con explosivo; reusarlos en diez minutos diría cinco
estrellas por algo que no se ha medido nunca. El día que el modo tenga condición
de victoria, se revisa.

**El marcador (TAB) se abre mientras se mantenga la tecla, y sólo jugando.** TAB
**sí** se puede interceptar —comprobado pulsándola de verdad, no supuesto: ver
`docs/decisions.md` §41.5— pero fuera de la partida es del navegador: en la pausa
y en opciones es como se recorre un panel con el teclado. El layout es una
rejilla lista para más filas y **hoy tiene una sola**, la tuya: no hay cuentas ni
multijugador, y una lista de rivales vacía o inventada diría que sí.

**Que te disparan se dice por tres canales, y ninguno pide que estés mirando.**
Hasta la vuelta 40 todo el aviso estaba delante —el anillo de la mira dice *que*
te han dado y los marcadores sólo existen para quien tienes en pantalla—, así que
a un tirador a la espalda sólo se le podía buscar girando a ciegas. Las tres
señales se reparten el trabajo y **cada una entra por un sitio distinto**:

- **La cuña direccional** (`FEEDBACK.damageArc*`), cuando te dan. El ángulo sale
  del **vector de la cámara** y se mide **en horizontal** —el retroceso mueve la
  mira de verdad, y mirar al suelo no cambia de qué lado te disparan—. La pinta
  un `conic-gradient` centrado en ese ángulo, que cuenta los grados desde arriba
  y en el sentido del reloj: la misma convención, así que no hay conversión que
  pueda salir espejada. Y **el hueco de la mira es una máscara radial**, no una
  opacidad afinada: la regla de no tapar el centro queda garantizada por
  construcción.
- **El silbido** (`ENEMY.whizz`), cuando fallan cerca. Se mide contra los
  **oídos** y el emisor va al **punto de máxima aproximación**, que es por donde
  pasó. Su rayo de cobertura lleva **presupuesto por frame** como el de la
  visión: pasado el tope se pierde un silbido, no una bala. Medido con ocho
  muñecos: 13.8 disparos y 5.7 silbidos por segundo, +0.1 ms p99 en el combate.
- **El fogonazo** (`muzzleFlash.js`), en cada disparo. Aditivo, una geometría y
  un material para todo el pool, ningún rayo.

**Un destello en el eje del cuerpo se dibuja dentro del muñeco.** Medido: de los
340 píxeles que tocaban a 6 u se veían 24, los de las esquinas. Por eso el
fogonazo sale un palmo por delante del pecho (`ENEMY.muzzleForwardFactor`), que
es donde está la boca de un arma — **la bala sigue saliendo del eje**, eso no se
tocó. Y es una **estrella de cuatro puntas** y no un cuadrado: sin luces en la
escena la silueta es lo único que dice qué es una cosa, y un cuadrado blanco se
lee como una tarjeta pegada al pecho. Misma regla que la visera del casco.

**El silbido es una voz propia, no el disparo con otro volumen.** Ruido por un
pasa-banda que **cae** de 4.2 kHz a 1.25 kHz en 90 ms y sin nada por debajo de
900 Hz; el disparo lleva cuerpo grave y esto no lleva ninguno. La caída de tono
es lo que se lee como «ha pasado de largo» en vez de «ha sonado ahí».

**Reaparecer da unos segundos de gracia** (`PLAYER.respawn.invulnerableMs`), y van
**antes que el casco**: si no, un tiro a la cabeza durante la gracia gastaría el
casco sin quitar vida y la invulnerabilidad habría costado el casco. Reloj por
delta como los otros dos de `player.js`, así que en pausa no corre. Y nunca es
invisible para quien la tiene: marco azul y cuenta junto al bloque de vida.

**El escudo cubre el cuerpo; la cabeza es del casco.** El escudo absorbe el
`shieldAbsorb` del arma **que dispara** —fijo por arma, sin caída por distancia
todavía— y sólo en torso y piernas. El casco es binario: el primer disparo a la
cabeza lo rompe y se para ahí, el siguiente mata. Que mate no es un caso
especial: la cabeza vale 100 de 100 en el modelo de zonas, así que sale solo.
Por eso `ENEMY.bodyDamageScale` **no toca la cabeza** —escalarla rompería la
regla del casco— y por eso `ENEMY.aimHeightFactor` es 0.55 y no 0.78: apuntando
al pecho alto, el 11% de los impactos iban a la cabeza y cada uno era una muerte
instantánea; al centro del cuerpo, el 4%.

**Los relojes que pueden esperar van por delta, no por fecha.** La carga del
escudo y la cuenta de reaparición se descuentan con el tiempo de juego del frame,
que en pausa vale cero. Con un instante absoluto (`now + 15000`), pausar quince
segundos se comía una reaparición entera — el mismo tipo de agujero que ya se
cerró con la cuenta atrás del explosivo.

**El test de visión del enemigo es periódico y con presupuesto por frame.** Es un
raycast contra toda la geometría del escenario, así que no cabe por frame (misma
regla que la visibilidad de los puntos de aparición). Se recomprueba cada
`ENEMY.sightCheckMs` **y** como mucho `ENEMY.sightChecksPerFrame` veces por
frame: repartir sólo por tiempo no basta, porque ocho muñecos que aparecen
juntos acaban con los ocho relojes en fase. Medido: 0.03 ms por rayo, o sea 0.24
ms de golpe con ocho, contra un presupuesto de 0.2. A quien le toca y no le queda
presupuesto **no se le mueve el reloj**: mira en el frame siguiente.

Y como la vista se recomprueba cada 180 ms, **el disparo que acierta se comprueba
además contra la cobertura**, igual que el del jugador (`_isBlockedByCover`): sin
eso, meterse detrás de la Espina no libraba de las balas que ya venían de camino.
Es un rayo por disparo **que entra**, no por disparo. Medido: 0 de 292 disparos
atraviesan la Espina, y 29 de 54 aciertan a la misma distancia sin nada en medio.

**La fatiga de salto se mide en velocidad, no en desplazamiento.** Saltar parado
se desgasta (`MOVEMENT.jumpFatigue`), y lo que decide si un vuelo contó como
parado es la **velocidad horizontal máxima que llegó a tener**, no lo que avanzó
en línea recta: un bhop cerrado, girando todo el rato, avanza poco y va rápido, y
medir el desplazamiento habría castigado justo a quien domina la técnica. Es un
máximo y no una integral, así que no depende de cuántos frames lo muestreen.

Lo que se desgasta es el **impulso vertical** —se multiplica `jumpSpeed` al
despegar—, de modo que la parábola se sigue resolviendo en forma cerrada y un
salto fatigado se comporta igual a 60 que a 240 Hz (medido: los mismos factores y
el mismo ápice). No hay bloqueo: hay suelo (`minFactor`). Y un solo salto con
marcha de verdad borra la cuenta entera. Ojo con una consecuencia que no es un
fallo: **encadenar desde parado no perdona**, porque un encadenado conserva la
marcha del aterrizaje y la de un rebote es cero.

**Una sola forma de figura humana, y vive en `body.js`.** Desde la vuelta 38 el
avatar del jugador y la diana de *Hitbox completo* son **la misma geometría**:
una cápsula con la cabeza ovalada, medida sobre
`Reference/Avatar/avatar-simple-body.png`. Lo único que cambia entre una cosa y
otra es **el color** —naranja para una diana, el de su equipo para un jugador—, y
eso no es una casualidad de implementación, es la decisión: un rival se reconoce
por el color, que se ve igual desde cualquier ángulo, y no por su forma, que se
ve distinta desde cada uno.

Antes había un humanoide de cuarenta y dos piezas con brazos que se afinaban,
hombreras, dedos y cuatro líneas de luz. Se tiró entero. El porqué del giro está
en `docs/decisions.md` §38; lo que hay que saber para no rehacerlo: un modelo con
extremidades **promete** información que no da —no hay esqueleto ni animación, así
que los brazos no apuntan a ningún sitio— y cuesta en cada avatar de una partida
llena.

**Las zonas son bandas del mismo perfil, no tres primitivas.** El modelo de daño
—cabeza 100, torso 50, piernas 34— ya dice a qué altura empieza y acaba cada zona;
una banda es el trozo de perfil entre esas dos alturas, y dos bandas contiguas
comparten el mismo anillo, así que la junta no se ve. De ahí sale lo que importa:
**la silueta que ves es exactamente la que recibe los disparos**, y la suite lo
comprueba vértice a vértice contra la del pool de dianas.

**En el boceto la cabeza está separada del cuerpo; en el modelo, no.** Un hueco
entre la banda de la cabeza y la del torso serían disparos que no dan en ninguna
zona. Lo que se hace es **estrangular el cuello** —radio 0.030 en el nivel
0.845—, que a distancia se lee igual y no deja agujeros.

**Agacharse achata el cuerpo, y sólo eso.** Una escritura de `scale.y` con la
altura de ojos que el movimiento ya ha resuelto: sin esqueleto, sin animación y
sin tocar el ancho. Es el mismo dato del que salen las zonas de disparo al
agacharse, así que no hay dos ideas de «estar agachado».

**Sin arma visible, en ninguna parte.** Ni en tercera persona ni en primera. Lo
que se dibuja de un arma es su silueta —en el HUD y en la ficha flotante—, no un
modelo en la mano.

**Los colores de equipo se eligieron midiendo, y la paleta libre es estrecha.**
Están cogidos el naranja (dianas), el rojo (te disparan), el verde (botones y
brújula), el ámbar (explosivo), el amarillo (te han detectado) y el azul
eléctrico (carga). Quedan el azul medio y el magenta, y son ésos: `#2F6BF0` y
`#D94BD9`. Medido en CIELAB —que es donde una diferencia de color se parece a lo
que ve un ojo—, entre los dos equipos hay ΔE 51 y contra el más cercano de los
reservados, 79. Y contra el fondo real del Plano A: magenta 3.02 de contraste
medio, azul 2.28, contra los 2.63 del naranja de hoy.

La vista de depuración (F3) sólo se abre **fuera de una sesión en marcha**: la
cámara es del jugador y el cronómetro corre, y mirarse el modelo no puede costar
segundos de ronda.


**Lo que se dibuja de unos datos no se guarda como imagen.** La miniatura de
cada escenario se dibuja en SVG desde `SCENARIOS`, con `coverHeight` y
`coverEdgeColor` compartidos con la escena 3D. Una captura se desincroniza en
cuanto alguien mueve una caja y nadie se entera.

**`sfx.js` dice cómo suena algo; `spatial.js`, desde dónde.** La dependencia va
en un solo sentido —de `spatial` a `sfx`, por el contexto de audio— y las voces
aceptan un emisor sin importar nada de él. Al revés habría ciclo.

Dos trampas de `THREE.PositionalAudio`, las dos silenciosas:
`AudioListener` crea su propio `AudioContext` si no se le pasa el nuestro con
`AudioContext.setContext()` antes de construirlo, y nodos de contextos distintos
no se conectan. Y `updateMatrixWorld` **no mueve el panner** si
`hasPlaybackControl` es true y no se está reproduciendo — aquí nunca se llama a
`play()` porque la fuente es síntesis, así que hay que ponerlo a false o el
sonido queda clavado en el origen.

Con panner, el volumen por distancia lo aplica **sólo** el panner: pasar además
la curva manual sería atenuar dos veces.

**La música va por su propio nodo y sólo suena en los menús.** Generada, como
todo el audio: ni un fichero, y sin bucle que se reconozca a la tercera vuelta.
Se calla al empezar a jugar —durante la partida el audio es información— y vuelve
al pausar. Dos trampas, las dos con su cicatriz:

- **El contexto de audio no arranca sin gesto**, y `resume()` es asíncrono:
  preguntar por `ctx.state` justo después devuelve todavía `suspended`. Se espera
  al **cambio de estado**, no sólo al gesto, o la música no suena hasta el
  segundo click.
- **`disposeAudio()` cierra el contexto y el siguiente `initAudio()` crea otro.**
  Una espera armada sobre el viejo no se entera de nada nunca más. Por eso se
  guarda *sobre qué contexto* se está esperando y no un booleano. Pasa de verdad:
  React en modo estricto monta, desmonta y vuelve a montar.

**Se llevan dos armas, y la pistola no se elige.** La ranura la declara el arma
(`WEAPONS[x].slot`) y de ahí salen `PRIMARY_WEAPONS` —lo que ofrece el
desplegable y valida el saneado— y `SECONDARY_WEAPON`. No hay una segunda lista
en ninguna parte: si un arma cambia de ranura, cambia sola en los tres sitios.
Tres consecuencias que **son** el sistema:

- **Lo que dejas se congela**, y de una recarga a medias se guarda **lo que le
  faltaba**, no cuándo acababa. Con una fecha absoluta, cambiar de arma cinco
  segundos sería recargar gratis: el mismo agujero que se cerró en la cuenta
  atrás del explosivo y en la carga del escudo. Al volver a equiparla, la recarga
  sigue desde donde se quedó.
- **El HUD enseña el arma que llevas en la mano, no la del ajuste**, y el motor
  la publica por callback (`onWeapon`). Es una pulsación, no un valor por frame,
  así que puede ser estado de React sin saltarse la regla de no repintar por
  frame.
- **El silenciador es de cada arma, no del jugador** (vuelta 43). `SETTINGS.suppressor`
  es un mapa arma → booleano, no un interruptor: ponérselo a la Rift no se lo
  pone a la pistola. La tecla conmuta el del arma **que llevas en la mano** y la
  armería enseña los tres a la vez, cada uno en su ficha. Lo guardado hasta la 42
  era un booleano y se traduce en vez de tirarse —un `true` se reparte entre las
  armas que lo admiten—, que es la misma idea que `LEGACY_WEAPON_KEYS` y
  `LEGACY_KEYBINDS`. Y el saneado acota contra `supportsSuppressor`: lo que
  decide es el dato del arma, no lo que diga localStorage.

**Un arma pesa, y el peso lo traduce una sola función.** Cada entrada de
`WEAPONS` declara `weight` en kilos y `weaponSpeedFactor` dice cuánto frena: peso
gratis hasta `MOVEMENT.load.free`, un `perKg` de pérdida por encima y un suelo en
`minFactor`. La usan el movimiento —para ir más lento— y la armería —para decir
cuánto—, porque dos cuentas separadas es como acabas con un panel que promete un
10% y unas piernas que dan un 6%. Tres cosas que son el diseño:

- **La pistola no cuesta velocidad.** Cae por debajo del peso gratis: la que se
  lleva siempre no puede costar, o el coste estaría en no haber elegido. Lo paga
  la principal, que es la decisión.
- **Multiplica las tres marchas**, no sólo la carrera: si sólo frenase corriendo,
  andar con el rifle sería más rápido que correr con él en cuanto el factor
  bajase de `walkSpeed/speed`.
- **En el aire no cambia nada.** La marcha se congela al despegar, así que
  cambiar de arma a media trayectoria no toca el vuelo; y el techo del air-strafe
  tampoco se escala, que el aire es técnica. Por eso las suites del modelo de
  movimiento se miden **con la pistola equipada**: la referencia del modelo es el
  jugador sin carga.

Hoy: Pulse 1.1 kg → 6.50 u/s, Volt 2.6 → 6.14, Rift 3.6 → 5.88. **Se calibra
jugando.**

**El arma principal se equipa en la armería, no en opciones.** Elegir arma no es
un ajuste entre la sensibilidad y el tamaño de diana: es la decisión de la
partida. El panel (tecla **B**) **pausa como Escape** —por el mismo camino,
`_suspend()`—, porque elegir arma con ocho muñecos disparándote es una ruleta, no
una decisión. La pistola tiene ficha pero no botón: se lleva siempre. Y el daño
que enseña es el del **modelo de zonas** (100/50/34), que hoy no varía por arma:
un número de daño por arma sería inventarse un dato que el juego no tiene.
Opciones conserva la fila diciendo qué llevas y por dónde se cambia — quitarla
del todo dejaba perdido a quien llevaba vueltas buscándola ahí.

**Y tiene tres reglas de forma, que son lo que la hace usable** (vuelta 43). Es
el panel que más se va a abrir, así que la forma no es decoración:

1. **Un solo botón grande por ficha, y es la acción**: equipar. Lo demás que se
   pueda tocar es pequeño y dice su estado con la forma —la casilla verde del
   silenciador (`.checkline`), que no se parece a un botón porque no hace lo
   mismo—. Cinco botones iguales en una ficha obligan a leerlos todos para saber
   cuál es el que actúa.
2. **Los números no se esconden detrás de un clic.** Antes había un botón
   «Ficha»: comparar tres armas costaba tres clics y se comparaba de memoria.
   Ahora están puestos y llevan **barra**, con el tope sacado del propio arsenal
   —no de un número redondo—, que es lo que deja leer la diferencia sin restar.
   Y sin color de bueno/malo: que un rifle pese más no es peor, es otra cosa.
3. **Lo que ves es lo que te llevas.** Poner el silenciador cambia la silueta a
   la variante `ghost-`, que es otra foto del arma de verdad. El interruptor no
   dice «activado»: enseña el arma con el tubo puesto.

**Y las filas de las fichas las alinea la rejilla (`subgrid`), no el contenido.**
Comparar armas es mirar la misma fila en las tres, así que CADENCIA tiene que
estar a la misma altura en las tres. Con cada ficha apilando lo suyo, un botón
que mide ocho píxeles más que un rótulo desalineaba la columna entera de números.
Cuadrarlo con un `min-height` medido funciona hoy y se rompe el día que alguien
toque el relleno de `.button`; con `subgrid` lo hace el navegador y no hay número
que mantener. `armeria43.mjs` lo mide en píxeles, fila a fila.

**Mover el valor de fábrica de una tecla no basta con cambiarlo.** La B era del
silenciador y pasó a ser la de la armería; el silenciador se mudó a la **V**. Lo
guardado manda sobre el valor de fábrica, así que sin más la armería se habría
quedado **sin tecla** —la invariante es que dos acciones nunca comparten una— y
sin ningún aviso. `LEGACY_KEYBINDS` es la hermana de `LEGACY_WEAPON_KEYS`: allí
una clave vieja se traduce, aquí una tecla vieja se **suelta**, y sólo si coincide
exactamente con el valor de fábrica viejo — a quien la reasignó a mano no se le
toca nada.

Y estrechar el catálogo de un ajuste **borra el valor guardado**: un
`weapon: 'pulse'` de antes de la vuelta 39 cae a fábrica en el siguiente
saneado, que es exactamente lo que hace el saneado con cualquier clave obsoleta.

**Un disparo puede venir de un fichero; todo lo demás, no.** `samples.js` es el
único camino de audio de un disparo —del jugador y de los muñecos— y decide él
si suena la muestra grabada o la síntesis: quien dispara no elige ni tiene que
saberlo. Cuatro reglas que sostienen el respaldo:

- **La síntesis es el suelo, no el plan B de emergencia.** Sin fichero, con uno
  que no se decodifica o mientras todavía viaja, suena el disparo sintetizado.
  Nunca hay silencio y **nunca hay espera**: un disparo no aguarda a su muestra.
- **Qué hay se sabe por el manifiesto** (`weaponSamples.js`, que emite
  `npm run audio:weapons`), no preguntando al servidor: sondear costaría un 404
  por arma y por variante en cada arranque.
- **La variante silenciada es opcional y su ausencia no cae a la normal.** Soltar
  el disparo sin supresor de un arma que lo lleva puesto es información falsa;
  cae al perfil silenciado sintetizado.
- **Los buffers son del contexto en el que se decodificaron.** `disposeAudio()`
  cierra el contexto y el siguiente `initAudio()` crea otro: se guarda *sobre qué
  contexto* se decodificó, igual que la espera de `music.js`. React en modo
  estricto monta, desmonta y vuelve a montar.

**Renombrar una clave de catálogo borra lo que hay guardado, salvo que se
traduzca.** En la vuelta 41 las tres armas cambiaron de nombre sin tocar ni una
estadística, y la clave vieja está en el `localStorage` de quien ya jugó: el
saneado, que no la conoce, la habría mandado a fábrica y quien tuviera el
Volt habría abierto el juego con otra arma sin explicación.
`LEGACY_WEAPON_KEYS` traduce **antes** de validar contra el catálogo. Es una
tabla de renombrado y no un catálogo: no añade opciones, dice cómo se llamaba
cada una. Lo que no esté en ella sigue el camino de siempre —clave desconocida,
valor de fábrica—, que es lo correcto para una opción que dejó de existir.

**Cada arma trae sus dos siluetas, y la silenciada es otra foto.** `<arma>` y
`ghost-<arma>`: el silenciador **alarga** el arma, así que lo que se iguala entre
las dos fotos es la altura, y el interruptor no cambia de tamaño el arma. Desde
la vuelta 41 las tres las tienen, así que `trace-weapons.mjs` saca las seis de un
bucle y `WeaponSilhouette` elige con una línea. Añadir un arma es añadir su clave.

**El gatillo en seco suena también durante la recarga, y no es un detalle.** La
última bala arranca la recarga sola (`_consumeAmmo`), así que «cargador vacío y
sin recargar» es un estado que el juego **no produce nunca**: mientras la
condición del clic seco pedía `!this.reloading`, el sonido existía, sonaba en una
prueba que ponía ese estado a mano, y no había forma de oírlo jugando. Lo que se
mide de un sonido es que se oiga **desde el juego**: la prueba de la vuelta 31
vacía el cargador a base de clicks con las tres armas y mide amplitud en el
máster, no llamadas a funciones.

**El explosivo no tiene ayuda de interfaz.** Ni indicador en el HUD, ni marcador
en pantalla, ni distancia. La única pista es el pitido: volumen por proximidad,
tempo y tono por cuenta atrás. Por eso, con explosivo, **el cronómetro del HUD
cuenta hacia arriba**: enseñar lo que queda sería poner el temporizador de la
bomba en pantalla por la puerta de atrás. El progreso de desactivación sí se ve,
pero en el mundo —un anillo en el suelo—, no en la interfaz.

**La precisión se puntúa contra el objetivo del arma, no en bruto.** Cada entrada
de `WEAPONS` lleva `precisionTarget` (0.85 / 0.5 / 0.4) y el componente vale
`min(1, bruto / objetivo)`. Medir en bruto castigaba elegir el arma difícil. Si
añades un arma, ponle su objetivo; sin él se cae a la precisión en bruto.

**Las estrellas no llevan color.** El naranja es de las dianas y el ámbar del
explosivo: una estrella teñida se confunde de reojo con cualquiera de los dos. El
contraste va por forma —relleno blanco contra contorno apagado—, no por tono.

**La puntuación normaliza por la suma de los pesos, no por el número de
variables.** Es lo que hace que una variable a peso 0 sea de verdad inerte, y lo
que permitió que `damage` y `deaths` pasaran de 0 a 0.1 en la vuelta 34 sin tocar
ni la fórmula ni el peso de las otras dos. Vale para la siguiente que se añada.
Detonar **no puntúa**: es "Fallido", no 1★.

**Bajo el punto de mira gana lo más cercano, siempre.** El tablero de acciones no
tiene prioridad por ser interfaz: se compara su distancia con la de la diana y la
del escenario. Cualquier candidato nuevo se suma a esa comparación, nunca delante
de ella. El tablero está **apagado** desde la vuelta 28, pero la regla y su
prueba siguen vivas —`fixes.mjs` [1] lo enciende a mano— porque es la regla, no
el tablero, lo que hay que conservar.

**Lo que se apaga se apaga en su módulo, no en quien lo usa.** `ActionPanel` lee
`ACTION_PANEL.enabled` y se vuelve inerte por dentro: no entra en ninguna de las
dos escenas, `raycast` devuelve null y `follow`/`syncLayout`/`update` son un
`return`. El motor le sigue hablando desde los mismos siete sitios de siempre.
Lo único que conserva encendido es `clearVolume`: el hueco reservado del tablero
se sigue auditando contra los puntos de ruta, así que volver a encenderlo no lo
mete dentro de una caja.

**En el aire la marcha se congela.** `currentSpeed` devuelve la del despegue
mientras `airborne`. Cambiarla a media trayectoria deja el vuelo igual de largo y
la mitad de recorrido, que se siente como flotar.

**La colisión nunca empuja hacia atrás.** Resolver un eje devuelve siempre una
posición **entre de donde se venía y a donde se iba**; a quien ya esté metido en
una pieza se le deja salir por la cara que tenga más cerca. Con cajas grandes
—la plataforma del Balcón ocupa la sala entera— "sacarlo por el lado más
próximo" son cuarenta unidades de teletransporte.

**Y no se compara la posición contra la caja engordada por el radio.** En cada
eje la pieza ocupa la banda `[minA − radio, maxA + radio]` y lo único que se
decide es si el paso **mete más** al jugador en ella. Preguntar «¿estaba ya
dentro?» como `from + radius > minA` parece equivalente y no lo es: al frenar,
`from` queda en `minA − radio`, y sumarle el radio no siempre devuelve `minA` en
coma flotante —con la Media de x −1, −1.4 + 0.4 da −0.9999999999999999— y el muro
dejaba de bloquear al segundo frame de contacto. Tampoco vale la banda como «ya
estaba dentro»: tras un salto se aterriza rozando una pieza, con el centro fuera
y el cilindro dentro, y eso abría la puerta entera.

**Las rampas son sólidas, y sólo por arriba.** Vivían únicamente en
`groundHeightAt`, así que no bloqueaban nada: se entraba andando dentro de la
cuña, de pie y agachado. Estorban cuando su superficie en el punto de llegada
sube más de un escalón por encima de lo que el jugador ya pisa, **más lo que la
propia rampa gana de altura en ese tramo** —sin ese término la subida depende del
tamaño del paso y a pocos FPS se atasca—. El crédito de pendiente sólo cuenta si
ya se está encima: al entrar desde fuera no, o este test sería más permisivo que
`groundHeightAt` y se podría poner un pie donde el suelo luego se niega a
levantarte.

**La horizontal y la vertical tienen que admitir los mismos sitios.** La
horizontal corre antes, así que usa la altura de pies **más baja del frame**
(`_feetYAfter`, de la misma parábola cerrada). Sin eso, dar por bueno un paso por
encima de un cajón y caer un frame después dejaba al jugador hundido dentro. Por
lo mismo, `groundHeightAt` **no** descarta una caja por alta: si el centro cae en
su huella es que se entró por arriba —la colisión mantiene el centro a un radio
de cualquier cara— y lo que se pisa es su techo.

**La única holgura admitida es el escalón** (`COVER.stepHeight`), y es la que
hace saltable la cobertura Baja. Lo que la resolución por ejes sí deja es un
**roce** del cilindro contra una esquina con el centro fuera; está acotado por el
radio del cuerpo y no puede crecer más, porque en cuanto el centro entra en la
huella el jugador aparece encima de la pieza. `colision.mjs` lo mide: 0.37 u
andando y 0.40 en el aire, contra un radio de 0.40.

**El test de visibilidad es de activación, nunca por frame.** Es un raycast
contra toda la geometría del escenario y no cabe en el presupuesto de un frame.
Si no hay ningún punto visible se reintenta tras `SPAWN.pointRetryMs`, jamás al
frame siguiente.

**Ninguna acción del juego se mapea a un modificador, y CTRL no agacha.**
Agacharse avanzando era Ctrl+W, y **Ctrl+W cierra la pestaña** en Chrome y en
Edge: el navegador resuelve ese atajo antes de que el evento llegue a la página,
así que `preventDefault` no lo toca —sí neutraliza Ctrl+A/S/D, las otras tres
direcciones, pero con W no hay nada que hacer—. Se manifestaba como un cierre
intermitente «sin motivo»: sólo pasaba con W pulsada en el instante de agacharse.
Agacharse es **C**. `estabilidad.mjs` lo guarda: ninguna tecla de `MOVEMENT.keys`
puede ser un modificador.

**Ningún frame sale del movimiento con un valor que no sea finito.**
`_guardState()` comprueba posición, pies, velocidad vertical, altura de ojos,
hundimiento y estado del despegue, y si algo no es finito vuelve al último estado
sano —que se guarda cada frame que lo es— y suma en `recoveries`. No tapa ningún
bug conocido: medio millón de frames de alternancia rápida de salto y agachado,
con deltas de 0 a 100 ms, no han producido ni uno. Está porque un NaN en la
posición viaja a la matriz de la cámara, de ahí al `matrix3d` que el
CSS3DRenderer escribe en el tablero, y de ahí al compositor del navegador, que es
el único punto de la cadena donde un número roto se puede llevar la pestaña
entera. En juego normal `recoveries` vale cero y las auditorías lo comprueban.

**El límite de FPS usa un acumulador de delta con arrastre del resto y
tolerancia** (`tolerance = min(1, interval * 0.1)`), no salto crudo de frames.
Sin la tolerancia, un tope igual al refresco del monitor lo parte por la mitad
(tick de 4.166 ms contra objetivo de 4.167 ms). **Y es el mismo mecanismo que
reparte los pasos del mundo** desde la vuelta 44 (`_advanceSimulation`), con la
misma tolerancia y por la misma razón: un monitor a 60 Hz entrega frames de
16.666 ms contra un paso de 16.667. Lo que cambia es que el limitador **descarta**
lo que sobra y la simulación **lo gasta** —puede dar más de un paso por frame—.

**Las teclas son un mapa único en `KEYBINDS`, y el store las sanea como los
ajustes.** Antes estaban repartidas entre `MOVEMENT.keys`, `WEAPON_KEYS` y
`OBJECTIVE.defuseKeys`, con tres formatos; ahora hay un bloque con una entrada
por acción, y `src/keybinds.js` hace con ellas lo que `settings.js` hace con los
ajustes: cargar, sanear, avisar. Cuatro cosas que sostienen el sistema:

- **La invariante es «dos acciones nunca comparten tecla», y se mantiene
  saneando**, no comprobando al asignar: lo que llega de localStorage se recorre
  en orden y lo que choca cae a su valor de fábrica; si ése también está cogido,
  la acción se queda **sin asignar** antes que duplicada.
- **Ctrl, Alt y Meta no son asignables, ni sueltos ni en combinación.** Es la
  regla de la vuelta 27 —Ctrl+W cierra la pestaña— convertida en código: el
  saneado rechaza el modificador y la captura del panel rechaza la combinación,
  que el código de tecla por sí solo no delata (Ctrl+Z manda `KeyZ`).
- **`extra` son cortesías, no binds.** Las flechas y el Shift derecho funcionan
  y no se pueden reasignar ni perder; el panel las enseña como alternativas. Sin
  eso, unificar los binds habría quitado en silencio las flechas.
- **La acción contextual es una sola acción.** `use` desactiva el explosivo
  dentro de su radio y **nunca hace nada más ahí dentro**; fuera equipa el
  artilugio. Dos acciones peleándose por la misma tecla es como se pierde una
  ronda por un reflejo. El radio lo decide `objective.isPlayerInRange`, no una
  segunda cuenta en el motor.

**Hay teclas reservadas sin lógica, y es a propósito.** 3 para el cuerpo a
cuerpo, 5 para el artilugio y G para el arrojadizo —la 4 dejó de estarlo en la
vuelta 34 con el escudo, y la 1 y la 2 en la 39 con las dos ranuras de arma—. El
mapa de controles tiene que ser el definitivo desde el principio: si se añaden
cuando existan las mecánicas, alguien ya habrá puesto ahí su bind favorito. El
panel las marca «sin efecto todavía».

**El motor completo se conecta a la red por `usarRed(cliente)`, y lo que cambia
no es un modo: es de dónde sale la verdad** (vuelta 56, la «Opción B»).
Movimiento, disparo, vida y reaparición **dejan de decidirse en el motor**; el
arma —cargador, recarga, retroceso, dispersión, sonido— se queda del lado del
cliente y lo único que el servidor le exige es la cadencia. El motor no
construye el cliente ni sabe de sockets: `net/prueba.js` lo ensambla con la
cámara, el movimiento y los oclusores **del motor** y se lo entrega, así que la
regla de la 45 sigue en pie. Ocho métodos se adaptan y ninguno se duplica: el
detalle, en `docs/decisions.md` §56.

**En red no se apaga nada que produzca entradas.** Es la regla que gobierna los
tres métodos del abatido, y la más fácil de hacer mal:

- **`_downPlayer` no apaga el movimiento.** Quien decide que un muerto no avanza
  es el servidor, que ignora sus entradas hasta `vivoEn` (vuelta 52); apagarlo
  además aquí deja de producir entradas, y entonces **ese jugador no reaparece
  nunca**, porque la reaparición cuelga de sus propias entradas. Se ve igual:
  0.00 u con la tecla de andar pulsada.
- **`_respawnPlayer` no reaparece**: ya lo hizo `_aplicar`, con su `reset()` y su
  época de pose. Repetirlo sería un segundo teletransporte que nadie predijo.
- **`_onPointerLockChange` no llama a `_suspend()`.** Sería el «estoy en pausa»
  local que la vuelta 53 quitó. Lo que sí se hace es la verdad de lo que pasa:
  soltar las teclas y apagar la mirada.

**El arma viaja en cada entrada, porque es del movimiento y no del disparo.**
Un rifle frena (`weaponSpeedFactor` multiplica las tres marchas), así que si el
peso sólo lo sabe un lado los dos simulan distinto: medido con la Rift, el
cliente predecía a 5.88 u/s contra los 6.50 del servidor, o sea **75
correcciones en 286 fotos y 2.5 u de error**. Va como índice de `WEAPON_ORDER`
para que quepa en un número, y un solo campo sirve para tres cosas —el peso, la
cadencia que el servidor valida y la silueta que el rival ve en su ficha— sin
ninguna ventana en la que puedan discrepar. Después: **0 correcciones**.

**La cadencia la valida el servidor; el arma la lleva el cliente.** Entre dos
disparos aceptados tiene que haber pasado lo que dicen las RPM del arma
declarada, y un arma que no está en el catálogo no dispara. Se mide en **número
de paso** y no en la fracción del disparo —la fracción es para el rebobinado, que
necesita el instante exacto; la cadencia sólo necesita un reloj monótono que
compartan los dos—, con una holgura de un paso (`NET.shotRateSlackTicks`) que es
la cuantización del propio reloj del cliente y no un número inventado. Un disparo
rechazado **recibe veredicto igual** —el cliente espera uno por `seq`— pero no
toca el mundo ni cuenta como desacuerdo de la red.

**Lo que el jugador pulsa y lo que el paso ejecuta son dos cosas**
(`movement.input` y `movement.keys`). Fuera de la red son **el mismo objeto** a
propósito: sin nadie que reejecute, la intención y lo ejecutado son lo mismo y
copiar por paso sería trabajo por nada. `separateInput()` los desdobla, y sólo
la red lo pide — porque la reconciliación reejecuta entradas guardadas y llena
`keys` sesenta veces por segundo con máscaras **del pasado**. Con un solo objeto,
cada foto borraba la tecla que el jugador tenía pulsada: medido, con W apretada
el jugador **no se movía en absoluto**. De ahí sale cuál se suelta cuándo:
`reset()` —o sea cada reaparición— suelta lo que se ejecuta y **no** la
intención, o reaparecer con W apretada te dejaría parado; soltar el ratón,
perder el foco y desactivar el movimiento sueltan las dos.

**Escribir en un campo no es jugar** (`typingInField`, en `keybinds.js`). El
juego no tiene ni un campo de texto y por eso no hacía falta; la página del duelo
sí, y con el motor completo teclear el código de la sala **era jugar**: la `B`
abría la armería y `preventDefault` se comía lo escrito. Vive con `eventCode` y
`keysOf` porque es el mismo vocabulario, y lo miran el motor y el movimiento
desde el mismo sitio.

**Y la sesión de red empieza con la bienvenida, no con el clic.** El clic
enciende el mando —mirar y teclear—; el mundo lleva corriendo desde que el
servidor dio sitio. Va en el **mismo turno** que la bienvenida: `_beginSession`
suelta las teclas, así que arrancar un frame tarde se come una tecla pulsada
justo al entrar. Y empieza **en la ranura que da el servidor**, no en el spawn
del escenario —`movement.reset()` conoce uno solo y el servidor reparte dos—, o
el primer paso de cada partida llega con 2.5 u de error.

**El ritmo del bucle en red vive en `cliente.pasosDeFrame()`**, no en el motor ni
en la página. Es del netcode: el acumulador solo bastaría para un juego local, y
lo que lo distingue es el enganche al reloj del servidor, el re-anclaje de la
vuelta 49 y el freno con suelo de la 51. En un solo sitio, o el motor llevaría
una segunda copia de las dos.

**Pausar es parar el mundo de los dos, y sólo lo decide el servidor** (vuelta
53). Un «estoy en pausa» local sería el mismo fallo con otro disfraz: hasta la 53
Escape abría el menú y el mundo seguía corriendo por detrás, así que con WASD se
andaba con el menú puesto. `Partida` lleva el estado, `tick()` no avanza nada
mientras esté puesta —**el número de paso tampoco**, misma regla que
`engine.gameTime`— y la foto sigue saliendo, que es cómo se enteran los dos.

De ahí, tres cosas que hay que respetar al tocar esto:

- **Los dos huéspedes re-anclan su reloj en pausa**, porque el de pared sigue y
  el del mundo no. Sin eso, el de Node se vuelve un bucle a máxima velocidad y el
  de la nube se debe medio minuto de pasos al reanudar.
- **El historial de envíos se borra al entrar en pausa.** El RTT sale de restar
  el instante en que se mandó una entrada, y una mandada antes de la pausa se
  confirma después: el viaje mediría la pausa entera. Medido, tras 1,5 s de
  pausa el RTT saltaba de 29 ms a **1.500**, `pasoObjetivo` se iba noventa pasos
  por delante y el cliente se quedaba a 20 pasos/s el resto de la partida.
- **En pausa no se anota ningún disparo.** Se consume en el paso siguiente, y en
  pausa no hay pasos: sería una bala guardada, apuntada a donde el rival estaba
  parado.

**Tres pausas libres por jugador y partida** (`PAUSE.free`); de la cuarta en
adelante decide el rival, votando. Sólo la levanta quien la puso —si no, pedirla no serviría—, e irse levanta la
propia, o el otro se queda en un mundo parado para siempre. Se contesta con
**teclas** (Intro / N) y no con un botón: a quien le llega la petición está
jugando con el ratón capturado, y soltarlo para pinchar sería pausarle la partida
para preguntarle si quiere pausarla.

Y dos gestos que **no** son pausa local y sí hacen falta: **soltar el ratón suelta
las teclas** (como perder el foco: quien abre el menú no está pulsando nada) y
**volver a pinchar levanta tu propia pausa** —Escape pausa, clic reanuda—, o se
recupera el ratón con el mundo todavía congelado. Se contesta a una votación con
**teclas** (Intro / N) y también con los botones del cartel: ver abajo por qué las
dos cosas y no una.

**La votación no es una pausa, y por eso no congela a nadie** (vuelta 55). La 54
la metió dentro de la pausa para cerrar el agujero de la 53 —quien la pedía se
quedaba con el ratón suelto mientras el rival seguía jugando, y matando— y el
precio era el mundo parado de los dos mientras alguien se decidía. La 55 ataca el
mismo agujero por el otro lado y **sustituye aquello entero**: no hay nadie
esperando. Escape sin libres abre el menú de siempre con un botón, pulsarlo manda
la solicitud y **cierra el menú**, al rival le entra un cartel por el borde
derecho y los dos siguen jugando. Si sale, arranca la pausa votada de la 54 tal
cual; si no sale, no pasa nada — y no hay aviso de «denegada» que cerrar, porque
nadie llegó a congelarse. Medido: 7.80 y 7.91 u andados con la votación abierta,
contra los 0.00 de la 54 y los 7.91 de referencia jugando.

**Pedir y votar son dos verbos, no uno con un `if`.** Hasta la 54 había un solo
mensaje y el servidor decidía qué era mirando las libres que quedaran. La cuenta
de libres le llega al cliente **en la foto**, o sea con un viaje de retraso, así
que un cliente con la cuenta vieja podía abrirle al rival un cartel que su jugador
no había pedido. Un mensaje dice lo que se quiere, no lo que se supone. De ahí
también que **soltar el ratón sólo pida pausa si quedan libres**: sin ninguna,
Escape es un menú y nada más.

**Quien no contesta se suma al que va ganando.** Quien la pide vota que sí sin
decir nada —pedirla es quererla— y al agotarse `PAUSE.voteWindowSeconds` los votos
que faltan van a la opción con más apoyo; un empate no aprueba. Es la regla que
generaliza a más de un rival: con tres a favor y uno callado, ese callado no puede
valer lo mismo que un «no». **Consecuencia: en 1v1 el silencio aprueba**, que es
lo contrario de la 53 — y el motivo de aquello ya no existe, porque entonces el
que pedía se quedaba tirado esperando y ahora está jugando.

**Y el botón del cartel no se puede pinchar jugando.** Con el ratón capturado el
clic va al elemento del `pointerlock`, que es el lienzo: medido, y la primera
hipótesis —que algo lo tapara— la tumbó el propio banco, porque
`elementFromPoint` sí encuentra el botón ahí. Por eso cada botón lleva **su tecla
escrita al lado** (Intro / N), que no es una redundancia sino las dos situaciones
reales: capturado se contesta con la tecla, suelto se pincha. Y soltar el ratón
durante una votación **no pausa** aunque queden libres —dos cuentas atrás a la vez
no se sabrían leer—, así que abrir el menú para contestar con el ratón no le para
el mundo a nadie.

**Declinar tiene color propio porque no quedaba ninguno libre.** El hueco obvio
parecía el violeta y medido en CIELAB no lo es: `#8B5CF6` se queda a **ΔE 24.8**
del azul de equipo, contra los 51 que separan a los dos equipos y los 79 con que
se eligieron. Naranja, rojo, verde, ámbar, amarillo, azul y magenta tienen dueño,
así que lo único sin dueño es el eje que nadie ha pedido: el neutro.
`COLORS.decline` mide ΔE 68 contra el más cercano. Aceptar va en verde porque es
la acción; declinar es seguir jugando, que es no hacer nada.

**Toda pausa tiene tope, y su reloj es el de pared** (vuelta 54). Una libre dura
`PAUSE.freeMaxSeconds` (120 s) y una votada `PAUSE.votedMaxSeconds` (60), y al
agotarse se reanuda sola; la votada dura la mitad porque el que dice que sí paga
un rato parado que no ha elegido. Va contra la convención de «los relojes que
pueden esperar van por delta» **a propósito y por la misma razón que la
sostiene**: es el reloj *de la pausa*, y con el del mundo —que está parado— la
cuenta no bajaría nunca. La ventana de la votación va por el mismo reloj, aunque
ahí el mundo sí corra: las dos son cuentas de la conversación, no del juego. Lo
que viaja en la foto es **cuánto queda**, no hasta cuándo: los relojes de las dos
pantallas y el del servidor no coinciden, así que el número lo calcula el
servidor y el cliente lo ancla al suyo al recibirlo.

**Y una pausa tuya te suelta el ratón** (vuelta 55). Con las libres el orden era
el contrario —Escape suelta y luego llega la pausa—, pero una votada llega
jugando, y quedarse capturado en un mundo parado es no tener con qué reanudarlo.
Al que votó que sí no se le toca: no ha pedido nada, y devolverle al menú sería
castigarle por haber dicho que sí.

Y el cartel se reconstruye **al cambiar de estado**; la cuenta, por frame y en su
propio nodo. Rehacer el `innerHTML` sesenta veces por segundo se lleva por
delante el botón de reanudar en mitad de un clic — es la regla del HUD (cero
repintado por frame) en una página sin React.

**El tuning de las pausas vive en `PAUSE`, no en `NET`.** Eran dos números y son
cuatro (`free`, `voteWindowSeconds`, `freeMaxSeconds`, `votedMaxSeconds`): la
mitad de lo que se toca al calibrarlas en un sitio y la otra mitad en otro es cómo
se cambia uno y se olvida el que le hacía pareja. Quién puede pausar y cuánto
dura, en `PAUSE`; cómo viajan los bytes, en `NET`.

**La muerte va en el reloj de las entradas, no en el del servidor** (vuelta 52).
`vivoEn` es el número de **entrada** de la víctima a partir del cual vuelve a
estar viva, y los dos extremos aplican el mismo predicado a los mismos números.
Con el paso del servidor —que el cliente no comparte, porque va por delante lo
que tarde el viaje— «estoy muerto» daría distinto a cada lado por construcción, y
cada foto traería una corrección. Es la regla del protocolo de la vuelta 45
(«el reloj de la red es el número de paso») aplicada a una mecánica nueva: si
añades algo que dure varios pasos —un aturdimiento, una recarga autoritativa—, va
en ese reloj.

De ahí sale lo demás: **la reaparición ocurre al ejecutar la primera entrada que
alcanza `vivoEn`**, que es una entrada concreta, así que el cliente la predice
igual que el servidor. Medido: 0 correcciones y 0 u de error prediciéndola,
contra 15.46 u sin predecirla — que es la distancia del punto de muerte al spawn,
o sea una corrección del tamaño del mapa en cada muerte.

Y **un abatido no se mueve** (0.00 u con la tecla de andar pulsada) ni se dibuja:
`poseDelRival()` publica `vivo`, del lado viejo de la interpolación como todo lo
demás cuando hay salto. Consecuencia deliberada: quien deja de mandar entradas
estando muerto **no reaparece** hasta que vuelve, porque la reaparición cuelga de
sus propias entradas.

**Una baja se distingue de un impacto por forma y por voz, no por intensidad.**
La marca son los mismos trazos más largos con el centro en anillo —sin color
nuevo, que en esta paleta todos los tonos significan ya algo y el rojo es «te
disparan **a ti**»— y dura 420 ms contra 140, porque una baja cierra un
intercambio y se mira. El sonido (`playKill`) **baja** de tono y lleva un grave
que el acierto no tiene: el acierto sube y dice «has conectado». Misma regla que
el silbido de la vuelta 40 — una voz propia, no la de al lado con otro volumen.

**Al reloj del servidor sólo se le hace caso si está fresco** (vuelta 51). El
enganche frena al cliente cuando va por delante restándole un paso por frame:
contra un reloj que avanza se apaga solo, contra uno **parado** es una trampa sin
fondo — medido, 60 → 3 → **0 pasos por segundo**, y de ahí no sale, porque cuanto
más pasa más «por delante» se cree. El jugador se queda sin poder moverse y
clavado en el punto de aparición, que está detrás del muro, así que el rival no
le ve en absoluto: las dos mitades del síntoma salen de la misma línea.

Sin foto en `NET.clockStaleMs` no se consulta el reloj: se predice a tiempo real
por el acumulador. Y el freno tiene **suelo**, medido en **frames seguidos
frenados** y no en pasos por frame — «nunca menos de un paso por frame» es falso,
porque a 144 Hz el acumulador da menos de uno y forzarlo pondría el mundo a 144
pasos por segundo.

**Y quedarse fuera se dice, no se sufre.** Hay tres formas de que la partida deje
de estar —te echan (`ADIOS`), se corta el cable (`onClose`) o dejan de llegar
fotos (`NET.offlineMs`)— y hasta la 51 las tres tenían la misma pinta: un juego
colgado. Ahora el aviso **amarillo** dice «no llegan fotos» y puede pasarse solo;
el **rojo** es definitivo y lleva el motivo del servidor. Al desconectarse se
suelta el ratón: dejar a alguien capturado en una partida que no existe es
encerrarle en una pantalla que no responde. Ojo al añadir mecánicas: `dar()`
**predice en local aunque no haya conexión**, así que sin estos avisos un jugador
rechazado se mueve tan contento sin existir para nadie.

**Hay tres relojes y los tres re-anclan: el motor, el Durable Object y el
cliente** (vuelta 49). El del cliente era el único que no lo hacía, y de ahí
salió el avance rápido al volver de otra pestaña. La regla es una: **por encima
de cierto atraso no se recupera corriendo, se re-ancla** —el motor con
`SIM.maxFrameDeltaMs`, el huésped de la nube con ese mismo número y el cliente
con `NET.resyncTicks`—. En el cliente además no hay nada que recuperar: con el
`requestAnimationFrame` parado no se produjo ni una entrada, y el servidor, que
no adivina, dejó a ese jugador quieto. Medido: sin esto, 33 u/s de velocidad
aparente contra los 6.5 de carrera, hasta 0.6 s, y correcciones en cuanto la cola
sin confirmar se pasa de `maxPendingInputs`; con esto, 6.5-6.9 u/s y cero
correcciones tras 60 s fuera.

**Y no se cuelga de `visibilitychange`, que es una pista y no el mecanismo.**
Medido: con una pestaña detrás de otra el rAF baja a **4.7 fps** mientras
`visibilityState` sigue diciendo `visible` y **no se dispara el evento** — un
arreglo colgado de ahí no habría hecho nada. Al revés, un cambio de pestaña de
200 ms sí lo dispara y no necesita re-anclar. Lo que se mira es el desfase, que
es donde el problema se manifiesta venga de donde venga: pestaña de fondo,
portátil dormido, pausa del recolector o un punto de ruptura.

**La ranura de un jugador es su sitio de salida y su color, y la asigna el
servidor.** `equipo` sale de la primera ranura **libre**, no de `jugadores.size`:
con el contador, en cuanto uno se iba el siguiente cogía la ranura del que
quedaba y los dos aparecían en el mismo punto y del mismo color. Y no se deduce
del id (`p1`, `p2`) porque el id es un contador que no para — dos jugadores
pueden ser `p3` y `p5` y quedarse otra vez iguales.

**Un banco no puede poner una pestaña en segundo plano, pero sí dar el mismo
estímulo** (vuelta 49). Chromium sin cabeza no frena la de atrás y Playwright
arranca con el frenado desactivado, así que con sus banderas de serie el fallo
**no se reproduce**. Lo que vale es **parar el `requestAnimationFrame` y dejar
todo lo demás corriendo** —el navegador para el dibujado y el WebSocket sigue
entregando—, que es lo que lo distingue de bloquear el hilo, que pararía también
el socket y mediría otra cosa. Y cinco cautelas, cada una de una medida falsa —las
tres primeras de la 49, las dos últimas de la 57:

- **En unidades de mapa por segundo, no en pasos por segundo.** Con el re-anclaje
  el contador de pasos **salta** en un frame: la primera tabla decía «28.784
  pasos/s» con el jugador quieto.
- **La sonda va dentro de la página, una muestra por frame.** Medir desde fuera
  con `evaluate` mete el viaje de ida y vuelta en la distancia y no en el tiempo:
  33 u/s donde la sonda de dentro da 6.5. Misma regla que la del render target de
  la vuelta 39.
- **Y se mira la ventana del fenómeno**, no lo que venga después: pasado el
  primer segundo lo que se mide es un tirón nuevo.
- **Un jugador por navegador** (la regla de la vuelta 50, que a este banco le
  llegó en la 57). Con las dos páginas en el mismo, A es la pestaña de atrás y el
  contenedor la frena —medido, **9 fps**—; un cliente frenado va permanentemente
  atrasado, o sea permanentemente en recuperación acotada, y eso se lee **igual
  que el fallo**: el brazo del arreglo daba 28.3 u/s sin que el arreglo tuviera
  nada que ver.
- **El hueco de la ausencia no es un fotograma.** La marca desde la que se
  analiza re-siembra la referencia de la sonda y tira la muestra siguiente. Sin
  eso llegaba con `dt` de **1016 ms** —el parón entero dentro de un «frame»—, y
  como la ventana de análisis mide 1000 ms desde la primera muestra, esa sola
  muestra **era** la ventana, y encima se descartaba por larga: pico 0.0 u/s con
  el jugador recorriendo 19 u por delante.

**Una suite que conduce el juego por dentro prueba el modelo, no el producto**
(vuelta 48). Los bancos de red mueven al jugador escribiendo en `cliente.teclas`
y disparan llamando a `cliente.disparar()`, y así midieron el error de
reconciliación hasta el último dígito **sobre una página que no se podía
empezar**: el clic no llegaba nunca al canvas y no había mira. Si algo tiene que
hacerlo una persona —un clic, una tecla, leer un número en pantalla—, hay que
hacerlo como lo hace ella: `jugable48.mjs` usa `mouse.click` y `keyboard.down`
contra la página real. Y dos avisos de esa vuelta:

- **Salir de la captura con Escape lo resuelve el navegador, no la página**, así
  que una tecla sintética no lo dispara. Desde un banco se sale con
  `document.exitPointerLock()`, que llega al mismo `pointerlockchange`.
- **De vez en cuando hay que mirar una captura.** Una aserción comprueba lo que
  se ha pensado; el cartel de ABATIDO salía con la vida a 100 y las aserciones
  que había —mira, vida, panel— pasaban todas.

**La página del duelo tiene dos capas, y el clic distingue entre ellas**
(vuelta 48). Lo de jugar —mira, vida, cartel de abatido— vive bajo
`body.jugando`, o sea sólo con el ratón capturado. Lo de no jugar —código de
partida y enlace— vive en el aviso, que es la pantalla de menú. Y los números de
red van detrás de **F3**, apagados de fábrica, como la vista de depuración del
juego: un jugador no tiene por qué mirar el error de reconciliación, y los mandos
de latencia simulada al lado del código invitan a tocarlos sin saber que lo que
hacen es empeorar tu propia conexión a propósito. **El fantasma va con ellos y
también apagado**: es un instrumento de medida, no un ajuste.

El clic que captura el ratón escucha **el documento** —el canvas no lo recibe
nunca, porque el aviso lo tapa y los eventos suben— con una sola excepción, los
controles (`.control`): copiar el enlace o teclear un código se hacen con el
ratón suelto.

**Ojo con dos reglas CSS de la misma especificidad**: la que apaga las capas de
juego y la que da forma al cartel de abatido tienen un id cada una, así que gana
la que va después. Un `display` en la regla base del cartel lo deja encendido
para siempre. Por eso `#abatido` no declara `display` y sólo lo hace su regla con
`.puesto`.

**Una suite sin aserciones no es una prueba, es un informe.** `baja.mjs` imprimía
«se sube en 12/12» y salía en verde pasara lo que pasara; con aserciones de
verdad cazó a la primera una regresión de 12/12 a 0/12. Si un test no puede
fallar, no está guardando nada. (`x8.mjs` sigue siendo un informe a propósito: no
afirma, mide.)

**Y una suite verde tampoco está verificada por estar verde** (vuelta 57). Los
tres fallos de `fondo49` —la muestra que se comía la ventana, la pestaña frenada
y el techo sin suelo— no produjeron ni un rojo en ocho vueltas; lo que los delató
fue mirar el volcado y preguntar de cuántos frames salía cada número. Y el de la
pestaña estaba resuelto **por escrito** desde la vuelta 50: lo que faltó fue
volver a pasar la regla nueva por las suites que ya existían.

**Mantén este fichero al día como parte del trabajo normal**, en el mismo commit
que introduce el cambio que lo afecta. No es una tarea aparte ni de "limpieza
al final". Lo mismo vale para `README.md` (cara al usuario) y para
`docs/decisions.md` cuando la decisión tenga un porqué que no se lee en el
código.

---

## 4. Aviso operativo: HMR de Vite puede mentirte

**Editar `config.js` (o `settings.js`) con `npm run dev` corriendo puede
duplicar el módulo de ajustes vía HMR.** Acabas con dos instancias del store: el
motor lee una y la UI escribe en la otra. El síntoma es una función que "no
hace nada" sin ningún error en consola — ya pasó una vez con el modo dinámico,
que parecía roto y no lo estaba.

**Si un resultado te parece extraño, reinicia el servidor de desarrollo antes de
creerte el diagnóstico.** No depures un falso negativo durante media hora.

**Y los dos huéspedes sirven `dist/`, no `src/`.** `npm run worker` y `npm run
host` construyen antes por eso mismo: con cualquiera de los dos levantado,
cambiar un fichero del juego **no se ve** —los ficheros que sirven son los que
había en `dist/` cuando arrancaron—. Es la misma clase de falso negativo que el
de arriba, por otra puerta: vuelve a lanzarlo antes de creerte el diagnóstico.
Y el de Node además **cachea en memoria lo que sirve, comprimido**, así que ni
siquiera reconstruir `dist/` por debajo le cambia nada: hay que reiniciar el
proceso.

Y no es sólo «una función que no hace nada»: en la vuelta 45 pasó **dos veces**
con la batería de pruebas entera. Los síntomas fueron suites que salían con
`0 pass` —la página ni cargaba— y aserciones devolviendo `undefined` donde había
un número. Las dos veces, la causa fue haber tocado `config.js` con vite
corriendo. **Añadir una clave a `config.js` cuenta**: reinicia antes de pasar las
suites, o la regresión que leas no será la del código que has escrito.

---

## 5. Estado actual (resumen)

**Hay un 1v1 de prototipo, y desde la vuelta 47 se puede jugar con alguien que
esté en su casa** (vueltas 45-47). Dos jugadores se mueven y **se disparan** por
el Plano A con predicción local, reconciliación y compensación de retraso. Sin
cuentas, sin escudo ni casco —el daño es sólo vida, con el modelo de zonas de
siempre— y con la partida muriendo con la sala.

La partida entera es `net/partida.js` y **no tiene código de juego**: importa
`movement.js`, `scenario.js`, `hitPlayer` y `hasLineOfSight` tal cual, con un
objeto plano donde iría la cámara. La corren **dos huéspedes**, que sólo ponen
reloj y cable:

- **En local**, `npm run net` levanta el huésped en el 5199 —y desde la 58 sirve
  también `dist/`, así que `npm run host` es el despliegue entero en tu máquina—.
- **En Fly.io** (vuelta 58), **el mismo `net/servidor.mjs`** en un contenedor, con
  **IPv4 dedicada**. Es donde se juega, y es **principio permanente mientras dure
  el bloqueo** (`docs/decisions.md` §0.1): todo lo que un jugador visite
  directamente —web, partida, y el día que existan login, tienda, rankings o
  cualquier API pública— va en infraestructura con IP propia. Cloudflare queda
  para lo que **no** sirve tráfico directo a un jugador: DNS en modo sólo-DNS y
  trabajo interno entre servidores. El porqué es el bloqueo de IPs de LaLiga:
  las operadoras anulan direcciones **enteras** de Cloudflare ignorando el SNI, y
  eso se lleva la página igual que la partida. Ficheros: `Dockerfile` y
  `fly.toml`; guía en `docs/despliegue-fly.md`; evaluación en
  `docs/propuestas/03-servidor-con-ip-propia.md`.
- **En Cloudflare**, un **Durable Object por código de partida**
  (`worker/sala.js`), con el mismo Worker sirviendo el juego y las salas.
  **Desde la 58 es respaldo, no producción**, y se queda en pie unas semanas. Se
  prueba sin cuenta y sin internet con `npx wrangler dev --local`, que corre el
  Durable Object de verdad en esta máquina. El despliegue paso a paso está en
  `docs/despliegue-cloudflare.md`; los Durable Objects **entran en el plan
  gratuito** con respaldo SQLite (`new_sqlite_classes`), que da unas 4,6 horas de
  1v1 al día.

**Partida por código:** quien abre la página crea una —seis caracteres de un
alfabeto que no se confunde al dictarlo— y pasa el enlace. Quien lo abre entra en
la misma. Es `idFromName(código)`: no hay lista de partidas ni matchmaking.

**Y desde la vuelta 56 el duelo lo lleva el motor completo** (la «Opción B»).
La página del duelo ya no monta una escena mínima: instancia `engine.js` y le
entrega el cliente de red. Lo que eso trae a una partida real es **el arma de
verdad** —las tres, con su cargador, su recarga, su retroceso y su dispersión—,
los **marcadores** sobre el rival (brújula y ficha con nick y arma) y un HUD con
**vida, munición, nombre del arma y cuña de daño**. Sin escudo ni casco: sólo
vida, como estaba decidido. Los iconos `?` / `!`, el fogonazo y el silbido del
rival se quedan fuera, y no por olvido: dicen en qué fase está quien te dispara,
y esa máquina de estados hoy sólo existe para los muñecos.

Hasta la 55 en pantalla había **mira, vida y el cartel de abatido**, y nada más.
Los números de red y el fantasma siguen apagados detrás de **F3**.

Desde la vuelta 53 **Escape pausa la partida de los dos**, con tres pausas libres
por jugador y permiso del rival a partir de la cuarta. Y desde la 54 **con
reloj**: dos minutos una libre, uno una votada, con la cuenta atrás en el cartel
y reanudación automática al agotarse.

Desde la 55 **la votación no congela a nadie**: sin libres, Escape abre el menú
de siempre con un botón de «Solicitar pausa por votación», pulsarlo manda la
solicitud y cierra el menú, y al rival le entra un cartel por el borde derecho
—Aceptar en verde, Declinar en pizarra— con 15 s para contestar. Los dos siguen
jugando mientras tanto. Si sale, arranca la pausa votada de la 54; si no, no pasa
nada y no hay ningún aviso que cerrar.

Desde la vuelta 52 el **abatido es autoritativo**: un muerto no se mueve, su
cuerpo no se dibuja y la baja se confirma al instante con marca y sonido propios.
El contador permanente de bajas espera al HUD completo.

De la primera prueba real entre dos casas (vuelta 49) salieron dos arreglos:
**volver de otra pestaña ya no da un avance rápido** —el reloj del cliente se
re-ancla en vez de recuperar el tiempo perdido— y **cada jugador lleva el color
de su equipo**, azul o magenta según la ranura que le dé el servidor. De la
segunda (vuelta 50), uno más: **reaparecer se dibuja como un teletransporte** y
no como un viaje en línea recta desde donde te mataron.

Medido: error de reconciliación **cero** hasta 300 ms de RTT; correcciones sólo
con pérdida de paquetes; **100% de acuerdo** entre lo que ve el tirador y lo que
decide el servidor mientras el rebobinado cabe bajo el tope de 200 ms, contra un
**20%** resolviendo sin rebobinar cuando el rival se ha apartado de verdad;
4.3 µs por disparo y 3.8 KB de historial por jugador. Y los mismos bancos, sin
tocar una aserción, salen verdes contra el Durable Object: la migración de la 47
no cambió nada.

**El mundo va a 60 Hz fijos** (`SIM.hz`) desde la vuelta 44, dibuje el monitor lo
que dibuje: el frame acumula tiempo real y gasta pasos con arrastre del resto, y
la cámara se dibuja interpolada entre los dos últimos. Con eso el juego se
comporta igual en cualquier pantalla —dispersión del aire del 1.53% al 0.07%, y
**cero** en monitores múltiplo de 60— y queda montada la condición que necesita
la predicción de cliente del 1v1.

Sala vacía de **80×80×16**, rejilla en suelo y paredes. **Cada escenario puede
traer la suya**: el Plano A vive en **40×40×10**. **Dos modos de sesión** (`SESSION_MODES`): `timed`, la ronda de **30 s** —y con
escenario, **la del explosivo**—, y `deathmatch`, el escenario sin bomba, que
dura lo que diga `SETTINGS.deathmatchDuration` (sin límite, 3, 5 o 10 minutos).
En la sala vacía ese segundo botón se sigue llamando **práctica libre**: sin
cobertura ni muñecos que disparen no hay deathmatch que valga. `endless` sigue
existiendo y sigue significando sólo una cosa: esta sesión no acaba sola.

**Dianas:** tres tipos — *clásica* y *cono* (ancladas al centro, esfera), e
*hitbox completo* (anclado a los pies, tres zonas con **vida compartida** y daño
por zona: cabeza 100 / torso 50 / piernas 34; cono de aparición más ancho y
distancia variable por muñeco). Desde la vuelta 38 el hitbox se dibuja con **el
cuerpo simple de `body.js`**, el mismo que el avatar del jugador. Modo dinámico opcional: destino aleatorio a
velocidad constante, con comprobación de separación para evitar solapes.
Selector de dianas simultáneas x1 / x2 / x3 / x5 / x8. **Ojo:** con cobertura, el
nivel es un *techo*, no una cantidad — el número real lo pone cuántos puntos de
ruta se ven desde donde está el jugador. Con 68 puntos, en el Plano A se llena
casi siempre.

**Escenarios:** variante activable desde opciones, no reemplazo. *Sala vacía*
(Gridshot de siempre, muestreo por cono, 80×80) y **Largo y Puerta**, el primer
escenario con cobertura, en **su propia sala de 40×40**: Espina con una sola
Puerta de 2.5 u, El Largo con tres Media escalonadas, Los Cajones de corta
distancia, el Balcón elevado (+2.6) con **una rampa en cada extremo** y parapeto
con dos troneras de 4 u, y un Vestíbulo partido en dos por el **muro de
aparición**: detrás el jugador, tapado de todo; delante las dos rutas que se
encuentra al asomarse, una por cada extremo.
Veinte piezas: las mismas de siempre menos la vieja divisoria del Vestíbulo y más
el **muro de aparición** de la vuelta 43 —una sola pieza Media de 14 u atravesada
delante del spawn, con salida por los dos extremos—. Lo que se recortó en la 39
fue el suelo entre ellas.
Cruzarlo en diagonal cuesta **8.1 s** en vez de 16.8. El vocabulario de piezas y
la rampa de grises están en `COVER`; la geometría, en `SCENARIOS`.

**Catorce rutas y 68 puntos**, de 4 a 6 puntos cada una, repartidas por las seis
zonas: El Balcón 4, Los Cajones 3, El Largo 2, Pasillo trasero 2, Vestíbulo 2 y
La Puerta 1. Cualquiera de los 68 es sitio de aparición **y** destino de
patrulla. Las dos del Vestíbulo cambiaron de lado en la vuelta 43 —estaban
detrás del muro de aparición, donde ya no puede haber nadie— y se rebarrieron
con `rutas43.mjs` sobre lo que quedó libre delante de él.

Con un escenario montado: el jugador **colisiona** contra las cajas (resuelto un
eje cada vez, con soporte de suelo y rampas), los **disparos se paran en la
cobertura**, y la **distancia de aparición no se aplica**. El **modo dinámico**
sólo mueve a los muñecos *hitbox*, que patrullan por su ruta; clásica y cono se
quedan en su punto, porque un destino aleatorio las metería dentro de un muro.

**Controles reasignables:** un mapa único en `KEYBINDS` con las acciones que
funcionan hoy —movimiento, salto, agachado, caminar, disparar, recargar, cambiar
de arma, el silenciador en la **V** (era la B hasta la vuelta 42), la contextual
**E**, el escudo en la **4**, **1** y **2** para equipar principal y pistola,
**TAB** para el marcador y **B** para la armería— y las **reservadas sin
lógica**: 3 para el cuerpo a cuerpo, 5 para el artilugio y **G** para el
arrojadizo. Sección **Controles** en opciones: tecla actual, reasignar
capturando la siguiente pulsación, botón por acción y por lo general.
Persistido en `aimcore.keybinds.v1` con saneado. **Escape queda fuera del
sistema** y el panel lo dice.

**Música de menús:** ambiente generado en tiempo real (`src/audio/music.js`),
con su propio volumen en opciones. Suena en inicio, opciones y pausa; se calla al
jugar.

**Avatar del jugador (sólo visual):** **el mismo cuerpo que una diana** —cápsula
con cabeza ovalada, tres piezas, una por zona del hitbox— tintado con el color de
su equipo (`TEAMS`: azul `#2F6BF0` y magenta `#D94BD9`). Sin extremidades, sin
esqueleto, sin animación y **sin arma visible**. Agacharse lo achata. **F3** abre
una vista en tercera persona que orbita el modelo, fuera de partida.

**Movimiento:** WASD, tres marchas (correr / SHIFT andar / **C** agachado —CTRL
no, ver convenciones—, gana la más lenta), salto sin doble salto **resuelto en forma cerrada** —misma
trayectoria a cualquier refresco, y desde la vuelta 44 **el mundo entero va en
pasos fijos de 60 Hz**, así que tampoco depende del monitor lo que sí era una
integración—, **salto encadenado** con SPACE dentro de
`MOVEMENT.chainJumpWindowMs` (130 ms a cada lado del aterrizaje exacto), que
conserva la marcha del aterrizaje —con vector, también **la dirección**—, y
**air-strafe**: en el aire, girar el ratón hacia el lado de la tecla de estrafe
acelera hasta `MOVEMENT.airStrafeMaxSpeed` (9.5 contra 6.5 de carrera) y sin
pasar de ahí nunca. Con el modelo vectorial (por defecto) el ritmo de giro
importa —40°/s es el óptimo, 140°/s frena— y en el aire hay inercia; con el
escalar, tres saltos bien encadenados llevan de 6.5 a 9.5 girando todo lo rápido
que se pueda. Límites
reales de la sala con margen de seguridad. Por encima de `ACCURACY.speedThreshold` y
siempre en el aire se aplica dispersión de disparo (dirección y magnitud
aleatorias, sumada al recoil, sin mover la cámara).

**Armas:** tres arquetipos con cargador, recarga por tiempo (manual con R o
automática al llegar a 0), patrón de recoil acumulativo por disparo consecutivo
que se resetea al soltar o tras `RECOIL_RESET_MS`, y flag de supresor por arma
con sonido propio.

| Arma | Ranura | Modo | RPM | Cargador | Recarga | Supresor | Peso | Marcha |
|---|---|---|---|---|---|---|---|---|
| Pulse | secundaria (tecla **2**, siempre) | semi | 500 | 18 | 1200 ms | sí | 1.1 kg | 6.50 u/s |
| Rift | principal (tecla **1**) | auto | 600 | 30 | 2300 ms | sí | 3.6 kg | 5.88 u/s |
| Volt | principal (tecla **1**) | auto | 800 | 25 | 1800 ms | sí | 2.6 kg | 6.14 u/s |

Se llamaban Scalar-2, Axis-7 y Vertex-9 hasta la vuelta 41: el renombrado no tocó
ni una estadística, y un ajuste guardado con el nombre viejo se traduce al nuevo
en vez de caer a fábrica. Cada una trae sus dos siluetas —`<arma>` y
`ghost-<arma>`, con silenciador— y **las tres lo admiten**. Desde la vuelta 43 el
silenciador es **de cada arma**: se pone y se quita en su ficha de la armería, y
la tecla (**V**) conmuta el de la que lleves en la mano.

**Se llevan dos: la principal, que se elige en opciones, y la pistola, que va
siempre.** La 1 saca una, la 2 la otra y **Q** alterna. Cada una lleva su propio
cargador y su propia recarga, y la que dejas se congela tal cual estaba —una
recarga a medias no avanza en la espalda, se reanuda al volver a equiparla—.

**Audio de disparo: sintetizado hoy, con carril para muestras reales.** Un arma
puede traer su `Reference/Audio/weapons/<clave>.mp3` (y opcionalmente
`-suppressed.mp3`); `npm run audio:weapons` lo copia a `public/audio/weapons/` y
lo declara en `src/audio/weaponSamples.js`. Hoy no hay ninguno, así que todas
suenan sintetizadas — y así seguirán las que no tengan fichero.

**Panel de acciones disparable: apagado** (`ACTION_PANEL.enabled: false`). El
código se queda entero —DOM en 3D vía `CSS3DRenderer` anclado al spawn, con
planos WebGL invisibles para el raycast, y botones Pausa / Reiniciar / Cambiar
arma / Silenciador / Opciones—, pero no hay tablero en la sala: disparar hacia
su sitio es un disparo normal. Su hueco reservado se sigue auditando.

**HUD:** **abajo a la izquierda**, y sólo donde hay quien dispare, el bloque de
vida: cruz en CSS, barra fina, escudo de tres segmentos recortado en silueta,
contador de cargas y **casco trazado con potrace** (silueta y visera con
`evenodd`, que es lo que lo hace reconocible), con parpadeo rojo por debajo de 45
de vida **y sin escudo**. Al recibir un disparo se enciende un anillo alrededor de la
mira **y una cuña roja en el borde hacia quien te ha disparado** —dos avisos, uno
dice cuánto y el otro de dónde—, y abatido sale en el centro lo que falta para
reaparecer. Además, la
**marca de Vektor** arriba a la izquierda —icono discreto, sin
texto, en el mismo gris apagado que el contador—; aciertos, fallos, precisión y
tiempo arriba; contador de FPS en la esquina de enfrente y, **justo debajo, un
engranaje con la palabra ESC** —contorno gris sin relleno, calculado como la estrella y no pegado como un
`d` a mano— que es la única pista en pantalla de dónde están las opciones ahora
que no hay tablero; y **bajo la mira**, centrado, el bloque de arma en
**una sola fila** —silueta a un lado, munición actual/máximo al otro, con
parpadeo en reserva baja—, con el nombre del arma como rótulo secundario debajo,
más el indicador de recarga y los mensajes de ayuda.

**Audio espacial:** interruptor en opciones, activado por defecto. Los sonidos
posicionados suenan con dirección (listener en la cámara, `PositionalAudio` en el
mundo). Desactivado, se cae a volumen por proximidad sin dirección. Hoy lo usa el
pitido del explosivo; el módulo es genérico para pasos y rivales.

**Dummies que disparan (sólo con escenario y hitbox completo):** con línea de
visión y dentro de `ENEMY.engageRange` (24 u), un muñeco abre fuego con el
**modelo de arma de siempre** —cadencia, cargador, recarga y sonido salen de
`WEAPONS`, hoy la Rift— apuntando al centro del cuerpo del jugador con el cono
de la dificultad. Dispara en ráfagas de cuatro con pausa, y el disparo se resuelve
contra las **tres zonas del jugador**, que son las del hitbox.

**Y se nota aunque no lo estés mirando** (vuelta 40): cada disparo enciende un
**fogonazo** blanco —estrella aditiva de 0.22 u— por delante de su pecho; una bala
que falla y pasa a menos de 1.8 u del oído **silba** desde el punto por el que
pasó, con dirección real; y un impacto enciende una **cuña roja en el borde de la
pantalla** hacia el lado del que disparó, medio segundo y con el centro libre.

**Dificultad en el panel:** Fácil (15°, 900 ms), Normal (9°, 650 — lo de siempre)
y Difícil (5°, 400). Un nivel fija los dos números; ver convenciones. La velocidad
de movimiento no entra ahí a propósito: ya es el ajuste `patrolSpeed`.

**Tres capas sobre cada muñeco, de abajo arriba** (mismo sitio que el fuego
enemigo):

1. **Brújula**, cuña verde con volumen que gira en yaw hacia donde mira el muñeco.
   **Sólo sobre quien se ve de verdad** desde la vuelta 42 —dentro del encuadre y
   sin cobertura por medio, con el mismo test que la aparición—; los dos iconos de
   arriba no, que son avisos. Y discreta a propósito desde la vuelta
   39 —el 61% del ancho de la silueta del muñeco, contra el 105% que ocupaba
   antes— sin dejar de leerse a media distancia: 105 px de área a 12 u y 106 a
   20 u. Contra la cobertura del Plano A: de 10.390 pares puesto×punto con la
   cabeza a la vista, la tapa en **3** (0.03%).
2. **Icono situacional**, billboard: `?` amarillo mientras te ha visto y aún no
   dispara, `!` rojo mientras te dispara, uno por muñeco para contar amenazas de
   un vistazo. Se apagan al perder contacto o al caer.
3. **Ficha arma + nick**, billboard y **condicionada**: sale tras sostener la mira
   encima 350 ms, nunca por estar a la vista. Es DOM en el espacio
   (`CSS3DRenderer`), como era el tablero de acciones.

**Marcador con TAB:** panel superpuesto con nick (placeholder `VK-00` hasta que
haya cuentas), bajas, muertes, precisión y KD de la sesión en curso. Se abre
mientras se mantenga la tecla y sólo durante la partida.

**Al reaparecer, 2 s de invulnerabilidad** (`PLAYER.respawn.invulnerableMs`), con
marco azul y cuenta junto al bloque de vida. Y al morir, **ABATIDO** en grande con
una viñeta que oscurece los bordes y se aclara según se acerca la reaparición: el
propio aclarado es la cuenta atrás.

**Vida, escudo y casco:** 100 de vida; escudo de hasta 150 en tres segmentos de
50, que se aplican de uno en uno con **4** en dos segundos y con su zumbido
eléctrico; hasta cinco cargas en el inventario. El escudo cubre el cuerpo y
absorbe el `shieldAbsorb` del arma que dispara (0.5 / 0.45 / 0.35); la cabeza no
la cubre nadie salvo el casco, que es binario. Se empieza con **un segmento
puesto y sin cargas**, y lo demás se recoge del suelo: ocho recogibles curados
por el Plano A —cuatro cargas, tres cruces de vida y **un casco, en el Balcón**—,
todos en puntos de ruta y ninguno en el Vestíbulo. Reaparición de 3 s que sube 2 s
por muerte hasta 15 y baja 3 s con cada baja, sólo por encima de 10.

**Fatiga de salto:** rebotar parado se desgasta. Dos saltos gratis y a partir del
tercero cada uno pierde un 12% de impulso hasta un suelo del 55%; un solo salto
con marcha de verdad lo borra, y 1.4 s sin saltar también.

**Explosivo (sólo con escenario y cronómetro, nunca en práctica libre):** aparece
en uno de cinco sitios curados del Plano A —uno por zona, ninguno en el
Vestíbulo—, marcador de octaedro ámbar parpadeante, 45 s de cuenta atrás que
**son el reloj de la sesión**. Se desactiva manteniendo **E** a menos de 3 u
durante 3 s; soltar cancela el progreso sin penalización. Desactivarlo y que
detone terminan la sesión, y el resumen dice cuál de las dos.

**Puntuación por estrellas (1-5, sólo con escenario):** precisión y tiempo a peso
0.5 cada una —la precisión, **normalizada contra el `precisionTarget` del
arma**— y, desde la vuelta 34, **daño recibido y muertes a peso 0.1**: ya no son
variables reservadas, porque los muñecos disparan y eso son datos. Peso bajo a
propósito, y de partida. Cortes en `SCORING.starThresholds`. El HUD las enseña **en vivo**, y
bajan solas con el paso del tiempo porque el tiempo es la mitad de la nota.

**Pantalla de inicio:** el **logotipo completo** ocupa el sitio del rótulo de
texto —marca en blanco y «VEKTOR» en naranja, 184 px— y es el `h1` de la
pantalla; debajo se queda el crédito «by FlickLAB». El favicon es la marca en
naranja sobre fondo transparente (`public/favicon.svg`, generado).

**Selector de escenario:** plano cenital por escenario dibujado desde los datos,
más la ficha —entrena / riesgo / rejugabilidad— del que esté elegido. Al cambiar,
una transición corta tapa el montaje. Los planos van en **rejilla de columna
fija** (140 px de plano, la mitad que cuando se repartían el ancho entre dos): el
selector crece en filas con cada escenario nuevo en vez de encoger los que ya
estaban.

**Armería (tecla B, o su botón en inicio y en pausa):** panel de equipo con una
ficha por arma. Cada una lleva, en este orden y **alineado con las de al lado**
(`subgrid`): silueta —la silenciada si lleva silenciador—, nombre y **tecla con
la que sale**, modo y carácter, marca de **en la mano**, el botón **Equipar**, la
**casilla verde del silenciador** y las estadísticas puestas, con barra
comparativa contra el arsenal en cadencia, cargador y peso: daño (el modelo de
zonas, igual para las tres), cadencia, peso y lo que cuesta en velocidad,
cargador y recarga, absorción de escudo y objetivo de precisión. La pistola sale
con su ficha y sin botón de equipar: se lleva siempre. Se cierra con **Escape**,
con **B** o con su botón, y abrirla **pausa** la sesión igual que Escape. Sin
precios y sin comprar: no hay economía todavía.

**Opciones** (accesibles antes de empezar y desde la pausa, persistidas):
escenario, sensibilidad, tipo de diana, **duración de Deathmatch**
(sin límite / 3 / 5 / 10 minutos), tamaño de diana, distancia de spawn, cadencia
de aparición, dianas simultáneas, límite de FPS, **audio espacial**, mensajes de
ayuda, **dificultad de los muñecos**,
modo dinámico y **velocidad de
patrulla** (1.5–8 u/s, por defecto 4: `TARGET.moveSpeed` pasa a ser sólo el valor
por defecto del ajuste, y el motor lee el del store).

Cada ajuste lleva **su propio botón «por defecto»** junto a su etiqueta, que
restablece sólo ese; el **Restablecer** del final sigue restableciéndolos todos.
El valor sale de `SETTINGS[clave].default`, el mismo del que parte
`sanitizeSettings`: no hay una segunda lista de valores de fábrica. Las filas del
panel se identifican por **clave de ajuste**, no por descriptor, justo para que
el botón no pueda apuntar a un ajuste distinto del que enseña la fila.

---

## 6. Fuera de alcance por decisión, no por olvido

Cuentas, guardado en la nube, rankings, minimapa, pasos sonoros. Si el encargo no
lo pide explícitamente, no se añade.

**Lo que está fuera pero se ha dicho que vendría después vive en
`docs/roadmap.md`**, ordenado por dependencia y sin fechas: reconexión, condición
de victoria, escudo y casco en red, identidad y cuentas, el SDK Social de
Discord, el modo de eliminación, el modo FlickLAB con ranking, los Planos B y C,
los mapas de comunidad, la economía y la monetización. Ese fichero **no autoriza
nada** —esta sección sigue mandando— y está para no reconstruir la lista cada vez
buscando en `decisions.md` la vuelta en que salió cada idea.

**El backend dejó de estarlo en la vuelta 45 y la nube en la 47**, pero sólo
hasta donde llega el prototipo: un Durable Object por código de partida, y nada
más. **Ni cuentas, ni matchmaking, ni persistencia, ni rankings** — la partida
muere con la sala y eres `p1` o `p2`. El plan y lo que cuesta cada paso están en
`docs/propuestas/02-multijugador-1v1.md`; el despliegue, en
`docs/despliegue-cloudflare.md`.

**Economía: tampoco.** La armería de la vuelta 42 equipa y nada más — sin precios,
sin dinero y sin botón de comprar. Comprar depende de rondas y de una economía que
no existen, y un `$0` en la ficha prometería una mecánica que no hay.

**En diseño, aún no construido:** los Planos B (*El Patio*) y C (*La Ejecución*)
de `docs/propuestas/01-escenario-cobertura.md`. No los construyas hasta que el
Plano A esté validado jugando.

**El salto ya no depende del refresco.** Con `jumpSpeed 8.67` y `gravity 30`:
ápice **1.2528 u** y **578 ms** de vuelo, iguales en cualquier monitor
(desviación 0.036% entre 60 y 240 Hz, y esa pizca es dónde caen las muestras, no
la trayectoria). La cobertura `baja` de 1.25 **es saltable de forma fiable** —
verificado 12 de 12 a 60, 144 y 240 Hz.

**Ya no hay mecánicas reservadas en la puntuación:** daño recibido y
muertes/reinicios se calculaban desde hacía vueltas con peso 0, y en la 34 se les
dio peso. La fórmula no hubo que tocarla, que era justo lo que se buscaba al
dejarles el hueco.

**Lo que sí sigue reservado son tres teclas de equipo** (3, 5 y G): tienen bind y
no tienen lógica. La 4 dejó de estarlo al llegar el escudo, y la 1 y la 2 al
llegar las dos ranuras de arma.

---

## 7. Historia y porqués

`docs/decisions.md` guarda el histórico completo: cada decisión de diseño
relevante, su razonamiento y las alternativas descartadas. No se carga en cada
sesión — consúltalo cuando necesites saber **por qué** algo está como está antes
de cambiarlo.

Y mirando hacia delante, `docs/roadmap.md`: el inventario de lo que se ha dicho
que vendría después, por dependencia y sin fechas. Una entrada de ahí es un
renglón, no un diseño — cuando a una le llegue el turno, lo que se escribe es una
propuesta en `docs/propuestas/`, como se hizo con el escenario de cobertura y con
el 1v1.
