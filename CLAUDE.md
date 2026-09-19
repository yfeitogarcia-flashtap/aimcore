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
  (`src/audio/sfx.js`): osciladores + un buffer de ruido pregenerado. **Y se
  queda así**: la vuelta 63 probó en juego las diez muestras grabadas —tres
  disparos, sus tres silenciados, tres recargas y el gatillo en seco— y se
  descartaron. No por calidad: **sonar a sintetizado es parte de lo que es
  Vektor**, y nada que descargar ni decodificar es parte de que corra en
  cualquier PC. `AUDIO.samplesEnabled` está en `false`.
  El carril sigue montado y no estorba —`samples.js`, el importador y los WAV en
  `Reference/Audio/`—, así que volver a probarlas es poner ese booleano a `true`
  y pasar `npm run audio:weapons`; probar **una sola**, dejar sólo su fichero en
  `Reference/`. Con el interruptor apagado el importador **no copia nada**: lo
  que no se va a oír no entra en el build. La convención de debajo sigue en pie
  para el día que se reconsidere: **la síntesis no se sustituye, se queda
  debajo**.
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
| Escenario | `src/game/scenario.js` | Convierte los datos de `SCENARIOS` en mallas, colisionadores, oclusores y **rutas**. Y publica su sala (`scenario.room`), su zona de aparición (`isInSpawnZone`), su **física** (`scenario.fisica`) y lo que reparte si en él no se compra (`dotacionDeDuelo`). |
| Línea de visión | `src/game/sight.js` | `hasLineOfSight`: el **único** raycast de «¿se ve eso desde aquí?». Lo usan la aparición y los marcadores. |
| Sala | `src/game/scene.js` | Rejilla y paredes, reconstruibles con `setRoom`: cada escenario tiene su tamaño. |
| Audio espacial | `src/audio/spatial.js` | Listener en la cámara y emisores posicionados. **Genérico:** no sabe del explosivo. |
| Muestras | `src/audio/samples.js` | Disparos grabados, **con la síntesis siempre detrás**. Único camino de audio de un disparo. |
| Explosivo | `src/game/objective.js` | Aparición, cuenta atrás, pitido y desactivación. No publica nada al HUD a propósito. |
| Puntuación | `src/game/scoring.js` | Variables normalizadas, media ponderada y estrellas. |
| Transición | `src/game/transition.js` | **Módulo sustituible entero.** Contrato único: `run(build)` tapa la escena, llama a `build()` y destapa. Nada más del motor sabe qué forma tiene. |
| React | `src/App.jsx`, `src/ui/` | Sólo conoce la *fase* (inicio / juego / pausa / resumen) y el resumen final. |
| Capa del duelo | `src/ui/duelo.jsx` | Monta **los mismos** `Hud`, `Crosshair`, `Options` y `Armoury` en la página del 1v1 y los publica como un asa imperativa. No dibuja nada propio (vuelta 73). |
| Tajo | `src/game/slash.js` | El destello de un golpe de cuchillo. **Del motor, con su propia hoja de estilos**: sin arma en la mano, la pantalla es lo único que cuenta el golpe. |
| Mirilla | `src/game/scope.js` | La lente del francotirador: negro alrededor, cruceta fina y punto rojo. **Del motor, con su propia hoja de estilos**, para que salga igual en los dos modos. |
| Silueta del arma | `src/ui/weaponSilhouette.js` | Qué trazado toca —con supresor es otra foto— y el SVG como texto. **Sin React, para que lo usen los dos modos.** |
| Armería | `src/ui/Armoury.jsx` | Panel de equipo (tecla B): silueta, ficha y «Equipar» por arma. Escribe en el store de ajustes, como opciones. |
| HUD | `src/ui/Hud.jsx` | Se actualiza **imperativamente por refs** desde el bucle. Cero `setState` por frame. |
| Cuerpo | `src/game/body.js` | **La única forma de figura humana**: la usan las dianas, el avatar **y el hitbox**. Lo alto, lo ancho a cada altura y dónde cortan sus tres zonas. |
| Avatar | `src/game/avatar.js` | El cuerpo del jugador, tintado con su equipo. Geometría, sin lógica. |
| Grilla | `src/game/grid.js` | Generador de líneas. Lo usan la sala **y** la piel del avatar. |
| Jugador | `src/game/player.js` | Vida, escudo, casco, reaparición y **dónde te han dado**. |
| Fuego enemigo | `src/game/enemyFire.js` | Los muñecos disparando: visión, reacción, cadencia y cono. Y **publica en qué fase está cada uno**. |
| Marcadores | `src/game/markers.js` | Brújula, iconos `?` / `!` y ficha arma+nick sobre cada muñeco. Sólo dibuja, y la brújula **sólo a quien se ve de verdad**. |
| Fogonazo | `src/game/muzzleFlash.js` | El destello de cada disparo enemigo. Pool de estrellas aditivas; sólo dibuja. |
| Recogibles | `src/game/pickups.js` | Cruces de vida, cargas de escudo y casco por el suelo. |
| Config | `src/config.js` | Todo el tuning, sin excepción. |
| Partida (servidor) | `net/partida.js` | **Todo lo que decide el servidor**, sin saber por dónde viaja: entradas, pasos, disparo, rebobinado y fotos. Un jugador entra con una función `enviar(texto)` y nada más. **No hay red en este fichero.** |
| Huésped de Node | `net/servidor.mjs` | Node + `ws`, y desde la vuelta 58 **el del despliegue**: encamina por código de sala, lleva un reloj por sala y sirve `dist/`. El mismo fichero en local y en Fly. |
| Huésped de Cloudflare | `worker/sala.js` | El Durable Object. Lo mismo, con las piezas de Cloudflare. **Respaldo** desde la 58; ya no es donde se juega. |
| Portero | `worker/index.js` | `/sala/<código>` → `idFromName(código)`; todo lo demás, los ficheros del juego. |
| Código de sala | `net/codigo.js` | Alfabeto, normalización y forma de la ruta. **Lo usan el cliente y el Worker.** |
| Duelo (pantalla) | `net/prueba.html`, `net/prueba.js` | La página del 1v1. **Hospeda el motor completo** (vuelta 56) y se queda con lo suyo: código de partida, menú, avisos, pausas y los números detrás de **F3**. Se llega por `/duelo/`, en los tres montajes. |
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

**El duelo no reescribe lo que ya funciona contra los muñecos** (vuelta 63).
Antes de construir nada para el 1v1 —o para cualquier modo multijugador que
venga— se mira si eso ya existe en el modo de siempre y **se reutiliza**. Una
segunda implementación de la misma idea no es más código: es un juego que se
comporta distinto según el modo, y una diferencia que nadie decidió es **un fallo
de producto**, no un detalle. Las que sí están decididas —que el duelo no tenga
dianas, ni puntuación, ni armería— están escritas aquí y en `decisions.md`; todo
lo demás tiene que salir igual en los dos sitios.

Es la convención de siempre —«una sola fuente de verdad para lógica
compartida»— aplicada a los modos, y es lo que hizo barata la vuelta 56: el duelo
**hospeda el motor entero** en vez de montar su propia escena, así que el arma,
el retroceso, los marcadores y el HUD son los mismos objetos. Si algo que quieres
para el duelo no está en el motor, el sitio donde ponerlo es el motor.

Hoy hay un hueco pendiente y va en este sentido, no en el otro: **las pisadas
existen sólo en el duelo** (`_pisadasDelRival`). El día que un muñeco haga ruido
al patrullar, sale de ahí —`playFootstep` y el emisor ya son genéricos— y no de
un segundo sistema de pasos.

**Y el duelo ya no tiene HUD propio: monta el del juego** (vuelta 73). La página
del 1v1 llevaba desde la vuelta 45 con su vida, su bloque de arma, su cartel de
abatido y su cuña de daño escritos a mano, y el precio de esa copia se vio
entero jugando — **cinco cosas, y ninguna era una decisión**: no había chaleco
en pantalla aunque se acabara de comprar, ni casco, ni marca de Vektor, ni ficha
de armas, y **no había forma de abrir las opciones sin salir de la partida** (de
ahí que la sensibilidad de la mirilla, que existe desde la 70, fuera
inalcanzable).

`src/ui/duelo.jsx` monta `Hud`, `Crosshair`, `Options` y `Armoury` —los
componentes del entrenamiento— en la página del duelo, y las cuatro funciones de
pintar que había allí se borraron. **No hizo falta cambiar ni un campo del
motor**: `stats` ya traía `shieldSegments`, `helmet` y `charges` desde la 64, y
lo que faltaba era quién los dibujase. Tres reglas:

- **Lo que el duelo no tiene se declara, no se esconde.** Aciertos y fallos,
  estrellas y marcador de sesión son del entrenamiento: el 1v1 no tiene
  puntuación (vuelta 45) y lleva su propio marcador de ronda. Va con una bandera
  (`<Hud duelo>`) y no con un segundo componente.
- **La tipografía del juego se escribe una vez** (`.hud-layer`, en
  `styles.css`). Montado el HUD, los anchos salían clavados y los altos no —44
  px de bloque de vida contra 40— porque el `body` de la página del duelo
  declara `font: 12px/1.5` para su menú y su tienda y eso se colaba dentro. Una
  diferencia entre modos de cuatro píxeles sigue siendo una diferencia que nadie
  decidió.
- **Y la armería del duelo no equipa: enseña** (`soloFicha`). Ahí lo que llevas
  lo decide el servidor —se compra, o lo reparte el mapa—, así que un botón
  «Equipar» prometería algo que va a ignorar. Mismo componente, mismos datos,
  una bandera.

Medido (`duelo73`): bloque de vida, bloque de arma, marca y FPS caen en el mismo
sitio y del mismo tamaño en los dos modos, pixel a pixel.

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

**El duelo tiene su mapa, y la simetría sale por construcción** (vuelta 66).
Hasta aquí el 1v1 se jugaba en el Plano A, que es un mapa de **entrenamiento**:
un punto de aparición, un muro delante y todo lo demás repartido para que haya a
quién disparar. Puesto a servir de duelo daba dos cosas mal —los dos salían **a
5 u uno del otro**, así que la ronda empezaba resuelta, y media sala (el Balcón,
las troneras) es ventaja para quien llegue antes—. El del duelo es **El
Espejo**, y tiene cuatro reglas:

- **Giro de 180°, no espejo.** Lo que se declara es media sala y `giro180` añade
  la otra girada media vuelta. Con un espejo cada jugador tendría la esquina
  estrecha por un lado distinto, o sea un mapa distinto para cada uno; con el
  giro, **la vista de uno es la del otro**. Y sale por construcción porque
  escribir dos veces cada caja es escribir la ocasión de que una se quede a media
  unidad de su pareja. Lo que va centrado en el origen se declara aparte: girarlo
  daría una copia encima de sí mismo.
- **Las salidas las declara el mapa** (`duelo.salidas`), y con su **rumbo**. Lo
  segundo no es un detalle en un mapa de dos extremos: una cámara mira a −Z con
  yaw 0, así que sin rumbo el que sale en el sur aparece **mirando a la pared del
  fondo**. En el Plano A no se veía porque los dos salían del mismo sitio.
- **No sale en el selector de escenarios** (`soloDuelo`, de donde se deriva
  `TRAINER_SCENARIOS`). No tiene explosivo, ni recogibles, ni rutas: es el mapa
  de un modo, no una variante del entrenamiento. La lista se deriva del propio
  dato, como `PRIMARY_WEAPONS` de la ranura del arma — no hay una segunda lista.
- **Plano, sin rampas ni plataformas, a propósito.** Una plataforma simétrica se
  puede hacer; la altura es donde un 1v1 se desequilibra primero y eso pide
  medirlo jugando antes de construirlo.

Medido (`mapa66`): 17 piezas, **todas con su pareja girada**; las salidas a
**32 u** y sin línea de visión entre ellas ni entre las esquinas de sus cajas de
compra; el camino de una a otra son **45.6 u (7.0 s)**, idéntico en los dos
sentidos, y el **primer contacto posible cae a los 3.5 s**; asomándose por el
mismo extremo los dos ven exactamente lo mismo (20 y 32 puestos de 154).

**Y el escenario de una partida es uno, y lo eligen los dos extremos leyendo lo
mismo.** Hasta la 65 estaba escrito dos veces y funcionaba porque decían lo
mismo; desde la 65 lo dice `NET.escenario`, que es el de fábrica, y desde la
**72 hay dos mapas de duelo** y cuál juega una sala lo decide quien la crea. Lo
que no cambia es la regla: el cliente predice su propio movimiento contra la
geometría que tiene montada, así que dos escenarios distintos serían una
corrección por paso contra paredes que sólo existen en un lado. De ahí, tres
piezas:

- **El mapa viaja en la dirección del socket** (`?mapa=`), como el pase de
  reconexión y la fase de compra y por el mismo motivo: la sala se configura **al
  nacer**, antes de que llegue ningún mensaje, y al segundo en entrar se le
  ignora.
- **El saneado es uno y lo usan los dos** (`escenarioDeDuelo`, junto a
  `DUEL_SCENARIOS`, derivada de `soloDuelo` como `TRAINER_SCENARIOS` se deriva de
  lo contrario). Dos saneados es como una sala acaba jugándose en dos mapas, y el
  síntoma no sería un error: sería esa corrección por paso.
- **Y el enlace que se copia lleva el mapa.** No haría falta —el servidor lo dice
  en la bienvenida y la página se corrige—, pero corregirse es **recargar**: sin
  él, quien abre el enlace ve El Espejo un instante y luego un rebote.

**La física es del mapa, y `MOVEMENT` es lo que vale si el mapa no dice otra
cosa** (vuelta 72). Tres números —`gravity`, `jumpSpeed`, `airStrafeMaxSpeed`—
salen de `fisicaDeEscenario(key)`, los publica `scenario.fisica` y los lee
`movement.fisica`. Los Pilares pesa 13 contra 30; todos los demás mapas salen con
la de siempre **dígito a dígito**, que está medido y no supuesto (`pilares72`).

Dos cosas que **son** el diseño:

- **Sale del escenario y no de un ajuste ni de un modo, y eso es lo que la hace
  segura en red**: los dos extremos montan el mismo mapa —lo dice la sala— y
  derivan los mismos números **sin que viaje ninguno**. Un campo de física en el
  protocolo sería una física que se puede mentir; una física que sólo conociera
  un lado sería una corrección por paso, que es el agujero del arma de la vuelta
  56 por otra puerta.
- **Son tres números y no todos.** El modelo del aire (`airVector`), la
  aceleración aérea y las marchas de a pie siguen siendo del juego. Un mapa puede
  decir cuánto pesas, cuánto saltas y hasta dónde aceleras en el aire; **cómo** se
  acelera, no. Si eso se abriera, dos mapas serían dos juegos.

