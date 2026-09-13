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
  (`src/audio/sfx.js`): osciladores + un buffer de ruido pregenerado. No hay
  ficheros de sonido en el repositorio ni los habrá.
- **Siluetas de armas, logotipo e iconos:** vectorizados con `potrace` a partir de
  `Reference/Weapons/`, `Reference/Logo/` y `Reference/Icons/` mediante los
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
| Explosivo | `src/game/objective.js` | Aparición, cuenta atrás, pitido y desactivación. No publica nada al HUD a propósito. |
| Puntuación | `src/game/scoring.js` | Variables normalizadas, media ponderada y estrellas. |
| Transición | `src/game/transition.js` | **Módulo sustituible entero.** Contrato único: `run(build)` tapa la escena, llama a `build()` y destapa. Nada más del motor sabe qué forma tiene. |
| React | `src/App.jsx`, `src/ui/` | Sólo conoce la *fase* (inicio / juego / pausa / resumen) y el resumen final. |
| HUD | `src/ui/Hud.jsx` | Se actualiza **imperativamente por refs** desde el bucle. Cero `setState` por frame. |
| Avatar | `src/game/avatar.js` | Modelo humanoide del jugador. Geometría, sin lógica. |
| Grilla | `src/game/grid.js` | Generador de líneas. Lo usan la sala **y** la piel del avatar. |
| Jugador | `src/game/player.js` | Vida, escudo, casco, reaparición y **dónde te han dado**. |
| Fuego enemigo | `src/game/enemyFire.js` | Los muñecos disparando: visión, reacción, cadencia y cono. Y **publica en qué fase está cada uno**. |
| Marcadores | `src/game/markers.js` | Brújula e iconos `?` / `!` sobre cada muñeco. Sólo dibuja; no decide nada. |
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

**Y un marcador de mundo deja de encoger a partir de cierta distancia.** Más allá
de `MARKERS.referenceDistance` escala **con** la distancia, así que conserva su
tamaño en pantalla, con tope. Sin eso, a 30 u —el largo del Plano A— un icono son
cuatro píxeles, y lo que no se ve no se cuenta.

**Hay dos colores nuevos y ninguno reutiliza los que ya significan algo.** El `?`
es amarillo limón (`COLORS.alert`) y **no** el ámbar del explosivo; el `!` es rojo
puro (`COLORS.threat`) y **no** el naranja de las dianas — un aviso que se dibuja
encima de un muñeco naranja no puede ser naranja. La brújula es **blanca, y salió
de medir**: seis candidatos contra el fondo real del Plano A, contraste WCAG
píxel a píxel sobre el fondo que le toca a cada uno. Blanco da 10.7 de contraste
medio y 2.58 en el peor decil; el siguiente, 2.14. Los cianes pierden porque la
cobertura del mapa es gris media y ahí se apagan. Ver `docs/decisions.md` §37.

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

**El avatar comparte anatomía con el muñeco de puntería, y proporciones con las
referencias.** La **altura** y las tres zonas salen de `TARGET_TYPES.hitbox.parts`
—el modelo del jugador *es* la representación visual del sistema de zonas que ya
existe—; la **forma** sale de `AVATAR.figure`, medido barriendo siluetas fila a
fila. Todo en fracciones de la altura total, de modo que las proporciones aguantan
aunque el muñeco cambie de tamaño.

**Son dos referencias y cada una pone lo suyo.** `player-avatar-style.png` es una
vista frontal: de ahí salen `levels`, `widths`, `armX`, `legX` y el recorrido de
las líneas. `player-avatar-turnaround.png` trae seis vistas del mismo diseño
—frontal, dos perfiles, posterior, cenital e inferior— y de sus perfiles sale
`depths`. **De frente no hay profundidad que medir**, así que hasta la vuelta 36
`depths` eran siete multiplicadores sobre el ancho y era lo único de `figure` que
no salía de una imagen.

**El fondo del torso es casi constante; el ancho no.** De pecho a cadera el fondo
va de 0.134 a 0.122 mientras el ancho hace el reloj de arena de 0.202 a 0.134 y
vuelve a 0.195. Un multiplicador único no puede dar las dos cosas, y por eso la
cintura salía plana y la cadera hinchada. Ése es el motivo de que `depths` esté
ahora en las **mismas unidades que `widths`** —fracciones de la altura, clave a
clave— y no en factores.

