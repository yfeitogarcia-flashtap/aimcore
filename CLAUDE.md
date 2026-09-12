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
- **Siluetas de armas:** vectorizadas con `potrace` a partir de las imágenes de
  `Reference/Weapons/` mediante el script *one-off* `npm run trace:weapons`, que
  emite `src/ui/weaponPaths.js`. Las PNG de referencia **nunca** entran en el
  build: son material de trazado, no assets. Verifica que no aparezcan en
  `dist/` si tocas esa zona.
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
| Config | `src/config.js` | Todo el tuning, sin excepción. |
| Ajustes | `src/settings.js` | Store + persistencia en localStorage + saneado. |

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
encadenar. Como `_airSpeed` sólo puede nacer de `currentSpeed`, que nunca pasa
de `MOVEMENT.speed`, por inducción **ninguna cadena puede acelerar** por encima
de la marcha de carrera. Y la pulsación se **gasta** al despegar, así que dejar
SPACE apoyada sigue rebotando con saltos normales: encadenar es acertar el
tiempo, no apoyar la tecla.

Los dos extremos de la ventana se miden en tiempo real: la pulsación sale de
`event.timeStamp` (no del frame que la atiende) y el aterrizaje, de despejar la
parábola —`t = (v0 + velocidadDeImpacto) / g`— en lugar del frame que lo detecta,
que llega hasta un frame tarde. Medido: el umbral sale en 130.00 ms a 60, 144 y
240 Hz, con una diferencia de 0.000 ms entre ellos.

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

**Tres preferencias encadenadas al elegir dónde nace una diana**, en este orden,
porque cada una puede quedarse sin candidatos: (1) **delante**, el sesgo de
siempre; (2) **rutas libres**, sin otro muñeco patrullando ya por ellas; (3)
**nunca donde caíste** — el punto donde murió ese mismo muñeco queda descartado,
y es regla dura: si no hay otro sitio no se aparece y se reintenta, antes que
reaparecer bajo el punto de mira. El sesgo manda sobre la preferencia de ruta, no
al revés: dentro del cono caben 2-5 rutas y con cinco muñecos vivos no siempre
hay una libre delante — medido, se reparte el 42% de las veces con el sesgo
puesto y el **100%** con el sesgo apagado.

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
variables.** Es lo que hace que una variable a peso 0 sea de verdad inerte:
`damage` y `deaths` están en la fórmula y se calculan, pero no arrastran la nota
hasta que se les dé peso. Detonar **no puntúa**: es "Fallido", no 1★.

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

**Movimiento:** WASD, tres marchas (correr / SHIFT andar / **C** agachado —CTRL
no, ver convenciones—, gana la más lenta), salto sin doble salto **resuelto en forma cerrada** —misma
trayectoria a cualquier refresco—, **salto encadenado** con SPACE dentro de
`MOVEMENT.chainJumpWindowMs` (130 ms a cada lado del aterrizaje exacto), que
conserva la marcha del aterrizaje sin poder acelerar por encima de la de
carrera, límites reales de la sala con margen de seguridad. Por encima de `ACCURACY.speedThreshold` y
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

**HUD:** aciertos, fallos, precisión y tiempo arriba (∞ en práctica libre);
contador de FPS en la esquina y, **justo debajo, un engranaje con la palabra
ESC** —contorno gris sin relleno, calculado como la estrella y no pegado como un
`d` a mano— que es la única pista en pantalla de dónde están las opciones ahora
que no hay tablero; y **bajo la mira**, centrado, el bloque de arma en
**una sola fila** —silueta a un lado, munición actual/máximo al otro, con
parpadeo en reserva baja—, con el nombre del arma como rótulo secundario debajo,
más el indicador de recarga y los mensajes de ayuda.

**Audio espacial:** interruptor en opciones, activado por defecto. Los sonidos
posicionados suenan con dirección (listener en la cámara, `PositionalAudio` en el
mundo). Desactivado, se cae a volumen por proximidad sin dirección. Hoy lo usa el
pitido del explosivo; el módulo es genérico para pasos y rivales.

**Explosivo (sólo con escenario y cronómetro, nunca en práctica libre):** aparece
en uno de cinco sitios curados del Plano A —uno por zona, ninguno en el
Vestíbulo—, marcador de octaedro ámbar parpadeante, 45 s de cuenta atrás que
**son el reloj de la sesión**. Se desactiva manteniendo **E** a menos de 3 u
durante 3 s; soltar cancela el progreso sin penalización. Desactivarlo y que
detone terminan la sesión, y el resumen dice cuál de las dos.

**Puntuación por estrellas (1-5, sólo con escenario):** precisión y tiempo a peso
0.5 cada una —la precisión, **normalizada contra el `precisionTarget` del
arma**—; daño recibido y muertes **reservadas a peso 0**, ya con su hueco en la
fórmula. Cortes en `SCORING.starThresholds`. El HUD las enseña **en vivo**, y
bajan solas con el paso del tiempo porque el tiempo es la mitad de la nota.

**Selector de escenario:** plano cenital por escenario dibujado desde los datos,
más la ficha —entrena / riesgo / rejugabilidad— del que esté elegido. Al cambiar,
una transición corta tapa el montaje. Los planos van en **rejilla de columna
fija** (140 px de plano, la mitad que cuando se repartían el ancho entre dos): el
selector crece en filas con cada escenario nuevo en vez de encoger los que ya
estaban.

**Opciones** (accesibles antes de empezar y desde la pausa, persistidas):
escenario, sensibilidad, tipo de diana, arma, tamaño de diana, distancia de spawn, cadencia
de aparición, dianas simultáneas, límite de FPS, supresor (sólo si el arma lo
admite), **audio espacial**, mensajes de ayuda, modo dinámico y **velocidad de
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

**Mecánicas reservadas, con el hueco ya hecho:** daño recibido y
muertes/reinicios tienen su peso en `SCORING.weights` (a 0) y su parte calculada
en `scoring.js`. Implementarlas es darles peso; no hace falta tocar la fórmula.

---

## 7. Historia y porqués

`docs/decisions.md` guarda el histórico completo: cada decisión de diseño
relevante, su razonamiento y las alternativas descartadas. No se carga en cada
sesión — consúltalo cuando necesites saber **por qué** algo está como está antes
de cambiarlo.