Y lo que un mapa construye con su física sale de ella, no del gusto: en Los
Pilares un salto sube 3.26 u, así que la `torre` mide **3.2** —se sube desde el
suelo por los pelos, contando el escalón— y la `atalaya` **6.0** —ahí sólo se
llega desde una torre—. Si algún día cambia esa gravedad, esas dos alturas se
recalculan con ella.

**Un mapa puede repartir en vez de vender, y «sin economía» no es «sin fase de
compra»** (vuelta 72). Son lo contrario: desde la 65, **a cero la tienda no
cierra**, se compra durante la ronda entera. Lo que declara un mapa con
`duelo.sinEconomia` y `duelo.dotacion` es que **no hay tienda**, ni dinero, ni
elección de arma. Cuatro reglas:

- **Se reparte por el inventario de siempre** (`Partida._dotar`), así que llega
  al cliente por `MSG.ECONOMIA` y el arma **se pone en la mano sola**, que es lo
  que ya hacía una compra desde la vuelta 67. Una segunda forma de entregar un
  arma serían dos maneras distintas de acabar empuñándola.
- **Y se reparte después de quitar.** `_perderEquipo` deja sin chaleco al que
  cayó, y aquí morir no puede costar el equipo: no hay forma de recuperarlo. El
  orden de esas dos líneas **es** la regla.
- **Un mapa que reparte no tiene fase de compra, ni pidiéndola.**
  `configurarCompra` la fija en cero aunque el selector diga otra cosa, y el
  selector se apaga diciendo por qué. Quince segundos encerrado en una caja con
  una tienda que no vende nada son quince segundos de nada, y un control que
  promete lo que el servidor va a ignorar es el fallo de la vuelta 67 otra vez.
  **El supresor sigue funcionando**, y el corte va deliberadamente después de él:
  no es una compra, es un interruptor del arma que ya llevas (vuelta 64).
- **Y que no hay economía lo dice la bienvenida** (`eco`), que hasta aquí valía
  1 con que hubiera rondas. Son dos preguntas distintas: se puede jugar a rondas
  y repartir. Deducirlo de que no llegue un mensaje es adivinar por silencio, que
  es lo que la 64 ya prohibió.

**Al duelo se entra por un botón, y ese botón es un enlace** (vuelta 66). El
menú principal tiene **Duelo 1v1** al lado de los otros modos y lo único que hace
es ir a `NET.rutaDuelo`. `App.jsx` **sigue sin saber que existe la red**: no monta
una fase de duelo ni habla con ningún socket, y el código de partida, el enlace,
el campo para unirse y el botón de reconectar siguen viviendo en la página del
1v1 (vuelta 45). Lo único que faltaba era la puerta.

Y `/duelo/` es **la misma ruta en los tres montajes**: la sirven los dos
huéspedes y, desde esta vuelta, también el servidor de desarrollo (un middleware
en `vite.config.js`). De ahí una consecuencia que costó un rato: la página del
duelo pide su script **por ruta absoluta** (`/net/prueba.js`). Con `./prueba.js`
el navegador lo buscaba en `/duelo/prueba.js` y la página cargaba entera y muda.

**Quién sirve la página decide dónde están las salas, y no su protocolo**
(vuelta 66). La pregunta era «¿es `https:`?», y eso es cierto del despliegue y
**falso de la misma aplicación servida por el huésped de Node en `http://`** —que
es lo que hace `npm run host`, y lo que pasa cuando alguien abre el juego desde
otro PC de su casa por la IP de red—. Ahí la página se iba a buscar el socket al
5199, donde no hay nadie, y se quedaba conectando para siempre **sin un solo
error**. La pregunta buena la contesta el empaquetado: `import.meta.env.DEV` es
cierto **sólo mientras sirve Vite**, que es el único caso en que la página y las
salas viven en procesos distintos. Se resuelve al construir, así que no hay nada
que adivinar. `?worker=1` se queda como palanca manual, que es lo que usan los
bancos.

**El rumbo de la cámara tiene dueño, y es `LookControls`** (vuelta 66). Aparecer
mirando a un sitio concreto es escribir el rumbo, y escribir `camera.rotation.y`
desde fuera **no vale**: su dueño lo reescribe en el siguiente movimiento de
ratón, así que el jugador salía mirando bien hasta que tocaba el ratón, o sea
nunca. Va por `controls.lookAt(yaw)`, y el cliente de red recibe los controles
como ya recibía la cámara y el movimiento. Es la regla de la pose interpolada de
la vuelta 44 por otra puerta: sobre un campo manda uno solo.

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

**Un mundo en memoria fija el número de máquinas: una** (vuelta 59). Las salas
viven en la memoria del proceso, así que dos máquinas sirviendo la aplicación son
**dos mundos** para el mismo código de partida: el reparto de carga manda a cada
jugador a una, las dos crean su sala, los dos se creen `p1` y no se ven. Pasó en
la primera prueba real y **no da ni un error**: la página carga y el código
coincide en las dos pantallas. Por eso se despliega con `fly deploy --ha=false`
—por defecto crea dos— y por eso `/salud` dice **qué máquina contesta**.

En Cloudflare esto no existía porque `idFromName(código)` **era** el encaminado a
la instancia. Al salir de ahí, esa pieza se quedó allí. Antes de escalar a más de
una máquina hay que encaminar por código hasta la misma; `fly scale count 2` sin
eso reparte a los amigos entre dos mundos.

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
usando lo ganado.

Los dos extremos de la ventana se miden en tiempo real: la pulsación sale de
`event.timeStamp` (no del frame que la atiende) y el aterrizaje, de despejar la
parábola —`t = (v0 + velocidadDeImpacto) / g`— en lugar del frame que lo detecta,
que llega hasta un frame tarde. Medido: el umbral sale en 130.00 ms a 60, 144 y
240 Hz, con una diferencia de 0.000 ms entre ellos.

**Lo que despega es una pulsación, no una tecla apretada** (vuelta 68). El
salto va por **flanco**: `_jumpPressedAt` es la marca que lo dispara y se
**gasta** —vuelve a `-Infinity`— al despegar, así que mantener SPACE da **un**
salto y para saltar otra vez hay que soltar y volver a pulsar. Hasta la 67 la
condición era `keys.jump`, o sea la tecla apoyada, y eso rebotaba en cada
aterrizaje: medido, 1 vuelo en 3 s con la tecla apoyada contra la ráfaga sin
control de antes, y lo mismo por el camino de la red. De ahí salen dos números
que **son** el mecanismo, y ninguno de los dos es de gusto:

- **`MOVEMENT.jumpBufferMs` (170).** Pulsar un pelo antes de tocar el suelo es lo
  normal, y con el flanco en el aire la pulsación se perdería. Vive lo que dura
  la mitad «antes» de la ventana de encadenado **más dos pasos**: entre el
  instante exacto del aterrizaje —que se despeja de la parábola— y el paso que
  puede actuar sobre él caben el que lo detecta y el siguiente, o sea 2 × 16.67
  ms. Por debajo de esa suma la ventana de encadenado se recorta, y se recorta
  más cuanto menos refresco haya. Medido después: el umbral sigue saliendo en
  130.00 ms a 60, 144 y 240 Hz.
- **`MOVEMENT.coyoteMs` (110).** Salirse de un cajón estrecho andando marcaba
  `airborne` en ese mismo paso y la pulsación que llegaba un frame después no
  encontraba suelo: se notaba como input con retraso y no lo era —el salto
  llegaba a tiempo y el suelo ya no estaba—. El número sale de una cuenta: en 110
  ms de caída libre se baja 0.181 u, por debajo de `COVER.stepHeight` (0.25), así
  que la gracia se acaba **antes de que el jugador haya bajado lo que sube de un
  escalón**. El techo de esa cuenta es `sqrt(2·stepHeight/gravity)` = 129 ms.

Y que el vuelo salió de un borde **no se marca: se deduce**. Es el único que
despega con velocidad vertical cero, porque cualquier salto de verdad arranca con
`jumpSpeed` por su factor de fatiga, que tiene suelo. Un campo menos es un campo
menos en `snapshot()`, o sea un sitio menos donde los dos extremos de una partida
en red puedan discrepar.

**Y la marca de la pulsación no se escribe cuando la entrada va separada**, que
es decir «cuando hay alguien reejecutando mis entradas». Ahí el reloj del mundo
es el número de paso y el `timeStamp` del teclado es del reloj local: dos números
sin nada que ver. Antes daba igual —lo único que decidía esa marca era si el
salto encadenaba, y `_aplicar` la pisaba con la buena antes de que nadie la
usara—; desde que **es** la marca que despega, una de reloj ajeno es un salto por
paso o ninguno, según cuál de los dos relojes vaya por delante. Por la red la
pone `pressJump`, que es su sitio. Medido en `red45`: cero correcciones y error
de reconciliación cero **saltando**.

**El deslizamiento es una recta, y lo que avanza cada paso no es velocidad por
delta** (vuelta 69). Correr y **pulsar** la tecla de agacharse tira al jugador al
suelo con un empujón de `slide.boostFactor` (1.45 × tu carrera = 9.43 u/s, justo
por debajo del techo del aire) que baja en línea recta hasta la marcha de
agachado en `durationMs`. Se sale soltando la tecla, agotado el tiempo, saltando
o dejando el suelo. Seis reglas, y ninguna es decoración:

- **Lo que se integra se rompe con el refresco.** La velocidad es una recta, así
  que sumar `v·dt` paso a paso es una integración de Euler que se pasa de largo
  en `(v0 − vfin)/2 · dt` — **más cuanto menos refresco**: medido, 4.309 u a 60
  Hz contra 4.245 a 240, un **1.49%**. Lo que se mueve cada paso es la
  diferencia de dos **distancias** cerradas, `d(t) − d(t − dt)` con
  `d(t) = v0·t − ½at²`, y el reloj se acota a la duración por los dos lados para
  que el paso que cruza el final recorra justo lo que quedaba. Medido después:
  **4.20875 u en los tres refrescos, dispersión 0.0000%**. Es la misma regla que
  la parábola del salto, y la misma razón.
- **Empieza en el flanco de la tecla, y el flanco sale de la máscara.** Mantener
  agachado da **un** deslizamiento (medido: 1 en 4 s), como mantener SPACE da un
  salto desde la 68. Y el flanco se deduce comparando la máscara de este paso
  con la del anterior (`_crouchWasDown`), así que **no hace falta un campo nuevo
  en el protocolo**: los dos extremos ejecutan los mismos pasos con las mismas
  máscaras.
- **La marcha que se exige es la de antes de agacharse.** En el paso del flanco
  la tecla ya está pulsada, así que `currentSpeed` diría 2.6 y no se podría
  entrar nunca. Y se compara contra **tu** carrera (`minSpeedFactor`), no contra
  un número suelto: el peso del arma se va en la división y un rifle se desliza
  igual que una pistola — medido con las tres.
- **No se gobierna.** La dirección se congela al entrar: girar el ratón 180°/s no
  mueve el deslizamiento de su recta (medido, 0 u de desvío). Es lo que lo
  distingue de correr agachado, y de paso es lo que lo deja resuelto en forma
  cerrada.
- **Saltar desde un deslizamiento no se lleva su marcha.** La marcha se congela
  al despegar, así que despegar a 9.43 sería volar a 9.43 y el air-strafe
  remataría hasta 9.5 — lo que hoy cuesta tres encadenados bien hechos. El vuelo
  se siembra con **tu carrera** (medido: 6.5 clavado en los tres refrescos), y lo
  mismo al tirarse por una cornisa. La marcha de salida va **como argumento de
  `_takeOff`**, no como campo: se gasta en el mismo paso, así que no hay nada que
  guardar ni que mandar. `slide.keepSpeedOnJump` está para probar lo contrario
  jugando.
- **Y los siete campos viajan.** `sliding`, el reloj, la dirección congelada, el
  empujón congelado, el enfriamiento y la máscara de agachado están en
  `snapshot()` (25 → 32). Medido en `red45` con un deslizamiento cada 2.3 s:
  **cero correcciones y error de reconciliación cero**.

**`MOVEMENT.slide.enabled` es la ventana hacia atrás, y no es un ajuste del
jugador**: no sale en el panel, igual que `airVector`. A `false`, `_updateSlide`
es un `return` en la primera línea y no hay ningún otro sitio del juego que
pregunte por el deslizamiento — medido: el mismo paseo por el Plano A acaba en la
**misma coordenada hasta el último decimal**.

**Y levantarse debajo de una caja no se comprueba, porque hoy no puede pasar.**
La colisión sí sabe pasar por debajo de algo (`box.bottom >= headY` en
`resolveAxis`), pero **ninguna pieza de ningún escenario tiene la base
levantada**: todas nacen en el suelo, así que agacharse no abre ni un paso. El
día que un mapa declare una plataforma de verdad —una por la que se pueda andar
por debajo— hay que escribir esa comprobación, y `slide69` [9] se pondrá rojo
para recordarlo.

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
segunda tabla de alturas. El corte se resuelve analíticamente, sin malla: el
jugador es una cámara, y montarle un cuerpo invisible sólo para que le disparen
serían dos cuerpos que se desincronizan.

**Y el volumen que recibe disparos es la silueta que se dibuja, no el cilindro
de la colisión** (vuelta 65). Hasta entonces `hitPlayer` cortaba contra
`COVER.playerRadius` —0.4, el radio con el que el jugador choca contra una
caja— a **todas** las alturas, y el cuerpo que se ve mide 0.293 en su punto más
ancho y **0.137 en la cabeza**. O sea: un anillo de aire de 26 cm alrededor del
cráneo contando como impacto **en la zona que vale 100 y mata de un tiro**. Se
notó jugando —apuntando visiblemente por encima de la cabeza del rival— y
medido contra las mallas de verdad era **la mitad de todo lo que el hitbox
aceptaba**: 710.268 de 1.420.008 rayos daban impacto sin tocar la silueta, y
150.546 de ellos a la cabeza (`hitbox65`). Cuatro cosas que **son** el arreglo:

- **Se corta contra el mismo perfil que dibuja `body.js`.** La figura es un
  sólido de revolución, así que su silueta **es** el perfil desde cualquier
  ángulo: cortar contra el sólido es cortar contra lo que se ve. El perfil es
  una poligonal, o sea veintiún troncos de cono y una cuadrática por tramo, y
  sólo para el disparo que pasa el descarte del cilindro envolvente — que de
  paso da la franja de alturas que el rayo puede tocar, y con ella la mayoría de
  los tramos ni se miran. Medido: **0.509 µs por disparo que entra**, 0.033 µs
  el que pasa de largo, y es por bala, no por frame.
- **El margen va en un solo sentido, a propósito.** La malla tiene diez caras y
  de canto es más estrecha que su radio, así que el perfil se mete hacia dentro
  por su apotema (`HIT_INSET`). Lo que se paga está medido —1.4 cm en la
  cintura, 7 mm en la cabeza, el 2.25% de la silueta— y lo que se compra es la
  garantía entera: **lo que no se ve no se puede acertar**, desde cualquier
  ángulo.