**El brazo es la excepción, y está marcada.** De perfil cuelga por delante del
torso y no hay **ni una fila** en la que sea él quien pone la silueta: ni umbral
ni relleno lo separan. Sus fondos salen de la única pieza del brazo que sí se
mide —la hombrera— y se afinan hasta la muñeca. Da igual de cara al banco:
metido dentro del contorno del torso, un error de fondo en el brazo no se ve ni
de frente ni de perfil.

Las referencias **no se vectorizan**: son guías para reconstruir la geometría, como
el blockout de los escenarios. Lo que hay que respetar de ellas son las
proporciones y las dos líneas continuas, no el número de facetas.

**Todo el cuerpo es un solo primitivo: el prisma de anillos.** Un anillo es un
corte horizontal —altura, ancho, fondo y desplazamiento— y una pieza es la lista
de sus cortes. De ahí salen las tres cosas que las cajas no podían dar:

- **Extremidades que se afinan.** El brazo mide 0.036 de la altura en el hombro y
  0.028 antes del codo; el muslo, 0.086 en la cadera y 0.058 antes de la rodilla.
  Son anillos de una misma pieza, no dos cajas de grosor distinto.
- **Articulaciones que envuelven la junta.** Hombro, codo, cadera y rodilla son
  piezas estrecha-ancha-estrecha cuyos extremos **entran dentro** de los dos
  tramos que unen. En la referencia el codo mide 0.059 contra los 0.028 del brazo
  justo encima: la articulación **es** ese ensanchamiento.
- **Secciones de más de cuatro caras**: ocho en el tronco, seis en extremidades y
  cabeza. Una caja tiene cuatro siluetas posibles.

**Con los vértices a medio paso, seis caras tienen vértice al frente y ocho
tienen cara.** No es un detalle de implementación: es lo que decide dónde se
apoya una línea de luz y si una puntera sale en filo. La hombrera pasó a ocho
porque la vista cenital la enseña por arriba y con seis era una tapa lisa; el pie
pasó a ocho porque con cuatro la bota entera se leía como una cuña de cartón.

**Tres piezas tienen detalle propio, y cada una porque hay una vista que la
enseña.** La hombrera son dos piezas por lado —casquete y alerón volado—; la bota
son cuatro —caña, pie, suela y talón—; la mano son seis —palma y cinco dedos de
largos distintos, con el pulgar por delante—. Lo de la bota no es capricho: **un
anillo tiene un solo ancho a cada altura**, así que un talón estrecho detrás y un
antepié ancho delante no caben en la misma pieza.

Dos cosas que no son evidentes y que salieron de comparar siluetas a la misma
altura, no de mirar el modelo:

- **El eje de cada pierna no es vertical**: se abre de 0.069 a 0.100 de la cadera
  a la suela (`figure.legX`). Las pantorrillas salían un 25% estrechas y no era
  el grosor, era que las dos piernas estaban demasiado juntas.
- **El tramo de una extremidad tiene que llegar hasta dentro de su
  articulación.** Cortarlo en su anillo más estrecho deja un dedo de aire entre
  el brazo y el codo que desde lejos parece un modelo roto.

**Tres canales, y sólo uno es personalizable:**

- **Piel.** Paneles negros con **la misma grilla del suelo y las paredes** encima.
  No es una textura ni una imagen: es el generador de `grid.js`, el mismo que
  monta la sala, a paso de cuerpo (`AVATAR.gridStep`) en vez de a paso de sala.
  Es la skin de serie, y es lo único que cambia `setColor()`.
