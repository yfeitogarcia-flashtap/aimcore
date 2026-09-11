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

Scalar-2 (semi, 500 RPM, sin apenas recoil), Axis-7 (auto, 600 RPM, recoil
vertical marcado) y Vertex-9 (auto, 800 RPM, techo más bajo pero más bamboleo
lateral). Cada una entrena algo distinto: precisión por disparo, control de
patrón vertical, y control de dispersión a alta cadencia.

Scalar-2 es la predeterminada porque es la que menos interfiere con la medida de
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
mientras se trabajaba, y al mirar las imágenes reales resultó que **Scalar-2 es
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

**Normalizar el tamaño entre variantes:** `scalar-2-plain` se escala por
`matchHeightOf: 'scalar-2'` (factor 0.605) porque las dos fotos de referencia
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

Hasta esta ronda, la Scalar-2 sin supresor se obtenía **acortando el cañón** del
trazado con supresor de forma proporcional. Al llegar una referencia real
(`scalar-2-nonsilenced.png`) se retrazó desde cero.

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
tope de 500 RPM de la Scalar-2; tests gastando más balas que el cargador (se
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

Lo que **no** está verificado automáticamente: la sensación de juego, el balance
entre armas y la legibilidad del HUD en pantallas pequeñas. Eso sigue siendo
juicio humano.