- **La altura la pone la postura; el ancho, no.** `setEyeHeight` achata el
  avatar **sólo en Y** y lo deja igual de ancho, así que escalar el ancho con la
  altura dejaba al agachado un 38% más estrecho de lo que se ve (medido: 12.533
  rayos de silueta sin hitbox detrás). El ancho sale de `body.radius`, que es lo
  único que un cuerpo **rebobinado** —que llega interpolado, sin altura de
  ojos— trae del ancho que tenía.
- **Y la altura total es la que se dibuja.** `bodyHeightFor` (en `body.js`) es
  la única regla, y la usan el avatar y el hitbox. Antes el hitbox escalaba por
  su cuenta poniendo los ojos en **el centro de la cabeza** —la convención de un
  muñeco, `head.offsetY`— y salía un cuerpo de 1.827 contra los 1.800 que se
  dibujan: 2.7 cm de hitbox por encima de la coronilla.

Consecuencia que **no** es un fallo y hay que tener presente al calibrar: los
muñecos aciertan **la mitad**, porque el jugador ha dejado de ser una columna de
0.4 y es un cuerpo. Medido en `enemigos.mjs`, a la misma distancia y sin nada en
medio: 14 de 54 disparos, contra los 29 de 54 de antes. Los tres niveles de
`ENEMY_DIFFICULTIES` siguen siendo puntos de partida a calibrar jugando.

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

**El yaw de una cámara y el `facing` de un marcador son convenciones opuestas**
(vuelta 60). `facing` mira a **+Z** con yaw 0 —así lo produce un muñeco, de
`atan2(dx, dz)`— y una cámara de three.js mira a **−Z**, como dice el propio
movimiento en su cuenta de la dirección (`forward = (−sin, −cos)`). El mismo
número significa lo contrario en cada sitio, así que pasar el yaw del rival tal
cual pintaba la brújula **apuntando a su espalda**. La conversión tiene nombre y
vive donde se define la convención: `facingDesdeCamara`, en `markers.js`. Con los
muñecos no se veía nunca, porque su `facing` no sale de una cámara.

Y **un error de 180° sólo se ve comparando las dos pantallas a la vez**: en una
sola, una brújula al revés se lee como un rival que te da la espalda.

**La brújula no se billboardea; los iconos sí.** No es una inconsistencia: es que
dicen cosas distintas. La brújula dice **hacia dónde mira el muñeco**, así que va
paralela al suelo y gira sólo en yaw —girada hacia la cámara apuntaría siempre al
jugador y no diría nada—. Los iconos `?` y `!` sólo tienen que leerse, y para eso
mirar a la cámara es lo correcto.

**La legibilidad de la brújula no está en su forma, está en el contraste de su
cola** (vuelta 73). Sus dos señales de orientación son **comparativas** —el tono
(vuelta 39) y la pendiente (vuelta 40)— y las dos piden haber visto la otra
vista para saber cuál estás viendo. Eso vale para información pasiva a doce
unidades; con un cuchillo en la mano la pregunta es binaria y hay una décima.

Se probó una **punta de flecha** —barbos y muesca, para que la silueta cambiase
entre frente y espalda— y **no entró**: medida contra la cuña de siempre daba
+16% de área, **no mejoraba** lo que venía a mejorar (la silueta cambia un
15-24% con las dos) y **costaba tono donde más importa** —a 8 u el Δ de
luminancia caía de 20.2 a 10.5, porque una cola en V enseña menos cara oscura y
más costado claro—. Está escrito en `MARKERS.compass` para que no se vuelva a
intentar.

**Lo que sí entró: la cola se enciende dentro del arco de espalda**
(`backShade`). Fuera del arco todo queda como estaba desde la vuelta 40; dentro,
la tapa pasa de 45% a verde entero. Es lo único de este marcador que no dice
*hacia dónde mira* sino *qué puedes hacerle*, y por eso es lo único binario que
tiene: el arco es el mismo que decide la puñalada instantánea y sale de la misma
función (`esPorLaEspalda`), así que la brújula no puede prometer una espalda que
el servidor no dé por buena. Medido: 24 de 64 píxeles cambian y suben 39 de
luminancia, dentro de la banda 34-62 que la 40 dio por legible.

**Y añade luz, no la quita.** La primera versión hacía lo contrario —caras
translúcidas fuera del arco— y era un error de dirección que el banco cazó de
inmediato: se pedía que se leyera **mejor**, y aquello lo dejaba más apagado el
90% del tiempo para encenderlo el 10%.

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

**Una bala que no da tiene que decir por dónde se fue** (vuelta 64). La marca de
impacto (`src/game/impacts.js`) es el único aviso que dice **dónde acabó** un
disparo fallado: la mira dice *que* has fallado, y sin esto tirar contra una
pared y tirar al aire se ven exactamente igual. Cinco cosas que son el diseño:

- **Vive en el motor, así que sale en los dos modos.** Es la convención de la
  63 aplicada de verdad: se escribió una vez y la llaman el disparo de
  entrenamiento y el del duelo. **No existía en ninguno de los dos** —contra los
  muñecos, un tiro que se comía la Espina era un fallo y no se dibujaba nada—,
  así que construirla en la página del duelo habría sido dejar el modo principal
  sin ella para siempre.
- **Un rayo por disparo, y de él salen las dos respuestas.** Antes había un
  `_isBlockedByCover` que preguntaba «¿me tapan?»; ahora
  `_superficieBajoElRayo()` devuelve **punto, normal y distancia** de lo primero
  que hay delante, y de ahí se decide a la vez si la cobertura come el tiro y
  dónde va la marca. Dos rayos para dos preguntas sobre la misma recta es cómo
  se acaban contestando distinto.
- **La sala no se raycastea: se resuelve en aritmética.** Sus paredes y su suelo
  están dibujados con **líneas** (`grid.js`), no con mallas, así que no hay
  contra qué lanzar un rayo. Con el origen dentro de la caja, por dónde sale el
  rayo es el menor de los tres cortes contra la pareja de planos de cada eje —y
  da la normal exacta, no la de un triángulo.
- **En red la pone el veredicto local, no el del servidor.** El del servidor
  llega un viaje después y contesta a otra pregunta (si le diste); el local sabe
  **el rayo que salió** y si acabó en el rival, y las dos cosas hacen falta: a un
  rival alcanzado no se le dibuja una marca en la pared de detrás. Va por
  `cliente.onTiroLocal`, que es el único punto donde el cliente tiene las dos.
- **Y es la estrella del fogonazo, encarada a la superficie.** No hay
  calcomanías —ni texturas, ni proyección, ni recorte contra la geometría— y no
  hay ni una luz en la escena, así que una marca oscura sobre una caja gris no se
  vería. Los dos extremos de la misma bala se dibujan con la misma silueta a
  propósito, y `flashStarGeometry` es una sola: el fogonazo la exporta.

El pool es **un `InstancedMesh`**: una geometría, un material y una malla para
las veinticuatro marcas. Apagarse es que el color de esa instancia baje a negro,
que con mezcla aditiva **es** invisible — así el desvanecido no necesita un
material por ranura. Y se apagan con el **reloj del mundo**: en pausa una marca
se queda quieta en vez de irse a tus espaldas. Medido (`impactos64`): 92 px bajo
la mira a tres unidades, cero píxeles pasados los 420 ms, la marca sobre la cara
de la caja a la que se apuntó (z −19.012 contra −19) y sobre el suelo a y 0.012,
y **ni una marca detrás de un muñeco** ni de un rival alcanzados.

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
atraviesan la Espina, y 14 de 54 aciertan a la misma distancia sin nada en medio
(29 de 54 hasta la vuelta 65, cuando el jugador era una columna de 0.4).

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

**Y desde la vuelta 65 el corte de las bandas vive aquí** (`ZONE_BANDS`), no en
quien dibuja: lo usan el avatar —para cortar las tres mallas— y el hitbox del
jugador —para decidir en qué zona entra un disparo—. Con `bodyHeightFor` y
`hitRadiusAt` al lado, este módulo pasa a ser **la única definición del cuerpo
humano del juego**: lo alto que es, lo ancho que es a cada altura y dónde están
sus tres zonas. Dos copias de cualquiera de esas tres cosas son la silueta y el
volumen de impacto separándose, que es exactamente lo que había pasado.

**En el boceto la cabeza está separada del cuerpo; en el modelo, no.** Un hueco
entre la banda de la cabeza y la del torso serían disparos que no dan en ninguna
zona. Lo que se hace es **estrangular el cuello** —radio 0.030 en el nivel
0.845—, que a distancia se lee igual y no deja agujeros.

**Agacharse achata el cuerpo, y sólo eso.** Una escritura de `scale.y` con la
altura de ojos que el movimiento ya ha resuelto: sin esqueleto, sin animación y
sin tocar el ancho. Es el mismo dato del que salen las zonas de disparo al
agacharse, así que no hay dos ideas de «estar agachado».

**El bloque de arma va abajo a la derecha, y es el mismo en los dos modos**
(vuelta 67). Estaba centrado bajo la mira —justo debajo de lo único que hay que
mirar— con la silueta a 136 px, en la que las tres armas se distinguían por el
largo y poco más; y **en el duelo no había silueta ninguna**. Tres cosas:

- **La esquina inferior derecha era la que estaba vacía**: arriba los
  contadores, arriba a la derecha los FPS, abajo a la izquierda la vida. Y es
  donde la busca cualquiera que haya jugado a otra cosa.
- **Elegir qué trazado toca salió de React** a `src/ui/weaponSilhouette.js`. El
  trazado ya era uno solo (`weaponPaths.js`); lo que no se podía compartir era la
  decisión, así que la página del duelo no tenía forma de pedir la silueta y se
  quedó sin ella desde que existe. Es la convención de la 63 por la puerta de al
  lado: lo que ya funciona en un modo no se reescribe, se saca a donde lo puedan
  llamar los dos.
- **Y debajo va una ficha corta**: nombre, cómo dispara (`AUTO`/`SEMI`) y si
  lleva supresor. Con tres armas y un supresor que se conmuta con el clic
  derecho, «cuál llevo y cómo va» era una pregunta sin respuesta en pantalla — la
  silueta contesta la primera mitad y no la segunda. Es lo único que se añadió:
  el hueco se llena con el tamaño, no con más cosas.

Medido (`hud67`): silueta 208×90 en los dos modos, anclada en la misma esquina
—a 2 px— y la mira con el mismo trazo.

**La mira no se anima nunca, y es la misma en los dos modos** (vuelta 67). Eran
dos: el entrenamiento con trazos de dos píxeles y sin punto central, el duelo con
uno y con punto — dos miras distintas en el mismo juego, que es la definición de
fallo de producto de la vuelta 63. Los tres números viven en `CROSSHAIR` y los
publican **las dos páginas** como variables CSS, igual que el color: el día que
haya una pantalla para diseñarse la propia, lo que se toca es eso y nada más.

Y no se anima:

- **Fuera el destello del disparo.** La mira es la referencia contra la que se
  apunta, y una referencia que brilla es peor referencia; con fuego automático
  parpadeaba diez veces por segundo.
- **Y la marca de impacto es otro elemento, no la mira moviéndose.** En el duelo
  eran los mismos cuatro trazos girando 45°, así que acertar **animaba la mira**
  justo en el momento en que más falta hace quieta. La forma es la de siempre —X
  blanca, y la baja más larga y con anillo—, porque lo que distingue las dos
  cosas es la forma y no el color.
- **Lo que sí se queda es el anillo de daño**, que no es la mira: es el aviso de
  que te han dado a ti, dibujado alrededor de ella, y es uno de los tres canales
  de la vuelta 40. Quitarlo sería quitar información, no animación.

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

**No hay música, y no es que esté a cero: no existe** (vuelta 60). Hubo un
ambiente de menús generado en tiempo real, con su volumen propio, y se retiró
entero —módulo, ajuste, fila de opciones y llamadas—. Lo que dejó son las dos
trampas del contexto de audio, que ahora viven donde todavía hacen falta, en
`samples.js`: **el contexto no arranca sin gesto** y `resume()` es asíncrono, así
que se espera al cambio de estado y no al gesto; y **`disposeAudio()` cierra el
contexto**, así que se guarda *sobre qué contexto* se estaba esperando y no un
booleano — React en modo estricto monta, desmonta y vuelve a montar.

- **El contexto de audio no arranca sin gesto**, y `resume()` es asíncrono:
  preguntar por `ctx.state` justo después devuelve todavía `suspended`. Se espera
  al **cambio de estado**, no sólo al gesto, o la música no suena hasta el
  segundo click.
- **`disposeAudio()` cierra el contexto y el siguiente `initAudio()` crea otro.**
  Una espera armada sobre el viejo no se entera de nada nunca más. Por eso se
  guarda *sobre qué contexto* se está esperando y no un booleano. Pasa de verdad:
  React en modo estricto monta, desmonta y vuelve a montar.

**Un estilo en línea gana a cualquier selector, y por eso no se escribe una
propiedad que también manda una clase** (vuelta 60). La cuña de daño del duelo
ponía la fuerza del impacto en `style.opacity` y el apagado en una clase: el
temporizador quitaba la clase perfectamente y no servía de nada, así que la
mancha roja **se quedaba desde el primer impacto de la partida**. Se veía al
morir sólo porque ahí ya no llegan más disparos. La fuerza va ahora en una
variable CSS que tiñe el gradiente; la opacidad la manda la clase, y nadie más.

**El escenario de una partida no es una preferencia del jugador** (vuelta 60). El
duelo lo fija al construir el motor (`new Engine(lienzo, callbacks, { escenario })`)
y **no toca el store**. Hacerlo con `updateSettings` —como hasta la 58— le
reescribía al jugador su escenario guardado en cada visita a un enlace de duelo, y
dejaba el mapa colgando de los ajustes: tocar cualquier otro en mitad de la
partida reconstruía el escenario en caliente.

**Y si no se puede guardar, se dice.** El `try/catch` de `localStorage` es
correcto —sin persistencia se juega igual— pero tragárselo en silencio es
indistinguible de un juego que pierde los ajustes por su cuenta. Ojo también con
que **`localStorage` es por origen**: mudar el despliegue de dominio deja atrás
todo lo guardado, una vez.

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
- **Y ponérselo es un solo camino** (`_alternarSupresor`), que llaman la tecla y
  el clic derecho (vuelta 72). Había dos —el clic le preguntaba al servidor y la
  tecla escribía el ajuste— y en una partida con economía el ajuste **no es lo
  que llevas**, así que el supresor salía con el ratón y no con su tecla desde la
  vuelta 64. No lo cazó nadie porque los bancos de audio lo conmutan con la tecla
  y los de la tienda con el ratón. Es la convención de la 63 en una acción de
  dos teclas.
