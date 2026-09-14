# Historial de decisiones — Vektor by FlickLAB

Este documento recoge **por qué** el proyecto es como es: las decisiones de
diseño e implementación relevantes, el razonamiento detrás de cada una y las
alternativas que se descartaron. No pretende ser un registro línea a línea del
código; pretende evitar que una sesión futura deshaga por ignorancia algo que se
eligió a conciencia.

No se carga en cada sesión. Es material de consulta profunda, y puede crecer sin
límite. El contexto de arranque, corto y operativo, vive en `CLAUDE.md`.

**Cómo leerlo:** está ordenado cronológicamente por rondas de trabajo, porque
muchas decisiones sólo se entienden como reacción a la anterior. Si buscas un
tema concreto, el índice de abajo apunta al apartado donde se decidió.

---

## Índice temático

- Arquitectura y rendimiento → §1.2, §1.3, §1.4, §9.1
- Audio sintetizado → §1.5
- Input y Pointer Lock → §1.6
- Movimiento del jugador → §2, §8.1, §12.3
- Dianas y tipos de diana → §3.2, §4.1, §5.1
- Hitbox y vida compartida → §3.3
- Persistencia y saneado de ajustes → §3.4, §9.3
- Spawn: cono, separación, distancia → §3.5, §5.1, §5.2, §6.1
- Modo dinámico → §4.2, §5.2
- Armas, recoil y cadencia → §7
- Dispersión por movimiento → §8.2
- Límite de FPS y contador → §9.1, §9.2
- Cargador, recarga y supresor → §10.1, §10.3, §12.1
- Siluetas de armas → §10.4, §11.1, §12.4
- Panel de acciones en 3D → §11.2
- Práctica libre → §12.2
- Marca y nomenclatura → §6.2
- Bugs con enseñanza duradera → §13

---

## Ronda 1 — El prototipo Gridshot

**Encargo:** validar puntería, rendimiento y *feel* antes de cualquier backend.
Estética negra con rejilla, dianas naranjas, sin menú de ajustes, sin armas ni
manos en pantalla.

### 1.1 Por qué no hay backend

La pregunta que el prototipo tiene que responder es "¿se siente bien apuntar
aquí?". Esa pregunta no necesita cuentas, ni persistencia en servidor, ni
telemetría. Meter Supabase en la fase 1 habría añadido latencia de decisión
(esquemas, auth, entornos) a cambio de cero información sobre el *feel*.

*Descartado:* guardar sesiones en la nube desde el principio "para tener datos".
Los datos de un prototipo que aún cambia de mecánicas cada semana no son
comparables entre sí, así que no valen para nada.

### 1.2 El motor vive fuera de React

React gestiona **fases** (inicio, juego, pausa, resumen) y el resumen final.
Nada más. El bucle de juego, el input, el raycast y las dianas viven en
`src/game/`, ajenos al árbol de componentes.

El motivo es directo: un `setState` por frame a 240 Hz son 240 reconciliaciones
por segundo para actualizar tres números. React no está pensado para eso y el
coste aparece exactamente donde más duele, en el frame.

*Descartado:* `react-three-fiber`. Es excelente para escenas declarativas, pero
aquí la escena es casi estática (una rejilla y N dianas de un pool) y el valor
está en controlar el bucle al detalle. La capa declarativa habría sido peso sin
contrapartida.

### 1.3 El HUD se actualiza por refs, no por estado

`Hud.jsx` se monta una vez y expone refs; el bucle escribe `textContent`
directamente. Cero renders por frame.

Es deliberadamente "poco idiomático" y está documentado como tal para que nadie
lo "arregle" en una limpieza futura. La alternativa idiomática es exactamente el
problema que §1.2 evita.

### 1.4 Bucle sin asignaciones

Vectores temporales a nivel de módulo, pool fijo de dianas, geometrías
reutilizadas por tipo, y un `THREE.Vector2(0, 0)` constante para el raycast
desde el centro de pantalla (que es siempre el mismo punto: no hay ratón libre
bajo Pointer Lock).

El objetivo no es micro-optimizar: es que el recolector de basura no se
despierte a mitad de una racha. Un *stutter* de 8 ms en un aim trainer es un
fallo de producto, no una molestia.

### 1.5 Audio sintetizado, sin ficheros

Osciladores y un buffer de ruido pregenerado una sola vez, en `src/audio/sfx.js`.

Tres razones, en orden de peso: (1) el encargo lo pedía explícitamente; (2) el
repositorio se mantiene sin assets binarios, lo que hace que los diffs sean
legibles y el clon barato; (3) sintetizar permite parametrizar el sonido —
variar tono, ataque y filtrado— sin volver a grabar nada. El sonido del supresor
(§10.3) salió gratis gracias a esto.

El buffer de ruido se genera una vez y se reutiliza: regenerarlo por disparo
sería asignar cientos de kilobytes en el bucle caliente.

### 1.6 Pointer Lock con `unadjustedMovement: true`

Se pide entrada cruda, saltándose la aceleración del sistema operativo. En un
aim trainer, la aceleración del ratón es ruido: invalida la memoria muscular que
el jugador está intentando construir.

La sensibilidad se expresa en **grados por cuenta** (`degreesPerCount: 0.022`,
la convención de Source), de forma que un valor de sensibilidad se pueda
comparar directamente con el de otros juegos. Era eso o inventar una escala
propia que no significara nada fuera de Vektor.

### 1.7 El color del punto de mira es una constante

Pedido explícitamente, pero coincide con el criterio general: todos los colores
viven en `COLORS` dentro de `config.js`. Ningún literal hexadecimal suelto en un
componente.

---

## Ronda 2 — Movimiento del jugador

**Encargo:** añadir movimiento como variante activable, sin sustituir al
Gridshot estático.

### 2.1 Variante, no reemplazo

`MOVEMENT.enabled` conmuta el sistema entero. El Gridshot estático sigue siendo
un escenario válido y una referencia de rendimiento limpia: si algo se pone
lento, poder desactivar el movimiento aísla la causa.

### 2.2 El cono de spawn se recalcula pero no rota

El origen del cono de aparición se recalcula desde la posición actual del
jugador, pero su **dirección permanece fija**. No sigue a la mirada, ni al
salto, ni al agachado.

Esto es lo que separa un aim trainer de un shooter: si el cono siguiera la
mirada, las dianas aparecerían siempre delante del punto de mira y el
entrenamiento de adquisición de objetivo desaparecería. Si siguiera el salto,
saltar cambiaría la dificultad de forma incontrolada.

*Descartado:* cono anclado a una coordenada absoluta de la sala. Con el jugador
moviéndose, las dianas habrían acabado a su espalda.

### 2.3 CTRL **y** C para agacharse

`MOVEMENT.keys.crouch` incluye `KeyC` además de `ControlLeft` por una razón
prosaica y no negociable: **Ctrl+W cierra la pestaña en Chrome**. Un jugador
agachado que intente andar hacia delante pierde la sesión. `KeyC` es la vía de
escape.

### 2.4 Transición suave de altura

`crouchTransitionSpeed` interpola la altura de cámara en lugar de saltar entre
1.7 y 1.05. El salto instantáneo se lee como un glitch y, peor, cambia el ángulo
de tiro de golpe.

---

## Ronda 3 — Opciones, tipos de diana y hitbox

### 3.1 Por qué un panel de opciones ahora

La fase 1 lo prohibía a propósito (menos superficie, más foco). En cuanto
hubo tres variables que un jugador querría cambiar entre sesiones —
sensibilidad, tamaño, distancia — mantenerlas en código convertía cada prueba
en una edición de fuente. El coste de no tener panel superó al de tenerlo.

### 3.2 Tres tipos de diana

*Clásica* y *cono* comparten geometría (esfera) y anclaje (centro), y se
diferencian en la distribución del spawn. *Hitbox completo* es un muñeco de tres
zonas anclado a los pies.

Mantener clásica y cono como tipos separados aunque compartan geometría permite
que evolucionen por separado sin refactor.

### 3.3 Hitbox: vida compartida, daño por zona

**La decisión no obvia de esta ronda.** Las tres zonas (cabeza, torso, piernas)
comparten un **único contador de vida** de 100 HP; lo que cambia por zona es el
**daño**: cabeza 100, torso 50, piernas 34.

El razonamiento: lo que se quiere entrenar es *dónde* aciertas, no *cuántas
veces* aciertas en un sitio concreto. Con vida por zona, vaciar el cargador en
las piernas mataría una pierna y dejaría el muñeco en pie — que es realismo mal
entendido y pésimo entrenamiento. Con vida compartida, los números salen
redondos y legibles: 1 tiro a la cabeza, 2 al torso, 3 a las piernas. El jugador
aprende la jerarquía de zonas sin leer un manual.

Los 34 de piernas no son un 33 redondeado por capricho: con 33 harían falta
cuatro tiros (33×3 = 99 < 100), lo que rompe la progresión 1-2-3 que hace el
sistema legible de un vistazo.

*Descartado:* vida independiente por zona (ver arriba). *Descartado:*
multiplicadores de daño sobre un arma con daño base — habría acoplado el sistema
de dianas al de armas, que en esa ronda ni existía.

### 3.4 Saneado estricto de ajustes

`sanitizeSettings()` parte de los valores por defecto y sólo copia claves
conocidas y válidas: numéricos acotados a su rango, booleanos comprobados por
tipo, enumerados contra un catálogo.

La razón es que localStorage es entrada **no confiable**: lo edita el usuario,
lo corrompe una extensión, y sobre todo lo deja obsoleto una versión anterior de
la propia aplicación. Un `spawnDistance` de `"abc"` o un `targetType` que ya no
existe no pueden llegar al motor.

Efecto secundario buscado: las claves obsoletas se limpian solas en el siguiente
guardado (así desapareció `accumulative` en la ronda 9).

*Descartado:* versionar el esquema y migrar. Para un prototipo con once ajustes,
el saneado por catálogo da el mismo resultado con una fracción del código.

`STORAGE_KEY` se quedó en `aimcore.settings.v1` incluso tras el renombrado a
Vektor (§6.2): cambiar la clave habría borrado los ajustes de quien ya estaba
jugando, a cambio de nada visible.

### 3.5 Muestreo por rechazo para el spawn

Las posiciones se generan con muestreo por rechazo dentro del cono, con un tope
de intentos (`maxSampleAttempts: 32`) y una separación angular mínima entre
dianas simultáneas (`minAngularSeparationDeg: 9`).

El tope de intentos es innegociable: sin él, una configuración imposible (cono
estrecho, muchas dianas, separación alta) cuelga el bucle. Con tope, el peor
caso es una diana algo peor colocada en un frame.

*Descartado:* resolver la distribución analíticamente. Es viable para un cono
vacío, pero no con la restricción de separación mutua; el rechazo maneja ambas
cosas con veinte líneas.

---

## Ronda 4 — Hitbox en el suelo y modo dinámico

### 4.1 El hitbox se ancla a los pies

Un muñeco flotando a media altura es incoherente: representa a una persona. Se
ancla a los pies, su Y se mide **desde el suelo** y no desde el cono vertical, y
el control de distancia afecta sólo a X/Z.

Esto obligó a introducir el concepto de **anclaje** (`anchor: 'center' | 'feet'`)
en `TARGET_TYPES`, en lugar de tratar el hitbox como un caso especial repartido
por el código. El anclaje es ahora un dato del tipo de diana, y añadir un cuarto
tipo no requiere tocar la lógica de spawn.

### 4.2 Modo dinámico independiente del acumulativo

Son dos ejes ortogonales: *cuántas* dianas hay a la vez y *si se mueven*.
Fusionarlos en un único "nivel de dificultad" habría impedido entrenar
seguimiento con una sola diana, que es justo el ejercicio más útil de los dos.

El movimiento es a **velocidad constante** hacia un destino aleatorio, sin
aceleración ni suavizado. Un movimiento con easing es más bonito y menos útil:
la velocidad constante es predecible, y entrenar seguimiento requiere que el
jugador pueda predecir.

Clásica y cono se mueven en cualquier eje; el hitbox sólo en X/Z, por coherencia
con §4.1.

---

## Ronda 5 — Abanico del hitbox y destinos sin solape

### 5.1 Cono ancho y distancia variable, sólo para el hitbox

Los muñecos ocupan mucho y a distancia fija se alineaban en una pared plana.
Se les dio cono propio (`HITBOX.spawnConeHalfAngleDeg: 55`), distancia variable
por muñeco (60–140% del *slider*) y una distancia mínima
(`HITBOX.minSpawnDistance: 8`) para que ninguno aparezca en la cara.

El bloque `HITBOX` es independiente de `SPAWN` precisamente para que ajustar el
abanico de los muñecos no toque las dianas esféricas.

### 5.2 Destinos con separación, guardando el mejor candidato

El modo dinámico llevaba las dianas a solaparse. Se reutilizó la comprobación de
separación angular del spawn (§3.5) para los destinos — misma función, no una
copia — con reintentos acotados.

La decisión fina: cuando se agotan los reintentos, **se conserva el mejor
candidato** de los probados en lugar de aceptar el último. El último es
aleatorio; el mejor es el que más separado estaba. Cuesta una comparación por
intento y mejora visiblemente el peor caso.

---

## Ronda 6 — Sala fija y marca

### 6.1 El máximo del *slider* se deriva de la geometría, no se escribe

Con la sala fijada en 80×80, el caso peor del hitbox (140% de la distancia
elegida) podía dejar muñecos pegados a la pared o fuera. En lugar de poner un
máximo a ojo, el tope se **calcula**:
`computeMaxSpawnDistance()` parte del semilado de la sala, descuenta
`WALL_CLEARANCE` (5) y `SPAWN_ANCHOR_MARGIN` (5), y divide por el factor de
escala máximo. Resultado: 21.

Esto es la convención de "fuente única de verdad" en su forma más clara. Si
mañana la sala cambia de tamaño, el *slider* se reajusta solo; un número escrito
a mano se habría quedado obsoleto en silencio y habría dado spawns fuera de la
sala meses después.

Se verificó con 1200 spawns por tipo de diana comprobando la distancia a cada
pared.

### 6.2 De AIMCORE a Vektor

El producto pasó a llamarse **Vektor**, con "by FlickLAB" como línea de crédito
secundaria bajo el logotipo — no como parte del nombre.

El repositorio, el paquete npm y `STORAGE_KEY` **siguen llamándose aimcore** a
propósito. Renombrarlos habría roto los ajustes guardados (§3.4), las URLs de
clonado y la historia de git a cambio de coherencia cosmética. El nombre visible
es el que importa; el identificador interno es un detalle de implementación.

---

## Ronda 7 — Armas

### 7.1 Tres arquetipos, no tres estadísticas

Pulse (semi, 500 RPM, sin apenas recoil), Rift (auto, 600 RPM, recoil
vertical marcado) y Volt (auto, 800 RPM, techo más bajo pero más bamboleo
lateral). Cada una entrena algo distinto: precisión por disparo, control de
patrón vertical, y control de dispersión a alta cadencia.

Pulse es la predeterminada porque es la que menos interfiere con la medida de
la puntería pura: el recoil mínimo hace que un fallo sea del jugador, no del
arma.

*Descartado:* un arma configurable con *sliders* de RPM y recoil. Habría dado
infinitas armas y ningún arquetipo reconocible; parte del valor está en que el
jugador aprenda *una* arma.

### 7.2 El recoil es un desplazamiento de cámara, no de la bala

