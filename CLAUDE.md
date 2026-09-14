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
| Motor | `src/game/` | Bucle rAF, input, raycast, dianas, armas, panel de acciones. **Vive fuera de React.** |
| Escenario | `src/game/scenario.js` | Convierte los datos de `SCENARIOS` en mallas, colisionadores, oclusores y **rutas**. Y publica su sala (`scenario.room`). |
| Sala | `src/game/scene.js` | Rejilla y paredes, reconstruibles con `setRoom`: cada escenario tiene su tamaño. |
| Audio espacial | `src/audio/spatial.js` | Listener en la cámara y emisores posicionados. **Genérico:** no sabe del explosivo. |
| Muestras | `src/audio/samples.js` | Disparos grabados, **con la síntesis siempre detrás**. Único camino de audio de un disparo. |
| Explosivo | `src/game/objective.js` | Aparición, cuenta atrás, pitido y desactivación. No publica nada al HUD a propósito. |
| Puntuación | `src/game/scoring.js` | Variables normalizadas, media ponderada y estrellas. |
| Transición | `src/game/transition.js` | **Módulo sustituible entero.** Contrato único: `run(build)` tapa la escena, llama a `build()` y destapa. Nada más del motor sabe qué forma tiene. |
| React | `src/App.jsx`, `src/ui/` | Sólo conoce la *fase* (inicio / juego / pausa / resumen) y el resumen final. |
| HUD | `src/ui/Hud.jsx` | Se actualiza **imperativamente por refs** desde el bucle. Cero `setState` por frame. |
| Cuerpo | `src/game/body.js` | **La única forma de figura humana**: la usan las dianas y el avatar. |
| Avatar | `src/game/avatar.js` | El cuerpo del jugador, tintado con su equipo. Geometría, sin lógica. |
| Grilla | `src/game/grid.js` | Generador de líneas. Lo usan la sala **y** la piel del avatar. |
| Jugador | `src/game/player.js` | Vida, escudo, casco, reaparición y **dónde te han dado**. |
| Fuego enemigo | `src/game/enemyFire.js` | Los muñecos disparando: visión, reacción, cadencia y cono. Y **publica en qué fase está cada uno**. |
| Marcadores | `src/game/markers.js` | Brújula, iconos `?` / `!` y ficha arma+nick sobre cada muñeco. Sólo dibuja. |
| Fogonazo | `src/game/muzzleFlash.js` | El destello de cada disparo enemigo. Pool de estrellas aditivas; sólo dibuja. |
| Recogibles | `src/game/pickups.js` | Cruces de vida, cargas de escudo y casco por el suelo. |
| Música | `src/audio/music.js` | Ambiente de menús, generado. Su propio volumen. |
| Config | `src/config.js` | Todo el tuning, sin excepción. |
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
cambio que se acerque a 1 ms es una regresión aunque "se vea bien".

**El tiempo del juego no puede depender de cuándo dibuja el monitor.** Se aplica
en dos sitios y vale para cualquier mecánica temporizada que se añada:

- *Cadencia y recoil*: `_nextShotAt` se calcula desde el instante en que el
  disparo **tocaba**, no desde `performance.now()` del frame que lo ejecuta. Sin
  esto un arma de 600 RPM dispara distinto a 60 que a 240 Hz.
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

**La excepción del refresco, aceptada y medida.** El vector es una integración y
no tiene forma cerrada, porque la entrada es el ratón. Medido con un jugador que
gira sin parar y encadena durante 4 s: **1.38%** de diferencia entre 60 y 240 Hz.
De eso, **0.57 puntos ya existían** con el modelo escalar en el mismo banco: el
contacto con el suelo entre saltos se cuantiza al frame y a 60 Hz se vuela 75 ms
menos. Lo que añade el vector es el resto. Dos cosas que **sí** se arreglaron
porque eran cuantización evitable: el frame del despegue no aceleraba (se corrige
pasando `dt` a `_takeOff`) y el del aterrizaje aceleraba de más (se acota al
tiempo que queda de vuelo, `_airTimeLeft`, de la misma parábola cerrada que el
resto). Subdividir la integración **no** ayuda: medido en simulación, no cambia
ni el cuarto decimal, porque el residuo es que el ratón se muestrea una vez por
frame. Ver `docs/decisions.md` §32.

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
paso ahorra raycasts. Con 69 puntos las pasadas encadenadas repetirían el mismo
raycast varias veces, así que cada elección lleva un **sello** y ningún punto se
mira dos veces: peor caso medido, 33 raycasts y 0.4 ms p99 por aparición.

El sorteo va **sesgado hacia delante**: con `SPAWN.forwardBiasChance` se restringe
a los que caen en el cono de `SPAWN.forwardBiasConeDeg`, medido **sólo en
horizontal** —mirar al suelo no debe dejar de considerar "delante" lo que tienes
delante—. Si no hay ninguno visible en el cono, se cae al conjunto completo:
antes una diana a la espalda que ninguna diana.