- **Y quién manda sobre él lo dice el dato, no el modo**: vale el ajuste guardado
  mientras no haya llegado inventario del servidor (`_invRed`), y el del servidor
  en cuanto llega. `enRed` no servía —un huésped sin rondas no manda inventario,
  y ahí el supresor no se podía poner de ninguna manera—, y un segundo
  interruptor de «aquí hay economía» sería una cosa más que mantener en
  sincronía.
- **Y no es un artículo de la tienda** (vuelta 73). Lo era, a 250, y eso
  contradecía en la misma pantalla la regla de la 64: no cuesta nada, es del
  arma que ya llevas y se conmuta en cualquier fase. Lo que hacía falta no era
  un precio sino **decir con qué se pone**, y eso va en la ficha del arma —
  «Clic derecho del ratón = Silenciador», en las tres que lo admiten—. El
  servidor lo atiende **antes de mirar el catálogo**, que es donde va un
  interruptor y no una compra.

**El retroceso es una fuerza continua, no una animación con final** (vuelta 61).
El patrón de `WEAPONS[x].recoil` describe **la subida**, que es de una vez; al
agotarse se vuelve a `recoilLoopFrom` y **la cola se repite** mientras el gatillo
siga apretado. Sin ese número la cola es el último paso: que el retroceso no pare
es la regla, dónde repite es tuning.

Hasta la vuelta 60 se paraba al acabarse el patrón, y eso no se leía como «ha
llegado a su techo» sino como **que el arma se controla sola**: la Rift tiene 15
pasos y un cargador de 30, así que **quince disparos seguidos salían sin
retroceso ninguno** y clavados en el mismo punto. Medido tras el arreglo: 0 de 29
disparos sin empuje, y la mira acaba a 10.43° de donde empezó.

Y dos cosas que **no** se tocan al calibrar esto:

- **La mira no vuelve nunca sola**, ni con el gatillo suelto ni apretado
  (`applyRecoil`, en `lookControls.js`). Compensar es del jugador.
- **El control no es un estado que se resuelva una vez.** El retroceso suma a la
  rotación igual que lo hace el ratón, así que no hay ningún «controlado» que se
  fije: compensar bien en la bala 14 no compra la 19. Si alguna vez aparece un
  flag de «el jugador va compensando», es este fallo por otra puerta.

**El daño es de la zona **y** del arma, y lo dice una sola función** (vuelta
70). Hasta la Scout las tres armas pegaban igual y estaba escrito aquí que un
número de daño por arma sería inventarse un dato; con un fusil de francotirador
que mata de un tiro al cuerpo, el dato existe. El modelo de zonas sigue diciendo
la **forma** —cabeza 100, torso 50, piernas 34— y `WEAPONS[x].damageScale` dice
cuánto vale una bala de ésa. Cuatro reglas:

- **`zoneDamage(zona, arma)` es el único sitio donde se multiplica**, y la
  llaman los cuatro que reparten daño: el disparo del duelo (`net/disparo.js`),
  el fuego enemigo, los muñecos del entrenamiento (`targets.applyHit`) **y la
  ficha de la armería**. Un segundo cálculo en el panel es una tienda que
  promete un número y unas balas que quitan otro.
- **La cabeza no se escala nunca**, igual que `ENEMY.bodyDamageScale` tampoco la
  toca: vale 100 de 100 y de ahí cuelga la regla del casco —el primero lo rompe
  y el siguiente mata—. Escalarla dejaría el casco en papel con unas armas y en
  muro con otras.
- **Sin el campo vale 1.** Las tres de siempre no declaran nada, así que no se
  mueve ni un punto de lo calibrado: medido, Rift 50/100 antes y después.
- **Y un muñeco es un blanco con las mismas zonas que un jugador**, así que se
  cae de un tiro igual. Si una bala mata a una persona y le hace cosquillas a un
  muñeco, hay dos escaleras de daño.

Medido con la Scout (×2.2 → 110 al torso): **una bala al cuerpo sin chaleco, dos
con él, una a la cabeza** —dos si hay casco, porque el primero lo rompe—, tres a
las piernas con chaleco. Con la Rift siguen haciendo falta tres.

**La mirilla ampliada vive en el motor, y el clic derecho es «la segunda función
del arma»** (vuelta 70). Es la primera del juego y hoy sólo la tiene la Scout,
que la declara con su bloque `scope`. Cinco cosas:

- **No son dos gestos peleándose por un botón.** El clic derecho pone el
  supresor en las armas que lo admiten y la mirilla en las que la tienen, y
  ningún arma tiene las dos: la Scout no admite supresor. Lo decide el dato del
  arma, no un modo.
- **La lente la dibuja `src/game/scope.js`, que es del motor**, así que sale en
  los dos modos por la convención de la 63 — y trae **su propia hoja de
  estilos**, inyectada una vez, porque las dos páginas tienen CSS distinto y un
  bloque copiado en cada una es la misma mirilla escrita dos veces. Lo único que
  no hace es esconder la mira de la página: cada una tiene la suya y el motor
  avisa por `onScope`, que es una **pulsación** y no un valor por frame.
- **La transición va en el paso de mundo**, no en el frame: 140 ms en cualquier
  monitor (medido: 150 / 145.8 / 141.7 ms a 60 / 144 / 240 Hz, que es el dato
  más lo que sobra de un paso). Y de ese mismo número cuelgan las **tres** cosas
  —lente, encuadre y sensibilidad—, así que no pueden quedarse a medio camino la
  una de la otra. 140 ms es lo que hace falta para que un *quickscope* siga
  siendo un gesto.
- **El FOV lo escribe sólo `_updateScope`.** Dos sitios escribiendo el encuadre
  es una cámara que se queda a medias el día que uno no se entere de un cambio
  de arma.
- **Y la sensibilidad sale de un solo camino** (`_aplicarSensibilidad`).
  `_applySettings` escribía directamente en los controles, y eso, con la mirilla
  puesta, devolvía la de a pelo **en cuanto alguien tocara cualquier opción**.
  `scopeSensitivity` es un ajuste propio y no un múltiplo de la otra ni algo
  derivado de los aumentos: apuntar por un visor es un gesto distinto, y
  derivarlo le quitaría la decisión al jugador. De fábrica valen lo mismo.

Se baja sola al cambiar de arma, al pausar, al morir y al soltar el ratón. En
pausa se baja **de golpe** y no interpolando, porque el reloj del mundo está
parado y la transición cuelga de él.

**Hay tres ranuras, y la tercera lleva cuchillo** (vuelta 71). `slot: 'melee'`
se deriva del catálogo igual que la pistola (`MELEE_WEAPON`), la tecla es la
**3** —reservada desde la vuelta 27 y sin lógica hasta ahora— y el cuchillo se
lleva siempre: no se elige, como la pistola. Lo que convierte un arma en cuerpo
a cuerpo es **tener bloque `melee`**, no llamarse de una manera ni ocupar una
ranura: el motor mira el dato.

**Dos golpes y ninguna tabla de combos.** Clic izquierdo flojo (25), clic derecho
fuerte (55), los dos contra la misma vida de 100. Que «dos fuertes matan» y
«cuatro flojos matan» no son dos reglas: son dos números, y un flojo más un
fuerte suman solos. Medido: 2 fuertes, 4 flojos, 3 mezclando; con chaleco 3 y 6.

**Y por la espalda no es más daño: es muerte.** Vive en `encajarImpacto` como un
caso propio (`mortal`) y **por delante del casco y del escudo**, porque un número
grande lo pararía un chaleco y entonces «siempre» sería «casi siempre». Medido: a
vida llena con chaleco y casco, un golpe. Sólo el **fuerte**: un flojo por la
espalda no mata de una.

**El arco se mide con un vector, no con un ángulo** (`esPorLaEspalda`). El yaw de
una cámara mira a −Z y el `facing` de un muñeco a +Z, y esta función la llaman
los dos: pasar «el rumbo» sin más es el error de 180° de la vuelta 60 otra vez,
y aquí se leería como que te matan de frente. Cada llamante convierte en su
línea, donde está su convención.

**El cuchillo no es un protocolo nuevo.** Un golpe viaja **dentro del disparo**,
con un campo más (`d.m`: 1 flojo, 2 fuerte): mismo sellado en el paso, mismo
`seq`, mismo veredicto, mismo rebobinado. Lo único que cambia es que se resuelve
con `resolverCuchillada` en vez de `resolverDisparo` —alcance del arma, daño del
golpe y si vino por detrás—, y que **la cadencia se exige por tipo de golpe**:
alternar flojo y fuerte no cuela el fuerte al ritmo del flojo, porque la cuenta
sale del mismo campo que el daño.

**Y el rumbo de la víctima se rebobina** con su cuerpo. Es el único campo del
historial que no dice dónde estaba sino cómo estaba puesta, y hace falta para
una sola cosa: girarse a tiempo no puede salvar de un golpe que ya ocurrió. Se
interpola **por el camino corto** (`mezclaDeRumbo`): entre 179° y −179° hay dos
grados, y la media recta da 0, o sea mirando justo al revés.

**Un arma que no se ve necesita que la pantalla la cuente** (vuelta 71). Vektor
no dibuja el arma en la mano (vuelta 38) y eso no se toca, así que un cuchillo se
queda sin lo que en otros juegos lo cuenta todo. Cuatro canales, y cada uno dice
una cosa distinta:

- **Antes de golpear**: la mira se abre y se tiñe de verde de acción cuando hay
  alguien **a distancia de cuchillo**. Es lo único que se puede decir *antes*, y
  sale del mismo rayo que resuelve el golpe, **una vez por paso de mundo y sólo
  con el cuchillo en la mano**. Llega a la página por `onMeleeRange`, que es una
  pulsación y no un valor por frame.
- **Al golpear**: la cámara se mueve, por el mismo camino que el retroceso
  (`applyRecoil`). El fuerte empuja más que el flojo — medido.
- **Qué golpe ha sido**: el arco de `src/game/slash.js`, fino a la izquierda el
  flojo y grueso a la derecha el fuerte; **por la espalda, los dos a la vez**. Lo
  que distingue las tres cosas es **la forma**, que es la regla de la vuelta 67 —
  el color sólo separa el fuerte, y en el verde de acción, el único de la paleta
  que ya significa dos cosas porque no coinciden en pantalla.
- **Si ha entrado**: el sonido. `playMelee` tiene una voz propia —ruido que
  **sube** de tono, al revés que el silbido de una bala— y el cuerpo grave sólo
  suena **si conecta**. Por la espalda añade un metal inarmónico que no lleva
  ningún otro golpe.

En red esos cuatro los decide **el veredicto local**, no el del servidor: es la
regla de la marca de bala de la vuelta 64 —el del servidor llega un viaje después
y contesta a otra pregunta—.

**Y un cuchillazo no cuenta como disparo.** Ni `shots` ni `hits`: la precisión de
la sesión es la de la puntería, y meter ahí los cuchillazos la convertiría en
otra cosa. En el HUD, un arma sin cargador pone **∞** y no «0 / 0», que es lo que
pone un arma rota.

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

**Lo que hace un arma puede venir de un fichero; todo lo demás, no — y hoy no
viene de ninguno** (la puerta, de la 39 y la 63; la decisión de tenerla cerrada,
de la 63). `samples.js` es el único camino de audio de un disparo —del jugador y
de los muñecos—, de una recarga y del gatillo en seco, y decide él si suena la
muestra grabada o lo que había antes: quien dispara no elige ni tiene que
saberlo. Con `AUDIO.samplesEnabled` en `false` no pide ni decodifica nada y suena
la síntesis, que es lo que se juega hoy. Cinco reglas que sostienen el respaldo,
y son las que hacen que apagarlo sea una línea y no una vuelta atrás:

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
  contexto* se decodificó. React en modo
  estricto monta, desmonta y vuelve a montar.
- **Y el suelo de la recarga es el silencio, no un ruido de emergencia**
  (vuelta 63). Recargar no ha sonado nunca, así que sin muestra se queda como
  estaba: por eso hay **dos voces y no una** —`playWeaponShot`, que cae a la
  síntesis, y `_tocar`, que no cae a ninguna parte—. Un chasquido inventado
  diría «tu arma ha hecho algo» sin decir qué, y con recargas de 1200, 1800 y
  2300 ms mentiría en dos de las tres. El mismo módulo lleva el **gatillo en
  seco**, que sí tiene síntesis debajo, y vive en `Reference/Audio/comunes/`
  porque no es de ningún arma: en `weapons/` habría necesitado una clave de arma
  que no existe, y la validación contra `WEAPONS` —lo que caza un nombre mal
  escrito— una excepción.
- **Y hay dos formas de volver atrás porque son dos preguntas.** Una muestra que
  no encaja se saca de `Reference/` y se repasa `npm run audio:weapons` (el
  manifiesto **es** la lista de lo que hay); si no encaja ninguna,
  `AUDIO.samplesEnabled: false` y no se pide ni se decodifica nada. Las dos
  funcionan porque la síntesis **nunca se sustituyó**: borrar `sfx.js` «para
  quitar lo que ya no hace falta» cierra las dos puertas a la vez.

**Un arma puede tener voz propia, y la elige su clave** (vuelta 62). `playShot`
no sabe de armas: mira `SHOT_PROFILES[<arma>]` —o `<arma>.s` con silenciador, la
misma idea que `ghost-<arma>` en las siluetas— y lo que no tenga entrada cae a
`normal` / `suppressed`, la voz clásica. Añadir una voz es añadir una clave, no
tocar `playShot`.

**Desde la vuelta 63 la voz seca la llevan las tres**, que era lo que faltaba: el
carácter agresivo y metálico es del juego, no de un arma. La clásica se queda
como **respaldo** —lo que sonará un arma nueva hasta que se le calibre la suya— y
ya no la lleva ninguna. Lo que cambia de un arma a otra dentro de la voz seca
sale de su ficha y no del gusto: la **Volt** dispara a 800 RPM, o sea cada 75 ms,
así que ninguna de sus capas pasa de 50 ms —a esa cadencia una cola más larga se
pisa a sí misma y la ráfaga se oye como un zumbido—; la **Pulse** es un arma
corta, así que sube el crack a 3200 Hz y pierde la mitad del grave; la **Rift** es
la que conserva cuerpo. Medido con el mismo banco y un disparo por captura
(`audio63`), antes y después:

| | pico antes | pico ahora | | cola antes | cola ahora | centroide antes → ahora |
|---|---|---|---|---|---|---|
| Pulse | 0.0859 | **0.3772** | +12.8 dB | 31 ms | 23 ms | 1179 → 2125 Hz |
| Pulse sil. | 0.0371 | **0.0837** | +7.1 dB | 44 ms | 22 ms | 820 → 2314 Hz |
| Volt | 0.0976 | **0.3524** | +11.1 dB | 30 ms | 19 ms | 1363 → 1791 Hz |
| Volt sil. | 0.0399 | **0.0873** | +6.8 dB | 37 ms | 20 ms | 844 → 2357 Hz |
| Rift (control) | 0.4472 | 0.4526 | — | 31 ms | 29 ms | 2004 → 1975 Hz |