El patrón se aplica como offset de *pitch*/*yaw* de la cámara, sumado al
movimiento del ratón del jugador. Es decir: el arma mueve la vista, y el jugador
puede compensarla.

Esta es la diferencia entre recoil aprendible y aleatoriedad. Si el recoil
desviara la bala sin mover la vista, no habría nada que entrenar: sería un
impuesto sobre la precisión. Al mover la cámara, el patrón es memorizable y
compensable, que es exactamente la habilidad que el modo quiere ejercitar.

El índice de recoil se acumula por disparo consecutivo y se resetea al soltar el
gatillo o tras `RECOIL_RESET_MS` (200 ms) de pausa. Los 200 ms son el umbral
por debajo del cual una ráfaga se siente como una ráfaga.

### 7.3 La cadencia se mide desde el disparo programado

**El bug más instructivo del proyecto.** Un arma configurada a 100 ms entre
disparos medía 108.7 ms reales.

Causa: `_nextShotAt` se calculaba como `performance.now() + intervalo`, usando el
instante del **frame que renderizó el disparo**. Como los frames llegan
cuantizados por el refresco del monitor, cada disparo arrastraba el redondeo del
anterior y el error se acumulaba.

Arreglo: programar desde el instante en que el disparo **tocaba**, no desde el
frame que lo ejecutó:

```js
const scheduled = now - this._nextShotAt > intervalMs ? now : this._nextShotAt
this._nextShotAt = scheduled + intervalMs
```

Medido después: 98.9 ms. El condicional evita que una pausa larga genere una
ráfaga de disparos "atrasados" al reanudar.

**La lección, aplicable a cualquier mecánica temporizada que se añada:** el
tiempo del juego no puede depender de cuándo dibuja el monitor. Si lo hace, el
mismo arma se comporta distinto a 60 Hz que a 240 Hz, y el prototipo deja de
medir lo que dice medir.

---

## Ronda 8 — Tercera marcha y dispersión

### 8.1 Tres velocidades, gana la más lenta

Correr (6.5), andar con SHIFT (4.2) y agachado (2.6). Si se pulsan SHIFT y CTRL
a la vez, manda el agachado.

`get currentSpeed()` implementa "gana la más lenta" en un único sitio en lugar
de encadenar `if`s en el bucle de movimiento. Añadir una cuarta marcha es añadir
un candidato a la comparación.

### 8.2 Dispersión ligada a la velocidad, no al estado

El umbral `ACCURACY.speedThreshold` se fijó **igual a `walkSpeed` (4.2)**, de
modo que andar es exactamente el límite: andando no hay dispersión, corriendo
sí. No es casualidad ni un número mágico — es una relación que debe mantenerse
si se retocan las velocidades.

En el aire siempre se aplica la dispersión máxima, independientemente de la
velocidad horizontal.

La dispersión desvía la bala con dirección **y** magnitud aleatorias en [0,
`movementSpreadDeg`], y **no mueve la cámara** — al revés que el recoil (§7.2),
y por el mismo razonamiento invertido: la dispersión representa incertidumbre,
no una fuerza compensable. Si el jugador pudiera corregirla, dejaría de ser un
coste por moverse.

Recoil y dispersión son independientes y se suman. Se verificó que la cámara no
se mueve por dispersión ni parada, ni andando, ni agachada, ni corriendo.

---

## Ronda 9 — FPS, límite de frames y multiplicador

### 9.1 Límite por acumulador de delta, no por salto de frames

`_dueThisTick(rafDelta)` acumula el delta y ejecuta un tick cuando supera el
intervalo objetivo, **arrastrando el resto** en lugar de descartarlo.

Saltar frames crudamente (ejecutar uno de cada N) sólo da valores que dividan el
refresco: a 144 Hz se podrían obtener 72 o 48, pero nunca 60. El acumulador da
cualquier objetivo sobre cualquier monitor.

**La tolerancia:** `tolerance = Math.min(1, interval * 0.1)`. Sin ella, un tope
igual al refresco del monitor lo parte por la mitad: el frame llega con 4.166 ms
y el objetivo es 4.1666 ms, así que ningún frame califica y se ejecuta uno de
cada dos. El caso "tope = refresco" es justo el más común (el jugador pone 144
en un monitor de 144), así que el fallo habría sido muy visible.

Verificado en 12 combinaciones de monitor × tope.

### 9.2 Media móvil de FPS con buffer circular

Un contador de FPS instantáneo parpadea y es ilegible. Se usa un buffer circular
con suma incremental: coste constante por frame, sin recorrer el buffer.

Colocación: el bloque de FPS es **hermano** de `.hud`, no hijo. Porque `.hud`
tiene `transform: translateX(-50%)`, y un `position: fixed` dentro de un
ancestro transformado se posiciona respecto a ese ancestro, no al viewport. El
contador se solapaba con "FALLOS".

### 9.3 De "modo acumulativo" a selector x1/x2/x3/x5

El toggle booleano escondía un máximo interno fijo. Se sustituyó por un selector
explícito donde x1 se comporta exactamente igual que el antiguo "desactivado".

Preservar la equivalencia exacta de x1 era la condición: quien tuviera el modo
desactivado no debía notar ningún cambio. La clave `accumulative` desapareció
sola del almacenamiento gracias a §3.4.

---

## Ronda 10 — Cargador, ayudas, supresor y siluetas

### 10.1 Cargador y recarga por tiempo

Munición por arma (18 / 30 / 25) con duraciones de recarga propias (1.2 / 2.3 /
1.8 s). La recarga **no se reinicia ni se apila**: pulsar R durante una recarga
no hace nada. Al completarse, cargador lleno y **índice de recoil a cero** — es
la pausa natural del patrón.

### 10.2 Sistema genérico de mensajes de ayuda

En lugar de colocar un aviso puntual de "pulsa R", se hizo un sistema genérico
con duración configurable y un toggle en opciones. El primer mensaje es el de
recarga, con la munición parpadeando.

El coste de generalizar aquí fue de unas pocas líneas, y evita que el segundo
mensaje que haga falta sea otro caso especial pegado al HUD.

### 10.3 El supresor no afecta al juego

Es un flag por arma (`suppressor`), con toggle en opciones **sólo si el arma lo
admite**, que cambia únicamente el sonido: el perfil silenciado baja el
pasa-banda del transitorio (2100 → 700 Hz, con más Q), acorta su caída y hunde
el cuerpo en grave. Ningún efecto sobre daño, recoil o cadencia.

Deliberado: es una opción de confort. Si diera ventaja, dejaría de ser opcional
en la práctica y todo el mundo la llevaría puesta.

### 10.4 Verde de acción separado del naranja de marca

Los botones de acción primaria usan `#2FCB82`. El naranja `#E4462B` está
reservado a las dianas y el blanco/gris al HUD. Un botón naranja compite
visualmente con una diana, que es lo único que el ojo debe buscar.

### 10.5 Primer intento de siluetas: arquetipos

El encargo pedía trazar las siluetas desde imágenes en `/reference/weapons/`. El
directorio **no existía** en el repositorio; se buscó en todo el sistema de
ficheros antes de concluirlo.

Se construyeron siluetas por arquetipo (a mano, siguiendo la descripción de cada
arma) y **se reportó la limitación explícitamente** en lugar de presentarlas
como trazadas de las referencias.

Fue lo correcto y se demostró a mitad de ronda: el usuario subió `Reference/`
mientras se trabajaba, y al mirar las imágenes reales resultó que **Pulse es
una pistola, no una carabina**. Todo el trazado por arquetipo estaba equivocado
en su premisa. Si se hubiera presentado como fiel a la referencia, el error
habría pasado por bueno.

**Lección:** cuando falta una entrada, dilo y marca lo que construiste como
provisional. Una suposición presentada como hecho es mucho más cara que un
bloqueo declarado.

---

## Ronda 11 — Vectorización real y panel disparable

### 11.1 Trazado con potrace desde el canal alfa

Se instaló `potrace` como dependencia **de desarrollo** y se escribió
`scripts/trace-weapons.mjs`, ejecutable con `npm run trace:weapons` y **fuera
del build de producción**. Lee las imágenes de `Reference/Weapons/`, las
vectoriza, calcula *bounding boxes* y emite `src/ui/weaponPaths.js`.

**Por qué desde el canal alfa y no por luminancia:** las referencias son PNG sin
fondo. Umbralizar por brillo trazaría el contorno de las **zonas claras dentro**
del arma (reflejos, partes metálicas) y perdería las oscuras contra la
transparencia. El canal alfa contiene exactamente la información que se quiere:
dónde hay arma y dónde no hay nada. Se construye una máscara blanco/negro desde
el alfa y se pasa esa máscara a potrace, que así traza la **silueta** y no las
manchas de iluminación.

**Por qué un script *one-off* y no un paso del build:** el trazado es lento, no
determinista entre versiones de la librería, y el resultado sólo cambia cuando
cambia una referencia — que es casi nunca. Generar en cada build añadiría
`potrace` a producción y haría que los diffs cambiaran sin motivo.

Las PNG de referencia **nunca entran en el build**. Son material de trazado, no
assets. Se verificó que no aparecen en `dist/`.

**Normalizar el tamaño entre variantes:** `pulse-plain` se escala por
`matchHeightOf: 'pulse'` (factor 0.605) porque las dos fotos de referencia
estaban tomadas a escalas distintas. Sin esto, activar el supresor cambiaría el
tamaño de la pistola en el HUD, que se lee como un fallo de renderizado.

### 11.2 Panel de acciones con CSS3DRenderer

Un panel de acciones rápidas fijado en la sala, disparable, siempre visible, sin
gesto de apertura.

**Por qué DOM en 3D y no texturas o sprites:** las alternativas eran dibujar el
panel en un canvas y usarlo como textura, o construir los botones con geometría
y texto de Three.js. La primera exige redibujar y resubir la textura a la GPU
cada vez que cambia un estado (arma equipada, supresor activo, pausa) y el texto
sale borroso o carísimo en resolución. La segunda implica reimplementar
tipografía y maquetación.

`CSS3DRenderer` hace que los botones sean **DOM real**, transformado en 3D por
la misma matriz de la cámara. El texto es nítido a cualquier distancia, el
estilo es CSS normal, y los cambios de estado son cambios de clase. El coste es
la restricción conocida: al ser una capa DOM separada, no se oclude con la
geometría WebGL. Aquí no importa, porque el panel está contra una pared y nada
puede pasar por delante.

**El raycast no toca el DOM.** Se mantiene un `THREE.Group` paralelo de planos
invisibles que comparten posición, rotación y escala con el panel, y la posición
de cada plano se sincroniza leyendo `offsetLeft/offsetTop/offsetWidth/
offsetHeight` de cada botón. Así el disparo se resuelve con el mismo raycast que
todo lo demás, sin traducir coordenadas de pantalla ni depender de eventos del
navegador (que bajo Pointer Lock no llegan al DOM en 3D de forma útil).

**Disparar al panel no es ni acierto ni fallo**, no gasta munición y no aplica
recoil. Si contara como fallo, usar la interfaz penalizaría la precisión de la
sesión; si contara como acierto, se podría inflar la estadística disparando a un
botón. La única forma coherente es que sea un evento de otra categoría. Tiene su
propio sonido de confirmación, más corto, para que no se confunda con un
impacto.

---

## Ronda 12 — Automatismos, sala entera y ajustes finos

### 12.1 Recarga automática al llegar a 0

R sigue funcionando para recargar antes de tiempo. La recarga automática elimina
la única situación en la que el jugador se queda mirando una pantalla sin poder
hacer nada útil.

### 12.2 Práctica libre ∞

Segundo botón de inicio, sin límite de tiempo, con ∞ en el HUD y finalización
manual desde la pausa, que muestra el **mismo resumen** de siempre.

Reutilizar el resumen en lugar de crear una pantalla propia mantiene comparables
las métricas entre modos. Dividir por cero en `targetsPerSecond` se evita con
una guarda explícita (`seconds > 0 ? ... : 0`), que aquí importa más que nunca
porque una sesión libre puede cerrarse en el primer segundo.

### 12.3 Los límites reales de la sala sustituyen al radio artificial

El movimiento se acotaba a un radio (`MOVEMENT.radius`) heredado de la ronda 2.
Se sustituyó por el rectángulo real de la sala menos un margen:

```js
const limitX = ROOM.width / 2 - MOVEMENT.wallMargin
const limitZ = ROOM.depth / 2 - MOVEMENT.wallMargin
```

El radio era una simplificación de cuando la sala no tenía tamaño fijo; una vez
fijada en 80×80 (§6.1), recortaba las esquinas sin motivo — el jugador chocaba
contra un muro invisible con la pared a la vista.

### 12.4 El panel se ancla al spawn, no a la sala

Con el jugador moviéndose por los 80×80 completos, un panel en coordenada fija
podía quedar a la espalda o encima. Se ancló respecto al spawn del jugador, con
distancia mínima de seguridad (`minDistance`) para que `follow(camera)` no lo
pegue a la cara.

### 12.5 La variante sin supresor se traza, no se deriva

Hasta esta ronda, la Pulse sin supresor se obtenía **acortando el cañón** del
trazado con supresor de forma proporcional. Al llegar una referencia real
(`pulse-nonsilenced.png`) se retrazó desde cero.

Acortar un trazo es reinterpretar la forma, que es exactamente lo que el
encargo de la ronda 11 prohibía ("usa el contorno que salga del algoritmo"). La
derivación era una solución aceptable mientras no hubiera referencia; con
referencia, deja de serlo.

Se subió el tono del blanco del trazo para igualarlo al resto del HUD — **color
y opacidad únicamente**, sin tocar la forma vectorizada.

---

## Ronda 13 — Documentación

Este documento y `CLAUDE.md`, ambos en el repositorio.

**Por qué en git y no en Notion:** la documentación tiene que versionarse con el
código que describe. Si vive fuera, se desincroniza en la primera semana y nadie
se entera; dentro, un cambio que la invalida y no la actualiza es visible en el
diff. Además, `CLAUDE.md` sólo cumple su función si se carga automáticamente al
abrir el repositorio.

**Por qué dos documentos:** tienen consumos distintos. `CLAUDE.md` se lee
**entero, en cada sesión**, así que cada línea compite por atención y debe ser
corta y accionable. Éste se lee **a propósito, buscando algo**, así que puede
crecer sin límite. Fusionarlos degradaría el primero sin mejorar el segundo.

---

## Ronda 14 — Plano A: el primer escenario con cobertura

Se construye *Largo y Puerta* de la propuesta 01. Es la ronda que más supuestos
tácitos del motor rompe, porque todos ellos existían gracias a que la sala estaba
vacía.

### 14.1 Escenario como variante, no como reemplazo

`SETTINGS.scenario` con *Sala vacía* por defecto. Mismo criterio que el
movimiento en la ronda 2 (§2.1): la sala vacía sigue siendo un escenario válido y
la referencia limpia de rendimiento, y poder apagar el escenario es lo que
permite aislar una regresión.

### 14.2 Anclajes curados en lugar de muestreo por cono

**La decisión central de la ronda.** Con cobertura, el sentido de una diana es
*dónde* sale: una tronera, la boca de un paso, la esquina de un cajón. Eso no lo
da un cono, que sólo sabe de ángulos y distancias.

Trece anclajes escritos a mano, cada uno con zona, suelo sobre el que se apoya y
si obliga a asomarse. El muestreo por cono sigue vivo y sin tocar para la sala
vacía: son dos modos, no un reemplazo.

*Consecuencia asumida:* el *slider* de distancia de aparición no se aplica en un
escenario. Los anclajes están donde el diseño dice, y filtrarlos por distancia
podría dejar cero candidatos visibles. Se avisa en la propia opción.

### 14.3 Barajar y coger el primero visible

Había que "sortear entre los anclajes visibles". Lo obvio sería comprobar los 13,
quedarse con los visibles y sortear entre ellos: 13 raycasts siempre.

En su lugar se baraja el orden y se devuelve **el primero que pase el test**. El
primer elemento visible de una permutación uniforme está distribuido
uniformemente entre los visibles, así que el sorteo es exactamente el mismo — y
se dejan de hacer todos los raycasts posteriores al acierto. Medido en juego: 1 a
3 raycasts por aparición en vez de 13.

El barajado es Fisher-Yates sobre un `Int32Array` preasignado: no aloca.

### 14.4 La visibilidad se comprueba al activar, jamás por frame

Un raycast contra toda la geometría no cabe en el presupuesto de 0.2 ms p99. Se
comprueba sólo al elegir anclaje.

El detalle que lo hace cierto: si **ningún** anclaje está visible, hay que
esperar (`SPAWN.anchorRetryMs`, 150 ms) antes de reintentar. Sin esa espera,
`_spawn` fallaría y el bucle lo volvería a llamar al frame siguiente,
convirtiendo un test de activación en uno por frame — exactamente lo que la
decisión quería evitar. Verificado en navegador: 0 raycasts de visibilidad en un
segundo de juego sin apariciones.

### 14.5 Los disparos se paran en la cobertura

No estaba en el encargo, pero sin esto el escenario no significa nada: las dianas
nacen visibles, el jugador se mete detrás de la Espina y sigue matando a través
del muro.

Se resuelve con un segundo raycast **por disparo** —nunca por frame— contra los
oclusores, acotado a la distancia del impacto. Va con el rayo ya desviado por
retroceso y dispersión, así que un tiro que se va a la cobertura se come la
cobertura. Coste medido: p99 0.2 ms por disparo, y un arma dispara como mucho 13
veces por segundo.

### 14.6 El modo dinámico se ignora con anclajes

Una diana que se mueve a un destino aleatorio atravesaría los muros y se llevaría
por delante todo el diseño de cobertura. Se descartó moverlas **entre anclajes**
por el mismo motivo: la línea recta entre dos anclajes también cruza paredes.

Así que en un escenario las dianas se quedan quietas, y la opción lo dice.
Moverlas bien pide rutas declaradas en el escenario, que es otra ronda.

### 14.7 Grises por altura, ningún naranja

La referencia de estilo es naranja entera, pero `#E4462B` es el color de las
dianas (§10.4). La rampa de grises no es un sustituto estético: **codifica
altura**, de `#2B2B2B` para el bordillo a `#C8C8C8` para el bloque. Más claro =
más alto = menos se pasa, y el jugador aprende a leerlo sin que nadie se lo
explique.

Cada pieza lleva una arista un tono por encima del relleno: sin ella, dos grises
vecinos se funden contra el fondo negro y el bloque pierde su silueta.

### 14.8 Colisión por eje, y las rampas aparte

La resolución es **un eje cada vez**: X contra la Z vieja, luego Z contra la X ya
corregida. Resolver los dos a la vez clava al jugador en cuanto roza una esquina;
por ejes, resbala.

Las rampas **no son cajas**. Si lo fueran, frenarían. Son un tipo propio de
colisionador que no estorba y sólo levanta el suelo, interpolando entre su
extremo bajo y el alto. Es lo que hace subible el Balcón, que con un salto de
0.69–1.25 u no se alcanza de ninguna otra forma.

El escalón automático (`COVER.stepHeight`) es 0.25, deliberadamente **por debajo
del bordillo de 0.6**: sirve para no engancharse en juntas, no para convertir la
cobertura más baja en una rampa.

### 14.9 El parapeto es un labio de la plataforma, no un muro del suelo

Primer intento: un muro de 3.8 delante del Balcón, a nivel de suelo. Mal — desde
el Largo tapa al muñeco de 2.6 a 3.8, dejando asomar sólo una rodaja de cabeza.

Correcto: el parapeto se apoya **sobre** la plataforma (`base: 'plataforma'`), de
2.6 a 3.8. Así cubre hasta el pecho a quien está arriba, que es lo que hace una
ventana, y las troneras son huecos en ese labio por donde el muñeco se ve entero
de cintura para arriba.

### 14.10 Tres fallos que sólo aparecieron al probar

**La plataforma dejaba una rendija.** Iba de z −38 a −28, pero el jugador llega
hasta ±38.5 (`ROOM/2 - MOVEMENT.wallMargin`). Por esa franja de medio metro se
caía por detrás del Balcón. Se extendió a ±39. **Regla general:** cualquier
superficie pisable tiene que llegar al límite de movimiento, no al límite
nominal de la sala.

**Desde el spawn no se veía ningún anclaje.** La divisoria del Vestíbulo —20 u de
ancho a 5 u del jugador— tapaba el cono entero, así que la sesión arrancaba sin
ninguna diana y el reintento de 150 ms se disparaba en bucle. Los dos anclajes
del Vestíbulo se movieron a las bocas de cada salida, fuera de la sombra de la
divisoria. **Regla general:** un escenario tiene que garantizar al menos un
anclaje visible desde su propio punto de aparición.

**Dos anclajes nacían dentro de un bloque.** Uno dentro de una Baja y otro dentro
de un Bordillo. El segundo se coló porque la primera versión del test sólo
miraba piezas altas: una diana con los pies enterrados en un bordillo es
igual de inaceptable que una dentro de un muro, y el test no lo veía.

### 14.11 El panel de acciones se ancla al spawn de verdad

`CLAUDE.md` decía que el panel estaba "anclado respecto al spawn", pero la
implementación lo ponía en la pared +X a z = 0 — que coincidía con el spawn
mientras el spawn fue siempre el origen. Con escenarios dejó de coincidir.

Ahora `setAnchor(spawn)` mueve el tablero en Z con el punto de aparición, acotado
para que la pizarra entera quepa dentro de la sala (mide 19.8 u de ancho: con el
ancla pegada a la pared trasera, media se saldría). Verificado que su volumen
—X 18..39.4, Z 18.1..37.9, Y 2.35..5.65— no toca ninguna estructura del Plano A.

*Lo que sí cambia y es inherente:* el panel ya no está siempre a la vista. Desde
el Largo lo tapa la Espina. Con cobertura eso es inevitable, y preferible a
ponerlo flotando en mitad del mapa.

### 14.12 Aterrizaje: hundimiento instantáneo, recuperación suave

El hundimiento entra **de golpe** en el instante del impacto y se recupera con
una salida suave en 110 ms. Al revés —entrar suave— se sentiría como un ascensor,
no como un golpe.

Ambos, sonido y hundimiento, escalan con la velocidad de caída y no hacen nada
por debajo de `LANDING.minSpeed`: bajarse de un bordillo no debe sonar igual que
tirarse del Balcón, ni sonar en absoluto.

Es puramente sensorial. No toca `gravity` ni `jumpSpeed`, que es justo el punto:
comprobar si la sensación de "flotante" se arregla sin tocar la física.

## Ronda 15 — Selector de escenario

Sólo interfaz: ni geometría, ni anclajes, ni los planos B y C.

### 15.1 La miniatura se dibuja de los datos, nunca es una captura

Un PNG del escenario se desincroniza en cuanto alguien mueve una caja, y nadie
se entera hasta verlo en partida — el mismo fallo que las siluetas de arma por
arquetipo de la ronda 10, en otro sitio.

`ScenarioThumbnail.jsx` lee las mismas piezas de `SCENARIOS` que monta
`scenario.js` y resuelve las alturas con el mismo `coverHeight`. **No puede
mentir**: si la geometría cambia, la miniatura cambia sola. El test lo comprueba
contando piezas dibujadas contra piezas declaradas y verificando que una caja
concreta está en la coordenada que dice el dato.

### 15.2 `coverHeight` y `coverEdgeColor` suben a `config.js`

Los necesitaban dos sitios que no se conocen entre sí —el montaje 3D y la
miniatura— y una copia en cada uno es exactamente cómo se desincronizan las
cosas (§ convención de fuente única).

**El detalle que casi se cuela:** la escena aclaraba las aristas con
`THREE.Color.lerp`, que mezcla en espacio **lineal**. Escribir el mismo aclarado
"a mano" en sRGB, que es lo natural en una hoja de estilos, da un gris bastante
más oscuro en las piezas bajas: `#848484` en vez de `#b0b0b0` para el bordillo.
La miniatura habría quedado apagada respecto a lo que se ve jugando, y la causa
no habría sido evidente.

`coverEdgeColor` hace la conversión sRGB → lineal → mezcla → sRGB, y se comprobó
que sale **byte a byte igual** que `THREE.Color.lerp` en las ocho piezas. Ahora
la usan los dos, así que el 3D no cambió nada y la miniatura coincide por
construcción.

*Por qué hacía falta el borde en la miniatura:* a tamaño de selector, un
bordillo `#2B2B2B` sobre fondo `#0c0c0c` desaparece. En la escena eso no pasa
porque los bloques ya llevan arista; la miniatura necesitaba la misma.

### 15.3 La ficha es del escenario seleccionado, no una por tarjeta

Con cuatro escenarios, cuatro fichas a la vez convierten el panel en un muro de
texto — y el panel de opciones ya iba justo de alto (§11, `max-height` +
`overflow-y`). Se muestra la del elegido.

La sala vacía no lleva ficha, que es lo que la distingue: no hay nada que
explicar.

### 15.4 La transición es un módulo sustituible entero

**La decisión estructural de la ronda.** El contrato con el motor es una sola
función:

```js
transition.run(build)   // tapa → llama a build() → destapa
```

El motor no sabe que hoy es un fundido, y nada de lo que hay detrás —colisión,
activación de anclajes, entrada del jugador— depende de la forma que tome. Si
mañana el fundido se cambia por una elevación de las piezas desde el suelo, se
reescribe `transition.js` y nada más.

Tres decisiones que hacen cierta esa promesa:

- **La fábrica ya recibe `scene` y `camera`** aunque el fundido no los use. Una
  transición que anime la geometría los necesitaría, y si no estuvieran ahí el
  cambio tocaría `engine.js` — justo lo que se quiere evitar.
- **`build` es síncrona y se llama con la escena tapada.** El módulo decide
  *cuándo*; el motor sólo garantiza que construir es instantáneo desde fuera.
- **El `finally` levanta la capa aunque `build` lance.** Más vale ver una escena
  rota que quedarse a oscuras para siempre.

*Se comprobó que la promesa se cumple:* el test hace `grep` sobre `engine.js`
buscando `opacity`, `fade`, `veil` y `TRANSITION.` — cero apariciones. La primera
versión suspendía, porque un comentario mío decía "el juego no sabe que es un
fundido"; nombrar la técnica en el motor es exactamente el acoplamiento que la
decisión quería evitar, aunque sea en prosa.

### 15.5 Peticiones encadenadas: se monta la última, no todas

Cambiar de escenario a toda prisa encadenaría un fundido por click. `run` guarda
la última construcción pedida en lugar de encolarlas, y el motor pasa
`() => this._buildScenario(this._wantedScenarioKey)` —una clave leída en el
momento de construir, no capturada al pedirla—. Medido: 9 peticiones en 200 ms
producen 1 o 2 montajes, y acaba montado el último escenario pedido.

### 15.6 Con sesión en marcha, las dianas se siembran después de montar

`_applySettings` resembraba las dianas justo después de pedir el cambio de
escenario. Con la transición de por medio eso pasó a ocurrir **antes** de que el
mundo nuevo existiera: las dianas nacían en los anclajes del escenario viejo.

La siembra se movió a `_buildScenario`, que es el instante en que el mundo
cambia, y `_applySettings` la salta si hay una transición en curso. Es la misma
lección que el orden del constructor (§13.2): aplicar configuración va **después**
de que exista lo que esa configuración toca.

## Ronda 16 — Lo que salió de jugar el Plano A

Primera tanda de arreglos venidos de jugar en serio, no de leer el código.

### 16.1 El panel ganaba por orden de comprobación, no por distancia

`_onMouseDown` preguntaba al panel **antes que a nada**, y si el rayo tocaba el
tablero en cualquier punto, ahí acababa el click. Con una diana delante de un
botón, la diana era literalmente inmatable.

Ahora el tablero sólo se acciona si es **lo más cercano bajo el punto de mira**:
se compara su distancia con la del impacto en diana más próximo y con la
geometría del escenario. Gana el más cercano, sin privilegios.

*Detalle deliberado:* la comparación usa el rayo **limpio** de la cámara, no el
desviado por retroceso y dispersión. La pregunta es "a qué está apuntando el
jugador", y a un botón de interfaz no se le debe fallar por ir corriendo. El
disparo, si gana la diana, sigue usando el rayo desviado como siempre.

### 16.2 El este del Vestíbulo es del tablero

El anclaje `vestibulo-e` estaba en x 22, y el tablero ocupa de x 18 a la pared:
la diana salía **detrás** de la pizarra. Aunque §16.1 arregla quién gana el
click, una diana pegada a un botón sigue haciendo imposible pulsarlo.

Se movió a (8, 35): al otro lado del tablero, a 10 u de su volumen y a 41° de él
visto desde el spawn. Queda **detrás del punto de aparición**, así que obliga a
girarse — en un aim trainer eso no sobra.

*Lo que se descartó:* llevarlo más al sur del Vestíbulo. Todo lo que está de
frente al spawn lo tapa la divisoria, así que habría dejado de verse al arrancar
la sesión y el primer disparo de cada partida sería siempre al mismo sitio
(§14.10). El este de esa banda, sencillamente, no da para anclajes mientras el
tablero esté ahí.

### 16.3 Agacharse en el aire frenaba a la mitad

`currentSpeed` devolvía `crouchSpeed` estuvieras donde estuvieras. Pulsar CTRL a
media trayectoria bajaba la velocidad horizontal de 6.5 a 2.6 de golpe: **el
vuelo duraba lo mismo (746 ms) pero recorrías la mitad** (4.07 u → 2.07 u). Eso
es exactamente lo que se siente como quedarse flotando a cámara lenta.

La marcha ahora **se congela al despegar** y se mantiene hasta tocar suelo, tanto
si se salta como si se sale andando de un borde. Es además lo que hacen los
shooters: en el aire llevas la inercia que traías, no la que pidas.

Agacharse en el aire sigue bajando la cámara, que es su otro trabajo.

### 16.4 La colisión expulsaba a quien quedara dentro de una caja

Bajarse del Balcón cerca del borde teletransportaba al jugador contra la pared.

`resolveAxis` sacaba al jugador **por la cara más cercana de la caja**. Parece
razonable hasta que la caja es enorme: la plataforma del Balcón ocupa el ancho
entero de la sala, así que a quien quedara dentro de su huella a ras de suelo lo
escupía cuarenta unidades de golpe. Reproducido barriendo el borde entero: 71 de
77 posiciones acababan pegadas a la pared.

Dos cambios:

- **El bloqueo va en el sentido del avance**, no hacia la cara más próxima. Si
  avanzas en +X te paras en la cara mínima; si avanzas en −X, en la máxima. No
  hay forma de que la corrección sea mayor que el paso que la provocó.
- **A quien ya estuviera dentro de una caja antes de moverse no se le empuja.**
  Un empujón ahí es siempre peor que el problema que arregla.

La firma pasó a `resolveAxis(axis, from, to, other, feetY, headY)`: sin saber de
dónde viene el jugador no se puede saber en qué sentido frenarlo.

### 16.5 El aterrizaje sonaba a disparo silenciado

Los dos perfiles habían convergido sin querer: ruido filtrado corto sobre un
seno grave que cae. En partida se confundían.

El aterrizaje se rediseñó para alejarse en los tres ejes que distinguen un golpe
de un chasquido: **onda triangular** en vez de seno, **ataque de 12 ms** en vez
de 2 —un percutor ataca instantáneo y suena a clic por mucho que se le baje el
tono—, y **cola cuatro veces más larga** (200 ms contra 55). El ruido de suela
baja de 320 Hz a 190, que es roce y no percutor.

El perfil vive en `LANDING.sound`, no incrustado en la función.

### 16.6 x8, y lo que x8 significa de verdad con cobertura

Con trece anclajes, el tope de x5 dejaba la mayoría sin usar. Se añadió x8; el
pool de dianas crece solo porque se dimensiona desde `MAX_SIMULTANEOUS_TARGETS`.

**Lo que hay que saber:** en un escenario con cobertura, x8 no significa ocho
dianas. Significa *hasta* ocho, y el techo real lo pone cuántos anclajes ves
desde donde estás. Medido en el Plano A: 2 en el Vestíbulo, 4 en los Cajones, 5
en El Largo, 6 en La Puerta. Ningún puesto ve los trece, y eso es la cobertura
haciendo su trabajo, no un fallo. En la sala vacía sí salen las ocho.

### 16.7 El salto: qué se midió y por qué el hundimiento no bastaba

Investigación sin tocar constantes, a petición.

La curva no tiene nada roto: es una parábola limpia y simétrica —371 ms de
subida, 375 de bajada— con ápice en 1.252 u. El problema no es la forma, es la
**duración**: 746 ms de vuelo, de los cuales **el 45% se pasa en el 20% superior
de la altura** y el 28% a menos de 10 cm del punto más alto. Una parábola va más
lenta justo donde más consciente eres de estar en el aire.

Por eso el hundimiento de aterrizaje no podía arreglarlo: **cubre los últimos
110 ms de 746**, el 15% final. Era un parche pequeño sobre una superficie grande.

Lo medido para una decisión futura, sin aplicar:

| | ápice | vuelo | desvío 60↔240 Hz |
|---|---|---|---|
| actual `g=18, v=6.75` | 1.252 | 746 ms | 3.3% |
| `g=30, v=8.67` | 1.234 | 575 ms | 4.3% |
| `g=40, v=10.01` | 1.231 | 500 ms | 5.1% |
| `g=70, v=13.24` | 1.225 | 375 ms | 6.6% |

Dos conclusiones que conviene no perder:

- **Las proporciones no cambian.** El 45% en el quinto superior y el 28% cerca
  del ápice salen iguales con cualquier gravedad: una parábola es una parábola.
  Lo único que se mueve es el tiempo absoluto, que va como 1/√g.
- **Gravedad asimétrica —subir igual, caer más rápido— apenas sirve.** Ni
  duplicando la caída se baja de 625 ms, porque la bajada ya es sólo la mitad del
  vuelo. El acortamiento real exige subir la gravedad de las dos.
- **Y sale caro por otro lado:** más gravedad agrava la dependencia del refresco
  del monitor que ya está anotada en `CLAUDE.md`, del 3.3% actual al 6.6% con
  `g=70`. Antes de tocar la gravedad conviene arreglar el integrador.

## Ronda 17 — El salto deja de depender del monitor

Sin tocar `gravity` ni `jumpSpeed`: sólo cómo se calcula la trayectoria.

### 17.1 La causa: Euler acumula error, y el error depende del paso

`_updateVertical` integraba paso a paso, que es lo natural de escribir:

```js
this.verticalVelocity -= MOVEMENT.gravity * dt
this.feetY += this.verticalVelocity * dt
```

Eso es Euler semi-implícito. Es estable, pero **no es exacto**, y su error va con
el tamaño del paso: el mismo salto subía 1.210 u a 60 Hz y 1.252 a 240 Hz, un
3.3% de diferencia según el monitor que tuvieras delante. Con `gravity` más alta
—lo que pedía el diagnóstico del flotamiento (§16.7)— la desviación empeoraba
hasta el 6.6%.

### 17.2 El arreglo: forma cerrada, no integración

La trayectoria de un salto es un movimiento uniformemente acelerado, y eso tiene
solución analítica. Se guarda el estado del despegue —instante, altura y
velocidad— y cada frame se **evalúa** la parábola en vez de acumularla:

```js
this._airTime += dt
const t = this._airTime
this.feetY = this._launchY + this._launchVelocity * t - 0.5 * g * t * t
this.verticalVelocity = this._launchVelocity - g * t
```

No hay estado que arrastre error: `_airTime` es la única cantidad acumulada y su
suma es exacta hasta el épsilon del doble. Da igual a qué ritmo se evalúe.

Es la misma idea que ya gobierna la cadencia de disparo desde la ronda 7: **el
tiempo del juego no puede depender de cuándo dibuja el monitor**. Allí se
consiguió programando desde el instante en que el disparo tocaba; aquí,
evaluando la posición desde el instante del despegue.

### 17.3 La velocidad de impacto sale de la energía, no del frame

Un cabo suelto del cambio: si la velocidad de aterrizaje se lee del frame en que
se detecta el suelo, llega **pasada de largo** y en una cantidad que depende del
refresco. El golpe sonaría distinto y la cámara se hundiría distinto en cada
monitor.

Se calcula de la conservación de energía sobre la propia parábola:

```
v² = v0² + 2·g·(y0 − suelo)
```

Medido: la fuerza del impacto sale **idéntica bit a bit** entre 60, 144 y 240 Hz,
tanto saltando como cayéndose del Balcón.

### 17.4 Lo que queda, y por qué no es la física

| | antes | ahora |
|---|---|---|
| ápice 60 ↔ 240 Hz | 3.3% | **0.049%** |
| ápice 30 ↔ 360 Hz | — | **0.049%** |
| fuerza del impacto | variable | **0%, exacta** |
| altura contra `y(t)` | error de Euler | **0.00e+0 en todos los frames** |

El 0.049% que queda **no es error de cálculo**: la trayectoria coincide con
`y(t) = v₀t − ½gt²` con error exactamente cero en cada frame y a cada Hz
—medido a 30, 60, 90, 144, 165, 240 y 360—. Lo que varía es *dónde caen las
muestras*: a 60 Hz ningún frame cae justo en el vértice, así que el máximo
observado se queda corto en ½·g·(dt/2)² = 0.6 mm. Es una limitación de dibujar a
intervalos, no de la simulación, y no se puede quitar sin renderizar entre
frames.

Lo mismo vale para el tiempo de vuelo, que sigue cuantizado a un frame: el
aterrizaje se **detecta** cuando toca dibujar. La trayectoria hasta ahí es
exacta; el instante en que el jugador se entera, no puede serlo.

### 17.5 Lo que esto desbloquea

El aviso de `CLAUDE.md` sobre no fiarse de saltar a la cobertura `baja` de 1.25
se cae solo: el ápice es ahora 1.2656 en cualquier monitor, con 1.6 cm de margen
real y reproducible. **La cobertura Baja pasa a ser saltable de verdad.**

Y el freno que §16.7 ponía a subir la gravedad —que agravaba la dependencia del
refresco— desaparece: ya no hay dependencia que agravar. La decisión sobre el
flotamiento vuelve a ser puramente de *feel*.

## Ronda 18 — Subir la gravedad, ahora que sale gratis

Un solo cambio: `gravity` 18 → 30 y `jumpSpeed` 6.75 → 8.67, el punto intermedio
de la tabla de §16.7. Nada más.

### 18.1 Por qué ahora y no en la ronda 16

El diagnóstico del flotamiento (§16.7) ya señalaba que la única palanca real es
la gravedad, y que subirla **empeoraba** la dependencia del refresco: del 3.3% al
4.3% con `g=30`, hasta el 6.6% con `g=70`. Ese era el motivo para no tocarla.

Con el salto resuelto en forma cerrada (§17) ese precio desapareció, así que el
cambio pasó a ser puramente de *feel*. Es el orden correcto: **primero se arregla
la precisión, después se ajusta la sensación.** Al revés se habría metido más
error para conseguir mejor tacto.

Medido con los valores nuevos: la altura sigue coincidiendo con
`y(t) = v₀t − ½gt²` con error **exactamente cero** en cada frame, de 30 a 360 Hz,
y el ápice varía un 0.036% entre 60 y 240. Con el integrador viejo, `g=30` habría
dado 4.3%.

### 18.2 Qué cambia en el juego

| | antes | ahora |
|---|---|---|
| `gravity` / `jumpSpeed` | 18 / 6.75 | 30 / 8.67 |
| ápice | 1.2656 u | 1.2528 u |
| vuelo | 746 ms | **578 ms** |
| ápice 60 ↔ 240 Hz | 0.049% | 0.036% |

Mismo alcance vertical, **un 23% menos de tiempo en el aire**. Las proporciones
de la parábola no cambian —el 45% del vuelo sigue estando en el quinto superior,
porque eso es invariante de escala (§16.7)—, pero los 333 ms que antes se pasaban
ahí arriba ahora son 258.

### 18.3 La Baja sigue siendo saltable, y no por donde parecía

El ápice pasa de superar la cobertura `baja` (1.25) por 1.6 cm a hacerlo por
**2.8 mm**. Parece que quedara al filo, y no es así.

Lo que abre la ventana no es `apex − 1.25` sino **`COVER.stepHeight`**: la caja
deja de ser un muro en cuanto los pies pasan de `1.25 − 0.25 = 1.00`, y a partir
de ahí cualquier descenso sobre ella se posa encima. Esa ventana dura 260 ms —
1.7 unidades de carrera—, más que de sobra.

Verificado igualmente en el cajón de Los Cajones: **12 de 12 intentos** a 60, 144
y 240 Hz, aterrizando dentro de 5 cm en los tres refrescos.

**La lección:** un margen que parece de milímetros sobre el papel puede ser
holgado en la práctica si otra constante gobierna la tolerancia real. Y al revés.
Por eso la tabla de `COVER` lleva escrito que hay que **volver a medirla** si se
toca `jumpSpeed`, `gravity` o `stepHeight` — no deducirla.

### 18.4 Efecto colateral: el aterrizaje se satura

Más gravedad son caídas más rápidas, y `LANDING` no se movió:

| caída | antes | ahora |
|---|---|---|
| bajarse de un bordillo (0.60 u) | 4.65 u/s → 0.57 | 6.00 u/s → 0.82 |
| bajarse de una Baja (1.25 u) | 6.71 u/s → 0.95 | 8.66 u/s → **1.00** |
| salto en plano | 6.75 u/s → 0.95 | 8.67 u/s → **1.00** |
| bajar del Balcón (2.60 u) | 9.67 u/s → 1.00 | 12.49 u/s → **1.00** |

Con `fullSpeed: 7.0`, todo lo que no sea un bordillo satura: el golpe suena y
hunde la cámara igual bajándose de un cajón que tirándose del Balcón. El rango
útil se queda en 0.18 de los 0.38 que había.

**No se tocó** porque el encargo era explícito en no mover nada más. Se arregla
subiendo `LANDING.fullSpeed` a ~12.5, que devuelve la escala completa hasta la
caída más alta del Plano A.

## Ronda 19 — Explosivo y puntuación por estrellas

El escenario deja de ser un campo de tiro con muros y pasa a tener un objetivo.

### 19.1 La escala del aterrizaje, cerrada

`LANDING.fullSpeed` de 7.0 a 12.5, que es justo por encima de la caída más alta
del Plano A (2.6 u → 12.49 u/s). El rango útil pasa de 0.18 a 0.59: bajarse de un
bordillo, de un cajón y del Balcón vuelven a sonar distinto. Era el cabo suelto
que dejó §18.4.

### 19.2 El explosivo no tiene ayuda de interfaz

**La decisión de diseño de la ronda.** Ni indicador en el HUD, ni marcador en
pantalla, ni distancia, ni flecha. La única pista es el pitido: **volumen por
proximidad, tempo y tono por cuenta atrás**. El marcador existe en el mundo —un
octaedro ámbar parpadeante— así que se ve si miras hacia él, pero encontrarlo es
recorrer el mapa escuchando.

Eso obligó a un cambio que no era evidente: **el cronómetro del HUD pasa a contar
hacia arriba** en modo escenario. Como desactivar o detonar terminan la sesión,
el reloj de la sesión *es* la cuenta atrás de la bomba; enseñar "lo que queda"
habría puesto un temporizador de bomba en pantalla por la puerta de atrás,
justo lo que la mecánica quería evitar. Contando hacia arriba no se filtra nada,
y de paso el número que se ve es el que puntúa.

**El progreso de desactivación sí se enseña, pero en el mundo:** un anillo que se
llena en el suelo, alrededor del marcador. Mantener una tecla tres segundos a
ciegas sería cruel; ponerlo en el HUD delataría que estás al lado. El anillo se
rellena moviendo el **rango de dibujo** de una geometría construida una sola vez,
no regenerándola: rehacerla cada frame sería alocar en el bucle caliente durante
los tres segundos que dura.

### 19.3 Sin explosivo en práctica libre

La práctica libre existe para **no terminar sola**. Un explosivo que la cerrase a
los 45 s rompería su único contrato, así que sólo se arma con escenario **y**
cronómetro. El escenario tiene sus sitios igualmente: lo que no ocurre es
armarlo.

En la sala vacía no hay explosivo por una vía más limpia todavía: no tiene
`objectiveSites`, y `Scenario.objectiveSites` devuelve lista vacía. Ningún caso
especial en el motor.

### 19.4 Un cuarto color, a regañadientes

El marcador no podía ser naranja —se confundiría con una diana—, ni verde —eso es
la interfaz accionable—, ni gris —desaparecería contra la cobertura—. Se añadió
`COLORS.objective`, un ámbar `#E8B33A` que se lee como peligro y no colisiona con
nada. Es el primer color nuevo desde la ronda 1 y el criterio para añadirlo fue
el mismo de siempre: sólo si ninguno de los que hay puede hacer el trabajo sin
robarle significado a otra cosa.

La silueta también separa: un **octaedro**, que no se parece ni a una esfera
—diana— ni a una caja —cobertura—.

### 19.5 Los sitios se curan, como los anclajes

Cinco posiciones escritas a mano, **una por zona** —El Largo, El Balcón, Los
Cajones, La Puerta, el pasillo trasero—, y ninguna en el Vestíbulo: aparecer
encima del spawn no es un objetivo, es un regalo. La más cercana queda a 33 u.
Mismo razonamiento que §14.2: un cono no sabe dónde importa que esté algo.

### 19.6 La puntuación normaliza por la suma de los pesos, no por el número

Cuatro variables: precisión y tiempo activas a 0.5, daño y muertes **reservadas a
0**. El encargo pedía dejarles el hueco hecho sin implementar la mecánica.

El detalle que hace que "reservada" signifique algo: la media se divide por la
**suma de los pesos**, no por el número de variables. Sin eso, dos a 0.5 y dos a
0 darían como mucho media nota y las reservadas arrastrarían el resultado hacia
abajo desde el primer día. Verificado: pasar `damageTaken: 100, deaths: 3` no
mueve la nota ni un decimal mientras su peso sea 0, pero sus partes ya se
calculan y aparecen en la salida.

La precisión **parte de 1 cuando no hay disparos**. Arrancar en cero haría que el
indicador de estrellas empezara vacío y subiera, cuando lo que cuenta la mecánica
es lo contrario: empiezas con todo y lo vas gastando.

### 19.7 Detonar no es una estrella

Que el explosivo estalle **no puntúa**. No es 1★, es "Fallido": quien no llega a
desactivar no ha hecho una mala partida, ha hecho otra cosa. El resumen lo
distingue visualmente —naranja de aviso y sin fila de estrellas— y el motor lo
implementa no calculando puntuación cuando el desenlace es `exploded`.

### 19.8 Las estrellas son en vivo, y por eso bajan solas

El indicador del HUD se recalcula **cada frame**, no sólo al final. Como el
tiempo es la mitad de la nota, las estrellas **bajan por sí solas según pasan los
segundos** aunque no dispares: eso es la mecánica diciéndote que tardar cuesta.
Verificado en el DOM: fallar disparos las baja en el acto, acertar las sube, y
treinta segundos sin hacer nada las bajan de 5 a 3.

Recalcular en cada frame son cuatro divisiones y una media ponderada, muy por
debajo de lo que costaría guardar la nota y mantenerla sincronizada con cada
disparo, cada impacto y el reloj.

## Ronda 20 — Audio espacial de verdad, y el arma al centro

### 20.1 El reparto: `sfx.js` dice cómo suena, `spatial.js` desde dónde

El módulo de audio espacial **no sabe nada del explosivo**, que era el encargo:
sólo coloca un punto en el mundo y devuelve el nodo al que conectar una voz. Los
pasos de los dummies o un rival futuro se enganchan igual sin tocarlo.

Eso obligó a decidir la dirección de la dependencia. `spatial.js` importa de
`sfx.js` —necesita el contexto de audio— y `sfx.js` **no importa `spatial.js`**:
sus voces aceptan un emisor y le piden `.input` sin saber qué es. Al revés habría
un ciclo, y con un módulo intermedio para el contexto habría tres ficheros donde
bastan dos.

### 20.2 Dos trampas de `THREE.PositionalAudio` que no están en la documentación

**La primera cuesta media hora:** `AudioListener` crea su **propio**
`AudioContext` si no se le dice otra cosa, y nodos de dos contextos distintos no
se pueden conectar. El síntoma sería un error críptico de Web Audio al conectar
la voz al panner. Se resuelve pasándole el nuestro con
`THREE.AudioContext.setContext()` **antes** de construir el listener.

**La segunda es peor porque no falla, simplemente no funciona:**

```js
updateMatrixWorld( force ) {
  super.updateMatrixWorld( force );
  if ( this.hasPlaybackControl === true && this.isPlaying === false ) return;
  // ...aquí es donde se mueve el panner
}
```

`PositionalAudio` está pensado para reproducir un buffer, así que si no estás
reproduciendo no se molesta en mover el panner. Aquí **nunca** se llama a
`play()`: la fuente es síntesis en vivo, no un fichero —el proyecto no tiene
assets—. Sin poner `hasPlaybackControl = false`, el panner se queda clavado en el
origen y **el audio suena espacial pero siempre desde el mismo sitio**. Se oiría
raro sin que nada indique por qué.

El test lo comprueba explícitamente: mueve el emisor dos veces y verifica que
`panner.positionX` le sigue las dos.

### 20.3 Con panner, el volumen por distancia se aplica una sola vez

El pitido ya tenía su propia curva de volumen por proximidad. Dejarla puesta
además del panner sería atenuar dos veces y el sonido se apagaría el doble de
rápido.

La voz mira si hay destino espacial: si lo hay, pasa nivel 1 y la distancia la
pone el panner; si no, usa la curva de siempre. Los parámetros del panner están
elegidos para que las dos rutas se parezcan: con `distanceModel: 'linear'` la
ganancia es `1 − rolloff·(d − ref)/(max − ref)`, así que con ref 4, max 55 y
rolloff 0.9 la curva va de 1 a 0.1 exactamente en el mismo tramo que la manual.

### 20.4 El emisor es perezoso

Se construye en el constructor del explosivo, mucho antes de que exista el
contexto de audio —que no aparece hasta el primer gesto del usuario—. Si montara
el `PositionalAudio` ahí, o petaría o habría que ordenar la inicialización a
mano por todo el motor.

Monta el nodo **la primera vez que alguien le pide `input`**, y devuelve `null`
mientras no haya listener o el audio espacial esté apagado. Quien lo use cae solo
a su ruta sin dirección. Ningún caso especial en el llamante.

### 20.5 Munición y arma al centro

Estaban en la esquina inferior derecha, donde leer el cargador obliga a apartar
la vista del centro de la pantalla — justo lo que un aim trainer no debería pedir.
Pasan al eje de la mira, 216 px por debajo a 720p: lejos del punto de tiro y a un
golpe de vista.

De paso, los rótulos y el "/ máximo" suben del gris apagado (`#7a7a7a`) a uno
intermedio (`#a6a6a6`), nuevo token `--text-soft`. En la esquina el gris apagado
valía porque era información de fondo; en el centro tiene que leerse. El número
grande y la silueta se quedan en blanco: ya estaban bien.

Va fuera de `.hud` y se centra por su cuenta, por el mismo motivo que el bloque
de FPS y el de estrellas: `.hud` se centra con un `transform`, y posicionar algo
dentro de un ancestro transformado lo ancla a ese ancestro (§9.2).

## Ronda 21 — Precisión normalizada por arma, y el HUD en una fila

### 21.1 Cada arma se juzga contra lo que es razonable en ella

La precisión se medía en bruto, y eso **castigaba elegir el arma difícil**: una
Volt a 800 RPM con bamboleo lateral no puede acertar como una Pulse sin
retroceso, así que la mejor estrategia para puntuar era coger siempre la fácil.

Ahora cada arma lleva un `precisionTarget` —lo que se considera dominarla— y el
componente vale `min(1, bruto / objetivo)`. Con 0.85 / 0.5 / 0.4, un 40% en bruto
da 0.47 con la Pulse, 0.80 con la Rift y 1.00 con la Volt. El **peso 0.5
no se toca**: lo que cambia es la escala del componente, no cuánto pesa.

Dos detalles:

- **Alcanzar el objetivo da 1 clavado, y pasarse no da más.** El techo es el
  techo; sobrepasarlo debería notarse en el tiempo, que es la otra mitad.
- **Sin objetivo, o con objetivo 0, se cae a la precisión en bruto.** Un divisor
  cero dejaría la nota indefinida, y un arma nueva sin el campo puesto no debería
  romper la puntuación mientras alguien se acuerda de añadírselo.

### 21.2 Las estrellas pasan de `clip-path` a SVG

El `clip-path` de la ronda 19 recortaba una forma **rellena**, y una forma
recortada sólo puede estar rellena: la estrella vacía sólo se podía apagar
bajándole el brillo. Con dos tonos de gris parecidos, llena y vacía se
distinguían mal de reojo.

En SVG la vacía puede ser un **contorno hueco** de verdad. La diferencia pasa a
ser de forma, no sólo de brillo, y eso se lee sin mirar. De paso el tamaño sube
de 13 a 20 px y la fila se separa 21 px de la de tiempo/aciertos/fallos, para que
no se lea como parte de ella.

**Sin color, a propósito.** El naranja es de las dianas y el ámbar del explosivo;
una estrella teñida se confundiría de reojo con cualquiera de los dos —justo lo
que un aim trainer no puede permitirse—. El contraste lo dan relleno blanco puro
contra contorno `#4d4d4d`.

El componente es compartido (`src/ui/Stars.jsx`): el resumen lo usa declarativo y
el HUD reutiliza sólo el trazado, porque necesita refs para encender estrellas
sin pasar por React.

### 21.3 Silueta y munición en una fila

Apilados —silueta, nombre, munición— ocupaban unos 110 px de alto para la misma
información que ahora cabe en 59. En una sola fila, silueta a un lado y cargador
al otro, el bloque estorba menos justo donde más se mira.

El **nombre sale de la fila** y baja a rótulo de 9 px debajo. La silueta ya
identifica el arma de un vistazo; el texto sólo competía por sitio. Por eso
`WeaponSilhouette` dejó de pintar su propia etiqueta: es un componente de
silueta, y meter un rótulo dentro rompía cualquier disposición horizontal. Quien
la coloca decide si hace falta nombre y dónde.

### 21.4 El renombrado arrastró dos suites viejas

Al unificar las estrellas en `.star` y sacar `.weapon__label`, dos suites de
rondas anteriores fallaron por buscar clases que ya no existen. No era producto
roto: era la prueba mirando a un sitio que se movió.

Se actualizaron los selectores en lugar de borrar las comprobaciones. Una suite
que se desactiva al primer renombrado deja de vigilar justo cuando más falta
hace.

## Ronda 22 — Sesgo hacia delante y patrullas por grupo

### 22.0 Dos premisas del encargo que no existían

El encargo pedía "sustituir cualquier ruta declarada de la vuelta anterior" y
daba por hechos unos "footsteps espaciales ya construidos". **Ninguna de las dos
cosas existía.** No había rutas, y de los pasos sólo hay una mención en
`spatial.js` como uso futuro del módulo — `CLAUDE.md` §6 los sigue listando fuera
de alcance.

Se construyeron los grupos y se dejaron los pasos donde estaban, que además
habrían sido audio y la vuelta lo excluía explícitamente. Misma lección que la
ronda 10: cuando falta una entrada, se dice; construir sobre una suposición sale
más caro que declarar el hueco.

### 22.1 El sorteo uniforme repartía la mitad de las dianas a la espalda

Sortear entre **todos** los visibles trataba igual lo que tienes delante y lo que
tienes detrás. Medido en el Plano A con el sesgo apagado: **34%** de las
apariciones caían dentro del cono frontal. Girarse a ciegas no es apuntar.

Ahora, con probabilidad `SPAWN.forwardBiasChance`, el sorteo se restringe a los
que caen dentro de `SPAWN.forwardBiasConeDeg`; el resto de las veces, al conjunto
completo. Medido: **93%, 91% y 97%** en los tres puestos donde hay candidatos en
el cono.

Tres decisiones dentro de eso:

- **El ángulo se mide sólo en horizontal.** Con un cono 3D, mirar al suelo dejaría
  de considerar "delante" lo que tienes justo delante.
- **Si no hay ningún candidato visible en el cono, se cae al conjunto completo.**
  Antes quedarse sin diana que ser fiel al sesgo. Pasa de verdad: desde La Puerta
  mirando al sur, la Espina tapa todo lo que cae en el cono.
- **La economía de raycasts se conserva.** Se sigue barajando y cogiendo el
  primero visible (§14.3), sólo que sobre un subconjunto. El subconjunto se
  acumula en un `Int32Array` preasignado: elegir sigue sin alocar.

*Medido de paso:* desde el spawn, los dos anclajes del Vestíbulo quedan a 66° y a
la espalda, así que **la primera diana de cada sesión nunca entra en el cono**.
Es el momento más visible de la partida y el sesgo no llega. Se deja anotado: la
colocación de anclajes no era de esta vuelta. → Resuelto en §23.

### 22.2 Grupos de puntos, no rutas: cada par verificado

Un muñeco que camina necesita saber que puede llegar. Las dos salidas eran
pathfinding —caro y complejo para cinco dummies— o **garantizar la premisa**:
todos los puntos de un grupo mutuamente alcanzables en línea recta.

Con esa garantía, moverse es elegir otro punto al azar y andar. No hay
comprobaciones en el bucle, no hay atascos posibles y no hay una sola línea de
navegación.

La verificación es una auditoría geométrica —la misma familia que la de anclajes
(§14.10)—: se muestrea el segmento cada 0.25 u y se exige (1) que ninguna caja
corte el cuerpo del muñeco a su altura y (2) que la altura del suelo no cambie,
lo que impide de paso que un muñeco del Balcón camine por el aire. Con radio de
0.6 u, que es lo que ocupa. **42 pares y 44 entradas** comprobados.

### 22.3 Los anclajes son entradas al grupo, no miembros

Primer intento: que el anclaje fuera un punto más del grupo. No funciona, y la
geometría lo dice a gritos: las **dos troneras del Balcón** no se ven entre sí
—el labio del parapeto se interpone— así que nunca podrían estar en un conjunto
donde todos los pares están limpios.

La versión correcta: el anclaje es una **entrada**. El muñeco nace ahí, sale al
grupo y ya no vuelve; lo que hay que verificar es que la entrada ve a todos los
puntos, no que las entradas se vean entre sí. Con eso las dos troneras comparten
grupo, cada una entrando por su propio hueco.

### 22.4 La geometría decidió cuántos grupos hay, no el encargo

El encargo pedía "un conjunto por zona". La auditoría dijo que no se podía:

- **Los Cajones** están partidos por una divisoria Alta —puesta ahí en la ronda
  14 justo para partirlos en dos bolsas—. Ninguna recta las cruza.
- **La Puerta** tiene la Espina entre sus dos bocas, y el único paso es un hueco
  de 4 u demasiado estrecho para garantizar cualquier recta.

Así que son **siete grupos para cinco zonas**: `cajonesOeste`/`cajonesEste` y
`puertaOeste`/`puertaEste` van por separado. Forzar uno por zona habría sido
prometer un camino que no existe, y el muñeco se habría quedado empotrado contra
la divisoria en la primera partida.

Por lo mismo, **dos anclajes se quedan sin grupo** (`largo-2` y `vestibulo-e`):
desde donde están no hay conjunto limpio que los acoja. Dan muñecos quietos, que
es el comportamiento de siempre. La geometría manda; donde no hay conjunto, no
hay patrulla.

### 22.5 El plazo del destino se calcula del tramo

`_pickDestination` usaba un tope fijo de `TARGET.moveMaxSeconds` que reelegía
destino a mitad de camino. Para una patrulla eso rompe la premisa —"al llegar a
un punto, elige otro"— así que el plazo pasa a salir de la distancia real
(`distancia / velocidad`, con el doble de margen). Sigue existiendo como red de
seguridad, pero ya no dispara en uso normal.

Sólo patrullan los muñecos **anclados al suelo**. Una esfera flotante caminando
entre cajas no tendría ningún sentido, y clásica y cono siguen quietas en
escenario, como estaban.

## Ronda 23 — La primera diana, delante

### 23.1 El sesgo no puede apuntar donde no hay nada

La ronda anterior dejó el sesgo hacia delante funcionando y un agujero anotado:
desde el punto de aparición **sólo se ven dos anclajes**, los dos del Vestíbulo,
y estaban a 66° y a la espalda. Da igual lo bien que sesgue el sorteo si el
único conjunto del que puede elegir está fuera del cono. La primera diana de
cualquier sesión —lo primero que ve quien prueba el mapa— salía siempre detrás.

### 23.2 La divisoria sella el cono frontal a 9.2 u

Antes de mover nada se barrió la sala entera: rejilla de 0.5 u sobre los 80×80,
filtrando por cono de `SPAWN.forwardBiasConeDeg`, fuera del volumen del tablero
de acciones, cuerpo del muñeco libre de geometría, suelo a nivel, y el **test de
visibilidad real del motor** (`_isAnchorVisible`, no una aproximación).

Resultado: **65 posiciones válidas, y ninguna más allá de 9.2 u del spawn.**

El porqué es geométrico y vale la pena dejarlo escrito, porque acota lo que se
puede hacer en el Vestíbulo sin tocar el plano:

- La **divisoria Alta** ocupa x −4..16 en z 22..23.5 y mide 3.6; el ojo del
  jugador está a 1.7. No se ve por encima ni de lejos: para asomar la línea de
  visión por su borde superior a 4.5 u haría falta subir 1.9 u en esos 4.5, y
  esa misma pendiente estaría a 25 u de altura al llegar al Balcón.
- Para **rodearla por el oeste**, la visual tiene que pasar de x ≤ −4 en z 23.5,
  lo que exige |x| ≥ 0.889·(28−z). El cono de ±50° impone |x| ≤ 1.19·(28−z).
  Queda una cuña estrecha, y dentro de ella la **Espina** (x −15..−13.5, z 0..22)
  corta: cruzarla por el norte pediría |x| > 2.25·(28−z), incompatible con el
  cono. Contradicción, sin margen.
- Por el **este** no hay discusión: de x 18 a la pared está el volumen reservado
  del tablero de acciones.

Así que el cono frontal desde el spawn es un embudo cerrado de nueve unidades de
fondo. Los dos anclajes se ponen en el punto más lejano de cada lado de ese
embudo: `vestibulo-o` en (−6.5, 22), a 8.8 u y 47.3°, justo en la esquina oeste
de la divisoria; `vestibulo-e` en (2, 24.5), a 4 u y 29.7°, el más centrado de
los que pasan de 4 u. Los dos se ven de golpe, sin mover el ratón, desde el
punto de aparición.

**El precio se paga y se dice:** son dianas de corta distancia. No hay ninguna
alternativa dentro de las restricciones —lo dice la barrida, no una estimación—
y la única forma de tener una primera diana lejana *y* de frente es tocar el
plano: abrir un hueco en la divisoria, acortarla por el oeste, o mover el spawn.
Eso es rediseño del Plano A y no era de esta vuelta. → Hecho en §24.4: la
divisoria se fue entera al este del spawn y estos dos anclajes volvieron a los
flancos.

### 23.3 Un guardia que salta es un guardia que hay que reescribir, no borrar

El barrido de la ronda 14 dejó dos aserciones —una en `audit.mjs`, otra en
`fixes.mjs`— exigiendo que **ningún anclaje estuviera a menos de 10 u** del
spawn. Esta vuelta las rompe a propósito.

No se borran: se reescriben con la regla nueva. Fuera del Vestíbulo el mínimo de
10 u sigue en pie; dentro, el mínimo pasa a 4 u —que es "no encima del
jugador"— y se añade la aserción que de verdad protege lo que se acaba de
conseguir: **los dos anclajes del Vestíbulo caen dentro del cono frontal medido
desde la dirección inicial de la mirada.** Una excepción declarada y comprobada
vale; un test borrado no deja rastro de por qué.

### 23.4 Lo que no cambió

El sesgo de selección, los grupos de patrulla y el resto del Plano A se quedan
igual. `vestibulo-o` sigue siendo la entrada del grupo `vestibulo` y desde su
posición nueva sigue viendo los cuatro puntos del grupo: verificado, 6 pares + 4
entradas limpios.

## Ronda 24 — El Plano A a 40×40, y el salto encadenado

### 24.1 Acercar la cobertura no encoge un mapa

El Plano A se caminaba demasiado: cruzarlo en diagonal eran **16.8 s** a marcha
de carrera, casi todos sobre suelo vacío entre pieza y pieza.

La tentación era juntar la cobertura dentro de los mismos 80×80. No sirve: deja
el mismo anillo de suelo caminable por fuera, y el jugador lo sigue cruzando. Lo
que hay que reducir es **el límite jugable**, y ése lo pone la sala.

Así que la sala deja de ser una constante global y pasa a ser **una propiedad del
escenario**: `ROOM` sigue siendo la de la sala vacía, `SCENARIOS.x.room` la del
que la traiga, y `scenario.room` el único sitio del que se lee. De ahí cuelgan
cinco cosas que antes leían `ROOM` a pelo:

- la rejilla y las paredes (`scene.js` pasa a exponer `setRoom`, y se
  reconstruyen enteras: escalar el grupo dejaría el paso de la rejilla en algo
  distinto de una unidad y el suelo ya no serviría de sistema de coordenadas);
- el acotado del movimiento contra las paredes;
- el acotado del muestreo de dianas por cono;
- las medidas del tablero de acciones;
- el plano cenital del selector, que ahora dibuja la planta real de cada
  escenario en vez de meter una de 40 dentro de un lienzo de 80.

Medido después: diagonal jugable **52.3 u contra 108.9**, el 48%; superficie
jugable, el **23%**; cruzarlo, **8.1 s**.

### 24.2 Lo que se encoge es el suelo, no la cobertura

«Misma cantidad de cobertura, menos superficie» no se consigue escalando todo por
0.5: eso deja el mapa idéntico, porque el jugador no se encoge con él. Un hueco
de puerta de 4 u pasaría a 2 y una Media de 7 de ancho a 3.5, poco más que un
cuerpo.

La regla que se siguió es la que distingue **estructura de mobiliario**:

- Lo que cruza el mapa por definición —la Espina, la divisoria, la plataforma del
  Balcón, el parapeto— **sí** se escala: su trabajo es cruzarlo.
- El mobiliario —los cajones, las Media, los bordillos— conserva tamaño de
  cuerpo: 3×3 un cajón, 4.5×2 una Media. El grosor de los muros incluso sube en
  proporción, y se lee mejor.

Las veinte piezas siguen siendo veinte. Lo que desapareció es el suelo entre
ellas.

### 24.3 Dos rampas, porque una obliga a un rodeo

El Balcón tenía un solo acceso, en el extremo este. Subir desde el oeste era
recorrer la cara entera del parapeto por delante, a la vista de las dos troneras.
Ahora hay una rampa en cada extremo, y los dos huecos de parapeto que dejan sus
bocas son parte del diseño, no un descuido.

De paso, las troneras pasan de 2.5 a **4 u**. Por una tronera no sólo se dispara:
también se sale a patrullar, y un muñeco mide 1.2 u de cuerpo. Con 2.5 quedaban
0.65 u a cada lado, las salidas en diagonal rozaban el labio del parapeto y el
grupo de patrulla compartido del Balcón —el que justifica que las dos troneras
compartan grupo— no tenía solución limpia. Por lo mismo, la plataforma pasa de 6
a 7 u de fondo.

### 24.4 La divisoria del Vestíbulo, entera al este

En la ronda 23 quedó anotado que la divisoria sellaba el cono frontal desde el
spawn y que la única salida era tocar el plano. Esta vuelta **es** ese rediseño,
así que se hizo.

La divisoria ya no cruza por delante del punto de aparición: arranca en x 2.5, a
su este, y deja el paso central abierto. El efecto es inmediato — desde el spawn
se ven `tronera-e` a 27 u y `cajon-2` a 13, de frente, y de ahí sale la primera
diana el 85% de las veces. Los dos anclajes del Vestíbulo, que en la ronda 23
hubo que meter a la fuerza dentro del cono a 8.8 y 4 u, vuelven a los flancos.

Dos ajustes que salieron de mirarlo, no de calcularlo:

- **Abrir la divisoria dejó un carril recto de 26 u** desde el spawn hasta la
  cara del Balcón: medio mapa de galería de tiro. Las dos Media de aproximación a
  La Puerta se escalonaron sobre el eje del spawn para romperlo.
- **Y arrancaba en x 1, no en 2.5.** Un muro Alta que entra en el encuadre a 24°
  de la mirada inicial se come un tercio de la pantalla a dos metros de la cara.
  Desde x 2.5 entra a 43°, ya en el borde. Esto no lo dice ninguna auditoría: se
  vio en una captura.

### 24.5 El tablero de acciones se escala con la sala

Con la sala a 40, el tablero medía 19.8 u de ancho —media planta— y su volumen
reservado se comía Los Cajones enteros. `scale`, `distance`, `minDistance` y
`height` pasan a derivarse de `room.width / ACTION_PANEL.referenceRoomWidth`
(`actionPanelMetrics`), así que el tablero se ve **igual de grande desde el
jugador** en cualquier sala —mismo ángulo, misma altura de mirada— y con la de 80
salen exactamente los valores de siempre.

### 24.6 Un umbral en unidades sueltas se rompe al reescalar

Las auditorías estaban llenas de números atados a la sala de 80: «ningún anclaje
a menos de 10 u del spawn», «a 8 u o más del tablero», «ningún sitio del
explosivo a menos de 20 u». En una sala de 40, 10 u alrededor del spawn es un
cuarto del mapa. Todos pasaron a fracciones de `room.width`.

Y peor: los tests escribían coordenadas del plano a mano —la Espina en x −15, la
rampa en x 29, el borde del Balcón en z −29—. Un test que sabe dónde está la
Espina no prueba la Espina, prueba un número, y al reescalar falla sin haber roto
nada. Ahora se localizan en los datos: la Espina es *la caja Alta más larga en Z
que en X*, las troneras son *los huecos entre tramos de parapeto*, el borde del
Balcón es *la cara norte de la plataforma*. Tres fallos de esta vuelta eran
exactamente eso, y uno —el jugador arrancando en x −36, fuera de una sala de
40— se presentaba como una expulsión que no existía.

De los que sí eran reales: una Media plantada encima de la rampa nueva la dejaba
intransitable a media altura, y un sitio del explosivo quedaba dentro de un muro.

### 24.7 Tunelado: una comprobación que antes no hacía falta

`resolveAxis` comprueba el choque contra la **posición propuesta**, no contra el
recorrido. Con muros de 1.5 u eso nunca importó; con muros de 1.2 conviene
dejarlo comprobado, porque es el tipo de cosa que se rompe callando. El peor paso
posible es `MOVEMENT.speed` por el delta máximo que admite el bucle (100 ms):
**0.65 u**, contra 1.2 de muro más 0.8 de cuerpo. Hay margen de tres veces, y
ahora hay una aserción que lo vigila.

### 24.8 El salto encadenado conserva; no hay forma de que acelere

El encargo pedía explícitamente que encadenar no permitiera acelerar sin
límite. La forma de garantizarlo no es poner un tope: es que **no haya nada que
lo suba**.

Un encadenado cambia una sola cosa: `_airSpeed` sale de la marcha que se traía al
aterrizar en vez de recalcularse desde el suelo. Y como `_airSpeed` sólo puede
nacer de `currentSpeed` —que nunca pasa de `MOVEMENT.speed`—, por inducción
ninguna cadena, de la longitud que sea, puede superar la marcha de carrera. Doce
encadenados seguidos dan 6.5 doce veces.

Lo que sí cambia es el *feel*: llegar agachado ya no te tira la marcha a 2.6 si
aciertas el tiempo. Eso es lo que se siente como bunny-hop.

Dos decisiones dentro:

- **La pulsación se gasta al despegar.** Sin eso, dejar SPACE apoyada encadenaría
  solo en cada aterrizaje y el timing no pintaría nada. Mantener la tecla sigue
  rebotando exactamente como antes, con saltos normales.
- **La ventana vale a los dos lados.** Pulsar un pelo antes de tocar el suelo
  cuenta igual que un pelo después. Con sólo el lado de después, encadenar es un
  reflejo; con los dos, es un ritmo.

### 24.9 El instante del aterrizaje tampoco puede depender del monitor

Es la misma trampa de la ronda 17, un escalón más arriba. La velocidad de
impacto ya salía de la energía y no del frame que detecta el suelo; el
**instante** seguía siendo el del frame, que llega hasta un refresco tarde —16.7
ms a 60 Hz, 4.2 a 240—. Medir una ventana de 130 ms contra esa marca la haría
sistemáticamente más generosa cuantos más FPS tuvieras.

Se despeja de la parábola, igual que la velocidad:

    ½·g·t² − v0·t + (suelo − y0) = 0   →   t = (v0 + velocidadDeImpacto) / g

y lo que sobra respecto al tiempo de vuelo acumulado es el retraso del frame, que
se descuenta del reloj. El otro extremo, la pulsación, sale de `event.timeStamp`
—el instante real del teclado, no el del frame que lo atiende—, y los dos viven
en el mismo origen de tiempos.

Medido por bisección sobre el offset de la pulsación: el umbral sale en
**130.00 ms** a 60, 144 y 240 Hz, a los dos lados, con una diferencia de
**0.000 ms** entre refrescos. Contra los 16.67 ms que dura un frame a 60 Hz.

## Ronda 25 — La colisión, de verdad

### 25.1 Tres fallos distintos disfrazados de uno

El parte era «el jugador entra dentro de la cobertura de pie y agachado, y
atraviesa la rampa», con la sospecha de que `COVER.stepHeight` se estuviera
aplicando demasiado suelto o chocando con la altura de agachado.

**La sospecha se descartó con el código.** `stepHeight` entra en la colisión como
`reach = feetY + stepHeight`, y `reach` no depende de la altura de ojos: agachado
sólo cambia `headY`, que afecta a piezas cuyo **suelo** queda por encima de la
cabeza —en el Plano A, sólo los parapetos, y el jugador los pisa desde la
plataforma—. De pie en el suelo, `reach` vale 0.25 y la pieza más baja del plano
mide 0.6: ninguna se vuelve pasable. Un barrido de 136 embestidas frontales lo
confirmó: cero.

Lo que sí había eran tres cosas, y ninguna era la sospechada:

**(a) Una cara de muro que dejaba de bloquear por coma flotante.** La regla «a
quien ya estaba dentro no se le empuja» se comprobaba como
`from + radius > minA && from - radius < maxA`. Al frenar contra una cara, `from`
queda exactamente en `minA - radius`; volver a sumarle el radio **no siempre
devuelve `minA`**. Con la Media de x −1: `-1.4 + 0.4` da `-0.9999999999999999`,
que es mayor que −1, así que al segundo frame de contacto el muro se declaraba
«ya atravesado» y dejaba pasar. Medido en las 34 caras del plano: **le pasaba a
una**, y a las demás no porque redondeaban al otro lado. Un bug que se mueve de
sitio cada vez que se toca la geometría.

**(b) Las rampas no eran colisión.** Vivían sólo en `this.ramps`, que consume
`groundHeightAt`; `resolveAxis` ni las miraba. 148 de 5088 recorridos acababan
dentro de la cuña. No es que la rampa fuera blanda: es que no existía para la
colisión.

**(c) La horizontal y la vertical no admitían los mismos sitios.** La horizontal
corre primero y decide con los pies donde están; la vertical corre después, con
los pies un frame más abajo. Saltando contra un cajón Baja, la horizontal daba
por bueno el paso «por encima» y la vertical, ya caída, se negaba a levantar: el
jugador se quedaba **hundido dentro del cajón**. Es exactamente el síntoma del
parte, y el único de los tres en el que `stepHeight` tenía algo que ver — no por
ser laxo, sino por medirse en dos instantes distintos.

### 25.2 Una sola cuenta para las dos reglas de siempre

Las dos reglas que ya había —no empujar hacia atrás, dejar salir a quien esté
dentro— se reescriben como una: en cada eje la pieza ocupa la banda
`[minA − radio, maxA + radio]` y lo único que se decide es si el paso **mete más**
al jugador en ella.

- Si el destino no toca la banda, no hay choque.
- Si venía de fuera, se frena en la cara por la que entraba.
- Si ya estaba dentro de la banda, no se le empuja: sólo se le impide hundirse
  más hacia la cara que tiene más cerca.

Nada compara la posición con la caja engordada, así que (a) desaparece por
construcción. Y el tercer caso es el que cierra un agujero que el diseño anterior
tenía abierto: **aterrizar rozando una pieza** —centro fuera, cilindro dentro— se
trataba como «ya estaba dentro» y abría la puerta de par en par. Con la regla
nueva, rozar sólo impide hundirse más.

La garantía vieja se conserva y ahora se comprueba entera, no con un caso suelto:
resolver un eje devuelve **siempre** una posición entre el origen y el destino.
1904 casos en la auditoría.

### 25.3 La rampa: sólida por debajo y por los costados

Estorba cuando su superficie en el punto de llegada sube más de un escalón por
encima de lo que el jugador ya pisa. Dos matices que costaron una vuelta cada uno:

- **Más lo que la rampa gana de altura en el tramo recorrido.** Sin ese término,
  el margen se lo come el tamaño del paso: a 60 Hz la rampa sube 0.05 u por
  frame y cabe en el escalón, pero con el delta máximo que admite el bucle sube
  0.28 y no cabe. La rampa se volvía intransitable a pocos FPS. Verificado a 20,
  30, 60, 144 y 240 Hz.
- **Pero sólo si ya estás encima.** Al entrar desde fuera no hay crédito de
  pendiente, porque `groundHeightAt` tampoco lo tiene: con él, se podía poner un
  pie en un punto de la cuña que el suelo luego se negaba a levantar.

Y la altura se mide en el **centro** del jugador, no medio cuerpo por delante, por
la misma razón: `groundHeightAt` decide por el centro, y mirar más allá hacía este
test más severo que aquél — a 20 Hz el primer paso dentro de la rampa ya veía
0.26 u de cuña y declaraba muro.

### 25.4 Lo que la resolución por ejes sigue dejando pasar, y por qué está bien

Resolver un eje cada vez valida cada uno con la coordenada del otro a medias, así
que una diagonal puede acabar con el **cilindro** solapando una esquina mientras
el centro sigue fuera. Eso no se ha eliminado, y no se va a eliminar empujando:
empujar es el teletransporte de la ronda 18.

Lo que sí se puede es acotarlo, y está acotado **por el radio del cuerpo**: en
cuanto el centro entra en la huella, `groundHeightAt` devuelve el techo de la
pieza y el jugador aparece encima. Un roce nunca crece hasta ser un
atravesamiento. Medido: 0.373 u andando y 0.400 en el aire, contra un radio de
0.400.

### 25.5 La auditoría

`colision.mjs`, con el mismo método que las de geometría: barrer y medir.

- **7584 recorridos** a pie y agachado, a 60 y 144 Hz, desde una rejilla de 3 u
  por todo el mapa y en 12 direcciones.
- **238 saltos** contra cada pieza desde 8 ángulos, a 60 y 240 Hz.
- Las dos rampas, subidas a 20, 30, 60, 144 y 240 Hz.
- Sus costados, embestidos a media altura.
- Y los dos fallos concretos como guardia de regresión: frenar contra cada una de
  las 34 caras del plano y volver a empujar, y cruzar la rampa por el costado.

Cero atravesamientos en los tres estados.

## Ronda 26 — Rutas con puntos-spawner

### 26.1 Dos listas para lo mismo

Había dos vocabularios: **anclajes** curados —dónde nace una diana— y **grupos de
patrulla** —por dónde camina—, cada uno con sus datos, su resolución en
`scenario.js` y su auditoría. Y un efecto raro de tener los dos: un muñeco
patrullaba por sitios donde nunca podía nacer, y nacía en sitios por los que nunca
pasaba. Los grupos eran además la única parte del escenario que no se podía
auditar entera con la misma regla, porque los anclajes eran «entradas» y no
miembros.

Ahora hay una sola cosa. Un escenario declara **rutas**, una ruta es un conjunto
de puntos con cada par alcanzable en línea recta, y **cualquier punto de
cualquier ruta es a la vez sitio de aparición y destino de patrulla**. La
garantía de la ruta es la que permite mover sin pathfinding —elegir otro punto y
andar— y ahora se le exige además lo que se les exigía a los anclajes: suelo a
nivel, cuerpo libre de geometría, fuera del volumen del tablero, lejos del spawn
del jugador y dentro del área jugable.

`zone` y `peek` pasan a ser de la ruta, que es de quien eran de verdad: describen
una zona del mapa, no un punto suelto.

### 26.2 Cuántas caben: 14 rutas y 69 puntos, medidas

No se eligió una cifra. Se barrió el mapa con el mismo método que todo lo
geométrico en este proyecto: rejilla de 1 u sobre el área jugable, candidatos que
pasen las cinco condiciones de aparición, grafo de alcanzabilidad en recta y
partición voraz en cliques, con cuatro restricciones de diseño:

- **4 a 6 puntos por ruta**, que es el tamaño con el que ya se trabajaba.
- **2.5 u de separación** entre puntos: dos muñecos no se solapan.
- **10 u de diámetro máximo** por ruta. Sin este tope el barrido junta puntos a
  21 u —alcanzables en recta, sí, pero cinco segundos de carrera—: una ruta es una
  zona de patrulla, no una travesía.
- **Áreas de rutas disjuntas.** Sin esto salían 17 rutas entrelazadas, y dos
  rutas entrelazadas son dos muñecos patrullando encima el uno del otro, que tira
  por tierra lo único que el sistema promete.

Resultado: **14 rutas, 69 puntos**, repartidos por las seis zonas —El Balcón 4,
Los Cajones 3, El Largo 2, Pasillo trasero 2, Vestíbulo 2, La Puerta 1—. Para
comparar: con el sistema viejo había 13 anclajes y 28 puntos de patrulla, y sólo
los 13 servían para aparecer.

*Sin el tope de diámetro y sin áreas disjuntas el barrido llega a 18 rutas y 92
puntos. Se anota porque es el techo real de la geometría, no porque sirva.*

### 26.3 Tres preferencias, en orden

Al elegir dónde nace una diana:

1. **Delante**, con `SPAWN.forwardBiasChance` — el sesgo de la ronda 22, intacto.
2. **Rutas libres**: entre los candidatos, los de rutas por las que no patrulle ya
   otro muñeco.
3. **Nunca donde caíste**: el punto donde murió ese mismo muñeco queda
   descartado. Es regla dura — si no queda otro sitio no se aparece y se
   reintenta, antes que reaparecer bajo el punto de mira de quien te acaba de
   matar. Medido: 594 muertes y reapariciones, **cero** repeticiones.

El orden importa y es una decisión, no un descuido: **el sesgo manda sobre la
preferencia de ruta**. Dentro del cono caben 2-5 rutas, y con cinco muñecos vivos
no siempre hay una libre delante; anteponer la ruta libre habría significado
mandar dianas a la espalda para repartir mejor. Medido: con el sesgo apagado se
reparte el **100%** de las veces que hay rutas libres visibles, y con el sesgo
puesto el **42%**. Si algún día se prefiere lo contrario, es cambiar el orden de
dos pasadas.

### 26.4 El sello de visibilidad

Las pasadas encadenadas —delante-libre, delante-cualquiera, todo-libre,
todo-cualquiera— vuelven a mirar puntos ya descartados, y cada comprobación es un
raycast contra toda la geometría. Con 13 anclajes daba igual; con 69 no: el peor
caso medido eran **148 raycasts y 2 ms** en el frame de una aparición, diez veces
el presupuesto de frame del proyecto.

Un sello por elección —un entero que se incrementa y se compara— hace que cada
punto se mire como mucho una vez. Peor caso: **33 raycasts, 0.4 ms p99**. Sin
asignar memoria y sin cambiar el resultado del sorteo.

### 26.5 Un fondo de saco que el barrido encontró solo

Barriendo desde dónde se ve algo —361 puestos del mapa— salieron **3 ciegos**,
los tres en el mismo sitio: el fondo del Largo, entre el extremo sur de la Espina
(z −11) y la plataforma del Balcón (z −12). Queda una ranura de **1 u** por la que
pasa el jugador —cuerpo de 0.8— y no pasa un muñeco —1.2—, y el hueco libre entre
la Media del fondo y la plataforma mide 0.8 u de ancho, así que ahí no cabe
ninguna ruta ni se ve ninguna.

De propina, el sitio del explosivo `largo-fondo` está justo dentro.

No se ha tocado: es geometría del Plano A y esta vuelta era de colisión y de
rutas. Queda medido en `spawner.mjs` con su aserción —«los ciegos que haya están
todos en el mismo sitio»— para que se note el día que se mueva algo, y anotado en
`CLAUDE.md`. Arreglarlo es subir el extremo sur de la Espina o bajar el borde de
la plataforma un par de unidades.

## Ronda 27 — La pestaña no se cerraba: la cerraba Ctrl+W

### 27.1 Lo que se buscó, y lo que se encontró

El parte: pulsando Salto / Agacharse alternados muy rápido, **la pestaña del
navegador se cierra entera** —no el juego, la pestaña—. Reproducido dos veces en
Edge, intermitente. La sospecha razonable era un NaN o un infinito colándose en
la intersección de las tres cosas más tocadas en las últimas vueltas: el salto en
forma cerrada, el encadenado y la colisión unificada.

Se buscó a fondo. Un fuzzer sobre el motor real, alternando salto y agachado con
probabilidad 0.4 por frame, deltas de **0 a 100 ms** —el frame de duración nula
incluido a propósito, que es el caso límite de cualquier división por tiempo—,
desde posiciones aleatorias de todo el mapa, incluidas rampas y bordes de
plataforma: **medio millón de frames, cero valores no finitos**. Ni en el
jugador, ni en las dianas, ni en sus destinos. Con el bucle de verdad corriendo
—rAF, render, CSS3D, audio— y teclas reales, tampoco: memoria plana en 16 MB, la
transformada del tablero siempre sana, ningún crash.

La causa es otra, y estaba escrita en el propio repositorio desde la ronda que
montó el movimiento:

> «**Ctrl+W cierra la pestaña en Chrome y no hay forma de impedirlo desde la
> página** — y agacharse avanzando es justamente Ctrl+W.»

Agacharse estaba mapeado a `ControlLeft`/`ControlRight`. Avanzar es `KeyW`.
Agacharse mientras avanzas **es** Ctrl+W, que Chrome y Edge resuelven en el
proceso del navegador antes de que el evento llegue a la página: `preventDefault`
no lo toca. Ctrl+A, Ctrl+S y Ctrl+D —las otras tres direcciones— sí se dejan
neutralizar; W es la excepción.

Y explica lo que ninguna teoría de NaN explicaba: **por qué es intermitente**.
No depende de la velocidad de la alternancia ni de repetirla tres o cuatro veces;
depende de si W está pulsada en el instante exacto en que baja CTRL. Jugando se
está moviendo casi siempre; probándolo a propósito, quieto, no pasa.

La mitigación que había —mapear también `KeyC`— no servía de nada: dejaba la
tecla peligrosa puesta. Ahora **agacharse es C y sólo C**. Volver a CTRL es
añadir dos cadenas a `MOVEMENT.keys.crouch`, con la mina otra vez dentro.

*Lección, y es de las que se repiten: un aviso en un comentario no es una
mitigación. Si una combinación de teclas puede cerrar la pestaña, la única
mitigación es no pedirla.*

### 27.2 La red de seguridad, igualmente

El encargo pedía además una guarda general: si la posición o la velocidad del
jugador dejan de ser un número finito, corregirlas antes de que lleguen al
render. Se ha puesto aunque el bug fuera otro, porque el razonamiento se sostiene
solo: un NaN en la posición viaja a la matriz de la cámara, de ahí al `matrix3d`
que el `CSS3DRenderer` escribe en el tablero de acciones, y de ahí al compositor
del navegador — que es el único punto de toda la cadena donde un número roto sí
se puede llevar por delante la pestaña entera.

`_guardState()` corre al final de cada `update`, comprueba once campos y, si algo
no es finito, devuelve al jugador al último estado sano —guardado cada frame que
lo es— con el vuelo cancelado: media parábola con un NaN dentro no se puede
continuar. El contador `recoveries` queda expuesto: en juego normal vale cero, y
`estabilidad.mjs` lo comprueba después de 225 000 frames de fuzz y luego fuerza la
rotura en los seis sitios donde se puede romper el estado para ver que salta.

Detalle que salió al escribir el test: romper `landingDip` a `NaN` **no** activa
la red, porque la curva del hundimiento lo multiplica por `_dipFrom`, que sigue
valiendo cero, y sale cero. Hay que romper los dos. No es un agujero —el frame
acaba finito, que es lo que se promete— pero valía la pena entenderlo antes de
escribir una aserción falsa.

### 27.3 Velocidad de patrulla, ajustable

`TARGET.moveSpeed` pasa de constante a **valor por defecto** de un ajuste nuevo,
`patrolSpeed`, con slider en opciones: de 1.5 a 8 u/s, 4 por defecto.

El rango no es simétrico por casualidad. Abajo, 1.5 es un paseo que se sigue sin
esfuerzo. Arriba, 8 queda **por encima de la carrera del jugador** (6.5): ahí es
donde deja de poder acompañarlos, que es el umbral que hace interesante el tope.
Y con rutas de 10 u de diámetro, a 8 u/s el tramo más largo se recorre en 1.25 s,
por debajo de lo cual el muñeco cambia de rumbo más deprisa de lo que se lee.

La pista bajo el slider no dice el número, dice la relación: «por debajo de tu
carrera: los alcanzas», «más rápidos que tú: no los alcanzas corriendo». El
número ya está al lado.

El motor lee `this.patrolSpeed` del store, no la constante, para que el slider
tenga efecto en caliente. Medido: a 2, 4 y 7 u/s un muñeco en ruta recorre 2.00,
4.00 y 6.98 unidades por segundo.

## Ronda 28 — El tablero se apaga, y cada ajuste se restablece solo

### 28.1 `ACTION_PANEL.enabled` no existía

El encargo empezaba con una comprobación, no con un cambio: «oculta el panel de
acciones **de verdad**, por si el aviso anterior no llegó a aplicarse; comprueba
el estado actual de `ACTION_PANEL.enabled` antes de nada». No había tal estado.
`ACTION_PANEL` no tenía ningún interruptor y el tablero seguía entero: DOM en 3D
en la sala, cinco planos de impacto, `follow` y `syncLayout` cada frame y un
raycast propio en cada click. El aviso anterior no llegó al repositorio.

Vale la pena anotarlo por lo que enseña sobre el formato de estas vueltas: un
«por si acaso» del encargo es una hipótesis que hay que verificar contra el
código, no un recordatorio de algo ya hecho. Aquí una de las dos comprobaciones
—el interruptor— era falsa y la otra —el disparo en seco (§28.3)— era cierta.

### 28.2 Apagarlo en el módulo, no en el motor

El motor le habla al tablero desde siete sitios: lo construye, lo ancla al
spawn, lo reancla al cambiar de escenario, le pasa el arma, lo sigue, lo maqueta
y lo consulta en cada disparo. Sembrar esos siete sitios de `if
(ACTION_PANEL.enabled)` deja el interruptor repartido por el fichero más grande
del proyecto, con la garantía de que el octavo sitio se olvidará.

`ActionPanel` lee el flag en su constructor y se vuelve **inerte por dentro**:
no se añade ni a la escena WebGL ni a la del `CSS3DRenderer`, `raycast` devuelve
`null` y `follow` / `syncLayout` / `update` son un `return`. El motor no cambia
ni una línea.

Lo que **no** se apaga es `clearVolume`. El volumen que el tablero reserva en la
sala sigue midiéndose y las auditorías del mapa lo siguen comprobando contra los
69 puntos de ruta. Un tablero apagado cuyo hueco se deja de auditar es un
tablero que, el día que se encienda, aparece dentro de una caja. Cuesta cero y
se conserva la propiedad.

Por lo mismo, la regla «bajo el punto de mira gana lo más cercano» conserva su
prueba: `fixes.mjs` [1] **enciende el tablero a mano** —lo mete en las dos
escenas, lo maqueta y lo vuelve a sacar—, porque lo que hay que preservar es la
regla, no el tablero. Al encenderlo a mano hizo falta un `updateMatrixWorld` que
el juego normal no necesita: dentro de un `evaluate` no pasa ningún frame entre
añadir el grupo y disparar contra él, así que su matriz de mundo seguía en
blanco y los planos quedaban en el origen.

### 28.3 El disparo en seco ya estaba, y ahora está medido

La segunda comprobación del encargo sí estaba aplicada: `playDryFire()` se
llamaba desde `_onMouseDown` una vez por pulsación con el cargador a cero. Pero
estaba comprobada leyendo el código, que es exactamente lo que no basta.

Ahora hay medida. El clic seco es el **único** sonido del juego que usa un
filtro paso alto, así que contar los `BiquadFilterNode` de tipo `highpass`
creados durante una pulsación identifica la voz sin tener que oírla. Medido: 0
con balas, 1 por clic con el cargador vacío, 3 con tres clics, y **3 tras 30
llamadas al bucle de disparo con el gatillo mantenido** — el fuego automático no
lo repite a 600 RPM, que es la parte que de verdad se podía romper.

### 28.4 Un engranaje en el HUD porque ya no hay tablero

Apagar el tablero deja las opciones sin puerta visible: el único camino es ESC.
Bajo el contador de FPS va ahora un **engranaje con la palabra ESC**, al mismo
trazo gris sin relleno que la estrella vacía y la silueta del arma. Es un
rótulo, no un botón: con el ratón capturado no hay dónde pulsarlo.

El engranaje se **calcula** —ocho dientes de cuatro puntos entre dos radios, más
el eje— en vez de pegar un `d` de treinta y dos coordenadas. Un path escrito a
mano no dice de dónde sale ninguno de sus números y cambiar el número de dientes
obliga a redibujarlo entero.

Queda una imprecisión que conviene tener escrita: **ESC pausa**, y el panel de
opciones está a un click desde la pausa. No es que ESC abra las opciones. El
navegador suelta el pointer lock con ESC antes de que la página vea la tecla, así
que hacer que ESC abra directamente las opciones es una decisión de diseño de la
pausa, no un detalle del rótulo.

### 28.5 Un «por defecto» por ajuste

El botón **Restablecer** del final es todo o nada. Trastear con la sensibilidad
y querer volver atrás costaba también el escenario, el arma y la cadencia, así
que en la práctica no se usaba: se volvía a mover el slider a ojo.

Ahora cada fila lleva su propio botón «por defecto», junto a su etiqueta, que
restablece **sólo** ese ajuste. Tres decisiones dentro:

- **El valor sale de `SETTINGS[clave].default`**, el mismo del que parte
  `sanitizeSettings`. Una segunda lista de valores de fábrica es una lista que
  se queda vieja.
- **Deshabilitado, no oculto**, cuando el ajuste ya está en fábrica. Un botón
  que aparece y desaparece cambia el alto de la fila cada vez que se roza un
  slider.
- **Las filas se identifican por clave de ajuste, no por descriptor.** Antes
  cada llamada repetía el nombre del ajuste dos veces —`spec={SETTINGS.x}` y
  `onChange={(x) => onChange({ x })}`—, que es justo la duplicación por la que
  un botón de restablecer puede acabar apuntando a un ajuste distinto del que
  enseña su fila. Con la clave, la etiqueta, el rango, el valor de fábrica y el
  parche salen todos del mismo sitio.

El botón general se queda como estaba.

### 28.6 Miniaturas a la mitad, en columna fija

Los planos cenitales se repartían el ancho del panel entre los escenarios que
hubiera: con dos, casi 280 px cada uno. Eso no es un tamaño, es un reparto — con
cinco escenarios cada plano mediría otra cosa, y los que ya estaban encogerían.

Ahora la rejilla es de **columna fija**: 140 px de plano, la mitad que antes, y
el selector crece **en filas**. Medido en el panel de 598 px: 142 px de plano
frente a los 279 de antes (ratio 0.51), y **el mismo 142 con seis escenarios**.

---

## Ronda 29 — Acelerar en el aire

### 29.1 Por qué esto es una ganancia escalar y no un vector

El air-strafe de Quake o de Source sale de que la velocidad es un **vector**: la
dirección deseada se proyecta sobre la velocidad actual y, si el ángulo entre
las dos es el adecuado, la componente tangencial se suma y el módulo crece. Aquí
no hay vector. Lo horizontal de este juego es una **marcha escalar** más una
dirección que se recalcula cada frame desde las teclas y el yaw — no hay inercia
que proyectar.

Rehacerlo con vector de velocidad sería tocar la colisión, el salto encadenado,
la marcha congelada en el aire y el acotado de la sala: justamente lo que el
encargo dejaba fuera. Así que la maniobra se implementa donde vive la marcha:
`_airSpeed` sube mientras se cumplan las condiciones. Se pierde la sutileza de
que el ángulo óptimo dependa de la velocidad actual; se conserva lo que hace la
maniobra reconocible —estrafear sin avanzar, girar hacia el lado de la tecla,
ritmo en lugar de machaqueo— y el resto del movimiento no se toca.

### 29.2 Se paga por ángulo, no por tiempo

La ganancia es proporcional a los **radianes girados** en la dirección correcta,
no a los segundos con la tecla pulsada. Dos consecuencias, y las dos se querían:

1. Lo que acelera es mover el ratón. Mantener A con la vista clavada no da nada,
   que es exactamente lo que separa la maniobra de «una tecla que corre más».
2. Sale gratis la independencia del refresco, que en este proyecto es regla: el
   ángulo total de un giro es el mismo se dibuje en 35 frames o en 140. Medido:
   **0.942478 u/s de ganancia en 500 ms a 60, 144 y 240 Hz**, diferencia 0 entre
   los tres, y exactamente `airStrafeGainPerRad × ángulo`.

El tope de velocidad angular (`airStrafeMaxYawRateDeg`, 140°/s) se aplica como
`rate · dt` y no «tanto por frame» por el mismo motivo: acotar por frame haría
que a 60 Hz cupiese cuatro veces más giro por segundo que a 240. Y sin tope, un
flick de un frame regalaría el techo entero: medido, 90° de golpe dan
`0.009163` u/s, que es justo lo de un frame a 240 Hz.

### 29.3 El techo, y por qué es una propiedad y no una comprobación

«No debe ser posible ganar velocidad de forma indefinida» se puede intentar por
dos caminos: comprobarlo en cada sitio que toque la velocidad, o hacer que sólo
haya un sitio. Aquí hay uno: **`_updateAirStrafe` es la única función que sube
`_airSpeed`**. Nace de `currentSpeed` (≤ `MOVEMENT.speed`) o de un
`_landingSpeed` anterior, que a su vez fue un `_airSpeed`; por inducción, ningún
camino pasa de `airStrafeMaxSpeed`. `_takeOff` no clampa nada a propósito: un
segundo tope ahí sería una segunda fuente de verdad que se puede desincronizar.

Medido en el peor caso imaginable: **120 saltos encadenados girando a 600°/s**
—cuatro veces más rápido de lo que cuenta— terminan en 9.5 clavado.

### 29.4 Los números

`airStrafeMaxSpeed: 9.5` contra los 6.5 de carrera, un 46% más.
`airStrafeGainPerRad: 0.9` con el tope de 140°/s dan ~1.26 u/s por vuelo
completo, así que subir de la carrera al techo cuesta **tres saltos**: 6.5 →
7.76 → 9.03 → 9.5. Se nota el progreso sin que un salto suelto lo regale.

Conviene no leer el 46% como «se cruza el mapa un 46% antes». Girar **curva la
trayectoria**: en el vuelo medido, el recorrido sube de 3.765 a 4.131 unidades
mientras el desplazamiento en línea recta **baja** a 3.464. Se va más rápido; no
se va más lejos en la misma dirección.

### 29.5 Qué cuenta como «mover el ratón»

El giro se mide sobre `camera.rotation.y`, que además del ratón lleva el empuje
del arma. Se podría haber separado —que `lookControls` acumulase un yaw «sólo de
ratón»— y se ha decidido que no: el retroceso mueve la mira de verdad, su aporte
son décimas de grado con el signo alternando, y separarlo ataría el movimiento a
los controles para nada. Queda anotado por si algún día hay un arma con un
retroceso grande y de un solo sentido.

La regla de activación es la del encargo, literal: **A o D, con W suelta**. S+A
también acelera, porque la regla es «sin avanzar», no «sin nada más». A y D a la
vez no, porque no hay lado.

### 29.6 Dos fallos del banco de pruebas, ninguno del juego

Fiel a §13.6, los dos primeros fallos rojos eran del test:

- La ganancia parecía depender del refresco (0.911 / 0.929 / 0.935). Era el
  frame del **despegue**, en el que el ratón todavía no se ha movido: contarlo
  dentro de la ventana de 500 ms dejaba 29 frames de giro a 60 Hz y 119 a 240.
  Excluyéndolo, los tres dan el mismo número hasta el último decimal.
- El vuelo acelerado parecía cubrir **menos** terreno. Se estaba midiendo el
  desplazamiento en línea recta, y girando el camino es un arco. Midiendo el
  recorrido frame a frame, sale lo que tenía que salir.

---

## Ronda 30 — El logotipo, vectorizado como las armas

### 30.1 Un pipeline, no dos

Las siluetas de armas ya se vectorizaban con potrace desde `Reference/Weapons/`.
Hacer lo mismo con el logo tenía dos caminos: copiar el script y cambiarle las
rutas, o extraer lo común. Se extrajo (`scripts/lib/trace.mjs`): máscara,
opciones de potrace y utilidades de trazado. Dos pipelines con dos juegos de
constantes es exactamente cómo acaban saliendo contornos con distinto nivel de
detalle según de qué carpeta venga el dibujo.

La prueba de que el refactor no cambió nada es la de siempre en este proyecto:
volver a generar `src/ui/weaponPaths.js` y comprobar que sale **byte a byte
idéntico** al que ya estaba versionado.

De paso se arregló algo que estaba roto sin que se notara: `jimp` se usaba en el
script de armas y **no estaba en `devDependencies`**. Funcionaba porque estaba
instalado de refilón; un `npm ci` limpio habría dejado `trace:weapons` sin poder
arrancar.

### 30.2 Dos tintas que el alfa no separa

El logo completo es la marca en blanco con «VEKTOR» en naranja dentro. El
pipeline de las armas saca la máscara del **canal alfa** —opaco es dibujo— y eso
aquí da una sola silueta con las dos tintas fundidas.

La salida es trazar **la misma imagen dos veces**, filtrando por saturación: el
blanco no tiene y el naranja de marca tiene 185 de diferencia entre su canal más
alto y el más bajo, así que un corte por la mitad no puede equivocarse de lado.
Medido sobre la referencia: **0.00% de píxeles a medio camino** entre los dos
colores, porque las letras flotan dentro del triángulo sin tocar sus líneas.

Lo importante de hacerlo así y no trazar la marca por un lado y las letras por
otro: los dos trazados salen de la **misma imagen**, o sea de las mismas
coordenadas, así que comparten `viewBox` y se superponen solos. No hay ni un
número de ajuste manual entre las dos tintas.

Es el único punto del pipeline donde el color decide algo, y decide **partir**
una imagen en dos trazados, no inventar una forma.

### 30.3 `fill-rule: evenodd`, o un disco blanco

Primer render del logo: un círculo blanco macizo con «VEKTOR» encima. El trazado
era correcto; lo que faltaba era la regla de relleno. Potrace mete los huecos en
el **mismo** trazado contando con `evenodd`; con la de por defecto (`nonzero`)
las dos circunferencias y el triángulo se rellenan enteros.

No se había visto nunca porque las siluetas de armas son manchas macizas sin
huecos, y además se dibujan con `fill: none` y un `stroke`.

Va como **atributo del SVG** —en el componente y en el favicon generado— y no en
la hoja de estilos: es parte de cómo se lee el trazado, no una decisión de
aspecto que alguien pueda quitar en un refactor de CSS sin ver qué rompe. Y lo
guarda un test que no mira píxeles: `isPointInFill` respeta la regla de relleno,
así que preguntar si el **centro de la marca está hueco** distingue las dos
situaciones sin ambigüedad. Medido también que una línea horizontal por el medio
sólo toca un 20.5% de tinta: es dibujo de línea, no una mancha.

### 30.4 Relleno, no trazo — al revés que las armas

Las siluetas de armas se dibujan con `stroke` porque su contorno es el borde de
una mancha: pintarlo a trazo da una línea alrededor del arma.

La marca es distinta: **ya es un dibujo de línea**. El contorno que devuelve
potrace rodea cada línea por sus dos lados, así que **rellenarlo** reproduce
exactamente las líneas del original. Ponerle un `stroke` dibujaría dos filos por
cada línea, que a 26 px del HUD es un borrón.

### 30.5 Reducir antes de trazar

Las referencias son de 2000×2000 y el dibujo está hecho a mano alzada. A tamaño
completo potrace persigue el temblor del rotulador: **18.3 KB de trazado** por
marca. Reduciendo a 600 px antes de trazar salen **5.7 KB** con la misma forma a
los tamaños en que se usa (26 px en el HUD, 184 en la pantalla de inicio, 16-32
en la pestaña). El `TRACE_SIZE` está en el script, con el porqué al lado.

### 30.6 Dónde va cada variante

- **Favicon**: la marca en naranja (`#E4462B`, leído de `COLORS.target` para que
  el color de marca no tenga un segundo sitio donde vivir) sobre fondo
  transparente. El favicon anterior era un dibujo provisional hecho a mano en
  SVG; lo sustituye la marca de verdad.
- **HUD**: la marca sola, sin texto, arriba a la izquierda, en el mismo gris
  apagado que el contador de FPS de la esquina de enfrente. Es firma, no
  información: por eso no lleva rótulo y por eso va en el gris apagado y no en el
  blanco de los contadores.
- **Pantalla de inicio**: el logotipo completo a 184 px **sustituyendo** al
  rótulo de texto «VEKTOR». Ya lleva la palabra dentro; repetirla debajo sería
  decirla dos veces. Sigue siendo el `h1` de la pantalla y el SVG lleva su
  `aria-label`, así que para un lector de pantalla no ha cambiado nada. El
  crédito «by FlickLAB» se queda donde estaba, que es lo que acompaña al nombre.

Las dos variantes negras del logo no se usan en el juego —el fondo es
`#0A0A0A`—; se quedan en `Reference/Logo/` como material de marca para fondos
claros.

---

## Ronda 31 — El clic que no se podía oír, y el mapa que se vaciaba

### 31.1 Un sonido que existía y no se podía oír

El parte era «vaciar el cargador y seguir haciendo click no produce ningún
sonido». La vuelta 28 lo había dado por bueno contando nodos de audio: el clic
seco es el único sonido con filtro paso alto, así que contarlos identificaba la
voz. Aquello demostraba que **la función sonaba**; no que un jugador pudiera
oírla.

Midiendo esta vez amplitud en el máster con un `AnalyserNode`, y jugando de
verdad —vaciar el cargador a base de clicks con las tres armas—, salieron dos
datos:

- El clic seco **no es flojo**: pico 0.0993 contra 0.0719 de un disparo, o sea
  **2.8 dB por encima**. El volumen nunca fue el problema.
- Tras vaciar el cargador, tres clicks seguidos daban **0.0000**. Silencio
  absoluto, con Pulse, Rift y Volt.

La causa no era una regresión: nunca se pudo oír. La última bala llama a
`_consumeAmmo`, que **arranca la recarga sola**, y la condición del clic pedía
`!this.reloading`. El estado que la función necesitaba —cargador a cero y sin
recargar— es un estado que el juego no produce en ningún momento. La prueba de
la vuelta 28 lo fabricaba a mano (`e.ammo = 0; e.reloading = false`) y por eso
pasaba.

**La lección, que va a convenciones:** una prueba que monta a mano el estado que
quiere observar puede estar probando una rama inalcanzable. Cuando lo que se
promete es que algo *se oye*, la prueba tiene que salir del juego —pulsar,
vaciar, medir señal— y no de llamar a la función y mirar si hizo lo suyo.

El arreglo es quitar la condición: con el cargador a cero el gatillo suena,
recargando o no. El aviso de «Pulsa R» sí se calla durante la recarga, que ya
está en marcha y el HUD lo enseña. Medido después: los clicks con el cargador
vacío pican a 0.1137 con las tres armas, a un pelo del nivel de un disparo.

### 31.2 El mapa se vaciaba: cupo de zona

Repro del encargo: plantarse en la pasarela del Balcón y no moverse. Medido
antes de tocar nada, campando en las seis zonas con cinco muñecos:

| desde | zonas que llegan a usarse | tiempo con los cinco en una sola zona |
|---|---|---|
| El Balcón | **2** de 6 | **10%** |
| Los Cajones | 5 | 0% |
| El Largo | 4 | 0% |
| Pasillo trasero | 5 | 0% |
| La Puerta | 5 | 0% |
| Vestíbulo | 6 | 0% |

El Balcón es el caso malo y se ve por qué en cuanto se mide la visibilidad desde
allí: **sólo se ven puntos de dos zonas** (20 del Balcón y 4 del Vestíbulo, de 69
puntos). Como las dianas se sortean entre las visibles, el sorteo se queda sin
mapa. No era el sesgo hacia delante: era la visibilidad.

**El mecanismo: un cupo, no una preferencia.** Una zona no puede tener más de
`SPAWN.zoneShare` (0.5) de los muñecos vivos, redondeando hacia arriba, y el cupo
se mide sobre los que **habrá** cuando salga éste. Con dos vivos el cupo es 1, así
que el segundo no puede caer donde está el primero: la garantía es de bulto y no
estadística —en cuanto hay dos muñecos hay dos zonas— y no depende de cuántas
veces se sortee.

Se eligió un cupo y no «repartir a partes iguales» porque el encargo pedía
explícitamente que el sesgo hacia delante siguiera haciendo una zona más
probable. Un cupo no reparte: sólo pone un techo. Dentro de él, el sesgo sigue
mandando exactamente igual.

**La salida de emergencia.** Si con el cupo puesto no queda ningún punto visible,
el muñeco sale **donde no se ve**. Es el único caso en que eso pasa, y es la
respuesta al campeo: significa que el jugador está en un sitio desde el que sólo
se ve una zona, y la alternativa era dárselos todos ahí. Medido: con el cupo de
serie esa salida no llega a hacer falta en ninguno de los seis puestos; apretando
`zoneShare` a 0.34 —tres zonas obligatorias con cinco muñecos— sí, y entonces el
27% de las apariciones son a ciegas y caen a 9.6 u del jugador, más lejos que el
más cercano de los normales (1.8 u, que es lo que ya había antes de esta vuelta).

**Una cuarta preferencia, blanda: no repetir la zona del último.** El cupo no
dice nada cuando sólo hay un muñeco vivo, y con x1 todas las reapariciones
seguían cayendo arriba. Se intenta primero descartando la zona del último que
salió; si no hay sitio, se relaja. Con x1 desde el Balcón el reparto pasó a ser
**60/60** entre las dos zonas visibles.

Esa pasada **exige ruta libre**: cambiar de zona no vale tanto como para meter a
dos muñecos en el mismo recorrido. Sin esa condición el reparto por rutas caía
del 100% al 97%; con ella, y esto fue una sorpresa agradable, el reparto **con el
sesgo puesto** subió del 42% al 98%.

**Resultado.** Campando en las seis zonas con x2, x5 y x8, y en el Balcón con 150
muertes seguidas: **ni una sola muestra** con todos los muñecos en la misma zona,
frente al 10% de antes. Desde el Balcón el reparto entre las dos zonas visibles
es 81/73, cuando antes era 88/36 a favor de la de arriba.

**Lo que cuesta.** Descartar la zona llena obliga a mirar más lejos: de 3.3 a
12.6 raycasts por aparición, y de 0.4 a 0.7 ms p99 **por aparición** —no por
frame— medidos en la misma página y la misma máquina. Un frame a 240 Hz son
4.17 ms, así que una aparición sigue cabiendo de sobra.

### 31.3 Dos fallos de las pruebas viejas, los dos legítimos

- `spawner.mjs` exigía que sin sesgo cada muñeco fuese a su ruta **siempre**. Con
  el cupo puesto ya no: cuando las rutas libres visibles caen todas en una zona
  llena, se comparte ruta antes que romper el reparto del mapa. Es la prioridad
  correcta —una es garantía, la otra preferencia— y ahora el test lo mide contra
  sí mismo: suelta el cupo en la misma pasada y comprueba que sin él vuelve al
  100%.
- `logo.mjs` fijaba la marca del HUD en 32 px como máximo. Jugando se veía
  pequeña y sube a 44; el test pasa a acotar entre 36 y 56, que es donde se lee
  sin competir con los contadores.

---

## Ronda 32 — El aire tiene dirección

### 32.1 Por qué el modelo escalar no podía dar bunny-hop

El air-strafe de la vuelta 29 subía una **marcha escalar** y la dirección se
recalculaba cada frame desde las teclas. Funcionaba como acelerador y no como
maniobra: sueltas W en pleno vuelo y el juego, que no guarda hacia dónde ibas,
te manda a lateral puro en el primer frame. Probándolo se ve enseguida; era la
limitación que ya se había anticipado al implementarlo.

El modelo vectorial guarda una velocidad horizontal de verdad en el aire
(`_airVelX`/`_airVelZ`) y la acelera con el `airAccelerate` clásico: proyectar la
velocidad sobre la dirección pedida, ver cuánto falta para `wishSpeed`, sumar esa
diferencia acotada por `airAccel · wishSpeed · dt`.

Medido en el juego, corriendo de frente y estrafeando a la izquierda un vuelo:

| giro | marcha | rumbo al acabar |
|---|---|---|
| escalar | 6.50 u/s | −90° (de golpe, primer frame) |
| vector, 40°/s | 6.78 u/s | −29° (girando con él) |
| vector, 140°/s | 4.98 u/s | −39°, y **frenando** |

Lo último es la inversión que trae el modelo: en el escalar girar rápido era lo
óptimo hasta su tope; aquí pasarse de giro deja la dirección pedida por detrás de
la marcha y lo que se suma resta. Seis saltos encadenados: 40°/s → 8.32 u/s,
220°/s → 2.79.

**Y la condición «W suelta» desaparece porque sobra.** Con la vista puesta donde
vas, la proyección de tu velocidad sobre la dirección pedida ya vale 6.5, muy por
encima de los 0.78 de `wishSpeed`: no falta nada y no se gana nada. Lo que antes
era un `if` ahora sale de la geometría.

### 32.2 Lo que costó: inercia, y toca a todos los saltos

Tener dirección en el aire y tener inercia son la misma cosa. Con el modelo
escalar, soltar las teclas en pleno vuelo te dejaba clavado; ahora sigues. No es
un efecto secundario que se pueda quitar: es el modelo.

### 32.3 El fallo que encontró una suite sin aserciones

`baja.mjs` —la prueba de que la cobertura baja es saltable, que es lo que sostiene
la tabla de alturas de `COVER`— **imprimía el resultado y salía en verde pasara lo
que pasara**. Ni un `ok()`. Al ponerle aserciones apareció, en el primer intento,
una regresión de bulto: con el vector no se subía a la Baja **ninguna vez** (0 de
12, contra 12 de 12 del modelo escalar).

La causa: al chocar, se anulaba la componente de velocidad bloqueada. Eso es lo
correcto contra un muro —si no, empujar contra él guarda velocidad para soltarla
de golpe al doblar la esquina— pero con `COVER.stepHeight` a 0.25 una caja de
1.25 bloquea hasta que los pies pasan de 1.0, y al saltarle encima **se le roza la
cara mientras se sube**. Matar ahí la marcha dejaba al jugador colgado contra la
caja y cayendo.

La regla que lo arregla es una sola frase: **se pierde la marcha contra lo que
seguiría parando en lo alto del salto, no contra lo que se va a superar**. Y no
hace falta saber qué pieza frenó ni tocar la colisión: se resuelve **el mismo
paso contra la misma colisión** cambiando la altura de pies por la del ápice
—que sale de la parábola cerrada de siempre— y si allí pasa, la velocidad se
queda. La pared de la sala va aparte porque no tiene techo que superar.

Medido después: la ventana para subirse a la Baja vuelve a ser **idéntica en los
dos modelos** —de 0.6 a 2.7 u de anticipo al salto, a 60, 144 y 240 Hz—, y la
regla queda guardada por sus dos lados (rozar una pieza de 1.25 conserva la
marcha; chocar con una de 3.6 la pierde).

**Lección, que va a convenciones:** una suite sin aserciones no es una prueba, es
un informe. Ésta llevaba rondas dando por buena la frase «verificado 12 de 12».

### 32.4 La excepción del refresco: el número de verdad

Al evaluar esto se estimó una dispersión del **0.38%** con una simulación aparte,
y con ese número se aceptó la excepción. Medido en el juego sale **1.38%** entre
60 y 240 Hz, encadenando cuatro segundos. La diferencia no era del modelo sino de
la simulación, que daba por exacta la duración del vuelo.

Desglose, midiendo los dos modelos en el mismo banco:

- **0.57 puntos ya existían** con el modelo escalar. El contacto con el suelo
  entre salto y salto se cuantiza al frame: a 60 Hz se vuela 3900 ms de cada
  4000, y a 240 Hz, 3975. Eso lo sufren los dos por igual.
- El resto lo pone la integración del vector.

Dos cuantizaciones **sí** se arreglaron, porque eran evitables y de la misma
familia que las que este proyecto ya había corregido:

- El frame del despegue no aceleraba: `_takeOff` ocurre dentro del paso vertical,
  que corre después del aéreo. Un frame entero por salto, o sea 16.7 ms a 60 Hz
  contra 4.2 a 240. Se corrige pasándole `dt`.
- El frame del aterrizaje aceleraba de más: se acota al tiempo que queda de
  vuelo, despejado de la misma parábola que ya usaba `_land` —y de paso las dos
  cuentas pasan a compartir función, que es como no se desincronizan.

Lo que **no** ayuda es subdividir la integración: medido en simulación con pasos
de 8, 4 y 2 ms, no cambia ni el cuarto decimal. El residuo es que el ratón se
muestrea una vez por frame, y eso no tiene arreglo desde aquí.

Queda como la **única** excepción del proyecto a «el tiempo del juego no puede
depender de cuándo dibuja el monitor», aceptada explícitamente y con su número.

### 32.5 Qué se tocó, y qué no

Cabe entero en `movement.js`. **La colisión no se ha tocado**: su API es
posicional —`resolveAxis` recibe de dónde vienes y a dónde vas, y devuelve dónde
acabas— y le da igual si esa intención salió de una marcha escalar o de un
vector. El mismo bloque de colisión sirve para los dos modelos y para el suelo,
que es lo que garantiza que no se desincronicen: medido, un paseo largo por el
Plano A acaba en la misma coordenada **hasta el último decimal** con el
interruptor en cualquier posición.

Los dos modelos viven a la vez tras `MOVEMENT.airVector` para poder compararlos
jugando, y **uno de los dos se borrará**. Cada uno tiene su suite —`vector.mjs` y
`airstrafe.mjs`— y cada una fuerza el interruptor que le toca, así que las dos
valen esté como esté el config.

---

## Ronda 33 — Teclas, música y un cuerpo

### 33.1 El bind no se valida al asignar: se sanea

La tentación con un mapa de teclas es comprobar el choque en el panel —«esa
tecla ya la tiene Saltar»— y darlo por resuelto. Es el mismo error que ya se
había cometido con los ajustes: el panel no es la única puerta. `localStorage`
se edita a mano, sobrevive a cambios de catálogo y es lo primero que se lee al
arrancar.

Así que la invariante —**dos acciones nunca comparten tecla**— vive en
`sanitizeKeybinds()`, no en la interfaz. Lo guardado se recorre en orden de
catálogo; lo que choca cae a su valor por defecto, y **si el defecto también
está cogido la acción se queda sin asignar (`null`)** antes que duplicada. Las
alternativas fijas (flechas, MAYÚS derecha) se reservan antes de mirar nada de
lo guardado: son del juego, no del jugador, y no se pueden perder por lo que
hubiera en el almacén.

`bindConflict` existe igual, pero es lo que el panel usa para **explicar** el
rechazo; no es lo que lo garantiza. Medido en `binds.mjs`: basura, números,
nulos, un modificador escrito a mano y un `Escape` inyectado caen todos, y dos
acciones con `KeyS` guardado dejan la segunda sin asignar.

**Ctrl no es una preferencia.** La regla de la vuelta 27 —Ctrl+W cierra la
pestaña y el navegador lo resuelve antes que la página— dejaría de valer en
cuanto alguien pudiera asignar una acción a una combinación. En la primera
versión de esta ronda la regla existía sólo en mi diseño: capturando, Ctrl+Z se
aceptaba tan contento. Está ahora en `captureConflict()`, en el almacén y no en
el componente, junto a Alt y Mayús.

### 33.2 E es una acción, no dos

El encargo se puede leer como dos binds —«desactivar» y «equipar ultimate»— que
por casualidad comparten tecla. Con dos, la invariante de arriba los tendría que
separar, y el jugador acabaría con dos filas en el panel para una sola tecla.

Es **una** acción (`use`) con dos destinos, y quien decide cuál es el mundo:
dentro del radio del explosivo desactiva, fuera equipa. La condición sale de
`objective.isPlayerInRange(camera)` —una sola fuente, la misma que usa la
desactivación— y la prioridad es dura: dentro del radio E **nunca** hace otra
cosa. El hueco reservado es un método vacío en el motor (`_equipUltimate`), que
es lo que se pidió: la tecla, no la lógica.

### 33.3 Dos trampas del contexto de audio, las dos silenciosas

La música no arrancaba tras el primer gesto, y no por una sino por dos cosas:

- **`resume()` es asíncrono.** Mirar `ctx.state` justo después de llamarlo
  devuelve todavía `suspended`, así que el arranque se daba por imposible y no
  se reintentaba. Se espera al evento `statechange`, no al retorno.
- **El contexto puede cambiar por debajo.** `disposeAudio()` lo cierra y el
  siguiente `initAudio()` crea otro; con React en modo estricto eso pasa en el
  primer montaje. La espera se quedaba enganchada a un contexto muerto. Se
  guarda **a qué contexto** se está esperando (`waitingOn`) y se rearma si es
  otro.

La música cuelga de su **propio nodo de ganancia** directo a `ctx.destination`,
no del máster de efectos: su volumen es un ajuste aparte y bajar la música no
puede bajar los disparos. Medido: pico de 0.6262 en el máster de música, y el
ajuste llega a 0 sin tocar los efectos.

Y el diagnóstico de la primera medición fue falso: había editado `music.js` con
el servidor de desarrollo corriendo y HMR me había duplicado el módulo, que es
exactamente la trampa anotada en `CLAUDE.md` §4. Reiniciar antes de creerse un
resultado raro sigue siendo más barato que depurarlo.

### 33.4 El avatar comparte anatomía con el muñeco, y no lleva luces

El modelo nuevo **no** inventa una anatomía: las tres zonas salen de
`TARGET_TYPES.hitbox.parts`, las mismas que ya reparten el daño. Es la
representación visual de ese sistema, así que copiar las medidas a mano habría
creado dos verdades que se desincronizan en cuanto alguien toque una.

Sin texturas y **sin luces** —la escena no tiene ninguna— el volumen no puede
venir de sombreado, así que viene de dos cosas: una rampa de tonos del mismo
color por tipo de pieza (`AVATAR.shades`) y **costuras** (`EdgesGeometry` a 25°)
sobre casi cada pieza. Medido: 22 mallas, 21 juegos de costuras, 5 tonos y 0
texturas.

`setColor()` reparte sólo entre las piezas que llevan tono; el visor y el núcleo
—lo eléctrico— se quedan como están. Es lo que hace que el color sea
personalizable sin que el modelo pierda su identidad, y el motivo de que la
parte eléctrica no sea un tono más de la rampa.

La primera pasada salió con los brazos y las piernas fundidos en el torso y de
perfil plana: separarlos (`legGap` 0.42 → 0.62, `armGap`, `shoulderWidth` 2.15 →
2.5) y darle fondo al pecho (`chestDepth` 0.86 → 1.12) es lo que hizo que se
leyera como un cuerpo. Sin luces, lo que separa dos piezas es que se vea el
hueco.

**F3 sólo fuera de partida.** La vista orbital apaga movimiento y mirada y
aparta los paneles; con el cronómetro corriendo eso sería una forma de parar el
juego sin pausarlo, así que durante la sesión la tecla no hace nada. Y el avatar
no entra en el sistema de dianas: es geometría, no un objetivo.

### 33.5 Un párrafo largo ensanchaba el panel

El panel de opciones es una columna que se ajusta a su contenido, y el ancho
natural de un párrafo es el de su línea **sin partir**. La pista de Controles
—tres frases— lo estiró de 558 a 1165 px, y de paso encogió a la mitad las
miniaturas del selector de escenario, que se reparten ese ancho. Lo cazó
`round28.mjs`, que medía justamente esa proporción. El arreglo es un
`max-width` en el panel: el texto se parte, el panel no crece.

El mismo test falló además por algo que no era un fallo: cuenta los botones
«por defecto» del panel y ahora los de Controles comparten estilo con los de
los ajustes. Se acotó el selector a las filas de ajuste y se le añadió la
cuenta que faltaba —uno por acción—, que es lo que el test quería decir desde
el principio.

---

## Ronda 34 — Que te disparen

### 34.1 El jugador no tiene cuerpo, y no hace falta que lo tenga

Para que un muñeco pueda darte hay que decidir **dónde te ha dado**, y la
tentación era montarle al jugador un cuerpo invisible en la escena —tres mallas,
las del hitbox— y lanzarle raycasts. Habría funcionado y habría creado el
problema de siempre: dos cuerpos, el de la colisión y el de los impactos, que se
desincronizan la primera vez que alguien toque uno.

El cuerpo del jugador es **el mismo cilindro que ya usa la colisión**
(`COVER.playerRadius`) y las tres zonas salen de `TARGET_TYPES.hitbox.parts`
escaladas por la altura de ojos del momento. Agacharse baja las tres sin una
segunda tabla: el muñeco tiene los «ojos» en el centro de la cabeza, así que la
escala es `eyeHeight / head.offsetY` y todo lo demás va detrás. Medido de pie:
piernas hasta 0.86, torso hasta 1.57, cabeza hasta 1.83; agachado, 1.13 de alto.

El corte se resuelve **analíticamente** —una cuadrática contra un cilindro
vertical— y no con un raycast. No es sólo elegancia: son cero mallas nuevas en la
escena, cero actualizaciones de matriz por frame y un disparo enemigo que no
cuesta un raycast.

### 34.2 La cabeza no se escala, y eso decidió el resto de la calibración

El daño por zona es el que ya existía: cabeza 100, torso 50, piernas 34, sobre
100 de vida. Para el jugador el cuerpo se escala (`ENEMY.bodyDamageScale`), pero
**la cabeza no puede escalarse**: el encargo dice que con el casco roto «el
siguiente disparo a la cabeza mata», y eso sólo sale solo si la cabeza sigue
valiendo 100 de 100. Escalarla habría convertido la regla del casco en un caso
especial escrito a mano.

La consecuencia la pagó la calibración. Con los muñecos apuntando al pecho alto
(`aimHeightFactor` 0.78) el **11%** de los impactos iban a la cabeza, y cada uno
era una muerte instantánea: el escudo y la vida no llegaban a significar nada
porque la partida la decidía una bala perdida. Apuntando al centro del cuerpo
(0.55) el reparto baja al **4%** y la cabeza vuelve a ser lo que tiene que ser:
mala suerte, y el motivo por el que el casco está en lo alto del Balcón.

### 34.3 Un cono de 9° no es mala puntería: es que el disparo es instantáneo

El primer valor de `spreadDeg` fue 3.2° y parecía razonable. Medido de pie en el
punto de aparición del Plano A, entraba el **84%** de los disparos. Con 4.5°,
también el 84%. El motivo es que **el disparo va a donde estás ahora**: no hay
viaje de bala ni error de adelanto, así que moverse no le hace fallar ni un poco
y todo lo que un muñeco falla tiene que salir del cono.

Con 9° entra el 54% de pie en campo abierto, y a 16 u el 23%. Ése es el punto de
partida. Es un número grande para un tirador y pequeño para lo que hace.

### 34.4 Repartir el raycast de visión por tiempo no basta

La línea de visión es un raycast contra toda la geometría del escenario, así que
no cabe por frame — la regla de siempre. Se recomprueba cada `sightCheckMs`, y
para que ocho muñecos no la comprueben a la vez cada uno arranca con un desfase
al azar.

No sirvió. Los relojes se ponen en fase solos: los muñecos aparecen a la vez, ven
al jugador a la vez y a partir de ahí cada uno reengancha su reloj `now + 180`
desde el mismo instante. Medido en juego: hasta **7 rayos en un mismo frame**, a
0.03 ms cada uno, o sea 0.21 ms de golpe contra un presupuesto de 0.2.

El arreglo es un **presupuesto por frame** (`sightChecksPerFrame`, 2). A quien le
toca y no le queda presupuesto **no se le mueve el reloj**: mira en el frame
siguiente, así que nadie pierde el turno. Con ocho muñecos y 60 Hz, la ronda
entera se despacha en 67 ms, muy por debajo de los 180 del ciclo.

Y una consecuencia que había que cerrar aparte: con la vista mirada cada 180 ms,
un muñeco sigue disparando hasta 180 ms después de que te metas detrás de la
Espina, y esos disparos acertaban **a través del muro**. El arreglo es la
simetría que faltaba: el disparo que entra se comprueba contra la cobertura,
exactamente como ya hacía `_isBlockedByCover` con el del jugador. Cuesta un rayo
por disparo **que acierta**, no por disparo. Medido: 0 de 292 atraviesan la
Espina; sin nada en medio, 29 de 54 entran.

De paso, una lección de medición: el p99 del frame en el entorno de pruebas daba
1.6 ms y el máximo 13.6, y **no era el combate**: este contenedor dibuja por
software a ~20 fps y el p99 de uno de sus frames es jitter del navegador. El
coste real se midió en bucle cerrado, 0.03 ms por rayo, igual que el raycast de
visibilidad de las apariciones que ya estaba medido desde la vuelta 24.

### 34.5 Los relojes que pueden esperar van por delta, no por fecha

La carga del escudo dura dos segundos y la reaparición hasta quince. Escritos
como `now + 2000` y `now + 15000` funcionan hasta que alguien pulsa Escape:
pausar quince segundos se come una reaparición entera, y pausar dos, una carga.

Los dos se descuentan con el **delta de juego del frame**, que ya vale cero en
pausa porque es el mismo que congela dianas y explosivo. No hace falta acordarse
de nada: lo que se congela, se congela solo.

### 34.6 Un acumulador en lugar de dos contadores

La regla de reaparición pedía tres cosas: 3 s de base, +2 s por cada muerte
consecutiva **sin baja entre medias**, tope de 15; y una baja resta 3 s, pero
sólo si la espera pasa de 10.

Leído literalmente son dos mecanismos —una racha de muertes y un descuento por
baja— que dicen lo mismo con distinto vocabulario y que se pueden desincronizar.
Es **un solo acumulador**: morir lo sube, una baja lo baja por encima del umbral.
«Sin baja entre medias» sale de ahí, porque la baja es justo lo que lo baja.
Medido: 3, 5, 7, 9, 11, 13, 15, 15.

### 34.7 La fatiga se mide en velocidad, no en desplazamiento

Saltar parado era gratis e infinito. Lo que se desgasta ahora es el **impulso
vertical** —un factor sobre `jumpSpeed` al despegar—, y no una cuota de saltos ni
un bloqueo temporal, por una razón concreta: multiplicar la velocidad de salida
deja la parábola resuelta en forma cerrada, así que un salto fatigado sigue
siendo idéntico a 60 y a 240 Hz. Medido: los mismos factores (1, 1, 0.88, 0.76,
0.64, 0.55) y el mismo ápice a los tres refrescos.

Lo que no era obvio es **cómo se decide que un salto fue «parado»**. El encargo
pedía que un bhop genuino no sufriera fatiga «sea cual sea la velocidad de giro»,
y eso descarta medir el desplazamiento neto del vuelo: un bhop cerrado, girando
sin parar, avanza poco en línea recta y va rapidísimo. Lo que se guarda es la
**velocidad horizontal máxima del vuelo** — un máximo, no una integral, así que
no depende de cuántos frames lo muestreen.

Dos consecuencias que se miden y se anotan porque no son fallos:

- **Un solo salto con marcha de verdad borra la cuenta entera.** Quien domina el
  encadenado no ve esta regla nunca.
- **Encadenar desde parado no perdona.** Un encadenado conserva la marcha del
  aterrizaje, y la de un rebote es cero; para volver a saltar entero hay que
  romper la cadena y coger carrerilla. Es coherente con la definición —no hubo
  desplazamiento real— pero conviene saberlo antes de creer que está roto.

Y una del banco de pruebas: `hz.mjs` empezó a fallar con un 69% de desviación
entre refrescos. No era la física: el test medía siete saltos seguidos, uno por
refresco, sin resetear la fatiga entre ellos. La regla de la vuelta 21 otra vez
—cuando un test falla tras un cambio de alcance, la primera hipótesis es que el
test codificaba una suposición que el cambio invalidó—.

### 34.8 El avatar: tres canales, y sólo uno se vende

El rediseño no es sólo «más facetado». Lo que cambia de verdad es que el modelo
pasa a tener **tres canales separados**, y eso es una decisión de producto, no de
estilo:

- La **piel** es lo personalizable: paneles negros con la rejilla de la sala
  encima. Es la skin de serie, la que se tiene sin comprar nada.
- La **luz** —dos líneas continuas de la coronilla a las botas, más el núcleo—
  es fija, y es la que llevará el **color de equipo** cuando haya equipos. Por eso `setColor()` no la toca: un
  jugador no puede pintarse del color del rival, y si el color de equipo saliera
  del mismo canal que la skin, la primera venta rompería la legibilidad del
  juego.
- Las **aristas** son estructura: con la piel en negro, el tono ya no separa una
  pieza de otra —multiplicar negro por 0.62 sigue siendo negro— y todo el volumen
  lo dibujan los filos y la rejilla.

La rejilla **no es una textura nueva**: es el generador de líneas de la sala,
extraído a `grid.js` y llamado desde los dos sitios. Lo único que cambia es el
paso: 1 u para una sala de 40 y 0.12 para un torso de 0.6, donde el paso de la
sala daría una sola línea. Y usa el par de grises del **suelo** y no el de las
paredes, porque sobre negro el de las paredes no se ve.

**Las líneas son continuas, y eso se lee en la referencia de un vistazo.** La
primera versión ponía tramos sueltos por las piezas —dos en el pecho, uno por
muslo, un visor horizontal— y parecía un muñeco con pegatinas. En
`Reference/Avatar/player-avatar-style.png` son **dos filamentos** que bajan de la
coronilla a las botas pasando por la cara, el esternón, la ingle y la cara
interna de cada pierna. Se declaran como una **cadena de puntos** y cada tramo se
construye de uno al siguiente, así que la continuidad es estructural y no algo
que haya que cuadrar a ojo. Y van sólo por delante, con lo que de paso son lo que
dice hacia dónde mira el modelo. La referencia **no se vectoriza**: es una guía
de estilo, como el blockout de los escenarios, no un asset que trazar.

Tres cosas que costaron una pasada cada una:

- Las líneas se **fusionan** en tres objetos para todo el cuerpo. Con una rejilla
  por cara eran cuarenta objetos por avatar, y en multijugador habrá varios.
- La rejilla se **mide** por la cara estrecha del panel y se **coloca** a la
  altura de la ancha. Puesta a la estrecha se queda dentro del panel y no se ve
  ni una línea: la primera versión salió con la piel entera invisible y el
  modelo pareciendo una mancha negra.
- Las líneas de luz caen en la misma trampa por el otro lado. El pecho se **abre**
  hacia arriba, así que su cara delantera está más adelante que media
  profundidad, y la línea puesta a media profundidad desaparecía del cuello al
  esternón — justo el tramo que la hace legible.

### 34.9 Los recogibles van en puntos de ruta

Ocho objetos por el Plano A —cuatro cargas, tres cruces y un casco— y ni una
coordenada nueva: todos están en **puntos de ruta**. De ésos ya se sabe, porque
lo mide `rutas.mjs`, que tienen suelo a nivel y 0.6 u de cuerpo libre, así que un
recogible ahí no puede acabar dentro de una caja. Elegir coordenadas a ojo era
abrir la puerta a un casco dentro de la Espina.

El reparto sí es una decisión: nada en el Vestíbulo —donde aparece el jugador—,
vida y escudo por las zonas que hay que cruzar, y el casco arriba en el Balcón.
Lo que mejor protege es lo que más lejos está del sitio seguro.

---

## Ronda 35 — El avatar, medido contra la referencia

### 35.1 Un primitivo en lugar de un catálogo de cajas

La vuelta 34 dejó el avatar como una pila de paneles: cada pieza era una caja con
una tapa más estrecha que la otra. Servía para «angular», y no daba para nada
más. Un brazo era una caja de grosor uniforme con un escalón a mitad; una
articulación, una caja fina entre dos gruesas; y en todas partes había dos
bloques tocándose por un canto.

Lo que arregla eso no es añadir piezas: es cambiar el primitivo. Ahora hay uno
solo, el **prisma de anillos** — una pieza es la lista de sus cortes
horizontales, cada uno con su altura, su ancho, su fondo y su desplazamiento. Con
eso, tres cosas dejan de ser un problema y pasan a ser datos:

- Un brazo que se **afina** es la misma pieza con anillos de 0.036, 0.032 y
  0.028; no hay escalón porque no hay dos piezas.
- Una **articulación** es una pieza estrecha-ancha-estrecha cuyos extremos entran
  dentro de los tramos vecinos. No tapa la junta: la envuelve.
- Una sección puede tener **más de cuatro caras**. Ocho en el tronco y seis en
  las extremidades es lo que separa «facetado» de «caja».

El modelo pasó de 22 cajas a 23 prismas, y de 4 siluetas posibles por pieza a
una silueta continua.

### 35.2 Las proporciones se midieron; no se eligieron

La referencia es una imagen de 1024×1536 con el modelo casi negro sobre fondo
casi negro. Medirla a ojo no da nada, así que se barre fila a fila buscando la
silueta.

Dos trampas por el camino, las dos resueltas con el mismo truco:

- **El resplandor de las líneas azules infla la silueta.** A luminancia, el halo
  de las líneas de luz cuenta como cuerpo y la cabeza salía un 40% más ancha. Se
  mide por el **canal rojo**: la rejilla blanca lo tiene y el azul no.
- **Una ventana estrecha corta la medición y nadie avisa.** Varias medidas del
  tronco salían más estrechas que la cintura porque la ventana de barrido cortaba
  el borde. Desde entonces el barrido marca `<clip>` cuando la silueta toca el
  borde de la ventana.

De ahí salen 24 anchos y 15 alturas, todos en **fracciones de la altura total**
(`AVATAR.figure`). Y la comprobación clave: las alturas que marcan zona en la
referencia —barbilla 0.869, cadera 0.470— caen sobre las bandas del hitbox
—0.861 y 0.472— sin forzar nada. La referencia y el muñeco tienen las mismas
proporciones humanas, así que no hubo que elegir entre una cosa y la otra: la
**altura** la sigue poniendo el hitbox y la **forma** la pone la referencia.

### 35.3 Comparar dos siluetas es otra medición, no una mirada

Mirar dos imágenes de distinto tamaño una al lado de otra no dice si un hombro
está bien. Lo que dice es poner las dos siluetas **a la misma altura en píxeles**
y listar la desviación nivel a nivel.

Para eso hace falta una silueta limpia del modelo, y ahí hay un problema propio:
la piel del avatar (`#101014`) es **más oscura que la rejilla de la sala**
(`#2B2B2B`), así que sobre el render normal ninguna umbralización separa el
cuerpo del fondo. El render de medición apaga la sala y pinta todas las piezas de
blanco: no es como se ve el modelo, es como se mide.

Lo que encontró, en orden de gravedad:

| Nivel | Qué era | Antes | Después |
|---|---|---|---|
| 0.49–0.43 | Los brazos no llegaban a la cadera | −60% | −2% |
| 0.25–0.13 | Las piernas, demasiado juntas | −25% | −5% |
| 0.82 | El hombro empezaba demasiado abajo | −68% | −3% |
| 0.97 | La coronilla, demasiado cerrada | −27% | −5% |

El peor nivel pasó de −68% a **−12%**, y 28 de los 32 medidos están dentro del
8%. Nada de eso se veía a ojo: el modelo «parecía bien» en las cuatro versiones.

### 35.4 Dos errores que sólo se ven en movimiento

- **Un tramo que acaba en su anillo más estrecho deja un hueco.** El húmero
  terminaba en el punto donde el brazo se estrecha (nivel 0.690) y el codo
  empezaba en 0.642: entre los dos había aire. Un tramo tiene que llegar **hasta
  dentro** de su articulación, y el anillo estrecho ser intermedio.
- **Las líneas de luz no pueden ir a media profundidad del cuerpo.** Puestas
  todas a la mitad del fondo del modelo, en las rodillas —que sobresalen— se
  metían dentro de la pieza y la línea desaparecía justo en la articulación, que
  es donde más se mira. Cada punto de la cadena lleva ahora **la media
  profundidad de la pieza sobre la que va montado**, con la misma expresión con
  la que se construyó ese anillo.

Y uno de bulto que se vio al primer render: el **giro de las caras** del prisma
estaba invertido, así que con `FrontSide` no se dibujaba ninguna cara cercana y
el modelo salía hueco — se le veía el interior de la cabeza.

### 35.5 El recorrido de las líneas también estaba medido, y no lo parecía

Las dos líneas se dibujaban interpolando tres separaciones —cabeza, pecho,
pierna— elegidas a ojo. Con eso se cerraban en el pecho y se abrían en la
cintura, y lo que se veía en el esternón era una **X**.

Localizadas en la referencia por tono —son el único azul saturado de la imagen—,
el recorrido real es el contrario: **se abren en el collar (0.056 de la altura),
se cierran en el ombligo (0.035) y de ahí sólo se separan** hasta la bota
(0.102). Son diez separaciones medidas, no tres inventadas, y están en
`AVATAR.stripSpread` con el mismo trato que los anchos.

### 35.6 Las líneas también por la espalda, y por qué

El par de líneas era la seña del modelo, y sólo iba por delante. Como canal es el
que llevará el **color de equipo**, y un color de equipo que sólo se ve de frente
no sirve para nada: a un rival se le persigue más de lo que se le mira a la cara.

Son las mismas, con la z cambiada de signo respecto al centro de cada pieza —no
del modelo—, porque la cabeza y la bota no están centradas en z. Y siguen fuera
de `setColor()`: un jugador no puede pintarse del color del rival.

---

## Ronda 36 — La profundidad, que hasta ahora se estimaba

### 36.1 Lo único de `figure` que no salía de una imagen

La vuelta 35 dejó el avatar medido: 24 anchos y 15 alturas barridos fila a fila
sobre `player-avatar-style.png`, con la desviación en el 12% del peor nivel. Pero
esa referencia es **una vista frontal**, y de frente no hay profundidad que medir.
El fondo de cada pieza se escribió como siete multiplicadores sobre el ancho
—`torso: 0.74`, `head: 1.18`, `boot: 1.9`— con un comentario que lo decía:
proporciones humanas normales, y lo único de `figure` que no salía de la imagen.

`player-avatar-turnaround.png` trae seis vistas del mismo diseño a la misma
escala: frontal, los dos perfiles, posterior, cenital e inferior. Con dos
perfiles, la profundidad deja de estimarse.

### 36.2 El hallazgo: el fondo del torso no hace reloj de arena

Medido, el fondo del torso va de **0.134 en el pecho a 0.122 en la cadera**,
pasando por 0.112 en la cintura. El ancho, en los mismos tres sitios, va de 0.202
a 0.134 y vuelve a 0.195. Es decir: **el ancho hace un reloj de arena y el fondo
casi no cambia**, que es exactamente como está hecho un torso humano.

Un multiplicador único no puede dar las dos cosas. Con `torso: 0.74`, la cintura
—que es la mitad de ancha— salía también la mitad de profunda: plana. Y la
cadera, ancha, salía hinchada. Por eso `depths` dejó de ser un bloque de factores
y pasó a las **mismas unidades que `widths`**: fracciones de la altura total,
clave a clave, 33 valores medidos.

Lo mismo con la bota, que fue lo que más cambió: medía 0.148 de largo contra los
**0.180** de la referencia, y su centro caía 0.030 por delante del eje de la
pierna en vez de 0.066. Las dos vistas de perfil dan el mismo número hasta el
cuarto decimal.

### 36.3 El brazo no se puede medir de perfil, y se dice

De perfil el brazo cuelga **por delante del torso**. No hay ni una fila en la que
sea él quien pone la silueta: ni un umbral ni un relleno desde el borde lo
separan, porque por dentro el dibujo es casi negro y sus filos son igual de
tenues que los del torso que tiene detrás.

Se probó a sacarlo por los trazos interiores y no da: a la altura del húmero, el
contorno del brazo son puntos sueltos. Así que los fondos del brazo salen de la
única pieza del brazo que **sí** se mide —la hombrera, 0.137 de fondo contra
0.117 de ancho— y se afinan de ahí a la muñeca, con la excepción anotada en
`config.js`. Consuela una cosa: metido dentro del contorno del torso, un error de
fondo en el brazo no se ve **en ninguno de los dos bancos**.

### 36.4 Un canal no se puede restar, así que se levanta

El encargo pedía tallar una hendidura en la geometría y meter la línea dentro.
Con prismas opacos y sin CSG eso no se puede hacer: un hueco tallado en el prisma
sigue **tapado por la propia cara del prisma**, y lo que se ve es la cara, no el
hueco.

Lo que sí se puede es levantar el canal: dos labios a los lados del recorrido y
la barra al fondo, con su cara exterior a ras de piel. El relieve resultante es
el mismo y el efecto que se buscaba también — de refilón el labio tapa la línea,
y la línea deja de leerse como una tira pegada encima.

Dos detalles que costaron una pasada cada uno:

- **Los labios van perpendiculares al tramo, no en x.** El recorrido se tuerce en
  el collar y en la ingle; un labio desplazado en x se cruzaba con su propia
  línea.
- **Y se fusionan antes que los filos.** Llevan arista como cualquier pieza, y
  metiéndola después salía un **cuarto** objeto de líneas, contra la regla de
  la vuelta 33 de que grilla, aristas y luz son tres.

### 36.5 Media profundidad no es la superficie

Hasta ahora cada punto de la línea se ponía a media profundidad del anillo sobre
el que iba. Eso sólo es la superficie si el punto cae en la **cara frontal** del
prisma: con ocho caras, la cara frontal llega hasta 0.414 del medio ancho, y en
la cadera la línea pasa a 0.062 del eje contra un límite de 0.040. Allí flotaba.

`surfaceZ` resuelve el contorno del polígono **en esa x**. Y la x se mide
respecto al eje de la pieza, no del cuerpo: la primera versión pasaba la x
absoluta y en la pierna —cuyo eje está a 0.071 del centro— el punto caía fuera
del muslo, se recortaba al vértice y la línea **desaparecía dentro de la pierna**
del muslo a la rodilla.

### 36.6 Tres piezas con vista dedicada, y por qué son varias piezas

- **Hombrera**: dos por lado, casquete y alerón volado, de ocho caras. Con seis
  caras y una sola pieza era una tapa lisa, que es justo lo que enseña la vista
  cenital.
- **Bota**: cuatro por pie —caña, pie, suela y talón—. No es detalle por detalle:
  **un anillo tiene un solo ancho a cada altura**, así que el talón estrecho que
  enseña la vista inferior y el antepié ancho no caben en la misma pieza.
- **Mano**: palma y cinco dedos, de largos distintos. Cuatro dedos iguales se
  leen como un peine, y fusionados en una pieza vuelven a ser una manopla.

Y una regla que ya estaba en el código sin estar escrita: **con los vértices a
medio paso, un prisma de seis caras tiene vértice al frente y uno de ocho tiene
cara**. Por eso el pie pasó a ocho —con cuatro, la puntera es un filo y la bota
entera se lee como una cuña de cartón— y por eso seis no valía para ninguna de
las dos cosas.

### 36.7 El banco, y tres formas de medir mal

`comparar.mjs` pasó a tener dos vistas: `frente` contra la referencia de estilo y
`perfil` contra la media de las dos laterales del turnaround. Al montarlo
aparecieron tres errores de medida, y ninguno avisa:

- **La cámara no era ortográfica.** A 2.4 u de un cuerpo de 1.8, la pierna
  cercana sale un 16% más grande que la otra y la puntera de la bota se proyecta
  sobre las filas del tobillo: el perfil daba +145% en el cuello de la bota. Con
  la cámara a 30 u y campo de 4.4°, el mismo modelo da +24%.
- **El canal de luz se estaba midiendo como cuerpo.** Los labios engordaban la
  silueta de perfil de la pierna un 25%: se medía el canal, no el gemelo.
- **En el turnaround el cuerpo es casi negro por dentro**, r 0-8, igual que el
  fondo del panel. El canal rojo —que fue lo que resolvió la referencia de
  estilo— aquí no separa cuerpo de fondo, sólo contorno de fondo, y deja bandas
  enteras sin medir. Lo que vale es `r > 22 || g > 32` con lo azul fuera; el azul
  hay que quitarlo porque el charco de luz reflejado bajo las botas pasa por
  contorno en brillo y sólo lo delata el tono. Y las cuatro vistas **no están a
  la misma escala**: entre la frontal y las de perfil hay un 3% de altura, así
  que cada una se normaliza por la suya.

Resultado, con los tres arreglados: **16% en el peor nivel de frente** (30 de 32
dentro del 8%) y **12% de perfil** (28 de 32). Y una comprobación que no depende
del render: `avatar.mjs` mide el fondo del modelo sobre la geometría —el contorno,
no la pieza, porque en la bota el frente lo pone el pie y la espalda el talón— y
lo compara con la referencia leída en el momento. Un número escrito a mano en un
test no prueba nada.

## Ronda 37 — Leer al enemigo

### 37.1 Una dificultad, no dos mandos

`spreadDeg` y `reactionMs` estaban sueltos en `ENEMY` desde la vuelta 34, con un
comentario que decía «los dos parámetros de dificultad». Sacarlos al panel como
dos sliders habría sido lo obvio y habría estado mal: lo que se nota jugando no es
«cuánto falla» ni «cuánto tarda» por separado, es **cuánto aprietan**, y con dos
mandos independientes se llega enseguida a combinaciones que no corresponden a
ninguna dificultad real —un tirador de élite con un segundo de reacción—.

Así que es un catálogo (`ENEMY_DIFFICULTIES`) y un ajuste con tres opciones, con
la misma forma que `SIMULTANEOUS_TARGETS` o `FRAME_LIMITS`: saneado contra el
catálogo, botón de «por defecto» propio, y **los números se van de `ENEMY`**. Que
se vayan no es limpieza: mientras estuvieran, habría dos sitios de los que leer la
dificultad y el de `ENEMY` sería el que se queda viejo. `enemigos.mjs`, que los
leía de ahí, se actualizó para leerlos de donde los lee el motor — un test que
sabe dónde vivía un número prueba el número, no la regla.

### 37.2 La fase la publica quien la tiene

El `?` y el `!` necesitan saber si un muñeco está en su ventana de reacción o ya
disparando. Ese estado **ya existe** dentro de `enemyFire`: hay contacto, hay un
reloj y hay un primer disparo. Deducirlo desde fuera —«si `nextShotAt` está en el
futuro y el burst es cero…»— habría sido una segunda copia de la misma máquina de
estados, y la primera vez que cambiara una de las dos se desincronizarían.

`phaseOf(instance, now)` devuelve `idle` / `alert` / `firing`, y lo sostiene un
booleano explícito (`state.reacting`) que se enciende al ganar contacto y se apaga
en el primer disparo. Un booleano con nombre, no una inferencia sobre tres relojes.

### 37.3 La brújula no se billboardea, y los iconos sí

Parece una inconsistencia y es justo lo contrario. La brújula dice **hacia dónde
mira el muñeco**: girada hacia la cámara apuntaría siempre al jugador y no diría
nada. Los iconos sólo tienen que leerse, y para eso mirar a la cámara es lo
correcto. Dos comportamientos porque son dos cosas.

Para que haya un «hacia dónde mira» hubo que inventarlo: los muñecos no tenían
orientación —sus piezas son simétricas y disparan igual miren a donde miren—. Se
añadió `facing`, y con una regla: **`facingTarget` lo escribe quien lo sabe** —la
patrulla mientras camina, el fuego enemigo mientras te ve— y **`facing` lo integra
un solo sitio**, acotado a `TARGET.turnRateDeg`. Con dos escritores del valor
final, la brújula daría saltos según quién escribiera el último.

### 37.4 Un triángulo plano a la altura de los ojos son cero píxeles

El encargo pedía un triángulo **plano**, paralelo al suelo. Medido en banco
controlado —un muñeco, 12 u, la cámara a la altura exacta de la brújula, tres
orientaciones promediadas— eso da **0 píxeles**. No se lee mal: no está. Y no es
un caso raro: la cabeza del muñeco y la del jugador están a la misma altura, así
que el caso de canto es el normal.

Levantar los dos vértices de la cola (`MARKERS.compass.rise`) le da perfil sin
dejar de ser un triángulo visto desde arriba. Medido, a 12 u:

| `rise` | elevación 0 | +0.3 u | +1.5 u |
|---|---|---|---|
| 0 (plano) | 28 px | 34 | 22 |
| 0.05 | 53 | 50 | 38 |
| **0.10** | **80** | 103 | 91 |
| 0.14 | 91 | 135 | 129 |

(Los 28 píxeles del plano a elevación 0 son la raya antialiasada de canto: se ve
algo, pero es una línea sin dirección.) Se eligió 0.10.

Lo otro que hacía falta para verlo de lejos no es el color: es que **un marcador
de mundo encoge**. A 30 u —el largo del Plano A— un icono de tamaño de mundo son
cuatro píxeles. Pasada `MARKERS.referenceDistance` el marcador escala con la
distancia y conserva su tamaño en pantalla, con tope para que de cerca no tape al
muñeco.

### 37.5 El color de la brújula, medido contra el mapa real

La propuesta era cian, y el cian ya significa algo: el azul eléctrico es el canal
de carga —escudo, recargas, visor y líneas del avatar—. Así que se midió, con seis
candidatos y el método de siempre: se dibuja el mismo frame con marcadores y sin
ellos, la diferencia da **exactamente** los píxeles del marcador, y sobre el frame
sin marcadores se lee el fondo que le toca a cada píxel. De ahí, contraste WCAG.

| color | contraste medio | peor decil |
|---|---|---|
| **blanco #FFFFFF** | **10.67** | **2.58** |
| lima #C6F04A | 7.66 | 2.14 |
| eléctrico #6FE0FF | 6.62 | 1.85 |
| turquesa #35D6C4 | 2.32 | 1.18 |
| azul claro #8FB6FF | 2.22 | 1.08 |
| cian profundo #2FA8C9 | 2.93 | 1.01 |

Lo que decide es el **peor** decil y no la media: una brújula que se ve sobre el
suelo negro y desaparece sobre una caja de cobertura no vale, y en el Plano A hay
de las dos cosas en el mismo encuadre. Los cianes pierden porque la cobertura es
gris media y ahí se apagan. Ganó el blanco, que además es el único que no compite
con ningún significado del mundo —el naranja es diana, el ámbar explosivo, el azul
carga—.

Una trampa de medida por el camino: **los bordes antialiasados empatan a todos los
candidatos**. Un píxel de borde es una mezcla del marcador y del fondo, así que su
contraste tiende a 1 diga lo que diga el color; con los bordes dentro, los seis
candidatos daban 1.0 y la medida no medía nada. Se cuenta sólo el interior, y con
el material opaco durante la medición, porque con opacidad 0.92 lo que sale por
pantalla también es una mezcla.

Los dos iconos llevan colores nuevos por la misma regla: el `?` es amarillo limón
y no el ámbar del explosivo; el `!` es rojo puro y no el naranja de las dianas —un
aviso que se dibuja **encima** de un muñeco naranja no puede ser naranja—.

### 37.6 ¿Tapa la cobertura la brújula?

El marcador va por encima de la cabeza, así que el fallo posible no es el obvio
—si se ve la cabeza, lo que está más arriba se ve mejor— sino algo que tape **por
arriba**, y en el Plano A eso existe: la plataforma del Balcón vuela sobre el
suelo de al lado.

Se midió a lo bruto: 400 puestos del jugador por los 69 puntos de ruta, un rayo a
la cabeza y otro a la brújula. La cabeza se ve en **10.390** pares, y de ésos la
cobertura tapa la brújula en **4** (0.04%), los cuatro de canto contra el borde de
una pieza. Queda anotado y no se toca el mapa por cuatro casos.

### 37.7 La gracia va antes que el casco

Dos segundos de invulnerabilidad al reaparecer, por lo de siempre: reaparecer
donde estabas con los mismos muñecos encarados al mismo sitio es morir otra vez
antes de ver la pantalla.

El detalle que no es evidente es **el orden dentro de `takeHit`**. El casco se come
el primer disparo a la cabeza y se rompe; si la comprobación de invulnerabilidad
fuera después, un tiro a la cabeza durante la gracia gastaría el casco sin quitar
vida — y la invulnerabilidad habría costado el casco. Va primero, y hay una
aserción que lo guarda.

El reloj va por delta como los otros dos de `player.js`, así que en pausa no corre.
Y la señal nunca es invisible para quien la tiene: marco azul —el canal de la
carga, que es lo que protege al jugador— y cuenta junto al bloque de vida, no en
el centro, que es donde ya están el cronómetro y las estrellas.

### 37.8 El casco que no se leía como casco

El icono anterior era un arco de borde CSS: media píldora. La silueta exterior de
un casco tampoco basta —es un pentágono redondeado—: **lo que lo delata es la
visera**.

Se traza dos veces la misma referencia, una por alfa y otra filtrando por
luminosidad —la imagen es bimodal, 25.013 píxeles por debajo de 32 y 53.000 por
encima de 160, así que el umbral no es una interpretación—, los dos contornos van
al mismo trazado y se pinta con `fill-rule: evenodd`. Es la misma regla del
logotipo de la vuelta 30, y el mismo fallo si se olvida: con `nonzero` sale
macizo. `dummies.mjs` lo guarda midiendo con `isPointInFill` que el centro de la
visera está hueco.

El escudo del HUD se pasó al trazado también, y con un detalle de implementación
que costó una vuelta: sus tres segmentos se recortan **dentro del SVG**, no con
`clip-path` de CSS, porque `clip-path: path()` no escala con el elemento y el
trazado viene en coordenadas de la referencia, no en píxeles de HUD.

**La cruz de vida no se cambió por el corazón**, y no es un olvido: el icono del
HUD y el recogible del suelo son el mismo objeto visto en dos sitios, y cambiar
sólo uno los separa. El trazado está hecho y espera a que cambien los dos.

Y el casco del suelo no se puede vectorizar —un contorno plano no es un objeto—,
así que se reconstruye: cúpula, faldón y una visera **que sobresale**. La primera
versión la tenía metida dentro de la cúpula, y sin luces lo único que distingue
una pieza de otra es la silueta: una visera que no asoma no cambia nada. Lo caza
una aserción sobre la caja de la geometría, que con la visera dentro sale
simétrica en z.

## Ronda 38 — El giro: se tira el avatar humanoide

### 38.1 Qué se tira, y por qué no se intenta reconciliar

Las vueltas 33 a 36 construyeron un humanoide facetado y lo midieron con cuidado:
cuarenta y dos piezas, brazos que se afinaban de 0.036 a 0.028, articulaciones
que envolvían la junta, hombreras de dos piezas y ocho caras, botas de cuatro
piezas con talón, manos de cinco dedos, cuatro líneas de luz metidas en su canal,
profundidad medida sobre dos vistas de perfil y un banco de siluetas que lo
comparaba nivel a nivel contra la referencia. Terminó en un 16% de desviación en
el peor nivel de frente y un 12% de perfil.

Se tira entero. No se conserva nada y no se intenta reconciliar: es un cambio de
dirección, no una iteración. Las razones, por orden de peso:

1. **Un modelo con extremidades promete información que no da.** Sin esqueleto ni
   animación, los brazos de ese avatar no apuntan a ningún sitio, las piernas no
   caminan y el torso no gira: es un maniquí en pose fija. En un juego de
   puntería, una figura que *parece* que apunta y no apunta no es neutra, engaña.
2. **La forma no puede ser lo que distinga a un rival.** Un cuerpo se ve distinto
   desde cada ángulo —de frente, de perfil, de espaldas, asomando media cabeza—.
   El color se ve igual desde todos. Si lo que hay que reconocer en un cuarto de
   segundo es «de qué equipo es», eso tiene que ir por el canal que no depende del
   ángulo.
3. **Se paga por avatar.** Cuarenta y dos mallas y tres objetos de líneas por
   jugador, en una partida llena, contra tres mallas.

Lo que sobrevive del trabajo anterior **no es geometría, es método**: medir la
referencia en vez de mirarla, tener un banco que falle, y que la silueta que se ve
sea la que recibe los disparos. Eso se aplica igual al cuerpo nuevo.

### 38.2 Una sola forma, y el color como única diferencia

El cuerpo simple —cápsula con cabeza ovalada, medido sobre
`avatar-simple-body.png`— vive en `src/game/body.js` y lo construyen **los dos**
que lo necesitan: el pool de dianas y el avatar del jugador. No es reutilización
por ahorrar: si cada uno construyera el suyo, a la primera vuelta se separarían
**la silueta que ves y la que recibe los disparos**, que es peor que feo. La suite
lo comprueba vértice a vértice.

Y las tres zonas del hitbox dejan de ser una esfera, una cápsula y un cilindro
sueltos: son **bandas del mismo perfil**. El modelo de daño ya decía a qué altura
empieza y acaba cada una; una banda es el trozo de perfil entre esas dos alturas,
y dos contiguas comparten anillo, así que la junta no se ve. El modelo de zonas
—alturas, cortes y daño— no se tocó: cambió la silueta dentro de cada banda.

**El boceto separa la cabeza del cuerpo; el modelo no.** Un hueco entre la banda
de la cabeza y la del torso serían disparos que no dan en ninguna zona. Lo que se
hace es estrangular el cuello (radio 0.030 en el nivel 0.845), que a distancia se
lee igual y no deja agujeros.

### 38.3 Los colores de equipo, medidos y con la paleta casi llena

La paleta libre a estas alturas es estrecha, y no por capricho: el naranja es de
las dianas, el rojo de «te están disparando», el verde de los botones y —desde
esta vuelta— de la brújula, el ámbar del explosivo, el amarillo de «te han
detectado» y el azul eléctrico del canal de carga. Quedan el azul medio y el
magenta.

Se eligieron midiendo en **CIELAB**, que es donde una diferencia de color se
parece a lo que ve un ojo; en RGB, dos azules muy distintos pueden salir «cerca».
Barriendo candidatos:

| par | ΔE entre equipos | ΔE al reservado más cercano |
|---|---|---|
| #2F6BF0 + #8B5CF6 | 25 | 79 |
| #2F6BF0 + #A64BF0 | 37 | 79 |
| **#2F6BF0 + #D94BD9** | **51** | **79** |
| #3B82F6 + #E04BB8 | 63 | 64 |

Gana el tercero: separa los equipos entre sí sin acercarse a nada que ya
signifique algo. Y contra el fondo real del Plano A, con el método de la vuelta
37 —el mismo frame con muñecos y sin ellos, la diferencia da sus píxeles—: magenta
3.02 de contraste medio, azul 2.28, contra 2.63 del naranja de hoy.

### 38.4 La brújula pasa a verde y a tener volumen

Dos cambios, y el segundo tiene más miga que el primero.

El color lo pide el encargo: verde FlickLAB. Es el único sitio donde un color de
la paleta significa dos cosas —también son verdes los botones de acción— y se
admite porque no coinciden nunca en pantalla: los botones son de menú y la brújula
es del mundo.

El volumen resuelve lo que la vuelta 37 dejó a medias. Allí se midió que un
triángulo **plano** a la altura de los ojos ocupa cero píxeles, y se parcheó
levantando la cola. Con volumen de verdad —una cuña: rectángulo en la cola, punta
en el morro— el perfil es la forma, no un parche.

Pero apareció un problema nuevo que sólo se ve mirando: **justo de frente y justo
de espaldas, la silueta de una cuña es la misma** —su rectángulo de cola—, y en
esta escena no hay ni una luz, así que no hay sombreado que las separe. Un muñeco
encarado y uno de espaldas se veían igual, que es exactamente lo contrario de lo
que sirve una brújula. La solución no es geometría: es **la tapa de la cola en un
verde al 45%**, en su propio grupo de material. De frente se ve el claro, de
espaldas el oscuro.

### 38.5 La ficha: apuntar es la condición

Arma y nick, dos filas, por encima de todo lo demás. Y **no sale por estar a la
vista**: sale tras sostener la mira encima 350 ms. Una ficha por cada muñeco
visible es una pantalla de rótulos; el gesto de apuntar es lo que dice a cuál
estás mirando.

Es DOM en el espacio (`CSS3DRenderer`), como era el tablero de acciones, y por el
mismo motivo: reutiliza la tipografía y la silueta del arma que ya existen en vez
de repintarlas en WebGL. Ahí se rompió, de paso, una aserción de
`estabilidad.mjs` que decía «con el tablero apagado la capa CSS3D está vacía»: ya
no lo está, y lo que había que comprobar —que el tablero no pone nada— se comprueba
igual.

Dos detalles del mecanismo:

- **El «apuntar» se mide por ángulo, no con un rayo por frame.** Un rayo por
  muñeco y por frame es justo lo que el presupuesto no admite, misma regla que la
  visión del enemigo. El rayo va **una vez**, al cumplirse el tiempo, para
  descartar cobertura por medio, y se repite cada 400 ms mientras la ficha siga
  puesta, con presupuesto de uno por frame.
- **Ese rayo va a la cabeza, no al pecho.** Con el pecho, la primera prueba real
  dio `clear: false` en todos los casos: asomado por encima de una caja, lo que se
  ve de un muñeco es la cabeza, y un rayo al pecho choca contra la caja y deja sin
  ficha justo al que estás mirando.

El nick es hoy la ranura del pool (`VK-01`) y el arma la del `ENEMY`, hasta que
haya identidades de verdad. Y `instance.friendly` ya existe en false: el día que
haya equipos, a un compañero se le ve la ficha siempre — saber quién juega contigo
no se gana apuntando.

### 38.6 Un bug que sólo se ve con la pila puesta

Los marcadores se escalan con la distancia para no encoger en pantalla, y el
grupo escalado llevaba también **las alturas**. Con una sola brújula pegada a la
cabeza apenas se notaba; con tres capas encima, un muñeco a 25 u tenía su pila
flotando tres cuerpos por encima.

La regla correcta: la coronilla **no** escala —está donde está— y la pila sí,
porque su tamaño también. O sea `bodyTop + offset · escala`, que con el grupo
escalado se escribe dividiendo las alturas por la escala.

### 38.7 Agacharse achata, y es lo más barato que se hizo

Una escritura de `scale.y` por frame con la altura de ojos que el movimiento ya
ha resuelto. Sin esqueleto, sin animación y sin tocar el ancho. Es el mismo dato
del que salen las zonas de disparo al agacharse, así que no hay dos ideas de
«estar agachado» que se puedan desincronizar.

Hoy no se ve jugando —en primera persona no te ves, y la vista F3 aparca al
jugador—, así que lo que lo sostiene es una aserción: agachado el cuerpo mide
0.618 de su alto, que es exactamente la proporción de las alturas de ojos.

## Ronda 39 — El tamaño de la brújula, el audio real y dos ranuras

### 39.1 La brújula era del tamaño del muñeco, y se midió

La brújula de la vuelta 38 salió proporcional a la altura del muñeco y sin medir
lo único que importa de un marcador: **cuánto ocupa en pantalla comparado con
aquello a lo que se refiere**. Medido después, con `length` a 0.34 la cuña vista
de lado ocupaba **el 105% del ancho de la silueta del muñeco a 4 u y el 108% a
8 u**. No es que fuera grande: es que el marcador era más grande que el objeto
marcado, y lo primero que se veía de un rival era su brújula.

El banco (`brujula39.mjs`) barre ocho tamaños contra siete distancias del Plano A
y mide sobre **los píxeles exactos del marcador** —los que cambian entre dibujar
el frame con brújula y sin ella— dos cosas a la vez:

| tamaño | ancho contra el muñeco (≤8 u) | área a 12 u | área a 20 u |
|---|---|---|---|
| 1.00 (vuelta 38) | 105-108% | 299 px | 295 px |
| 0.75 | 76-78% | 166 px | 165 px |
| 0.65 | 64-69% | 125 px | 124 px |
| **0.60 (elegido)** | **61-64%** | **107 px** | **106 px** |
| 0.55 | 57-58% | 89 px | 88 px |
| 0.50 | 50-53% | 73 px | 72 px |

El listón de legibilidad no se inventó aquí: es el de la vuelta 37 —80 px de
marcador se leen, 28 no (§37.4)—. A 0.5 se cae por debajo; a 0.6 quedan 105 px a
media distancia y el marcador ocupa dos tercios del ancho del muñeco. Ése es el
punto, y la suite lo guarda con las dos cifras, no con el número.

Dos cosas que el barrido dejó claras de paso:

- **El área relativa engaña.** A 4 u la brújula de la vuelta 38 era sólo el 9.6%
  de los píxeles del muñeco y aun así se comía la silueta: un cuerpo es alto y
  estrecho, y lo que se compara al mirar no son áreas sino anchos.
- **La dominancia crece con la distancia y es inevitable.** Más allá de
  `referenceDistance` el marcador deja de encoger (§37.5) mientras el cuerpo sí
  encoge, así que a 30 u cualquier tamaño acaba pesando más que el muñeco. La
  elección está en a qué distancia empieza a pasar eso, no en si pasa.

**Y una lección de método que costó tres intentos:** medir por captura de
pantalla no vale aquí. Una captura pasa por el compositor del navegador y el
bucle del motor dibuja entre una y otra, así que la diferencia entre dos frames
que deberían ser idénticos salía con ~3.000 píxeles de ruido repartidos por todo
el lienzo —más que el propio marcador—. Lo primero que se coló fue el cronómetro
del HUD (una captura de página incluye el DOM); apagado eso, seguía moviéndose la
cámara, que el motor reescribe desde el movimiento en cada frame. La forma
correcta es **dibujar a un render target y leer sus píxeles en el mismo turno**:
dos frames iguales dan diferencia cero, y a partir de ahí lo que sobra es señal.

### 39.2 Muestras de disparo: la única puerta que se abre a un asset

Hasta aquí la regla era «cero assets, de ningún tipo»: audio sintetizado,
siluetas vectorizadas y geometría procedural. La regla se mantiene **salvo para
el disparo**, que es lo único del juego que no se puede sintetizar de forma
convincente con cuatro osciladores. Todo lo demás —impacto, aterrizaje, pitido,
escudo, música— sigue generado.

Lo que se abre es un carril, no una excepción suelta:

- **La síntesis no se sustituye, se queda debajo.** Un arma sin muestra suena
  exactamente como hoy, y el juego arranca y se juega entero sin un solo fichero
  de audio en el repositorio (que es el estado con el que se entrega esta vuelta).
  Un fichero que no está, que no se decodifica o que **todavía no ha llegado** es
  un arma que suena sintetizada, nunca un disparo mudo y nunca una espera.
- **`Reference/` sigue sin servirse.** Los mp3 se dejan en
  `Reference/Audio/weapons/<clave-del-arma>.mp3` y `npm run audio:weapons` los
  copia a `public/audio/weapons/` y emite el manifiesto
  `src/audio/weaponSamples.js`. Es el mismo patrón que los tres scripts de
  trazado: paso manual, material de origen fuera del build, salida versionada.
- **Qué hay se sabe por el manifiesto, no preguntando.** Sondear el servidor
  costaría un 404 por arma y por variante en cada arranque —hoy, seis— para
  enterarse de algo que el build ya sabe.
- **La variante silenciada es opcional y su ausencia no cae a la normal.** En
  este juego el sonido es información: soltar el disparo sin supresor de un arma
  que lo lleva puesto diría que no llevas supresor. Cae al perfil silenciado
  sintetizado, que al menos suena a silenciador.
- **Dos trampas del contexto de audio**, las mismas que ya dejaron cicatriz en
  `music.js` (§33): el contexto no existe hasta el primer gesto, y
  `disposeAudio()` lo cierra y el siguiente `initAudio()` crea otro. Un
  `AudioBuffer` decodificado con el contexto viejo no vale en el nuevo, así que se
  guarda **sobre qué contexto** se decodificó. React en modo estricto monta,
  desmonta y vuelve a montar: pasa de verdad.

**Qué cambia en el build cuando lleguen los ficheros, medido.** Se hizo el
experimento con un fichero de 7 KB en `public/audio/weapons/`:

| | sin muestras | con una muestra de 7 KB |
|---|---|---|
| `dist/assets/index-*.js` | 840.370 B (hash `Bq8-FqSV`) | 840.370 B (mismo hash) |
| ficheros de audio en `dist/` | — | 7.000 B, tal cual |

El bundle **no cambia ni un byte ni de hash**: lo que hay en `public/` se copia
verbatim, no se empaqueta en el JS, no se convierte en base64 y no entra en el
grafo de módulos. Consecuencias prácticas: el arranque y el primer pintado no se
tocan; las muestras se piden **después del primer gesto del usuario** (que es
cuando existe el contexto de audio), en paralelo y sin bloquear nada; y cada
fichero es una petición cacheable con su propio nombre, así que cambiar un
disparo no invalida el bundle. Con tres armas y las dos variantes que admiten
supresor son cinco ficheros: a 128-192 kbps y ~150 ms de disparo, del orden de
**5-10 KB cada uno, 25-50 KB en total** — menos del 6% de lo que ya pesa el JS.
Medido en el banco, una muestra de 120 ms tarda **~90 ms** desde que se pide
hasta que está decodificada y lista; hasta entonces se dispara sintetizado.

Lo que sí habrá que calibrar el día que llegue el primer fichero real: **el
nivel**. Una grabación viene normalizada a tope y la síntesis no. En el banco, la
muestra de prueba midió un pico de 0.32 en el máster contra los 0.097 del disparo
sintetizado —3.3 veces— y un salto así al cambiar de arma se oye. Para eso está
`AUDIO.sampleVolume`, que se queda en 1 porque igualar sonoridades sin muestra
que medir sería inventarse un número.

### 39.3 Dos ranuras, y la pistola no se elige

La pistola pasa a llevarse **siempre**, en la tecla 2, y desaparece del
desplegable de arma principal, que se queda con las dos que compiten por la
tecla 1. Que no se elija es justo lo que la hace una pistola: es el arma con la
que te quedas cuando la principal está vacía o no es la adecuada para la
distancia, y para eso tiene que estar siempre.

Tres decisiones dentro:

1. **La ranura la declara el arma** (`WEAPONS[x].slot`), y de ahí se derivan
   `PRIMARY_WEAPONS` y `SECONDARY_WEAPON`. No hay una segunda lista de armas
   principales en el panel de opciones ni en el saneado: si un arma cambia de
   ranura, cambia sola en los tres sitios.
2. **El catálogo del ajuste se estrecha, y eso borra el valor guardado.** El
   ajuste `weapon` se valida ahora contra `PRIMARY_WEAPONS`, así que un
   `weapon: 'pulse'` guardado antes de esta vuelta cae al valor de fábrica en
   el siguiente saneado. Es exactamente lo que hace el saneado con cualquier
   clave obsoleta desde la vuelta 8, y es deliberado: la alternativa era aceptar
   como principal un arma que ya llevas encima.
3. **Lo que dejas se congela, y una recarga no avanza en la espalda.** Cada arma
   guarda su cargador y **lo que le faltaba de recarga**, no la fecha en la que
   acababa. Con un instante absoluto, cambiar de arma cinco segundos sería
   recargar gratis: el mismo agujero que ya se cerró con la cuenta atrás del
   explosivo (§29) y con la carga del escudo (§34). Al volver a equiparla, la
   recarga sigue desde donde se quedó.

Dos efectos secundarios que no son accidentales:

- **El HUD deja de leer el arma del ajuste.** Enseña la que llevas en la mano, y
  el motor la publica por callback —una pulsación, no un valor por frame—, que es
  lo que permite que siga siendo estado de React sin repintar por frame.
- **El silenciador es del arma vigente, no de la principal.** El interruptor deja
  de desaparecer con un arma que no lo admite, porque ahora siempre llevas encima
  una que sí: la pistola. Lo que cambia es el aviso, que dice a cuál se aplica.

Y «cambiar de arma» (Q) pasa a **alternar las dos que llevas** en vez de recorrer
el catálogo y guardarlo como preferencia. Antes, cambiar de arma en mitad de una
partida se te quedaba puesto para la siguiente.

## Ronda 40 — Saber que te disparan sin estar mirando

### 40.1 El agujero que se cierra

Hasta aquí, todo lo que decía que te estaban disparando estaba **delante**: el
anillo de la mira dice *que* te han dado pero no de dónde, y la brújula, el `?` y
el `!` sólo existen para los muñecos que tienes en pantalla. Un tirador a la
espalda no aparecía por ningún sitio, así que la única respuesta posible era girar
a ciegas.

Las tres señales nuevas atacan el mismo agujero por tres canales distintos, y
**ninguna necesita que estés mirando al que dispara**:

| señal | canal | cuándo |
|---|---|---|
| Cuña direccional en el borde | vista periférica | cuando te **dan** |
| Silbido de la bala | oído, con dirección | cuando **fallan cerca** |
| Fogonazo en el pecho | vista, en el mundo | en **cada** disparo |

Se reparten el trabajo en ese orden de intensidad, que no es casualidad: de las
tres, la única que cuesta vida es la primera.

### 40.2 La cuña: el ángulo se calcula, y el hueco de la mira es geometría

El ángulo sale del **vector de la cámara**, no de su `rotation.y`, y se mide **en
horizontal**. Las dos cosas por el mismo motivo que el cono de aparición: el
empuje del retroceso mueve la mira de verdad —lo que hay que contestar es hacia
dónde girar desde lo que se ve— y un disparo que llega desde arriba sigue
llegando desde un lado, así que mirar al suelo no puede cambiar de qué lado te
disparan. Medido: mirando al suelo, el mismo tirador da 89.99° contra 90.00°.

La cuña se pinta con un **`conic-gradient` centrado en ese ángulo**, y no con
cuatro cuadrantes ni con un elemento rotado. Dos ventajas que no son de estilo:

- **La convención encaja sola.** Un `conic-gradient` cuenta los grados desde
  arriba y en el sentido del reloj, que es exactamente cómo se define el ángulo
  (0 delante, positivo a la derecha). No hay conversión que pueda salir
  espejada, que es el fallo clásico de este indicador.
- **El hueco central es una máscara radial**, no una opacidad ajustada a ojo. La
  regla de la vuelta 34 —cuando te disparan, lo último que se puede tapar es el
  sitio al que hay que apuntar— queda garantizada por construcción: por dentro
  de `damageArcInner` no se pinta nada, se mire lo que se mire.

Va en **rojo** (`COLORS.threat`), que en esta paleta ya significa «te están
disparando», y no en el naranja del anillo de la mira: son dos avisos distintos
—cuánto y de dónde— y el naranja es de las dianas.

### 40.3 El silbido: qué cuenta como «cerca»

Se mide contra **los oídos** —el centro de la banda de la cabeza— y no contra el
cuerpo, porque lo que se modela es el chasquido al pasar. El emisor se coloca en
el **punto de máxima aproximación** de la trayectoria, que es por donde pasó de
verdad: de ahí sale la dirección, que es toda la información que da este sonido.
Va por el mismo `spatial.js` que el pitido del explosivo, así que con el audio
espacial apagado cae a volumen sin dirección, como el resto.

Tres cortes antes de sonar, y los tres son la misma idea —que esa bala no te ha
pasado cerca—: por detrás no (el punto más próximo cae detrás de la boca del
arma), a bocajarro no (menos de 5 u: ahí el propio disparo ya dice de dónde
viene, y el punto de aproximación cae casi en la cámara), y si la para una caja
tampoco.

**Y el rayo que comprueba eso último va con presupuesto por frame**, como el de
la visión y el de la ficha flotante. Medido en el Plano A con ocho muñecos: 13.8
disparos por segundo, de los que **5.7 pasan cerca** —cuatro de cada diez—, así
que sin tope un frame malo pagaría ocho rayos de golpe, 0.24 ms, todo el
presupuesto, por un sonido. Con `raysPerFrame: 2` lo que se pierde al tocar el
tope es **un silbido, no una bala**: si tres balas te pasan cerca en el mismo
frame se oyen dos, y la información llega igual.

Coste medido de las tres señales juntas, sobre el trozo de frame que lleva el
combate: **p50 sin cambio, p99 +0.1 ms** (un tic del reloj del navegador, que es
la resolución) y nunca más de dos rayos de más por frame, por construcción.

Es una **voz propia** (`playBulletWhizz`), no el disparo con otro volumen: ruido
por un pasa-banda que **cae** de 4.2 kHz a 1.25 kHz en 90 ms y sin nada por
debajo de 900 Hz. El disparo lleva cuerpo grave y esto no lleva ninguno: la caída
de tono es lo que se lee como «ha pasado de largo» y no como «ha sonado ahí».

### 40.4 El fogonazo, y por qué era barato

Un `MeshBasicMaterial` aditivo —no una luz: en esta escena no hay ninguna— con
una geometría y un material para **todo** el pool, una malla por ranura y, por
frame, recorrer las encendidas para apagarlas. Cero alocaciones y ningún rayo.
Sí era barato.

Dos cosas salieron de medir y no de suponer:

- **En el eje del cuerpo no se ve.** Un destello centrado en el eje del muñeco se
  dibuja **dentro** de su propia malla: de los ~340 píxeles que tocaban a 6 u se
  veían **24**, los de las esquinas. La boca del arma va un palmo por delante del
  pecho (`ENEMY.muzzleForwardFactor`), que es donde está la boca de un arma. La
  bala sigue saliendo del eje: esto no cambia ni una trayectoria.
- **Un cuadrado blanco no se lee como fogonazo.** A 0.4 u se leía como una
  tarjeta pegada al pecho. Es una **estrella de cuatro puntas** de 0.22 u —nueve
  vértices, el mismo coste— porque sin luces en la escena la silueta es lo único
  que dice qué es una cosa. Misma regla que la visera del casco del suelo.

Y va en **blanco**, el único color que no significa ya otra cosa: naranja las
dianas, rojo la amenaza, ámbar el explosivo, amarillo la detección. Que coincida
con el pop del acierto no estorba: uno sale donde disparas y el otro donde te
disparan.

### 40.5 La brújula: contorno negro y morro caído

**El contorno.** Misma técnica que las aristas de la cobertura y del marcador del
explosivo: `EdgesGeometry` sobre la propia malla y `LineSegments` encima, más un
`polygonOffset` en las caras para que la línea gane el desempate de profundidad.
Lo que compra, medido en contraste WCAG contra los ocho grises de `COVER`:

| pieza | verde↔gris | negro↔gris |
|---|---|---|
| bordillo `#2B2B2B` | 6.73 | 1.48 |
| baja `#454545` | 4.56 | 2.19 |
| media `#6E6E6E` | 2.42 | 4.12 |
| **alta / parapeto `#9A9A9A`** | **1.34** | **7.46** |
| **bloque `#C8C8C8`** | **1.26** | **12.55** |
| plataforma `#3A3A3A` | 5.41 | 1.85 |
| rampa `#4E4E4E` | 3.96 | 2.52 |

Sobre las piezas claras el verde se queda en **1.26-1.34 de contraste**, o sea
sin filo: la cuña deja de leerse como cuña justo donde hay que asomarse. Con el
par verde+negro, el peor caso de todo el mapa sube a **3.96**. Ninguno de los dos
colores cubre la rampa de grises solo; juntos, sí.

**Y lo que cuesta, que también está medido:** contra el fondo oscuro —que es la
mayor parte de la pantalla— el contorno se come el anillo exterior de píxeles
verdes. A 12 u el marcador pasa de **117 a 75 px** de verde visible y de 24×9 a
19×7. Queda por debajo del listón de 80 px de la vuelta 37, aunque **la silueta
sigue siendo la misma cuña**: mirado píxel a píxel a esa distancia, el perfil con
contorno sigue siendo un triángulo limpio. Es la única cifra de esta vuelta que
empeora, y está anotada aquí a propósito.

**El morro caído.** La punta baja media altura respecto al centro de la cola
(`noseDrop: 0.5`). Es una **segunda señal de orientación, de forma**, y convive
con la de tono (`tailShade`) porque **no se leen en el mismo sitio**:

- **De frente y de espaldas** la cuña es casi la misma silueta —8×8 px contra
  8×10 a 12 u, un 3-7% de diferencia de forma—, y ahí lo que separa es el tono:
  Δ de luminancia **34-62** entre ver el morro y ver la cola.
- **De perfil** el tono no dice nada, porque se ven las dos caras a la vez, y ahí
  lo que habla es la pendiente. Con `noseDrop: 0` el perfil era un rombo
  simétrico; con 0.5 es un triángulo que **baja** hacia la punta.

O sea: las dos señales no se solapan, se reparten los ángulos. El coste del morro
caído es cero —los mismos cinco vértices— y lo único que añade de frente es que
la punta asoma por debajo del rectángulo de la cola, que es un tercer indicio
pequeño y gratis.

## Ronda 41 — Nombres propios: el arsenal, el modo y el marcador

### 41.1 El arsenal se renombra, y no cambia ni un número

**Scalar-2 → Pulse, Axis-7 → Rift, Vertex-9 → Volt**, con arte nuevo. Lo
que **no** cambia: cadencias, cargadores, recargas, objetivos de precisión,
absorción de escudo y patrones de retroceso. Estaban calibrados y un renombrado
no es una recalibración.

Tres cosas del cambio que sí son decisiones:

- **La convención de las referencias es `<arma>.png` y `ghost-<arma>.png`.** La
  segunda es la misma arma con silenciador, y desde esta vuelta la tienen las
  tres: `trace-weapons.mjs` saca las seis siluetas de un bucle sobre el arsenal
  en vez de cuatro entradas escritas a mano, y `WeaponSilhouette` elige con una
  línea en vez de una tabla de variantes. Añadir un arma es añadir su clave.
- **Rift pasa a admitir silenciador**, que antes era el único que no. No es un
  cambio de equilibrio disfrazado: el motivo por el que no lo admitía era que no
  había foto de esa variante, y ahora la hay. Con eso, el aviso de «esta arma no
  lo admite» del panel deja de salir nunca — el `if` se queda porque lo decide el
  dato (`supportsSuppressor`), no la lista de armas de hoy.
- **Los nombres viejos guardados se traducen, no se tiran.** La clave del arma
  está en el `localStorage` de quien ya jugó, y el saneado, que no la conoce, la
  mandaría al valor de fábrica: quien tuviera el Volt abriría el juego con el
  Rift sin explicación. `LEGACY_WEAPON_KEYS` traduce antes de validar. Es una
  tabla de renombrado, no un catálogo: no añade opciones, dice cómo se llamaba
  cada una. La clave de la pistola no está porque desde la vuelta 39 ya no era un
  valor válido de ese ajuste, y ésa sí cae a fábrica como cualquier clave
  obsoleta.

**Nota para leer las entradas anteriores:** el resto de este documento usa ya los
nombres nuevos, aunque cuente vueltas en las que las armas se llamaban de otra
forma. Se prefirió que un nombre se pueda buscar y encontrar a conservar el que
tenía el día que se escribió cada entrada; la equivalencia es la de arriba.

### 41.2 El contorno de la brújula: lo que se puede afinar, y lo que no

**En WebGL el grosor de una línea no se toca.** `LineBasicMaterial.linewidth` se
ignora en todas las plataformas relevantes y cada línea sale de un píxel. Así que
«contorno más fino» sólo puede significar **menos opaco**, y eso sí se puede
medir. El barrido (`br41.mjs`) mide las dos cifras que se pelean sobre los
mismos píxeles, a la vez:

| opacidad | px del marcador (12 u) | filo vs `alta` | filo vs `bloque` |
|---|---|---|---|
| 0.00 (sin contorno) | 117 | 2.07 | 1.23 |
| 0.35 | 117 | 2.31 | 5.88 |
| **0.50 (elegido)** | **116** | **2.57** | **6.54** |
| 0.65 | 116 | 2.66 | 6.77 |
| 0.80 | 104 | 2.69 | 6.84 |
| 1.00 | 75 | 2.69 | 6.84 |

**Sí hay punto intermedio, y está en la mitad.** A 0.5 el marcador conserva 116
de los 117 píxeles que tenía sin contorno —el negro entero dejaba 75, por debajo
del listón de 80 de la vuelta 37— y se lleva el **96%** del filo que compra el
negro contra la pieza más clara del plano. La curva es así de asimétrica porque
lo que estaba haciendo el contorno opaco era **borrar el anillo exterior**, que
son píxeles de antialias a medio cubrir: a media opacidad vuelven a ser verde a
medias en vez de desaparecer, y el filo apenas lo nota.

**Y una cifra de la vuelta 40 que esto corrige.** Allí se dijo que el negro daba
7.46 de contraste contra el gris `alta`. Ése es el contraste de los dos colores
sobre el papel; **medido en pantalla son 2.69**, porque una línea de un píxel con
antialias nunca llega a pintarse negra del todo. Contra ese gris concreto, ninguna
opacidad cruza el 3.0 de la norma: el contorno ayuda, pero no lo arregla. Contra
`bloque`, el más claro, sí de sobra.

Con un criterio más estricto —contar sólo píxeles con 3:1 contra lo que tienen
detrás— el resultado es otro y merece quedar escrito: ahí **cualquier** contorno
cuesta lo mismo (117 → 74) y ninguna opacidad lo recupera. O sea que el
intermedio existe bajo el criterio con el que se fijó el listón de 80 px, y no
bajo uno más duro. Se elige 0.5 y se anota de dónde sale cada número.

### 41.3 La ronda se acaba: sin reaparición con el explosivo armado

Con la bomba puesta, el selector de simultáneas pasa a decir **cuántos muñecos
hay en toda la ronda**, no cuántos a la vez. Los dos números siguen existiendo y
miden cosas distintas —`maxAlive` es el techo de concurrencia, `roundBudget` el
total— pero con explosivo los fija el mismo selector.

El porqué es de diseño, no técnico: una fuente infinita de muñecos mientras corre
una cuenta atrás convierte la ronda en una carrera contra el respawn. Con cupo,
limpiar el mapa es una forma legítima de llegar a la bomba, y la decisión de si
merece la pena el tiempo que cuesta vuelve a ser del jugador.

Dos detalles de implementación que evitan errores conocidos:

- **El cupo se descuenta cuando la diana sale, no cuando se intenta.** Un intento
  que no encuentra punto visible se reintenta (`pointRetryMs`), y contarlo
  gastaría ronda sin que hubiera salido nadie.
- **Se comprueba también dentro de `_spawn`**, y no sólo en el bucle: la primera
  diana la siembra `beginSession` por su cuenta, y un cupo de cero tiene que ser
  cero de verdad.

### 41.4 Deathmatch, y por qué ahí no hay estrellas

«Práctica libre + escenario, sin bomba» pasa a llamarse **Deathmatch** en la
interfaz, y sólo donde lo es: en la sala vacía, sin cobertura ni muñecos que
disparen, el segundo botón sigue siendo práctica libre. El rótulo sale del
escenario elegido, no de un interruptor aparte.

**El modo deja de ser un booleano.** Antes bastaba `endless` porque «sin
cronómetro» y «sin explosivo» eran la misma cosa; dejaron de serlo el día que un
Deathmatch pudo durar cinco minutos. Ahora hay `mode` (`timed` / `deathmatch`) y
`endless` queda como lo que siempre fue —**esta sesión no acaba sola**—, que es lo
que leen el HUD y el resumen. Un Deathmatch con cronómetro sigue sin bomba: el
modo no es «tener reloj».

**Y no lleva estrellas, a propósito.** La recomendación, con su razonamiento:

1. **Las estrellas puntúan cumplir un objetivo.** La mitad de la nota es el
   tiempo —`SCORING.weights.time`— y ese tiempo se mide contra lo que tardaste en
   **desactivar**. Sin bomba no hay reloj contra el que medir, así que la mitad de
   la fórmula o se cae o se inventa.
2. **Una nota sin condición de victoria premia jugar más rato.** En un modo sin
   límite, cualquier métrica acumulativa —bajas, aciertos— sube por estar ahí. Y
   las normalizadas (precisión, KD) ya se leen solas: ponerles cinco cortes
   encima no añade información, añade una capa que interpretar.
3. **El listón sería falso.** Los cortes de `starThresholds` están calibrados
   contra una ronda de 45 segundos con una bomba. Reusarlos en un Deathmatch de
   diez minutos diría «cinco estrellas» por algo que no se ha medido nunca.

Así que en Deathmatch el resumen enseña **bajas, muertes, KD y precisión**, que es
lo que pasó, y las estrellas se quedan donde tienen sentido. Si algún día el modo
tiene condición de victoria —un límite de bajas, por ejemplo— vuelve a haber
contra qué medir y se revisa.

### 41.5 El marcador de TAB, y la comprobación que no se salta

Manteniendo TAB se abre un marcador con nick, bajas, muertes, precisión y KD, y se
cierra al soltarla. Tres decisiones:

- **Se comprobó que TAB se puede interceptar, jugando.** Es la misma pregunta que
  hundió a Ctrl+W en la vuelta 27: hay teclas que el navegador resuelve **antes**
  de que el evento llegue a la página, y con ésas `preventDefault()` no sirve de
  nada. Así que no se supuso: `marcador41.mjs` pulsa TAB con el teclado real del
  navegador —un `KeyboardEvent` fabricado no ejecuta la acción por defecto y no
  probaría nada— con dos botones enfocables puestos en la página a propósito.
  Resultado: fuera de la partida TAB mueve el foco (cebo1 → cebo2) y jugando
  **no se mueve**, ni con la tecla mantenida, que repite el evento.
- **Fuera de la partida, TAB es del navegador.** En la pausa y en opciones es
  como se recorre un panel con el teclado; quedárnosla ahí dejaría los ajustes
  sin navegación. Sólo se intercepta jugando.
- **El layout está hecho para más filas, pero no hay filas falsas.** Es una
  rejilla de cinco columnas con cabecera y una fila —la tuya, marcada con el
  verde de la marca—. El día que haya con quién compararse, una fila más es un
  div más. Hoy no hay cuentas ni multijugador, y una lista de rivales vacía o
  inventada diría que sí. El nick es un placeholder (`VK-00`) con el mismo
  vocabulario que los muñecos (`VK-01`), para que se note que ahí va un nombre.

Y el marcador se cierra solo al salir de la partida y al perder el foco de la
ventana: alt-tab es literalmente medio TAB, y el `keyup` no llega nunca.

## Ronda 42 — Lo que se ve, lo que se para y lo que pesa

### 42.1 La brújula respeta la visibilidad real, y los iconos no

La brújula era el único marcador del mundo que estaba puesto **siempre**, y
siempre incluía «detrás de un muro»: la cuña verde flotaba sobre la Espina y
decía que había alguien detrás y hacia dónde miraba. Eso es un aviso de rayos X,
y el juego no lo da por ningún otro canal — el `?` sale cuando ya te ha visto, el
`!` cuando ya te dispara y la cuña roja cuando ya te ha dado.

**El test es el que ya existía, no uno nuevo.** La visibilidad se preguntaba en
dos sitios con dos copias del mismo raycast y dos holguras distintas
(`targets._isPointVisible`, para decidir dónde puede nacer un muñeco, y el rayo
de la ficha flotante en `markers.js`). Se extrajo a `src/game/sight.js`, que hoy
es el único sitio del motor donde se pregunta si algo se ve, y desde el que
llaman los dos. Dos copias de una fórmula es cómo acaba un marcador
contradiciendo al sistema de aparición.

Las dos mitades de «se le ve» se resuelven en el orden que cuesta menos:

- **El encuadre** es aritmética, no un rayo: un `Frustum` por frame y una esfera
  por muñeco. La esfera se centra en **la brújula** y no en el cuerpo, porque lo
  que se decide dibujar es el marcador, que va por encima de la coronilla. Y la
  vista se invierte a mano en vez de leer `camera.matrixWorldInverse`: ese campo
  lo escribe el renderer al dibujar, o sea después, y usarlo daría el encuadre
  del frame anterior.
- **La línea de visión** sí es un rayo, y va con el reparto de siempre: cada
  `MARKERS.sight.recheckMs` (180 ms, el mismo ciclo que la visión del enemigo) y
  como mucho `raysPerFrame` por frame. Sólo se gasta rayo en quien está dentro
  del encuadre, y al salir de él el reloj se queda atrás, de modo que volver a
  entrar recomprueba en el primer frame sin una línea de código extra.

**Uno por frame y no dos.** Ocho muñecos con los relojes en fase se despachan en
ocho frames —133 ms a 60 Hz, por debajo del ciclo de 180— y esos dos rayos que no
se lanzan se notan en el frame de combate, que ya paga los de la visión enemiga.
Medido con ocho vivos: **0.043 ms de media por frame** para todos los marcadores
(300 frames), y **0.01 ms** de lo que los marcadores añaden al frame de combate
medido en bucle cerrado.

**El rayo va a la cabeza, y por eso no siempre coincide con el de aparición.** La
aparición pregunta por el cuerpo a media altura; el marcador, por la cabeza, que
es lo que se ve de un muñeco asomado por encima de una caja —y es justo donde va
la brújula—. Medido en doce puestos alrededor de la Espina: once veredictos
idénticos y uno distinto, y **siempre en el mismo sentido** (la cabeza se ve
antes que el pecho). El sentido contrario significaría que el marcador ve a
través de algo, y eso es lo que la suite guarda.

**Los iconos `?` y `!` se quedan fuera de esta regla, a propósito.** No es una
inconsistencia: dicen cosas distintas. La brújula es información pasiva sobre un
cuerpo que tienes delante; los iconos son avisos de que te han visto o de que te
están disparando, y un aviso que sólo llega cuando ya puedes ver al que dispara
llega tarde. La ficha flotante ya se condicionaba a su propio rayo, y ahora usa
este mismo veredicto en vez del suyo: una pregunta, una respuesta.

### 42.2 En pausa no avanza nada, y para eso hay un reloj del mundo

**El fallo, jugando:** con Escape pulsado, un muñeco siguió disparando y mató al
jugador desde el panel de pausa.

**La causa eran dos agujeros a la vez**, y tapar sólo uno no bastaba:

- Los tiempos del combate se medían con `performance.now()`, que sigue corriendo
  con el juego parado. Pasar delta cero congelaba lo que iba por delta y dejaba
  corriendo lo que iba por fecha.
- Y el mundo se actualizaba en cada frame sin mirar la fase: `targets.update`,
  `_updateCombat` y `_updateObjective` se llamaban igual en pausa.

**La solución es un reloj del mundo**, `engine.gameTime`, que suma delta **sólo**
mientras se juega y del que cuelgan todos los tiempos del mundo: cadencia,
recarga, aparición, cuenta atrás del explosivo, reaparición y carga del escudo.
`performance.now()` se queda donde sigue teniendo sentido —el limitador de FPS,
la media de frames y el movimiento, que compara contra el `timeStamp` del
navegador—. Y las tres actualizaciones del mundo van tras la misma condición de
fase: parar el reloj sin dejar de llamar habría dejado colar el disparo que tocaba
justo en el frame de pausar.

Medido: en 2.5 s de pausa, **0 disparos enemigos, 0 de daño, 0 silbidos, 0
apariciones** y la cuenta atrás quieta; y el reloj del mundo avanza 517 ms en
medio segundo de juego y **0** en pausa.

**Y pausar es una sola cosa.** Al salir la armería había dos formas de dejar de
jugar sin terminar, así que lo que hacía el cambio de pointer lock —apagar
controles y movimiento, soltar el gatillo, pasar a pausa— se extrajo a
`_suspend()` y lo llaman las dos. Dos trozos parecidos es como acaba una pausa
con el gatillo todavía pulsado.

### 42.3 El recinto de aparición: que la geometría lo haga imposible

**El fallo, jugando:** el jugador reaparece y ya hay un muñeco esperando en su
zona. Se muere sin tocar el ratón.

La tentación es una comprobación de distancia al sembrar. Se descartó por lo de
siempre: es una regla que hay que acordarse de aplicar en cada sitio nuevo que
haga aparecer algo. Lo que se hizo es **sacar la zona del grafo**: el escenario
declara su `spawnZone` y `scenario.js` descarta al construir cualquier punto de
ruta que caiga dentro, con el radio del cuerpo de margen. No hay dónde aparecer
ni a dónde patrullar, y vale para **todos los modos** porque el grafo es uno.

El rectángulo se lee **como una caja** —esquina mínima, ancho y fondo—, con la
misma convención que `boxes`: son datos del mismo escenario y leerlos con dos
convenciones distintas es un error que no da la cara. (Costó una vuelta de
medidas: los tres muros salieron primero interpretando el centro.)

Los muros son la otra mitad, y son tres piezas `alta` que cierran el Vestíbulo
por detrás y por los dos costados dejando el frente abierto —que es hacia donde
se mira y por donde se sale—. Lo que cambia, medido:

| | antes | ahora |
|---|---|---|
| Rutas y puntos del Plano A | 14 / 69 | 14 / 69 |
| Punto de ruta más cercano al spawn | 5.15 u | 5.70 u |
| Puntos con línea de tiro al spawn | 38 de 69 | 25 de 69 |
| El más cercano de ésos | 5.9 u | 7.1 u |
| Piezas del plano | 20 | 23 |

**Dos puntos del Vestíbulo hubo que mover**, porque quedaban dentro de un muro, y
se movieron **midiendo**: `vestibulo-1-d` a (8, 18.5) —más al este, fuera del
volumen reservado del tablero por 0.4 u— y `vestibulo-2-b` a (−5.5, 18.5), a 0.9
u de la cara del muro oeste. La cuenta vuelve a ser 14 rutas y 69 puntos y
`rutas.mjs` pasa entero: donde no hay conjunto limpio, no hay ruta.

**Lo que sí cambia de verdad es campar el Balcón.** Desde la pasarela se veían
cuatro puntos del Vestíbulo y ahora se ve **uno**: el recinto tapa el resto, y no
por su altura —se probó con muros `media` y sale igual— sino porque la divisoria
del Vestíbulo ya cerraba el pasillo este y el único hueco que quedaba era justo
por donde ahora hay recinto. Con menos a la vista, el cupo de zona manda a los
demás a salir donde no se les ve: las apariciones pasan de repartirse entre **dos
zonas** a hacerlo entre **las seis**, y alrededor de un tercio salen a ciegas.
Eso es la respuesta al campeo funcionando, no un efecto secundario — pero deja
sin valer la frase de la vuelta 31 de que con el cupo de serie no hacía falta
ninguna aparición a ciegas en ningún puesto del plano. Las dos aserciones de
`zonas-test.mjs` que medían «el reparto entre las dos zonas visibles» se
cambiaron por las que ahora miden lo que el fallo original pedía: que campar no
te dé la ronda entera en tu zona (56% de 154 apariciones, contra un cupo que
permite el 60%) y que la respuesta sea repartir (seis zonas).

**Y una consecuencia anotada a propósito:** el tablero de acciones se ancla al
punto de aparición y se dibuja a 9 u al este, o sea **detrás del muro este del
recinto**. Está apagado desde la vuelta 28 y su hueco se sigue auditando, pero el
día que vuelva en el Plano A habrá que moverle el ancla. `fixes.mjs` lo prueba
plantándose justo fuera del recinto, que es de donde se vería.

### 42.4 El resiembre masivo al tocar un ajuste

**El fallo, jugando:** en pausa, con tres muñecos ya abatidos en una ronda de
bomba, activar el silenciador desde opciones llenó el mapa de muñecos de golpe,
algunos encima del jugador.

**La causa, confirmada antes de tocar nada:** `_applySettings` llamaba a
`targets.beginSession()` con **cualquier** ajuste. Sembrar de nuevo es lo
correcto cuando las dianas en pantalla han dejado de existir —cambiar el tipo de
diana o su tamaño rehace las mallas—, pero el silenciador no toca ninguna.
Además, sembrar desde la posición del jugador parado en su zona es exactamente
cómo salen todos juntos encima.

El arreglo es que `targets.configure` **diga si tuvo que rehacer el pool**, y sólo
en ese caso se vuelva a sembrar. El cupo de ronda sí se recalcula siempre: cambiar
el selector de simultáneas con el explosivo puesto cambia cuántos quedan por
salir, y eso no necesita rehacer nada. Medido: 5 vivas y 8 salidas antes del
silenciador y 5 y 8 después; el ajuste que sí rehace el pool sigue sembrando.

### 42.5 La armería, y que un arma pese

**Elegir arma no es un ajuste.** Estaba como una fila más del panel de opciones,
un desplegable entre la sensibilidad y el tamaño de diana. Es la decisión de la
partida, y desde esta vuelta cuesta velocidad, así que tiene panel propio: tecla
**B**, silueta de cada arma, ficha con sus números y un botón de equipar. Sin
precios y sin botón de comprar: eso depende de rondas y de dinero, que no existen.

Cuatro decisiones dentro:

- **Pausa como Escape, y por el mismo camino.** Elegir arma con ocho muñecos
  disparándote no es una decisión, es una ruleta. Se suelta el ratón y se llama
  a `_suspend()`, sin esperar al evento de pointer lock, que es asíncrono: hasta
  que llegase seguiría corriendo el reloj.
- **La pistola tiene ficha pero no botón.** Se lleva siempre —es la regla de la
  vuelta 39— y ofrecerla como principal sería ofrecer llevar dos pistolas.
- **El daño que se enseña es el del modelo de zonas** (cabeza 100 · torso 50 ·
  piernas 34), que hoy es el mismo para las tres armas. Poner un número de daño
  por arma habría sido inventarse un dato que el juego no tiene.
- **Opciones no pierde la fila, pierde el control.** Sigue diciendo qué arma
  llevas y por dónde se cambia, con la tecla sacada del store de binds: quitarla
  del todo dejaba perdido a quien llevaba vueltas buscándola ahí.

**El peso va en kilos y el freno sale de él.** Cada arma declara `weight` y
`weaponSpeedFactor` traduce: hay peso gratis hasta `MOVEMENT.load.free` (1.2 kg,
por debajo de la pistola), se pierde un 4% de marcha por kilo por encima, y hay
suelo en 0.75. Tres consecuencias que son el diseño:

- **La que se lleva siempre no cuesta velocidad.** Si la pistola frenase, el
  coste estaría en no haber elegido. Lo paga la principal, que es la decisión.
- **Es lineal por kilo, no una tabla por arma.** Una tabla se desincroniza con el
  peso en cuanto alguien toca un número: el arma declara una cosa y el efecto
  sale solo. Y la misma función la usa la armería para decir cuánto frena, así
  que el panel no puede prometer un 10% y las piernas dar un 6%.
- **Multiplica las tres marchas**, no sólo la carrera: si sólo frenase corriendo,
  andar con el rifle acabaría siendo más rápido que correr con él en cuanto el
  factor bajase de `walkSpeed/speed`.

Hoy: Pulse 1.1 kg → 6.50 u/s, Volt 2.6 → 6.14, Rift 3.6 → 5.88. Un 10% entre la
pistola y el rifle, el orden de magnitud de un shooter táctico. **Se calibra
jugando.**

**En el aire no cambia nada**, y es la regla de siempre: la marcha se congela al
despegar, así que cambiar de arma a media trayectoria no alarga ni acorta el
vuelo (medido: 6.500 antes y después del cambio, y 5.88 al pisar el suelo). Y el
techo del air-strafe no se toca: el aire es técnica, y hacer que el rifle también
la castigue sería cobrar dos veces por lo mismo. Por eso las suites del modelo de
movimiento se miden **con la pistola equipada**: la referencia del modelo es el
jugador sin carga, y lo que hace el peso lo prueba su propia suite.

**Y la B estaba ocupada.** La tenía el silenciador desde que existía, así que se
mudó a la **V**. Eso no se puede hacer sólo cambiando el valor por defecto: la B
del silenciador está guardada en el navegador de quien ya jugó, el saneado
respeta lo guardado, y la invariante de que dos acciones nunca comparten tecla
habría dejado **la armería sin tecla** sin ningún aviso. `LEGACY_KEYBINDS` es la
hermana de `LEGACY_WEAPON_KEYS` y resuelve el mismo problema por el otro lado:
allí una clave vieja se traduce, aquí una tecla vieja se **suelta**. Y sólo ésa: a
quien la hubiera reasignado a mano no se le toca nada.

## Ronda 43 — Un muro en vez de una ratonera, y una armería que se lee

### 43.1 El spawn: de recinto a muro

**El recinto de la vuelta 42 estaba mal.** Cumplía la letra del encargo —ningún
muñeco puede aparecer donde reaparece el jugador— y fallaba el espíritu: tres
muros y una sola boca son una ratonera. Todo lo que hubiera enfrente te veía por
esa boca, no había forma de estar del todo tapado, y salir era siempre por el
mismo sitio.

El encargo de esta vuelta vino con **croquis**, y el croquis cambia dos cosas de
raíz:

- **Una sola pieza, no un recinto.** Una línea atravesada delante del jugador,
  con salida por los dos extremos. Deja de ser un sitio del que huir y pasa a ser
  **cobertura**: la primera con la que se practica el asomo.
- **La exclusión es media sala, no una bolsa.** «De la línea hacia atrás no
  aparece nadie». Con una bolsa quedaban muñecos a los costados, y por eso nunca
  se estaba 100% tapado — que era literalmente lo que impedía comprobar la
  brújula de la vuelta 42.

La bolsa y la banda son el mismo dato (`spawnZone`, una caja en las coordenadas
del escenario) y el mismo filtro (`isInSpawnZone`): lo único que cambia es que
ahora la caja cruza la sala de lado a lado. No hizo falta tocar código.

**Los tres números del muro se midieron, ninguno se eligió.**

`muro43.mjs` barre largo × distancia al spawn y mide cuatro cosas a la vez:
cuántos puntos del grafo ven el punto exacto de reaparición, cuántas casillas de
la banda están ciegas para todos ellos, cuánto hay que andar hacia cada extremo
para empezar a ver el mapa, y cuánto cuesta cruzarlo entero.

| largo | ve el spawn | casillas ciegas | asomo O / E | cruce |
|---|---|---|---|---|
| 8 u | 3 puntos | 16 | — | 1.36 s |
| 10 u | 1 punto | 27 | — | 1.70 s |
| **12 u** | **0** | 43 | 0.09 / 0.71 s | 2.04 s |
| **14 u** | **0** | 64 | 0.34 / 0.90 s | 2.38 s |

Por debajo de 12 el jugador plantado en el spawn ya es visible, que es justo lo
que el muro existe para impedir. A 12 el asomo por el oeste cuesta 0.09 s —un
paso, no un asomo—. **14** es el primero donde las dos salidas cuestan algo y
cruzarlo sigue siendo un gesto y no un viaje. Y son 14 de 40, o sea un tercio de
la sala: lo mismo que ocupa la línea roja del croquis.

**Y el alto se midió aparte, porque la primera versión salía mal a la vista.**
Con `alta` (3.6) todo lo anterior se cumplía y, mirando desde el spawn, **el 100%
del encuadre era pared gris**: se aparecía sin saber hacia dónde se sale.
`pantalla43.mjs` lo mide lanzando un rayo por celda de una rejilla del encuadre:

| alto | pantalla que ocupa |
|---|---|
| `alta` 3.6 | 100% |
| `media` 1.9 | **60%** |

Con 1.9 se ve el mapa por encima del muro —basta para orientarse— y **tapa
exactamente igual**: una recta entre dos puntos por debajo de 1.9 que cruce su
huella está cortada, y tanto los ojos del jugador (1.7) como los de un muñeco
(1.44) están por debajo. Se comprobó, no se supuso: con `media`, los puntos que
ven el spawn siguen siendo **0 de 68** y las casillas ciegas, las mismas 64.

Sigue cumpliendo lo que pedía el encargo —más alto que cualquier jugador, así que
sólo se sale por un extremo— y no se salta: el ápice del salto son 1.2528 u y no
hay nada pegado a él desde lo que subirse (medido: lo más alto da 1.50 contra
1.9).

**Lo que cuesta, anotado y no escondido:**

- **`targetRadius` por encima de 0.59** hace un muñeco de 2.4 u, que asoma los
  ojos por encima del muro. El de serie es 0.45 y el máximo 1.2. Es un ajuste de
  entrenamiento, no una estatura, pero a partir de ahí el spawn deja de tapar.
- **Las dos rutas del Vestíbulo cambiaron de lado.** Estaban detrás del muro,
  donde ya no puede haber nadie. No se borraron ni se recolocaron a ojo: se
  rebarrió con `rutas43.mjs` lo que quedaba libre delante, con las mismas
  exigencias del barrido de la vuelta 39 más una nueva —no pisar ninguna ruta
  viva—. Salieron cuatro sitios posibles y se cogieron dos, uno por cada extremo
  del muro: **asomarse al oeste y asomarse al este llevan a sitios distintos**
  (20 y 23 puntos a la vista, sólo 2 en común). El mapa se queda en 14 rutas y 68
  puntos, con sus seis zonas.
- **La primera diana de la sesión sale a ciegas.** Con el jugador tapado no hay
  ningún punto visible, así que se usa la salida de emergencia de siempre. Y
  elegir sitio cuesta el barrido entero: 68 raycasts en el peor caso, una vez por
  aparición y nunca por frame.
- **El tablero de acciones ya no cabe detrás del spawn**, que ahora está a 2.5 u
  de la pared: `actionPanelMetrics` acota el ancla, que es para lo que ese
  acotado existe. Sigue apagado.
- **La divisoria del Vestíbulo se retiró.** Hacía a medias —y sólo por el este—
  el trabajo que ahora hace el muro, y entre las dos dejaban una ranura de 0.75 u
  por la que no se pasa. El plano vuelve a tener **veinte piezas**.

**Y la regla de «desde el spawn se ve algo de frente y lejos» se dio la vuelta.**
Era de cuando el jugador empezaba a campo abierto (§23, §24). Ahora empieza
tapado, así que los dos tests que la guardaban exigen lo contrario: cero puntos
visibles desde el punto de aparición, y al menos uno de frente y a `room/4` o más
**asomándose por cada extremo**.

### 43.2 La armería: la forma también se mide

La armería va a ser el panel que más se abra, así que su forma no es decoración.
Tres decisiones, y las tres salieron de mirar la primera versión:

**Un solo botón grande por ficha, y es la acción.** Equipar. Todo lo demás que se
pueda tocar es pequeño y dice su estado con la forma. Con cinco botones del mismo
tamaño en una ficha hay que leerlos todos para saber cuál es el que hace algo, y
eso es trabajo que el panel le pasa al jugador cada vez que lo abre.

**Los números no se esconden detrás de un clic.** La primera versión tenía un
botón «Ficha» que desplegaba las estadísticas. Comparar tres armas costaba tres
clics y, peor, se comparaba de memoria. Ahora están puestas y llevan **barra
comparativa**, con el tope sacado del propio arsenal y no de un número redondo:
lo que se lee de un vistazo es «ésta es la que más carga de las que hay», y eso
sigue siendo cierto el día que entre un arma nueva. Sin color de bueno/malo: que
un rifle pese más no es peor, es otra cosa, y el juego no tiene por qué opinar.

**Lo que ves es lo que te llevas.** Poner el silenciador cambia la silueta a la
variante `ghost-`, que es otra foto del arma de verdad (vuelta 41). El
interruptor no dice «activado»: enseña el arma con el tubo puesto.

**Y las filas las alinea la rejilla, no el contenido.** Medido: con cada ficha
apilando lo suyo, el botón de equipar mide 8 px más que el rótulo «Siempre
encima» de la pistola, y esos 8 px desalineaban la columna entera de números —la
fila CADENCIA de una ficha quedaba a la altura de otra cosa en la de al lado—.
Comparar dos armas es mirar la misma línea en las dos, así que eso no es un
detalle. Cuadrarlo con un `min-height` medido funciona hoy y se rompe el día que
alguien toque el relleno de `.button`; con **`subgrid`** lo hace el navegador y no
queda ningún número que mantener. `armeria43.mjs` lo mide en píxeles, las siete
filas y las cinco estadísticas.

**Lo que se miró y se dejó fuera**, para no volver a proponerlo:

- **Precios, dinero y comprar.** Dependen de rondas y de una economía que no
  existen, y un `$0` en la ficha prometería una mecánica que no hay.
- **Daño por arma.** El juego no lo tiene: el daño es de la zona (100/50/34) y
  hoy es el mismo para las tres. Un número por arma sería inventarse un dato.
- **Sensibilidad o mira por arma.** No existen en el motor. Un panel que las
  ofrezca miente.
- **Preajustes de equipamiento.** Con dos ranuras y tres armas no hay nada que
  preajustar.
- **Tintes o skins.** No hay assets y el color está ocupado: el naranja es de las
  dianas y el verde de la acción. Un arma teñida rompería la lectura del mapa.

### 43.3 El silenciador es de cada arma

Era un solo booleano que se aplicaba a lo que llevaras en la mano. En cuanto la
armería enseña las tres armas a la vez, con su interruptor en la ficha, eso deja
de tener sentido: ponérselo a la Rift se lo ponía también a la pistola, y la
silueta de al lado se quedaba mintiendo.

`SETTINGS.suppressor` pasa a ser un **mapa arma → booleano**, declarado con
`perWeapon: true` en vez de adivinarse por la forma del valor —un mapa y un
enumerado se parecen demasiado para distinguirlos a ojo—. La tecla (**V**)
conmuta el del arma que llevas en la mano; el motor lee `suppressor[weaponKey]`.

Dos cosas del saneado que no son evidentes:

- **Lo guardado hasta la vuelta 42 era un booleano**, y un `true` quería decir
  «llevo silenciador». Se reparte entre las armas que lo admiten en vez de
  tirarse: es la misma idea que `LEGACY_WEAPON_KEYS` y `LEGACY_KEYBINDS`, un
  valor viejo que se traduce en lugar de caer a fábrica sin explicación.
- **Un arma que no lo admite no puede tenerlo puesto** por mucho que lo diga
  localStorage. Lo que manda es `supportsSuppressor`, que es el dato del arma.

Y un detalle que se descubrió al hacerlo: `defaultSettings()` entregaba el valor
por defecto **por referencia**. Con todos los ajustes siendo números, cadenas o
booleanos daba igual; con un objeto, todas las partidas habrían compartido el
mismo mapa y escribir en uno los habría cambiado todos, el de fábrica incluido.
Ahora los valores por defecto que son objetos se copian.

## Ronda 44 — El mundo deja de ir al ritmo del monitor

Primer paso de la evaluación de multijugador
(`docs/propuestas/02-multijugador-1v1.md`): **el tick de simulación se fija a
60 Hz**. Nada de red todavía.

### Por qué esto va antes que el netcode

La predicción de cliente consiste en aplicar tu entrada al instante, y cuando
llega el estado autoritativo del servidor, **reejecutar** las entradas
pendientes sobre el mismo módulo de movimiento. Eso sólo converge si cliente y
servidor dan **los mismos pasos**. Con delta variable no los dan: a 240 Hz se
simulaba en pasos de 4.17 ms y en el servidor en pasos de 16.67, y la §32 ya
tenía medido lo que eso cuesta —**1.38% de diferencia** entre 60 y 240 Hz en el
banco de cuatro segundos encadenando—. Esa excepción, aceptable para un juego
de un solo jugador, es exactamente lo que se manifiesta como *rubber banding* en
cuanto hay un servidor decidiendo la verdad.

Se hace ahora, solo y en local, porque si el aire no sobrevive a esto es mejor
saberlo antes de haber escrito mil líneas de red encima.

### El mecanismo: el del limitador de FPS, aplicado a la simulación

No hacía falta inventar nada. El limitador de fotogramas ya acumulaba tiempo
real, descontaba un intervalo objetivo cuando tocaba y **guardaba el sobrante**,
con una tolerancia de `min(1, intervalo · 0.1)` para el fallo clásico de pedir
el mismo límite que el refresco del monitor. `_advanceSimulation` es ese mismo
bucle con dos cambios: lo que reparte son pasos de mundo en vez de dibujados, y
puede dar más de uno por frame.

Medido (`tick44.mjs` [1]), diez segundos de reloj:

| Hz del monitor | pasos | tiempo real | tiempo simulado | deriva |
|---|---|---|---|---|
| 30, 60, 75, 90, 144, 165, 240, 360 | **600** en todos | 10000.00 ms | 10000.00 ms | **0.000 ms** |

Con frames irregulares (±60% de jitter a 240 Hz): 600 pasos, deriva 7.5 ms —el
arrastre pendiente, que se paga en el frame siguiente—. Y un parón de 3 s del
navegador da **6 pasos**, no 180: `SIM.maxFrameDeltaMs` (100 ms) acota el delta,
así que es también el techo de pasos por frame.

### El reloj del mundo es un instante real, y por eso no hay nada que traducir

Lo primero que hice fue lo obvio y estaba mal: como el mundo avanza en pasos
fijos y el frame no, su reloj queda un resto por detrás, así que traduje el
`timeStamp` de los eventos de teclado restándole ese resto. Es un error, y de
los que se ven al escribirlo: el `now` que recibe un paso **es un instante
real** —el que representa el final de ese paso—, y `_land()` despeja el
aterrizaje de la parábola a partir de él, así que `_landedAt` sale ya en tiempo
real. Los dos extremos de la ventana de encadenado viven en el mismo reloj.
Traducir uno de ellos no quitaba un error: lo metía, de hasta un paso entero.

Lo que sí hace falta es **re-anclar**: `_simTime = now − _simAccumulator` al
final de cada frame. Por construcción eso no cambia nada; hace falta para el
caso en que `delta` se haya acotado por un parón, donde si no los dos relojes se
separarían para siempre.

Medido por el bucle real, con búsqueda binaria sobre el instante de la
pulsación (`tick44.mjs` [4]): **130.00 ms a 60, 144 y 240 Hz, con 0.0000 ms de
diferencia entre ellos**. Igual que antes.

### Y el aire sobrevive

La pregunta que decidía la vuelta: el modelo vectorial es una integración cuya
entrada es el ratón, y el ratón se muestreaba una vez **por frame**. Ahora se
muestrea una vez **por paso** —dos pasos dentro del mismo frame ven el mismo
yaw, porque los eventos se atienden entre dibujados—.

Banco de la §32, cuatro segundos girando a 45°/s y encadenando en cada
aterrizaje (`tick44.mjs` [2]):

| | 60 Hz | 120 Hz | 144 Hz | 165 Hz | 240 Hz | 360 Hz | dispersión |
|---|---|---|---|---|---|---|---|
| vectorial, antes | 8.7350 | 8.8138 | 8.8269 | 8.8363 | 8.8554 | 8.8684 | **1.53%** |
| vectorial, después | 8.7350 | 8.7350 | 8.7289 | 8.7295 | 8.7350 | 8.7350 | **0.07%** |
| escalar, antes | 9.2567 | 9.2921 | 9.2980 | 9.3017 | 9.3098 | 9.3157 | 0.64% |
| escalar, después | 9.2567 | 9.2567 | 9.2391 | 9.2589 | 9.2567 | 9.2567 | 0.21% |

Tres lecturas, y la tercera es la importante:

- **En un monitor múltiplo de 60 el resultado es idéntico hasta el último
  decimal.** 60, 120, 240 y 360 Hz dan 8.7350 clavado: dispersión 0.000000%. No
  es que se parezcan, es que son el mismo número.
- **Lo que queda (0.07%) es fase de muestreo en 144 y 165 Hz**, que no son
  múltiplos de 60: la rejilla de pasos cae en sitios distintos de la secuencia
  de frames y cada paso ve un yaw un pelo distinto. Es un residuo acotado, no
  una divergencia que se acumule.
- **El tiempo en el aire deja de depender del monitor**: 3900 ms en los seis
  refrescos, contra 3900–3983 antes. Ése era el 0.57 de dispersión que la §32
  anotó como «ya existía con el modelo escalar»: el contacto con el suelo se
  cuantizaba al frame. Con paso fijo se cuantiza al paso, que es el mismo en
  todas partes.

Y la curva de ritmo de giro, que es lo que de verdad se siente
(`tick44.mjs` [3], marcha final tras 4 s):

| °/s | 0 | 20 | 40 | 60 | 90 | 140 | 220 |
|---|---|---|---|---|---|---|---|
| antes, 60 Hz | 6.547 | 7.579 | **8.523** | 7.830 | 5.431 | 3.801 | 1.706 |
| antes, 240 Hz | 6.547 | 7.602 | **8.617** | 7.902 | 5.564 | 3.819 | 1.769 |
| después, 60 Hz | 6.547 | 7.579 | **8.523** | 7.830 | 5.431 | 3.801 | 1.706 |
| después, 240 Hz | 6.547 | 7.579 | **8.523** | 7.830 | 5.431 | 3.801 | 1.706 |

Las dos filas de «después» son la misma fila. **El óptimo sigue en 40°/s**,
girar como un molino sigue frenando y sin girar sigue sin ganarse nada: el
mecanismo no se ha tocado, sólo ha dejado de depender de la pantalla.

**Lo que se paga, y quién lo paga.** Un jugador de 240 Hz pierde un **1.36%** de
marcha final en ese banco (un 1.50% a 360, un 0.89% a 120); uno de 60 Hz no
pierde **absolutamente nada** —0.000000%—. La razón es que el juego pasa a
comportarse en todas partes como se comportaba a 60 Hz, que era la referencia
con la que se calibró el modelo. No es una recalibración: es que el monitor deja
de ser una variable.

### El dibujado sí sigue al monitor

Un tick fijo sin interpolación de dibujado es medio tick fijo: la cámara daría
sesenta pasos por segundo en un monitor de 240 y se vería a tirones. Se guardan
las dos poses del último paso (`_simPrev`, `_simCurr`) y se dibuja el punto
intermedio que toque según lo que lleve acumulado el frame. Dos reglas:

- **La pose interpolada vive sólo lo que dura el dibujado.** Se pone justo antes
  de `render()` y se quita justo después: fuera de esas tres líneas
  `camera.position` **es** la posición autoritativa, la misma de siempre.
- **Un teletransporte no se interpola.** `movement.reset()` sube `poseEpoch`, y
  un paso con la época cambiada no interpola: reaparecer dibujaría un barrido
  por medio mapa. La marca vive donde ocurre el salto, no en una comprobación de
  distancia en quien dibuja.

La primera regla es el arreglo de un fallo que metí y que cazaron dos suites.
La primera versión guardaba la pose buena en `_simCurr` y la **restauraba desde
ahí** al empezar cada paso, de modo que `_simCurr` pasaba a ser la fuente de
verdad y `camera.position` una copia. Consecuencia: cualquiera que escribiera la
cámara desde fuera —una prueba colocando al jugador junto al explosivo, otra
buscando un puesto con vista— veía cómo el paso siguiente lo devolvía al spawn
sin decir nada. `binds.mjs` lo cazó como una bomba que no se desactivaba y
`live.mjs` como 67 raycasts de visibilidad donde caben 13, que son los que cuesta
sembrar desde un sitio donde no se ve nada. Las dos por lo mismo, y el mismo día
que `CLAUDE.md` insiste en que la fuente de verdad es una.

### Lo que cuesta

Medido en bucle cerrado con ocho muñecos vivos en el Plano A (`tick44.mjs` [7]):
**0.03 ms p50 y 0.07 ms p99 por paso**, dentro del presupuesto de la casa
(0.2 ms p99). En un monitor de 240 Hz sólo uno de cada cuatro frames gasta un
paso, así que el frame medio sale **más barato** que antes. El peor frame
concebible —seis pasos seguidos tras un parón de 100 ms— cuesta **0.42 ms**, que
cabe de sobra incluso en un frame de 60 Hz.

### De regalo, un techo que ya no depende de la pantalla

El fuego automático dispara «como mucho una vez por paso». Antes eso era una vez
por frame, así que el techo real iba con el monitor —3600 RPM a 60 Hz, 14400 a
240— y con el limitador de FPS: con el tope puesto en 30, un arma automática se
habría quedado en 1800 RPM. Ahora son **3600 RPM en cualquier máquina**, muy por
encima de las 800 de la Volt.

## 13. Bugs con enseñanza duradera

Recopilación de los fallos cuyo diagnóstico cambió una convención del proyecto.
Están aquí para que no se repitan por otra vía.

### 13.1 HMR de Vite duplicando el módulo de ajustes

El modo dinámico parecía no funcionar: `_applySettings` no se llamaba nunca, sin
error en consola. La causa no estaba en el código sino en el entorno: editar
ficheros con el servidor de desarrollo corriendo creó **dos instancias de
`settings.js`**. El motor leía una y la UI escribía en la otra.

Arreglo: reiniciar el servidor. Convención permanente: **ante un resultado
extraño tras editar `config.js` o `settings.js`, reinicia el dev server antes de
depurar**. Está en `CLAUDE.md` porque cuesta media hora cada vez que se olvida.

### 13.2 Orden de inicialización en el constructor

`_applySettings(getSettings())` se llamaba **antes** de inicializar
`_frameIntervalMs`, y lo sobrescribía con 0. Efecto: un límite de FPS guardado se
ignoraba al arrancar, pero funcionaba si lo cambiabas a mano.

Arreglo: mover la llamada al **final** del constructor. Regla general: aplicar
configuración es lo último que hace un constructor, porque toca campos que todo
lo anterior acaba de definir.

### 13.3 `position: fixed` dentro de un ancestro transformado

Ver §9.2. Un `transform` en un ancestro crea un nuevo bloque contenedor y
`position: fixed` deja de referirse al viewport.

### 13.4 CSS de autor ganando a `[hidden]`

"RECARGANDO" se mostraba permanentemente porque `.hud__reload { display: flex }`
tiene más peso que la regla `[hidden] { display: none }` de la hoja de estilos
del navegador.

Arreglo: una regla global `[hidden] { display: none !important; }` en
`styles.css`. Es la forma correcta de usar `!important`: restaurar un
comportamiento por defecto que el propio CSS de autor rompió.

### 13.5 Aplanar un cono 3D no da un cono 2D

Al muestrear posiciones dentro de un cono tridimensional y proyectarlas después
al suelo, los muñecos se agolpaban cerca del eje. La proyección no conserva la
distribución angular.

Arreglo: muestrear el azimut **directamente en 2D** para las dianas ancladas al
suelo.

### 13.6 El grueso de los fallos de test eran fallos del test

Durante la suite de regresión (unos 25 scripts de Playwright contra Chromium
real, ejecutados tras cada ronda), la mayoría de fallos no eran del producto:
aserciones que comparaban recoil total sin normalizar por número de disparos;
localizadores ambiguos tras añadir botones; tests disparando más rápido que el
tope de 500 RPM de la Pulse; tests gastando más balas que el cargador (se
neutralizó `_consumeAmmo` en los tests de recoil y dispersión); un `airborne =
true` forzado a mano que la gravedad limpiaba al frame siguiente; y un test de
impactos que se alejaba del spawn una vez el movimiento cubrió la sala entera.

**Lección:** cuando un test falla después de un cambio de alcance, la primera
hipótesis debe ser que el test codificaba una suposición que el cambio invalidó.
Perseguir el producto primero cuesta tiempo y, peor, invita a "arreglarlo" hasta
que el test pase.

---

## Qué se ha verificado y cómo

Contexto para no repetir trabajo ni confiar de más en lo no medido. Las
verificaciones se hicieron con Playwright contra Chromium real, no en jsdom: el
objetivo era medir tiempos y rendimiento de verdad.

- **Detección de impactos** con puntería exacta sobre cada tipo de diana y zona.
- **Techos de recoil** contra la suma de los patrones de `config.js`.
- **Distribución de la dispersión**: 0° parado / andando / agachado, uniforme en
  [0, 1.2°] corriendo y en el aire, y la cámara sin moverse en ningún caso.
- **Límite de frames** en 12 combinaciones de monitor × tope.
- **Márgenes de pared**: 1200 spawns por tipo de diana, midiendo la distancia a
  las cuatro paredes.
- **Tiempos de recarga** contra los valores de `config.js`.
- **Coste por frame**: ~0.1–0.2 ms p99 frente a los 4.17 ms disponibles a 240 Hz.
- **Las PNG de referencia no llegan a `dist/`.**
- **Contraste de los marcadores contra el fondo real del Plano A**: seis colores
  candidatos, contraste WCAG píxel a píxel sobre el fondo que le toca a cada uno.
- **Visibilidad de la brújula en asomos parciales**: 400 puestos × 69 puntos de
  ruta, con un rayo a la cabeza y otro al marcador.
- **La silueta del avatar contra la referencia, en dos vistas** (vueltas 35-36,
  para el humanoide que se retiró en la 38): de frente contra la referencia de
  estilo y de perfil contra la media de las dos laterales del turnaround.
- **Que el avatar y la diana son la misma geometría**, vértice a vértice y zona
  por zona.
- **Los colores de equipo**, por distancia CIELAB contra la paleta reservada y
  por contraste contra el fondo real del Plano A.
- **Que en pausa no avanza nada del combate**: 2.5 s de pausa con ocho muñecos
  vivos, contando disparos, daño, silbidos, apariciones y cuenta atrás.
- **Que la brújula y el sistema de aparición dan el mismo veredicto**, doce
  puestos alrededor de la Espina, y que cuando difieren es siempre en el mismo
  sentido (la cabeza se ve antes que el pecho).
- **El recinto de aparición** (vuelta 42, sustituido en la 43): puntos del grafo
  dentro de la zona, hueco andable de la boca, inundación desde el spawn hasta el
  mapa, y cuántos puntos tienen línea de tiro al punto de reaparición.
- **El muro de aparición**: largo × distancia contra cuatro medidas a la vez
  —puntos que ven el spawn, casillas ciegas de la banda, asomo por cada extremo y
  tiempo de cruce—, y la fracción del encuadre que ocupa el muro, con un rayo por
  celda de una rejilla de pantalla.
- **La alineación de las fichas de la armería**, fila a fila y en píxeles.
- **El tick fijo de 60 Hz**: pasos por segundo a ocho refrescos distintos, deriva
  del acumulador, comportamiento tras un parón, dispersión del aire entre 60 y
  360 Hz, curva de ritmo de giro, ventana de encadenado por el bucle real y coste
  por paso (`tick44.mjs`).

Lo que **no** está verificado automáticamente: la sensación de juego, el balance
entre armas y la legibilidad del HUD en pantallas pequeñas. Eso sigue siendo
juicio humano.