**Desde el spawn tiene que verse algo de frente y lejos.** Entre lo que se ve
desde el punto de aparición sale la primera diana de la sesión, y con el sesgo a
0.85 sale del subconjunto que cae en el cono frontal: si ese subconjunto está
vacío, lo primero que ve quien prueba el mapa es una sala vacía. Lo guardan dos
tests (`fixes.mjs` y `live.mjs`) exigiendo **al menos un punto visible dentro del
cono y a `room.width / 4` o más**. Desde el spawn del Plano A se ven 31 de los 69
puntos, con los más lejanos del Balcón a 30 u. Antes del reescalado la divisoria
sellaba el cono y hubo que meter dos anclajes a la fuerza dentro, pegados al
jugador — el porqué, en `docs/decisions.md` §23 y §24.

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
de rutas disjuntas. En el Plano A a 40×40 entran **14 rutas y 69 puntos**. Si
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
- **El silenciador es del arma vigente.** Su interruptor ya no desaparece con un
  arma que no lo admite, porque siempre llevas encima una que sí; lo que cambia
  es el aviso, que dice a cuál se aplica.

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
(tick de 4.166 ms contra objetivo de 4.167 ms).

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

**Una suite sin aserciones no es una prueba, es un informe.** `baja.mjs` imprimía
«se sube en 12/12» y salía en verde pasara lo que pasara; con aserciones de
verdad cazó a la primera una regresión de 12/12 a 0/12. Si un test no puede
fallar, no está guardando nada. (`x8.mjs` sigue siendo un informe a propósito: no
afirma, mide.)

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

---

## 5. Estado actual (resumen)

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
ruta se ven desde donde está el jugador. Con 69 puntos, en el Plano A se llena
casi siempre.

**Escenarios:** variante activable desde opciones, no reemplazo. *Sala vacía*
(Gridshot de siempre, muestreo por cono, 80×80) y **Largo y Puerta**, el primer
escenario con cobertura, en **su propia sala de 40×40**: Espina con una sola
Puerta de 2.5 u, El Largo con tres Media escalonadas, Los Cajones de corta
distancia, el Balcón elevado (+2.6) con **una rampa en cada extremo** y parapeto
con dos troneras de 4 u, y un Vestíbulo con la divisoria entera al este del
spawn —el paso central queda abierto, que es de donde sale la primera diana—.
Veinte piezas, las mismas de siempre: lo que se recortó es el suelo entre ellas.
Cruzarlo en diagonal cuesta **8.1 s** en vez de 16.8. El vocabulario de piezas y
la rampa de grises están en `COVER`; la geometría, en `SCENARIOS`.

**Catorce rutas y 69 puntos**, de 4 a 6 puntos cada una, repartidas por las seis
zonas: El Balcón 4, Los Cajones 3, El Largo 2, Pasillo trasero 2, Vestíbulo 2 y
La Puerta 1. Cualquiera de los 69 es sitio de aparición **y** destino de
patrulla.

Con un escenario montado: el jugador **colisiona** contra las cajas (resuelto un
eje cada vez, con soporte de suelo y rampas), los **disparos se paran en la
cobertura**, y la **distancia de aparición no se aplica**. El **modo dinámico**
sólo mueve a los muñecos *hitbox*, que patrullan por su ruta; clásica y cono se
quedan en su punto, porque un destino aleatorio las metería dentro de un muro.

**Controles reasignables:** un mapa único en `KEYBINDS` con las acciones que
funcionan hoy —movimiento, salto, agachado, caminar, disparar, recargar, cambiar
de arma, silenciador, la contextual **E**, el escudo en la **4**, **1** y **2**
para equipar principal y pistola y, desde la vuelta 41, **TAB** para el
marcador— y las **reservadas sin
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
trayectoria a cualquier refresco—, **salto encadenado** con SPACE dentro de
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

| Arma | Ranura | Modo | RPM | Cargador | Recarga | Supresor |
|---|---|---|---|---|---|---|
| Pulse | secundaria (tecla **2**, siempre) | semi | 500 | 18 | 1200 ms | sí |
| Rift | principal (tecla **1**) | auto | 600 | 30 | 2300 ms | sí |
| Volt | principal (tecla **1**) | auto | 800 | 25 | 1800 ms | sí |

Se llamaban Scalar-2, Axis-7 y Vertex-9 hasta la vuelta 41: el renombrado no tocó
ni una estadística, y un ajuste guardado con el nombre viejo se traduce al nuevo
en vez de caer a fábrica. Cada una trae sus dos siluetas —`<arma>` y
`ghost-<arma>`, con silenciador— y desde esta vuelta **las tres lo admiten**.

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
   Siempre puesta: es orientación pasiva. Y discreta a propósito desde la vuelta
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

**Opciones** (accesibles antes de empezar y desde la pausa, persistidas):
escenario, sensibilidad, tipo de diana, **arma principal** (sólo Rift y
Volt: la pistola se lleva siempre y no se elige), **duración de Deathmatch**
(sin límite / 3 / 5 / 10 minutos), tamaño de diana, distancia de spawn, cadencia
de aparición, dianas simultáneas, límite de FPS, supresor (sólo si el arma lo
admite), **audio espacial**, mensajes de ayuda, **dificultad de los muñecos**,
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

Backend, cuentas, guardado en la nube, rankings, minimapa, pasos sonoros. Si el
encargo no lo pide explícitamente, no se añade.

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