La fila de la Rift es el **control**: no se tocó, y sale igual en las dos tandas
—1.2%, que es el ruido del banco—, así que las otras cuatro filas son el cambio y
no la máquina.

La voz seca nació en la Rift (vuelta 62), y lo que se arregló no era el volumen:

- **El ataque era una rampa** (2 y 3 ms) y el cuerpo duraba 55 ms cayendo de
  tono. Eso es la receta de una gota de agua. La voz `seca` ataca en **0.6 ms**
  —escalón, no rampa; medio milisegundo es lo que hace falta para que no suene a
  «pop» de altavoz— y ninguna capa pasa de 70 ms.
- **Metálico es inarmónico, no agudo.** Los dos parciales de la capa de metal van
  en relación **1.48**, que no es ni octava ni quinta: con una relación armónica
  sale un tono musical, que es justo lo que no es un disparo. Pasan por un
  saturador `tanh` —suave y sin esquinas, así que añade armónicos sin el zumbido
  de un recorte duro— y un pasa-banda.
- **El crack es un pasa-altos, no un pasa-banda.** Un pasa-banda deja una nota;
  lo que suena a «crack» es la banda ancha de arriba.
- **La curva del saturador se cachea.** Son 2048 puntos y el automático dispara
  diez veces por segundo: una tabla por disparo es basura para el recolector
  justo donde menos cabe.
- **La silenciada no es la normal más baja.** Se le quitan el grave y el crack de
  banda ancha —las dos capas que delatan un disparo a distancia— y se le añade
  una que la normal no tiene: el **cerrojo**, retrasado 12 ms. Ese hueco es lo
  que se oye como una máquina en vez de como un golpe.

Medido desde el juego, disparando con el botón y leyendo el máster muestra a
muestra: **+11.0 dB** la normal y **+9.3 dB** la silenciada, con la cola a −40 dB
en 30 y 27 ms y el centroide del ataque en 1894 Hz contra los 1291 de la voz de
antes. El A/B sale gratis y es honesto: **la Pulse conserva el perfil clásico**,
que es exactamente el que tenía la Rift, así que las dos filas de la misma tanda
son el cambio.

**Y una captura de audio también necesita su denominador** (vuelta 62). La
primera sonda leía el máster con un `ScriptProcessor` de 256 muestras —188
llamadas por segundo— y este contenedor **pierde bloques**: el pico de la Rift
salió 0.3322 y 0.1390 en dos tandas seguidas sin haber tocado ese perfil, que es
un bloque de ataque perdido y no un cambio de sonido. Se arregla por los dos
lados a la vez: bloque de 4096, **cinco disparos y la mediana**, y la cuenta de
capturas completas impresa al lado de cada fila. Es la regla de la vuelta 46 en
el audio: un número solo no dice de cuántos sale.

**Y un disparo tiene que ser uno, y también se cuenta** (vuelta 63). La captura
de la 62 apretaba el botón 60 ms, y eso con la **Volt** —800 RPM, un disparo cada
75 ms— son **dos**: la «cola a −40 dB» pasaba a medir la distancia entre ellos y
salía 77 ms para un perfil cuyas capas no llegan a 42. La fila no salía mal,
medía otra cosa. Ahora el banco lee el cargador antes y después de cada captura,
sólo usa las de una bala y **imprime cuántas fueron** — el denominador de la 46,
otra vez, por la puerta de al lado.

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

**El duelo se juega a rondas, y hay dos condiciones de victoria, no una**
(vuelta 62). Una **ronda** se gana matando al rival o llegando al final de sus
tres minutos con más vida; la **partida**, con la mayoría de las rondas. Son dos
cosas distintas y por eso están separadas en el código (`_terminarRonda` y
`_terminarPartida`) y en la foto. Todo vive en `net/partida.js` y nada en el
motor: es una regla del 1v1, no del aim trainer. El tuning, en `ROUNDS`.

Seis reglas que **son** el sistema:

- **El reloj de una ronda es el número de paso**, como todo lo demás de la red.
  En pausa no corre porque no corre nada, que es justo lo que hace falta: con el
  reloj de pared, una pausa de dos minutos se comería una ronda entera. Lo que
  viaja en la foto es **cuánto queda**, calculado por el servidor — los relojes
  de las dos pantallas y el suyo no coinciden (misma regla que la vuelta 54).
  Las cuentas de la *conversación* —pausa y votación— siguen por pared y siguen
  en `PAUSE`: son del jugador, no del mundo.
- **Un número par de rondas a propósito.** Con impar no hay empate posible y la
  prórroga no llegaría nunca. Catorce, mayoría de ocho.
- **Empate real de vidas: la ronda no cuenta y se repite.** No es medio punto
  para cada uno: nadie ha hecho más que el otro. Consecuencia deliberada que no
  es un fallo: **una ronda repetida no gasta número**, así que dos jugadores que
  no hagan nada pueden repetir para siempre. El final lo pone jugar.
- **La prórroga va por tandas, no a muerte súbita** (`ROUNDS.prorrogaTanda`, 2).
  Con una sola ronda de desempate, las trece anteriores valdrían lo mismo que la
  catorceava. A 1 es muerte súbita, que es lo que hay que poner si algún día se
  decide lo contrario.
- **Con rondas, una muerte no se reaparece: cierra la ronda.** `vivoEn` se pone
  a un número al que no se llega, y el que levanta a los dos es el reinicio de
  ronda. Fuera de una ronda sigue valiendo la reaparición de la vuelta 52, en el
  reloj de las entradas de la víctima.
- **Y abandonar es perder la ronda.** Encaja sin ningún caso especial: el rival
  gana la ronda y, como un duelo no se juega solo, la partida.
- **Y que se acaba se oye, no sólo se ve** (vuelta 73). El contador en rojo
  estaba desde la 62, a 20 s, y no bastaba: es información en un sitio al que no
  se mira, y lo que pasaba jugando era volver a la salida sin que nada lo
  hubiera dicho. **El oído no hay que apuntarlo a ninguna parte.**
  `ROUNDS.avisoFinalSegundos` (15, lo que dura una fase de compra) pone el rojo
  y un pitido suave por segundo, el último más agudo. Se dispara **en el cambio
  de cifra**, que es el mismo sitio donde se escribe el reloj: no hay un segundo
  temporizador que pueda desfasarse del número que se ve, y en pausa no suena
  porque el reloj de la ronda es el número de paso — sale solo, sin una
  condición más.

**La fase de compra aísla de verdad, y eso lo garantiza el servidor** (vuelta
62). Quince segundos entre ronda y ronda, con dos mecanismos que no son el mismo:

- **El corralito** es una caja de 4 u centrada en la salida de cada uno
  (`ROUNDS.cajaCompra`). Las dos salidas están a 5 u, así que **no se solapan**.
  Vive en `movement.js` (`setCorralito`) y no en el servidor **porque el cliente
  predice su propio movimiento**: un límite que sólo conociera un lado sería una
  corrección por paso contra una pared que sólo existe en un sitio. El módulo es
  deliberadamente tonto —cuatro números y un acotado—; cuándo hay corralito lo
  decide `partida.js`, que es donde viven las reglas.
- **No verse no es no dibujar: es no recibir.** Durante la compra la foto sale
  **por destinatario** y sólo lleva al que la recibe. Cuesta un `stringify` de
  más durante quince segundos de cada ronda, y a cambio «no pueden verse» deja
  de depender de que el cliente colabore, que es el único sitio donde esa promesa
  se puede romper. El cliente, además, vacía el buffer del rival al cambiar de
  fase: si no, al empezar la ronda interpolaría desde donde estaba hace quince
  segundos.
- **Y un cambio de fase tira la cola sin confirmar.** Un reinicio de ronda es un
  teletransporte que decide el servidor; reejecutar encima las entradas que
  viajaban sacaría al jugador andando de su propia caja. Va **antes** de
  reejecutar, en `_leerRondas`.

**Y desde la vuelta 64 se compra de verdad.** La fase de compra tiene su
armería (tecla de armería, B de fábrica), su dinero y su catálogo, con el
servidor de árbitro. El detalle está arriba, en las convenciones; lo que hace
falta saber para jugar: se empieza con 800 y la pistola, la ronda 1 no deja
comprar armas largas, ganar da 3200 y perder 2400 —con suelo que sube al que
encadena derrotas—, morir cuesta el equipo, y el chaleco y el casco **paran
balas de verdad** porque el duelo ya tiene la escalera de daño del
entrenamiento. Y con la fase a cero —partida rápida— **la tienda no cierra**: se
compra durante la ronda entera (vuelta 65). Lo que no hay todavía: granadas, y
por eso salen en el panel **precintadas** con «Próximamente» y sin poder
comprarse.

**Hay economía, y la manda el servidor** (vuelta 64). Dinero, inventario y qué se
puede comprar viven en `net/partida.js`; el cliente dibuja el panel y **pide**
(`MSG.COMPRAR`), y lo que tiene vuelve por `MSG.ECONOMIA`. Es la misma regla que
la cadencia de la vuelta 56 —el arma la lleva el cliente, lo que se puede tener
lo decide el servidor— y por eso un cliente que mintiera sobre su saldo compra
exactamente nada. El tuning entero está en `ECONOMY`. Ocho reglas que **son** el
sistema:

- **El techo de la ronda 1 no es de dinero, es de tipo.** Ninguna arma principal
  se compra esa ronda aunque sobre el saldo, y se comprueba por `tipo` contra
  `ECONOMY.techoRonda1`: bajar el precio de un rifle no puede abrir esa puerta
  por detrás. Lo que sí cabe es equipo —y utilidad, cuando exista—, así que la
  primera ronda es una decisión (¿chaleco o casco?) y no una carrera.
- **Ganar salta más que perder, y morir cuesta el equipo.** Victoria 3200,
  derrota 2400 con suelo que sube al que encadena derrotas, 300 por baja. Y el
  que cae empieza la siguiente con la pistola y sin chaleco: sin eso, el salto de
  economía sería sólo dinero. Medido en `compra64`: +3500 el ganador contra +2400
  el perdedor, y con 2700 en la mano no llega al rifle (2900) pero sí al subfusil.
- **El rifle cuesta 2900 y no 2700 por un número que salió midiendo**: con 2700,
  un perdedor que se hubiera guardado los 300 del chaleco llegaba **justo** y la
  asimetría de la ronda 2 desaparecía por doscientos dólares.
- **La economía no viaja en la foto**, va por su mensaje y **por destinatario**:
  cambia cada pocos minutos —no sesenta veces por segundo— y **el saldo del rival
  no se enseña**, que en la foto compartida llegaría a los dos. Es la misma idea
  que la foto por destinatario de la fase de compra (vuelta 62).
- **El supresor no es una compra: es un interruptor.** No cuesta nada, es del
  arma que ya llevas y se conmuta **en cualquier fase** —clic derecho, en los dos
  modos—. Encerrarlo en la fase de compra habría sido inventarle un coste que no
  tiene y dejar el clic derecho muerto durante la ronda.
- **Escudo y casco existen ya en red**, porque hay una tienda que los vende: una
  armería que cobra por un chaleco que no para balas es una tienda de humo. La
  escalera —casco, escudo, vida— no se escribió otra vez: es `encajarImpacto`,
  en `src/game/player.js`, la **misma función** que usa el jugador del
  entrenamiento. Dos copias es cómo un chaleco acaba absorbiendo distinto según
  el modo.
- **Lo que llevas en red sale del inventario, no de tus ajustes.** `_applySettings`
  no toca la ranura principal con `enRed`, y el supresor sale de `_invRed`. Sin
  eso, el ajuste guardado del jugador le devolvía el rifle en cuanto se aplicaba
  cualquier opción: un arma que no ha pagado y que el servidor no le reconoce.
- **Y que hay economía lo dice la bienvenida** (`eco`), no el silencio. Un
  huésped sin rondas (`VEKTOR_RONDAS=0`, el mundo de los bancos de netcode) no
  tiene economía, y allí el arma sigue saliendo del ajuste como hasta la 63 —si
  no, `red45` y compañía medirían el peso y la cadencia de una pistola—. Deducir
  «no hay economía» de que no llegue un mensaje es adivinar por silencio.

**Lo que no se compra no puede entrar en el catálogo** (vuelta 73).
`catalogoDeTienda()` sanea `ECONOMY.catalogo` y lo miran los dos extremos —el
cliente para montar el panel y el servidor para aceptar—, que es la misma idea
que `compraAbierta` y `escenarioDeDuelo`: escrito en cada lado se despega, y el
síntoma sería un artículo que el panel enseña y el servidor rechaza sin decir
por qué.

Hoy quita una sola cosa, y es la que hay que garantizar: **un arma de cuerpo a
cuerpo no se compra**. El Vanta se lleva siempre, como la pistola, en cualquier
mapa y sin coste. Que no esté escrito en la lista no basta —una lista a mano es
una lista donde un día se cuela algo—: la regla sale de `WEAPONS[clave].slot`,
el mismo dato del que salen `PRIMARY_WEAPONS`, `SECONDARY_WEAPON` y
`MELEE_WEAPON`.

**La fase de compra es de la sala, y la elige quien la crea** (vuelta 64). Viaja
en la dirección del socket (`?compra=…`), como el pase de reconexión y por el
mismo motivo: la sala se configura **al nacer**, antes de que llegue ningún
mensaje. Al segundo en entrar se le ignora — nadie le reconfigura la partida al
que la montó. **A cero no hay fase**: las rondas se encadenan, que es lo que hace
falta para una partida rápida. El acotado vive en `Partida.configurarCompra`, y
no en cada huésped, porque huéspedes hay dos.

**Y a cero la tienda no cierra: se compra jugando** (vuelta 65). Que no haya
fase de confinamiento no es que no haya economía — es que **no hay ventana entre
rondas donde meter la tienda**, así que la ventana es la ronda entera. Hasta la
65 «sólo se compra en fase de compra» y «no hay fase de compra» se multiplicaban
y dejaban una partida entera con la pistola de serie de principio a fin, sin un
solo aviso: el panel abría, el artículo salía apagado y el servidor rechazaba en
silencio.

Cuándo está abierta lo dice **una sola función, `compraAbierta`, y vive en
`net/protocolo.js`** porque la miran los dos extremos: el servidor para aceptar
la compra y el cliente para pintar el panel. Escrita en cada lado se despega, y
el síntoma sería el peor de los dos —un artículo que el panel enseña comprable y
el servidor rechaza sin decir por qué—. Es la misma idea que `net/codigo.js` con
la normalización del código.