- **Luz.** **Cuatro líneas continuas** de la coronilla a las botas: el par de
  delante y **su espejo por la espalda**, más el núcleo del pecho. Canal **fijo**,
  y el día que haya equipos es el que llevará su color — por eso `setColor()` no
  lo toca y por eso va también por detrás: a un rival se le reconoce igual
  persiguiéndolo que de frente.

  **La línea va dentro de un canal, no encima de la piel.** Y el canal se
  levanta, no se resta: con piezas opacas y sin CSG, una hendidura tallada en un
  prisma sigue tapada por la propia cara del prisma y no se ve. Son dos labios a
  los lados del recorrido (`AVATAR.lightChannel`) y la barra al fondo, con su
  cara exterior a ras de cuerpo. Los labios llevan arista como cualquier pieza
  —por eso se fusionan **antes** que los filos, para no ser un cuarto objeto de
  líneas— y **no los toca `setColor()`**: son pared del canal de luz, no piel.

  **Y cada punto se apoya en la cara, no en la profundidad máxima.** Media
  profundidad del anillo sólo es la superficie si el punto cae en la cara
  frontal; en la cadera la línea pasa a 0.062 del eje, que en un prisma de ocho
  ya es la diagonal de al lado, y allí flotaba. `surfaceZ` devuelve el contorno
  **en esa x**, y la x se mide respecto al eje de la pieza: por la pierna la
  línea baja pegada al muslo, no a 0.080 del centro del cuerpo.

  Su recorrido está medido como los anchos (`AVATAR.stripSpread`), y tiene una
  forma que no se adivina: **se abren en el collar (0.056), se cierran en el
  ombligo (0.035) y a partir de ahí sólo se separan** hasta la bota. Con tres
  valores interpolados salía al revés y el pecho se leía como una X. Se localizan
  en la referencia por tono: son el único azul saturado de la imagen.

  Y cada punto de la cadena lleva la **media profundidad de la pieza sobre la que
  va montado**, que es lo único que mantiene la línea pegada al cuerpo: a media
  profundidad del modelo, en las rodillas —que sobresalen— se metía dentro y la
  línea desaparecía justo en la articulación.
- **Aristas.** El filo de cada panel, un gris por encima del de la grilla. El
  umbral de arista va alto a propósito: entre anillo y anillo de un mismo tramo
  el giro es de pocos grados y no debe salir una raya, o el afinado continuo se
  leería como una pila de rodajas.

Y **sin texturas, porque en esta escena no hay ni una luz**: todo se dibuja con
materiales planos. Con la piel en negro el tono ya no separa nada —multiplicar
negro por 0.62 sigue siendo negro—, así que el volumen entero lo dibujan las
aristas y la rejilla.

Tres detalles que costaron una pasada cada uno: las líneas de grilla, aristas y
luz se **fusionan** en tres objetos para todo el cuerpo —con una rejilla por cara
serían cientos, y en multijugador habrá varios avatares—; la rejilla se **mide**
por el anillo estrecho de cada tramo pero se **coloca** sobre el plano de la cara
—al revés se queda dentro de la pieza y no se ve ni una línea—; y el giro de las
caras laterales del prisma hacia fuera, porque con `FrontSide` una cara al revés
no se dibuja y el modelo sale hueco.

**La comparación con la referencia se mide, no se mira, y ahora por dos vistas.**
`silueta.mjs` renderiza el avatar con la sala apagada y sus piezas en blanco
—sobre negro, la piel es más oscura que la rejilla de la sala y ninguna
umbralización las separa— y `comparar.mjs` pone las dos siluetas a la misma altura
en píxeles y lista la desviación nivel a nivel. `comparar.mjs frente` mide contra
la referencia de estilo y `comparar.mjs perfil` contra la media de las dos vistas
laterales del turnaround. Resultado: **16% en el peor nivel de frente** (30 de 32
dentro del 8%) y **12% de perfil** (28 de 32).

Tres trampas de medida, las tres de las que no avisan:

- **La cámara tiene que ser casi ortográfica.** A 2.4 u de un cuerpo de 1.8 la
  pierna cercana sale un 16% más grande que la otra, y la puntera de la bota
  —que asoma 0.13 por delante y está 0.8 por debajo del eje de cámara— se
  proyecta sobre las filas del tobillo y las engorda un 30%. La referencia es un
  dibujo ortográfico; para compararse con ella hay que mirar como ella: cámara a
  30 u y campo de 4.4°.
- **El canal de luz no es cuerpo.** Dejando puestas las barras y sus labios, la
  silueta de perfil de la pierna engordaba un 25% y se estaba midiendo el canal,
  no el gemelo. `silueta.mjs` los apaga, igual que el núcleo.