Ojo con lo que **no** cambia: el techo de la ronda 1 sigue siendo de tipo, así
que en una partida rápida la primera ronda tampoco vende armas largas por mucho
que la tienda esté abierta. Y **quien compra jugando no se para**: el mundo sigue
corriendo con el panel puesto, igual que con el menú desde la vuelta 60 — ahí
eres un blanco, y eso es parte del precio de comprar en mitad de la ronda.

De ahí una consecuencia de interfaz que no es un capricho: **cambiar el selector
recarga con una partida nueva**. Una sala ya creada no se reconfigura, así que
dejar el selector puesto sin más enseñaría un número que el servidor no está
usando; debajo se ve **lo que dice el servidor**, que es la verdad.

**Las opciones de una partida son de quien la crea, y sólo hasta que entra
alguien** (vuelta 67). Jugando por primera vez entre dos PCs salió entero: el que
se unió por el enlace tocó el desplegable de la fase de compra y **acabó en una
partida nueva** —código nuevo, ranura 0, color azul— dejando a su rival solo en
la de antes. No es que el cambio fallara: es que ese control **no era suyo**, y lo
que hay detrás de él es empezar otra partida. Tres reglas:

- **Quién es el anfitrión lo dice el servidor**, en la bienvenida (`anfitrion`), y
  es **la primera butaca** — no el id, que es un contador que no para, ni el
  color. La butaca sobrevive a una caída con su pase; si el anfitrión abandona de
  verdad, su butaca queda libre y el mando pasa a quien la ocupe, que es lo
  correcto porque si no no queda a quién preguntar.
- **Y se cierra en cuanto hay alguien dentro**, también para el anfitrión.
  Cambiarlo abandona la sala y con ella a quien haya entrado por tu enlace: que
  pueda hacerlo es correcto, que pueda hacerlo sin enterarse, no.
- **La comprobación no vive en el `disabled`.** El atributo apaga el control en
  el navegador; el `change` vuelve a preguntar antes de navegar, porque lo que
  hay detrás es irreversible y una puerta que se cierra sola no se deja apoyada
  en el CSS.

**Y «hay rival» lo dice el servidor, no la pose** (vuelta 67). Durante la fase de
compra la foto sale **por destinatario** y no lleva al otro (vuelta 62), así que
«¿ha entrado alguien?» y «¿veo a alguien?» son dos preguntas distintas, y mirar
`poseDelRival()` contestaba «esperando» los quince segundos enteros con el rival
dentro. La foto lleva `ocupadas`, que cuenta **butacas y no cables**: quien se
está cayendo sigue ocupando la suya.

**Irse es irse a algún sitio** (vuelta 67). «Salir de la partida» mandaba el
adiós, cerraba el cable y **dejaba al jugador en la misma pantalla** —el menú de
una partida de la que acababa de salir, con su código y su botón de pausa—, que
desde fuera se lee como un botón que no hace nada. Ahora lleva a `NET.rutaJuego`.
El orden importa y no es intercambiable: **el adiós primero y la navegación
después**, porque ese mensaje es lo único que distingue un abandono de una caída
(vuelta 62) y descargar la página cierra el socket sin decir nada.

**El portapapeles no existe fuera de un contexto seguro, y una IP de red no lo
es** (vuelta 67). `navigator.clipboard` es `undefined` en `http://192.168.x.x`,
que es exactamente cómo se juega en casa desde otro PC: `await
navigator.clipboard.writeText(...)` ni llegaba a escribir —petaba al leer
`writeText` de `undefined`—, se lo comía el `catch` y el botón «copiar» no hacía
nada visible. Debajo va `document.execCommand('copy')`, obsoleto y **el único que
funciona sin contexto seguro**, y el botón dice cuál de las tres cosas ha pasado:
copiado, copiado por abajo, o «selecciónalo» — porque si no se ha podido, hay algo
que hacer a mano y el jugador tiene que saberlo.

Y lo que se copia es **siempre una URL absoluta** (`enlaceDeSala`), que es lo que
otra aplicación reconoce como enlace. Ojo con lo que **no** está en nuestra mano:
WhatsApp no convierte en enlace una IP privada con puerto por mucho que sea una
URL válida; lo que se comparte fuera de casa es la dirección del despliegue.

**Y el menú del duelo no puede crecer una fila más** (la regla es de la 62; el
recordatorio, de la 67). Ha ido creciendo en cada vuelta que le añadió algo
—pausar en la 60, salir en la 62, la fase de compra en la 64— y a 700×460 llegó a
medir **505 px**: los dos botones de abajo caían fuera de la ventana y no se
podían pulsar. `menu62` lo decía **desde la vuelta 64** y estuvo en rojo tres
vueltas porque no se pasó. Lo que sobraba era ayuda repetida —las teclas están en
las opciones— y una nota para probar en dos pestañas que dejó de hacer falta el
día que hubo un botón en el menú. Si añades algo aquí, quita algo o pasa
`menu62`.

Y por eso el botón de **Opciones** de la vuelta 73 entró **en la fila que ya
había** —pausar, opciones, salir— y las **fichas de las armas** no entraron en
este menú en absoluto: se abren desde la tienda, que es la misma conversación
(«qué llevo y qué hace»), y con la tecla de armería en los mapas que reparten.
`menu62` sigue verde.

**La armería del duelo no pausa, y no comparte pantalla con el menú** (vuelta
64). Se abre con la tecla de armería —la del motor, reasignable en opciones— y el
mundo sigue corriendo: una pausa es parar el mundo de los dos y sólo la decide el
servidor (vuelta 53). Lo que sí hace es **soltar el ratón**, porque comprar con
el ratón pide poder pinchar, y es un `.control` para que ese clic no cuente como
el que captura (vuelta 48).

Y como el menú también sale al soltar el ratón, los dos se pintaban encima: el
cuadro del código (`#sala`, que es un `.control`) se comía los clics de la tienda
**y el clic con el que se vuelve a jugar**. Con la tienda abierta, el menú se
quita; al cerrarla vuelve, salvo que ya se haya recuperado el ratón.

**Dos formas de comprar, y las dos son la misma llamada**: pinchar el artículo o
teclear su **combinación** (categoría + código), que va escrita en la esquina de
cada uno. Los códigos **no son correlativos a propósito** —la Rift es `4 3`—:
dejan sitio a las armas que faltan, porque el día que lleguen no pueden mover de
sitio lo que la gente ya tiene en los dedos. Y lo que todavía no existe (granada,
aturdidora, cegadora) **sale en el panel con su precio y su código y no se puede
comprar**: esconderlo sería no poder aprenderse la combinación; venderlo sería
prometer una mecánica que no hay.

**Y lo que no existe lleva precinto; lo que sí, marca** (vuelta 65). Son dos
cosas distintas y hasta la 65 se decían igual —una nota de diez píxeles al lado
del precio: «pronto» para la granada, «sin saldo» para el rifle—, así que de un
vistazo no se distinguía *hoy no te llega* de *esto no existe*. Ahora:

- **Lo que no existe** lleva una franja roja cruzada con «Próximamente»
  (`.art.proximamente` + `.sello`), que se pone **en el montaje** y no en el
  repintado: una granada no existe hoy y no va a existir a mitad de partida. La
  franja va a la altura de la nota y **deja leer el nombre, el precio y la
  combinación**, que es justo lo que hay que poder aprenderse.
- **Lo que se puede comprar ahora mismo** lleva el verde de acción y un filo
  grueso a la izquierda (`.art.puedo`), y esa clase sale de `porQueNo` —la misma
  razón que decide si el botón está apagado—, no de una segunda lista de
  condiciones.
- **Ojo al orden de las dos reglas CSS**: `.art:disabled` y `.art.proximamente`
  tienen la misma especificidad, así que la segunda gana **por ir después**. Es
  lo que devuelve la opacidad que el `disabled` quita, y mover el bloque apaga el
  precinto — misma trampa que `#abatido` y su `.puesto`.

**Lo que compras se te pone en la mano** (vuelta 67). La compra entraba en el
inventario y el jugador seguía con la pistola hasta que se acordaba de pulsar el
1 — y en una fase de compra de quince segundos eso es salir a la ronda con el
arma de antes. **La condición es que la principal haya cambiado**, no que llegue
un `MSG.ECONOMIA`: llegan también al cobrar la ronda y al conmutar el supresor, y
arrancarle el arma de la mano a alguien que acaba de cambiar a la pistola a
propósito sería el mismo fallo por el otro lado. Comprar es la única forma de que
esa clave cambie.

**Un callback tiene un dueño, y encadenarlo no es opcional.** La página del duelo
escucha `onEconomia` para repintar la tienda **y el motor lo escucha para ponerte
en la mano lo que has comprado**. Asignarlo sin encadenar se llevó por delante al
motor: la Rift se compraba, el panel la daba por cobrada y la tecla 1 seguía
sacando la pistola. Es la forma que ya tenía `onBienvenida` (vuelta 56), y vale
para cualquier aviso del cliente que quieran dos.

**Caerse no es irse, y la única forma de distinguirlo es que irse se diga**
(vuelta 62). Es la regla del transporte de la vuelta 51 llevada hasta el final:
un cable que se corta **no manda ningún mensaje**, así que las dos cosas llegan
por la misma puerta —`close`— y ninguna pista del socket las separa. Por eso
`MSG.ADIOS` pasa a ser **bidireccional**: del cliente significa «me voy», y lo
manda **sólo el botón «Salir de la partida»**.

**Y cerrar la pestaña no lo manda, a propósito.** La primera versión lo soltaba
también en `pagehide`, y está mal por algo que sólo se ve al probarlo: el
navegador dispara ese evento **igual al recargar**, y recargar es justo como se
vuelve a una partida. Con eso puesto, reconectar era abandonar.

**Todo cierre sin ese mensaje delante es una caída**, y ése es el lado seguro del
error: dar por abandonado a quien se le fue el wifi le quita una partida que no
había perdido; dar por caído a quien cerró la pestaña sólo hace esperar al rival
—y ni eso, porque puede cerrar la ventana él—.

De ahí, cinco piezas:

- **`sale()` se parte en dos verbos**: `abandona(id)` libera la butaca entera;
  `sedesconecta(id)` la **conserva** con su vida, sus rondas, su ranura y su
  arma. `llena` cuenta butacas reservadas —si no, un tercero con el código se
  sienta en la silla de quien está recargando la página— y `vacia`, que es lo
  que mira el huésped para parar el reloj, cuenta **conectados**.
- **El pase de reconexión.** Un secreto que da la bienvenida y que sólo tiene
  quien ya estaba sentado ahí. Viaja **en la dirección del socket**
  (`?pase=…`) y no en un mensaje, porque la butaca se decide en `entra()`, antes
  de que llegue ninguno. Sin él, la butaca de quien se cae se la queda cualquiera
  que tenga el enlace, empezando por su rival.
- **La pausa por caída es un tercer tipo de pausa**: no la pone nadie
  (`por: null`), **no gasta ninguna de las tres libres**, no la levanta un botón
  —la levanta que el otro vuelva— y su tope es la ventana de reconexión.
- **Un cable mudo no se cierra solo**, así que el huésped lleva **ping/pong**
  (`NET.pingMs`, 5 s): dos intervalos sin contestar y cierra el socket. Es del
  huésped y no del protocolo —la partida no pregunta por el estado del cable, se
  entera de que se cerró—. Sin esto, un portátil que se duerme deja al rival
  mirando un muñeco congelado durante los minutos que tarda TCP en rendirse.
- **Noventa segundos de ventana** (`ROUNDS.reconexionSegundos`), y **el que
  espera puede cerrarla a los quince** (`abandonoDesdeSegundos`, `MSG.RECLAMAR`).
  El número sale de la escala que ya existía: por encima de lo que cuesta
  recargar la página o desbloquear un PC, y por debajo de los 120 de una pausa
  libre — ninguna pausa que no se elige puede durar lo que una que sí. Y lo
  segundo es la regla de la vuelta 55 por el otro lado: el mundo parado de uno no
  puede ser un efecto secundario de lo que le pase a otro.

**Y la partida a medias se guarda en el navegador, no en el netcode.** El código
y el pase viven en `localStorage` bajo `vektor.duelo.v1`, los guarda la página
del duelo y el botón «Reconectar» sale ahí — **no** en la pantalla de inicio del
juego, que no sabe que existe la red (vuelta 45). Ojo con lo de siempre:
`localStorage` es por origen, así que mudar de dominio deja atrás la partida a
medias, una vez.

**Tres pausas libres por jugador y partida** (`PAUSE.free`); de la cuarta en
adelante decide el rival, votando. Sólo la levanta quien la puso —si no, pedirla no serviría—, e irse levanta la
propia, o el otro se queda en un mundo parado para siempre. Se contesta con
**teclas** (Intro / N) y no con un botón: a quien le llega la petición está
jugando con el ratón capturado, y soltarlo para pinchar sería pausarle la partida
para preguntarle si quiere pausarla.

**Y pausar es un botón, no un gesto** (vuelta 60). Desde la 53 y hasta la 58,
soltar el ratón **pedía la pausa solo**, y el precio se vio a la primera partida
de verdad: abrir el menú para mirar el código, copiar el enlace o teclear otro
**gastaba una de las tres libres** sin que nadie la hubiera pedido, y no había
forma de abrirlo sin pagarla. Escape abre el menú; lo que gasta una pausa es
pulsar «Pausar» ahí dentro.

Lo que la 53 arregló de verdad sigue en pie, que era lo que importaba: **soltar el
ratón suelta las teclas** (como perder el foco: quien abre el menú no está
pulsando nada), así que con el menú puesto no se anda. Lo que se acepta a cambio
es que el mundo siga corriendo mientras miras el menú — ahí eres un blanco, igual
que durante una votación desde la 55, y por la misma razón: **pausarle la partida
al rival no puede ser el efecto secundario de un gesto tuyo**.

Y el otro gesto que sí hace falta: **volver a pinchar levanta tu propia pausa**, o
se recupera el ratón con el mundo todavía congelado. Se contesta a una votación
con **teclas** (Intro / N) y también con los botones del cartel: ver abajo por qué
las dos cosas y no una.

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
también que pedir y votar sean dos botones distintos y nunca los dos a la vez:
con libres sale «Pausar», sin ellas «Solicitar pausa por votación». (Hasta la 58
esto era «soltar el ratón sólo pide pausa si quedan libres»; desde la 60 soltar
el ratón no pide nada.)

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

**Y soltar el ratón es del instante en que llega la pausa, no del repintado**
(vuelta 62). La regla de abajo estaba escrita como «si la pausa es mía y tengo el
ratón, suéltalo», y eso corre **cada vez que cambia algo del bloque de pausa** —la
cuenta de libres, por ejemplo, que llega una foto después—. El efecto: el jugador
**no podía recuperar el ratón**. Pinchaba, el navegador le daba la captura, y la
foto siguiente se la quitaba otra vez, con la pausa todavía puesta porque
levantarla cuesta un viaje. Medido: cinco clics en diez segundos, ninguno se
queda — y como el clic es justo el gesto con el que se reanuda, la pausa tampoco
se levantaba. Ahora se suelta **en la transición**, que es lo que la 55 quería
decir.

Y lo mismo por debajo: **`unadjustedMovement` no está en todas las plataformas**,
y su rechazo llega en una promesa —o sea un turno después, con el gesto del
usuario ya gastado—, así que el reintento de dentro del `catch` sale rechazado
sin decir nada. Se recuerda que no está (`Engine._sinMovimientoCrudo`) y se deja
de pedir: cuesta un clic la primera vez y ninguno después.

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

**Las pisadas son de los demás, y una zancada es un trozo de suelo** (vuelta 60;
las reglas de quién suena y hasta dónde, de la 63). Cuando un rival **corre**
cerca se le oye, con dirección y distancia (`FOOTSTEPS`, emisor colgado de su
cuerpo). Cinco cosas que son el diseño:

- **El jugador no oye las suyas.** No dirían nada que no sepa —está pulsando la
  tecla— y taparían justo lo que estas pisadas vienen a dejar oír. Misma regla
  que el silbido de la vuelta 40.
- **El paso se cuenta en distancia, no en tiempo.** Y se mide **contra dónde se
  dio la última pisada**, no sumando el avance de cada frame: el rival se
  interpola entre fotos y esa trayectoria tiembla —medido, 11 pisadas para 13.3 u
  con zancada de 1.9; contra la última, 6 para 13.4, que es lo que toca—.
- **Sólo suena quien corre** (vuelta 63). Andar con SHIFT y agacharse **no suenan
  en absoluto**: es lo que promete la tecla, y lo que se paga por ella es la
  velocidad. Hasta la 62 sonaban más bajo (0.7 y 0.45), que es otra cosa — con un
  rival corriendo a doce unidades por medio, «más bajo» se oye igual. Lo agachado
  sale de la altura de ojos, que ya viaja en la foto, y va como **regla propia**
  aunque el umbral de marcha también lo dejaría fuera: subir `crouchSpeed` algún
  día no puede devolverle el ruido a quien se agacha.
- **Y el umbral se mide sobre la zancada, no sobre el frame.** La marcha de un
  frame sale del temblor de la interpolación: un paseo de 3.8 u/s pica por encima
  de 5.33 cada pocos frames, y con la regla puesta sobre el frame **sonaba igual**
  (medido: 4 pisadas andando). La zancada es una ventana de un tercio de segundo,
  que es justo lo que promedia ese temblor. El umbral es fracción de **su**
  carrera, con el peso de su arma contado por `weaponSpeedFactor`: contra los 6.5
  de la pistola, un rival con la Rift (5.88) correría en silencio. El número
  (0.82) sale del hueco entre las dos marchas —5.88 la carrera más lenta, 4.2 el
  paseo más rápido— y cae a 0.55 u/s de cada una.
- **Hay un radio, y dentro de él el volumen escala de verdad.** Fuera de
  `FOOTSTEPS.maxDistanceU` (16 u) no suena nada, y lo dicen las dos puntas: el
  motor no suelta la pisada y el panner llega a cero justo ahí. Dentro, el
  **emisor del rival lleva su propia curva** —pleno hasta `fullDistanceU` (2.5 u)
  y apagándose hasta el radio— y no la de `SPATIAL`, que está calibrada para que
  un sonido cruce un mapa de 55 u: con ella, una pisada a 12 u salía a **1.9 dB**
  de una a 4, o sea un radar plano. Medido tras la vuelta 63: **−10.5 dB** entre
  esas mismas dos distancias, y el techo (`AUDIO.footstepVolume`, 0.26) no se
  pasa ni pasándote por al lado —a 0.5 u, 0.0784 contra 0.0853 a 1.0 u—.

De ahí una consecuencia que conviene tener presente al añadir otra voz al rival:
**ese emisor es hoy el de las pisadas**. Un disparo suyo, o un grito, necesita su
propio emisor con su propia curva; colgarlo de éste le pondría el radio de 16 u.

Y una trampa de relojes: **la pose del rival se mueve con el frame y este código
corre dentro del paso de mundo**. Dividir el avance de un frame entre un paso
infla la velocidad, y con frames largos la infla por encima del techo del aire —o
sea que el guardia de teletransporte borra la cuenta en cada frame: medido, cero
pisadas con el rival andando—. El reloj de esto es el de pared.

**Un vano no es un área** (vuelta 61). Al crecer el menú del duelo con el botón
de pausar, la primera medida decía que ocupaba el **97% de la pantalla** a
700×460 — y eso era la distancia del borde de arriba del primer control al de
abajo del último, con sus huecos dentro. Preguntándole al navegador punto por
punto con `elementFromPoint`, lo libre es el **70.5%**. Cuando lo que se quiere
saber es «¿se puede pinchar aquí?», se le pregunta al navegador; una caja no lo
contesta.

Y de paso: **el clic con el que un banco captura el ratón va a una esquina**. El
centro de la pantalla del duelo es un `.control`, y ahí un clic no captura a
propósito (vuelta 48). Tres suites cayeron por esto con síntomas que no se
parecían en nada —una premisa de «está jugando», un «0.00 u» de movimiento—.

**El menú del duelo tiene que caber, y si no cabe se desplaza** (vuelta 62). Ha
crecido dos veces —pausar en la 60, salir en la 62— y a 508 px el último botón
caía fuera de una ventana de 460: `pausa55` murió intentando pulsarlo, con un
«element is not visible» que no se parece a la causa. Ahora salir va en la fila
de pausar —pequeño y al lado, que no es la acción de esta pantalla— y `#aviso`
lleva `overflow-y: auto` con `place-items: safe center`, que es lo que evita que
al desbordar se corte **por arriba**. `menu62.mjs` lo guarda preguntando con
`elementFromPoint` si un clic en cada botón le llega, a cuatro tamaños.

**Una suite sin aserciones no es una prueba, es un informe.** `baja.mjs` imprimía
«se sube en 12/12» y salía en verde pasara lo que pasara; con aserciones de
verdad cazó a la primera una regresión de 12/12 a 0/12. Si un test no puede
fallar, no está guardando nada. (`x8.mjs` sigue siendo un informe a propósito: no
afirma, mide.)

**Un error de página es un fallo, no una línea de registro** (vuelta 60). Un
`FOOTSTEPS is not defined` produjo **318 errores** en una tanda entera y las seis
suites salieron **verdes**: `_loop` reprograma el frame siguiente **antes** de
trabajar, así que una excepción por frame no mata el bucle — degrada en silencio.
Un banco tiene que contar los `pageerror` y fallar con ellos; casi todos los de
`net/` sólo los imprimen, y eso es deuda.

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

**Y comprueba que el que contesta es el que acabas de lanzar** (vuelta 64).
Vite, si el puerto está ocupado, **arranca en el siguiente** y lo dice en una
línea que nadie mira: el 5192 lo seguía sirviendo la instancia vieja —la del
store duplicado— y la nueva se fue al 5193. El síntoma fue exactamente el de
arriba: `updateSettings` escribía, el store devolvía el valor nuevo y el motor no
se enteraba de nada, con dos suites en rojo por un cambio que no tenía nada que
ver. Si un banco del **juego** falla justo después de tocar `config.js`, mira
primero qué proceso tiene el puerto.

**Y `npm run host` dice por dónde se llega desde otro PC** (vuelta 66).
`localhost` apunta siempre al equipo que lo escribe, así que un enlace de
`http://localhost:8787/duelo/ABC` no vale para pasárselo a nadie aunque los dos
estén en la misma red — y no da ningún error, simplemente el otro abre su propio
equipo. El arranque imprime ahora las IPv4 de red de la máquina, que es lo que sí
se puede pasar, y lo dice con todas las letras.

**Y los dos huéspedes sirven `dist/`, no `src/`.** `npm run worker` y `npm run
host` construyen antes por eso mismo: con cualquiera de los dos levantado,
cambiar un fichero del juego **no se ve** —los ficheros que sirven son los que
había en `dist/` cuando arrancaron—. Es la misma clase de falso negativo que el
de arriba, por otra puerta: vuelve a lanzarlo antes de creerte el diagnóstico.
Y el de Node además **cachea en memoria lo que sirve, comprimido**, así que ni
siquiera reconstruir `dist/` por debajo le cambia nada: hay que reiniciar el
proceso.

**Y el huésped lleva también su propia copia de `config.js`, que no es la del
build** (vuelta 72). Importa `src/config.js` directamente al arrancar, así que
las reglas del servidor —los topes de pausa, el escenario de fábrica, la
economía— son las que había **cuando se lanzó ese proceso**. Reconstruir `dist/`
no le cambia ninguna.

De ahí un falso negativo que costó un rato: `pausa54-tope` se pasa con los topes
de pausa bajados, y un huésped viejo seguía dueño del puerto —el `kill` no había
matado nada— así que las siete aserciones salieron en rojo como si el juego
hubiera dejado de caducar las pausas. **Comprueba el proceso, no el puerto**: que
`/salud` conteste no dice que conteste el que acabas de lanzar, y un `node` que
no consigue el puerto muere con una excepción en su registro y no se queja en
ningún otro sitio. Y donde se pueda, que lo compruebe el banco: el tope de la
pausa viaja en la foto, así que `pausa54-tope` **pregunta al huésped cuál lleva**
antes de medir, y se entera al primer segundo en vez de a los catorce.

**Y el huésped tiene dos interruptores para poder medir, no para jugar** (la
segunda, de la vuelta 62):

- `VEKTOR_DEBUG=1` atiende `MSG.COLOCAR`, que es como un banco pone a los dos
  jugadores cara a cara sin depender de que sepan rodear una caja.
- `VEKTOR_RONDAS=0` deja el duelo **como estaba hasta la 61**: un mundo que no se
  reinicia, con la reaparición por reloj de las entradas y sin fase de compra. Es
  lo que necesitan los bancos que miden el **motor y la red** —`red45`, `tiro46`,
  `motor56`, `ux60`, `reaparecer50`, `conexion51`, `jugable48`, `recoil61` y las
  tres de pausas— porque casi todos **matan al mismo blanco una y otra vez**: con
  rondas, cada muerte abre quince segundos en los que no se dispara y la tabla no
  sale mal, sale **vacía**.

  Lo que sí se juega a rondas se mide en **`rondas62`** —que conduce `Partida`
  directamente, sin navegador, porque ahí no hay una línea de red— y en
  **`duelo62`** y **`abatido52`**, con navegadores y contra el producto. Medir las
  dos cosas en la misma tanda no se puede, y no es una preferencia: la primera
  baja cierra la ronda y todo lo que venga detrás cae en la fase de compra.

`/salud` dice los dos, así que un banco puede comprobar contra qué está midiendo
en vez de suponerlo.

**Y esto no se deja a la memoria** (vuelta 61): ha costado dos vueltas, la
segunda en forma de banco en rojo con los números exactos de antes del arreglo,
que parecía una regresión del juego. `/salud` dice **qué build sirve** —los
nombres de los assets, que Vite saca del contenido— y el corredor de bancos lo
compara con `dist/` y se niega a medir si no coinciden. Si un banco falla justo
después de tocar código, **mira eso primero**.

Y si alguna vez lo compruebas grepeando el bundle: **sólo valen los accesos a
propiedad** (`recoilLoopFrom`, `_escenarioFijo`). Un nombre de función o una
constante de módulo salen a cero por estar renombrada la una e inlineada la otra,
y eso no dice nada de si están.

**Y un banco de red se pasa solo, nunca a la vez que otro** (vuelta 61). Cada uno
abre dos navegadores con WebGL por software; varios a la vez se quitan frames
—medido, 22 fps contra 26 corriendo solo— y lo que cae son justo las dos
aserciones que miden un margen: la cola del servidor en `red45` y los disparos
del escenario de más latencia en `tiro46`. Es «un jugador por navegador» (vuelta
50) un nivel más arriba. Antes de creerse un rojo, mira los fps que el propio
banco imprime.

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

**Y se entra por el menú** (vuelta 66): la pantalla de inicio tiene **Duelo 1v1**
junto a los otros modos, y lleva a `/duelo/` —la misma ruta en desarrollo, en
`npm run host` y en el despliegue—, donde ya está el flujo de siempre: el código
creado, el enlace para copiar, el campo para entrar en otro y el selector de fase
de compra. Antes había que escribir la dirección a mano.

**El duelo tiene su propio mapa desde la vuelta 66: El Espejo.** Simétrico por
giro de 180°, con las dos salidas en extremos opuestos —**32 u**, con el centro
tapado por medio— y cada una con su rumbo, así que nadie aparece mirando a una
pared. Cruzarlo son 45.6 u (7.0 s) y el primer contacto posible cae a los **3.5
s**. Sin altura y sin rampas a propósito. No sale en el selector de escenarios: el
Plano A se queda para el entrenamiento y los muñecos.

**Y desde la vuelta 72 hay un segundo mapa de duelo: Los Pilares**, el de
francotirador. Lo que lo distingue no son las cajas: es que **pesa menos**
—gravedad 13 contra 30, ápice de 3.25 u y 1.4 s de vuelo contra 1.25 y 0.58— y
que el techo del aire sube a 12 u/s, así que el air-strafe deja de ser una
técnica de nicho y pasa a ser cómo se llega a los sitios. Sala de 56×56×20, 48 u
entre salidas sin verse, torres de 3.2 u que se suben desde el suelo y atalayas
de 6 u a las que sólo se llega desde una torre, con una centrada que corta la
recta entre las dos salidas. Simetría por giro, como El Espejo, y fuera del
selector de escenarios por lo mismo.

**En él no se compra: se reparte.** Ni tienda, ni dinero, ni elección de arma:
cada ronda y cada reaparición dan **Scout, chaleco y cuchillo**, y nada más —sin
casco, así que una bala a la cabeza sigue matando de un tiro—. Y no tiene fase de
compra: las rondas se encadenan. Ojo con no confundirlo con «sin fase» (vuelta
65), que es lo contrario: allí la tienda no cierra nunca. El mapa se elige en la
página del duelo antes de pasar el enlace, y viaja en la dirección del socket
como la fase de compra.

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

**Y desde la vuelta 62 el duelo es una partida de verdad, no una escaramuza sin
final**: 14 rondas de 3 minutos (mayoría de 8), la ronda se cierra con la primera
muerte, el empate de vidas la repite, un 7-7 va a prórroga por tandas de dos, y
entre ronda y ronda hay una fase de compra —**15 s de fábrica y elegible al crear
la partida**, incluida la opción de no tenerla— con cada jugador encerrado en su
caja y sin recibir la posición del otro. Tuning en `ROUNDS` y `ECONOMY`.
**Sin fase** (la opción de partida rápida) la tienda no cierra: se compra durante
la ronda entera, con el mundo corriendo (vuelta 65). Y desde la **72 un mapa
puede no tener economía en absoluto** —Los Pilares reparte— que es lo contrario
de «sin fase», no lo mismo.