- **En el turnaround el cuerpo es casi negro por dentro** (r 0-8, lo mismo que el
  fondo del panel): el canal rojo no separa cuerpo de fondo, sólo contorno de
  fondo. Lo que vale es `r > 22 || g > 32` con lo azul fuera, porque el charco de
  luz reflejado bajo las botas pasa por contorno en brillo y lo delata el tono. Y
  las cuatro vistas **no están a la misma escala** —hay un 3% entre la frontal y
  las de perfil—, así que cada una se normaliza por su propia altura.

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

**Hay teclas reservadas sin lógica, y es a propósito.** 1, 2, 3 y 5 para equipar
y G para el arrojadizo —la 4 dejó de estarlo en la vuelta 34, con el escudo—. El
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
traer la suya**: el Plano A vive en **40×40×10**. Sesión de **30 s** por
defecto, más **PRÁCTICA LIBRE ∞** sin límite de tiempo con finalización manual.

**Dianas:** tres tipos — *clásica* y *cono* (ancladas al centro, esfera), e
*hitbox completo* (anclado a los pies, tres zonas con **vida compartida** y daño
por zona: cabeza 100 / torso 50 / piernas 34; cono de aparición más ancho y
distancia variable por muñeco). Modo dinámico opcional: destino aleatorio a
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
de arma, silenciador, la contextual **E** y el escudo en la **4**— y las
**reservadas sin lógica**: 1, 2, 3 y 5 para equipar principal / pistola / cuerpo
a cuerpo / artilugio, y **G** para el arrojadizo. Sección **Controles** en opciones: tecla actual, reasignar
capturando la siguiente pulsación, botón por acción y por lo general.
Persistido en `aimcore.keybinds.v1` con saneado. **Escape queda fuera del
sistema** y el panel lo dice.

**Música de menús:** ambiente generado en tiempo real (`src/audio/music.js`),
con su propio volumen en opciones. Suena en inicio, opciones y pausa; se calla al
jugar.

**Avatar del jugador (sólo visual):** humanoide de cuarenta y dos piezas con la
anatomía del hitbox, facetas planas y costuras eléctricas **metidas en su canal**.
Ancho medido de frente y **fondo medido de perfil**; hombreras de varias facetas,
botas de cuatro piezas y manos con cinco dedos. Color en una variable. **F3** abre
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

| Arma | Modo | RPM | Cargador | Recarga | Supresor |
|---|---|---|---|---|---|
| Scalar-2 | semi | 500 | 18 | 1200 ms | sí |
| Axis-7 | auto | 600 | 30 | 2300 ms | no |
| Vertex-9 | auto | 800 | 25 | 1800 ms | sí |

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
mira, y abatido sale en el centro lo que falta para reaparecer. Además, la
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
`WEAPONS`, hoy la Axis-7— apuntando al centro del cuerpo del jugador con el cono
de la dificultad. Dispara en ráfagas de cuatro con pausa, y el disparo se resuelve
contra las **tres zonas del jugador**, que son las del hitbox.

**Dificultad en el panel:** Fácil (15°, 900 ms), Normal (9°, 650 — lo de siempre)
y Difícil (5°, 400). Un nivel fija los dos números; ver convenciones. La velocidad
de movimiento no entra ahí a propósito: ya es el ajuste `patrolSpeed`.

**Marcadores sobre cada muñeco (mismo sitio que el fuego enemigo):** una
**brújula** blanca paralela al suelo que gira en yaw hacia donde mira el muñeco
—siempre, es orientación pasiva— y, por encima, un icono situacional: `?` amarillo
mientras te ha visto y aún no dispara, `!` rojo mientras te dispara, uno por
muñeco, para contar amenazas de un vistazo. Se apagan al perder contacto o al
caer. Medido contra el Plano A: de 10.390 pares puesto×punto con la cabeza a la
vista, la cobertura tapa la brújula en **4** (0.04%).

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
escenario, sensibilidad, tipo de diana, arma, tamaño de diana, distancia de spawn, cadencia
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

**Lo que sí sigue reservado son cinco teclas de equipo** (1, 2, 3, 5 y G): tienen
bind y no tienen lógica. La 4 dejó de estarlo al llegar el escudo.

---

## 7. Historia y porqués

`docs/decisions.md` guarda el histórico completo: cada decisión de diseño
relevante, su razonamiento y las alternativas descartadas. No se carga en cada
sesión — consúltalo cuando necesites saber **por qué** algo está como está antes
de cambiarlo.