**Y desde la vuelta 65 el hitbox del rival es su silueta.** Lo que recibe
disparos era el cilindro de la colisión —0.4 de radio a cualquier altura— y lo
que se dibuja mide 0.293 en la cintura y 0.137 en la cabeza: apuntando
visiblemente por encima de la cabeza del rival se le mataba de un tiro. Ahora se
corta contra el mismo perfil que dibuja el cuerpo, metido hacia dentro por el
apotema de la sección, así que **lo que no se ve no se puede acertar** desde
ningún ángulo. Medido contra las mallas de verdad: **0 de 693.792 impactos caen
fuera de la silueta**, contra 710.268 de 1.420.008 (el 50%, y 150.546 de ellos a
la cabeza) con el hitbox de antes. Vale igual contra los muñecos, que aciertan
la mitad que antes por la misma razón — se calibra jugando.

**Y una caída ya no deja la partida colgada**: el mundo se para para el que
queda, la butaca del que se fue se guarda entera 90 segundos con su pase de
reconexión, y volver es abrir el enlace otra vez. Irse —que es pulsar el botón—
le da la ronda y la partida al rival. El huésped lleva ping/pong para enterarse
de un cable mudo.

**Y el menú de ESC del duelo tiene tres botones desde la vuelta 73**: pausar,
**opciones** y salir. El de opciones abre el panel completo del juego —con la
sección de controles y la sensibilidad de la mirilla— **sin salir de la
partida**, que hasta aquí era la única forma de llegar a él. No pausa: el mundo
sigue corriendo, igual que con el menú desde la 60 y con la tienda desde la 64.
Las fichas de las armas se abren desde la tienda («Ver fichas de las armas») y
con la tecla de armería en los mapas que reparten, donde no hay nada que
comprar.

Desde la vuelta 53 se puede **pausar la partida de los dos**, con tres pausas
libres por jugador y permiso del rival a partir de la cuarta — y desde la 60
**Escape sólo abre el menú**: la pausa la gasta el botón «Pausar» de ahí dentro. Y desde la 54 **con
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

Y **dos más que no salen en ese selector, porque son de duelo** (`soloDuelo`, de
donde se deriva `TRAINER_SCENARIOS` y, desde la 72, también `DUEL_SCENARIOS`):
**El Espejo** (40×40, plano, simétrico por giro) y **Los Pilares** (56×56×20, con
su propia física y su propia dotación). El desplegable de mapa de la página del
duelo sale de esa segunda lista.

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

**Avatar del jugador (sólo visual):** **el mismo cuerpo que una diana** —cápsula
con cabeza ovalada, tres piezas, una por zona del hitbox— tintado con el color de
su equipo (`TEAMS`: azul `#2F6BF0` y magenta `#D94BD9`). Sin extremidades, sin
esqueleto, sin animación y **sin arma visible**. Agacharse lo achata. **F3** abre
una vista en tercera persona que orbita el modelo, fuera de partida.

**Movimiento:** WASD, tres marchas (correr / SHIFT andar / **C** agachado —CTRL
no, ver convenciones—, gana la más lenta), salto sin doble salto **resuelto en forma cerrada** —misma
trayectoria a cualquier refresco, y desde la vuelta 44 **el mundo entero va en
pasos fijos de 60 Hz**, así que tampoco depende del monitor lo que sí era una
integración—, **por flanco y con memoria** desde la vuelta 68 —mantener SPACE da
un salto, no una ráfaga; una pulsación vive `MOVEMENT.jumpBufferMs` (170) y
salirse de un borde deja `MOVEMENT.coyoteMs` (110) para saltar igual—, **salto
encadenado** con SPACE dentro de
`MOVEMENT.chainJumpWindowMs` (130 ms a cada lado del aterrizaje exacto), que
conserva la marcha del aterrizaje —con vector, también **la dirección**—, y
**deslizamiento** (vuelta 69): corriendo, **pulsar** la tecla de agacharse tira
al jugador al suelo a 9.43 u/s —justo por debajo del techo del aire— frenando en
recta hasta 2.6 en 700 ms y **4.21 u** de recorrido, idénticas a 60, 144 y 240
Hz; se sale soltando la tecla, agotado el tiempo o saltando, y el salto sale con
tu carrera y no con el empujón. No se gobierna: la dirección se congela al
entrar. Tuning en `MOVEMENT.slide`, con `enabled` como ventana para quitarlo. Y
**air-strafe**: en el aire, girar el ratón hacia el lado de la tecla de estrafe
acelera hasta `MOVEMENT.airStrafeMaxSpeed` (9.5 contra 6.5 de carrera) y sin
pasar de ahí nunca. Con el modelo vectorial (por defecto) el ritmo de giro
importa —40°/s es el óptimo, 140°/s frena— y en el aire hay inercia; con el
escalar, tres saltos bien encadenados llevan de 6.5 a 9.5 girando todo lo rápido
que se pueda. Límites
reales de la sala con margen de seguridad. Por encima de `ACCURACY.speedThreshold` y
siempre en el aire se aplica dispersión de disparo (dirección y magnitud
aleatorias, sumada al recoil, sin mover la cámara).

**Y desde la vuelta 72 esos tres números son del mapa**: gravedad, impulso del
salto y techo del aire salen de `scenario.fisica`, con los de `MOVEMENT` de valor
por defecto. Todos los mapas menos Los Pilares llevan los de siempre, medido
dígito a dígito. Lo que un mapa **no** puede cambiar es el modelo del aire, la
aceleración aérea ni las marchas de a pie.

**Armas:** tres arquetipos con cargador, recarga por tiempo (manual con R o
automática al llegar a 0), patrón de recoil acumulativo por disparo consecutivo
que se resetea al soltar o tras `RECOIL_RESET_MS`, y flag de supresor por arma
con sonido propio.

| Arma | Ranura | Modo | RPM | Cargador | Recarga | Supresor | Peso | Marcha |
|---|---|---|---|---|---|---|---|---|
| Pulse | secundaria (tecla **2**, siempre) | semi | 500 | 18 | 1200 ms | sí | 1.1 kg | 6.50 u/s |
| Rift | principal (tecla **1**) | auto | 600 | 30 | 2300 ms | sí | 3.6 kg | 5.88 u/s |
| Volt | principal (tecla **1**) | auto | 800 | 25 | 1800 ms | sí | 2.6 kg | 6.14 u/s |
| Scout | principal (tecla **1**) | semi | 48 | 10 | 2600 ms | **no** | 3.2 kg | 5.98 u/s |
| Vanta | cuerpo a cuerpo (tecla **3**, siempre) | cuchillo | — | — | — | no | 0.6 kg | 6.50 u/s |

**Vanta** (vuelta 71) es el **cuchillo**, y ocupa la tercera ranura —la tecla 3,
reservada desde la vuelta 27—. Se lleva siempre, como la pistola. Clic izquierdo
flojo (25 de daño, uno cada 400 ms), clic derecho fuerte (55, uno cada 857), y
**un fuerte por la espalda mata siempre**. **Ya tiene silueta** desde la vuelta
73, trazada de `Reference/Weapons/vanta.png` como las demás; sin variante
`ghost-`, porque un cuchillo no admite silenciador.

**La Scout** (vuelta 70) es el primer **rifle de francotirador**: una bala al
cuerpo mata a quien no lleve chaleco (110 de daño, `damageScale: 2.2`), dos con
chaleco, una a la cabeza. Trae la **mirilla ampliada** del juego —clic derecho,
22° de encuadre, 140 ms de transición— y **no admite silenciador**, que es lo
que deja ese clic libre. En la tienda del duelo va en *Francotirador*
(categoría 5), a 3100.

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

**Audio de disparo: sintetizado, y es definitivo** (vuelta 63). Las tres armas
llevan la voz **seca** —ataque de 0.6 ms, ruido de banda ancha, metal inarmónico
saturado y un golpe grave corto—, cada una con su carácter: la Pulse corta y
aguda (0.3772 de pico, 23 ms de cola, centroide 2125 Hz), la Volt la más breve
por su cadencia (0.3524, 19 ms) y la Rift la de más cuerpo (0.4526, 29 ms). Las
silenciadas no son las normales bajadas: pierden el grave y el crack y ganan el
cerrojo.

Las diez muestras grabadas se probaron y se descartaron —el juego suena a
sintetizado a propósito—, así que `AUDIO.samplesEnabled` está en `false` y no se
descarga ni decodifica ningún fichero. El carril sigue montado y los WAV siguen
en `Reference/Audio/` por si algún día se reconsidera: se enciende ese booleano y
se pasa `npm run audio:weapons`. Con él apagado, el importador no copia nada.

**Panel de acciones disparable: apagado** (`ACTION_PANEL.enabled: false`). El
código se queda entero —DOM en 3D vía `CSS3DRenderer` anclado al spawn, con
planos WebGL invisibles para el raycast, y botones Pausa / Reiniciar / Cambiar
arma / Silenciador / Opciones—, pero no hay tablero en la sala: disparar hacia
su sitio es un disparo normal. Su hueco reservado se sigue auditando.

**Y desde la vuelta 73 el HUD del duelo es literalmente el mismo**: la página
del 1v1 monta los componentes del juego en vez de tener los suyos, así que
aparecen ahí el **chaleco**, el **casco**, la **marca de Vektor** y las fichas
de las armas, que faltaban. Lo que no sale son los tres bloques del
entrenamiento —aciertos y fallos, estrellas y marcador de sesión—, que en un
duelo no miden nada.

**HUD:** **abajo a la derecha** el bloque de arma —silueta grande (208 px), el
nombre con su ficha corta (`AUTO`/`SEMI` y `SIL` si lleva supresor) y la munición
en grande—, **el mismo en el duelo desde la vuelta 67**, que hasta entonces no
tenía silueta. **Abajo a la izquierda**, y sólo donde hay quien dispare, el
bloque de vida: cruz en CSS, barra fina, escudo de tres segmentos recortado en silueta,
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
que no hay tablero; y **bajo la mira**, centrados, los mensajes de ayuda. El
indicador de recarga va con el arma, en su esquina.

**Pisadas del rival** (vuelta 60; sus reglas, de la 63): cuando alguien **corre**
a menos de 16 u se le oye, con dirección y con el volumen subiendo de verdad
según se acerca —pleno a 2.5 u y apagado del todo en el radio—. Andar con SHIFT y
agacharse **no suenan en absoluto**: eso es lo que compra la tecla. Sólo las de
los demás, y el paso se cuenta en suelo recorrido. Tuning en `FOOTSTEPS` y el
techo en `AUDIO.footstepVolume`, que bajó de 0.42 a 0.26 porque una pisada no
puede confundirse con un disparo (medido: 16.5 dB por debajo).

**Sonido al equipar lo comprado** (vuelta 73): cuatro voces sintetizadas
(`playEquip`) —cremallera para el chaleco, golpe sordo para el casco, cerrojo
para un arma y mosquetón para la utilidad— que suenan **cuando el servidor lo da
por tuyo**, no al pinchar. La condición «sólo si hay saldo» sale gratis de ahí:
si no se cobra, el inventario no cambia y no hay nada que sonar. Y lo que llevas
puesto lo dice la palabra **«Equipado»** en su artículo, no sólo un filo de
color. Tuning en `AUDIO.equipVolume`.

**Y un pitido por segundo en los últimos 15 s de ronda**
(`ROUNDS.avisoFinalSegundos`, `AUDIO.roundTickVolume`), con el contador en rojo
y el último más agudo. Suave a propósito: avisa, no sobresalta.

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

**Marca de bala en las superficies** (vuelta 64): un disparo que no da en un
muñeco deja una estrella breve —420 ms— donde acabó, encarada a la cara que ha
recibido el tiro: cobertura, pared o suelo. Sale igual entrenando y en el duelo,
porque es del motor. A un cuerpo alcanzado no se le dibuja nada: ahí habla el
anillo de la mira.

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
cargador y recarga, absorción de escudo y objetivo de precisión. **El daño ya no
es el mismo en las cuatro** (vuelta 70): sale de `zoneDamage`, la misma función
que resuelve el disparo. La pistola sale
con su ficha y sin botón de equipar: se lleva siempre. Se cierra con **Escape**,
con **B** o con su botón, y abrirla **pausa** la sesión igual que Escape. Sin
precios y sin comprar: no hay economía todavía.

**Opciones** (accesibles antes de empezar y desde la pausa, persistidas):
escenario, sensibilidad, **sensibilidad con mirilla**, tipo de diana,
**duración de Deathmatch**
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

Cuentas, guardado en la nube, rankings y minimapa. Si el encargo no
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

**La economía existe, pero sólo en el duelo** (vuelta 64). La armería del
entrenamiento sigue siendo la de la vuelta 42: equipa y nada más, sin precios,
sin dinero y sin botón de comprar — ahí no hay rondas que la sostengan, y un `$0`
en la ficha prometería una mecánica que en ese modo no hay. Lo que se compra se
compra en la tienda del 1v1, y en el mapa que reparte (vuelta 72) tampoco.

**En diseño, aún no construido:** los Planos B (*El Patio*) y C (*La Ejecución*)
de `docs/propuestas/01-escenario-cobertura.md`. No los construyas hasta que el
Plano A esté validado jugando.

**El deslizamiento ya no está aquí: se construyó en la vuelta 69.** El diseño
sigue en `docs/propuestas/04-deslizamiento.md` y lo que hay que saber para
tocarlo, en las convenciones. Se entra corriendo y pulsando agacharse —el gesto
pedido era W + CTRL + SPACE y Ctrl+W cierra la pestaña, convención de la vuelta
27— y se sale soltando, agotando el tiempo o saltando.

**El salto ya no depende del refresco.** Con `jumpSpeed 8.67` y `gravity 30`
—los de `MOVEMENT`, que desde la vuelta 72 son el **valor por defecto** y no la
única física posible—: ápice **1.2528 u** y **578 ms** de vuelo, iguales en
cualquier monitor
(desviación 0.036% entre 60 y 240 Hz, y esa pizca es dónde caen las muestras, no
la trayectoria). La cobertura `baja` de 1.25 **es saltable de forma fiable** —
verificado 12 de 12 a 60, 144 y 240 Hz.

**Ya no hay mecánicas reservadas en la puntuación:** daño recibido y
muertes/reinicios se calculaban desde hacía vueltas con peso 0, y en la 34 se les
dio peso. La fórmula no hubo que tocarla, que era justo lo que se buscaba al
dejarles el hueco.

**Lo que sí sigue reservado son dos teclas de equipo** (5 y G): tienen bind y no
tienen lógica. La 4 dejó de estarlo al llegar el escudo, la 1 y la 2 al llegar
las dos ranuras de arma, y **la 3 en la vuelta 71, con el cuchillo** — que es
exactamente para lo que se reservaron.

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
