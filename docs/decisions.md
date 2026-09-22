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
- Editor de mapas (Alchemist) → §74, §75, §76, §77, §78, §79, §81
- Superficies, teletransportes y el tubo → §80, §81
- Publicar: despliegue automático y lanzador de doble clic → §81.6, §81.7
- **Principios permanentes** (infraestructura, transporte) → §0

---

## §0. Principios permanentes

Dos cosas que **no son de una ronda**. El resto de este documento explica por qué
algo se hizo como se hizo en su momento; esto es lo que hay que seguir cumpliendo
en las rondas que vengan, y va aquí arriba porque el propósito del fichero es
«evitar que una sesión futura deshaga por ignorancia algo que se eligió a
conciencia».

### §0.1 Lo que un jugador visita va en infraestructura con IP propia

**Mientras dure la situación legal española** —las operadoras anulando IPs
**compartidas** de Cloudflare por orden de LaLiga, ignorando el SNI—, **todo lo
que un jugador visite directamente vive en infraestructura con IP propia**
(Fly.io o equivalente), no en Cloudflare.

«Directamente» quiere decir cualquier cosa contra la que el navegador o el
cliente de un jugador abra una conexión: la web del juego, el servidor de
partida, y también lo que hoy no existe — **login, tienda, rankings, perfiles y
cualquier API pública que se añada**. Si un jugador español teclea una dirección
o su cliente abre un socket contra algo, ese algo no puede estar detrás de una IP
que comparta con desconocidos.

**Cloudflare no queda prohibido; queda acotado.** Sigue siendo válido para lo que
**no** sirve tráfico directo a un jugador: DNS en modo «sólo DNS» —la nube gris,
que resuelve el nombre y deja que el tráfico vaya derecho a nuestra IP—, y
cualquier trabajo interno entre servidores, construcción o almacenamiento que un
jugador nunca toque. La línea es «¿abre un jugador una conexión contra esto?», y
no «¿es esto importante?».

**El porqué, en corto.** El bloqueo es por dirección y se aplica a la IP entera:
no distingue el dominio, aunque técnicamente podría —el SNI viaja en claro—. Así
que estar en una IP compartida no es un riesgo que se gestione, es una
dependencia de que ningún vecino desconocido haga nada que moleste a LaLiga. No
hay configuración, plan ni dominio propio que lo arregle desde dentro: la IP
dedicada de Cloudflare es de plan Enterprise, y un dominio propio resuelve a las
mismas direcciones compartidas. Lo comprobamos sobre el despliegue real dos veces
—el juego caído en día de partido— y una tercera con el control delante: `fly.io`
cargaba mientras nuestro Worker seguía sin responder. El detalle está en §58 y en
`docs/propuestas/03-servidor-con-ip-propia.md`.

**Cuándo deja de aplicar.** Cuando la situación cambie: si Cloudflare y LaLiga
llegan a un acuerdo como el que ya tienen otros proveedores —bloqueos
quirúrgicos en vez de rangos enteros—, o si el marco legal cambia. Ese día se
revisa **esta entrada**, no se revierte por comodidad en mitad de otra vuelta.
Hasta entonces, un «es que en Cloudflare esto sería más fácil» no es un
argumento: lo que está en juego no es la comodidad, es que el juego exista los
sábados por la tarde.

### §0.2 El transporte está aislado porque algún día habrá UDP

**Ambición de producto, no decisión técnica de hoy.** Vektor aspira a poder
sostener algún día **partidas de nivel competitivo real**, del tipo donde la
latencia importa al máximo y donde diez milisegundos son una diferencia que un
jugador nota y reclama. Eso, casi con seguridad, no se alcanza dentro de un
navegador: pide un **cliente nativo con transporte UDP**, porque lo que sobra en
TCP —la entrega ordenada y la retransmisión— es justamente lo que un juego de
disparos no quiere. Una foto de hace tres pasos no sirve de nada, y esperarla
retrasa la que sí sirve.

No es trabajo de esta vuelta ni de las próximas. Está escrito aquí por una razón
concreta y muy práctica: **es el motivo por el que el aislamiento del transporte
no se debe romper nunca por comodidad.**

`net/transporte.js` expone `send`, `onMessage` y `close` —y desde la vuelta 51 un
cuarto, `onClose`, que es un aviso y no un estado—. Nada más. El netcode **no
sabe qué hay debajo**, y por eso la red simulada es un transporte que envuelve a
otro en vez de un puñado de `setTimeout` dentro del cliente. La consecuencia que
importa es ésta: **predicción, reconciliación, compensación de retraso,
interpolación del rival y el reloj de pasos no dependen del cable**. Cambiar de
WebSocket a UDP sería escribir una implementación nueva de esas funciones y nada
más — no rehacer el netcode, que es lo que ha costado las vueltas 45 a 58 y lo
que está medido hasta el último dígito.

Dos cosas que se siguen de ahí, y son las que hay que defender:

- **Nada de netcode puede preguntar por el estado del cable.** Ni «¿está
  abierto?», ni el tipo de socket, ni una propiedad del navegador. Que hay
  partida lo dice la bienvenida, que es del protocolo. Esa regla es de la vuelta
  46 y parecía purismo; es lo que hace que el día del UDP no haya que auditar
  todo el cliente buscando dónde se coló una suposición.
- **Lo que viaja tiene que seguir siendo describible sin el cable.** El reloj de
  la red es **el número de paso**, no el de nadie (vuelta 45). Un protocolo
  atado a la entrega ordenada de TCP —«el mensaje N va después del N−1»— sería
  precisamente lo que habría que rehacer con UDP. El número de paso sobrevive a
  que los mensajes lleguen desordenados, que es la mitad del trabajo hecho por
  adelantado.

Lo que **no** significa esta entrada: que haya que preparar nada hoy, ni añadir
abstracciones «por si acaso», ni evitar WebSocket. Significa que cuando alguien
proponga meter una llamada al socket en `cliente.js` porque es más cómodo, la
respuesta ya está escrita.

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

## Ronda 45 — Dos pestañas, un servidor, y el movimiento sincronizado

Segundo paso de `docs/propuestas/02-multijugador-1v1.md`. Un servidor `ws` local
(`npm run net`) y una página de pruebas (`net/prueba.html`) que se abre en dos
pestañas. Sin nube, sin despliegue, sin disparos: **sólo movimiento**.

### Lo que hay que mirar del servidor: cuánto código de juego tiene

Ninguno. `net/servidor.mjs` importa `movement.js`, `scenario.js` y `config.js`
tal cual, les pone un objeto plano donde iría la cámara (`net/pose.js`, catorce
usos de `position.{x,y,z}` y `rotation.y`, nada más) y ya tiene la física del
juego corriendo fuera del navegador. Lo único propio del servidor es repartir
entradas y llevar el paso del reloj.

La otra mitad de que esto funcione es la vuelta 44: reejecutar entradas sólo
converge si los dos lados dan los mismos pasos.

### Tres decisiones que son el diseño

**1. El reloj de la red es el número de paso, no el de nadie.** Cada entrada
viaja sellada con su paso `n` y **los dos extremos la ejecutan con
`now = n · SIM_STEP_MS`**. El reloj del cliente y el del servidor no tienen por
qué coincidir; el número de paso sí. Sin esto, el aterrizaje que el servidor
despeja de la parábola y la pulsación de salto que selló el cliente estarían en
relojes distintos y la ventana de encadenado no significaría nada. Por lo mismo
la pulsación viaja con **su fracción de paso** (`jt`, 0..1): redondearla al paso
costaría 16.7 ms de precisión en una mecánica que mide 130.

**2. El servidor no adivina.** Si a un jugador no le ha llegado la entrada de un
paso, ese jugador **no avanza** ese paso, y cuando llegue se pone al día
consumiendo hasta `NET.maxCatchUpTicks` seguidas. La alternativa —repetir la
última entrada, que es lo que hacen muchos ejemplos— mete un paso que el cliente
nunca predijo: una corrección **inventada por el servidor**. Así, la corrección
aparece sólo cuando hay una causa de verdad.

**3. El estado serializable vive en `movement.js`.** `snapshot()` / `restore()`
son 24 campos y están junto a los campos, no en quien los manda: una lista de
nombres escrita en el módulo de red se desincroniza el día que alguien añada
estado al movimiento. 357 B en JSON.

### Lo que sale medido

**La reconciliación es exacta.** Con el cliente prediciendo y el servidor
decidiendo, el error entre lo que el cliente había predicho y lo que queda tras
reejecutar es **cero** — literalmente, o un ULP de coma flotante (1.8e-15 u):

| ida | RTT medido | entradas sin confirmar | reejecución | error máx |
|---|---|---|---|---|
| 0 ms | 59 ms | 2 | 33 ms | 0 |
| 25 ms | 165 ms | 6 | 100 ms | 0 |
| 50 ms | 233 ms | 14 | 233 ms | 0 |
| 80 ms | 333 ms | 22 | 367 ms | 0 |
| 150 ms | 353 ms | 24 | 400 ms | 0 |

La latencia **no** mete error de predicción: lo único que crece es la cola a
reejecutar. Y la tubería tiene un suelo de **59 ms** sin red de por medio
—colchón de jitter (33 ms), ritmo de fotos y frame del navegador—, que es un
número a tener presente y es ajustable.

**Donde sí corrige es con pérdida de paquetes**, que es lo correcto:

| pérdida | correcciones | error máximo |
|---|---|---|
| 0% | 0 de 181 fotos | 0 |
| 2% | 5 de 181 | 0.11 u |
| 10% | 13 de 182 | 0.22 u |
| 25% | 27 de 182 | 0.33-2.6 u |

Andando, ni al 25% de pérdida la corrección pasa de un tercio de unidad. El peor
caso no es andar: es **perder la pulsación de saltar**. El servidor no despega,
el cliente sí, y hasta la foto siguiente divergen lo que dura un vuelo —578 ms,
o sea unas 3.8 u a marcha de carrera—. Es el techo de la corrección, y por eso
el listón de la suite se pone ahí y no en un metro: al 25% de pérdida se han
medido 2.62 u, dentro de ese techo.

**Al rival se le ve en el pasado, y poco.** 3.0 pasos (50 ms) por detrás de la
última foto recibida; contando medio viaje, **~151 ms** de retraso visual con
228 ms de RTT. A marcha de carrera, un metro.

**Cuesta nada.** Predecir un paso: 0.8 µs. Reejecutar una entrada: **0.6-0.9 µs**
según la carga, así que el presupuesto de 0.2 ms por frame da para 220-340
entradas — entre 3.7 y 5.7 segundos de RTT. Caudal en JSON, sin comprimir ni recortar: **↑3.5 KB/s,
↓59-81 KB/s**, o sea 1.0-1.4 KB por foto. Sube cuando los jugadores saltan, y no
es casualidad: en el aire los campos llevan decimales largos y JSON los escribe
enteros.

### Tres cosas que salieron mal y lo que enseñaron

**El rival se dibujaba medio segundo tarde.** La primera versión buscaba el
instante a dibujar con el paso **propio** menos el retraso de interpolación.
Pero el cliente corre por delante del servidor lo que tarda el viaje, así que ese
instante caía por delante de la última foto recibida, no había pareja de fotos
que lo rodease y se acababa dibujando la más vieja del buffer: 46 pasos, 770 ms.
**El reloj del rival es el de las fotos**, no el propio: se sitúa
`interpDelayTicks` por detrás de la última que llegó y avanza en tiempo real
desde que llegó. Con eso, 3.0 pasos clavados.

**Hay que adelantarse el RTT entero, no la mitad.** Se cuenta dos veces y no es
evidente: la foto que dice en qué paso va el servidor **ya salió hace un viaje de
ida**, así que el servidor está medio RTT más allá; y la entrada que se mande
ahora tardará otro medio en llegar. Con la mitad, el servidor se quedaba sin
entrada en **un tercio** de los pasos y el retraso efectivo salía en 1.5 veces el
RTT inyectado (+451 ms para 300). Con el RTT entero, +294 ms para 300.

**El contador de pasos del cliente no puede ir libre.** Si el navegador pierde un
frame largo, el acumulador acota el delta y ese paso no se recupera nunca: el
cliente se va quedando atrás y manda entradas selladas con un paso cada vez más
viejo, que es latencia añadida y gratuita. Medido antes de arreglarlo: 25 pasos
de desfase en cuatro segundos. Se engancha al reloj del servidor con banda muerta
de dos pasos.

### Lo que queda claro para el paso siguiente

- **La foto se manda entera a todo el mundo, y no hace falta.** Los 24 campos son
  para que **tú** reejecutes tu propio movimiento; del rival sólo se dibujan
  cinco (`x`, `z`, `feetY`, `eyeHeight`, `yaw`). Mandar a cada uno lo suyo baja
  la foto a la mitad, y en binario —24 `Float32` son 96 B— a menos de la sexta
  parte.
- **Los pasos sin entrada de este banco son del contenedor, no del diseño.** Con
  una sola pestaña a 60 fps: 0 de 240. Con dos pestañas de WebGL por software
  quitándose frames (27-44 fps): 20-40 de 150. Y el colchón lo absorbe — con 1
  paso de colchón, 3%; con 2 o más, 0%.
- **Quedarse sin entrada no rompe nada**: el error de predicción sigue en cero en
  toda la tabla. Lo que se nota es en la suavidad con que el **otro** te ve.
- **`Math.sin`/`Math.cos` no están obligados a dar el mismo bit en dos motores
  distintos.** Aquí los dos lados son V8 y el error es cero; en Cloudflare
  también lo serían. Aunque no lo fueran, no se acumula: cada foto vuelve a
  anclar.

## Ronda 46 — El transporte detrás de tres funciones, y el disparo con rebobinado

Tercer paso de `docs/propuestas/02-multijugador-1v1.md`. Sigue todo en local.

### El transporte, aislado

`send`, `onMessage`, `close`. El netcode ya no sabe si debajo hay un WebSocket,
un canal de datos o un Durable Object. Se aísla **antes** de que haga falta
porque el día que haga falta será el día del cambio, y entonces ya no se sabe
qué parte del netcode se apoyaba en un detalle del socket.

El aislamiento se pagó solo: **la red simulada se fue con él**. Latencia, jitter
y pérdida son propiedades del enlace, no del juego, y hasta la 45 vivían dentro
del cliente a base de `setTimeout`. Ahora son un transporte que envuelve a otro
(`conRedSimulada`), y de paso la pérdida pasó a ser **de los dos sentidos**, que
es lo que hace un cable de verdad: tirar una entrada deja al servidor sin ese
paso; tirar una foto sólo retrasa la corrección siguiente, porque una foto es
estado absoluto y no un incremento.

La interfaz son **tres** funciones y ninguna dice si está abierto. Lo que se
manda antes de la apertura se tira y no pasa nada —el cliente manda una entrada
por paso, la siguiente sale 16 ms después—, y quien necesite saber que hay
partida lo sabe por el primer mensaje que llega, que es la bienvenida. Eso es
información del protocolo, no del cable.

### El disparo: qué se reutiliza

Nada nuevo por debajo. `hitPlayer` es el corte analítico contra el cilindro por
zonas que el juego ya usa cuando te disparan los muñecos, y `hasLineOfSight` es
el único raycast de «¿se ve eso desde aquí?» del motor. `net/disparo.js` sólo
los llama en el orden que cuesta menos: primero el corte, que es aritmética, y
**sólo si entra** el rayo contra la cobertura. Es el reparto de
`engine._isBlockedByCover`.

Y lo llaman **los dos extremos**: el servidor contra el cuerpo rebobinado, el
cliente contra el cuerpo tal como lo está dibujando. Comparar los dos veredictos
es la medida de si la compensación funciona, y esa medida sólo significa algo si
el código es el mismo — dos copias de la fórmula y una discrepancia ya no diría
nada de la red.

### Cuánto rebobinar: medirlo, no estimarlo

La primera versión lo estimaba desde el ping: `RTT + interpolación` hacia atrás.
Salía **de más, hasta el doble**, porque el RTT se contaba dos veces sin verse:

1. La foto que el cliente reconoce salió de aquí hace **un viaje de ida**.
2. Su entrada, al llegar, espera en la cola del servidor justo lo que el cliente
   se adelanta, que es **otro RTT entero** (ver §45).

El síntoma, medido: con 25 ms de ida el rebobinado ya se comía el tope de 200 ms,
y con el ping a cero el rival salía rebobinado 3.8 u —más de medio segundo—.

Lo que se hace ahora es no estimarlo. **El cliente dibuja al rival interpolando
entre dos fotos, así que sabe exactamente en qué paso del servidor lo tiene
puesto**, y manda ese número con el disparo (`tv`). El servidor sólo lo acota.
Con eso, a ping cero el rebobinado sale en **50 ms clavados**, que es
`interpDelayTicks` — exactamente lo que tiene que ser.

Lo que sigue siendo del servidor es **el tope**. `tv` lo manda el cliente, así
que un cliente que mintiera pediría rebobinar más; `NET.maxRewindMs` (200 ms, el
valor de referencia de Source) es lo que acota el daño, y es también lo que
acota la asimetría que sufre el que recibe: «me han matado detrás de la pared»
no puede pasar de ahí. El día que haya partidas públicas habrá además que
contrastar `tv` con lo que el servidor sabe del ping de ese cliente.

### Lo que sale medido

Tirador y blanco a 20 u, con el blanco moviéndose **de través** (`tiro46.mjs`):

| ida | disparos | impactos tú/servidor/sin rebobinar | acuerdo | sin rebobinar | pedía | concede |
|---|---|---|---|---|---|---|
| 0 ms | 16 | 14 / 14 / 7 | **100%** | 56% | 65 ms | 63 ms |
| 25 ms | 16 | 16 / 16 / 8 | **100%** | 50% | 114 ms | 115 ms |
| 50 ms | 16 | 15 / 15 / 6 | **100%** | 44% | 173 ms | 163 ms |
| 80 ms | 16 | 13 / 13 / 2 | **100%** | 31% | 229 ms | **200 ms** |
| 150 ms | 16 | 10 / 2 / 2 | 50% | 38% | 390 ms | **200 ms** |

Y condicionando a los disparos en que el rival se había apartado de verdad —más
de un radio de cuerpo **en lateral**, que es el único desplazamiento que decide
si entra—: **90% de acuerdo con rebobinado contra 20% sin él**.

Tres lecturas:

- **Mientras el rebobinado cabe bajo el tope, el servidor ve exactamente lo que
  viste tú.** Cien por cien, de 0 a 100 ms de RTT.
- **Sin rebobinar, con ping se pierde la mitad de los impactos** y a 160 ms de
  RTT las tres cuartas partes. Eso es lo que compra la compensación.
- **El tope tiene precio y se ve**: a 300 ms de RTT el tirador pide 390 ms y se
  le dan 200, y el acuerdo baja al 50%. Es la decisión, no un fallo.

**Coste**: el corte analítico no llega a medirse (por debajo de la resolución del
reloj del navegador); corte + rayo contra los 7 oclusores del Plano A, **4.3 µs
p50 y 9.0 µs p99**; un disparo que ni roza el cuerpo sale por el corte y tampoco
se mide. El historial son **3.8 KB por jugador** (60 pasos × 8 números = 1 s),
tres veces el rebobinado máximo.

**La cobertura sigue parando balas**: con una pieza de 10.5 u de largo y 3.6 de
alto entre los dos, el mismo disparo entra sin mapa y sale «tapado» con él.

**Y el impacto quita vida**, con el modelo de zonas de siempre (100/50/34) y sin
una segunda tabla. Sólo vida: ni escudo, ni casco, ni reaparición escalada —eso
es `PlayerStatus` y no está enchufado todavía.

### El banco costó más que el código, y por qué importa

Cinco veces seguidas la tabla salió «100% de acuerdo, 100% sin rebobinar», que
es el aspecto que tiene una medida perfecta y era, cada vez, una medida vacía:

1. **El tirador no había salido del spawn**, así que su propio muro le tapaba los
   treinta disparos. Coincidir en el fallo no mide nada.
2. **El blanco se movía a lo largo de la línea de tiro.** Acercarse no te saca
   del haz: el control salía plano por construcción.
3. **El blanco se quedaba pegado a una caja** a media tanda y el resto se medía
   contra un blanco quieto.
4. **El vaivén se descentraba** con cada reaparición y el blanco acababa a 9 u de
   su puesto.
5. **Y el propio teletransporte de colocación** lo hacía temblar en el sitio,
   porque el salto de 30 u contaba como «haber andado».

Lo que lo arregló no fue afinar números sino **poner la columna que delata**: los
impactos del tirador, `tú / servidor / sin rebobinar`. Con `0/0/0` a la vista, un
100% de acuerdo se lee al instante como lo que es. Es la regla de la vuelta 34
otra vez —una suite sin aserciones es un informe— con una vuelta de tuerca: una
aserción sobre una proporción necesita además la aserción de que el denominador
es de verdad. Y el banco acabó **comprobando su propia premisa** antes de medir
nada: seis disparos de prueba, y si no entran, se dice.

De ahí salieron dos cosas que sí son del código y no del banco: `poseEpoch` —que
existía desde la 44 para no interpolar un teletransporte— resultó ser también la
señal buena para «esto no es haber andado», y el mensaje de colocación del
servidor (`MSG.COLOCAR`) queda **apagado salvo con `VEKTOR_DEBUG=1`**, porque
una colocación libre es exactamente la vía de trampa que no se deja abierta.

## Ronda 47 — A la nube: un Durable Object por código de partida

Cuarto paso de `docs/propuestas/02-multijugador-1v1.md`, y el primero que sale
de esta máquina. **No se tocó nada de la lógica ya validada**: movimiento,
disparo y rebobinado son los mismos ficheros de la 46, y los mismos bancos
—`red45.mjs` y `tiro46.mjs`— se pasan ahora contra los dos huéspedes sin cambiar
una aserción. Ésa es la prueba de que esta vuelta es de despliegue.

### La partida sale del servidor, porque ahora hay dos servidores

Hasta la 46 `net/servidor.mjs` **era** la partida: `ws`, el reloj y todas las
reglas en un fichero. Al llegar Cloudflare hacían falta dos huéspedes —Node en
local, un Durable Object en la nube— y copiar las reglas en los dos habría sido
la primera vez en este repositorio que una regla del juego vive en dos sitios.
Es la convención de siempre («una sola fuente de verdad para lógica
compartida»), aplicada al servidor.

Así que la partida se fue a `net/partida.js` y **no sabe nada de red**: un
jugador entra con una función `enviar(texto)` y se acabó. Quién la implementa
—un socket de `ws`, uno de Cloudflare— no se sabe desde ahí. Es la misma idea
que el transporte del cliente de la vuelta 46, aplicada al otro extremo, y el
resultado se ve en el tamaño: `net/servidor.mjs` pasó de **403 líneas a 78**, y
lo que queda es puerto, reloj e informe.

El reparto quedó así, y es el que hay que respetar al añadir cosas: **el huésped
pone el reloj y el cable; la partida pone el mundo.**

### Por qué un Durable Object y no un Worker

Un Worker no tiene dónde poner un mundo: cada petición puede caer en una máquina
distinta y no hay estado entre ellas. Un Durable Object es lo contrario por
definición —un único objeto, en un único sitio, con memoria— y `idFromName()` es
la pieza que faltaba: **el código de la partida es la dirección del objeto**.

De ahí sale que no haya *matchmaking* ni registro de salas, y eso no es una
carencia del prototipo: es que no hace falta ninguna de las dos cosas. Nadie
lleva una lista de partidas, nadie crea una sala y nadie la borra. La sala existe
mientras haya alguien dentro.

### El código de sala se elige para dictarlo, no para mirarlo

`net/codigo.js`, y vive fuera del cliente y fuera del Worker **porque lo tocan
los dos**: el cliente lo genera y lo mete en la dirección, el Worker lo saca de
la ruta y se lo da a `idFromName`. Si cada lado normalizara a su manera,
escribirlo en minúsculas llevaría a una sala distinta que escribirlo en
mayúsculas, y dos amigos se quedarían **cada uno solo en su sala**, sin un solo
error en pantalla.

El alfabeto no tiene parejas que se confundan al dictar: fuera la O y el 0, la I,
la L y el 1, la S y el 5, la B y el 8. Quedan 27 símbolos y seis posiciones, 387
millones de combinaciones — de sobra para partidas privadas, y no pretende ser un
secreto: es un identificador.

Y **lo que se teclea mal se traduce en vez de rechazarse**. Un código se dicta
por voz y quien escribe pone lo que oye: un cero donde se dijo «o», una ele donde
se dijo «i». Esos símbolos están fuera del alfabeto justamente porque se
confunden, así que cada uno se manda al que sí existe. La alternativa —«código no
válido»— castiga a quien lo dictó bien.

### Un solo origen: el Worker sirve el juego y las salas

Se evaluó desplegar el cliente en Cloudflare Pages y el servidor aparte, que es
lo que decía la propuesta. Se hizo en un solo Worker con los ficheros del juego
como assets, y por una razón concreta: **el cliente saca la dirección del
WebSocket de la página en la que está**. Con dos orígenes hay una URL de servidor
que configurar, que recordar y que cambiar el día que el despliegue se mueva; con
uno, `wss://<el mismo host>/sala/<código>` y no hay nada que configurar. La
página y el mundo viajan juntos o no viajan.

Consecuencia: Vite empaqueta **dos** páginas desde esta vuelta (`index.html` y
`net/prueba.html`). La regla de «Vite sólo empaqueta index.html» se quedó sin
sentido en cuanto el duelo pasó de ser una herramienta para mirar dos pestañas en
local a ser **lo que se le manda a un amigo**. Lo que no cambia es que las PNG de
`Reference/` siguen sin entrar en el build.

### El reloj para cuando la sala se queda vacía

En Node daba igual: el proceso es tuyo. En Cloudflare el tiempo de ejecución se
paga, y una sala que sigue dando 60 pasos por segundo sin nadie dentro se paga
entera. El mundo arranca al entrar el primero y se para al salir el último.

Medido (`sala47.mjs` [6]): tras 5,4 s con la sala vacía el mundo avanzó **14
pasos** en vez de los 323 que habría dado el reloj —los 14 son la reconexión—, y
el número de paso **se conserva** entre visitas, que es lo que hace que volver a
entrar no sea empezar otra partida.

Y el atraso se acota: volver de un parón largo con el «apuntar al instante
exacto» de Node serían cientos de pasos de golpe —un pico de CPU y una ráfaga de
fotos a los dos clientes—. El tope es `SIM.maxFrameDeltaMs`, **el mismo número**
con el que el motor acota el frame largo del navegador desde la vuelta 44.

### Lo que costó: `replaceState` se lleva la consulta por delante

El fallo de la vuelta, y lo cazó el banco.

La página deja el código puesto en la barra de direcciones con `replaceState`,
para que copiar la barra valga como enlace. Lo que escribía ahí era **el enlace
que se le manda a un amigo**, que es limpio a propósito: sólo la sala. Y limpio
quiere decir **sin la consulta que la página traía**, que en el banco era
`?worker=1` — o sea, la diferencia entre hablar con el Worker y hablar con el
servidor de sobremesa.

Como los dos existen y los dos contestan, el resultado no fue un error: fue dos
pestañas con el mismo código, cada una conectada a un servidor distinto, y
ninguna viendo a la otra. **Silencioso, y con toda la pinta de un fallo de
`idFromName`.**

Lo delató un número que no podía estar ahí: uno entraba como `p3` y el otro como
`p6`, y en una sala recién creada el contador no va por seis. Eso no salía de
mirar la pantalla; salía de que la suite imprime el id.

La regla que queda: **la dirección de la barra y el enlace que se manda no son lo
mismo**, y son dos funciones (`direccionDeLaBarra`, `enlaceDeSala`). Reescribir
la barra nunca puede perder estado del que la página depende.

### Lo que se movió del banco, y por qué está bien

Los bancos elegían los puestos y resolvían disparos importando módulos del
proyecto con `import('/src/game/sight.js')`. Esa ruta existe con Vite en
desarrollo y **no existe en lo desplegado**, donde todo está empaquetado, así que
el mismo banco no se podía pasar contra los dos huéspedes — que es justo lo que
hay que poder hacer para probar que la migración no cambió nada.

La solución fue el asa de depuración que la página ya tenía (`window.vektorNet`),
que ahora lleva además `verDesde`, `cuerpoDe`, `resolver` y `NET`. No es una
puerta nueva en el juego: `net/prueba.html` **es** el banco, no una pantalla del
juego, y el asa ya estaba ahí desde la 45.

`MSG.COLOCAR` sigue cerrado igual que en la 46: en el Durable Object depende de
una variable de entorno (`VEKTOR_DEBUG`) que en el despliegue no está puesta, así
que el mensaje se tira sin mirarlo.

### Lo que no se hizo

- **Nada de cuentas, nicks ni persistencia.** Eres `p1` o `p2` y la partida muere
  con la sala.
- **Nada de hibernación de WebSockets.** La API de hibernación de Cloudflare
  sirve para conexiones que están calladas la mayor parte del tiempo; aquí llegan
  60 mensajes por segundo y por jugador. Poner un reloj de 60 Hz **impide**
  hibernar por definición, así que no hay nada que ganar.
- **Nada de recortar la foto.** Sigue yendo entera y en JSON. Es la primera
  optimización obvia —y en la nube tiene además precio, porque los mensajes que
  entran se cuentan— pero esta vuelta era de despliegue y cambiar el protocolo
  habría invalidado los bancos con los que se estaba comprobando la migración.

## Ronda 48 — Que se pueda empezar a jugar

Vuelta corta y de una sola idea: el duelo de la 47 estaba desplegado y **no se
podía jugar**. No es una mejora de experiencia: era un arreglo.

### El fallo: el clic nunca llegaba al canvas

El aviso (`#aviso`) ocupa la pantalla entera (`position: fixed; inset: 0`), va
después del canvas en el documento y ninguno de los dos llevaba `z-index`, así
que se pinta encima. Y quien escuchaba el clic era el canvas. Los eventos del
DOM **suben, no bajan**: el clic moría en el aviso y `requestPointerLock` no se
llamaba nunca. Medido con un clic de verdad: `lienzo: 0 · aviso: 1`, y forzando
el evento sobre el canvas, captura a la primera.

Lo que importa de esto no es el arreglo —una línea— sino **por qué ninguna
suite lo vio**. `red45.mjs`, `tiro46.mjs` y `sala47.mjs` conducen al jugador
escribiendo en `cliente.teclas` y llamando a `cliente.disparar()` desde dentro
de la página. Ninguna hizo nunca clic, ni pulsó una tecla de verdad. Se midió el
error de reconciliación hasta el último dígito de coma flotante sobre una página
que no se podía empezar.

**La regla que queda:** una suite que conduce el juego por dentro prueba el
modelo, no el producto. Si algo tiene que hacerlo una persona —un clic, una
tecla, leer un número en pantalla—, hay que hacerlo como lo hace ella. De ahí
sale `jugable48.mjs`, que es la primera suite del repositorio que usa
`mouse.click` y `keyboard.down` contra la página real.

Y una consecuencia inmediata de mirar de verdad: **no había mira**. Disparar
apuntando a nada. Mismo agujero y misma causa — los bancos apuntaban con
`camara.rotation` y disparaban por llamada, así que nunca hizo falta.

### Lo que no se puede dirigir desde un banco

Salir de la captura con **Escape lo resuelve el navegador**, no la página: una
tecla sintética no lo dispara. El banco usa `document.exitPointerLock()`, que
llega al mismo sitio —`pointerlockchange`— que es lo que la página escucha. Vale
la pena anotarlo porque la primera versión de la suite falló por esto y parecía
un fallo del menú.

### Dos capas, y un clic que distingue entre ellas

El panel lo tenía todo junto: el código de partida —que hace falta **antes** de
jugar— y los números de red —que no le importan a nadie que esté jugando—. Ahora:

- **El bloque de sala vive en el aviso**, que es la pantalla de «no estás
  jugando». Es donde tiene sentido: se abre la página, se copia el enlace, se
  hace clic y se juega; con Escape vuelve.
- **Los números y los mandos de red estropeada van detrás de F3**, apagados de
  fábrica, coherente con la vista de depuración del juego. Un jugador no tiene
  por qué mirar el error de reconciliación, y unos mandos de latencia al lado del
  código invitan a tocarlos sin saber que lo que hacen es **empeorar tu propia
  conexión a propósito**.
- **El fantasma pasa a estar apagado.** Es un instrumento de medida —dónde dice
  el servidor que estás tú—, no un ajuste: encendido, en una partida normal se ve
  un cuerpo translúcido pegado a la cara.

Y el clic que captura el ratón escucha el documento, con **una sola excepción**:
los controles (`.control`). Copiar el enlace, teclear un código o mover un mando
se hacen con el ratón suelto, y capturarlo al tocarlos dejaría el enlace a medias
y la partida empezada.

### Lo mínimo para que «vida y reaparición» quiera decir algo

Vida, barra y el cartel de ABATIDO con su cuenta. No es un HUD y no pretende
serlo —no hay munición, ni armas, ni puntuación—, pero tener vida y no poder
verla es no tenerla: morir sería quedarse en el suelo sin saber por qué.

La cuenta de reaparición **no viaja por la red**: sale de `NET.respawnMs`, la
misma constante que usa el servidor, contada desde que llega la foto que te da
por muerto. Eso la deja corta medio viaje —25 ms de 2000, un 1%— y es mejor que
meter un campo más en cada foto de cada paso para ganar eso.

La marca de impacto se enciende con el veredicto **del servidor**, no con el
propio: avisar con el tuyo sería prometer una baja que luego no aparece. Son
cuatro trazos en diagonal y **blancos**: la forma es lo que la separa de la mira,
no el color, porque en esta paleta todos los tonos significan ya algo y el rojo
es «te están disparando a ti». Misma regla que la visera del casco y que el
fogonazo de cuatro puntas.

### Lo que costó: un `display` que gana por ir después

El cartel de ABATIDO salía **siempre**, con la vida a 100. La regla que apaga las
capas de juego (`#mira, #vital, #abatido { display: none }`) y la que da forma al
cartel (`#abatido { ... display: grid ... }`) tienen **la misma especificidad**
—un id cada una— y la segunda va después, así que gana.

No lo cazó ninguna aserción: las que había miraban la mira, la vida y el panel,
que era lo que yo estaba pensando. **Lo cazó mirar una captura de pantalla.** La
suite tiene ahora la aserción que faltaba, y la lección es la de siempre por otra
puerta: se comprueba lo que se ha pensado, así que de vez en cuando hay que mirar
lo que sale de verdad.

### Lo que confirmó el banco sin buscarlo

Andando de frente desde la salida sólo se avanzan **0.90 u**: ahí está el muro de
aparición de la vuelta 43, haciendo exactamente su trabajo. De lado son 4.55 u en
700 ms —los 6.5 u/s de carrera— y de espaldas 1.90 hasta la pared de la sala. La
primera versión de la suite medía de frente y daba el movimiento por roto.

## Ronda 49 — El que se va a otra pestaña, y los dos del mismo color

Los dos fallos de la primera prueba real entre dos PCs, con internet de verdad
por medio (RTT 65-72 ms).

### El avance rápido al volver de otra pestaña

Lo que pasa, en orden: el navegador **para el `requestAnimationFrame`** de una
pestaña de fondo, el bucle deja de correr y el contador de pasos del cliente se
queda donde estaba. Mientras, el WebSocket **sí sigue entregando** —eso no se
frena—, así que `pasoObjetivo()` sigue subiendo con el reloj del servidor. Al
volver, el enganche al reloj se encuentra cientos o miles de pasos de desfase y
se pone a recuperarlos a `maxCatchUpTicks` pasos de más por frame. Cada uno de
esos pasos mueve al jugador con las teclas de **ahora**, así que se ve correr.

Medido con el estímulo real (banco `fondo49.mjs`, tres ausencias):

| Ausencia | Se queda atrás | Su velocidad | La que ve el rival | Tiempo a >1.5× | Correcciones |
|---|---|---|---|---|---|
| 5 s | 295 pasos | **32.9 u/s** | 26.7 u/s | 0.40-0.63 s | 0 |
| 20 s | 1.195 pasos | 29.6 u/s | 25.8 u/s | 0.17 s | 0 |
| 60 s | 3.622 pasos | 32.9 u/s | 26.2 u/s | 0.47 s | 14, con 0.43 u de error |

La carrera son **6.5 u/s** y el techo del air-strafe 9.5: nada del juego se
mueve a 33. Y las correcciones de la tabla son las que se vieron en la partida
de verdad (allí, 2.777 de 34.924 y 16 u de error máximo): aparecen cuando el
enganche dura lo bastante como para que la cola de entradas sin confirmar se
pase de `maxPendingInputs` y empiece a tirar las más viejas — reejecutar sin una
entrada ya no reproduce el estado del servidor.

**El arreglo: por encima de cierto atraso no se recupera, se re-ancla.**
`NET.resyncTicks` (60 pasos, un segundo de mundo). Y no es una concesión: **no
hay nada que recuperar.** Sin bucle no se produjo ni una entrada, y el servidor,
que no adivina, dejó a ese jugador parado donde estaba. Correr ahora sería
ejecutar de golpe unas entradas que nadie dio.

Es además la regla que el proyecto ya tenía en los otros dos relojes y que al
cliente le faltaba: el motor acota el frame largo con `SIM.maxFrameDeltaMs` y
re-ancla `_simTime` (§44), y el Durable Object hace lo mismo al volver de un
parón (§47). Tres relojes, una regla.

Con el re-anclaje, las mismas tres ausencias: **6.5-6.9 u/s** —o sea, andando—,
**cero** tiempo por encima de 1.5×, cero correcciones y cero error.

### Por qué NO se cuelga de `visibilitychange`

Era lo primero que había que mirar, y la respuesta salió medida: **se puede
tener el síntoma entero sin que el evento llegue a dispararse.** Con una pestaña
detrás de otra en el mismo navegador, el rAF baja a **4.7 fps** (14 ticks en 3 s)
mientras `document.visibilityState` sigue diciendo `visible` y **no hay ni un
`visibilitychange`**. Ahí, un arreglo colgado del evento no habría hecho nada.

Y al revés: un cambio de pestaña de 200 ms **sí** dispara el evento y no necesita
re-anclar nada — la banda muerta lo recupera en dos frames y re-anclar sería un
salto de reloj gratis.

Así que el evento es **una pista, no el mecanismo**. Lo que hay que mirar es el
desfase, que es el único sitio donde el problema se manifiesta, venga de una
pestaña de fondo, del portátil dormido, de una pausa larga del recolector o de un
punto de ruptura abierto. Misma idea que «la marca vive donde ocurre el salto».

### Los dos jugadores del mismo color

El banco pintaba al rival **siempre** con `equipos[1]` y al fantasma **siempre**
con `equipos[0]`: cada uno era azul para sí mismo y magenta para el otro, o sea
que los dos se veían iguales. El color de equipo existe justo para lo contrario.

Y arreglarlo destapó la raíz, que era del servidor: la ranura de salida se
asignaba con `jugadores.size % 2`. Con dos que entran seguidos funciona; en
cuanto uno se va, deja de funcionar — con `p2` dentro, el que llegase cogía otra
vez la ranura 1, **la suya**, y los dos aparecían en el mismo sitio y del mismo
color. Ahora se coge **la ranura libre** y se guarda en el jugador (`equipo`),
que es de donde salen las dos cosas: dónde apareces y de qué color eres.

Deducir el color del id (`p1`, `p2`) parecía equivalente y no lo es: el id es un
contador que no para, así que dos jugadores pueden ser `p3` y `p5` —los dos
impares— y quedarse otra vez iguales. La ranura la manda el servidor en la
bienvenida.

### Lo que costó, y es todo de método

Tres medidas falsas seguidas, las tres del instrumento y no del código:

- **No se puede poner una pestaña en segundo plano dentro de un banco.**
  Chromium sin cabeza no frena de verdad la de atrás, y Playwright además
  arranca con el frenado desactivado (`--disable-renderer-backgrounding` y dos
  más). Con ellas puestas el fallo **no se reproduce**. Lo que sí vale es aplicar
  el mismo estímulo: **parar el `requestAnimationFrame` y dejar todo lo demás
  corriendo**, que es lo que hace el navegador —y lo que lo distingue de bloquear
  el hilo, que pararía también el socket y mediría otra cosa—.
- **Se mide en unidades de mapa por segundo, no en pasos por segundo.** Con el
  re-anclaje el contador **salta** en un frame: la primera tabla daba «28.784
  pasos/s» donde el jugador no se había movido ni un centímetro. Un contador que
  salta no es un jugador que corre.
- **Y la sonda va dentro de la página, una muestra por frame.** Medirlo desde
  fuera con `evaluate` metía el viaje de ida y vuelta en la distancia y no en el
  tiempo: **33 u/s donde la sonda de dentro daba 6.5**. Es la misma regla que la
  de la vuelta 39 con los píxeles —el instrumento no puede añadir lo que se está
  midiendo— por otra puerta.

Y dos más de encuadre: cada tanda necesita **pestañas nuevas** (encadenadas, el
jugador acaba pegado a una pared y la siguiente mide eso), y se mira **el primer
segundo tras volver**, que es donde vive el fenómeno — más allá, este contenedor
vuelve a frenar la pestaña y lo que se mide es un tirón nuevo, con un solo
re-anclaje y a 1.5 s del regreso.

*(Lo de «este contenedor vuelve a frenar la pestaña» era verdad y tenía una causa
que esta vuelta no miró: las dos páginas estaban en el mismo navegador. Ocho
vueltas después acabó midiendo el frenado en vez del fallo — ver §57.)*

## Ronda 50 — Reaparecer es un teletransporte, no un viaje

De la segunda prueba real entre dos PCs (RTT 35-42 ms): al morir lejos del punto
de aparición, el cuerpo se veía **recorrer** la distancia hasta el spawn.

### Lo que pasaba, confirmado en los tres sitios

`poseEpoch` existe desde la vuelta 44 justo para esto: sube en cada `reset()`
—el único sitio donde la posición salta sin recorrer el camino— y quien dibuja
la mira para no pintar el salto como un barrido. El servidor la sube al
reaparecer, porque `_reaparecer` llama a `movimiento.reset()`. Lo que faltaba
era el resto del camino:

1. **`snapshot()` no la incluía.** Veinticuatro campos, y la época no era
   ninguno: la marca nunca salía del servidor.
2. **`restore()` tampoco la tocaba**, así que la comprobación del bucle
   (`epoca !== movimiento.poseEpoch`) no podía dispararse nunca en una
   reaparición.
3. **`poseDelRival()` mezclaba `a` y `b` sin mirar nada más.** Con la muerte y la
   reaparición a los dos lados de la pareja de fotos, `mezcla()` pintaba
   literalmente la recta entre el punto de muerte y el spawn.

O sea: un camino de código distinto que nunca quedó conectado a la señal que ya
existía, exactamente como se sospechaba.

### Lo que sí estaba bien, y conviene no tocarlo

**La vista del propio jugador ya era instantánea.** Medido, muriendo parado y
muriendo en movimiento: el salto de 14-15 u se dibuja en **un solo frame**. Y
tiene su razón: la reaparición llega por `_reconciliar`, que corre en el mensaje
del WebSocket, o sea **entre** frames; cuando el bucle da el paso siguiente,
`previa.copy(camara.position)` ya lee el spawn. No hay dos poses entre las que
interpolar, así que no hay nada que arreglar ahí.

Lo que se ve del propio cuerpo al reaparecer no era un barrido: era el del rival
en la otra pantalla.

### El arreglo

`poseEpoch` viaja en la foto —es el único campo del estado que no dice *dónde*
está el jugador sino *cómo* llegó— y `restore()` la acepta del servidor, que es
quien sabe si ha habido teletransporte. Y `poseDelRival()` **no interpola entre
dos estados con épocas distintas**.

Se queda en `a`, el lado viejo, y no salta ya a `b`: así el teletransporte cae en
**su instante exacto**. El cuerpo se queda donde murió hasta que el reloj de las
fotos cruza a `b.n`, y ahí la pareja pasa a ser la siguiente y aparece en el
spawn. Ni antes ni después, y en un frame.

**Y la marca viaja porque el que dibuja no puede deducirla.** Una comprobación de
distancia en el cliente —«si se ha movido mucho, es un salto»— confundiría un
teletransporte con un jugador rápido, y es la misma razón por la que `poseEpoch`
existe desde la 44 en vez de mirar cuánto se ha movido la cámara.

Medido con latencia de 20 ms y jitter de 8, con el antes y el después sobre **los
mismos paquetes**:

| Fórmula | Frames del salto | Distancia | Frames dibujados por el camino |
|---|---|---|---|
| Antes (mezcla lineal) | 2 | 14.52 u | 1 |
| Hoy (mira la época) | **1** | 14.52 u | **0** |

Sin arreglo, el cuerpo pasaba por x 10.338 —una posición en la que nunca estuvo—
a unos 400 u/s, contra los 6.5 u/s de carrera.

### Lo que costó, y otra vez es de método

- **Dos navegadores, no dos pestañas.** En el mismo navegador la de atrás se
  frena a ~1 fps, y el barrido dura dos frames: la primera traza del observador
  salió con un frame de **1.066 ms**, dentro del cual cabía el barrido entero sin
  verse. Con dos procesos de navegador las dos van a 60 fps.
- **Y no se pueden comparar los relojes de dos páginas.** `performance.now()` es
  relativo al origen de cada una, así que alinear las dos trazas por hora no
  significa nada: el salto se busca en la traza del observador **por lo que es**,
  el mayor desplazamiento entre dos frames.
- **Matando a alguien de pie en su propio spawn no se mide nada.** La primera
  tanda salió con el jugador muriendo encima del punto de aparición: reaparecer
  no movía nada y las dos fórmulas daban lo mismo. Es la trampa de la vuelta 46
  otra vez, y por eso el banco comprueba antes que hay un salto que ver.
- **Y el antes y el después salen de los mismos paquetes.** El banco reproduce la
  fórmula vieja sobre el mismo búfer que usa la de verdad, en vez de comparar dos
  tandas distintas: así no hay dos redes que comparar, y la suite puede cazar la
  regresión —con la fórmula vieja sigue dibujando el cuerpo por el camino—.

## Ronda 51 — El cliente deja de quedarse callado (y de congelarse)

De la primera prueba remota: al unirse el segundo jugador, uno se quedó
**bloqueado sin poder moverse** y el otro **no le veía en absoluto**. No se
repitió al segundo intento.

### No era la carrera que parecía

Lo primero fue descartar lo sospechado, con datos y no con lectura:

| Experimento | Resultado |
|---|---|
| Los dos entran **a la vez** en una sala nueva | 12/12 bien |
| Uno recarga antes de que entre el otro | 12/12 bien |
| Muerte sucia del TCP, sin saludo de cierre | la ranura se libera |
| ¿Se queda el foco atrapado en el campo de código? | no: pinchar el lienzo lo suelta |

Y en el código tampoco había dónde: `Sala.fetch()` **no tiene un solo `await`**,
así que dos conexiones simultáneas no pueden entrelazarse — el Durable Object
las atiende una detrás de otra.

### Lo que era: un freno sin suelo contra un reloj muerto

El enganche al reloj del servidor frena al cliente cuando va por delante,
restándole un paso por frame. Contra un reloj que avanza eso es correcto y se
apaga solo. Contra un reloj **parado** es una trampa sin fondo: si dejan de
llegar fotos, `pasoServidor` se congela, el desfase crece hacia abajo sin límite
y el cliente se frena **hasta cero**. Medido congelando sólo ese número:

```
con la red bien                      60 pasos/s
con el reloj del servidor parado      3 pasos/s
   ... y dos segundos después         0 pasos/s
```

Y de ahí no sale, porque cuanto más pasa, más «por delante» se cree.

**Eso explica las dos mitades del síntoma a la vez.** El jugador no se puede
mover —su mundo no avanza— y se queda clavado en el punto de aparición, que
desde la vuelta 43 está **detrás del muro**: desde casi todo el mapa, el otro no
le ve en absoluto.

**El arreglo son dos cosas, y la que manda es la primera.** Al reloj del
servidor sólo se le hace caso si está **fresco** (`NET.clockStaleMs`, 250 ms,
unas 15 fotos); sin noticias se predice a tiempo real por el acumulador, que es
lo que toca mientras no se sabe nada. Y el freno tiene **suelo**: como mucho
`clockDeadbandTicks` frames seguidos sin avanzar.

Medido con un corte de red de verdad: **61 pasos/s** con la red cortada, contra
los 0 de antes. Y quitando sólo la puerta de frescura, el cliente se hunde a
**20 pasos/s** — que es lo que demuestra que es la puerta, y no el suelo, lo que
lo salva.

**Ojo con el suelo, que la formulación obvia es falsa.** «Nunca menos de un paso
por frame» no vale: a 144 Hz el acumulador da menos de un paso por frame, y
forzarlo pondría el mundo a 144 pasos por segundo. El suelo tiene que ser sobre
**frames seguidos frenados**, no sobre pasos por frame.

### Y dos silencios que convertían cualquier fallo en magia negra

- **`MSG.ADIOS` no lo atendía nadie.** `_recibir` conocía `BIENVENIDA` y `FOTO`
  y nada más, así que «la partida está llena» se tiraba sin mirarlo.
- **El transporte no escuchaba `close` ni `error`**, sólo `message`. Una
  conexión caída no se notaba nunca.

Y como `dar()` **predice en local aunque no haya conexión** (`_aplicar` va antes
del `if (!this.conectado) return`), un jugador rechazado se movía tan ricamente
en su pantalla sin existir para nadie. Tres formas distintas de quedarse fuera,
las tres con la misma pinta: un juego colgado.

Ahora hay **dos avisos y son distintos a propósito**: el amarillo dice «no
llegan fotos» y puede pasarse solo; el rojo es definitivo —te han echado o el
cable se ha cortado— y lleva el motivo que da el servidor. Y al desconectarse se
**suelta el ratón**: dejar a alguien capturado en una partida que ya no existe es
encerrarle en una pantalla que no responde.

### La cuarta función del transporte

La regla de la vuelta 46 decía **tres**: `send`, `onMessage`, `close`. Ahora son
cuatro, y la regla no se rompe, se precisa: lo que la 46 prohibía era **exponer
si está abierto**, que es preguntar por un estado, y eso sigue prohibido — que
hay partida lo dice la bienvenida, que es del protocolo.

Colgarse es otra cosa. **Un cable que se corta no manda ningún mensaje**, así que
no hay forma de enterarse por el protocolo. `onClose` es un **aviso**, no un
estado, y es lo único que el cable sabe y el protocolo no. La alternativa
—inventarse un mensaje dentro de `onMessage`— pone al transporte a redactar un
protocolo que no es suyo.

Medido matando el Worker de verdad: el aviso sale **en rojo** con
`deFuera: false`, o sea que el cliente distingue «me han echado» de «se ha
cortado», que es justo lo que no podía hacer.

### Lo que costó

**Congelar el reloj del servidor dejando las fotos llegando prueba un estado que
no existe.** La primera versión del banco lo hacía: el resultado eran 20 pasos/s
—el suelo del freno— en vez de los 60 del arreglo, y un aviso que aparecía y
desaparecía, porque las fotos seguían reseteando el contador de silencio. El
servidor nunca para su reloj mientras sigue mandando: el estímulo bueno es
**cortar la red de verdad** (`context.setOffline`), y entonces sale 61.

## Ronda 52 — Abatido de verdad, y una baja que se nota

Primera de las tres vueltas hacia el juego completo en red. Tres cosas, y la
primera tiene un truco que decide las otras dos.

### La muerte va en el reloj de las entradas, no en el del servidor

`Partida._ejecutar` movía al jugador **sin mirar la vida**: un abatido seguía
paseando los dos segundos de la reaparición, a la vista del rival. Arreglarlo
parece una línea —«si está muerto, no muevas»— y no lo es, porque el cliente
**también** tiene que aplicar esa regla al reejecutar sus entradas sin confirmar.
Si los dos lados no coinciden en qué pasos estuvo muerto, cada foto trae una
corrección.

Y ahí está la trampa: `reaparecerEn` se contaba en **pasos del servidor**, que es
un contador que el cliente no comparte —va por delante lo que tarde el viaje—.
Con ese reloj, «estoy muerto» da distinto a cada lado por construcción.

Lo que sí comparten es **el número de entrada**: el protocolo dice desde la
vuelta 45 que cada entrada viaja sellada con su paso `n` y que los dos extremos
la ejecutan con `now = n · SIM_STEP_MS`. Así que la muerte pasa a ese reloj:
`vivoEn = ack de la víctima + respawnMs/paso`, y los dos lados aplican el mismo
predicado a los mismos números. La reaparición deja de ocurrir en `tick()` y
ocurre **al ejecutar la primera entrada que alcanza `vivoEn`**, que es una
entrada concreta y por tanto predecible.

Medido, con 20 ms de latencia y 8 de jitter: un abatido con la tecla de andar
pulsada se mueve **0.00 u** en 0.9 s, contra los ~5.9 que andaría.

### Y por eso la reaparición se puede predecir

Como es una entrada concreta y el sitio de salida no cambia —es el de la ranura,
que llega en la bienvenida—, el cliente hace exactamente lo mismo que el
servidor. Medido:

| | Correcciones | Error máximo |
|---|---|---|
| Prediciendo la reaparición | **0** | **0 u** |
| Sin predecirla | 1 | **15.46 u** |

Los 15.46 u son la distancia del punto de muerte al spawn: sin predecir, cada
muerte se paga con una corrección del tamaño del mapa. Y el aterrizaje cae a
**0.11 u** del sitio de salida, con un salto de 15.89.

### Un cadáver no se dibuja

`vida` ya viajaba en la foto, pero `poseDelRival()` no la exponía y el cuerpo se
quedaba **en pie donde cayó** durante toda la reaparición: no había forma de
saber si le habías matado o seguía ahí quieto. Ahora el rival muerto no se
dibuja — medido, 0 de 59 frames con el cuerpo en pantalla.

El dato viaja del lado viejo de la interpolación, como todo lo demás cuando hay
salto (vuelta 50): así el cuerpo desaparece en el mismo instante en que le
correspondía desaparecer, no un paso antes.

### La baja se confirma al instante, y se distingue del impacto

El veredicto por disparo ya existía desde la 46 y el gancho `onVeredicto` desde
la 48: faltaba **un booleano**. `_aplicarDano` ya sabía cuándo la víctima llegaba
a cero; ahora lo devuelve y viaja con el veredicto.

Y se distingue **por forma y por voz**, no por intensidad:

- **La marca**: los mismos cuatro trazos, más largos y abiertos, y el punto del
  centro convertido en anillo. No hay color nuevo porque en esta paleta todos los
  tonos significan ya algo —y el rojo es «te están disparando **a ti**»—. Es la
  regla de la visera del casco y la del fogonazo de cuatro puntas.
- **El sonido** (`playKill`): el acierto es un chirrido **que sube**, brillante y
  corto, y significa «has conectado». La baja significa lo contrario —eso se ha
  acabado— así que **baja de tono** y lleva un grave debajo que el acierto no
  tiene. Es la regla del silbido de la vuelta 40: una voz propia, no la de al
  lado con otro volumen. Si sonaran parecidas, en medio de una ráfaga no habría
  forma de saber si el rival ha caído o sólo le has rozado.
- **Y dura más**: 420 ms contra 140. Una baja cierra un intercambio y se mira; un
  impacto es información de camino y no puede quedarse encima del disparo
  siguiente.

El contador permanente de bajas se queda fuera a propósito: `bajas` y `muertes`
ya viajan en la foto, y su sitio es el HUD completo, que es de otra vuelta.

**La página del duelo estrena audio.** No tenía ninguno; el contexto se arranca
en el mismo clic que captura el ratón, que es el único gesto seguro que hay.

### Lo que costó, y es todo del banco

- **Matar de un tiro a la cabeza no prueba que la baja se distinga del impacto.**
  La primera tanda salió con un solo veredicto, que era baja: con eso, «uno viene
  marcado como baja» se cumple igual si se marcan todos. Se dispara a las
  piernas, que son 34 de daño, y entonces hay tres impactos y una sola baja.
- **Y medir dónde está el jugador dos segundos después de reaparecer mide otra
  cosa.** Seguía con la tecla de andar puesta, así que estaba a 10 u del spawn y
  el banco daba el arreglo por malo. El salto se busca por lo que es —el mayor
  desplazamiento entre dos frames— igual que en la vuelta 50.
- **Un abatido que deja de mandar entradas no reaparece**, porque la reaparición
  cuelga de sus propias entradas. Es consecuencia deliberada del reloj elegido:
  quien se va a otra pestaña estando muerto vuelve al mundo cuando vuelve a la
  pestaña. Anotado aquí porque parece un fallo y no lo es.

## Ronda 53 — La pausa es del mundo, no del menú

Al pulsar Escape se abría el menú y **el mundo seguía corriendo por detrás**: con
WASD se andaba con el menú puesto, y el rival lo veía. El `keydown` sólo miraba
si estabas escribiendo en un campo, no si estabas jugando.

### Lo primero: qué es una pausa

No es «dejar de leer teclas». Es **parar el mundo de los dos**, y eso sólo lo
puede decidir el servidor. Un «estoy en pausa» local sería exactamente el fallo
que se venía a arreglar, con otro disfraz: una pantalla que dice una cosa y un
mundo que hace otra.

Así que `Partida` gana un estado de pausa y `tick()` no avanza nada mientras esté
puesta — misma regla que el motor («pausar es dejar de sumarle al reloj del
mundo»), así que **el número de paso tampoco corre**. La foto sí sigue saliendo:
es cómo se enteran los dos, y callarse dejaría al rival sin la única señal.

Y de ahí sale una consecuencia para los dos huéspedes: **el reloj de pared sigue
y el del mundo no**, así que hay que re-anclar. Sin eso, el de Node se convierte
en un bucle a máxima velocidad —el objetivo se queda fijo y la espera en cero— y
el de la nube se debería medio minuto de pasos al reanudar.

### Tres libres, y luego se pregunta

Pausar en un 1v1 no es gratis: para el mundo de los dos y quien la pide elige el
momento. Tres sin preguntar es bastante para lo que las pausas son de verdad —el
timbre, un vaso de agua— y poco para usarlas de táctica. De la cuarta en adelante
decide el rival, que es exactamente la conversación que tendrían en la misma
habitación. No se recuperan, y son **por jugador**: gastarlas no toca las del
otro.

Dos detalles que son del diseño:

- **Sólo levanta la pausa quien la puso.** Si la levantase el otro, pedirla no
  serviría de nada.
- **Aceptar o rechazar se hace con teclas** (Intro / N), no con un botón: a quien
  le llega la petición está jugando, con el ratón capturado, y soltarlo para
  pinchar sería pausarle la partida para preguntarle si quiere pausarla.
- **El silencio cuenta como negativa** (`PAUSE.answerMs`, 12 s; se llamaba
  `NET.pausaRespuestaMs` hasta la vuelta 54). Sin eso,
  pedirle una pausa a alguien que se ha ido a por hielo deja al que la pide
  mirando un cartel para siempre.
- **Irse levanta lo que uno tuviera puesto.** Una pausa de alguien que ya no está
  deja el mundo parado para siempre.

### Lo que costó: la pausa envenenaba el RTT

El fallo más caro de la vuelta, y no se veía en ninguna pantalla. El RTT sale de
restar, al llegar la confirmación de una entrada, el instante en que se mandó — y
**una entrada mandada antes de la pausa se confirma después**, así que el viaje
medía la pausa entera.

Medido: tras una pausa de segundo y medio, el RTT saltaba de **29 ms a 1.500**.
Con eso `pasoObjetivo` se iba **noventa pasos** por delante, el enganche se ponía
a recuperar y el cliente se quedaba a **20 pasos por segundo** —un tercio de la
velocidad— durante el resto de la partida. Lo que se veía era «tras reanudar, el
rival anda a cámara lenta», que no se parece en nada a su causa.

El arreglo es una línea: al entrar en pausa se olvida qué se mandó y cuándo. Sin
historial no hay resta que hacer, y el RTT se queda con el último bueno hasta que
haya un viaje de verdad que medir.

### Y dos residuos que sí se pueden quitar, y uno que no

- **Soltar el ratón suelta las teclas**, igual que perder el foco. No es una
  pausa local fingida: es la verdad de lo que pasa —quien abre el menú no está
  pulsando nada— y quita el viaje de ida y vuelta que se andaba entre Escape y la
  confirmación del servidor (medido: 0.22 u con 35 ms de RTT).
- **Volver a pinchar levanta tu propia pausa.** Escape pausa, clic reanuda. Sin
  esto se recuperaba el ratón con el mundo todavía congelado, y se disparaba al
  vacío —en pausa no se anota ningún disparo—. **Lo cazó `jugable48`**, que hace
  clics de verdad: la suite de la vuelta 48 encontró la regresión de la 53.
- **Lo que queda es un paso** (0.108 u): el frame que ya estaba en vuelo cuando
  se soltó el ratón. Eso no se quita sin fingir una pausa que el servidor todavía
  no ha concedido.

Y en pausa **no se anota ningún disparo**: como se consume en el paso siguiente y
en pausa no hay pasos, uno anotado ahora saldría al reanudar — una bala guardada
durante la pausa, apuntada a donde el rival estaba parado.

## Ronda 54 — Una pausa con reloj, y una votación que no deja hueco

Tres cosas de la 53 que la primera partida larga dejó a la vista. Las dos
primeras son de diseño; la tercera era un agujero.

### El agujero: pedir la cuarta no paraba nada

Repro confirmado por el usuario: agotadas las tres libres, pedir una pausa abría
el cartel de «esperando al rival» **y el mundo seguía corriendo**. El que la
pedía se quedaba con el ratón suelto, sin teclas —la 53 las suelta al soltar el
ratón, que era lo correcto— mirando una pantalla que decía que estaba en pausa.
El rival, que no había contestado nada todavía, podía seguir jugando con total
normalidad. Y matarle.

O sea: el estado se **veía** como una pausa, se **comportaba** como un menú, y no
se resolvía solo. Las tres cosas a la vez.

La causa está en cómo se guardaba: `pausa` y `peticion` eran **dos objetos
distintos**, y el mundo se paraba mirando sólo el primero. Un estado repartido en
dos sitios que tienen que estar de acuerdo sobre quién y hasta cuándo es la forma
habitual de que no lo estén.

**El arreglo es la unificación, no un `if` más.** Esperar la votación es una
pausa a la que le falta el permiso, así que es **la misma pausa** con la marca
`pendiente`. `pausada` —lo que miran `tick()`, el bucle del cliente y los dos
huéspedes para re-anclar— pasa a ser verdad desde el instante en que se pide. No
hubo que tocar ninguno de esos sitios: el estado dejó de mentirles.

Medido (`pausa54.mjs` [2b]), con el rival aporreando W y disparando durante la
votación:

| | esperando la votación | jugando |
|---|---|---|
| lo que anda el rival en 1.3 s | **0.00 u** | 8.02 u |
| entradas que manda | **0** | ~78 |
| disparos que salen | **0 de 6** | 6 de 6 |
| vida del que pidió la pausa | 100 → **100** | — |

El denominador de la primera columna es la segunda: sin el paseo de 8 u al lado,
un «0.00» no dice si el mundo está parado o si es que el banco no ha pulsado
nada. Es la regla de la vuelta 46, la de la tabla vacía al 100%.

### Y una negativa se lee, no se sufre

Con el mundo ya parado desde que se pide, que la votación se caiga y el cartel
desaparezca sin más sería devolver a alguien al juego sin avisarle. Así que la
negativa **se dice**: «VOTACIÓN DENEGADA · tu rival ha rechazado la pausa», o
«no ha contestado a tiempo» si se cayó por silencio, y se quita volviendo a
pinchar, como cualquier menú. El mundo, mientras, ya corre.

**El aviso viaja como contador, no como aviso.** Un campo de una sola foto se
pierde con esa foto, y entonces el que pidió la pausa no se entera nunca de qué
pasó. Un contador —«van 2 votaciones tuyas caídas, la última por silencio»— lo
lee el cliente comparando con el último que vio: repetirlo en cada foto no cuesta
nada y perder una no cuesta el aviso. Es la misma idea que los veredictos de
disparo de la 46, resuelta con un número en vez de con un TTL.

La primera lectura sólo toma nota, y eso es deliberado: quien entra a media
partida no tiene una negativa que enseñar, tiene un marcador con el que comparar.

### La pausa tiene reloj, y el reloj es el de pared

Una pausa sin tope no es una pausa, es un abandono con el mundo parado: el único
límite que había era que el otro se dignara a volver. Ahora una libre dura
`PAUSE.freeMaxSeconds` (120 s) y una votada `PAUSE.votedMaxSeconds` (60), y al
agotarse **se reanuda sola**. La votada dura la mitad porque el que dice que sí
está pagando un rato parado que no ha elegido: una cosa es concederle un minuto a
alguien y otra firmarle un cheque en blanco.

**Y esta cuenta va en reloj de pared, contra la convención.** La regla del
proyecto es que los relojes que pueden esperar van por delta y en pausa no corren
—se cerró así el agujero de la cuenta atrás del explosivo y el de la carga del
escudo—. Éste es exactamente el contrario, y por la misma razón que sostiene la
regla: es *el reloj de la pausa*. Con el del mundo, que está parado, la cuenta no
bajaría nunca y el máximo no existiría. La prueba de que es la excepción correcta
es que los tres relojes que deciden la pausa —el tope, la ventana de respuesta y
el re-anclaje de los dos huéspedes— son de pared, y todo lo demás sigue sin
serlo.

**La cuenta se ve, y la calcula el servidor.** Viaja en la foto como «cuánto
queda» y no como «hasta cuándo»: los relojes de las dos pantallas y el del
servidor no coinciden —nunca lo hacen, es la regla de la vuelta 45— y un cartel
que cada una calculase por su cuenta acabaría diciendo dos cosas distintas del
mismo número. El cliente lo ancla a su reloj local al recibirlo, así que entre
foto y foto sigue bajando sola y no da saltos.

Dos detalles de la pantalla:

- **El cartel se reconstruye al cambiar de estado; la cuenta, por frame.**
  Rehacer el `innerHTML` sesenta veces por segundo se lleva por delante el botón
  de reanudar en mitad de un clic. Es la regla del HUD del juego —cero `setState`
  por frame— aplicada a una página que no tiene React.
- **La cuenta no va teñida.** En esta paleta el rojo ya dice «te están
  disparando» y el ámbar «hay un explosivo»; lo que separa la cuenta del rótulo
  es el sitio, no el color. El panel de pausa es neutro desde la 53 y sigue
  siéndolo.
- **Y el menú se centra debajo del cartel**, no detrás: los dos salen a la vez
  —quien pausa suelta el ratón— y el cartel tapaba el título de la sala. El alto
  lo escribe la propia página al cambiar de estado, porque depende de cuántas
  líneas tenga el cartel; clavarlo a un número se rompe el día que se le añada
  una.

### El tuning se muda a `PAUSE`

Eran dos números en `NET` y ahora son cuatro. Tener la mitad de lo que se toca al
calibrar una pausa en un sitio y la otra mitad en otro es cómo se acaba cambiando
uno y olvidando el que le hacía pareja. Lo que decide quién puede pausar y cuánto
dura va en `PAUSE`; lo que decide cómo viajan los bytes sigue en `NET`.

### Una aserción que guardaba el fallo

`pausa53.mjs` [4] afirmaba «la cuarta **no** pausa por sí sola», y pasaba. Era
verdad y era el bug: describía el hueco sin verlo. Se ha reescrito a lo que ahora
es la regla —«el mundo se para ya mientras se vota»—, con la nota de por qué
cambió. Una suite que se actualiza sin decir qué dejó de ser cierto es una suite
que el día de mañana no se sabe si mide la regla o la costumbre.

### Cómo se mide un tope de dos minutos

No esperando dos minutos. `pausa54-tope.mjs` se pasa con `PAUSE.freeMaxSeconds` y
`votedMaxSeconds` bajados a 6 y 3, **volviendo a construir y a relanzar el
Worker** —sirve `dist/`, no `src/`: sin relanzarlo se mide el build anterior, que
es el falso negativo del §4 de `CLAUDE.md` por otra puerta—. Que los valores de
fábrica son los que llegan a la pantalla lo comprueba `pausa54.mjs`, que lee la
cuenta recién puesta: 119.5 s de 120 y 59.5 de 60.

## Ronda 55 — La votación deja de congelar a nadie

La 54 cerró el agujero de la 53 **metiendo la votación dentro de la pausa**: el
mundo se paraba desde el instante en que se pedía. Funcionaba, y el precio era
que dos personas se quedaban con el mundo parado mientras una se decidía. Esta
vuelta ataca el mismo agujero por el otro lado, y lo sustituye entero: **no hay
nadie esperando.**

Es un cambio de diseño, no un añadido. Lo de la 54 no se conserva.

### La forma nueva, y por qué cierra el agujero igual

1. **Escape sin libres abre el menú de siempre** y nada más. No pausa, no pide
   nada, no le llega un cartel a nadie. En el menú hay un botón: «Solicitar
   pausa por votación».
2. **Pulsarlo manda la solicitud y cierra el menú**, devolviendo el ratón. Quien
   la pide vuelve a jugar en el acto.
3. **Al rival le entra un cartel** por el borde derecho, con la votación y dos
   botones, y **sigue jugando** mientras decide.
4. **Si sale**, arranca la pausa votada de la 54 tal cual: su tope de 60 s y su
   cuenta atrás, sin tocar nada.
5. **Si no sale**, no pasa nada. Y **no hay aviso de «denegada» que cerrar**,
   porque no hubo nadie a quien devolverle un mundo que nunca se paró.

El agujero de la 53 era que alguien se quedaba mirando un cartel, indefenso,
mientras el otro jugaba. La 54 lo cerró parando el mundo de los dos; la 55 lo
cierra quitando el cartel de en medio. Las dos son válidas y sólo una de las dos
deja jugar.

### Lo que se mide, y contra qué

`pausa55.mjs`, 44 aserciones, con dos navegadores y haciendo lo que hace una
persona: clic en el botón del menú, teclas y botones del cartel.

| | vuelta 54 | vuelta 55 |
|---|---|---|
| lo que anda **quien la pide** con la votación abierta (1.2 s) | 0.00 u | **7.80 u** |
| lo que anda **quien tiene que votar** | 0.00 u | **7.91 u** |
| entradas que manda el rival | 0 | ~78 |
| carteles que cerrar tras una negativa | 1 | **0** |

La referencia de esas dos columnas es la misma medida sin votación de por medio
—7.91 u en 1.2 s—, que es el denominador sin el cual un número de marcha no dice
nada (regla de la vuelta 46).

### Pedir y votar son dos verbos, no uno con un `if`

Hasta la 54 había un solo mensaje y el servidor decidía qué era mirando las
libres que le quedaran a quien lo mandaba. Eso ya no vale: la cuenta de libres le
llega al cliente **en la foto**, o sea con un viaje de retraso, así que un
cliente con la cuenta vieja podía abrirle al rival un cartel de votación que su
jugador no había pedido. Un mensaje dice lo que se quiere, no lo que se supone.

De ahí sale también que **soltar el ratón sólo pida pausa si quedan libres**: sin
ninguna, Escape es un menú y nada más. Abrirle al rival una votación por el gesto
de soltar el ratón sería pedirle permiso sin querer.

### Quien no contesta se suma al que va ganando

Es la regla que pidió el encargo y está pensada para el día que haya más de un
rival: con cuatro personas, tres a favor y una callada, esa callada no puede
valer lo mismo que un «no» explícito. Quien la pide vota que sí sin decir nada
—pedirla es quererla—, y al agotarse la ventana los votos que faltan se suman a
la opción que más apoyo tenga. Un empate no aprueba: «la que más apoyo tenga» no
existe cuando hay tantos a un lado como al otro.

**Consecuencia que conviene tener delante: en 1v1 el silencio aprueba.** El único
voto emitido antes del final de la ventana es el sí implícito del solicitante, así
que el que va ganando es el sí. Es exactamente lo contrario de la vuelta 53 —donde
el silencio era una negativa— y el motivo de aquello ya no existe: entonces el que
pedía la pausa se quedaba tirado esperando, y el silencio le castigaba a él; ahora
está jugando, y el que ignora el cartel es quien decide dejarlo pasar. Está medido
en `pausa55.mjs` [7], y si algún día se quiere al revés es una comparación de una
línea en `_resolverVotacion`.

### El botón que no se puede pinchar

El encargo pide dos botones, y el banco encontró a la primera que **con el ratón
capturado no se pueden usar**: el clic va al elemento bloqueado por el
`pointerlock`, que es el lienzo. La primera hipótesis —que algo los tapara— la
tumbó el propio banco: `elementFromPoint` encuentra el botón en esas
coordenadas y aun así el clic no vota.

Así que cada botón lleva **su tecla escrita al lado** (Intro / N), y eso no es
una redundancia: son las dos situaciones reales. Con el ratón capturado se
contesta con la tecla; con el ratón suelto —el rival puede abrir su menú, que
durante una votación **no pausa nada**— se pincha el botón. Las dos están
medidas, y la que no se puede hacer también.

Es la regla de la vuelta 53 —«a quien le llega la petición está jugando, y
soltar el ratón para pinchar sería pausarle la partida»— conservada en su
sustancia, con el botón añadido para quien no está en esa situación.

### Declinar necesitaba un color, y no quedaba ninguno

El encargo pedía un color propio que no fuese el rojo, que ya dice «te están
disparando». El hueco obvio de la paleta parecía el violeta, y **medido en
CIELAB no lo es**: `#8B5CF6` se queda a **ΔE 24.8** del azul de equipo, la mitad
de los 51 que separan a los dos equipos entre sí y muy lejos de los 79 con que se
eligieron contra los reservados. El naranja, el rojo, el verde, el ámbar, el
amarillo, el azul y el magenta tienen dueño.

Lo único sin dueño es el eje que nadie ha pedido: el neutro. `COLORS.decline`
(`#7C8899`) mide **ΔE 68** contra el más cercano de todos ellos y a L\* 56 admite
texto oscuro. Y dice lo que tiene que decir — aceptar es la acción y va en verde;
declinar es seguir jugando, que es no hacer nada.

### Dos detalles de forma que son mecanismo

- **El cartel entra deslizándose, y se mide deslizándose.** Uno que aparece de
  golpe en el borde de la pantalla se confunde con un fogonazo. El banco no mira
  si tiene una clase: le quita la clase, lo deja asentar fuera, se la devuelve y
  muestrea el borde izquierdo a mitad de camino — 760 (fuera) → 626 (a mitad) →
  472 (puesto), en una pantalla de 760.
- **Una pausa tuya te suelta el ratón.** Con las libres el orden era el
  contrario —Escape suelta y luego llega la pausa—, pero una votada llega
  jugando, y quedarse capturado en un mundo parado es no tener con qué
  reanudarlo. Al que votó que sí no se le toca: no ha pedido nada, y devolverle
  al menú sería castigarle por haber dicho que sí.

### Y dos aserciones que guardaban el diseño viejo

`pausa54.mjs` [2b] exigía «el mundo está parado para los dos mientras se vota» y
pasaba. Era verdad y era el diseño que esta vuelta sustituye. Se queda **del
revés** —«el mundo NO se para mientras se vota»— porque invertida es la que
guarda lo nuevo; tirarla habría dejado la vuelta sin nadie vigilando su propia
regla. Lo mismo con el bloque del silencio como negativa, que se ha ido a
`pausa55.mjs` [7] con el signo cambiado.

Y un error del banco que costó dos diagnósticos falsos: medir un recorrido de
trece segundos en una sala de 40 u. B llevaba toda la suite andando hacia el
mismo lado, llegó a la pared y el desplazamiento de punta a punta dio **0.00 u**
con la tecla pulsada — que es exactamente lo que habría dado el fallo que se
estaba buscando. Lo delató comprobar la premisa aparte: en un banco limpio, el
mismo jugador se movía 9.86 u. Ventanas cortas y el rumbo como parámetro.

## Ronda 56 — El motor completo, contra un rival de verdad

La «Opción B» de la evaluación de la vuelta 50, que llevaba cinco vueltas
esperando: conectar `engine.js` entero —arma, cargador, recarga, retroceso,
dispersión, marcadores, HUD— a la red que las vueltas 45-55 dejaron validada.

Hasta aquí la página del duelo montaba **su propia escena mínima**: cámara,
escenario, movimiento y dos cuerpos. Era lo correcto mientras la pregunta fuese
sobre la red; la de esta vuelta es la contraria —¿funciona el juego contra una
persona?— y con una escena de a mano no se puede contestar.

### Lo que cambia no es un modo: es de dónde sale la verdad

`engine.usarRed(cliente)`, y a partir de ahí movimiento, disparo, vida y
reaparición **dejan de decidirse en el motor**. El arma se queda del lado del
cliente y lo único que el servidor le exige es la cadencia. El motor no
construye el cliente ni sabe de sockets: `net/prueba.js` lo ensambla con la
cámara, el movimiento y los oclusores **del motor** y se lo entrega. La regla de
la vuelta 45 sigue en pie.

Los seis métodos, y qué les pasa a cada uno:

| | antes | en red |
|---|---|---|
| `_shoot` | raycast contra el pool de dianas | `net.disparar()` con el instante **real** del clic; el veredicto vuelve del servidor |
| `_updateCombat` | `status.tick` + muñecos + marcadores | `_syncRival`: lee la foto y la pone en pantalla |
| `_syncMarkers` | una ranura por diana viva | una, la del rival, con un adaptador rival→instancia |
| `_onPlayerHit` | decide el daño | ya no existe ese camino: la vida baja en la foto |
| `_downPlayer` | `status.die()` y apaga el movimiento | ni una cosa ni la otra: ver abajo |
| `_respawnPlayer` | `status.respawn()` + `movement.reset()` | ya ocurrió en `_aplicar`; aquí sólo repone el cargador |
| `_simStep` | dianas, combate, explosivo | `net.dar()` en vez de `movement.update`, y nada de lo demás |
| `_beginSession` | siembra dianas, bomba y recogibles | no siembra nada; el único blanco es el rival |

### Un abatido no se mueve, y **no** porque se le apague el movimiento

Es el detalle que más fácil habría sido hacer mal. Fuera de la red, `_downPlayer`
llama a `movement.setEnabled(false)`. En red eso sería doble error: quien decide
que un muerto no avanza es el servidor, que ignora sus entradas hasta `vivoEn`
(vuelta 52) — y apagar además el movimiento local **deja de producir entradas**,
así que ese jugador **no reaparece nunca**, porque la reaparición cuelga de sus
propias entradas. Se ve igual: 0.00 u con la tecla de andar pulsada.

Lo mismo con `_respawnPlayer`: la reaparición ya la hizo `_aplicar` al ejecutar
la primera entrada que alcanzaba `vivoEn`, con su `reset()` y su época de pose.
Repetirla aquí sería un segundo teletransporte que el servidor no predijo.

Y con la pausa: `_onPointerLockChange` **no llama a `_suspend()`** en red. Un
`_suspend` local sería el «estoy en pausa» que la vuelta 53 quitó, y además
dejaría de mandar entradas. Lo que sí se hace es la verdad de lo que pasa —soltar
las teclas y apagar la mirada—; el mundo sigue hasta que la foto diga otra cosa.

### La cadencia la valida el servidor, y el arma la lleva el cliente

Es el reparto que recomendaba la evaluación: unas cuarenta líneas en
`partida.js` contra el modelo de arma entero al otro lado. Entre dos disparos
aceptados tiene que haber pasado lo que dicen las RPM del arma declarada; un
arma que no está en el catálogo no dispara.

Dos decisiones dentro:

- **Se mide en número de paso, no en la fracción del disparo.** La fracción
  existe para el rebobinado, que necesita el instante exacto; la cadencia sólo
  necesita un reloj monótono que compartan los dos extremos, y el paso lo es.
- **La holgura es un paso, y no un número inventado** (`NET.shotRateSlackTicks`).
  El cliente programa sus disparos con su reloj de mundo, que avanza en pasos, y
  el hueco real alterna entre el suelo y el techo del intervalo: un paso es esa
  cuantización. Lo que cuesta: con la Pulse (500 RPM) la holgura es el 14% del
  intervalo, así que un cliente que mienta gana eso y no un arma automática de
  la nada.

Medido pidiendo 3600 RPM con un arma de 600: **30 peticiones en 54 pasos, 9
aceptadas y 21 rechazadas**, contra un techo teórico de 10. Y un disparo
rechazado **recibe veredicto igual** —el cliente espera uno por `seq`— pero no
toca el mundo, y no cuenta como desacuerdo de la red: es una medida aparte.

### Lo que costó: un número que no viajaba

El arma frena. `weaponSpeedFactor` multiplica las tres marchas, y con la Rift en
la mano el cliente predecía a **5.88 u/s** mientras el servidor simulaba a
**6.50**, porque el peso sólo lo sabía un lado. Resultado: **75 correcciones en
286 fotos y 2.5 u de error máximo** — la reconciliación entera abierta por un
campo que no estaba en el protocolo.

El arreglo dice dónde estaba el error de concepto: **el arma no es un dato del
disparo, es del movimiento**. Así que viaja en **cada entrada**, no sólo cuando
se aprieta el gatillo, y como índice del catálogo (`WEAPON_ORDER`) para que
quepa en un número. Un solo campo con tres usos —el peso, la cadencia y la
silueta que el rival ve en la ficha— y ninguna ventana en la que los dos
extremos puedan discrepar. Después: **0 correcciones de 286 fotos**.

### Y el peor de los tres: las teclas

Al conectar el cliente se apuntaba `cliente.teclas` a `movement.keys` — un
objeto en vez de dos, que parecía justo la disciplina de la casa. Y es al revés:
**la reconciliación reejecuta entradas guardadas**, así que `desempaquetarTeclas`
llena `movement.keys` sesenta veces por segundo con máscaras **del pasado**. Con
un solo objeto, cada foto borraba la tecla que el jugador tenía pulsada. Medido:
con W apretada, `teclas.forward` volvía a `false` en el primer paso y el jugador
**no se movía en absoluto**.

Lo que separa las dos cosas no es un nombre, es un papel: `movement.input` es
**lo que el jugador está pulsando** y `movement.keys` es **lo que el paso está
ejecutando**. Fuera de la red son el mismo objeto a propósito —sin nadie que
reejecute, la intención y lo ejecutado son lo mismo, y copiar por paso sería
trabajo por nada—; `separateInput()` los desdobla, y sólo la red lo pide.

De ahí sale también cuál de las dos se suelta cuándo: `reset()` —que ocurre en
cada reaparición— suelta **lo que se ejecuta** y no la intención, o reaparecer
con W apretada te dejaría parado. Soltar el ratón, perder el foco y desactivar
el movimiento sueltan las dos, que es lo que significan.

### Escribir en un campo no es jugar

El juego no tiene ni un campo de texto, así que el teclado era del juego y punto.
La página del duelo sí los tiene —el código de la sala— y con el motor completo
teclear ahí **era jugar**: la `B` abría la armería, la `A` y la `C` movían, y
`preventDefault` se llevaba por delante lo escrito. Medido: teclear `abc` en el
campo del código dejaba el campo vacío.

`typingInField()` vive en `keybinds.js`, con `eventCode` y `keysOf`, porque es el
mismo vocabulario: qué cuenta como entrada del juego y qué no. Lo miran el motor
y el movimiento, desde el mismo sitio.

### La sesión empieza con la partida, no con el clic

Fuera de la red el clic arranca una ronda. Aquí la ronda ya está corriendo al
otro lado, y un jugador conectado que no manda entradas es un jugador al que el
servidor deja parado —y que, si le matan, no reaparece—. El clic enciende el
**mando**: mirar y teclear. La bienvenida enciende el **mundo**.

Y va en el **mismo turno** que la bienvenida, no en el frame siguiente:
`_beginSession` suelta las teclas, así que arrancar un frame tarde se comía una
tecla pulsada justo al entrar — que es lo que hacía fallar cuatro de cada doce
entradas simultáneas en `conexion51`.

De propina, la sesión de red empieza **en la ranura que da el servidor** y no en
el spawn del escenario: `movement.reset()` conoce uno solo y el servidor reparte
dos. Sin eso, el primer paso de cada partida llegaba con 2.5 u de error.

### Lo que el bucle se llevó

El bucle de la página —acumulador con arrastre, enganche al reloj del servidor,
re-anclaje tras un parón y freno con suelo— se ha movido a
`cliente.pasosDeFrame()`. Vive en el cliente porque es **del netcode**: el
acumulador solo bastaría para un juego local, y lo que lo distingue es el
enganche. Y vive en **un** sitio porque si no el motor habría llevado una
segunda copia de las vueltas 49 y 51.

### Lo que esta vuelta no trae

- **Escudo y casco**, tal como se decidió: sólo vida.
- **Los iconos `?` y `!`** sobre el rival. Dicen «te ha visto» y «te está
  disparando», y eso es el estado de una máquina que hoy sólo existe para los
  muñecos. Deducirlo desde fuera mirando relojes sería la segunda copia que la
  vuelta 37 se negó a tener: el día que el disparo del rival viaje en la foto, la
  fase sale de ahí. La brújula y la ficha flotante sí funcionan, y no dependen
  de eso.
- **Fogonazo y silbido** del rival, por lo mismo.

### Dos cosas que aprendió el banco

- **El ratón sintético miente bajo `pointerlock`.** Medido: con el ratón
  capturado, `mouse.down()` de Playwright dispara además un `mousemove` con el
  desplazamiento que va del centro bloqueado a su posición virtual, y eso **gira
  la cámara** — de −1.5708 a 0.0003 en el mismo evento. Un jugador no hace eso.
  `mouse.up()` no lo hace, y reponer el rumbo después se queda puesto: se
  aprieta, se apunta y se dispara, en ese orden.
- **Y una premisa que no se comprueba mide un muro.** Los primeros ocho disparos
  del banco salieron `0 impactos` con las dos columnas de acuerdo… en el fallo:
  entre (0,0) y (0,−8) está El Largo. La tabla vacía de la vuelta 46, otra vez.
  Ahora el banco resuelve el tiro **antes** de medir y afirma que hay línea.

### Y una que queda pendiente

El brazo de **reproducción** de `fondo49` —el que apaga el re-anclaje para
enseñar el fallo de la vuelta 49— ya no lo caza a través de su ventana de 250 ms
con el motor delante: sale 0.0 u/s donde debería salir treinta y pico. El fallo
**sí se reproduce**: medido con una sonda directa sobre la misma página y con el
re-anclaje apagado, el jugador recorre de −10.4 a 18.5 u en 900 ms (**≈32 u/s**,
contra los 6.5 de carrera). Lo que no sobrevive es la medida del banco, no el
fenómeno. El brazo que guarda el producto —con el arreglo puesto— sigue verde en
sus tres filas, con cero correcciones y el re-anclaje disparándose. Queda
anotado aquí a propósito: una suite roja que se explica es mejor que una suite
verde que no mide.

*(Resuelto en la §57, y con dos causas debajo en vez de una: la de aquí, y una
segunda que llevaba ocho vueltas dando por bueno el brazo del arreglo.)*

## Ronda 57 — El banco que medía el frenado

Una vuelta sin una línea de producto: la única que se toca es `fondo49.mjs`. Lo
que estaba mal era la medida, y debajo había **dos** fallos, no uno — el segundo
llevaba ocho vueltas dando por bueno justo el brazo que guarda el arreglo.

### Uno: el hueco de la ausencia se anotaba como un fotograma

El banco para el `requestAnimationFrame` de A, espera, y marca desde dónde
analizar. La sonda va por su cuenta —llama siempre al rAF de verdad, porque mide
el juego y no participa en él—, así que mientras la página vaya a su ritmo sigue
muestreando durante el parón y la primera muestra de después es un fotograma
normal.

Con la página frenada no: la primera muestra tras la marca llegaba con un `dt` de
**1016 ms**, el parón entero metido dentro de un «frame». Y como el análisis sólo
mira `REGRESO` (1000 ms) desde la primera muestra, **esa sola muestra era la
ventana completa** — y encima se descartaba por larga, con la regla que tira las
ventanas con un tropiezo de la máquina dentro. De ahí el 0.0 u/s de la §56, con
el jugador recorriendo 19 u por delante, y de ahí el «(1 ventanas con tropiezo de
la máquina, descartadas)» que salía en todas las filas y que nadie leyó como lo
que era: el aviso de que no quedaba nada que medir.

El arreglo es una línea: `marcar()` pide además **re-sembrar la referencia**, y
la muestra siguiente se tira en vez de anotarse. La marca es el sitio donde ese
hueco se corta, lo vaya a necesitar o no.

Con eso, el brazo de reproducción volvió a cazar el fallo: **31.2 u/s**.

### Dos: y entonces el brazo del arreglo también daba 28.3 u/s

Que es lo que convierte esto en una vuelta y no en un parche. Con la primera
causa cerrada, el brazo **con** el re-anclaje —el que tiene que salir andando—
daba también un avance rápido. El volcado enseñaba un patrón demasiado regular
para ser un tirón: **0.49 u cada 16 ms**, o sea unos 4.5 pasos de mundo por
frame, que es exactamente `maxCatchUpTicks`. Eso no es un cliente que vuelve de
un parón: es un cliente que **no sale nunca** de la recuperación acotada.

Y no salía porque iba permanentemente atrasado. Medido en la traza de A: **8
muestras en 900 ms**, o sea unos 9 fps. `fondo49` abría las dos páginas en el
**mismo navegador**, así que A era la pestaña de atrás y el contenedor la frenaba
— y un cliente frenado se lee igual que el fallo que se está buscando.

Es la regla de la §50 —«dos navegadores, no dos pestañas»— y `fondo49` es de la
§49, o sea de antes de que se aprendiera. Todo lo que vino después ya la cumple;
ésta se quedó sin revisar porque **estaba verde**. Un navegador por jugador, y
cada uno es la pestaña de delante del suyo.

### Tres: un techo necesita que se vea el suelo

Los dos fallos de arriba se leían en pantalla como un brazo **verde**, y no por
casualidad: la aserción del brazo del arreglo decía «no se mueve más rápido de lo
que permite el juego (≤ 9.5 u/s)», y eso lo cumple igual de bien un jugador que
anda que uno congelado. Es la regla del denominador de la §46 por otra puerta —
allí un 100% sin impactos, aquí un techo sin suelo.

Ahora el banco mide además la **velocidad sostenida** del segundo entero tras
volver, la enseña en su propia columna y la afirma **antes** que el techo: si el
jugador no anda de verdad, el resto de la fila no significa nada.

### Lo que sale ahora

Tres ausencias, los dos brazos, con el motor completo delante:

| | Ausencia | Se queda atrás | Su velocidad | Sostenida | La que ve el rival | Tiempo a >1.5× | Re-anclajes |
|---|---|---|---|---|---|---|---|
| **sin re-anclaje** | 5 s | 296 pasos | **31.2 u/s** | 14.9 u/s | 24.5 u/s | 0.42 s | 0 |
| | 20 s | 1.196 | **31.3 u/s** | 14.9 u/s | 23.9 u/s | 0.43 s | 0 |
| | 60 s | 3.596 | **31.2 u/s** | 15.1 u/s | 23.7 u/s | 0.42 s | 0 |
| **con re-anclaje** | 5 s | 295 | 6.2 u/s | 5.7 u/s | 6.0 u/s | 0.00 s | 1 |
| | 20 s | 1.195 | 5.9 u/s | 5.8 u/s | 6.0 u/s | 0.00 s | 1 |
| | 60 s | 3.596 | 6.2 u/s | 5.8 u/s | 5.9 u/s | 0.00 s | 1 |

Cero correcciones y 0.000 u de error en las seis filas, y **ninguna ventana
descartada por tropiezo** — que era el otro síntoma de la pestaña frenada. Los
números del brazo roto son los de la vuelta 49 (32.9 / 29.6 / 32.9) dentro de su
dispersión, así que lo que se reproduce es el fallo de entonces y no otro.

Y la sostenida del brazo bueno no sale en 6.5 sino en **5.7-5.8**, que es la otra
forma de comprobar que el número es real: la página del duelo sale con la **Rift**
y sus 3.6 kg dan 5.88 u/s. Un jugador andando con el arma que lleva puesta, no una
constante de la tabla.

### Lo que deja dicho

Una suite verde no está verificada por estar verde. Las tres cosas que fallaron
aquí —la muestra que se comía la ventana, la pestaña frenada y el techo sin
suelo— **no producían ni un rojo**; lo que las delató fue mirar el volcado y
preguntar de cuántos frames salía cada número. Y la segunda se arregló sola el
día que se escribió la regla en la §50: lo que faltó fue volver a pasarla por las
suites que ya existían.

## Ronda 58 — Un tercer huésped, y una IP que no comparte nadie

La vuelta que mueve Vektor fuera de Cloudflare. No es una decisión técnica: es
que **el juego no estaba** los días de partido. La evaluación entera, con
candidatos y números, está en `docs/propuestas/03-servidor-con-ip-propia.md`; el
paso a paso del despliegue, en `docs/despliegue-fly.md`. Aquí queda lo que hay
que saber para no deshacerlo.

### El hecho, y la corrección que cambió la forma de la solución

Las operadoras españolas anulan **IPs enteras** de Cloudflare por orden de
LaLiga, **ignorando el SNI**. El SNI es el nombre del dominio y viaja en claro:
con él se podría bloquear un sitio y dejar en paz a los demás que comparten esa
dirección. No se usa. Se bloquea la dirección, y con ella todo lo que haya
detrás.

El encargo daba por hecho que el bloqueo afectaba al tráfico de la partida y no a
servir la página. **Es al revés de como se pensaba: afecta a las dos por igual**,
y eso descarta el arreglo desde dentro de Cloudflare —un dominio propio resuelve
a las mismas IPs compartidas; la IP dedicada es de plan Enterprise—.

Y a cambio **simplifica** la mudanza, que es lo que no se veía: si hay que mover
también la página, la decisión de la vuelta 47 —**un solo origen**— se conserva
entera, y con ella el hecho de que el cliente saque la dirección del WebSocket de
la página en la que está. Mover sólo la partida habría sido lo peor de los dos
mundos: no arregla la página **y** reintroduce una dirección de servidor
configurable, que es justo lo que la 47 quitó.

Consecuencia medible: **el cliente no cambió ni una línea**. Ni `cliente.js`, ni
`transporte.js`, ni `prueba.js`, ni `sala-cliente.js`.

### La premisa, y por qué no se pudo medir desde el repositorio

Toda la propuesta se apoyaba en una cosa: que una IP exclusiva del candidato no
esté bloqueada desde España. **Eso no se puede medir desde un contenedor en la
nube**, y el motivo no es de permisos: el bloqueo lo aplica la operadora **al
tráfico de sus propios clientes**. Desde fuera responde todo siempre, incluido lo
que en Madrid está caído. Un verde medido desde fuera no dice «no está
bloqueado», dice «no estoy donde se bloquea» — el error de instrumento de la
vuelta 49 (medir con `evaluate` desde fuera daba 33 u/s donde la sonda de dentro
daba 6.5) y el de la 57 (la pestaña frenada medía el frenado).

Lo midió Yago, desde su conexión y con el bloqueo activo: **`fly.io` cargó con
normalidad mientras `vektor.vektorbyflicklab.workers.dev` seguía caído**. El
control por delante de la medida, que es lo que le da sentido.

### Lo que se construyó: tres cosas, y ninguna es de juego

`net/servidor.mjs` pasa de 84 líneas a ~390 y deja de ser «el huésped de
sobremesa» para ser el del despliegue.

1. **Encaminar por código de sala.** En la nube lo resolvía `idFromName(código)`
   sin que nadie llevara una lista de partidas; aquí la lista es un `Map` y la
   llevamos nosotros. Hacia fuera no cambia nada: sigue sin haber registro de
   salas ni matchmaking, el código sigue siendo la dirección.
2. **Un reloj por sala**, copiado en forma del Durable Object porque el reloj es
   del huésped por diseño (vuelta 47) y lo que se comparte es la regla, no el
   `setTimeout`. Con la regla de la 47 intacta: **una sala vacía no gasta
   reloj**.
3. **Servir `dist/`**, que es lo que hacía el binding de assets de Cloudflare,
   con las mismas rutas que `worker/index.js` —`/duelo/<código>` sirve la página
   del duelo, un código malo da 400, uno bueno sin WebSocket da 426—.

### Parar el reloj y olvidar el mundo son dos cosas

La más fácil de hacer mal, y la que el Durable Object resolvía sin que nadie se
diera cuenta. `sala47.mjs` [6] exige **dos** cosas a la vez de una sala que se
queda vacía: que el mundo **no avance** (o se paga un reloj que no mira nadie) y
que **el número de paso se conserve**, que es lo que hace que volver a entrar con
el mismo código no sea empezar otra partida.

En Cloudflare eso salía gratis: el objeto se queda en memoria un rato y luego la
plataforma lo desaloja. Aquí el proceso es nuestro y **nadie desaloja nada**, así
que borrar la sala al quedarse vacía rompería la segunda mitad —el paso volvería
a cero— y no borrarla nunca dejaría una sala por cada código que alguien haya
tecleado en la vida del proceso. De ahí `NET.salaOlvidadaMs` (10 minutos): el
reloj para al instante, el mundo se queda, y lo que se olvida es lo que lleva
diez minutos sin nadie.

Medido contra el huésped nuevo: **17 pasos en 5,4 s vacía**, contra los 328 que
habría dado el reloj, y el paso conservado entre visitas (15 → 32).

### Dos cosas que Cloudflare hacía y que ahora hacemos nosotros

- **Comprimir.** Cloudflare gzipeaba de oficio. Un proceso de Node no. El
  paquete son ~900 KB de los que la mayor parte es JavaScript, y **gzip lo deja
  en 179 KB**. En un despliegue donde el tráfico se paga, no comprimir habría
  costado el triple por visita. Se comprime una vez y se guarda en memoria: no
  hay nada que invalidar, porque un despliegue nuevo es un proceso nuevo.
- **Acotar el atraso del reloj.** El huésped de Node **no tenía tope**: apuntaba
  al instante exacto del paso siguiente y, si se atrasaba, daba pasos tan rápido
  como pudiera hasta ponerse al día. En un proceso de sobremesa eso no pasa
  nunca; en un servidor —sin CPU, la máquina dormida— son cientos de pasos de
  golpe y una ráfaga de fotos a los dos clientes. Ahora lleva el mismo
  `SIM.maxFrameDeltaMs` que el motor y que el Durable Object. **Los tres relojes,
  la misma regla**, que es lo que la vuelta 49 dejó escrito y este huésped no
  cumplía.

### Lo que costó: dos pestañas sin código dejaron de caer en la misma partida

Lo cazaron `red45.mjs` y `tiro46.mjs`, que salieron con **0 muestras
comparables**, **0 de 16 disparos** y un acuerdo del **0%** en las cinco
latencias. Nada de eso es de red: es que no había partida que medir.

Las dos abren la misma dirección dos veces (`/net/prueba.html`, servida por
`vite preview`), y esa dirección **no trae código**, así que
`codigoDeLaDireccion` genera uno nuevo **en cada pestaña**. Hasta la 57 daba
igual, y estaba escrito en `net/sala-cliente.js`: «el servidor de sobremesa no
encamina por código: es una sola partida (…) y el servidor lo ignora». En cuanto
el huésped encamina, cada pestaña entra en su sala y no se ven.

No es un fallo del huésped: es que **ese comentario describía un comportamiento
que ya no existe**, y las dos suites se apoyaban en él sin decirlo. La forma de
arreglarlo dice de qué tipo de problema era: las dos ya tenían `VEKTOR_URL`, así
que bastó pasarles la dirección **con el código puesto** (`...#MQXTUV`) y salieron
verdes las dos —22 y 19 aserciones— **sin editar una línea de ninguna**. Un banco
que no dice en qué sala mide no estaba midiendo una sala, estaba midiendo que
sólo había una.

### Cómo se verificó: el listón de la 47, otra vez

La vuelta 47 dio por buena la migración a Cloudflare exigiendo que **los bancos
de las vueltas anteriores pasaran sin cambiar una aserción**. Aquí se exigió lo
mismo, y se llevó un paso más allá: el huésped nuevo se levantó **en el puerto
8787**, el que usaba `wrangler dev`, así que las suites corrieron sin cambiar
**ni la dirección**.

`sala47.mjs` es la que prueba el huésped, y es la que importa: pasó entera, sus
siete bloques, incluido el de la sala vacía y el de que sin `VEKTOR_DEBUG` no hay
forma de teletransportarse.

| Banco | Aserciones | Qué guarda |
|---|---|---|
| `sala47` | 13 | **el huésped**: encaminado por código, 400/426, tercero fuera, sala vacía, `VEKTOR_DEBUG` |
| `jugable48` | 23 | que se puede empezar a jugar, con clics y teclas de verdad |
| `fondo49` | 21 | volver de otra pestaña, los dos brazos |
| `reaparecer50` | 8 | reaparecer se dibuja como un teletransporte |
| `aviso51` | 13 | corte de red de verdad, silencio y `ADIOS` |
| `conexion51` | 2 | 12/12 y 12/12 entrando a la vez en salas nuevas |
| `abatido52` | 15 | un abatido no se mueve ni se dibuja |
| `pausa53` / `pausa54` / `pausa55` | 20 / 20 / 56 | pausa del mundo, topes y votación |
| `motor56` | 39 | el motor completo contra un rival de verdad |
| `red45` | 22 | reconciliación hasta 300 ms de RTT |
| `tiro46` | 19 | disparo con rebobinado, acuerdo tirador/servidor |
| **Total** | **271** | |

Sin cambiar una aserción en ninguno. `pausa55` dio un fallo en la tanda larga
—seis suites seguidas— y pasó las dos veces que se corrió sola; queda anotado
tal cual, sin llamarlo flake, porque el runner truncó la salida y **no se llegó a
saber qué aserción era**. Si vuelve a salir, ahí está lo que hay que mirar.

### Lo que no se tocó

- **`net/partida.js`, ni una línea.** Es el motivo de que esto quepa en un
  fichero y en una vuelta, y viene de haberla sacado del servidor en la 47.
- **El cliente, ni una línea.**
- **`worker/`**, que se queda **como respaldo** unas semanas. Borrarlo es trabajo
  de un minuto el día que haya confianza, y hasta entonces es la red de
  seguridad. Lo que sí cambió de sitio es `ws`: pasa de dependencia de desarrollo
  a dependencia de producción, porque ahora hay producción.

## Ronda 59 — Dos máquinas son dos mundos

Primera prueba real del motor completo en red, entre dos personas y contra el
despliegue de Fly. Síntoma: **los dos jugadores se identifican como `p1` y los
dos salen azules**, con el mismo código en la dirección, y no se ven.

### La hipótesis era el enrutado, y no era el enrutado

Lo que se sospechaba —razonablemente— era que el encaminado por código escrito en
la 58 no estuviera encontrando la sala existente y creara una `Partida` por
conexión. Encaja con el síntoma a la perfección, y por eso había que descartarlo
mirando, no razonando.

**No es eso**, y se demuestra en dos líneas. `_siguienteId` es un contador **de
cada `Partida`** y `equipo` sale de la primera ranura libre, así que dos `p1`
azules **son dos `Partida` distintas**, una por jugador. Dentro de un proceso eso
no puede pasar: `salaDe(codigo)` es un `Map.get` con la clave que devuelve
`normalizarCodigo`, la misma función en los dos extremos.

Medido con dos conexiones crudas al mismo código (`/tmp/ruteo58.mjs`):

| | A | B | |
|---|---|---|---|
| **Un** proceso | `p1` | `p2` | una sola partida — el enrutado encuentra la sala |
| **Dos** procesos | `p1` | `p1` | dos partidas — **el síntoma exacto** |

O sea que el enrutado está bien y lo que hay es **dos procesos**. En Fly, dos
máquinas.

### La causa: `fly deploy` crea dos máquinas por defecto

Por alta disponibilidad, y en cualquier aplicación normal es lo correcto. Aquí
no: **las salas viven en la memoria del proceso**. Dos máquinas sirviendo la
misma aplicación son dos mundos para el mismo código; el reparto de carga manda a
cada jugador a una y cada una crea su sala. La página carga, el código coincide en
las dos pantallas, no hay un solo error por ninguna parte, y el juego no funciona.

**Es un fallo de la guía de despliegue, no del código.** `docs/despliegue-fly.md`
decía `fly deploy` a secas. Ahora dice `fly deploy --ha=false`, con el
`fly scale count 1` para arreglarlo si ya se desplegó, y `fly.toml` lo lleva
escrito en mayúsculas donde se va a leer.

### Lo que deja: el estado en memoria fija el número de máquinas

Es la consecuencia que hay que recordar antes de tocar el despliegue o de
escalar. **Un mundo en memoria no se replica**: mientras las salas vivan en el
proceso, la aplicación es de **una sola máquina**, y eso no es una limitación de
Fly sino de la forma del servidor. Cloudflare lo resolvía sin que se notara
—`idFromName(código)` **es** el encaminado a la instancia— y al salir de ahí esa
pieza se quedó allí sin que nadie la echara de menos, porque con un proceso no
hace falta.

El día que haga falta más de una máquina, lo que hace falta **antes** es
encaminar por código hasta la misma —con `fly-replay` o con lo que sea— y no un
`fly scale count 2`. Queda anotado en el roadmap, donde bloquea el modo de varios
jugadores.

### Y una lección de instrumento: desde fuera esto no se distingue

Dos máquinas y un enrutado roto **producen exactamente el mismo síntoma**, y
ninguno de los dos da un error. Por eso `/salud` dice ahora **qué máquina
contesta** (`FLY_MACHINE_ID`): pedirlo dos veces y ver si el campo cambia
responde la pregunta en un segundo, sin entrar en el código. Un servidor que no
dice quién es obliga a deducirlo.

### Lo que no era un fallo

Del mismo informe venían «no aparece silueta de arma, armería, brújula ni el
resto del HUD». Tres cosas distintas, y ninguna es un fallo:

- **La armería y la silueta del arma no existen en `/duelo`**, y no por olvido:
  la página del duelo es una página aparte desde la vuelta 45 —sin menú, sin
  armería, sin puntuación— y su HUD es el suyo, mínimo. `#armaHud` enseña
  munición y **el nombre del arma en texto**; la silueta trazada con potrace es
  del HUD de React, que esa página no monta.
- **La brújula y la ficha son marcadores sobre un rival.** Sin rival no hay nada
  que dibujar, así que eso era el mismo fallo de arriba visto por otro lado.
- **Todo el HUD del duelo vive bajo `body.jugando`**, o sea sólo con el ratón
  capturado. Sin hacer clic no se ve, y es deliberado (vuelta 48).

Que la armería y la silueta lleguen o no al duelo es una decisión de producto que
no se ha tomado, no un arreglo pendiente.

## Ronda 60 — Lo que se vio jugando

Seis cosas de la primera partida de verdad entre dos personas con el motor
completo. Cuatro son de forma y dos son fallos, y los dos fallos estaban
escondidos detrás de un síntoma que no era el suyo.

### La brújula apuntaba a la espalda del rival

**Dos convenciones de yaw que se parecen lo bastante como para colarse.**
`facing` —lo que gira la brújula— mira a **+Z** con yaw 0, y así lo produce un
muñeco, que lo saca de `Math.atan2(dx, dz)`. Una **cámara** de three.js mira a
**−Z** con `rotation.y` 0, y lo dice el propio movimiento en su cuenta de la
dirección: `forward = (−sin, −cos)`.

O sea que el mismo número significa lo contrario en cada sitio. Con los muñecos
no se veía nunca, porque su `facing` no sale de una cámara; en el duelo de la
vuelta 56 el rival **es** una cámara, y `instancia.facing = pose.yaw` pintaba la
brújula justo al revés.

La conversión vive ahora en una función con nombre (`facingDesdeCamara`) y en el
fichero que define la convención, no como un `+ Math.PI` suelto donde se use.

**Y sólo se podía ver comparando las dos pantallas a la vez**, que es como lo
cazó Yago: mirando una sola, una brújula al revés se lee como un rival que te da
la espalda. El banco lo hace igual —cinco rumbos, el de A leído en la página de
A— y sale **0.0° de desvío en los cinco**.

El cuerpo del rival se queda con el yaw crudo **a propósito**: es un sólido de
revolución, así que su giro no se ve, y ponerle el de la brújula sería afirmar
que tiene frente.

### La mancha de daño no se quedaba por el derribo

Se veía al morir y no tenía nada que ver con morir: **se quedaba desde el primer
impacto de la partida**. Al morir es cuando se nota, porque el último disparo
recibido es el que la deja encendida y ahí ya no llegan más.

La causa es de las que no se ven leyendo la lógica, porque no está en la lógica:

```js
cuna.style.opacity = String(Math.min(1, 0.35 + fraccion))   // ← en línea
cuna.classList.add('puesto')
setTimeout(() => cuna.classList.remove('puesto'), 500)
```

**Un estilo en línea gana a cualquier selector.** Así que ni `#dano { opacity: 0 }`
ni quitar `.puesto` volvían a apagarla nunca: el temporizador funcionaba
perfectamente y no servía para nada. La fuerza del impacto y el encendido se
estaban peleando por la misma propiedad, y la que escribía en línea ganaba
siempre.

Ahora la fuerza va en una variable CSS (`--fuerza`) que sólo tiñe el gradiente, y
**la opacidad la manda la clase**, que es lo que el temporizador sabe quitar.

### Escape abre el menú; pausar es un botón

Desde la 53 soltar el ratón **pedía la pausa solo**. La idea era buena y cerraba
un agujero real —que el mundo siguiera corriendo con el menú puesto— pero el
precio se vio a la primera partida: abrir el menú para mirar el código, copiar el
enlace o teclear otro **gastaba una de las tres libres** sin que nadie la hubiera
pedido, y no había forma de abrirlo sin pagarla.

Lo que la 53 arregló de verdad sigue en pie, y era lo que importaba: **soltar el
ratón suelta las teclas**, así que con el menú abierto no se anda. Medido otra
vez en esta vuelta: 0.39 u contra los 7.8 de antes.

Lo que se acepta a cambio: el mundo sigue corriendo mientras miras el menú, o sea
que ahí eres un blanco. Es el mismo trato que la votación de la 55 y por la misma
razón — **pausarle la partida al rival no puede ser el efecto secundario de un
gesto tuyo**.

Y una cosa que costó encontrar al construirlo: el botón sólo se pintaba en
`onPausa`, que avisa de los **cambios** de estado. Al empezar una partida no ha
habido ninguna pausa todavía, así que no se llamaba nunca y el botón se quedaba
con el `hidden` del HTML. Con el de votación no se había notado: ése sólo hace
falta cuando se agotan las libres, y agotarlas **es** un cambio.

### Los ajustes sí se guardaban, y aun así se perdían

La causa raíz no estaba donde parecía. **El store funciona**: se comprobó
escribiendo las 17 claves con valores distintos, recargando y comparándolas una a
una — **17 de 17 sobreviven**. (Las tres primeras «pérdidas» de esa medida eran
del instrumento: dos catálogos que me inventé y el paso de 0.01 del deslizador.
La regla del denominador aplicada a uno mismo.)

Lo que sí estaba mal era otra cosa, y explica el síntoma: **la página del duelo
le reescribía al jugador su escenario guardado en cada visita**. Hacía
`updateSettings({ scenario: 'largoYPuerta' })` al cargar, porque el motor lee el
mapa de los ajustes, y eso son las preferencias de una persona usadas como
variable de trabajo de una página. Dos precios, los dos callados: el ajuste
cambiado, y el mapa colgando del store —así que tocar cualquier ajuste en mitad
de un duelo reconstruía el escenario **en caliente**—.

El escenario de una partida no es una preferencia de nadie: ahora el motor lo
recibe al construirse (`new Engine(lienzo, callbacks, { escenario })`) y el store
no se toca.

Y queda una tercera causa que no es del código y conviene tener escrita:
**`localStorage` es por origen**, así que la mudanza de la vuelta 58 —de
`workers.dev` a `fly.dev`— dejó atrás todo lo guardado. Una vez.

Lo que se ha añadido para que esto no vuelva a ser un misterio: **si el navegador
no deja guardar, el panel lo dice**. El `try/catch` que se lo tragaba era
correcto —sin persistencia se juega igual— pero desde fuera era indistinguible de
un juego que pierde los ajustes por su cuenta.

### La música se retira entera

No se baja a cero: se va. Módulo, ajuste, fila del panel, llamadas y sección del
README. Lo que deja son las dos trampas del contexto de audio, que ahora viven
donde todavía hacen falta (`samples.js`): que el contexto no arranca sin gesto y
`resume()` es asíncrono, y que `disposeAudio()` cierra el contexto, así que se
guarda *sobre qué contexto* se estaba esperando.

La clave `musicVolume` que quede en el `localStorage` de quien ya jugó se cae
sola en el primer guardado: es exactamente lo que el saneado hace con cualquier
clave que el catálogo ya no conoce.

### Las pisadas de los demás

Estaban aparcadas «hasta que hubiera multijugador», y ya lo hay. Tres decisiones:

- **Son de los demás, y de nadie más.** El jugador no oye las suyas: no dirían
  nada que no sepa —está pulsando la tecla— y taparían justo lo que estas
  pisadas vienen a dejar oír. Es la regla del silbido de la vuelta 40.
- **Una zancada es un trozo de suelo, no un intervalo de tiempo.** Así agacharse
  o andar bajan el ritmo solos, sin una segunda tabla de cadencias. Por tiempo,
  un agachado pisaría igual de rápido que uno corriendo, que es como se oye que
  un sistema de pisadas es falso.
- **Agachado suena, pero poco.** Un sigilo perfecto convertiría agacharse en la
  única forma de moverse, y lo que tiene que costar es la velocidad.

Y dos cosas que costaron medirlas, las dos de relojes y sondas:

- **La pose del rival se mueve con el frame; este código corre dentro del paso de
  mundo.** En un frame que gasta dos pasos, el segundo ve exactamente la misma
  pose que el primero, y dividir el avance de un frame entre un paso infla la
  velocidad. Con frames largos —un contenedor con dos navegadores y dibujado por
  software— la inflaba por encima del techo del aire, así que el guardia de
  teletransporte borraba la cuenta en cada frame: medido, **cero pisadas con el
  rival andando de verdad**. El reloj de esto es el de pared, que es el que mueve
  lo que se está midiendo.
- **Y una zancada se mide contra dónde se dio la última, no sumando frames.** El
  rival se interpola entre fotos y esa trayectoria tiembla: sumando el avance de
  cada frame el camino sale más largo que el recorrido. Medido, **11 pisadas en
  13.3 u** con una zancada de 1.9 — media docena de sobra. Contra la posición de
  la última: **6 en 13.4 u**, que es justo lo que toca.

### Lo que costó: tres medidas falsas seguidas, y todas del banco

Vale la pena dejarlas escritas porque las tres son de método:

- **Un error de página es un fallo, no una línea de registro.** Un
  `FOOTSTEPS is not defined` produjo **318 errores** durante una tanda entera y
  las **seis suites salieron verdes**. El motivo es que `_loop` reprograma el
  frame siguiente **antes** de trabajar, así que una excepción por frame no mata
  el bucle: degrada en silencio. El banco de esta vuelta cuenta los `pageerror` y
  falla con ellos; las demás suites los imprimen y siguen, y eso es deuda.
- **El huésped cachea `dist/` en memoria**, así que reconstruir con el servidor
  levantado no cambia nada de lo que se sirve. Está escrito en `CLAUDE.md` desde
  la vuelta 58 y aun así caí: la tanda entera corrió contra el bundle roto. Hay
  que reiniciar el proceso.
- **Y la premisa, siempre.** El rival «no pisaba» porque andaba **contra el muro
  de aparición**: 0.9 u en 2.2 segundos. Y el emisor posicionado **no pasa por el
  máster**, va por el listener, así que medir amplitud allí daba 0 con las
  pisadas sonando. Dos ceros seguidos, ninguno del código.

## Ronda 61 — El retroceso es una fuerza, no una animación

Un fallo de una sola línea con un síntoma que apuntaba a otra parte.

### Lo que se veía y lo que era

Manteniendo el gatillo en automático **sin tocar el ratón**, el arma dibujaba su
patrón de retroceso y hacia el disparo 15-18 se quedaba clavada: el resto del
cargador salía por el mismo punto, como un láser. Desde la silla se lee como que
**el arma se controla sola** — que es exactamente lo que no puede pasar en un
juego donde controlar el patrón es la habilidad.

La sospecha razonable era una recuperación disparándose con el gatillo apretado.
**No existe ninguna**: `applyRecoil` suma a la rotación y lo dice en su cabecera
desde que se escribió —«no hay recuperación: el retroceso se queda donde deja la
mira»—, y la mira nunca vuelve sola.

Lo que había era la otra mitad de la sospecha: **el patrón se aplicaba como una
animación con final**.

```js
// Agotado el patrón, el retroceso se queda en su techo y deja de crecer.
if (this._sprayIndex >= pattern.length) return
```

Y los números lo cuentan solos:

| Arma | Cargador | Pasos de patrón | Disparos con retroceso **cero** |
|---|---|---|---|
| Rift | 30 | 15 | **15** |
| Volt | 25 | 15 | **10** |
| Pulse | 18 | 0 | 18 *(semiautomática y sin retroceso, a propósito)* |

Media ráfaga de la Rift salía sin empuje ninguno. No era un techo alto: era
**medio cargador sin retroceso**.

### El arreglo: la subida se acaba, el vaivén no

El patrón describe dos cosas distintas pegadas: los primeros pasos son **la
subida**, que es de una vez, y la cola es **el vaivén**, que no tiene por qué
acabarse nunca. Agotado el patrón se vuelve a `recoilLoopFrom` y se recorre la
cola en bucle mientras el gatillo siga apretado.

Dónde empieza la cola es tuning y vive en `config.js`, por arma. **Que el
retroceso no pare es la regla**, y por eso sin declarar el número la cola es el
último paso: un arma nueva a la que se le olvide nunca se queda quieta.

Lo que no se ha tocado: la mira **sigue sin volver sola**, ni con el gatillo
suelto ni con él apretado. Compensar es del jugador y sólo del jugador.

### Y por qué el control no podía ser binario, ni lo era

El encargo pedía además que compensar bien en la bala 14 no comprara las
siguientes. Eso ya se cumplía por construcción y conviene dejar escrito por qué,
para no «arreglarlo» algún día: el retroceso **suma** a la rotación de la cámara
igual que lo hace el ratón, así que no hay ningún estado de «controlado» que se
resuelva una vez. Lo que fallaba no era el modelo, era que el empuje desaparecía.

### Y el huésped sirviendo un build viejo, otra vez

`recoil61` salió **rojo** al pasar la regresión, con exactamente los números de
antes del arreglo: **15 de 30 disparos sin empuje** y la mira acabando a 7.65°.
Parecía que el arreglo se hubiera deshecho.

No se había deshecho: **el huésped estaba sirviendo el bundle anterior**. Los
ficheros se cachean en memoria al arrancar, así que un `npm run build` por debajo
no le cambia nada a un proceso ya levantado. Está avisado en `CLAUDE.md` desde la
vuelta 58 —lo escribí yo— y aun así ha costado dos vueltas, la segunda en forma
de banco en rojo que parecía una regresión del juego.

Lo que lo delató no fue leer código, fue preguntar **qué está sirviendo**: el
bundle cacheado tenía `_escenarioFijo` (vuelta 60) y no tenía `recoilLoopFrom`
(vuelta 61), o sea que era de justo entre las dos. Eso, de paso, dice que el
resto de la tanda es válido: ninguna otra suite prueba el retroceso.

**Ojo con grepear un bundle minificado**, que casi me lleva por otro camino: de
los cuatro nombres que probé sólo dos significaban algo. `_escenarioFijo` y
`recoilLoopFrom` sobreviven porque son **accesos a propiedad** y el minificador no
los puede renombrar; `facingDesdeCamara` y `FOOTSTEPS` salían a cero por estar
renombrado el uno y en línea el otro, y eso no dice nada de si están.

**El arreglo es que deje de depender de acordarse.** `/salud` dice ahora **qué
build sirve** —los nombres de los assets, que Vite genera del contenido, leídos
del disco **al arrancar**, que es cuando queda fijado lo que ese proceso servirá—
y el corredor de bancos lo compara con `dist/` y **se niega a medir** si no
coinciden. Es la misma idea que el `maquina` de la vuelta 59: un servidor que no
dice quién es obliga a deducirlo.

### Y un vano no es un área

Añadir el botón de «Pausar» al menú del duelo (vuelta 60) hizo caer **tres
bancos** —`pausa53`, `motor56` y los que van detrás— y ninguno por el motivo que
parecía: el clic con el que capturan el ratón apuntaba al centro-abajo de la
pantalla, y ahí ahora hay un `.control`, donde un clic **no captura a propósito**
desde la vuelta 48. Los síntomas eran de lo más variado —«A está jugando» fallando
como premisa, «se mueve a velocidad de carrera (0.00 u)»— y el arreglo es mover el
clic a una esquina.

Al medir si eso era además un problema de producto salió primero un **97% de la
pantalla ocupada** a 700×460, que asusta. Y es la trampa de siempre: eso es el
**vano** entre el borde de arriba del primer control y el de abajo del último, no
el área. Preguntándole al navegador punto por punto cuál captura el ratón
(`elementFromPoint`), lo que queda libre es el **70.5%** a 700×460, el 76.7% a
820×520 y el **91%** a 1280×800. El menú es una columna estrecha con huecos, y no
estorba a nadie que quiera empezar a jugar.

La regla, que es la misma de la vuelta 46 con otra ropa: **un alto no es un área**,
y cuando lo que se quiere saber es «¿se puede pinchar aquí?», se le pregunta al
navegador en vez de deducirlo de una caja.

### Y un banco de red se mide solo

La regresión de esta vuelta salió con `red45` y `tiro46` en rojo, y los dos por
lo mismo: se lanzaron **a la vez que otras suites**. Cada banco de red abre dos
navegadores con WebGL por software, así que cuatro o seis páginas a la vez se
quitan frames entre ellas — la propia tabla de `red45` lo dice, porque mide los
fps del cliente: **22 fps** en la tanda en paralelo contra los 26 corriendo solo,
y 32 y 50 en las tandas antiguas que salieron verdes.

Lo que falla entonces no es una aserción cualquiera, son justo las dos que miden
un margen de tiempo: en `red45`, cuánto infla el RTT la cola del servidor (+485
ms contra el tope, +353 ms corriendo solo); en `tiro46`, cuántos disparos entran
en el escenario de más latencia, que es donde el rebobinado ya está topado
(6 de 16 en paralelo, 14 de 16 solo). Las dos son verdes por un pelo en
condiciones normales **a propósito**: miden el peor caso.

Es la misma familia que «un jugador por navegador» de la vuelta 50 —la carga de
al lado se lee como un fallo del código— con el alcance subido un nivel: **una
suite de red por contenedor**. Y la forma de no confundirse es la de siempre:
antes de creerse un rojo, mirar el denominador que el propio banco imprime. Los
fps estaban en la tabla las dos veces.

### Lo que sale medido

Con la Rift, cargador entero en automático y sin tocar el ratón (`recoil61.mjs`,
sonda dentro de la página y **una muestra por disparo**, no por frame):

- **0 disparos de 29 sin empuje**, contra los 15 de antes.
- **0.573°/disparo** de media en la primera mitad del cargador y **0.307°** en la
  segunda: sigue empujando, con menos fuerza, que es lo que tiene que hacer una
  cola.
- La mira acaba a **10.43°** de donde empezó, o sea que no se autocentra.
- Y tras compensar a mitad de ráfaga, los 12 disparos siguientes empujan todos
  (0.304° de media): el control reacciona a cada disparo.

Aritmética sobre los mismos datos: el cargador entero de la Rift pasa de 7.19° de
pitch y 2.62° de yaw a **8.39° y 7.06°**. Los números son un punto de partida y
**se calibran jugando**, como el resto del arsenal.

## Ronda 62 — La Rift suena a disparo

### Lo que se oía

«Demasiado suave, tipo gota de agua, y a bajo volumen.» El diagnóstico estaba en
la descripción: una gota de agua es **un ataque en rampa y una cola con tono**, y
eso es literalmente lo que hacía el perfil `normal` — el transitorio de ruido
subía en 2 ms, el cuerpo en 3, y ese cuerpo era un triángulo cayendo de 210 a
80 Hz durante 55 ms. Un disparo no tiene nada de eso: entra de golpe y se acaba.

### La voz seca, y por qué cada capa

Tres capas que atacan a la vez, ninguna sostenida:

1. **Crack.** Ruido por un pasa-**altos** a 2.6 kHz, 24 ms. Con pasa-banda —lo
   que había— queda una nota; lo que se lee como «crack» es la banda ancha.
2. **Metal.** Dos dientes de sierra en relación **1.48** por un saturador `tanh`
   y un pasa-banda, 70 ms. La relación es lo que importa: 2 (octava) o 1.5
   (quinta) suenan a instrumento. El `tanh` satura sin esquinas, así que añade
   armónicos sin el zumbido de un recorte duro.
3. **Cuerpo.** El golpe grave, **32 ms** contra los 55 de antes. La sequedad se
   pierde por abajo, no por arriba.

Y en la silenciada, una cuarta que la normal no tiene: el **cerrojo**, ruido de
banda estrecha **retrasado 12 ms**. Un supresor no baja el volumen de todo por
igual: se lleva la onda de boca —el grave y el crack— y deja el mecanismo, que
suena *después* de la detonación. Ese hueco es lo que se oye como una máquina.

El ataque es de **0.6 ms**, que no es cero a propósito: un escalón exacto es un
salto de continua y suena a «pop» de altavoz.

### Lo que no se ve al leerlo

- **La curva del saturador se cachea por `drive`.** Son 2048 puntos y el
  automático dispara diez veces por segundo.
- **La clave del arma viaja hasta la síntesis.** `samples.js` ya la tenía —la usa
  para buscar la muestra grabada— y no se la pasaba a `playShot`. Ahora sí, y de
  ahí sale que una voz nueva sea una clave nueva.

### Lo que sale medido

Desde el juego: se captura el ratón, se dispara con el botón y se lee la salida
del máster muestra a muestra. El A/B es la **Pulse**, que conserva el perfil
clásico —o sea, el que tenía la Rift— en la misma tanda y con el mismo máster.

| | pico | cola a −40 dB | centroide del ataque | grave/agudo |
|---|---|---|---|---|
| Rift (voz nueva) | 0.4085 | 30 ms | 1894 Hz | 0.18 |
| Pulse (voz de antes) | 0.1146 | 27 ms | 1291 Hz | 0.51 |
| Rift silenciada | 0.1107 | 27 ms | 2204 Hz | 0.02 |
| Pulse silenciada (antes) | 0.0380 | 37 ms | 825 Hz | 1.88 |

**+11.0 dB** la normal y **+9.3 dB** la silenciada, sin acercarse a saturar
(0.41 de 1.0). El centroide es lo que separa «metálico» de «fuerte»: un grave
subido de volumen sube el pico y no mueve el centroide.

### Y la sonda, que hubo que arreglar antes de creerse nada

El pico de la Rift salió **0.3322 y 0.1390 en dos tandas seguidas sin haber
tocado ese perfil**. No era el sonido: era el instrumento. La sonda leía el
máster con un `ScriptProcessor` de 256 muestras —188 llamadas por segundo— y el
contenedor pierde bloques; perder el del ataque parte el pico por la mitad.

Se arregla por los dos lados: bloque de **4096** (12 llamadas por segundo),
**cinco disparos y la mediana**, y la cuenta de capturas completas impresa en la
propia fila. Con eso los cinco picos salen 0.409 clavados. Es la regla de la
vuelta 46 aplicada al audio —una medida necesita que se vea de cuántas sale— y la
de la 57 —una suite verde no está verificada por estar verde—.

## Ronda 62b — Rondas, condición de victoria y reconexión

### Dos condiciones de victoria, y por eso dos funciones

Una **ronda** se gana matando o llegando al final con más vida. Una **partida**,
con la mayoría de las rondas. Meterlas en la misma función habría sido el error
clásico: la ronda que da la octava victoria es *a la vez* un final de ronda y un
final de partida, y con una sola salida acaba habiendo un `if` que decide de qué
tipo es el final. Son `_terminarRonda` y `_terminarPartida`, y la primera llama a
la segunda a través de `_comprobarFinDePartida` — que es donde vive la única
pregunta que hay que hacerse después de cada ronda.

### El reloj de una ronda es el número de paso

No es un detalle de implementación: es la diferencia entre que una pausa de dos
minutos se coma una ronda entera o no se note. `hastaPaso` es un número de paso,
y en pausa el paso no sube (regla de la vuelta 53), así que la cuenta se para
sola sin que nadie la pare. Lo que viaja en la foto es **cuánto queda**,
calculado por el servidor, por lo mismo que la cuenta de la pausa desde la 54:
los relojes de las dos pantallas y el suyo no coinciden.

Las dos cuentas que **sí** van por reloj de pared siguen yendo: la pausa y la
votación, que son de la conversación y no del mundo. Y ahora una tercera, por la
misma razón: la ventana de reconexión, que tiene que correr justo mientras el
mundo está parado.

### El empate que se repite, y lo que acepta

«Si están exactamente igualados, la ronda no cuenta para nadie y se repite» tiene
una consecuencia que no es un fallo: **una ronda repetida no gasta número**, así
que dos jugadores que no hagan nada pueden repetirla indefinidamente. Se acepta a
propósito. La alternativa —medio punto para cada uno, o darla por perdida a
alguien— inventa un resultado donde no lo hubo, que es peor que un bucle que sólo
se produce si nadie juega.

### La prórroga va por tandas

`ROUNDS.prorrogaTanda` es 2. Con muerte súbita, las trece rondas anteriores
valdrían exactamente lo mismo que la catorceava, y una partida de tres cuartos de
hora se decidiría en un intercambio. A 1 queda muerte súbita, que es el único
cambio que hay que hacer si algún día se decide lo contrario.

### La fase de compra: dos mecanismos, no uno

«Confinados a una zona delimitada y en ningún momento pueden verse» son dos
cosas distintas y se resuelven por separado.

**El confinamiento vive en `movement.js`**, que es el módulo que ejecutan los dos
extremos. Ponerlo sólo en el servidor habría sido una corrección por paso contra
una pared invisible: el cliente predice su propio movimiento, así que si no
conoce el límite, cruza y el servidor lo devuelve. Es la convención de siempre
—una sola fuente de verdad para lógica compartida— aplicada a un límite nuevo. El
módulo no sabe qué es una fase de compra: recibe cuatro números.

**Y no verse no es no dibujar: es no recibir.** Durante la compra la foto sale
por destinatario y sólo lleva al que la recibe. La alternativa —mandar las dos
posiciones y que el cliente no pinte la del rival— deja la promesa en manos del
cliente, que es el único sitio donde se puede romper. Cuesta un `stringify` de
más durante quince segundos de cada ronda.

**Lo que no trae es comprar.** No hay economía —sigue fuera de alcance, sin
precios ni dinero— así que hoy la fase es la ventana para elegir con qué sales
con las teclas de siempre. Está anotado aquí para que quede claro que es una
pieza que falta y no una que se olvidó.

### Un cambio de fase tira la cola sin confirmar

Un reinicio de ronda es un teletransporte que decide el servidor. La
reconciliación, después de colocar la pose autoritativa, **reejecuta las entradas
que el servidor todavía no ha visto**; esas entradas son de antes del reinicio, y
reejecutarlas encima del sitio de salida saca al jugador andando de su propia
caja. Se tiran en `_leerRondas`, que por eso corre **antes** de reejecutar nada.

Es la otra cara de la vuelta 52: una reaparición individual **sí** se predice
—cuelga del reloj de entradas de su víctima— pero un reinicio de ronda es un
evento compartido y no puede vivir en el reloj de nadie en particular.

### Caerse no es irse, y sólo se distinguen si irse se dice

Es la regla de la vuelta 51 llevada hasta el final: **un cable que se corta no
manda ningún mensaje**. `close` es `close` venga de un wifi que se va o de una
pestaña que se cierra, y ninguna propiedad del socket los separa. Así que el
abandono se **dice** (`MSG.ADIOS` del cliente) y la caída es el silencio.

**El valor por defecto es el que menos duele si nos equivocamos**, y la asimetría
es clara: dar por abandonado a quien se le fue el wifi le quita una partida que
no había perdido; dar por caído a quien cerró la pestaña sólo hace esperar al
rival — y ni eso, porque puede cerrar la ventana él.

De ahí salió un error que sólo se ve probándolo: la primera versión mandaba el
adiós también en `pagehide`, para cubrir «cerrar la pestaña». Pero el navegador
dispara ese evento **igual al recargar**, y recargar es exactamente como se
vuelve a una partida: con eso puesto, **reconectar era abandonar**. Se quitó. Una
pestaña cerrada es una caída como cualquier otra, y si no se vuelve acaba en
abandono igual, noventa segundos después.

### El ping es del huésped, no del protocolo

Un portátil que se duerme no produce `close` hasta que TCP se rinde, que son
minutos. El `ws` del huésped lleva ping/pong cada `NET.pingMs` y cierra el socket
tras dos intervalos mudos. Va ahí y no en `partida.js` por la regla de la vuelta
47 —el huésped pone el reloj y el cable— y encaja con la de la 46: la partida no
pregunta por el estado del cable, se entera de que se cerró. El Durable Object de
Cloudflare no lo tiene; es respaldo desde la 58 y se anota como deuda.

### Noventa segundos, y un botón a los quince

El número sale de la escala que ya existía en `PAUSE`: una pausa libre dura 120 s
y una votada 60, y esa diferencia está puesta porque *el que dice que sí paga un
rato parado que no ha elegido*. Una caída no la elige nadie, así que va por
debajo de la libre; y recargar la página son diez o veinte segundos, desbloquear
un PC entre treinta y sesenta. Noventa cubre lo segundo con margen.

Y el que espera no queda secuestrado: a los quince segundos le sale el botón de
dar la partida por abandonada. Es la regla de la vuelta 55 por el otro lado —el
mundo parado de uno no puede ser efecto secundario de lo que le pase a otro—.

### El pase, y por qué va en la dirección

La butaca guarda vida, rondas, ranura y arma. Sin un secreto, la de quien se cae
se la queda cualquiera que tenga el enlace, **empezando por su rival**. El pase
lo da la bienvenida y viaja en la dirección del socket (`?pase=…`) y no en un
mensaje, porque la butaca se decide en `entra()` — antes de que haya llegado
ninguno.

Lo guarda **la página**, no el netcode: dónde se guarda algo entre dos visitas no
es del cliente de red. Y el botón «Reconectar» sale en la página del duelo y no
en la pantalla de inicio del juego, que no sabe que existe la red (vuelta 45).

### El cartel que tapaba la pantalla entera sin verse

El cartel de fin de partida se escribió como el de abatido —sin `display` en su
regla base, sólo en la de `.puesto`— y ahí está la trampa: el de abatido está
**además** en el grupo de capas que se apagan sin ratón capturado, y éste no
puede estarlo, porque sale justo cuando se ha soltado el ratón. Sin ese
`display: none`, el cartel se queda en `block` a pantalla completa: invisible
—no tiene contenido que pintar— y por encima de todo, comiéndose el clic que
captura el ratón.

Lo cazó `jugable48` a la primera, y con un mensaje que lo decía entero:
`<div id="fin">…</div> intercepts pointer events`. Es la misma familia que la
nota de la vuelta 48 sobre las dos reglas con un id cada una.

### La butaca que dejaba la sala llena para nadie

Reservar la butaca de quien se cae tiene un final que no es evidente: **la pausa
que la caduca sólo corre mientras hay un paso que la mire**. Si se van los dos,
el huésped para el reloj —una sala vacía no gasta reloj, regla de la 47— y las
dos butacas se quedan congeladas hasta que la sala se olvide, diez minutos
después. Mientras tanto la partida dice que está llena y contesta «la partida
está llena (1v1)» a quien entre, incluidos los mismos que acaban de salir.

Lo cazó el depurador antes que ningún banco: dos ejecuciones seguidas del mismo
probador, y la segunda no conseguía entrar. Se arregla por tres sitios, y los
tres hacen falta:

- **Al entrar se caducan las butacas**, con el reloj de pared. Es el momento en
  que a alguien le importa, y funciona con la sala parada.
- **Sin partida en marcha no se reserva nada.** Caerse con la partida acabada o
  sin empezar suelta la butaca entera: no hay a qué volver.
- **Y una sala sin butacas reinicia el marcador** —no el número de paso, que es
  del mundo—, o dos amigos que vuelven a su código se encontrarían una partida
  terminada y sin forma de jugar otra.

De paso se vio lo que costaba de verdad: **casi todos los rojos de la regresión
salían de aquí**, no de las rondas. Los bancos corren seguidos sobre el mismo
código de sala, así que el segundo entraba con una silla ocupada por un fantasma
y medía un duelo de uno — «sin rival», «2 de 2 disparos», doce fallos de doce.

### Y los bancos de netcode necesitan un mundo que no se reinicie

`red45`, `tiro46`, `ux60`, `reaparecer50` y las tres de pausas miden
reconciliación, compensación de retraso y marcadores **matando al mismo blanco
una y otra vez**. Con rondas, cada muerte abre quince segundos en los que no se
dispara: la tabla no sale mal, sale **vacía**, que es peor.

Así que el huésped tiene un interruptor más, hermano de `VEKTOR_DEBUG`:
`VEKTOR_RONDAS=0` deja el duelo como estaba hasta la 61. No es un modo de juego,
es lo mismo que `MSG.COLOCAR`: una puerta para poder medir. Lo que sí se juega a
rondas se mide con `rondas62` —que conduce `Partida` directamente, sin navegador,
porque ahí no hay una línea de red— y `duelo62`, dos navegadores contra el
producto. Y `/salud` publica los dos interruptores, así que un banco puede
comprobar contra qué mundo mide en vez de suponerlo.

### El menú del duelo, que ha crecido dos veces

En la 60 le entró el botón de pausar y en la 62 el de salir: **508 px** de alto,
contra los 460 de una ventana pequeña. El último botón cae fuera y no hay forma
de pulsarlo — `pausa55` murió intentando, con un «element is not visible» que no
se parece en nada a la causa.

La vuelta 61 ya arregló esto una vez recortando píxeles. Esta vez se cierra de
raíz, por los dos lados: **salir pasa a la fila de pausar** —no es la acción de
esta pantalla, así que va pequeño y al lado— y **el menú se desplaza si no
cabe** (`overflow-y: auto`), con `place-items: safe center`, que es lo que evita
que al desbordar se corte por arriba en vez de por abajo.

Y se mide preguntándole al navegador **si un clic en el centro de cada botón le
llega a ese botón** (`elementFromPoint`), no calculando alturas: es la lección de
la 61 —un vano no es un área— convertida en banco (`menu62.mjs`), a cuatro
tamaños de ventana y con una quinta a 700×300 que comprueba que, cuando de
verdad no cabe, se puede desplazar.

### El ratón que no se dejaba recuperar

`pausa55` se quedó en rojo en una sola aserción —«volver a pinchar la levanta»—
y detrás había **dos fallos del producto**, ninguno de esta vuelta.

El primero: `requestPointerLock({ unadjustedMovement: true })` se **rechaza** en
las plataformas que no lo admiten —este contenedor, sin ir más lejos— y el
rechazo llega en una promesa, un turno después. Para entonces el gesto del
usuario ya se ha gastado, así que el reintento de dentro del `catch` sale
denegado **sin decir nada**. Se arregla recordando que no está y no volviendo a
pedirlo: un clic perdido la primera vez y ninguno después.

El segundo, y el de verdad: `pintarPausa` soltaba el ratón con «si la pausa es
mía y lo tengo, suéltalo», y eso corre **cada vez que cambia algo del bloque de
pausa**. La cuenta de pausas libres llega una foto *después* de la pausa, así que
el repintado volvía a soltar el ratón que el jugador acababa de recuperar, con la
pausa todavía puesta —levantarla cuesta un viaje—. Resultado: **el jugador no
podía recuperar el ratón**, y como el clic es justo el gesto con el que se
reanuda, tampoco podía reanudar. Medido con la sonda: cinco clics en diez
segundos, ninguno se queda.

Lo que lo delató no fue leer el código sino **preguntarle al navegador quién
soltaba el ratón**: envolver `exitPointerLock` y pedir la pila. La respuesta cabía
en una línea —`at onPausa ... at _leerPausa`— y hasta ahí todas las hipótesis
—el enfriamiento de Chrome, el punto donde caía el clic, el cartel de la pausa
tapando— eran razonables y las tres estaban equivocadas.

La regla, que es la de la vuelta 55 escrita con más cuidado: **una pausa tuya te
suelta el ratón al llegar**, no mientras dure.

### Y el sello del build no miraba las páginas

La huella que `/salud` publica desde la 61 listaba `dist/assets`, donde Vite
pone un hash del contenido en cada nombre. Pero **los `.html` se llaman siempre
igual**, y el CSS del duelo vive dentro de `net/prueba.html`: arreglar una regla
de estilo y no reiniciar el huésped daba una huella **idéntica** con la página
vieja servida, que es justo el falso negativo que la huella existe para cerrar.
Ahora la huella lleva además un sha1 corto de cada página.

## Ronda 63 — El carril de audio, entero

La vuelta 39 abrió una sola puerta a los ficheros: el **disparo**. Esta la abre
del todo para lo que se graba de un arma —**disparo, disparo silenciado y
recarga**— más el **cargador vacío**, que no es de ningún arma. Lo que no cambia
es la regla que sostenía aquella puerta, y por eso esta vuelta **no toca
`sfx.js`**: la síntesis sigue entera, la Rift incluida.

### La síntesis es el suelo, y el suelo de la recarga es el silencio

Un disparo sin muestra suena sintetizado. Una recarga sin muestra **no suena**,
que es exactamente lo que hacía hasta hoy: recargar nunca ha tenido voz. La
tentación era inventarle un chasquido de emergencia, y es peor que el silencio —
diría «tu arma ha hecho algo» sin decir qué, y con tres armas de recargas muy
distintas (1200, 1800 y 2300 ms) el mismo clic mentiría en dos de las tres.

De ahí que `samples.js` tenga **dos voces y no una**: `playWeaponShot` cae a la
síntesis y `_tocar` no cae a ninguna parte. Meterlas en la misma función con un
respaldo opcional habría dejado el respaldo como un parámetro, o sea como algo
que quien llama elige — y lo que este módulo garantiza desde la 39 es justo lo
contrario: **quien dispara no elige ni tiene que saberlo**.

### Tres formatos, con preferencia, y el aviso cuando hay dos

El importador aceptaba `.mp3` y nada más. Un WAV de 48 kHz es lo que sale de una
mesa, y pedir que se convierta antes de poder oírlo en el juego es poner un paso
manual entre el sonido y la decisión de si vale. Ahora entran `.mp3`, `.ogg` y
`.wav`, **en ese orden de preferencia**: si el mismo sonido está en dos
formatos gana el comprimido y el script lo dice, porque lo que se sirve va en el
build y nadie debería acabar sirviendo el pesado sin enterarse. Por encima de
1.5 MB de audio servido, avisa.

### Lo que no es de un arma no va en la carpeta de armas

El cargador vacío suena igual lleves lo que lleves, así que vive en
`Reference/Audio/comunes/gatillo-seco.<ext>` y sale al manifiesto en
`COMMON_SAMPLES`, su propio espacio de nombres. Meterlo en `weapons/` habría
pedido una clave de arma que no existe, y la validación contra `WEAPONS` —que es
lo que caza un nombre mal escrito— habría tenido que llevar una excepción.
Si algún día el seco es distinto por arma, su sitio es `weapons/<arma>-seco` y
este carril se queda de respaldo.

### Dos formas de volver atrás, porque son dos preguntas distintas

- **«Esta muestra no encaja»**: se saca su fichero de `Reference/` y se vuelve a
  pasar `npm run audio:weapons`. El manifiesto **es** la lista de lo que hay, así
  que quitar el fichero es quitar la muestra, y ese sonido vuelve a su suelo sin
  tocar una línea de código.
- **«Las muestras no encajan»**: `AUDIO.samplesEnabled: false`. No se pide ni se
  decodifica nada y todo suena como antes de que hubiera un fichero.

Es un booleano de código y no un ajuste del panel a propósito: esto sirve para
decidir si las muestras se quedan, no para que el jugador lo elija cada vez. Y
las dos vueltas atrás funcionan **porque la síntesis nunca se sustituyó**. El día
que se borre `sfx.js` para «quitar lo que ya no hace falta», estas dos puertas se
cierran juntas.

### El LEEME de la carpeta llevaba dos vueltas mintiendo

Decía `scalar-2.mp3`, `axis-7.mp3` y `vertex-9.mp3` —los nombres de antes de la
vuelta 41— y que el Axis-7 no admitía silenciador, cuando las tres lo admiten
desde entonces. Nadie lo vio porque la carpeta estaba vacía: **una guía que no se
usa no se corrige sola**. Un fichero con la clave vieja no habría fallado con un
error, habría sido un aviso en la consola del script y una muestra que no suena
nunca. Es el mismo tipo de agujero que `LEGACY_WEAPON_KEYS` cierra para los
ajustes guardados, por la puerta de la documentación.

## Ronda 63b — La síntesis se queda, y las pisadas se callan

### Diez muestras probadas, diez muestras fuera

El carril de la vuelta 63 se llenó: los tres disparos, sus tres silenciados, las
tres recargas y el gatillo en seco, grabados y a 48 kHz. Se probaron en juego y
se descartan. **El motivo no es la calidad**: Vektor suena a sintetizado a
propósito, y eso es doble —es una decisión estética y es el objetivo de
rendimiento—. Un juego que no descarga ni decodifica nada arranca igual en
cualquier máquina, y ésa era la promesa desde la primera vuelta.

Lo que se aprende de haberlo construido no se tira: **el carril se queda
montado** y apagado con `AUDIO.samplesEnabled`, los WAV se quedan en
`Reference/Audio/` y el importador sigue ahí. Volver a probarlas es una línea.
Lo único que se añade es que **con el interruptor apagado el importador no copia
nada**: lo que no se va a oír no puede entrar en el build, y menos en silencio.

Ésta es la forma de un experimento que sale que no: no se borra, se apaga con un
interruptor que dice por qué.

### Y las tres armas se quedan con la voz seca

Si la síntesis es definitiva, dejar a dos de las tres con la voz vieja era dejar
el juego a medio calibrar. La Pulse y la Volt pasan a la voz `seca` de la vuelta
62, cada una con lo que dice **su ficha**: la Volt dispara cada 75 ms, así que
ninguna capa suya pasa de 50 ms —una cola más larga se pisa a sí misma y la
ráfaga se oye como un zumbido—; la Pulse es un arma corta, sube el crack y pierde
medio grave; la Rift conserva el cuerpo.

Medido con `audio63`, mismo banco y misma máquina, un disparo por captura:

| | pico antes | pico ahora | | cola antes | cola ahora | centroide |
|---|---|---|---|---|---|---|
| Pulse | 0.0859 | **0.3772** | +12.8 dB | 31 ms | 23 ms | 1179 → 2125 Hz |
| Pulse sil. | 0.0371 | **0.0837** | +7.1 dB | 44 ms | 22 ms | 820 → 2314 Hz |
| Volt | 0.0976 | **0.3524** | +11.1 dB | 30 ms | 19 ms | 1363 → 1791 Hz |
| Volt sil. | 0.0399 | **0.0873** | +6.8 dB | 37 ms | 20 ms | 844 → 2357 Hz |
| Rift (control) | 0.4472 | 0.4526 | — | 31 ms | 29 ms | 2004 → 1975 Hz |

**La fila de la Rift es el control.** No se tocó y sale igual en las dos tandas
—1.2%, el ruido del banco—, así que las otras cuatro son el cambio y no la
máquina. Es el mismo truco de la 62 (la Pulse hacía de A/B dentro de la tanda)
por el otro lado: cuando cambian todas menos una, la que no cambia es la regla.

La voz clásica se queda en `SHOT_PROFILES` como **respaldo**, que es lo que
sonará un arma nueva hasta que se le calibre la suya. No la lleva ninguna.

### Un disparo tiene que ser uno, y eso se cuenta

La sonda de la 62 apretaba el botón 60 ms. Con la Rift (600 RPM, un disparo cada
100 ms) eso es un disparo; **con la Volt, 800 RPM, son dos**, y entonces la «cola
a −40 dB» dejaba de medir cuánto dura el sonido y pasaba a medir la distancia
entre dos: 77 ms para un perfil cuyas capas no llegan a 42. No salía mal: medía
otra cosa.

Es la regla del denominador de la vuelta 46 por una puerta nueva. Ahora el banco
lee el cargador antes y después de cada captura, usa sólo las de **una** bala e
imprime cuántas fueron al lado del pico. Con eso, la cola de la Volt sale en 19
ms, que es la más corta de las tres — que era justo lo que se había diseñado.

### Andar y agacharse compran silencio, no un volumen más bajo

Las pisadas de la vuelta 60 sonaban siempre: corriendo al 100%, andando al 70% y
agachado al 45%. Jugando resultó ser lo de siempre con las medias tintas — **un
70% no se oye como sigilo, se oye como una pisada**, y con un rival corriendo a
doce unidades por medio, más bajo se oye igual. Y las dos teclas que lo hacen
existen exactamente para eso: lo que se paga por ellas ya es la velocidad.

Así que ahora: **sólo suena quien corre**. Agachado va como regla propia y no
confiada al umbral de marcha —que también lo dejaría fuera por lento— porque es
lo que promete la tecla: subir `crouchSpeed` algún día no puede devolverle el
ruido a quien se agacha.

### Pero el umbral no se puede medir en un frame

La primera versión comparaba la marcha del frame contra el umbral, y andando
salían **4 pisadas**. No era el umbral: el rival se dibuja interpolando entre
fotos y esa trayectoria **tiembla**, así que un paseo de 3.8 u/s pica por encima
de 5.33 cada pocos frames, y una de esas picadas coincide con la zancada
cumplida.

Se mide **sobre la zancada**: la distancia de la última pisada a ésta dividida
por lo que tardó en darse, que es una ventana de un tercio de segundo. Es la idea
de la vuelta 60 —una zancada es un trozo de suelo, no una suma de frames—
aplicada también al *cuánto tardó*. Y el umbral es fracción de **su** carrera,
con el peso de su arma contado por `weaponSpeedFactor`: contra los 6.5 de la
pistola, un rival con la Rift (5.88) correría en silencio.

El 0.82 sale del hueco que ya existía y no de una preferencia: la carrera más
lenta del arsenal es 5.88 y el paseo más rápido 4.2, así que el umbral cae en
5.33, a 0.55 u/s de cada uno.

### Un radio que se oye, y un techo que no se pasa

Lo que hacía que una pisada se confundiera con un disparo no era sólo el volumen:
era que **no bajaba con la distancia**. `SPATIAL` está calibrado para que un
sonido del mundo cruce un mapa de 55 u —`refDistance` 4, `maxDistance` 55—, de
modo que entre 4 y 12 unidades una pisada perdía **1.9 dB**. Plano: un radar.

El arreglo no es una curva a mano encima del panner —eso sería atenuar dos veces,
que es la convención de siempre— sino **darle a ese emisor su propia curva**:
pleno hasta `FOOTSTEPS.fullDistanceU` (2.5 u) y cero en `maxDistanceU` (16). El
módulo espacial sigue sin saber de pisadas: recibe una curva, no un nombre.

Medido con `pisadas63`:

| | antes | ahora |
|---|---|---|
| corriendo, oyente al lado | 0.1430 | 0.0884 |
| corriendo, oyente a 12 u | 0.1161 | 0.0262 |
| caída entre esas dos distancias | −1.9 dB | **−10.5 dB** |
| andando con SHIFT | 4 pisadas | **0** |
| agachado | 3 pisadas | **0** |
| a 26 u | 0 | 0 |
| la más fuerte contra un disparo | −12.2 dB | **−16.5 dB** |

Y el techo se comprueba **pasándole por al lado**: a 0.5 u la pisada sale en
0.0784 contra 0.0853 a 1.0 u, o sea que por debajo de `fullDistanceU` ya no sube.
Un techo que sólo se cumple a cuatro unidades no es un techo.

### Y una regla que vale para todo lo que venga: el duelo no reescribe el juego

Antes de construir nada para el 1v1 se mira si eso ya existe en el modo de
siempre y se reutiliza. Dos implementaciones de la misma idea no son más código:
son un juego que se comporta distinto según el modo, y **una diferencia que nadie
decidió es un fallo de producto**. Las decididas —el duelo no tiene dianas, ni
puntuación, ni armería— están escritas; el resto tiene que salir igual en los
dos sitios.

Es lo que hizo barata la vuelta 56 (el duelo hospeda el motor entero en vez de
montar su escena) y es la convención de «una sola fuente de verdad» aplicada a
los modos. El hueco que queda hoy va en el sentido contrario y conviene anotarlo:
**las pisadas sólo existen en el duelo**. El día que un muñeco haga ruido al
patrullar, sale de `playFootstep` y del emisor, que ya son genéricos.

## Ronda 64 — La marca de bala, y dónde tenía que vivir

### El efecto no existía en ninguno de los dos modos

El encargo decía «esto ya está en el modo vs muñecos, replicadlo en el duelo».
No estaba: un disparo que se comía la Espina entrenando era un fallo, `hit =
null`, y no se dibujaba absolutamente nada. Lo que había era la comprobación de
cobertura (`_isBlockedByCover`), que es la mitad invisible de lo mismo — decide
que el muro se come el tiro y luego tira el dato.

Eso cambia dónde va el código, y es justo lo que la convención de la 63 quiere
que se pregunte antes de escribir: **construirlo en la página del duelo habría
dejado el modo principal sin marcas para siempre**, y con dos implementaciones el
día que alguien lo notara. Se escribe una vez, en el motor, y lo llaman los dos
disparos.

### Un rayo por disparo, y de él salen las dos respuestas

`_isBlockedByCover(hit)` preguntaba «¿hay algo más cerca que el muñeco?» y
devolvía un booleano. Ahora `_superficieBajoElRayo()` devuelve **punto, normal y
distancia** de lo primero que hay delante, y de ahí se deciden las dos cosas: si
la cobertura come el tiro y dónde va la marca. Dos rayos para dos preguntas sobre
la misma recta es cómo acaban contestando distinto —y además cuesta el doble—.

### La sala es aritmética, no geometría

Las paredes y el suelo se dibujan con **líneas** (`grid.js`), no con mallas: no
hay contra qué lanzar un rayo, así que un disparo a la pared del fondo no tenía
dónde dejar marca. Con el origen dentro de la caja, por dónde sale el rayo es el
menor de los tres cortes contra la pareja de planos de cada eje. Tres divisiones
y una comparación, con la normal exacta de la cara —no la de un triángulo— y sin
tener que montar seis mallas invisibles para que un rayo las encuentre.

### En red la marca la pone el veredicto local

Había dos candidatos y sólo uno sirve:

- **El veredicto del servidor** llega un viaje después y contesta a otra
  pregunta: si le diste. No lleva el rayo, así que no sabe dónde acabó la bala.
- **El veredicto local** (`cliente._resolverLocal`, vuelta 46) se saca al
  ejecutar la entrada, con el rayo delante y contra el rival que estabas
  dibujando. Sabe las dos cosas que hacen falta: por dónde iba, y si acabó en un
  cuerpo — porque **a un rival alcanzado no se le pinta una marca en la pared de
  detrás**.

Por eso la marca de red sale por `cliente.onTiroLocal`, un paso después de
apretar. Son 16.7 ms que no se ven, y lo que se compra es no tener una segunda
idea de «a quién le has dado» dentro del motor, que es la regla de la vuelta 56.

### Una estrella aditiva, y un `InstancedMesh`

No hay calcomanías —ni texturas, ni proyección, ni recorte contra la geometría— y
tampoco hay una sola luz en la escena, así que **una marca oscura sobre una caja
gris no se vería**. Lo que se dibuja es la misma estrella del fogonazo encarada a
la superficie: los dos extremos de la misma bala, con la misma silueta y con una
sola `flashStarGeometry` compartida.

El pool es una malla instanciada: una geometría, un material y veinticuatro
instancias. **Apagarse es que el color de la instancia baje a negro**, que con
mezcla aditiva es invisible — sin eso habría hecho falta un material por ranura
sólo para poder bajar una opacidad. Y se apagan con el reloj del mundo, como todo
lo temporizado: en pausa una marca se queda quieta en vez de irse a tus espaldas.

### Lo que midió el banco, y las tres premisas que estaban mal

`impactos64` mide en píxeles con render target (regla de la 39) y en coordenadas
de mundo. Verde: 92 px bajo la mira, cero pasados los 420 ms, la marca sobre la
cara de la caja a la que se apuntó (z −19.012 contra −19 con 0.012 de
separación), sobre el suelo a y 0.012, y ninguna detrás de un muñeco ni de un
rival alcanzados.

Las tres primeras versiones de esas filas medían otra cosa, y las tres son la
misma lección de siempre:

- **«Pegada a la pared del fondo» fallaba porque el tiro daba en una caja a 3.5
  u.** La aserción escribía una coordenada del plano a mano; ahora la pieza
  **se busca en los datos** (`scenario.boxes`) y lo que se exige es que la marca
  caiga en su cara.
- **«El disparo le dio» fallaba por cadencia**: dos bloques seguidos disparaban a
  120 ms de distancia con un arma de 500 RPM, y el segundo tiro no salía. El
  banco no medía la marca, medía un gatillo que no había disparado.
- **Y en el duelo, los seis tiros salían `tapado`**: entre (0,0) y (0,−6) del
  Plano A hay cobertura. La premisa «se están viendo» no se puede suponer en un
  mapa con muros — ahora la línea está comprobada y el propio veredicto la
  delataría.

## Ronda 64b — La economía, y quién es su árbitro

### El servidor lleva la cartera

Dinero, inventario y catálogo viven en `net/partida.js`. El cliente dibuja el
panel y **pide** (`MSG.COMPRAR`); lo que tiene vuelve en `MSG.ECONOMIA`. No es
desconfianza teórica: es la misma regla con la que la vuelta 56 repartió el arma
—el cargador y la recarga son del cliente, la cadencia la valida el servidor— y
la que hace que el día que esto se juegue en serio no haya nada que parchear.

**La economía no viaja en la foto**, y eso también es una decisión: cambia cada
pocos minutos en vez de sesenta veces por segundo, y sobre todo **el saldo del
rival no se enseña**. En la foto compartida llegaría a los dos; como mensaje por
destinatario, no. Es la misma idea que la foto por destinatario de la fase de
compra (vuelta 62): «no verlo» sólo se garantiza no mandándolo.

### El techo de la ronda 1 es de tipo, no de dinero

La ronda 1 se juega con pistola pase lo que pase, así que el techo se comprueba
por **tipo** (`ECONOMY.techoRonda1`) y no por precio. Con un techo de dinero,
bajar el precio de un rifle abriría esa puerta por detrás sin que nadie lo
notara; y un techo por tipo se lee como lo que es: esa ronda no hay armas largas,
hay decisión de equipo.

### Ganar salta más que perder, y morir cuesta el equipo

Los números de partida: 800 de salida, 3200 por ganar, 2400 por perder —con un
suelo que sube al que encadena derrotas—, 300 por baja. Y la regla que los hace
significar algo: **el que muere pierde lo comprado**. Sin eso, el salto de
economía del ganador sería sólo dinero; con eso, el otro empieza desnudo.

El rifle acabó costando **2900 y no 2700** por una medida, no por gusto: con
2700, un perdedor que se hubiera guardado los 300 del chaleco llegaba **justo**
(2400 + 300) y la asimetría de la ronda 2 se evaporaba por doscientos dólares.
`compra64` lo enseña en una fila: «el perdedor no llega al rifle ($2700 <
$2900), pero sí al subfusil».

### Una tienda no puede vender humo

El encargo pedía chaleco y casco en la compra completa de la ronda 2. En el duelo
**no existían**: hasta esta vuelta el servidor sólo restaba vida. Vender un
chaleco que no para balas habría sido lo contrario de lo que este proyecto hace
con las mecánicas que faltan.

Así que el duelo pasa a tener la escalera de daño entera —casco, escudo, vida— y
**no se escribió otra vez**: se extrajo de `PlayerStatus.takeHit` a
`encajarImpacto`, una función pura que ahora llaman el entrenamiento y el
servidor. Es la convención de la 63 en su forma más literal: dos copias de esa
escalera es cómo un chaleco acaba absorbiendo distinto según el modo.

Lo que sigue sin existir —granada, aturdidora, cegadora— **sale en el panel con
su precio y su combinación y no se puede comprar**. Esconderlo sería no poder
aprenderse la combinación; venderlo, prometer una mecánica que no hay.

### La fase de compra es de la sala, no de `config.js`

Dos amigos que quedan diez minutos no juegan lo mismo que dos que van en serio,
así que la duración —incluido el **cero**, que es «sin fase»— la elige quien crea
la partida y viaja en la dirección del socket (`?compra=…`), exactamente como el
pase de reconexión (vuelta 62) y por el mismo motivo: **la sala se configura al
nacer**, antes de que llegue ningún mensaje. Al segundo en entrar se le ignora, o
cualquiera que abriese el enlace le reconfiguraría la partida al que la montó.

De ahí sale una decisión de interfaz que parece incómoda y es la honesta:
**cambiar el selector recarga con una partida nueva**. Una sala ya creada no se
reconfigura, así que dejar el selector puesto sin más enseñaría un número que el
servidor no está usando. Debajo se pinta lo que dice el servidor.

### La armería no pausa, y no comparte pantalla con el menú

Abrir el panel de compra **no** puede congelarle la partida a nadie: una pausa es
parar el mundo de los dos y sólo la decide el servidor (vuelta 53). Lo que sí
hace es soltar el ratón, porque comprar con el ratón pide poder pinchar.

Y ahí salió un choque que no se ve leyendo el código: **el menú del duelo también
sale al soltar el ratón**. Los dos se pintaban a la vez, y el cuadro del código
—que es un `.control`, para que teclear no capture— se comía los clics de la
tienda **y el clic con el que se vuelve a jugar**. Con la tienda abierta el menú
se quita; al cerrarla vuelve, salvo que ya se haya recuperado el ratón.

### Los códigos de compra rápida no son correlativos

`B 1 1` la Pulse, `B 3 1` la Volt, `B 4 3` la Rift. El hueco del `4 1` y del `4 2`
está reservado a propósito: cuando lleguen más rifles no pueden mover de sitio lo
que la gente ya tiene en los dedos. Un código de compra rápida es memoria
muscular, y la memoria muscular no se renumera.

### Los tres fallos que costaron una tanda cada uno

- **Un callback tiene un dueño.** La página escuchaba `onEconomia` para repintar
  la tienda y **se lo quitó al motor**, que lo escucha para ponerte en la mano lo
  que has comprado. Síntoma: la Rift se compraba, el panel la daba por cobrada y
  la tecla 1 seguía sacando la pistola. Encadenar, como ya hacía `onBienvenida`.
- **`Number(null)` es 0, y 0 es una opción válida.** Leer el parámetro de la
  fase de compra con `Number(...)` a secas hacía que **cualquier** página sin el
  parámetro pidiera una partida rápida. Lo cazó el humo de la página: `compra: 0`
  en una sala recién creada que nadie había configurado.
- **Se puede no tener arma principal.** La ranura 1 empieza vacía, y la dotación
  de salida ponía la mano ahí: `this.weapon` quedaba sin definir y el fallo salía
  **lejos**, en el HUD, leyendo el cargador de un arma que no existe. Ahora la
  dotación empieza en la ranura que de verdad tiene algo.

### Y que hay economía lo dice la bienvenida

Un huésped sin rondas (`VEKTOR_RONDAS=0`) no tiene economía, y allí el arma
principal tiene que seguir saliendo del ajuste del jugador: si no, los bancos de
netcode medirían el peso y la cadencia de una pistola. El cliente no lo deduce de
que no le llegue un mensaje —eso es adivinar por silencio— sino de un campo de la
bienvenida (`eco`), que es donde se dice quién manda antes del primer paso.

Lo delató `motor56`, que afirma qué arma ve el rival en la ficha flotante: salía
`pulse` donde el banco esperaba `rift`, y eso no era el banco quedándose viejo
—era el mundo de medir quedándose sin rifles.

## Ronda 65 — El hitbox era el cilindro de la colisión, no el cuerpo

### El síntoma: matar de un tiro apuntando al aire

Probando la compra en juego, apuntando **visiblemente por encima de la cabeza**
del rival —el punto de mira claramente en el aire, fuera de su silueta— el
disparo registró impacto y mató de un tiro. No era un problema de red ni de
compensación de retraso: los dos extremos estaban de acuerdo. Estaban de acuerdo
**en algo equivocado**.

### La causa: dos cuerpos, y sólo uno se ve

`hitPlayer` cortaba contra un cilindro vertical de `COVER.playerRadius` (0.4), el
radio con el que el jugador choca contra una caja, acotado por las alturas de las
tres zonas. La figura que se dibuja no es un cilindro: es el perfil de
`AVATAR.body`, que mide **0.293 en la cintura y 0.137 en la cabeza**. Medido:

| nivel | y | radio dibujado | cilindro | veces más ancho |
|---|---|---|---|---|
| 0.00 | 0.000 | 0.149 | 0.4 | ×2.68 |
| 0.50 | 0.900 | 0.291 | 0.4 | ×1.37 |
| 0.86 | 1.548 | 0.099 | 0.4 | ×4.02 |
| 0.905 | 1.629 | 0.137 | 0.4 | ×2.92 |
| 1.00 | 1.800 | 0.022 | 0.4 | ×18.5 |

O sea: un anillo de aire de 26 cm alrededor del cráneo, y **ese anillo estaba en
la banda de la cabeza**, que vale 100 de 100 en el modelo de zonas. De ahí el
«muerto de un tiro apuntando fuera».

Y había un segundo desajuste, más pequeño y de la misma familia: el hitbox
escalaba la altura poniendo los ojos en **el centro de la cabeza**
(`head.offsetY`, la convención con la que se mide un muñeco) y salía un cuerpo de
**1.827** contra los **1.800** que se dibujan. Dos reglas de escala para la misma
figura.

### El arreglo: el volumen de impacto **es** la silueta

La figura es un sólido de revolución, así que su silueta es el perfil **desde
cualquier ángulo**: cortar contra el sólido es cortar contra lo que se ve. El
perfil es una poligonal de 22 puntos, o sea 21 troncos de cono, y el corte de un
rayo contra un tronco es una cuadrática. `hitPlayer` resuelve esas cuadráticas y
se queda con el corte más cercano; las dos tapas se miran aparte, porque un
disparo vertical justo sobre la coronilla entra por un disco y por ningún cono.

Tres decisiones dentro del arreglo:

- **El margen va en un solo sentido.** La malla tiene diez caras, así que su
  ancho aparente va del radio entero (de vértice) a su apotema (de cara): un
  sólido de revolución del radio entero asomaría hasta un **4.9%** por fuera de
  lo que se ve. El perfil se mete hacia dentro por ese apotema (`HIT_INSET`), y
  lo que se paga —1.4 cm en la cintura, 7 mm en la cabeza, el 2.25% de la
  silueta— compra la garantía entera: **lo que no se ve no se puede acertar**.
- **La altura la pone la postura; el ancho, no.** `setEyeHeight` achata el avatar
  **sólo en Y**. Escalar el ancho con la altura —que fue la primera versión—
  dejaba al agachado un 38% más estrecho de lo que se ve, y lo cazó el banco a la
  primera: 12.533 rayos de silueta sin hitbox detrás. El ancho sale de
  `body.radius`, que es además lo único que un cuerpo **rebobinado** trae del
  ancho que tenía, porque llega interpolado y sin altura de ojos.
- **Una sola definición del cuerpo humano, y está en `body.js`.** `ZONE_BANDS`
  (dónde cortan las tres zonas), `bodyHeightFor` (lo alto que es) y `hitRadiusAt`
  (lo ancho a cada altura). El avatar y el hitbox las leen de ahí. Es la
  convención de siempre, y este fallo es lo que pasa cuando no se aplica: la
  silueta y el volumen de impacto eran dos cosas escritas en dos sitios, y se
  separaron.

### Lo que midió el banco, y por qué no es una fórmula contra otra

`hitbox65.mjs` no compara `hitPlayer` con una fórmula paralela —eso sería medir
dos copias del mismo error—: lanza 3.7 millones de rayos contra el avatar y
compara el veredicto de `hitPlayer` con el de un `THREE.Raycaster` **contra los
triángulos que se dibujan**.

| | rayos | silueta | impactos | fuera de la silueta | perdidos | zona distinta |
|---|---|---|---|---|---|---|
| antes | 3.708.000 | 709.740 | 1.420.008 | **710.268 (50.0%)**, 150.546 a la cabeza | — | — |
| ahora | 3.708.000 | 709.740 | 693.792 | **0** | 15.948 (2.25%) | 555 (0.08%) |

La mitad de lo que el hitbox aceptaba no tocaba al rival. Y el denominador está
al lado a propósito (regla de la vuelta 46): «0 fantasmas» no dice nada sin los
693.792 impactos que sí hubo.

Coste: **0.509 µs** por disparo que entra y 0.033 µs por el que pasa de largo, y
es por bala, no por frame. La primera versión costaba 6.164 µs porque miraba los
veintiún tramos siempre; el descarte contra el cilindro envolvente ya da la
franja de alturas que el rayo puede tocar, y con ella un disparo horizontal a la
cabeza sólo cruza dos o tres.

`duelo65.mjs` lo mide además **contra el producto**, que es donde apareció: dos
navegadores, el disparo del juego, y la vida que publica el servidor. Al pecho
entra (−50); justo por encima de la coronilla, un palmo por encima y a 0.22 y
0.30 u de lado de la cabeza, la vida no se mueve.

### Lo que se paga, y no es un fallo

Los muñecos aciertan **la mitad**: el jugador ha dejado de ser una columna de 0.4
y es un cuerpo. Medido en `enemigos.mjs` a la misma distancia y sin nada en
medio, **14 de 54** disparos contra los 29 de 54 de antes. No se ha tocado
`ENEMY_DIFFICULTIES`: los tres niveles siguen siendo puntos de partida a calibrar
jugando, y ahora se calibran contra un blanco que es el que se ve.

### Y una suite verde que guardaba la regla equivocada

`vida.mjs` afirmaba *«el cuerpo es el mismo cilindro que usa la colisión»* y
llevaba vueltas en verde. No estaba rota: guardaba fielmente la decisión de
entonces, que era la que había que cambiar. Un banco en rojo después de un
arreglo no siempre es una regresión — a veces es la convención vieja diciendo
adiós, y hay que mirar cuál de las dos tiene razón antes de tocar nada.

## Ronda 65b — Sin fase de compra no es sin tienda

Con la fase a cero —la opción de *partida rápida* de la vuelta 64— no se podía
comprar **nada en toda la partida**. La regla del servidor era «sólo en fase de
compra» y la de la sala era «a cero no hay fase de compra»: las dos correctas por
separado, y multiplicadas, una partida entera con la pistola de serie.

Lo que faltaba era decidir qué significa *no tener fase*. No es que no haya
economía: es que **no hay ventana entre rondas donde meter la tienda**, así que
la ventana es la ronda entera. Se compra jugando, con el mundo corriendo — que
es el precio, porque con el panel puesto eres un blanco (misma regla que el menú
desde la vuelta 60).

Y cuándo está abierta lo dice **una sola función**, `compraAbierta`, en
`net/protocolo.js`, porque la miran los dos extremos: el servidor para aceptar la
compra y el cliente para pintar el panel. Escrita en cada lado se despega, y el
síntoma sería el peor de los dos —un artículo que el panel enseña comprable y el
servidor rechaza sin decir por qué—. Es la misma idea que `net/codigo.js` con la
normalización del código de sala.

Lo que **no** cambia: el techo de la ronda 1 sigue siendo de tipo, así que en una
partida rápida la primera ronda tampoco vende armas largas.

## Ronda 65c — Un «pronto» de diez píxeles no dice que algo no existe

En el panel, la granada decía «pronto» y el rifle sin saldo decía «sin saldo», en
la misma nota, del mismo tamaño y del mismo color. Son dos cosas distintas —*hoy
no te llega* y *esto no existe*— y de un vistazo se leían igual.

Ahora lo que no existe lleva **una franja roja cruzada con «Próximamente»**, en
el naranja de la marca, y lo que se puede comprar ahora mismo lleva el **verde de
acción** y un filo grueso a la izquierda. Cuatro cosas:

- **El precinto se pone en el montaje, no en el repintado.** Una granada no
  existe hoy y no va a empezar a existir a mitad de partida.
- **Y deja leer el nombre, el precio y la combinación.** La primera versión
  cruzaba el artículo por el medio y se comía el precio; se bajó al 72% de la
  altura. Esconder lo que no existe sería no poder aprenderse la combinación
  —que es justo lo que la vuelta 64 no quiso hacer—, y taparla con el precinto
  era lo mismo por otra puerta.
- **La marca de comprable sale de `porQueNo`**, la misma función que decide si el
  botón está apagado, no de una segunda lista de condiciones que se despegaría.
- **Ojo al orden de las dos reglas CSS.** `.art:disabled` y `.art.proximamente`
  tienen la misma especificidad, así que la segunda gana **por ir después** — es
  lo que devuelve la opacidad que el `disabled` quita. Mover el bloque apaga el
  precinto. Misma trampa que `#abatido` y su `.puesto` (vuelta 48).

Y una premisa que el banco tuvo mal dos veces: medir «¿sale marcado como
comprable?» **en la ronda 1** y con el saldo ya gastado. En la ronda 1 el techo
deja fuera las armas largas a propósito y sin saldo el rifle no es comprable, así
que las dos veces el banco estaba leyendo una regla correcta y llamándola fallo.
Se mide en la ronda 2 y con el saldo entero.

## Ronda 66 — La puerta del duelo, y un mapa que sea suyo

### El botón: una puerta, no una fase

El 1v1 llevaba tres vueltas jugándose de verdad y sólo se llegaba a él
escribiendo `/duelo/` en la barra. Lo que faltaba era un botón, y lo que había
que decidir era **qué hace ese botón**, porque la regla de la vuelta 45 sigue en
pie: la red no entra en el juego, el duelo es una página aparte y `App.jsx` no
sabe que existen los sockets.

La respuesta corta: el botón **es un enlace**. Va a `NET.rutaDuelo` y ahí acaba
todo lo que la pantalla de inicio sabe del 1v1. El flujo de crear partida, el
código, el enlace para copiar, el campo para unirse y el botón de reconectar
siguen donde estaban, que es donde tienen que estar.

Lo que sí hubo que arreglar es que `/duelo/` **existiera en los tres montajes**.
La servían los dos huéspedes y no el servidor de desarrollo, así que en local
había que escribir `/net/prueba.html`: una diferencia entre desarrollo y
despliegue que no decidió nadie, y que con un botón apuntando ahí pasa de rareza
a fallo. Se arregla con un middleware de seis líneas en `vite.config.js` que
reescribe **la petición** y no la dirección del navegador —`location.pathname`
sigue diciendo `/duelo/ABC123`, que es de donde la página saca el código—.

Y de ahí salió el primero de los dos fallos que este cambio destapó: la página
pedía su script con `./prueba.js`, que en `/duelo/` es `/duelo/prueba.js`. La
página cargaba entera y **muda**, sin un solo error visible salvo un 404 en la
pestaña de red. Ahora lo pide por ruta absoluta.

### El segundo fallo: «¿es https?» no era la pregunta

Con el botón puesto, la página del duelo servida por el huésped de Node en
`http://` se quedaba **conectando para siempre**. La causa llevaba ahí desde la
vuelta 47: para decidir si las salas están en el mismo origen o en un proceso
aparte, `urlDeSala` preguntaba `¿ubicacion.protocol === 'https:'?`. Eso es cierto
del despliegue y **falso de la misma aplicación servida por `npm run host`**, que
es http. La página se iba a buscar el socket al 5199, donde no hay nadie.

Y no es un caso de laboratorio: es exactamente lo que le pasa a quien abre el
juego desde otro PC de su casa por la IP de red.

La pregunta buena no es por el protocolo sino por **quién sirve la página**, y la
contesta el propio empaquetado: `import.meta.env.DEV` es cierto sólo mientras
sirve Vite, que es el único montaje en que la página y las salas viven en
procesos distintos. Se resuelve al construir —el bundle ni siquiera contiene ya
la rama del 5199— así que no hay nada que adivinar en tiempo de ejecución.
`?worker=1` se queda como palanca manual para los bancos.

De paso, el mismo predicado arregla el enlace que se copia: desde
`http://192.168.1.42:5199/duelo/ABC` ahora sale `.../duelo/XYZ` y no
`...#XYZ`.

## Ronda 66b — El Espejo: un mapa para el 1v1

### Por qué el Plano A no servía

El duelo se jugaba en «Largo y Puerta», que es un mapa de **entrenamiento**. Dos
cosas lo hacían mal duelo, y ninguna se arregla moviendo una caja:

- **Los dos jugadores salían a 5 u uno del otro.** Las salidas se derivaban del
  spawn del escenario con ±2.5 en x, y esa regla nunca fue un reparto de sitios:
  era la forma de que dos jugadores no aparecieran uno dentro del otro. La ronda
  empezaba resuelta.
- **No es simétrico, y no puede serlo.** El Balcón, las troneras y el parapeto
  son ventaja para quien sepa llegar antes. En un aim trainer eso es el mapa; en
  un duelo es un jugador que gana por dónde le tocó salir.

### Las cuatro reglas del mapa nuevo

- **Giro de 180°, y por construcción.** Se declara **media sala** y `giro180`
  añade la otra girada media vuelta. Que sea giro y no espejo es la decisión que
  importa: un espejo le deja a cada jugador la esquina estrecha por un lado
  distinto, o sea un mapa distinto para cada uno; con el giro, la vista de uno
  **es** la del otro. Y que salga por construcción es lo que evita el fallo real
  de un mapa simétrico escrito a mano —una caja a media unidad de su pareja, que
  nadie ve y que decide intercambios—. Lo centrado en el origen se declara
  aparte: girarlo daría una copia encima de sí mismo.
- **Las salidas las declara el mapa, con su rumbo.** `duelo.salidas`, leído por
  `net/partida.js`, con un respaldo que es la regla vieja para cualquier otro
  escenario (los bancos de netcode siguen pudiendo medir sobre el Plano A).
- **Fuera del selector de escenarios.** `soloDuelo` en el dato, y de ahí se
  deriva `TRAINER_SCENARIOS`, que es lo que ofrece el selector y contra lo que
  valida el saneado. Misma idea que `PRIMARY_WEAPONS` y la ranura del arma: no
  hay una segunda lista que mantener.
- **Plano, sin rampas ni plataformas.** No por dificultad técnica: la altura es
  donde un 1v1 se desequilibra primero, y eso se añade midiendo jugando, no de
  entrada.

### El rumbo de aparición, y a quién pertenece

Con las dos salidas en extremos opuestos apareció algo que en el Plano A no se
podía ver: una cámara mira a **−Z** con yaw 0, así que el jugador del extremo sur
aparecía **mirando a la pared del fondo**. Lo cazó el banco por la puerta de al
lado —pulsando W, uno se acercaba al centro y el otro se metía contra el muro—.

Lo primero que se probó fue escribir `camara.rotation.y` desde el cliente de red,
y **no funciona**: el rumbo tiene dueño (`LookControls`) y su dueño lo reescribe
en el siguiente movimiento de ratón. El jugador salía mirando bien hasta que
tocaba el ratón, o sea nunca. La forma correcta es `controls.lookAt(yaw)`, y que
el cliente reciba los controles como ya recibía la cámara y el movimiento. Es la
regla de la pose interpolada de la vuelta 44 por otra puerta: sobre un campo
manda uno solo.

### Lo que se midió

`mapa66.mjs` no mira el plano: lo mide sobre el `Scenario` montado.

| | |
|---|---|
| piezas | 17, **todas con su pareja girada**, ninguna solapada |
| salidas | 32.0 u, **sin línea de visión** entre ellas ni entre las 16 líneas que unen las esquinas de sus cajas de compra |
| caja de compra | 4×4 dentro de los límites de movimiento y **sin una sola pieza dentro ni rozándola** |
| cruzar | 45.61 u, **7.02 s**, idéntico en los dos sentidos (45.607 / 45.607) |
| primer contacto | **22.80 u, 3.51 s** |
| asomarse | 20 y 32 puestos de 154, **los mismos números por los dos lados** |

Dos premisas del banco estuvieron mal antes de salir bien, y las dos de la misma
familia —medir la simetría con una rejilla que no era simétrica—:

- «Llegar al centro» daba `Infinity`, porque el centro es un **bloque macizo**.
  Lo que se quería medir no era el centro sino **cuándo se encuentran**, que es
  el mínimo sobre todo el suelo del peor de los dos caminos. Ése es el número que
  dice si el mapa da tiempo a elegir carril.
- El barrido de «qué se ve asomándose» iba de −18.5 a 18.5 de dos en dos, y el
  último paso no tiene pareja al otro lado: las dos mitades salían con distinto
  número de puestos (151 contra 136) **sin que el mapa tuviera nada**. Con la
  rejilla centrada, los dos lados dan el mismo número dígito a dígito, y esa
  igualdad es ahora la comprobación de simetría que de verdad importa —sobre lo
  que se ve, no sobre la lista de cajas—.

### Y lo que se llevó por delante en los bancos

Cambiar el mapa del duelo rompió cuatro suites, y **ninguna por una regresión del
juego**: todas por saberse una coordenada del Plano A.

- `duelo62` y `abatido52` comprobaban la reaparición contra `z 17.5` escrito a
  mano. Ahora la comparan contra `cliente.salida`, que es lo que dice el
  servidor.
- `abatido52` daba por hecho que dos jugadores que salen y andan acaban
  viéndose. Con 32 u y el centro tapado, no: se les coloca en un carril
  despejado con `MSG.COLOCAR`.
- `tiro46` elegía sus dos puestos entre los **puntos de ruta**, y el mapa del
  duelo no tiene rutas —existen para que nazcan muñecos, y aquí no hay—. Ahora
  barre el suelo cuando no las hay, que además es lo que este banco necesita: dos
  sitios con suelo libre que se vean.
- `impactos64` disparaba **en la fase de compra**, donde un disparo no cuenta.
  Pasaba por casualidad, según lo que hubiera tardado la parte de entrenamiento
  que va antes. Eso no es una premisa, es una moneda al aire: ahora espera a la
  ronda.

Y una que llevaba rota desde la vuelta 64 sin que nadie lo notara: `live.mjs`
llamaba a `_isBlockedByCover`, que dejó de existir cuando el disparo pasó a
resolverse con un solo rayo (`_superficieBajoElRayo`). La regla que guardaba
—que la cobertura para los disparos— sigue siendo la misma; lo que cambió es a
quién se le pregunta.

## Ronda 67 — Lo que salió al jugar entre dos PCs

La primera partida de verdad entre dos máquinas distintas encontró cuatro cosas
en media hora, y ninguna se había visto en un banco. Las cuatro comparten forma:
**funcionaban en el único montaje en el que se habían probado**.

### Un control que no es tuyo

El que se unió por el enlace cambió el desplegable de la fase de compra y acabó
en una partida nueva —código nuevo, ranura 0, color azul—, con su rival solo en
la de antes y las dos pantallas superpuestas.

El comportamiento era el documentado: «cambiar el selector recarga con una
partida nueva» (vuelta 64), porque una sala ya creada no se reconfigura. Lo que
faltaba era la otra mitad de esa frase: **si la sala no se reconfigura, ese
control sólo tiene sentido para quien la va a crear**. Enseñárselo al que se une
es prometerle algo que el servidor va a ignorar, y lo que hace en su lugar —irse
a otra partida— es lo peor que podía hacer.

Quién manda lo dice el servidor en la bienvenida, y es **la primera butaca**: no
el id (un contador que no para) ni el color. Y se cierra también para el
anfitrión en cuanto entra alguien, porque cambiarlo abandona la sala con su
invitado dentro.

La comprobación está además **en el `change`**, no sólo en el `disabled`: el
atributo apaga el control en el navegador, pero lo que hay detrás es
irreversible, y una puerta que se cierra sola no se deja apoyada en el CSS.

### «Hay rival» no es «veo al rival»

Al cerrar el selector con el rival dentro apareció la segunda mitad: durante la
fase de compra la foto sale **por destinatario** y no lleva al otro (vuelta 62),
así que `poseDelRival()` es null los quince segundos enteros. El panel llevaba
desde la 64 diciendo «esperando» con el rival dentro, y nadie lo había mirado.

La foto lleva ahora `ocupadas`, que cuenta **butacas y no cables**: quien se está
cayendo sigue ocupando la suya y su sitio no está libre para nadie.

### Irse tiene que llevar a algún sitio

«Salir de la partida» mandaba el adiós, cerraba el cable y dejaba al jugador en
la misma pantalla: el menú de una partida de la que acababa de salir, con su
código, su enlace y su botón de pausa. Desde fuera, un botón que no hace nada.

El orden no es intercambiable: **el adiós primero y la navegación después**. Ese
mensaje es lo único que distingue un abandono de una caída (vuelta 62), y
descargar la página cierra el socket sin decir nada.

### El portapapeles no existe fuera de un contexto seguro

`navigator.clipboard` es `undefined` en `http://192.168.x.x`, que es exactamente
cómo se juega en casa desde otro PC. Así que `await
navigator.clipboard.writeText(...)` **ni llegaba a escribir**: petaba al leer
`writeText` de `undefined`, se lo comía el `catch` y lo único que pasaba era que
el texto quedaba seleccionado.

Debajo va `document.execCommand('copy')`, obsoleto y **el único que funciona sin
contexto seguro**, que es justo lo que hace falta aquí. Y el botón dice cuál de
las tres cosas ha pasado, porque si no se ha podido copiar hay algo que hacer a
mano.

Lo que se copia es siempre una URL absoluta. Lo que **no** está en nuestra mano:
WhatsApp no convierte en enlace una IP privada con puerto por mucho que sea una
URL válida. Lo que se comparte fuera de casa es la dirección del despliegue.

### Y un banco en rojo durante tres vueltas

Al medir el menú con la fila nueva, `menu62` salió rojo — y salía rojo **también
sin tocar nada**. El menú del duelo llevaba creciendo desde la 60 (pausar), la 62
(salir) y la 64 (la fase de compra), y a 700×460 medía 505 px: los dos botones de
abajo caían fuera de la ventana. La regla de la 62 —«el menú tiene que caber, y
si no cabe se desplaza»— seguía escrita; lo que faltó fue pasar su banco las tres
veces que se le añadió un renglón.

Lo que se quitó fue ayuda repetida —las teclas están en las opciones del juego— y
una nota para probar en dos pestañas que dejó de hacer falta el día que hubo un
botón en el menú y una dirección de red que pasar. 505 → 445 px.

## Ronda 67b — El HUD del arma, la mira y lo que compras

### Dos miras en el mismo juego

El entrenamiento tenía la suya en `src/styles.css` —trazos de dos píxeles, sin
punto central— y el duelo otra escrita a mano en su página —un píxel, con punto—.
Ninguna de las dos estaba mal; lo que estaba mal es que fueran dos, que es la
definición de fallo de producto de la vuelta 63. Los tres números viven ahora en
`CROSSHAIR` y los publican las dos páginas como variables CSS, igual que el
color, que es lo que tocará una pantalla para diseñarse la propia.

Y no se anima. Dos cosas se quitaron y una se quedó, y la diferencia importa:

- **El destello del disparo, fuera.** La mira es la referencia contra la que se
  apunta; con fuego automático parpadeaba diez veces por segundo.
- **La marca de impacto pasa a ser otro elemento.** En el duelo eran los mismos
  cuatro trazos girando 45°: acertar **animaba la mira** justo en el momento en
  que más falta hace quieta. La forma es la de siempre —X blanca, y la baja más
  larga y con anillo—, porque lo que distingue las dos cosas es la forma y no el
  color (en esta paleta todos los tonos significan ya algo).
- **El anillo de daño se queda**, porque no es la mira: es el aviso de que te han
  dado a ti, uno de los tres canales de la vuelta 40, y quitarlo sería quitar
  información y no animación.

### La silueta que el duelo no podía pedir

El trazado del arma ya era uno solo (`weaponPaths.js`). Lo que no se podía
compartir era **elegir cuál toca** —con supresor es otra foto, no la misma con un
tubo pegado—, porque esa decisión vivía dentro del componente de React. Así que
la página del duelo no tenía forma de pedir la silueta y llevaba sin ella desde
que existe.

Sale a `src/ui/weaponSilhouette.js`, que no sabe de React y devuelve el trazado o
el SVG como texto. Es la convención de la 63 por la puerta de al lado: lo que ya
funciona en un modo no se reescribe para el otro, se saca a donde lo puedan
llamar los dos.

### Y el bloque entero se muda a la esquina

Estaba centrado bajo la mira, que es justo debajo de lo único que hay que mirar,
con la silueta a 136 px de ancho: a ese tamaño las tres armas se distinguen por
el largo y poco más, y la silueta existe para identificar el arma de un vistazo.

La esquina inferior derecha era además **la que estaba vacía** —arriba los
contadores, arriba a la derecha los FPS, abajo a la izquierda la vida— y es donde
la busca cualquiera que haya jugado a otra cosa. Debajo va una ficha corta:
nombre, `AUTO`/`SEMI` y `SIL`. Es lo único que se añadió: con tres armas y un
supresor que se conmuta con el clic derecho, «cuál llevo y cómo va» era una
pregunta sin respuesta en pantalla, y la silueta sólo contesta la primera mitad.
El hueco se llena con el tamaño, no con más cosas.

Los mensajes de ayuda se quedan centrados: iban dentro del bloque de arma y se
habrían ido con él a la esquina, y una frase se lee en el centro.

Medido (`hud67`), contra el producto y en píxeles: silueta 208×90 en los dos
modos, bloque anclado en la misma esquina a 2 px de diferencia, y la mira con el
mismo trazo —2×7— saliendo de `CROSSHAIR` en los dos.

### Lo que compras se te pone en la mano

La compra entraba en el inventario y el jugador seguía con la pistola hasta que
se acordaba de pulsar el 1. Con una fase de compra de quince segundos, eso es
salir a la ronda con el arma de antes.

La condición es que **la principal haya cambiado**, no que llegue un mensaje de
economía: llegan también al cobrar la ronda y al conmutar el supresor, y
arrancarle el arma de la mano a alguien que acaba de cambiar a la pistola a
propósito sería el mismo fallo por el otro lado. Comprar es la única forma de que
esa clave cambie.

### Y las pisadas no estaban rotas: lo estaba su banco

Se dieron por perdidas jugando entre dos PCs, y la medida dice que no. Lo que
estaba roto era `pisadas63`, por dos premisas que el mapa nuevo y las rondas se
habían llevado por delante:

- **Medía en la fase de compra.** Cada uno encerrado en su caja de 4 u: el que
  «corre» rebota contra su corralito, suma ocho unidades de trayecto y no da una
  zancada. Cero pisadas con todo funcionando — una premisa rota disfrazada de
  silencio, que es justo lo que ese banco existe para no hacer.
- **Y corría por coordenadas del Plano A.** En El Espejo esa línea cae dentro de
  la pantalla de aparición, y las tandas siguientes arrancaban donde había
  acabado la anterior: la primera ya deja al corredor contra la espina y las
  otras tres miden «no anduvo» y lo llaman silencio. Ahora cada tanda vuelve al
  principio del mismo carril, que además es lo que hace comparables sus filas.

Arreglado el banco: **6 pisadas corriendo**, 0 andando con SHIFT, 0 agachado,
−15.1 dB por debajo de un disparo y el volumen escalando con la distancia. La
explicación de lo que se oyó jugando es otra y hay que decirla como hipótesis: en
El Espejo las salidas están a 32 u y el radio son 16, así que sólo se oye al
rival en la mitad final de la aproximación — y los quince segundos de compra son
silencio por construcción.

## Ronda 68 — El salto va por flanco, y el diseño del deslizamiento

### Dos síntomas, una causa

Jugando salieron dos cosas que no se parecían: **el salto no responde al borde de
una superficie pequeña** —«se nota como input con retraso, el jugador cae antes de
saltar»— y **manteniendo SPACE se salta de forma continua sin control**. El
encargo lo dejó abierto a propósito: «puede que ambas cosas compartan la misma
causa».

La comparten, y es una línea:

```js
if (this.keys.jump && !this.airborne) { ... }
```

`keys.jump` es la **tecla apretada**, no la pulsación. De ahí salen las dos:

- **Apoyada, esa condición es verdadera en cada aterrizaje**, así que el jugador
  rebota mientras la tecla siga abajo. Estaba escrito como decisión —«dejar SPACE
  apoyada sigue rebotando con saltos normales»— y no lo era: era la implementación
  contándose a sí misma. Rebotar sin control no es una mecánica.
- **Y `!this.airborne` deja de ser cierta en el paso exacto en que los pies dejan
  el borde.** El jugador pulsa un frame después y ya no hay suelo. No había
  ningún retraso: el salto llegaba a tiempo y el suelo era lo que se había ido.

### El arreglo es la misma línea, por flanco

Lo que despega pasa a ser `_jumpPressedAt`, la marca que ya existía —sellada con
`event.timeStamp` jugando y con la fracción de paso por la red— y que ya se
gastaba al despegar. Con eso, mantener la tecla no vuelve a producir un flanco
nunca. Y como un flanco puede caer donde no se puede saltar, hacen falta los dos
números de siempre en esta mecánica, y los dos salen de una cuenta:

- **`jumpBufferMs` = 170.** No es «130 como la ventana de encadenado», que fue lo
  primero que se probó y salió mal en el banco: entre el instante **exacto** del
  aterrizaje —que se despeja de la parábola— y el paso que puede actuar sobre él
  caben dos pasos, el que lo detecta y el siguiente. Con 130, la mitad «antes» de
  la ventana de encadenado se recortaba, y se recortaba **más cuanto menos
  refresco**: el umbral se iba a 113 ms a 60 Hz. Con 130 + 2 × 16.67 = 163.3,
  redondeado a 170, `encadenado.mjs` [5] vuelve a dar **130.00 ms a 60, 144 y 240
  Hz, con 0.000 de diferencia**.
- **`coyoteMs` = 110.** En 110 ms de caída libre se baja 0.181 u, por debajo de
  `COVER.stepHeight` (0.25): la gracia se acaba antes de que el jugador haya
  bajado lo que sube de un escalón, o sea antes de que en pantalla se vea que ya
  no está encima. El techo de la cuenta es `sqrt(2·stepHeight/gravity)` = 129 ms.

### Y que el vuelo salió de un borde no se marca: se deduce

Un vuelo de borde es el **único** que despega con velocidad vertical cero
(`_takeOff(0)`), porque cualquier salto de verdad arranca con `jumpSpeed` por su
factor de fatiga, que tiene suelo. Un booleano más habría sido un campo más en
`snapshot()`, que es la lista que mantiene sincronizados los dos extremos de una
partida en red: un sitio más donde discrepar, a cambio de nada.

### El fallo que este cambio podía haber metido en la red, y no metió

`movement._onKeyDown` escribía `_jumpPressedAt` con `event.timeStamp` **también
en red**, donde el reloj del mundo es el número de paso. Daba igual mientras esa
marca sólo decidiera si el salto encadenaba —`_aplicar` la pisaba con la buena
antes de que nadie la usara—, pero desde que **es** la marca que despega, un
número de otro reloj es «pulsación infinitamente fresca» o «pulsación
infinitamente vieja» según cuál de los dos vaya por delante: un salto por paso, o
ninguno.

La condición que lo cierra es la que ya distingue los dos mundos:
`this.keys === this.input` es falso exactamente cuando hay alguien reejecutando
mis entradas. Por la red la marca la pone `pressJump`, que es su sitio. Medido en
`red45`: **cero correcciones y error de reconciliación cero, saltando**.

### Medido

- `salto68.mjs` [1]: manteniendo SPACE 3 s, **1 despegue** a 60, 144 y 240 Hz.
- [2]: pulsar 100 ms antes de tocar el suelo **y soltar la tecla en el aire**
  sigue saltando y sigue encadenando, en los tres refrescos. Antes se perdía.
- [3]: saliéndose de un cajón de 1.9 u andando, pulsar a los 40 ms **salta** (1.19
  u de subida) y a los 200 ms no — y el banco afirma antes que el jugador **sigue
  en el aire** en los dos intentos: desde 1.9 u se cae al suelo en 356 ms, así que
  una espera larga mide un salto normal desde el suelo y sale verde sin haber
  probado nada. Es el denominador de la vuelta 46, otra vez.
- [4]: y lo mismo **en el duelo, con una tecla de verdad** contra la página real:
  1 vuelo manteniendo SPACE 3 s, 3 vuelos con tres pulsaciones. El camino no es el
  mismo —la pulsación viaja sellada dentro de la entrada del paso—, así que medir
  sólo el modelo no habría probado el producto (regla de la vuelta 48).
- Sin tocar una aserción: `encadenado` (con [4] al revés: ahora afirma que **no**
  rebota), `fatiga`, `baja` (12/12), `colision`, `estabilidad`, `tick44`,
  `airstrafe`, `fixes`, `live`, `binds`, `red45` y `motor56`.

### Diez premisas de banco que estaban rotas y no lo decían

- **`red45` abría dos pestañas sin código de sala**, o sea **dos salas**. Desde la
  vuelta 58 el huésped de Node encamina por código igual que el Durable Object, y
  hasta entonces daba lo mismo. El síntoma no era un error: era `p1 vs p1` en la
  primera línea del volcado —un contador que en una sala de dos no puede
  repetirse— y cero muestras en el brazo que compara lo que B ve de A. Ahora B
  entra por el código de A y la línea lo afirma.
- **`motor56` apunta a `VEKTOR_BASE`**, y contra el huésped con rondas la primera
  baja abre quince segundos de fase de compra: la tabla no sale mal, sale vacía.
  Va contra el de `VEKTOR_RONDAS=0`, como dice su propia cabecera.

Y al pasar la batería entera salieron ocho más, **todas de vueltas anteriores y
ninguna del juego**. Van anotadas porque el patrón se repite: lo que se rompe al
cambiar algo no es el código, es lo que el banco daba por sabido.

- **`spawnZone` es una lista desde la vuelta 66** y `spawn43` y `spawner` la
  leían como una caja: `undefined..NaN` en una y cero ciegos en la otra.
- **El rótulo del arma lleva dentro su etiqueta desde la 67b**
  (`.hud__weapon-tag`), así que `textContent` devuelve «RiftAUTO · SIL» y no
  «Rift»: `vuelta41` y `slots39`. Lo que se lee ahora es el texto propio del
  nodo.
- **El bloque de arma se mudó a la esquina inferior derecha en la 67b** y
  `hudpos` seguía exigiendo que estuviera centrado y **lejos** de esa esquina.
- **El clic seco ya no es el único sonido con un pasa-altos** (vuelta 62: el
  crack de la voz seca es uno), así que contar pasa-altos contaba también los
  disparos. `round28` cuenta ahora los que cortan a 3200 Hz —la frecuencia del
  clic— y **mide su premisa**: imprime a qué frecuencia corta el disparo (2600
  con la Rift) en vez de darla por buena.
- **El carril de muestras está apagado desde la 63**, así que `audio39` medía el
  interruptor y no el sistema. Lo enciende para medir y afirma aparte que de
  serie está apagado y que apagado no decodifica nada.
- **`hz`, `vector`, `baja`, `live` y `fixes` saltaban poniendo `keys.jump`**, que
  desde esta vuelta ya no despega. Ahora sellan la pulsación, que es lo que hace
  un jugador.
- **`musica` se retira.** El ambiente de menús se quitó entero en la vuelta 60 y
  su banco importaba un módulo que ya no existe: salía con **0 pass**, o sea sin
  medir nada, y eso en una batería se lee como verde.

### El deslizamiento: diseñado, no construido

El encargo pedía diseñarlo «para cuando encaje en el roadmap» y **dejar una
ventana hacia atrás abierta**. Está entero en
`docs/propuestas/04-deslizamiento.md` y en el roadmap como 1.6. Tres cosas de ahí
que conviene no perder aunque no se construya nunca:

- **El gesto pedido no se puede montar.** Era W + CTRL + SPACE, y **Ctrl+W cierra
  la pestaña** en Chrome y en Edge: el navegador resuelve ese atajo antes de que
  el evento llegue a la página. Es la convención de la vuelta 27, que nació de
  ese mismo cierre. El propuesto es correr + agacharse, que es el gesto de la
  industria y **no añade ninguna tecla**.
- **Deslizarse y saltar llegaría al techo del aire gratis.** `currentSpeed`
  congela la marcha al despegar, así que despegar a 9.43 es volar a 9.43 y el
  air-strafe puede rematar hasta 9.5 — lo que hoy cuesta tres encadenados bien
  hechos. El despegue desde un deslizamiento siembra con la marcha de carrera.
- **Y la ventana es la de `airVector`:** `MOVEMENT.slide.enabled` en `false`, la
  mecánica entera dentro de `movement.js`, y la garantía no es una promesa sino
  una medida — con la bandera apagada, un paseo largo por el Plano A acaba en la
  misma coordenada hasta el último decimal que antes de escribir una línea.

---

## Ronda 69 — El deslizamiento

El diseño estaba escrito desde la 68 (`docs/propuestas/04-deslizamiento.md`) y el
encargo fue «adelante con la implementación completa», con el gesto corregido:
correr + agacharse, porque Ctrl+W cierra la pestaña. Lo interesante de esta vuelta
no es lo que se construyó —que es lo que decía el papel— sino las dos cosas que
el papel no podía saber.

### Una recta también se puede integrar mal

La propuesta decía «`v(t)` es una recta, así que hay forma cerrada y no depende
del refresco». Es cierto de la **velocidad** y falso de lo que importa, que es la
**distancia**: mover `v·dt` cada paso es una suma de Riemann por la izquierda de
una función que baja, y eso se pasa de largo exactamente en `(v0 − vfin)/2 · dt`
— o sea **más cuanto más grande es el paso**.

Medido con el primer intento: **4.309 u a 60 Hz, 4.254 a 144 y 4.245 a 240**, un
1.49% de dispersión. Es el mismo orden de magnitud que el que la vuelta 44 cerró
con el tick fijo, y por la misma causa: una integración donde había una forma
cerrada.

Lo que se mueve cada paso es `d(t) − d(t − dt)`, con `d(t) = v0·t − ½at²`, y el
reloj **acotado a la duración por los dos lados**. Eso último no es cosmético:
hace que el paso que cruza el final recorra justo lo que quedaba, así que la suma
telescopa a `d(duración)` sea cual sea el tamaño del paso. Después: **4.20875 u
en los tres refrescos, dispersión 0.0000%**.

De ahí sale además un detalle de orden que parece un capricho y es el mecanismo:
`_updateSlide` mira el reloj **antes** de sumarle el paso. Sumando primero, el
paso que cruza el final deja de ser un paso de deslizamiento y ese último trozo
se pierde — y lo que se pierde depende del refresco, que es lo que se acaba de
arreglar.

### El techo que no hay

La propuesta apuntaba un riesgo (§4.3): levantarse de un deslizamiento debajo de
una caja. La preocupación era razonable, porque la colisión **sí** sabe pasar por
debajo de algo: `resolveAxis` descarta una pieza con `box.bottom >= headY`, y un
agachado mide 1.05 contra 1.70.

Pero **ninguna pieza de ningún escenario tiene la base levantada**: las 37 cajas
de los tres mapas nacen en el suelo. No hay ni un hueco por el que colarse
agachado, así que no hay dónde levantarse dentro de nada.

Así que no se escribió la comprobación: se escribió el aviso. `slide69` [9]
recorre los tres escenarios y **se pone rojo el día que alguien declare una
plataforma de verdad** —una por la que se pueda andar por debajo—, que es el día
en que esa comprobación hay que construir. Construir hoy la máquina para un caso
que no existe habría sido código sin forma de probarlo.

### Lo que sí salió como estaba escrito

- **Saltar no se lleva la marcha del deslizamiento** (§4.1): se despega con la
  carrera (6.5) y no con el empujón (9.43), medido en los tres refrescos, y el
  vuelo no pasa del techo del aire. Se aplica igual al tirarse por una cornisa,
  que no estaba en la propuesta y es la misma puerta. La marcha de salida va
  **como argumento de `_takeOff`** y no como campo: se gasta en el mismo paso, y
  un campo que sobrevive a un paso es un campo que hay que mandar por la red.
- **El flanco sale de la máscara** (§3.1), así que el protocolo no creció: lo que
  creció fue `snapshot()`, de 25 campos a 32. `red45`, con un deslizamiento cada
  2.3 s en la rotación de gestos, sale con **cero correcciones y error cero**.
- **La marcha que se exige es la de antes de agacharse.** En el paso del flanco
  la tecla ya está pulsada, así que preguntar por la marcha vigente diría «2.6»
  y no se podría entrar nunca. Se compara contra **tu** carrera, no contra un
  número suelto, y por eso un rifle se desliza igual que una pistola — medido con
  las tres.
- **Y el interruptor es de verdad un interruptor**: apagado, el mismo paseo por
  el Plano A acaba en la **misma coordenada hasta el último decimal**.

---

## Ronda 70 — La Scout, el daño por arma y la primera mirilla

### El dato que no existía y ahora sí

Estaba escrito en dos sitios —en `CLAUDE.md` y en la ficha de la armería— que el
daño era **de la zona y no del arma**, y que poner un número por arma sería
inventarse un dato que el juego no tiene. Era cierto mientras las tres pegaban
igual. Un rifle de francotirador que mata de un tiro al cuerpo **es** ese dato,
así que la regla cambia, y cambia con cuidado:

- El modelo de zonas sigue diciendo la **forma** del daño (100 / 50 / 34) y el
  arma dice cuánto vale la suya (`damageScale`). La Scout es ×2.2 → **110 al
  torso**, más de una vida.
- **La cabeza no se escala**, por lo mismo que `ENEMY.bodyDamageScale` no la
  toca desde la 37: vale 100 de 100 y de ahí cuelga la regla del casco.
- **Sin el campo vale 1**, así que las tres de siempre no se mueven ni un punto.
  Eso no es una cortesía: es lo que permite añadir un arma sin volver a calibrar
  lo que ya estaba calibrado.
- Y la multiplicación vive en **`zoneDamage`**, que es donde ya estaba la tabla.
  La llaman los cuatro que reparten daño —el duelo, el fuego enemigo, los
  muñecos del entrenamiento y **la ficha de la armería**—. Lo último importa más
  de lo que parece: un panel con su propio cálculo es una tienda que promete un
  número y unas balas que quitan otro.

Medido: una al cuerpo sin chaleco, **dos** con chaleco, una a la cabeza y dos si
hay casco; tres a las piernas con chaleco. Con la Rift siguen haciendo falta
tres al cuerpo.

Y un muñeco se cae de un tiro, porque un muñeco es un blanco con las mismas
zonas que un jugador: `targets.applyHit` pasó a pedir el arma. Si una bala mata
a una persona y le hace cosquillas a un muñeco, hay dos escaleras de daño.

### El clic derecho no se reparte: lo decide el arma

La mirilla necesitaba un botón y el clic derecho ya tenía dueño —el supresor,
desde la 64—. La salida no fue un modificador ni una tecla nueva: el clic
derecho pasa a ser **«la segunda función del arma que llevas»**, y ningún arma
tiene las dos. La Scout no admite supresor (`supportsSuppressor: false`) y tiene
mirilla; las otras tres, al revés. Lo decide el dato, no un `if` sobre un modo.

De ahí salió gratis una limpieza que ya tocaba: **`trace-weapons.mjs` derivaba
el arsenal de una lista escrita a mano**. Con un arma sin variante silenciada
eso habría sido además un catálogo que miente, así que la lista sale ahora de
`WEAPONS` y las variantes de `supportsSuppressor` — el mismo campo que mira la
armería y que valida el saneado.

### Tres cosas que se mueven a la vez, con el reloj del mundo

La lente, el encuadre y la sensibilidad cuelgan del **mismo** número (`_scopeT`),
que avanza en el paso fijo y no en el frame: 140 ms en cualquier monitor (medido,
150 / 145.8 / 141.7 ms a 60 / 144 / 240 Hz, que es el dato más el resto de un
paso). Si cada una fuera por su lado, se quedarían a medio camino la una de la
otra en la primera pausa.

Dos reglas que salieron de escribirlo:

- **El FOV lo escribe sólo `_updateScope`.** Dos sitios escribiendo el encuadre
  es una cámara a medias el día que uno no se entere de un cambio de arma. Es la
  regla del rumbo de la vuelta 66 por otra puerta: sobre un campo manda uno solo.
- **Y la sensibilidad, sólo `_aplicarSensibilidad`.** `_applySettings` escribía
  directamente en los controles, así que con la mirilla puesta **tocar
  cualquier opción** —el volumen, los mensajes de ayuda— devolvía la
  sensibilidad de a pelo en mitad de un disparo. El banco lo mide a propósito.

### Y la lente es del motor, pero la mira es de la página

`src/game/scope.js` dibuja la lente y **trae su propia hoja de estilos**,
inyectada una vez: las dos páginas tienen CSS distinto y un bloque copiado en
cada una es la misma mirilla escrita dos veces, que es exactamente lo que pasó
con la mira hasta la 67.

Lo que **no** hace es esconder la mira de la página. Se probó: alcanzar desde el
módulo a `.crosshair` y a `#mira` habría metido en un módulo del juego los
nombres de los trozos de dos páginas. El motor avisa por `onScope` —una
**pulsación**, como `onWeapon`, no un valor por frame— y cada página apaga la
suya con una línea.

### Lo que el arsenal creciendo destapó

Tres bancos daban por sabido que las armas eran tres:

- **La armería se partía en dos filas.** `subgrid` alinea **dentro de una fila de
  fichas** —que es lo correcto: comparar es mirar la misma altura en las que
  están una al lado de otra—, así que la cuarta, sola abajo, no cuadraba con
  nadie. El panel pasa de 780 a 900 px y la columna mínima de 210 a 190: entran
  las cuatro. El banco afirma ahora lo de siempre **por fila**, que es lo que
  sobrevive al arsenal siguiente.
- **`vuelta41` afirmaba el arsenal entero** para probar que renombrar no toca una
  estadística. Ahora afirma **las tres renombradas**, que es lo que aquella
  vuelta vino a proteger.
- Y **`slots39` contaba dos principales**. Cuántas hay es del arsenal; la regla
  —se derivan de la ranura y la pistola no está— es lo que se guarda.

---

## Ronda 71 — Vanta, y cómo se cuenta un arma que no se ve

La tecla 3 llevaba **cuarenta y cuatro vueltas** reservada y sin lógica. Eso era
la apuesta de la vuelta 27 —«el mapa de controles tiene que ser el definitivo
desde el principio, o cuando llegue la mecánica alguien ya habrá puesto ahí su
bind favorito»— y esta vuelta la cobra: el cuchillo entra en su tecla, sin
discutirla con nadie.

### Dos números, no una tabla de combos

El encargo pedía que «dos fuertes maten», que «cuatro o cinco flojos maten» y que
las mezclas sumaran «de forma natural, sin necesidad de una tabla de combos
aparte». Eso no es una funcionalidad: es una consecuencia de no escribir la tabla.
Flojo 25 y fuerte 55 contra 100 de vida, restando de la misma vida por la misma
escalera (`encajarImpacto`) que un disparo, y las combinaciones salen solas —
medido: 2 fuertes, 4 flojos, 3 mezclando; con chaleco 3 y 6.

### La puñalada por la espalda **no es un número grande**

Es la decisión que más fácil habría sido hacer mal. «Un ataque fuerte por la
espalda mata siempre, sin excepción» no se implementa con 999 de daño: lo pararía
un chaleco, y entonces «siempre» sería «casi siempre» — que es otra regla, y la
que el jugador descubriría en el peor momento.

Va en `encajarImpacto` como caso propio (`mortal`) y **por delante del casco y
del escudo**, o sea antes que nada. Medido a vida llena con chaleco y casco: un
golpe. Con 150 de escudo: un golpe.

### Y el arco de espalda entra como vector, no como ángulo

`esPorLaEspalda` la llaman dos sitios con **convenciones opuestas**: el yaw de
una cámara mira a −Z y el `facing` de un muñeco a +Z (la trampa de la vuelta 60,
que allí pintó la brújula apuntando a la espalda del rival). Pasar «el rumbo» sin
más habría sido el mismo error de 180° otra vez, y aquí se lee como **que te
matan de frente**.

La función pide el vector de hacia dónde mira la víctima y cada llamante lo
construye en su línea, donde está su convención. Un signo invertido se ve ahí;
dentro de una función compartida, no se ve nunca.

### El rumbo de la víctima también se rebobina

El historial del servidor guardaba dónde estaba cada cuerpo en cada paso, y eso
bastaba para las balas. Un cuchillo necesita además **hacia dónde miraba**: si se
juzgara contra el rumbo actual, girarse a tiempo salvaría de un golpe que ya
había ocurrido, que es exactamente lo que la compensación de retraso viene a
impedir.

Y se interpola **por el camino corto**. Entre 179° y −179° hay dos grados, no
trescientos cincuenta y ocho, y la media recta de esos dos números da 0 — o sea
mirando justo al revés. `mezclaDeRumbo`, a nivel de módulo.

### Una mecánica nueva no es un protocolo nuevo

Un golpe viaja **dentro del disparo**, con un campo más (`d.m`). Mismo sellado en
el paso, mismo `seq`, mismo veredicto, mismo rebobinado, mismo tope. Lo único que
cambia es con qué función se resuelve.

Lo que sí hubo que partir es la cadencia: **se exige la del tipo de golpe**, y la
cuenta sale del mismo campo que el daño. Sin eso, alternar flojo y fuerte colaba
el fuerte al ritmo del flojo — medido antes y después.

### Lo que de verdad costaba: contarlo sin enseñar nada

Vektor no dibuja el arma en la mano (vuelta 38) y eso no se toca. Un arma de
fuego sobrevive a eso porque la bala habla —el anillo de la mira, la marca en la
pared, el sonido—; un cuchillo, no: sin animación, golpear al aire y matar a
alguien se ven exactamente igual.

Cuatro canales, y **cada uno contesta una pregunta distinta**, que es la misma
disciplina que las tres señales de que te disparan de la vuelta 40:

- **¿Llego?** La mira se abre y se tiñe. Es lo único que se puede decir *antes*, y
  sale del mismo rayo que resuelve el golpe — una vez por paso de mundo y sólo
  con el cuchillo en la mano.
- **¿He golpeado?** La cámara se mueve, por el mismo camino que el retroceso.
- **¿Qué golpe?** El arco: fino a la izquierda, grueso a la derecha. **Por la
  forma, no por el color** (regla de la vuelta 67) — el color sólo separa el
  fuerte, y en el verde de acción, que es el único de la paleta que ya significa
  dos cosas porque no coinciden nunca en pantalla.
- **¿Ha entrado?** El sonido, y **sólo si conecta**: el filo suena siempre, el
  cuerpo grave no. Por la espalda añade un metal inarmónico que no lleva ningún
  otro golpe.

En red los cuatro los decide el **veredicto local**, no el del servidor: es la
regla de la marca de bala de la vuelta 64, porque el del servidor llega un viaje
después y contesta a otra pregunta.

### Y lo que el quinto arma destapó en la armería

`subgrid` alineaba los **seis bloques** de cada ficha y las estadísticas de
dentro iban en flujo normal. Con cuatro armas de fuego cuadraba —el mismo texto
ocupa las mismas líneas— y con el cuchillo dejó de cuadrar, que es lo que pasa
siempre que algo cuadra por casualidad: sus valores son más cortos, ocupan una
línea donde los otros ocupan dos, y a partir de ahí la columna entera se desfasa.

Ahora las cinco estadísticas **son filas de la rejilla** (11 en total, con
`subgrid` anidado), así que un valor de dos líneas empuja el suyo en las cinco
fichas y no sólo en la suya. Es la promesa de la vuelta 43 —«comparar es mirar la
misma fila»— hecha cierta para cualquier texto en vez de para el que había.

Y dos más, pequeñas y del mismo tipo: **el tope de una barra sale de lo que se
puede comparar** (un `undefined` de un arma sin RPM convertía el máximo en NaN y
dejaba **todas** las barras sin dibujar), y el panel creció a 1100 px para que
las cinco quepan en una fila.

### Lo que faltaba, y llegó en la 73

`Reference/Weapons/vanta.png` no estaba en el repositorio, así que la ficha del
cuchillo salió sin dibujo. Llegó durante la vuelta 73 y costó **un comando**:
`npm run trace:weapons`. La lista de armas a trazar se deriva de `WEAPONS` desde
la vuelta 70 y `armeria43` afirmaba que no faltaba ninguna **que sí tuviera
referencia**, así que no hubo que tocar ni una línea ni una aserción — que era
exactamente lo que esas dos decisiones compraban.

---

## Ronda 72 — Los Pilares: la física es del mapa, y en él no se compra

Tres encargos que parecían tres y eran uno: **un mapa puede cambiar las reglas
del mundo**, y todo lo que hace falta para que eso no se convierta en un modo
aparte.

Hasta aquí el duelo era un juego con un mapa. Desde esta vuelta son dos mapas, y
uno de ellos pesa menos, se juega con rifle de francotirador y no tiene tienda.
Nada de eso es un modo: es dato del escenario, y el motor, el servidor y la
página lo leen del mismo sitio.

### La física sale del escenario, no de un ajuste ni de un modo

`MOVEMENT.gravity`, `MOVEMENT.jumpSpeed` y `MOVEMENT.airStrafeMaxSpeed` dejan de
ser del juego y pasan a ser **lo que vale si el mapa no dice otra cosa**
(`fisicaDeEscenario`, `scenario.fisica`, `movement.fisica`).

Que salga del escenario es lo que la hace segura en red, y no es un detalle de
estilo: **los dos extremos montan el mismo mapa —lo dice la sala— y derivan los
mismos números sin que viaje ninguno**. Un campo de física en el protocolo sería
una física que se puede mentir, y una física que sólo conociera un lado sería una
corrección por paso —el mismo agujero que el arma en cada entrada de la vuelta
56, y el mismo que el escenario único de la 65—.

Y son **tres números y no todos**: el modelo del aire, la aceleración aérea y las
marchas de a pie siguen siendo del juego. Un mapa puede decir cuánto pesas,
cuánto saltas y hasta dónde aceleras en el aire; **cómo** se acelera, no. Si eso
se abriera, dos mapas serían dos juegos.

Medido (`pilares72` [1], [2], [6], [7]): El Espejo y el Plano A salen con la
física de siempre **dígito a dígito** —nadie recalibra nada—, montar Los Pilares
la cambia y volver a El Espejo la devuelve, y el salto pasa de 1.25 u de ápice y
578 ms a **3.25 u y 1415 ms**. Corriendo, un salto avanza 9.21 u contra 3.79.

### Y las dos alturas del mapa salen de esa física, no del gusto

`torre` 3.2 y `atalaya` 6.0. Con un ápice de 3.26 y el escalón de la casa, a una
torre **se sube desde el suelo por los pelos** y a una atalaya **no**: hay que
subir a una torre primero. Es la única forma de que subir sea una decisión y no
un paseo, y son números derivados —si algún día cambia la gravedad de este mapa,
estas dos alturas se recalculan con ella—.

### Los Pilares: las cuatro reglas de El Espejo, más la que aquella dejó pendiente

Giro de 180° y no espejo, salidas declaradas con su rumbo, fuera del selector de
escenarios. Y **altura**, que es justo lo que la vuelta 66 dejó escrito para
«cuando se pueda medir jugando»: «una plataforma simétrica se puede hacer; la
altura es donde un 1v1 se desequilibra primero». Este mapa existe para medirlo.

Sala de 56×56×20 —una línea de tiro de francotirador necesita fondo—, 48 u entre
salidas **sin línea de visión entre ellas**, 16 piezas con su pareja girada y una
sola centrada en el origen: la atalaya central, que es lo único que corta la
recta entre las dos salidas.

Y **todas las piezas nacen en el suelo, ni un voladizo**. No es estilo: es la
regla que `slide69` [9] vigila desde la vuelta 69 —la colisión sabe pasar por
debajo de una pieza con la base levantada y nadie ha escrito la comprobación de
no levantarse dentro de ella—. Un mapa de saltos es el peor sitio para estrenar
ese agujero.

### «Sin economía» no es «sin fase de compra», y la 65 explica por qué

La vuelta 65 cerró un fallo por un lado: «sin fase» significaba que **no había
ventana donde meter la tienda**, así que la ventana pasó a ser la ronda entera.
El encargo de esta vuelta es exactamente lo contrario —«nunca se puede comprar
nada, ni con fase ni sin ella»— y por eso **no se pudo reutilizar el cero**: a
cero, desde la 65, la tienda está abierta todo el rato.

Lo que decide es el mapa (`duelo.sinEconomia` + `duelo.dotacion`), y de ahí salen
tres consecuencias que son el sistema:

- **`_dotar` entra por el inventario de siempre**, así que llega al cliente por
  `MSG.ECONOMIA` y el arma se pone en la mano sola — que es exactamente lo que ya
  hacía una compra desde la vuelta 67. Una segunda forma de entregar un arma
  serían dos maneras distintas de acabar empuñándola.
- **Se reparte después de quitar.** `_perderEquipo` deja sin chaleco al que cayó,
  y en un mapa sin economía morir no puede costar el equipo: no hay forma de
  recuperarlo. El orden de esas dos líneas **es** la regla.
- **Y el mapa que reparte no tiene fase de compra, ni pidiéndola.**
  `configurarCompra` la fija en cero aunque el selector diga otra cosa. Quince
  segundos encerrado en una caja con una tienda que no vende nada son quince
  segundos de nada, y un selector que promete algo que el servidor va a ignorar
  es el fallo de la vuelta 67 otra vez.

El supresor **sigue funcionando**, y el corte va deliberadamente después de él:
no es una compra, es un interruptor del arma que ya llevas (vuelta 64).

Y que no hay economía **lo dice la bienvenida** (`eco`), que hasta aquí era `1`
si había rondas. Ahora son dos preguntas distintas: se puede jugar a rondas y
repartir el equipo en vez de venderlo. Deducirlo del silencio era lo que la
vuelta 64 ya había prohibido.

### El mapa viaja como la fase de compra, y por el mismo motivo

`?mapa=` en la dirección del socket: la sala se configura **al nacer**, antes de
que llegue ningún mensaje, y al segundo en entrar se le ignora. Mismo camino que
el pase de reconexión (vuelta 62) y la fase de compra (vuelta 64), mismo saneado
compartido (`escenarioDeDuelo`, junto a `DUEL_SCENARIOS`) por la misma razón que
`net/codigo.js`: dos saneados es como una sala acaba jugándose en dos mapas, y el
síntoma sería una corrección por paso contra paredes que sólo existen en un lado.

El enlace que se copia lo lleva también. No haría falta —el servidor dice en la
bienvenida en qué mapa se juega y la página se corrige— pero corregirse es
**recargar**, y quien abre el enlace vería El Espejo un instante y luego un
rebote. Sigue mandando el servidor; esto sólo ahorra el parpadeo.

### Lo que la batería completa destapó, que no era de esta vuelta

Seis bancos salían en rojo y **ninguno por el código de la 72**. Cinco son la
misma clase de fallo que la vuelta 57 dejó anotada —«una suite verde tampoco
está verificada por estar verde»— y el sexto era un bug de verdad, de la vuelta
64, que llevaba ocho vueltas escondido.

- **`tiro46` medía en dos salas a la vez.** Abría dos pestañas sin código, así
  que cada una creaba su partida y las dos eran `p1`. No da un error: da una
  tabla entera de `0/0` y `NaN%`. Es el fallo que `red45` ya había tenido y que
  no se propagó a su hermano.
- **`jugable48` y `reaparecer50` disparaban contra una pared, desde la vuelta
  66.** El Espejo aparta las dos salidas 32 u **sin línea de visión entre ellas**
  —a propósito: la ronda no puede empezar resuelta— y los dos bancos seguían
  disparando desde el punto de aparición. «0 de daño» se leía como una regresión
  del disparo en red y era el mapa haciendo su trabajo.
- **`jugable48` medía una mira de tamaño cero.** Desde la vuelta 67 `#mira` es un
  ancla de 0×0 con los cuatro trazos posicionados encima, así que su
  `getBoundingClientRect` da 0 con la mira perfectamente puesta.
- **Y `reaparecer50` contaba dos teletransportes.** Colocar a un jugador *es* un
  teletransporte (`MSG.COLOCAR` llama a `movimiento.reset()`), así que dejarlo
  dentro de la ventana de análisis metía un salto de más y la fila decía «el
  salto se dibuja en 2 frames».

Y un quinto que no era del banco sino del entorno, y que es el de la §4 de
`CLAUDE.md` por una puerta nueva: **`pausa54-tope` salió siete veces en rojo
contra un huésped viejo**. Ese banco se pasa con los topes de pausa bajados, y el
huésped lleva **su propia copia de `config.js`** —la importa al arrancar, no sale
del build—, así que un proceso que seguía dueño del puerto medía con los topes de
antes. El `kill` no había matado nada y `/salud` contestaba tan contento. El
arreglo va en el banco y es de la misma familia que los otros: **el tope
viaja en la foto, así que ahora se le pregunta al huésped cuál lleva** antes de
medir, y se sabe al primer segundo en vez de a los catorce.

Y **el sexto sí era del juego**, que es para lo que sirve pasar la batería
entera: `audio63` medía el disparo silenciado idéntico al normal, dígito a
dígito. El supresor tenía **dos caminos** —el clic derecho preguntaba al
servidor (`_alternarSupresor`) y la tecla escribía el ajuste guardado
(`_runPanelAction`)— y en una partida con economía el ajuste no es lo que se
lleva. O sea: **el supresor salía con el ratón y no con su tecla**, desde la
vuelta 64, y no lo cazó nadie porque los bancos de audio lo conmutan con la
tecla y los de la tienda con el ratón. Es exactamente la diferencia que la
vuelta 63 llama fallo de producto, y el arreglo es el de siempre: un solo
camino, y la tecla llama al del clic.

Debajo había medio fallo más, del mismo sitio: la pregunta era **`enRed`** y
tenía que ser **«¿hay inventario del servidor?»**. Un huésped sin rondas no
manda ninguno, así que ahí el supresor no se podía poner de ninguna manera —ni
por el ajuste, que se ignoraba, ni por el servidor, que no contesta—. Se deduce
del dato que llega (`_invRed`), no de un segundo interruptor de «aquí hay
economía» que habría que mantener en sincronía.

Los cinco primeros se arreglaron en el banco y el sexto en el juego, y todos
tienen el mismo antídoto, que ya estaba escrito: **una proporción necesita que
se vea su denominador** (vuelta 46) y **un techo necesita que se vea su suelo**
(vuelta 57). `tiro46` afirma ahora que los dos están en la misma sala antes de
medir; `jugable48` y `reaparecer50`, que hay línea de tiro entre los dos
puestos; `pausa54-tope`, que el huésped lleva la config que este proceso está
leyendo; y `duelo72` [5] afirma que **los dos saltos que compara avanzan de
verdad** antes de comparar cuál avanza más — sin eso, «7.08 contra 0.00» pasaba
tan campante. El del supresor tiene su propio guardia, `duelo72` [7]: que la
tecla y el clic derecho lo dejen donde estaba.

Y una lección de fondo, que es la de la vuelta 57 subida un escalón: **ninguno
de los seis se vio pasando el banco de la vuelta**. Salieron pasando los de
todas las demás.

---

## Ronda 73 — El duelo deja de tener su propio HUD

Diez cosas de jugar, y **cinco eran la misma**: la página del 1v1 llevaba desde
la vuelta 45 con una interfaz escrita a mano, y lo que se notó jugando fue el
precio entero de esa copia.

### La copia costaba cinco cosas, y ninguna era una decisión

`net/prueba.html` tenía su vida, su bloque de arma, su cartel de abatido y su
cuña de daño. Funcionaba, y por eso duró seis vueltas. Pero era una segunda
implementación de lo que `src/ui/Hud.jsx` hace desde la vuelta 34, y «segunda»
quería decir **recortada**:

- **No tenía chaleco.** Se compraba en la ronda 1, el servidor lo cobraba y lo
  aplicaba, y en pantalla no salía nada. Tampoco casco, ni cargas, ni los
  segundos de gracia.
- **No tenía la marca de Vektor.**
- **No tenía ficha de armas**, así que en el duelo no se podían ver los números
  de ninguna — ni siquiera los de la Scout y el Vanta, enteros desde las vueltas
  70 y 71.
- **Y no tenía dónde montar un panel**, así que **no había forma de abrir las
  opciones sin salir de la partida**. De ahí la quinta: la sensibilidad de la
  mirilla existe desde la vuelta 70 y era inalcanzable. No faltaba: no se podía
  llegar.

La vuelta 67 ya había hecho esto mismo con dos piezas —la mira y la silueta del
arma— sacándolas a donde las pudieran llamar los dos. Esto es lo mismo hasta el
final: `src/ui/duelo.jsx` monta **los componentes del juego** en la página del
duelo, y las cuatro funciones de pintar HUD que había aquí se borran.

**No hizo falta cambiar ni un campo del motor.** `stats` ya traía
`shieldSegments`, `helmet` y `charges` desde la vuelta 64: lo que faltaba era
quién los dibujase.

**Lo que cuesta, medido.** La página del duelo pasa a cargar React y los
componentes de interfaz: de **202 KB comprimidos a 266**, o sea +64. La del
juego se queda igual (254 contra 254). Y para quien juegue a las dos —que es
todo el mundo, porque al duelo se entra por el menú— el total **no cambia**:
266 KB antes contra 268 ahora, porque lo que antes eran dos bundles con la mitad
del código repetido ahora es un trozo común que se descarga una vez.

Medido (`duelo73`): el bloque de vida, el de arma, la marca y los FPS caen en
**el mismo sitio y del mismo tamaño** en los dos modos, pixel a pixel
—201×40 a 34 del borde, 208×143 a 26 y 28—.

### Y lo que el duelo no tiene se declara, no se esconde

Tres bloques del HUD son del entrenamiento y sólo de él: aciertos y fallos,
estrellas y marcador de sesión. El duelo **no tiene puntuación** (vuelta 45) y
lleva su propio marcador de ronda, así que ahí no miden nada. Va con una
bandera (`<Hud duelo>`) y no con un segundo componente, que es la convención de
la 63: una diferencia entre modos se declara y se ve, o es un fallo de producto.

### Cuatro píxeles que también eran una diferencia que nadie decidió

Montado el HUD, los anchos y los márgenes salían clavados y **los altos no**:
44 px de bloque de vida contra 40, y 21 de FPS contra 16. La causa era la página
del duelo declarando `font: 12px/1.5` en su `body` para su menú y su tienda, y
eso colándose dentro del HUD. La tipografía del juego pasa a estar escrita una
vez (`.hud-layer`, en `styles.css`) y no en cada página.

### El supresor no es un artículo, y el cuchillo tampoco

`ECONOMY.catalogo` vendía un **Supresor** por 250. No lo es: no cuesta nada, es
del arma que ya llevas y se conmuta con el clic derecho en cualquier fase — esa
regla es de la vuelta 64, y el artículo la contradecía en la misma pantalla. Lo
que hacía falta no era un precio sino **decir con qué se pone**, y el sitio
donde se busca eso es la ficha del arma.

De paso, el servidor deja de tratarlo como un `tipo` del catálogo y lo atiende
**antes de mirarlo**: es un interruptor, no una compra, y ahora el código lo dice.

Y el **Vanta** no está en la lista ni puede estar: `catalogoDeTienda()` no deja
pasar un arma de ranura `melee`. No es que se haya quitado —nunca estuvo—, es
que **ahora no puede entrar**: una lista escrita a mano es una lista donde un
día se cuela algo.

### Lo que compras suena al ponértelo, no al pedirlo

Cuatro voces nuevas (`playEquip`), y ninguna es un bip con otro volumen: la
cremallera del chaleco es ruido por un pasa-banda que **sube** de 700 a 4200 Hz
en 180 ms; el casco son dos parciales graves muy amortiguados —lo que dice que
es un casco es que **no** resuena—; el arma es el cerrojo, dos chasquidos
separados 55 ms; la utilidad, un mosquetón con su muelle sonando 200 ms.

**Suena cuando el servidor lo da por tuyo**, comparando el inventario con el de
antes. Eso hace dos cosas de una: suena al ponértelo, que es lo que se pedía, y
la condición «sólo si hay dinero suficiente» **sale gratis** — si no se cobra,
el inventario no cambia y no hay nada que sonar. No hace falta preguntar por el
saldo: la ausencia de cambio es la respuesta.

Y lo que llevas puesto lo dice **la palabra** «Equipado», no sólo un filo de
color: un borde verde de «esto lo puedes comprar» y un borde verde de «esto ya
lo llevas» son el mismo borde.

### Que la ronda se acaba se oye

El rojo ya estaba desde la vuelta 62, a 20 s, y no bastaba: es información en un
sitio al que no se mira, y lo que pasaba jugando era aparecer de vuelta en la
salida sin que nada lo hubiera dicho. **El oído no hay que apuntarlo a ninguna
parte**, que es exactamente el problema.

Quince segundos —lo que dura una fase de compra, que es la unidad de tiempo que
este modo ya tiene— con el contador en rojo y un pitido suave por segundo, el
último más agudo. Se dispara **en el cambio de cifra**, que es el mismo sitio
donde se escribe el reloj: no hay un segundo temporizador que pueda desfasarse
del número que se ve, y en pausa no suena porque el reloj de la ronda es el
número de paso y en pausa no corre. Sale solo, sin una condición más.

Medido (`ronda73`, con la ronda apretada a 25 s): rojo con 15 s por delante y
**15 pitidos**, contados en el máster y no en llamadas a funciones.

### El indicador de orientación: lo que se probó y lo que entró

El encargo decía que la brújula se lee mal en acción rápida y que con el
cuchillo eso importa de verdad. El diagnóstico: sus dos señales son
**comparativas** —el tono de la cola (vuelta 39) y la pendiente del perfil
(vuelta 40)— y las dos piden haber visto la otra vista para saber cuál estás
viendo. Eso vale para información pasiva a doce unidades, que es para lo que se
calibraron. No vale para una pregunta binaria a unidad y media.

**Lo que se probó y no entró: una punta de flecha.** Barbos y muesca, para que
la **silueta** cambiara entre frente y espalda y hubiera una tercera señal que
no fuera comparativa. Medida contra la cuña de siempre en el mismo banco
(`brujula73`): daba **+16% de área** (136 px contra 117 a 12 u), **no mejoraba**
lo que venía a mejorar —la silueta cambia un 15-24% con las dos— y **costaba
tono donde más importa**: a 8 u el Δ de luminancia caía de 20.2 a 10.5, porque
una cola en V enseña menos cara oscura y más costado claro. O sea que cambiaba
la señal que el cuchillo necesita por área que no hacía falta. Fuera.

Queda escrito en `config.js` para que el siguiente que lo piense se ahorre la
vuelta: **la legibilidad de este marcador no está en su forma**, está en el
contraste de su cola.

**Lo que entró son dos señales, y las dos añaden luz en vez de quitarla.**

La primera versión hacía lo contrario —las caras translúcidas fuera del arco de
espalda y opacas dentro— y era un error de dirección que el banco cazó de
inmediato: se pedía que el marcador se leyera **mejor**, y aquello lo dejaba más
apagado el 90% del tiempo para poder encenderlo el 10%. Hundía el Δ de tono de
la vuelta 40 de 34 a 10.

- **La cola se enciende dentro del arco de espalda** (`backShade`). Fuera del
  arco todo queda exactamente como estaba desde la vuelta 40; dentro, la tapa de
  la cola pasa de 45% a verde entero. Es la única cosa que este marcador dice
  que no es *hacia dónde mira* sino *qué puedes hacerle*, y por eso es lo único
  binario que tiene. El arco es el mismo que decide la puñalada instantánea y
  sale de la misma función (`esPorLaEspalda`): dos cuentas separadas serían una
  brújula que promete una espalda que el servidor no da por buena.

  Medido: **24 de 64 píxeles** del marcador cambian y **suben 39 de
  luminancia** — dentro de la banda 34-62 que la vuelta 40 dio por legible.

- **Y la mira dice lo mismo a bocajarro.** El aviso de alcance del cuchillo
  (vuelta 71) llevaba un estado y ahora lleva dos: en rango los cuatro trazos se
  abren y se tiñen; **si además le ves la espalda, giran 45°**. Una cruz y una X
  no se confunden ni de reojo. Sale del **mismo rayo** que ya decide si llegas y
  del mismo `esPorLaEspalda` que decide el instakill, así que no hay una segunda
  cuenta que pueda decir que sí mientras el servidor dice que no.

  Es la regla de la vuelta 71 —«lo publica quien lo tiene»— llevada un paso
  antes en el tiempo, que es donde sirve: un fuerte por la espalda mata lleve lo
  que lleve el otro, o sea que es la diferencia más grande que hay entre dos
  golpes, y hasta aquí sólo se sabía **después** de darlo.

  Y no se toca el anillo, aunque la marca de una baja sí lo use (vuelta 52): ese
  anillo es el del daño recibido, lo anima `Crosshair.damage` con la API de
  animaciones, y encenderlo desde CSS serían dos dueños para la misma propiedad
  — el fallo de la cuña de daño de la vuelta 60, que tardó dos vueltas en verse.

---

## Ronda 74 — El editor de mapas, fase 1

El encargo fue un editor visual para diseñar y editar mapas sin escribir código,
con dos preguntas abiertas: si los parámetros de partida entraban en la primera
versión y cómo un mapa dibujado se vuelve jugable. El diseño entero está en
`docs/propuestas/05-editor-de-mapas.md`; aquí van las decisiones y lo que salió
al construirlo.

### 74.1 El recorte de la rotación, y por qué se propuso antes de empezar

El encargo pedía rotación en X e Y, tejados y triángulos. La colisión de Vektor
es **AABB**: `resolveAxis` resuelve un eje cada vez contra seis cifras, sin
orientación en ningún sitio, y de eso viven `giro180` (girar una caja es mandar
su esquina máxima al otro lado del origen) y la predicción de cliente, que pide
que los dos extremos lleguen al mismo resultado dígito a dígito.

Una caja girada 30° se **dibuja** girada, **para las balas** bien —el rayo va
contra la malla— y **se choca sin girar**. Eso no da un error: da andar contra
aire en una esquina y atravesar la pared en la otra, y en red una corrección por
paso. De ahí la regla que gobierna el proyecto entero:

> **El editor no puede poder construir algo contra lo que el motor no sepa
> chocar.**

Un editor con rotación libre sobre colisión AABB no es un editor con una
limitación: es una máquina de fabricar mapas rotos, y el fallo se descubre
cayéndose por un tejado, no con un banco en rojo. La rotación libre queda como
**vuelta propia del motor** (fase 5), y la decisión —acordada con el encargo— es
no hacerla hasta haber construido dos o tres mapas con lo demás y ver qué se
echa en falta de verdad. Lo que la sustituye mientras tanto es el giro de **90°**
—intercambiar ancho y fondo— más la composición de cajas, que es lo que hay en
los cuatro mapas de hoy.

### 74.2 «El fichero es el mapa», que es la respuesta a cómo se publica

Las tres opciones eran exportar algo que se nos pase, publicar a un servidor, o
escribir en el repositorio. Se eligió la tercera y con una forma concreta:
`src/maps/*.js` se funden en `SCENARIOS`, así que **guardar y publicar son la
misma acción** — el mapa sale en el selector sin tocar `config.js` y el huésped
lo ve igual. No hay un paso de publicación que se pueda olvidar ni un formato de
exportación distinto del que el motor lee.

Publicar **a un servidor** se descartó para este proyecto, y no por pereza: la
geometría de una partida tiene que existir idéntica en los dos clientes **y en
el servidor**, que corre `movement.js` contra un `Scenario` de verdad. Un mapa
que sólo viviera en el navegador de quien lo dibujó es la corrección por paso de
la vuelta 65 otra vez. Que un mapa viaje es «mapas de comunidad» y es una vuelta
suya, con tope de tamaño, saneado de geometría ajena y moderación.

Tres decisiones de forma, y ninguna es de gusto:

- **Módulos `.js`, no `.json` ni `import.meta.glob`.** El huésped de Node
  importa `src/config.js` directamente (vuelta 72), así que un mapa lo tienen
  que poder leer los tres montajes **sin ponerse de acuerdo**: el barrido de
  directorio de Vite no existe en Node, y los atributos de importación de JSON
  no se comportan igual en los dos.
- **La clave la declara el fichero**, no su nombre. Dos sitios diciendo cómo se
  llama un mapa es cómo acaba llamándose de dos maneras.
- **El formato vive en un sitio** (`src/maps/formato.js`) y lo miran el editor y
  el cargador, que es la regla de `compraAbierta` y `escenarioDeDuelo`. Y
  `sanearMapa` devuelve `{ mapa, problemas }`: lo que tira **se cuenta**, porque
  un campo que desaparece en silencio al guardar es cómo un mapa pierde su
  física sin que nadie se entere.

### 74.3 Los parámetros de partida se parten en dos

La segunda pregunta. La respuesta sale de una separación que el código ya tenía:

- **Lo que es del mapa va en el editor**, y pronto, porque **sin ello las
  métricas mienten**: la altura a la que se llega de un salto es
  `jumpSpeed² / (2·gravity)`, así que un panel que no sepa la gravedad del mapa
  no puede decir si una torre se sube.
- **Lo que es de la partida, no.** La duración de una ronda, cuántas hay y los
  segundos de fase de compra viven en `ROUNDS` y se eligen **por sala al
  crearla** (`?compra=`, vuelta 64). Meterlos en el fichero del mapa sería
  modelarlos en el sitio equivocado y crear dos sitios que dicen lo mismo — que
  es exactamente cómo una sala acaba jugándose con dos reglas distintas. Van en
  la página del duelo, como selectores, cuando se quieran.

### 74.4 Lo que hizo falta para que existiera: el escenario suelta su clave

Un escenario **era** una entrada de `SCENARIOS`, y eso vale mientras todos los
mapas estén escritos en `config.js`. Un mapa recién dibujado no está en ningún
catálogo, así que `Scenario`, `scenarioRoom` y `fisicaDeEscenario` pasan a
aceptar **la definición o su nombre** (`definicionDeEscenario`,
`claveDeEscenario`). Es la única pieza sin la que no arranca ninguna fase, y es
pequeña.

**Y la mitad que no se ve**: los dos captadores de `Scenario` —`room` y
`fisica`— preguntaban por `this.key`. Con un mapa sin guardar, cuya clave no
está en el catálogo, eso devolvía la sala de la sala vacía y la gravedad de
fábrica: **el mapa se probaba con una física que no era la suya**, y en silencio.
Van contra `this.definition`.

### 74.5 Tres fallos que salieron construyéndolo

- **Un mapa sin `boxes` tumbaba la escena entera.** Los cuatro escenarios
  escritos a mano declaran siempre las dos listas, así que `for (const box of
  definition.boxes)` nunca había visto un `undefined`. Un fichero a medio
  escribir —que ahora puede existir— se llevaba por delante el montaje.
  `definition.boxes ?? []`.
- **Borrar un mapa a mano no rompe el editor: rompe el juego.** El registro es
  generado y sus importaciones son estáticas, así que un fichero que falta es un
  `ERR_MODULE_NOT_FOUND` **en `config.js`**, o sea la página, el duelo y el
  huésped. El servidor de desarrollo regenera el registro al arrancar, con lo
  que se cura solo; en el build tiene que fallar ruidosamente, que es lo
  correcto.
- **Y un bucle infinito de reinicios, que es el más instructivo.**
  `vite.config.js` importa `src/config.js` —para la ruta del duelo— y `config.js`
  importa el registro de mapas, así que **el registro está en el grafo de la
  configuración**: tocarlo reinicia el servidor de desarrollo, y reiniciarlo
  vuelve a regenerarlo. El síntoma no fue un error: fue la batería entera con
  «0 pass», que es el falso negativo de la vuelta 45 por una puerta nueva — y la
  primera hipótesis (haber tocado `config.js` con Vite corriendo) era la de
  siempre y **no era la causa**. Lo que lo delató fue mirar el registro del
  servidor en vez de la salida de los bancos. Se corta escribiendo **sólo si el
  contenido cambia**.

### 74.5b Y tres del banco, que son de método

Ninguna era del juego, y las tres se leían como si lo fueran:

- **La sonda va dentro de la página, una muestra por frame** (vuelta 49). Medir
  con `evaluate` desde fuera mete el viaje de ida y vuelta en la distancia y no
  en el tiempo: la misma marcha salía 6.44 u/s en una máquina tranquila y 3.64
  en una cargada, y la parada contra la caja salía en z 8.830 en vez de 8.400.
  Con la sonda dentro sale 6.24 y 8.400 **a 5.5 fps**.
- **Y se arma antes del gesto que mide.** Capturar la altura de partida en el
  `evaluate` que sigue a la pulsación de salto la toma con el jugador ya
  subiendo: medía lo que le quedaba, no el salto — 1.78 u contra 3.26.
- **Un banco que dibuja por software paga por píxel.** A 1000×700 la página
  caía a 1.3 fps; a 640×420 sube. Por eso el banco **imprime sus fps** y afirma
  antes que nada que ha visto frames de verdad. Es la regla de la vuelta 61 —un
  banco se pasa solo— por la puerta del tamaño de la ventana.
- **Y la lección de fondo, que llegó en la 75: la velocidad de un jugador se
  mide con el reloj del mundo.** Con pocos frames `SIM.maxFrameDeltaMs` hace que
  el mundo vaya a cámara lenta *a propósito*, así que dividir por tiempo de
  pared mide el refresco y no el juego: el mismo paseo daba **2.61 u/s contra
  pared y 5.88 contra `gameTime`**. Los rojos de esa tanda no eran del juego ni
  del entorno: eran del divisor. Y los topes de espera van en el mismo reloj,
  con el de pared sólo de seguro.
- **Y el guardado se pide por HTTP, no desde la página.** Guardar reescribe el
  registro, el registro cuelga de la configuración de Vite y eso reinicia el
  servidor y recarga la página: el `evaluate` moría con un «Execution context
  was destroyed» que no se parece en nada a su causa.

### 74.6 Qué se ha verificado y cómo

`editor74.mjs`, con el servidor de desarrollo levantado:

- **Que un escenario montado desde una definición es el mismo que montado desde
  su clave**, para los cuatro mapas de hoy y comparando la huella entera —sala,
  física, aparición, cajas y rampas—. Y que un mapa **sin catálogo** trae su
  sala (24×24×8), su física (gravedad 13, techo del aire 12) y su geometría, que
  es lo que el fallo de §74.4 se comía.
- **Que un mapa da la vuelta entera sin perder un dígito**: los cuatro se sanean
  sin una sola queja, se escriben como módulo, se vuelven a leer y salen
  idénticos — y el escenario montado desde lo que volvió es el mismo mundo.
- **Que el saneado se queja en vez de callarse**: de cuatro piezas mal (altura
  desconocida, tamaño cero, base por encima de su techo) entra una, y hay cuatro
  quejas contando el campo inventado.
- **Que probar es el motor**: el escenario del motor es el del editor, el
  jugador sale donde dice el mapa, **anda a 5.88 u/s** sostenidos por suelo
  libre —el suelo antes que el techo, regla de la vuelta 57—, se **para en
  z 8.400** contra una pieza cuya cara está en 8.0 (radio 0.4), y un mapa con
  física propia le llega al movimiento con sus tres números y despega. La
  marcha va contra **el reloj del mundo** y el banco imprime a qué porcentaje
  del tiempo real corre. Con eso sale verde **a 0.3 fps y con el mundo al 3%
  del tiempo real**: los mismos 5.88 u/s y la misma z 8.400. Una medida de este
  juego que dependa del refresco está mal hecha, porque el juego no depende de
  él desde la vuelta 44.
- **Que guardar es publicar**: el fichero se escribe declarando su clave, y **un
  proceso de Node recién arrancado** —no una reimportación con `?v=`, que
  invalida `config.js` y no su registro— lo ve como un escenario más, en el
  selector, y montado desde el fichero es el mapa que se dibujó.
- Y **cero errores de página**, contados como fallo (vuelta 60).

La batería del entrenamiento (46 suites) y los bancos de escenario
—`mapa66`, `pilares72`, `rutas`, `spawn43`, `hitbox65`, `vanta71`, `audit`,
`rondas62`— siguen verdes: el cambio de `SCENARIOS` a una fusión y el de
`Scenario` a aceptar definiciones no movieron nada.


## Ronda 75 — El historial de un mapa

El encargo, tras probar la fase 1 del editor: backup o control de cambios, un
comentario al guardar, y una lista de versiones con fecha para restaurar.

### 75.1 Por qué no es git, que era lo obvio

Guardar con un comentario, listar por fecha y volver atrás **es** git. La razón
de no usarlo no es técnica y conviene dejarla escrita porque la propuesta se
repetirá: **la historia de este repositorio está curada** —sus mensajes son el
porqué de cada vuelta, y se leen— y cuarenta commits de «he movido una caja» la
degradarían. Son dos cosas con lectores distintos y con vidas distintas:

> La historia del repo es un artefacto; la de un mapa mientras se construye es
> material de trabajo.

Así que el historial es un fichero al lado del mapa
(`src/maps/historial/<clave>.json`) y **git lo hace duradero al ritmo de quien
commitea**, no al de cada guardado. No hay un segundo sistema de durabilidad: el
fichero viaja en git como todo lo demás.

Y es **JSON aunque el mapa sea un módulo**, por una asimetría que vale la pena
ver: el mapa lo tienen que leer los tres montajes (Vite, Node y el navegador) y
su historial **sólo el servidor de desarrollo**. Lo que no entra en el juego no
paga el formato del juego.

### 75.2 Restaurar carga, no escribe

La versión se pone delante en el editor y se vuelve la del disco **al guardar**.
De ahí salen tres propiedades que no se tienen con un restaurar que escribe:
volver atrás **no puede romper el mapa**, se puede mirar una versión vieja sin
comprometerse, y lo restaurado queda como **una versión más** y nunca como un
borrado — o sea que restaurar también es deshacible.

### 75.3 Dos fallos distintos, dos mecanismos

«Backup automático» y «control de cambios» suenan a lo mismo y no lo son:

- **Volver a una versión guardada** → el historial.
- **No perder lo que todavía no has guardado** → un borrador en `localStorage`,
  que sobrevive a cerrar la pestaña.

Y un tercero que salió del primero: **guardar recarga la página**, porque el
mapa es un fichero que `config.js` importa y `SCENARIOS` acaba de cambiar. Lo
que cruza la recarga es un **relevo** por `sessionStorage` con el mapa exacto y
la cámara. Volver a leer el mapa de `SCENARIOS` no vale: la recarga llega antes
de que el servidor sirva el registro nuevo, así que **guardar te dejaba delante
de un mapa en blanco** — el mapa estaba en el disco y el editor no lo enseñaba,
que desde fuera se lee como haberlo perdido.

Qué se abre al entrar, en orden: relevo, borrador, lo que diga la dirección
(`/editor/#clave`), mapa en blanco.

### 75.4 Y el hallazgo grande: `vite.config.js` no puede importar `src/`

Importaba `src/config.js` —para la ruta del duelo— y `config.js` importa el
registro de mapas. Consecuencia: **cada mapa era una dependencia de la
configuración de Vite**. De ahí salían tres problemas que parecían distintos:

1. **Guardar reiniciaba el servidor entero**, no sólo recargaba la página.
2. **Regenerar el registro también**, y por eso la vuelta 74 tuvo que escribirlo
   sólo si cambia para no entrar en bucle. El arreglo era bueno y la causa
   estaba una capa más abajo.
3. Y el que no tiene vuelta: con el registro apuntando a un mapa borrado, **el
   servidor de desarrollo no podía ni arrancar**, y lo único que podía curarlo
   —`regenerarRegistro`— vive dentro del servidor que no arranca. Un mapa
   borrado a mano dejaba el proyecto sin forma de levantarse salvo editando el
   registro a mano.

Los módulos se cargan ahora **al atender**, con el especificador construido en
tiempo de ejecución para que el empaquetador de la configuración no los siga. El
precio es el de siempre y ya estaba escrito (§4 de `CLAUDE.md`): tocar
`config.js` o `formato.js` pide reiniciar el servidor de desarrollo.

Y el registro se regenera además **cuando un mapa aparece o desaparece**, no
sólo al arrancar: borrarlo a mano con el servidor levantado ya no rompe nada.

### 75.4b Y lo que costó más caro: un `await` en el camino de todas las peticiones

Sacar `config.js` de la configuración obligó a cargarlo al atender, y la primera
versión dejó el middleware del duelo **`async`**: un `await` antes de
`siguiente()`, en **cada** petición del servidor de desarrollo, que en
desarrollo son cientos de módulos por carga de página.

No dio ningún error. Dio **diecinueve suites en rojo** con síntomas que no se
parecían entre sí —binds que no responden, audio con el pico a 0.0000, una
desactivación que no llega a término, velocidades `undefined`— y que eran todas
lo mismo: esperas que se agotaban porque la página tardaba más en estar lista.

Lo que lo encontró no fue depurar los síntomas, que apuntaban a cinco sitios
distintos: fue **poner el `vite.config.js` de antes y volver a pasar una suite**.
Verde con el viejo, rojo con el nuevo, y ahí se acabó la búsqueda. Es la
disciplina de la vuelta 61 —comprobar contra qué se está midiendo— aplicada a un
fichero de configuración.

El arreglo: `configureServer` **es** `async` y resuelve lo que haga falta al
arrancar, y el middleware que registra dentro es **síncrono**. El camino
caliente del servidor de desarrollo no lleva promesas, igual que el bucle del
juego no asigna memoria. Y el del editor sale pronto mirando el prefijo de la
URL cruda antes de construir un `URL`.

### 75.5 Dos cosas más que se arreglaron de camino

- **El módulo lo escribe el servidor, no el navegador.** Hasta aquí la página
  mandaba el texto del fichero y el endpoint lo volcaba tal cual: un punto de
  escritura arbitraria —aunque sea de desarrollo— y, peor, una segunda idea de
  cómo se serializa un mapa. Ahora viaja **el dato**, se sanea con la misma
  función que usa el editor y el fichero sale de `mapaComoModulo`.
- **El desplegable de «Abrir» decía otro mapa.** Asignarle una clave que
  todavía no está entre sus opciones —un mapa recién guardado— deja al navegador
  con la de antes, así que enseñaba «El Espejo» con otro mapa delante. Se
  comprueba contra **sus opciones**, no contra `SCENARIOS`.

### 75.6 Qué se ha verificado y cómo

`hist75.mjs`, contra la página y por la interfaz —botón, diálogo, comentario—,
no llamando a funciones:

- **Que guardar pregunta y anota**: el mapa y su historial quedan en el disco,
  con una versión que lleva su comentario, su fecha y **el mapa entero dentro**
  (no un parche). Y que tras la recarga que provoca guardar **sigue abierto el
  mapa guardado**, con la dirección diciéndolo.
- **Que dos guardados iguales no son dos versiones**, y que el panel lo dice en
  vez de callárselo.
- **Que la lista sale con fecha, comentario y piezas**, la más reciente arriba y
  marcada como la que está en el disco.
- **Que restaurar carga y no escribe**: el editor enseña la versión vieja y el
  fichero del disco **no se ha tocado**; el comentario del próximo guardado
  viene propuesto («restaurado de…»); y guardar deja **una versión más**, no un
  borrado.
- **Que el borrador sobrevive a recargar**: lo que no se había guardado sigue
  ahí tras F5, y el panel dice que es un borrador.
- Y **cero errores de página**, contados como fallo.

`editor74` sigue verde con el punto de guardado en su forma nueva.


## Ronda 76 — El editor construye de verdad

La fase 2 tal como estaba planteada —menú de formas, candados por eje, rejilla e
imán, giro de 90°, deshacer/rehacer y aviso de presupuesto— más siete ajustes
que salieron de usar la fase 1. Lo que sigue es lo que **no** salió como estaba
escrito, que es de lo único que merece la pena acordarse.

Y una condición que gobernó la vuelta entera: **los mapas oficiales están
editados a mano en la máquina de Yago** —Plano A, El Espejo y Los Pilares—, con
cambios razonados y probados que no están en el repositorio. Nada de esta vuelta
toca `SCENARIOS` ni `src/maps/index.js`.

### 76.1 El instrumento se midió antes de creérselo, y costó tres versiones

El presupuesto estaba diseñado como «se mide en vez de contarse», y eso era lo
correcto. Lo que no se había previsto es que **un paso de mundo no se puede
cronometrar en un navegador**: `performance.now()` viene acotado a 100 µs fuera
de un contexto aislado y un paso contra diecisiete cajas cuesta mucho menos que
eso.

Las dos primeras versiones **salían verdes midiendo el reloj**:

| Versión | Qué cronometraba | Qué decía |
|---|---|---|
| paso a paso, p99 de 400 | un paso | **0.000 ms en Los Pilares** |
| bloques de 25, p99 de 40 | 25 pasos | **0.0010 con 0 piezas y 0.0010 con 600** |
| total de 2000 pasos, media | la tanda entera | 0 piezas 0.0000 · 200 0.0001 · **1500 0.0004** |

Sólo la tercera responde a lo que se le pone delante. Es la regla de la vuelta
46 —una proporción necesita que se vea su denominador— aplicada al cronómetro, y
la de la 62 —cinco disparos y la mediana, con las capturas completas impresas al
lado— por la misma puerta. El banco lo guarda **enseñando la escalera**: un
número que sale igual con 0 piezas que con 600 no mide el mapa.

**Y medirlo cambia para qué sirve el panel.** Con colisión AABB y mallas
fundidas por tipo, un mapa **no puede** romper el presupuesto por geometría:
1500 piezas cuestan 0.0004 ms por paso contra los 0.2 presupuestados y los 0.07
de un paso real con ocho muñecos. El aviso queda como cortafuegos para el día
que una pieza cueste de verdad —un vano, un tejado, una rotación libre— y lo que
el panel hace hoy es enseñar lo que cuesta tu mapa. Son dos cosas y conviene no
confundirlas al leerlo.

### 76.2 «Sin muñecos» no es «un mapa sin rutas»

El interruptor de probar con o sin muñecos se escribió primero quitándole las
rutas al mapa antes de montarlo, razonando que de ahí sale dónde puede nacer
uno. **Es falso, y el banco lo cazó a la primera**: sin rutas las dianas no
desaparecen, se muestrean por cono como en la sala vacía. Salía una igual.

Lo correcto es que **si un mundo tiene muñecos es del mundo**, y entra por la
misma puerta que el escenario: `new Engine(…, { escenario, dianas })`, la de la
vuelta 60. La alternativa —escribir `simultaneousTargets` en el store— era
reescribirle al jugador sus ajustes por abrir el editor, que es exactamente el
fallo que esa puerta existe para no repetir.

Por dentro no hay un camino nuevo: `dianas: false` pone `maxAlive` a cero y no
siembra. Las dos cosas hacen falta, porque la primera diana la saca
`beginSession` por su cuenta.

### 76.3 El HUD al probar es el del juego, montado una vez

Probar no enseñaba ni mira ni HUD. Lo que hacía falta no era escribirlos: es
`montarCapaDeDuelo`, lo mismo que la vuelta 73 llevó a la página del duelo. Una
tercera versión aquí habría sido el fallo de producto de la vuelta 63 por la
puerta del editor — un mapa se prueba con lo que se ve jugando o no se está
probando lo mismo.

Se monta **una vez**, al arrancar la página y no en cada «Probar»: React monta y
desmonta en modo estricto, y pagar ese baile por prueba además de perder el HUD
entre ellas no tiene sentido.

Y una trampa de medida: **la mira mide 0×0 y se ve igual**. Su caja es un punto
y quien dibuja son sus cuatro trazos, colocados en absoluto, así que preguntarle
al navegador si el contenedor «es visible» dice que no. Se mide un trazo.

### 76.4 «Base» era un desplegable, y el encargo tenía razón

Lo que uno quiere al apilar es poner una caja encima de otra, y con un menú de
nombres de alturas (`media`, `alta`) eso hay que deducirlo. Ahora son dos
controles y una frase: un **número** —desde qué altura empieza— y un botón que
la apoya en el techo de lo que tenga debajo.

Y **subir una pieza la sube entera**. La primera versión del campo numérico
movía sólo la base, o sea aplastaba la caja contra su propio techo hasta hacerla
desaparecer. El grosor se conserva, que es lo que uno acaba de dibujar.

### 76.5 WASD no puede pedir el botón del ratón

La fase 1 dejó el vuelo detrás del botón derecho para no robarle las teclas a
quien escribe en el panel. Usándolo se ve el precio: se mira una esquina, se
suelta, y para acercarse hay que volver a agarrar.

Las dos condiciones que de verdad hacían falta son **el puntero sobre la vista**
y **el foco fuera de un campo**; el botón las cumplía de rebote. Es
`typingInField` (vuelta 56) en esta página — el editor sí tiene campos de texto,
así que la pregunta «¿esto es escribir o es jugar?» hay que contestarla, no
evitarla. Al salir el puntero de la vista se sueltan las teclas, o cruzar al
panel con W apretada dejaría la cámara volando sola.

### 76.6 Dos ids iguales, y el síntoma no se parece

`#paso` estaba dos veces: el tirador numérico de la fase 1 y el desplegable de
incrementos de ésta. El navegador no se queja, `getElementById` devuelve el
primero y el banco murió con un «Element is not a `<select>`». Un id repetido es
una variable global duplicada con otro nombre.

### 76.7 El borrador no manda sobre la dirección

Un borrador de **otro** mapa se ignora si la barra pide uno concreto. Sin esto,
`/editor/#pilares` abría lo último que se hubiera tocado y no había forma de
decir cuál se quiere — y la primera versión del banco lo leyó como «Los Pilares
tiene 3 piezas».

### 76.8 Y el tamaño de la sala ya tenía tope, pero no se veía

`SALA` acota lado a 10–200 u y alto a 4–60 desde la fase 1, y lo aplica el mismo
saneado que lee un mapa al montarlo: un número fuera de rango no llega al juego
venga del editor o de un fichero escrito a mano. Lo que faltaba era **decirlo en
la pantalla** y que los campos lo lleven en su `min`/`max`.

**No se ató al presupuesto, y no debe atarse.** Son dos límites distintos: el de
la sala es duro y del formato, el presupuesto es una medida de lo que cuesta la
colisión. Una sala de 200×200 con cuatro cajas es barata y una de 40×40 con
cuatrocientas no lo sería; derivar uno del otro mentiría en los dos sentidos.

### 76.8b Y una tanda entera de falsos negativos, otra vez por lo mismo

La batería del entrenamiento salió con **nueve suites en rojo** y varias con
`0 pass` —la página ni cargaba—, con síntomas que no se parecían entre sí: picos
de audio a 0.0000, la casilla del silenciador que no conmuta, el explosivo que
no se desactiva. Ninguno tenía nada que ver con esta vuelta.

Son dos causas encadenadas y las dos están ya escritas en `CLAUDE.md` §4; lo que
faltó fue aplicarlas:

1. **La primera tanda corrió a la vez que los bancos del editor**, que escriben
   mapas de prueba y con ellos reescriben el registro, o sea recargan la página
   por debajo de la suite que está midiendo. Es «un banco de red se pasa solo»
   (vuelta 61) aplicado al editor.
2. **La segunda corrió contra un servidor con el store duplicado por HMR.** Se
   había tocado `src/game/engine.js` con Vite corriendo, y el síntoma fue el
   de siempre: `updateSettings({ scenario })` devolvía el valor nuevo y
   **el motor seguía montando `empty`**. Medido: `scenario.key` se quedaba en
   `empty` seis segundos después del cambio; con el servidor recién lanzado,
   `largoYPuerta` con sus 20 piezas en 300 ms.

Lo que hay que llevarse: **antes de creerse un rojo, relanza el servidor y
comprueba que nada más está tocando el puerto.** Y la regla nueva que esta
vuelta añade a la lista: **los bancos del editor cuentan como «tocar el
servidor»**, porque guardar un mapa invalida `config.js`.

### 76.9 Qué se ha verificado y cómo

`ed76.mjs`, contra la página y por la interfaz, **41 aserciones**:

- **Que las formas son presets de la misma caja** y ninguna es algo contra lo
  que el motor no sepa chocar; que el giro de 90° intercambia ancho y fondo
  **conservando el centro**.
- **Que un candado es que esa medida no la toca nada**, y que soltarlo la
  devuelve.
- **Que el imán pega a la cara de al lado y apagado no pega** — medido con un
  paso de rejilla que **no cae solo en la cara**, porque con paso 1 las dos
  columnas coincidirían en lo mismo (vuelta 46).
- **Que subir una pieza conserva su grosor**, que apilar la apoya en el techo de
  la de abajo, y que un vano se avisa en vez de prohibirse o callarse.
- **Que rehacer devuelve el mapa al dígito** y que un cambio nuevo tira la rama.
- **Que el presupuesto sube con la geometría** (0 · 600 · 1500 piezas) y sigue
  muy por debajo del presupuesto del proyecto, con su denominador impreso.
- **Que WASD mueve la cámara y el ratón sigue orbitando.**
- **Que los tres láseres se encienden y se apagan por separado.**
- **Que probar trae la mira y el HUD del juego** —medidos por un trazo de la
  mira y por la clase `hud-layer` del contenedor— con vida, bloque de arma y la
  marca de Vektor.
- **Que sin muñecos la sala está vacía y es el cupo a cero**, con el mapa
  conservando sus rutas; y que con el interruptor puesto sale al menos uno.
- Y **cero errores de página**, contados como fallo.

`editor74` y `hist75` siguen verdes, y la batería del entrenamiento también.



## Ronda 77 — El editor deja de ser sólo geometría

Seis puntos salidos de usar la fase 2 y la fase 3 entera. Lo que sigue es lo
que costó una decisión o un diagnóstico.

### 77.1 El panel va antes de la fase 3, y el precedente tiene nombre

El encargo dejaba abierto si el rediseño de interfaz iba antes, después o en
paralelo. Va **antes**, y la razón es aritmética: la fase 3 pasa el panel de
seis secciones a once. Una barra lateral de 300 px con once secciones no se lee,
se recorre con la rueda — y construir la fase 3 contra ella habría sido
construirla dos veces.

El precedente es `menu62`: el menú del duelo creció una fila por vuelta hasta
que los dos botones de abajo quedaron **fuera de la ventana**, y el banco lo
dijo en rojo durante tres vueltas antes de que nadie lo pasara. La lección no
era «mide el menú», era **no dejes que una pantalla crezca sin un sitio a donde
crecer**.

Tres cosas del diseño nuevo que no son de gusto:

- **La barra dice el estado y el panel guarda los mandos.** Si para saber
  cuántas piezas llevas hay que abrir el panel, el panel se queda abierto — y
  entonces no era flotante, era la barra lateral con más pasos.
- **El telón se come el clic que cierra.** Sin él, cerrar pinchando fuera
  llegaba al lienzo y seleccionaba o arrastraba una pieza. **Un gesto de cerrar
  no puede editar el mapa**, que es la misma idea que el clic de captura del
  duelo y sus `.control` (vuelta 48).
- **ESPACIO se intercepta sobre un botón y no sobre un campo.** Sobre un campo
  es un espacio, evidentemente. Sobre un botón el navegador lo leería como
  «pulsa el que tiene el foco», así que con una pestaña recién elegida la tecla
  del panel sería «repite lo último». Aquí ESPACIO significa el panel, siempre.

### 77.2 «Sin muñecos» ya se había equivocado una vez; el fondo no podía

La vuelta 76 aprendió que quitarle las rutas a un mapa no quita las dianas. El
fondo panorámico tenía la misma trampa por el otro lado: **montarlo como una
pieza más** habría sido una pared invisible a ciento sesenta unidades que para
balas y tapa apariciones.

Va en su propia malla, fuera de `this.group`, **fuera de `occluders`** y fuera
del presupuesto. Medido en `ed77`: los oclusores no cambian al ponerlo, y el
presupuesto sigue contando exactamente las piezas del mapa.

Y **vive en `Scenario`**, no en quien dibuja, que es lo que hace que salga igual
entrenando, en el duelo y en el editor — la convención de la vuelta 63.

### 77.3 Un horizonte se mide en ángulo, no en píxeles

La primera versión de la ciudad tenía `alturaMax: 0.34` sobre una textura
equirectangular. Eso son **sesenta grados de elevación de rascacielos**: no es
una ciudad de fondo, es estar dentro de un pozo — y en la captura se veía al
instante. Un horizonte urbano visto desde la calle ocupa diez o doce grados, o
sea 0.06.

La lección repetible: **cuando un número va a parar a una textura de 180°, el
número no está en píxeles**. Y que se vio mirando una captura, no leyendo el
código — que es la nota de la vuelta 48 otra vez.

### 77.4 Una cara ya cuadrada no gasta el raíl

El imán pasa a mover por **un solo eje**: engancharlos los dos a la vez es lo
que desviaba la pieza de lado al arrimarla a su vecina.

Pero la primera versión del raíl rompió `ed76`, y por algo que sólo se ve
midiendo: al construir en fila, **el otro eje suele estar ya perfectamente
alineado**, o sea a distancia cero — y cero gana siempre. El raíl se lo llevaba
un enganche que no movía nada, y el único que hacía falta se quedaba sin
aplicar. **Mover cero no es enganchar**, así que un candidato a distancia
despreciable no compite.

### 77.5 Un error de signo se evita escribiendo el vector una vez

A y D estaban cambiadas en la cámara del editor. La causa: los senos y cosenos
metidos a mano en cada componente
(`centro.x -= (adelante * sin + lado * cos)`), que es donde un signo se cuela
sin que se note. Ahora se escriben **el frente y el derecho como dos vectores** y
se suman. Es el error de 180° de la vuelta 60 en pequeño, y se evita igual:
donde hay una convención, se escribe una vez y se le pone nombre.

### 77.6 El tiro de herramienta corta antes de que eso sea un arma

La primera versión cortaba dentro de `_shoot`, que parecía el sitio —es donde
está el rayo—. El banco midió que **seguía gastando munición**: `_tryShoot` hace
la cadencia, el retroceso, el patrón y la munición **alrededor** de `_shoot`.

El corte va arriba del todo, con su propio ritmo (`EDITOR.plantarMs`) y no el
del arma que lleves: con la Scout serían 1.25 s entre muñeco y muñeco y con la
pistola ocho por segundo con el botón apoyado.

### 77.7 Qué se ha verificado y cómo

`ed77.mjs`, contra la página y por la interfaz, **51 aserciones**:

- **El láser a la base** con la pieza en el suelo y subida a 2.6.
- **El imán mueve un eje**, y el otro sólo lo mueve la rejilla — comparado
  contra la rejilla calculada en la página, no contra un número escrito a mano.
- **D a la derecha y A a la izquierda**, con la cámara mirando a −Z.
- **El panel** abre con ESPACIO, cierra con un clic fuera **sin tocar ninguna
  pieza**, y escribiendo en un campo ESPACIO es un espacio.
- **El fondo** se monta, **no entra en los oclusores**, no cuenta como pieza en
  el presupuesto y sobrevive al saneado.
- **La fase 3**: un mapa de entrenamiento no enseña salidas vacías; declararlo
  de duelo las saca, son dos, en extremos opuestos y **mirándose**; el que sale
  en +Z mira a −Z y no a la pared de su espalda; la medida de salidas dice la
  distancia **y si se ven**; zona, caja de compra, física y dotación sobreviven
  al saneado sin una queja; y la nota de física calcula el ápice (3.26 u con la
  gravedad de Los Pilares).
- **La simetría** se aplica duplicando lo que no está centrado y dejando lo que
  sí, y la comprobación pasa de «1 sin pareja» a «todas cuadran».
- **Probar**: un clic planta un muñeco **sin gastar munición ni contar como
  disparo**, el cuerpo es el del juego, **G** vuela y sube 7 u, apagarlo deja
  caer sin daño, y al volver a editar los muñecos se sueltan.
- Y **cero errores de página**, contados como fallo.

`editor74`, `ed76` y `hist75` siguen verdes —los dos últimos, adaptados al panel
flotante— y la batería del entrenamiento también.

Y una cautela más para `editor74`, que ya la tenía escrita y se volvió a
tropezar con ella: corriendo **a la vez que otro banco** bajó a **0.6 fps** y la
aserción del salto falló, porque a ese ritmo cabe un vuelo entero entre dos
frames. Sola, 17.5 fps y verde. Es «un banco se pasa solo» (vuelta 61), y el
número que lo delata lo imprime el propio banco.



## Ronda 78 — Lo que se configura, se ve

Una sesión de pruebas de verdad —la primera larga con el editor de la 77— dejó
diecisiete puntos, y casi todos son la misma frase dicha de maneras distintas:
**un número sin representación no es una interfaz austera, es una barrera de
entrada.** Eso pasa a ser la convención permanente de Alchemist (§3 de
`CLAUDE.md`) y gobierna media vuelta; la otra media son cuatro fallos del juego,
uno de ellos gordo.

### 78.1 La diana clásica llevaba ocho vueltas sin poder morir

El fallo más caro de la tanda, y el que mejor enseña. En la vuelta 70, con la
llegada de la Scout, `applyHit` dejó de leer `part.damage` y pasó a preguntar a
`zoneDamage(zona, arma)`, que es la función que hace que un arma pegue igual a
un muñeco que a una persona. Correcto, y bien razonado entonces.

Lo que nadie miró es de dónde salía su tabla de zonas:

```js
const ZONES = {}
for (const part of TARGET_TYPES.hitbox.parts) ZONES[part.zone] = part
```

**Sólo del hitbox.** La Clásica y el Cono declaran una zona única llamada
`single`, que no está ahí, así que `ZONES['single']` es `undefined` y
`?? 0` devolvía **cero daño**. Consecuencia: desde la vuelta 70, en el modo con
el que el juego arranca de fábrica, **las dianas eran invulnerables**. Se ponían
blancas —que es lo que hace una zona que encaja un impacto y sobrevive— y no se
rompían nunca.

No dio un error. No salió en ninguna suite. Y esa es la enseñanza, que es de
tipo y no de caso: **una zona desconocida valía cero en silencio**. La tabla se
deriva ahora del catálogo entero, y la excepción de no escalar sale del número
en vez del nombre —`base >= TARGET.maxHealth`—, que cubre la cabeza (por la
regla del casco) y la zona única (que es el blanco entero) por el mismo motivo
en vez de por dos reglas distintas. `dianas78` comprueba que ninguna zona del
catálogo hace cero.

Lo que **no** cambia ni un dígito: torso 50, piernas 34, cabeza 100, y la Scout
sigue multiplicando por 2.2 lo que multiplicaba.

### 78.2 Cinco estrellas no existían, y se puede demostrar

El encargo decía «se siente demasiado punitivo, casi imposible pasar de tres».
No era una sensación. Despejando el corte de 5★ de la fórmula de entonces:

```
0.5·precisión + 0.5·tiempo + 0.1·daño + 0.1·muertes  ≥  0.9 · 1.2
```

con precisión llena, sin daño y sin muertes queda `tiempo ≥ 0.76`, y como el
tiempo era `1 − transcurrido / 45 s`, eso es **desactivar en 10.8 segundos**.
La pulsación de desactivar dura 3 y cruzar el Plano A en diagonal, 8.1. **Cinco
estrellas eran inalcanzables por construcción**, y cuatro pedían una partida
perfecta.

Tres cambios, y los tres son la misma idea: que lo que se mide tenga suelo y
techo alcanzables.

1. **El tiempo se mide contra un par** (`SCORING.timeParMs`, 20 s) y no contra
   el cero. Por debajo del par vale 1; de ahí a que reviente la bomba, cae en
   recta. Los 20 s no son un número redondo: son llegar (8.1 s medidos),
   desactivar (3 s) y margen para el combate del camino. Y el par se acota por
   debajo de la cuenta atrás, porque igualarlo dejaría el componente a 1
   siempre — un techo sin suelo, que es lo que la vuelta 57 prohibió.
2. **El daño deja de ser un acantilado.** Con la referencia en 100, dos balas al
   torso ponían el componente a cero y ya no se distinguía «me han rozado» de
   «me han barrido». Con tres barras de vida, una bala cuesta **0.014 de nota**
   contra los 0.042 de antes: deja de ser lo que decide una estrella, que era la
   queja literal del encargo.
3. **Los cortes se recortan** a 0.95 / 0.78 / 0.56 / 0.34. El 0.95 es lo que
   hace que «impecable» signifique algo: deja fuera una muerte —que hunde dos
   componentes a la vez— y deja dentro un par de balas encajadas.

Medido sobre las mismas ocho partidas, antes y después:

| partida | precisión | tiempo | daño | muertes | antes | ahora |
|---|---|---|---|---|---|---|
| Impecable | 100% | 18 s | 0 | 0 | 0.833 ★★★★ | **1.000 ★★★★★** |
| Impecable + 1 bala | 100% | 18 s | 50 | 0 | 0.792 ★★★★ | **0.986 ★★★★★** |
| Impecable + 1 muerte | 100% | 18 s | 100 | 1 | 0.722 ★★★ | **0.944 ★★★★** |
| Impecable, lenta | 100% | 30 s | 0 | 0 | 0.722 ★★★ | **0.833 ★★★★** |
| Muy buena | 92% | 25 s | 50 | 0 | 0.694 ★★★ | **0.869 ★★★★** |
| Buena | 80% | 32 s | 120 | 0 | 0.537 ★★ | **0.683 ★★★** |
| Normal | 70% | 38 s | 200 | 1 | 0.412 ★★ | **0.492 ★★** |
| Floja | 50% | 44 s | 300 | 2 | 0.245 ★ | **0.253 ★** |

La escalera baja de una en una y no se salta un peldaño; la fila de «Impecable,
lenta» es la que mejor lo dice, porque es la partida que el encargo describía.
**Se calibra jugando**, como todo el balance: lo que esta vuelta arregla es que
haya algo que calibrar.

### 78.3 Un ajuste que sólo leía un modo

«La duración dice ser sólo para Deathmatch pero debería aplicar a cualquier
modo», y además un bug: puesta en «infinito» con dianas clásicas, el cronómetro
seguía contando. Son la misma cosa. `deathmatchDuration` lo leía únicamente el
Deathmatch; el gridshot cronometrado duraba `SESSION_DURATION_S` pasara lo que
pasara. **Un control puesto que el juego ignora** es el fallo de la vuelta 67
otra vez.

Pasa a ser `sessionDuration` y vale para los dos modos. Lo que hacía falta
decidir bien es el valor de fábrica: abrir el catálogo tal cual habría dejado
«Jugar ahora» sin límite de serie, o sea cambiarle el juego a quien no ha tocado
nada. Por eso hay una entrada más, **`mode` = «la del modo»**, que es el valor
por defecto y devuelve exactamente lo de antes — 30 s jugando ahora, sin límite
en Deathmatch. Quien no lo toque no nota nada; quien lo toque, manda.

Y renombrar un ajuste **se traduce, no se tira**: `sanitizeSettings` mira la
clave vieja cuando no está la nueva, que es `LEGACY_WEAPON_KEYS` aplicado al
nombre del ajuste en vez de al de su valor. Sin eso, a quien tuviera cinco
minutos puestos se le habrían quedado en fábrica sin explicación.

La ronda con explosivo sigue siendo suya: su cuenta atrás *es* el reloj de esa
sesión, y eso ya estaba resuelto con `!this.objectiveRunning`.

### 78.4 El panel de opciones abría por el final

La hipótesis del encargo era razonable —«recuerda la posición de la última
vez»— y era falsa. El `autoFocus` estaba en el botón «Volver», que es el
**último** elemento de un panel que además *es* el contenedor con scroll: el
navegador lo traía a la vista al montarlo y arrastraba la lista entera. El
primer ajuste no se veía nunca.

El foco tiene que ir a alguna parte —Escape y el tabulador lo necesitan—, así
que va al panel, que está arriba del todo, con `scrollTop = 0` explícito además
por si algún día vuelve a haber un hijo autoenfocado. Medido: el panel desborda
de verdad (2584 px contra 670 de ventana), abre en 0, y bajarlo a 1914 y
reabrirlo lo devuelve a 0.

### 78.5 El cono de aparición, dibujado

«Un slider con un cono láser translúcido detrás del menú para ver el efecto en
vivo.» Es la convención de Alchemist aplicada al juego, y por eso entra: un
número de grados no se sabe leer hasta haber jugado una ronda con él.

Lo que hace que el dibujo valga algo es que **sale de las mismas cuentas que
sortean una diana**: el eje se lo pide a `Targets.ejeDeAparicion` —que es quien
acota el cabeceo, y sin ese acotado mirar al suelo mandaría las dianas bajo
tierra— y el rango de distancias, a `rangoDeDistancia`. Dibujarlo con una copia
de la fórmula habría sido un dibujo que promete un sitio donde no aparece nadie,
que es exactamente lo que el cono viene a evitar.

Dos decisiones de alcance:

- **La apertura que se toca es la total**, no el semiángulo. Partir por dos es
  una cuenta que el jugador no tiene por qué hacer, así que
  `SPAWN.coneHalfAngleDeg` pasa a **derivarse** de `TARGET_TYPES.classic`.
- **El valor de fábrica es de cada tipo**, y cambiar de tipo lo arrastra como ya
  arrastraba la distancia. El hitbox nació con un frente de 110° —por encima del
  encuadre a propósito, para que alguno nazca fuera del cuadro— y la Clásica con
  36: son dos ejercicios distintos, no el mismo con otro número. El tope del
  slider es ese 110, y el panel dice a partir de qué ángulo deja de caber en
  pantalla en vez de prohibirlo.

Y no se dibuja con escenario montado: ahí las dianas salen en puntos de ruta y
el cono no decide nada.

**La distancia de aparición sí funciona**, que era la otra pregunta. Medido en
sus dos extremos sobre 25 dianas cada uno: pedidos 8 u salen a 7.94 y pedidos 21
—su tope, que lo pone la sala vía `computeMaxSpawnDistance`— salen a 20.54. Con
escenario no se aplica, y el panel lo dice desde que existe.

### 78.6 El panel del editor vuelve al lateral, y por qué no es volver atrás

La vuelta 77 lo puso flotante y centrado, con un argumento correcto: una barra
fija de 300 px no escala a once secciones, y `menu62` ya había enseñado a dónde
lleva dejar crecer una columna. Pero resolvió el escalado rompiendo lo que la
herramienta hace: **construir es mirar el mapa**, y un panel centrado tapa justo
la parte que se está tocando. Se abría para mover un número, se cerraba para
mirar, se volvía a abrir.

El raíl de iconos resuelve las dos cosas a la vez, y por eso no es una vuelta
atrás: **las secciones crecen por el raíl** —un icono más en una lista vertical
de 56 px— y la columna de contenido no se entera, así que el problema de escala
de la 77 no puede volver. El ancho lo decide quien construye, arrastrando el
borde, y se recuerda: colocar piezas y escribir una física piden anchos
distintos.

Y hay una consecuencia que conviene anotar porque explica el punto 4 del
encargo. El panel de la 77 iba a **dos columnas** por encima de 720 px, y con
`columns` el orden de lectura deja de ser el del documento: el botón de apilar
—que estaba al final de la sección de la pieza, debajo de los candados y de la
base— caía donde nadie lo busca. Se dio por desaparecido, y estaba. De ahí dos
decisiones: **una columna siempre**, y **una acción que se busca con el dedo va
la primera y sola**. Además ahora tiene gesto —clic derecho sobre la pieza— y
las teclas R/F suben y bajan la elegida sin abrir nada.

### 78.7 Todo lo configurable se coloca viendo el efecto

Es el principio general del encargo, y pasa a `CLAUDE.md` como convención
permanente. Lo que lo cumple en esta vuelta:

- **Las salidas son conos del color de su equipo**, con una flecha cuya punta se
  agarra para girar el rumbo. El rumbo importa —sin él el que sale en el sur
  aparece mirando a la pared del fondo (vuelta 66)— y era precisamente lo más
  difícil de traducir a un número: «Rumbo: 180» hay que imaginárselo.
- **La zona de aparición y las cajas de compra son cajas translúcidas** que se
  arrastran y se estiran por una esquina. Y se dibujan **todas** las bandas, no
  la primera: el panel de la 77 sólo editaba `spawnZone[0]` y El Espejo tiene
  dos, así que se veía media regla y la otra mitad parecía no existir.
- **Un spawner nuevo cae donde estás mirando**, no en el origen: en un mapa
  simétrico el origen es el peor sitio posible.

Tres reglas para el día que se añada la fase siguiente. La primera, **el dibujo
sale del dato**: lo que se pinta es `duelo.salidas` y `spawnZone` tal cual, y
arrastrar escribe en el mapa. Un estado intermedio «la posición del gizmo» sería
una segunda verdad que se despega del fichero.

La segunda, **el mismo gesto que una pieza**: mismo arrastre, misma rejilla,
mismo clic. Aprender a colocar una caja tiene que servir para colocar una
salida.

Y la tercera salió construyéndolo y no es evidente: **lo que se pincha se decide
por prioridad, no por distancia**. Un área es un volumen que **contiene** los
conos y las piezas que hay dentro, así que mirando desde arriba su cara superior
está siempre delante. Con la distancia sola, la banda de aparición de El Espejo
se comía el clic de sus dos salidas **y de todas las piezas de esa mitad del
mapa**. El orden es el del tamaño del gesto —tirador, cuerpo, pieza, área— y, a
igualdad, el más cercano.

### 78.8 El vuelo del editor no volaba

«God Mode no permite moverse adelante/atrás.» Medido, era peor: **no se movía en
ninguna dirección horizontal**. `_volar` llamaba a `_updateHorizontal`, y como
el vuelo fuerza `airborne`, ahí manda el modelo vectorial del aire: la velocidad
guardada, **no las teclas**. Con `_airVelX`/`_airVelZ` a cero —que es como se
entra a volar— esa función se sale en su primera línea. Lo poco que se movía era
la inercia que quedara de un salto anterior, que es justo lo que hacía parecer
que fallaba sólo un eje.

El paso se resuelve ahora como el de a pie —`_readWish` y `_moveTo`, con la
colisión puesta, que es lo que impide colarse dentro de una caja— pero a la
marcha del vuelo. Medido: 8.10 u con W en 1.08 s de mundo, lo mismo atrás, de
lado y en vertical, y apagarlo sigue dejando caer con la parábola del mapa en
vez de teletransportar.

Y de paso, un campo que se leía antes de escribirse: `movement.volando` sólo
existía después del primer `setVolando`, así que valía `undefined`, que no es
`false` para quien lo compare.

### 78.9 Una tecla con dos significados según el estado

El plantado de muñecos sólo se podía apagar desde el panel, y el panel se abre
con ESPACIO — **que volando es subir**. Con el God mode puesto no había forma de
volver a disparar de verdad sin salir de la prueba entera. Es un caso limpio de
lo que pasa cuando una tecla significa dos cosas según el estado.

Cada herramienta pasa a tener la suya: **F1** planta, **F2** vuela (y la **G**
se queda, que ya estaba en los dedos) y **F3** limpia. Son de esta página, no
del juego: `KEYBINDS` es el mapa saneado y reasignable del jugador, y una tecla
de herramienta que no existe en ninguna partida no tiene por qué gastarle una
entrada — la misma regla que la G desde la 77. Y lo que cambia **se dice en el
HUD**, porque probando no hay panel a la vista y un interruptor que se mueve en
silencio es un interruptor que no se sabe en qué posición está.

### 78.10 El fondo viste la pared, y la foto deja de ser hipotética

Dos cosas del encargo sobre el fondo. La primera es un fallo: la rejilla
vertical de los muros se seguía dibujando **por delante** del panorama. La
rejilla dice «aquí se acaba la sala», y eso es información útil mientras el
mundo termina en una caja; en cuanto hay decorado detrás, lo que se ve es el
interior de la caja encima del paisaje, que es lo contrario de meter un
decorado. Con fondo puesto, los cuatro planos de pared dejan de dibujarse; el
suelo se queda, que es el sistema de coordenadas con el que se construye.

La segunda es la decisión que la 77 dejó abierta: «sí queremos probar ya con una
imagen estática real». **Lo que se abre no es la decisión, es poder tomarla con
la foto delante.** Un panorama fotográfico sigue siendo el primer asset externo
del proyecto y el argumento en contra sigue siendo el que revirtió el audio
grabado en la 63. Lo que cambia es que ya no hay que decidirlo a ciegas: se deja
un `.jpg` en `public/fondos/`, el editor lo ofrece junto a los cuatro dibujados
y se juega con él puesto.

Tres cosas lo hacen seguro mientras se decide:

- **El mapa declara un objeto con su ruta, no una clave.** Así, en el fichero
  del mapa se ve que depende de un archivo — «este mapa no corre sin descargar
  nada» deja de ser algo que haya que deducir. El saneado además lo dice en voz
  alta, y ese aviso no es un error: es el dato que hay que tener delante.
- **La ruta va acotada** a esa carpeta y a extensiones de imagen. Un `fondo` con
  una URL arbitraria sería un mapa capaz de hacer que el juego pida lo que sea
  con sólo abrirlo.
- **Y el mundo no la espera.** La esfera se monta en negro y la textura se pone
  cuando llega; si no llega, el mapa se juega con el fondo apagado. Montar un
  escenario no puede depender de una petición.

### 78.11 Dos campos que el servidor ignoraba

Construyendo la ficha del spawner salieron dos huecos entre lo que el editor
escribe y lo que el duelo aplica, y los dos son el mismo fallo de la vuelta 67
por la puerta del formato.

**`duelo.cajaCompra`** existe y se sanea desde la 77, y `Partida._cajaDe` cogía
`ROUNDS.cajaCompra` **siempre**. O sea que el campo del editor era decorativo.
Se lee ahora de `scenario.cajaCompraDeDuelo`, y es seguro por lo mismo que la
física de la 72: los dos extremos montan el mismo mapa y derivan la misma caja
**sin que viaje ningún número**.

**La invulnerabilidad de inicio de ronda** la pedía el encargo como campo del
spawner, y no existía en el duelo en absoluto: `invulnerableLeftMs` es del
jugador del entrenamiento y en red se mandaba **cero fijo** al HUD. Escribir el
campo sin implementarla habría sido, otra vez, un control que el servidor
ignora. Así que se implementa entera: `duelo.invulnerabilidadMs` en el mapa,
aplicada en `_empezarRonda` y respetada en `_aplicarDano`.

Cuatro decisiones dentro:

- **Va en número de paso**, como `vivoEn` y el reloj de la ronda. Con un
  instante de pared sería un tercer reloj que no comparte nadie y que seguiría
  corriendo en pausa — el agujero que la 54 ya cerró dos veces.
- **Se mira en `_aplicarDano`**, que es el único sitio por el que pasan las
  cuatro formas de hacer daño —bala, cuchillada, cuchillada por la espalda y lo
  que venga—. Arriba, en quien dispara, sería una comprobación que hay que
  acordarse de repetir. El disparo **recibe su veredicto igual**; lo que no hace
  es tocar el mundo.
- **Lo que queda viaja en la foto** (`inv`), calculado por el servidor como el
  reloj de la ronda y por la misma razón: los relojes de las dos pantallas y el
  suyo no coinciden. El marco azul del HUD ya existía; lo que le faltaba era el
  número.
- **Y la gracia es de empezar la ronda, no de reaparecer.** Sin rondas en
  marcha, quien vuelve lo hace con las mismas reglas que tenía al caer.

Lo que **no** se hizo, y es deliberado: **el arma sigue siendo del mapa y no de
cada salida**. En un mapa simétrico por giro, dos dotaciones distintas serían dos
juegos distintos según por dónde te toque salir. La ficha del spawner enseña con
qué se sale, que es lo que hacía falta; declararlo por salida es una asimetría
que hay que querer, no una casilla más.

### 78.12 Tres suites rojas que no eran del juego

Al pasar la batería salieron cuatro suites en rojo. La tentación —y el error
clásico— es depurarlas. Lo que las separó fue el método de la vuelta 75: **`git
stash`, reiniciar el servidor y volver a pasarlas contra el código de antes.**

Verde con el viejo y rojo con el nuevo: **una**, `bomb2`, que afirmaba los
cortes de estrella escritos a mano. Esa es mía y se arregla leyendo los cortes
del dato en vez de copiarlos, y afirmando lo que de verdad hay que guardar —que
**cada corte produzca su escalón exacto**— en lugar de cuánto vale.

Rojas con los dos: **tres**, y ninguna tenía que ver con el juego. Dos contaban
cuántos escenarios hay con un número escrito a mano, y había aparecido un tercer
mapa de entrenamiento. La tercera, `spawner`, clasificaba los puestos ciegos
leyendo `spawnZone`, que en el Plano A editado a mano quedó **vacía**: sin lista
no había banda contra la que clasificar, así que los tres ciegos del spawn
caían en «fuera» y la fila salía roja **sin que la propiedad se hubiera roto**
—plantado en el spawn se siguen viendo cero puntos, que es lo que el muro
promete—.

Las tres se arreglan igual: derivando del dato en vez de copiarlo. Y la de
`spawner` además **dice en voz alta** que el mapa no declara banda, porque eso
sí tiene una consecuencia propia que no es del banco: sin `spawnZone`,
`isInSpawnZone` no descarta nada y un muñeco puede nacer detrás del muro de
aparición, que es la regla de la vuelta 43. El mapa no se ha tocado — es
material de su autor — pero el banco ya no se calla lo que ve.

La lección de fondo es la de siempre por otra puerta: **un banco que sabe
cuántos escenarios hay no prueba el selector, prueba un número.**

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
- **El 1v1 local**: error de reconciliación contra latencia y pérdida, retraso
  con que se ve al rival, coste de predecir y reejecutar, caudal y pasos sin
  entrada, con dos pestañas de verdad contra el servidor (`red45.mjs`,
  `colchon45.mjs`).
- **El disparo con compensación de retraso**: acuerdo entre el veredicto del
  tirador y el del servidor contra latencia, con el control de resolverlo sin
  rebobinar, el tope actuando, la cobertura parando balas y el coste por disparo
  (`tiro46.mjs`).
- **La partida por código**: que el mismo código lleva a la misma sala y dos
  distintos a dos Durable Objects que no se tocan (con una tercera pestaña de
  premisa, para que «no ve a nadie» no lo cumpla una conexión que no abrió), que
  un código mal tecleado llega igual, que un tercero no entra en un 1v1 y que una
  sala vacía deja de gastar reloj (`sala47.mjs`).
- **Que la migración a Cloudflare no cambió nada**: los bancos de las vueltas 45
  y 46, sin tocar una aserción, pasados contra el Durable Object corriendo en
  `wrangler dev --local`.
- **Que la pausa para el mundo de los dos** (`pausa53.mjs`): que con el menú
  abierto ya no se anda, que el rival tampoco se mueve y no le ve moverse, que
  reanudar devuelve el mundo a su ritmo **sin que el RTT se haya comido la
  pausa**, que las tres libres se gastan por jugador, que la cuarta pregunta al
  rival y se respeta su respuesta, y que irse no deja al otro en un mundo parado.
- **Que un abatido no se mueve y su cuerpo no se dibuja** (`abatido52.mjs`): con
  dos navegadores a 60 fps y latencia inyectada, que el muerto con la tecla de
  andar pulsada se queda en 0.00 u, que el rival no lo dibuja en ninguno de los
  frames en que está caído, que de tres impactos exactamente uno viene marcado
  como baja, que el salto de reaparición le deja a 0.11 u de su salida, y que
  apagando **sólo** la predicción de la reaparición el error pasa de 0 a 15.46 u.
- **Que el cliente no se congela ni se queda callado** (`aviso51.mjs`): con un
  corte de red de verdad, que el mundo local sigue a 61 pasos/s en vez de caer a
  cero, que quitar la puerta de frescura lo hunde a 20 —o sea que es eso lo que
  lo arregla—, que el silencio se avisa en amarillo, que al tercero de una
  partida de dos se le dice en rojo con el motivo del servidor, y que matando el
  Worker el cliente distingue el cable del portazo.
- **Que reaparecer es un teletransporte y no un viaje** (`reaparecer50.mjs`): con
  dos navegadores a 60 fps, que la marca de teletransporte viaja en la foto y
  cambia al reaparecer, y que el salto se dibuja en un frame sin pasar por
  ninguna posición intermedia — con la fórmula vieja calculada sobre los mismos
  paquetes, para que la suite pueda fallar si se revierte.
- **Que volver de otra pestaña no da un avance rápido** (`fondo49.mjs`): con el
  estímulo real —el `requestAnimationFrame` parado y el socket vivo—, la
  velocidad aparente del jugador y la que ve el rival, en unidades de mapa por
  segundo y con sonda dentro de la página, contra tres ausencias y con el
  re-anclaje encendido y apagado en la misma tanda. Desde la §57, **un navegador
  por jugador** (con los dos en el mismo, el frenado de la pestaña de atrás se
  lee igual que el fallo), sin anotar el hueco de la ausencia como un fotograma,
  y afirmando la **velocidad sostenida** antes que el techo — un techo que no
  enseña su suelo lo cumple también un jugador congelado.
- **Que el arma no deja de empujar** (`recoil61.mjs`): cargador entero en
  automático **sin tocar el ratón**, con sonda dentro de la página y **una
  muestra por disparo** —lo que se afirma es de disparos, no de frames—; que
  ningún disparo sale con empuje cero, que la segunda mitad del cargador sigue
  empujando, que la mira acaba lejos de donde empezó (no se autocentra) y que
  compensar a media ráfaga no compra los disparos siguientes.
- **Que la brújula no miente, la mancha se apaga, Escape no gasta pausa y al
  rival se le oye andar** (`ux60.mjs`): con **dos navegadores**, el rumbo que B
  le pone al marcador contra la dirección de la cámara de A **leída en la página
  de A** —un error de 180° no se ve en una sola pantalla—; la cuña de daño
  medida con **sonda dentro de la página**, porque dura 500 ms y desde fuera se
  lee el hueco entre dos disparos; que abrir el menú no toca la cuenta de libres
  y que el botón sí; y las pisadas por **amplitud en el emisor del rival** —no
  en el máster, que un sonido posicionado no pasa por ahí— con el rival andando
  en terreno abierto, comprobando antes que se ha movido de verdad. Y cuenta los
  `pageerror`: son fallos, no líneas de registro.
- **Que se puede empezar a jugar** (`jugable48.mjs`): con clics y teclas de
  verdad contra la página real —no escribiendo en `cliente.teclas` desde dentro—,
  que un clic captura el ratón, que aparecen mira y vida y no el cartel de
  abatido, que F3 enseña y esconde los números, que el fantasma viene apagado,
  que tocar un control no captura el ratón, que escribir un código no mueve al
  jugador, y que dos personas se ven, se disparan y se matan.

- **Que la física es del mapa y no se ha escapado a ninguno** (`pilares72.mjs`,
  sin navegador): que sin mapa, en El Espejo y en el Plano A los tres números
  salen **idénticos** a los de `MOVEMENT`; que montar Los Pilares los cambia y
  volver a El Espejo los devuelve —no quedan pegados—; que su salto sube 3.25 u
  contra 1.25 y avanza 9.21 contra 3.79 **medido paso a paso**, no con la
  fórmula; que sus torres se suben desde el suelo y sus atalayas no; que las 17
  piezas tienen su pareja girada salvo la centrada; que las dos salidas están a
  48 u **sin línea de visión** con la geometría montada; que no sale en el
  selector de entrenamiento y que el saneado sólo deja pasar mapas de duelo.
- **Y que en él no se compra, se reparte** (`pilares72.mjs` [8], `duelo72.mjs`):
  que la bienvenida dice `eco 0` con rondas encendidas; que pedir un arma o un
  casco no cambia nada ni cobra nada; que la fase de compra sale a cero **y no la
  abre el selector**; que la ronda 1 empieza jugando; y que al que muere le
  vuelve la dotación entera en la ronda siguiente —chaleco incluido— sin quedarse
  un casco que el mapa no reparte. Con dos navegadores además: que los dos montan
  el mismo mapa desde el enlace, que la Scout sale **en la mano**, que la tecla de
  la armería no abre nada y que El Espejo sigue exactamente igual.

- **Que el HUD del duelo es el del juego, y no uno parecido** (`duelo73.mjs`):
  con dos navegadores y una partida de verdad, que el bloque de vida, el de
  arma, la marca y los FPS caen **en el mismo sitio y del mismo tamaño** que
  entrenando —201×40 a 34 del borde, 208×143 a 26 y 28—; que están los tres
  segmentos de chaleco y el casco, que es lo que faltaba; y que **no** están los
  tres bloques del entrenamiento, que ahí no miden nada.
- **Que las opciones se abren sin salir de la partida** (`duelo73.mjs` [2]): que
  el menú de ESC tiene sus tres botones, que el panel que abre es el del juego
  —con la sección de controles y la sensibilidad de la mirilla dentro— y que la
  partida sigue en pie mientras se mira.
- **Que la tienda no vende lo que no se vende** (`duelo73.mjs` [3] y [4]): que
  el supresor no es un artículo y su categoría se fue con él, que el cuchillo
  tampoco está, que comprar el chaleco lo cobra y lo pone y que su artículo lo
  dice con la palabra «Equipado»; y que las fichas se abren sin pasar por la
  compra, con la Scout y el Vanta, sin botón de equipar y con la nota del
  silenciador en las tres que lo admiten.
- **Que el final de ronda se ve y se oye** (`ronda73.mjs`, con la ronda apretada
  a 25 s y el huésped relanzado): que el contador se pone en rojo **con 15 s por
  delante y no antes**, y que suenan **15 pitidos** contados por amplitud en el
  máster, no por llamadas a funciones. Y lo primero que comprueba es que el
  huésped lleva esa config, que es la lección de la vuelta 72.
- **Que el marcador de orientación se lee mejor y no peor** (`brujula73.mjs`):
  que las dos cifras de la vuelta 39 siguen en pie —116 px a 12 u y 114 a 20,
  por encima del listón de 80; 64% del ancho de la silueta del muñeco de
  cerca— y que el Δ de tono de la vuelta 40 sigue separando frente de espalda
  (17-25). Y de la señal nueva: que dentro del arco de espalda **24 de 64
  píxeles del marcador suben 39 de luminancia**, dentro de la banda 34-62 que
  aquella vuelta dio por legible. El mismo banco es el que tumbó la punta de
  flecha, midiéndola contra la cuña de siempre.

- **Que la escalera de estrellas es una escalera** (`estrellas78.mjs`, sin
  navegador: la puntuación es aritmética pura). Las **mismas ocho partidas**
  medidas con la curva vieja y con la nueva, que es lo que hace legible la
  comparación (vuelta 46): una impecable pasa de 4★ a 5★, una impecable con una
  bala sigue en 5★ —cuesta 0.014 de nota contra 0.042 de antes—, una con una
  muerte cae a 4★, y los cuatro cortes producen su escalón exacto. Y despeja de
  la fórmula vieja lo que pedía el corte de 5★: **desactivar en 10.8 s**.
- **Que ninguna zona del catálogo hace cero daño** (`dianas78.mjs`), que es el
  guardia del fallo que dejó a la diana clásica invulnerable ocho vueltas. Lo
  que afirma no es el caso sino la propiedad: **toda zona que el juego puede
  producir hace daño con toda arma**, así que un tipo de diana nuevo se pone
  rojo aquí el día que se añada y no ocho vueltas después.
- **Que la diana clásica muere, la duración vale para los dos modos, el panel
  abre por arriba y el cono se ve** (`juego78.mjs`, contra el producto): un
  disparo la mata y desaparece pasado el pop; «sin límite» deja de contar
  jugando ahora y «la del modo» devuelve los 30 s de siempre; el panel desborda
  de verdad (2584 px contra 670) y aun así abre en scroll 0; el cono tiene la
  apertura del slider y **no se dibuja con escenario montado**. Y la respuesta a
  «¿la distancia de aparición hace algo?»: sí, medida en sus dos extremos sobre
  25 dianas cada uno —8 u → 7.94 y 21 → 20.54—.
- **Que lo configurable se coloca arrastrándolo** (`ed78.mjs`, con el ratón de
  verdad sobre el lienzo y no llamando a las funciones desde fuera): el cono de
  una salida se arrastra 6 u sin cambiarle el rumbo, la punta de su flecha lo
  gira a −90°, la esquina de una banda la estira de 7.6 a 12.5 sin mover su
  esquina mínima, y las dos bandas de El Espejo se dibujan. Más el panel: cinco
  secciones con su leyenda, abre y cierra por su icono, y el ancho arrastrado
  sobrevive a una recarga.
- **Que el vuelo vuela y las herramientas tienen tecla** (`probar78.mjs`, con el
  recorrido medido **contra `engine.gameTime`** y no contra el reloj de pared,
  que es la regla de la vuelta 75): 8.10 u con W en 1.08 s de mundo, lo mismo
  atrás, de lado y en vertical; F1 planta sin gastar un disparo, F3 los quita y
  F1 otra vez devuelve el disparo de verdad —que era justo lo que no se podía
  hacer volando—. Y que con fondo puesto **las cuatro paredes de rejilla dejan
  de dibujarse**, contadas una a una.
- **Que la gracia de salida existe y la caja de compra la mide el mapa**
  (`gracia78.mjs`, conduciendo `Partida` directamente): dentro de la gracia, 100
  de daño **y un cuchillazo por la espalda** no quitan un punto, y la bala
  siguiente entra entera; lo que queda viaja en la foto en ms y deja de viajar
  al agotarse; el corralito del servidor mide los 9 u que declara el mapa y los
  4 de `ROUNDS` cuando no declara nada.

Lo que **no** está verificado automáticamente: la sensación de juego, el balance
entre armas y la legibilidad del HUD en pantallas pequeñas. Eso sigue siendo
juicio humano.

---

## Ronda 79 — Un realce que tapaba, un saneado que borraba y un gizmo que no era `TransformControls`

Tres cosas, y las dos primeras son el mismo informe: «la banda de zona de
aparición cambia de opaca a translúcida sola en el Plano A, y a veces tapa
por completo el spawner que hay dentro; guardar la corrige».

### 79.1 Dos defectos con el mismo síntoma

**El primero: el realce era uno solo para cosas distintas.** `pintarResaltado`
hacía esto con **todo** lo pinchable:

```js
objeto.material.opacity = puesta ? 1 : …
objeto.scale.setScalar(puesta ? 1.35 : 1)
```

Para un tirador —un cubo de medio metro que se agarra— las dos líneas están
bien: opaco se ve mejor y más gordo se pilla mejor. Para el **relleno de un
área** las dos están mal, y cada una por su lado:

- **Opacidad 1 sobre una caja translúcida la convierte en una pared.** Un área
  es un volumen que **contiene** cosas —el punto de aparición cae dentro de su
  propia banda, que es de lo que va la regla de la vuelta 43— así que taparla es
  esconder justo lo que se está colocando.
- **Y escalarla 1.35 dibuja una banda que no es la que el mapa declara.** Eso
  contradice la convención de la 78 de frente: *el dibujo sale del dato, no al
  revés*. Una banda de 4.8 u de fondo se dibujaba de 6.48 y el autor colocaba
  contra una línea que no existe.

Lo de «aleatorio» y lo de «guardar la corrige» son la misma pista y apuntan al
mismo sitio: lo elegido sobrevive a los repintados, y **guardar recarga la
página** (vuelta 75), que es lo que limpia la selección. No había nada aleatorio
ni nada en los datos.

El arreglo no es un `if` sobre el tipo de marcador: **cada marcador declara su
realce donde se crea** (`userData.realce`), y `pintarResaltado` se queda sólo
con lo que sabe, que es **qué está elegido**. Un área se aclara con tope
(`REALCE_AREA_MAX`, 0.22) y enciende sus aristas; un tirador crece. Medido
(`ed79`): elegida, la banda pasa de 0.09 a 0.198 de opacidad, **escala 1**, y
sus 40×4.8 dibujados siguen siendo los 40×4.8 declarados.

**El segundo, y es el grande: el saneado borraba la banda al guardar.**
`spawnZone` se lee **como una caja** desde la vuelta 43 y **como una lista de
cajas** desde que hay mapas con dos salidas: El Espejo y Los Pilares declaran
dos, y el Plano A declara **una sola, suelta**. `Scenario` admite las dos formas
—envuelve el objeto en una lista al montar— y `sanearMapa` no:

```js
const bruta = Array.isArray(bruto[campo]) ? bruto[campo] : []
```

O sea que abrir el Plano A en el editor y guardarlo lo dejaba con
`spawnZone: []`, **sin anotar un solo problema** — que es exactamente lo que la
vuelta 74 dejó escrito que no puede pasar: *un campo que desaparece en silencio
al guardar es cómo un mapa pierde su física sin que nadie se entere*. Y ya
había pasado: el `src/maps/largoYPuerta.js` del repositorio llevaba la banda
vacía, así que **la regla de la vuelta 43 estaba apagada en el Plano A** —de la
línea del muro hacia atrás sí podía aparecer alguien— sin un error en ninguna
pantalla. Es el mismo fallo que la vuelta 78 encontró en `spawner.mjs` y que
entonces se anotó como «el mapa editado no declara zona»: no es que no la
declarara, es que se la habíamos borrado.

Dos arreglos: `enLista()` en `formato.js`, que admite las dos formas y deja
`null` en lista vacía —«no declara» y «declara mal» son cosas distintas y sólo
la segunda es un problema—, y **la banda del Plano A restaurada** a su valor de
siempre, `{x: −20, z: 15.2, w: 40, d: 4.8}`, que sigue cuadrando dígito a
dígito con el muro de aparición del mapa editado (z 15.2, fondo de sala en 20).

### 79.2 `TransformControls` no sirve de base, y se midió antes de decirlo

El encargo pedía comprobarlo antes de construir nada, que es lo correcto: es la
herramienta nativa del motor para esto. Se montó sobre una pieza de verdad del
editor y se midió qué le hace **al dato** (`tc79`). No encaja en cuatro sitios, y
los cuatro son el modelo de datos —esquina mínima más tamaño, sin rotación—:

| Lo que hace | Lo que hace falta |
|---|---|
| Mueve **el origen** del objeto. El proxy de la pieza 0 del Plano A está en x −7.4; la pieza empieza en −8 | El dato es la **esquina mínima** |
| `translationSnap` cuadra ese origen: con ancho 1.2, cuadrar el centro a 1 u deja la esquina en **−7.6** | La rejilla cuadra lo que el fichero declara |
| `scaleSnap` cuadra el **factor**: 1.4 sobre anchos de 1.2, 4.5 y 3.5 da 1.68, 6.3 y 4.9 — tres tamaños y ninguno en la rejilla | Lo que hay que cuadrar es el **resultado** |
| Escalar es **simétrico**: tirando de un lado la cara mínima pasa de −8 a −8.3 | Tirar de una esquina **clava la opuesta** |
| Sus manijas van en el origen y a tamaño de pantalla: el mismo gizmo sobre una pieza de 1.2 u y sobre una de 38 | «Arrastrar desde una esquina» es una manija **en la esquina** |

Todo eso es adaptable con post-proceso en `objectChange`, pero entonces lo único
que se estaría usando de `TransformControls` es su captura de ratón —que además
se engancha al **mismo lienzo** que el editor, así que habría que arbitrar entre
las dos— mientras se reescribe lo que hace con el objeto. La tubería de picking
del editor ya tiene lo demás: rayo único con prioridad (vuelta 78), rejilla
sobre la esquina, imán y `colocar()`.

**Lo único que se le copia es lo bueno de verdad:** los tiradores **escalan con
la distancia de cámara** (`GIZMO.distanciaDeReferencia`), porque un cubo de 0.45
u a setenta unidades son tres píxeles, y es la misma idea que
`MARKERS.referenceDistance` en el mundo del juego.

### 79.3 Y con manijas en las esquinas no hacen falta modos

El encargo pedía modos intercambiables tipo UEFN —mover / escalar / girar—. El
conmutador de UEFN existe **porque su gizmo vive en el origen**: ahí los tres
gestos caen en el mismo sitio de la pantalla y hay que desambiguarlos con un
estado. Con manijas en la caja no hay ambigüedad que resolver:

- **el cuerpo** se arrastra y mueve, como desde la vuelta 74;
- **una esquina** se arrastra y estira, con la opuesta clavada;
- **el cubo de arriba** sube y baja el alto;
- **el aro** gira.

Un modo más sería un estado que recordar para no ganar nada, y la 78 ya dejó
escrito que lo que se busca con el dedo tiene gesto, no un interruptor.

Tres detalles que **son** el diseño:

- **El alto no se estira: se elige.** El alto de una pieza no es un número
  libre, es una palabra de `COVER.heights` —de ahí salen el vocabulario de
  cobertura y la rampa de grises—, así que el tirador de arriba recorre la
  **escalera** (bordillo < baja < media < plataforma < torre < alta < parapeto <
  bloque < atalaya) y se queda en el escalón más cercano. Medido: 60 px de
  arrastre llevan de `bordillo` a `media`.
- **El giro tiene cuatro posiciones y aun así es un gesto.** La colisión es
  AABB, así que lo único que un giro puede significar aquí es intercambiar ancho
  y fondo; el aro se arrastra en redondo y **cuadra a 90°**, de modo que lo que
  se ve girar es exactamente lo que el motor va a saber chocar. Medido: 2×8 →
  8×2 con el centro clavado en (0, 0).
- **Y lo que se pincha del aro no es el aro.** Un toro tiene el centro hueco, y
  apuntarle al centro —que es donde apunta cualquiera— era un clic que se colaba
  por el agujero, llegaba al lienzo y **deseleccionaba la pieza**: el gizmo
  desaparecía debajo del dedo. Debajo va una bola invisible, que es la misma
  idea que los `picker` de `TransformControls`: se dibuja una forma y se pincha
  otra.

Y una cuarta que no se ve y era el fallo fácil: **un tirador de la pieza no
cambia lo elegido.** Su rama va **por delante** de `elegirMarca`, que apaga la
selección (`seleccion = -1`) para editar una cosa a la vez — aquí la cosa que se
edita **es** la pieza elegida.

### 79.4 El triaje de las siete mecánicas

Va entero en `docs/propuestas/06-superficies-y-estructuras.md`, con el precio de
cada cajón. Lo que hay que saber sin abrirlo: la hipótesis del encargo era casi
toda correcta y falla en un sitio —**el hielo no está en el grupo de las
superficies**, porque a pie en Vektor **no hay velocidad**: un paso es
`posición + dirección × marcha × dt` y soltar W para al jugador en ese mismo
paso, así que «resbaladizo» no es bajar un rozamiento que no existe, es estrenar
un modelo de velocidad en el suelo—. Y el **ventilador** se cae del grupo por el
mismo tipo de motivo en el otro eje: un empuje sostenido es una segunda
gravedad, y la vertical está resuelta **en forma cerrada** desde siempre.

### 79.5 Lo que queda medido

- **`ed79.mjs`**: el Plano A conserva su banda; el saneado no la tira ni en
  lista ni en objeto —y la premisa, que el de la 78 **sí** la tiraba, se afirma
  al lado, porque «se conserva» lo cumpliría igual un saneado que no mirase el
  campo—; elegida, la banda se aclara de 0.09 a 0.198 con tope en 0.22, **escala
  1**, y lo dibujado sigue cuadrando con lo declarado.
- **`giz79.mjs`**, con el ratón de verdad sobre el lienzo: seis tiradores con la
  pieza elegida y ninguno sin ella; estirar por una esquina deja la opuesta
  clavada (4×4 → 7×7 sin mover (−2, −2), y por la contraria la máxima se queda
  en (5, 5)); el alto sube un escalón del catálogo; el aro cambia 2×8 por 8×2
  sin mudar el centro; agarrar un tirador **no** deselecciona; y un Ctrl+Z
  deshace el arrastre entero, no un píxel.
- **`tc79.mjs`**: los cinco números de la tabla de §79.2, medidos contra una
  pieza del Plano A y no leídos del código.

---

## Ronda 80 — Una pieza puede hacerte algo, y un área puede llevarte

El encargo tras el triaje de la 79 fue explícito: **adelante con el bloque
barato** —rebote, plataforma de velocidad y teletransportador de zona— y el
bloque grande aparcado hasta después del arsenal. El tubo por composición se lo
monta el autor con las piezas de hoy, así que no se construye nada para él.

### 80.1 El cimiento: el suelo tenía que decir sobre qué estás

`Scenario.groundHeightAt(x, z, feetY)` devolvía **un número**. El jugador sabía
a qué altura estaba el suelo y no qué pieza era, así que ninguna de las tres
mecánicas tenía dónde engancharse. Ahora el **mismo barrido** se queda con la
caja ganadora y publica su `superficie`.

Sale por un captador (`scenario.superficieDelSuelo`) y no como segundo valor de
retorno, y eso es una decisión y no una comodidad: el suelo se pregunta **dos
veces por paso y por jugador** —`_feetYAfter`, la vertical, y el servidor por
cada uno—, así que devolver un objeto sería basura para el recolector justo en
el bucle que el proyecto presupuesta. Lo que cuesta a cambio es una regla, y es
la única: **vale para la llamada inmediatamente anterior**. Quien lo lee lo hace
en la línea de al lado de su propio `groundHeightAt`, con la misma posición. Es
la disciplina de la pose interpolada de la vuelta 44 —vive lo que dura el
dibujado— aplicada a una consulta.

Y una rampa no tiene superficie: lo que se pisa en ella es la cuña, así que gana
el suelo pero borra la marca. Sin esa línea, cruzar una rampa por encima de una
plataforma de rebote habría heredado el rebote de la caja de debajo.

### 80.2 Todo el impulso pasa por `_takeOff`

Un rebote **es** despegar con otra velocidad vertical. Escrito así no hay una
rama nueva por el modelo vertical, ni un campo más en `snapshot()`, ni nada que
pueda discrepar entre los dos extremos de una partida — y, lo que más importa,
la parábola se sigue resolviendo en forma cerrada.

Medido (`superficies80` [2]) con fuerza 14 y la gravedad 30 de fábrica:

| refresco | ápice | rebotes en 3 s |
|---|---|---|
| 60 Hz | 3.8667 u | 3 |
| 144 Hz | 3.8666 u | 3 |
| 240 Hz | 3.8667 u | 3 |

Dispersión **0.0026%**, y el número no es de gusto: `0.6 + 14²/(2·30)` =
3.8667, o sea la pieza más lo que dice la parábola. Si saliera otro, sería que
el impulso no pasa por donde dice pasar.

Y una nota del banco que es la lección de siempre: la primera versión medía
**el máximo de todo el tramo** soltando al jugador desde 4 u, así que medía la
altura desde la que yo lo soltaba y no el rebote. Con la caída a 1.5 y el ápice
tomado **después del primer contacto**, el número pasó a decir algo. Es el
denominador de la vuelta 46 por la otra punta.

### 80.3 Cuatro reglas que salieron de jugarlo, no de diseñarlo

- **Pisarla cuenta, no sólo caer sobre ella.** La primera versión colgaba el
  impulso de `_land`, y entrar **andando** en una plataforma de rebote no
  produce ningún aterrizaje: nunca se estuvo en el aire. Quedaba una plataforma
  que funciona saltando encima y no pisándola, que es una diferencia que nadie
  decidiría. Con ello viene una consecuencia que hay que saber al construir: a
  un bordillo de 0.6 **se choca**, porque `COVER.stepHeight` es 0.25. Una
  plataforma en la que se entra andando mide menos que eso, y el editor lo dice
  en su ficha en vez de dejar que se descubra probando.
- **Un empuje del mapa no es un salto tuyo.** La fatiga cuenta vuelos parados, y
  un rebote lo es: sin reiniciarla, la plataforma se iba apagando y dejaba de
  funcionar a la cuarta. Medido: trece rebotes seguidos, **todos al mismo
  ápice**.
- **Una plataforma de velocidad despega, y no por gusto.** A pie no hay
  velocidad —un paso es `posición + dirección × marcha × dt`— así que un empuje
  horizontal sin despegue se evapora en el paso siguiente. Es la misma
  propiedad del motor que hace que el hielo sea una vuelta propia y no un
  número (triaje de la 79, §0).
- **Y respeta el techo del aire.** Saltárselo abriría un camino para pasar de
  `airStrafeMaxSpeed` **sin air-strafe**, que es la técnica del juego. Medido:
  con fuerza 30 sobre un techo de 9.5, sale a **9.5 clavado**. Un mapa que
  quiera lanzar más fuerte sube su techo, que ya puede desde la vuelta 72 —y
  ahí es una decisión del mapa entero, no de una caja.

### 80.4 El teletransporte: lo caro ya estaba hecho

De las tres es la más barata, y por una razón que conviene ver: **el motor ya
sabía teletransportar bien**. `poseEpoch` sube, viaja en la foto y el que dibuja
al rival **no interpola por encima de ella** (vueltas 44 y 50), así que el salto
cae en su instante exacto y en un frame en vez de dibujarse como un barrido por
posiciones donde nadie estuvo. Lo único que faltaba era el volumen de entrada y
el destino.

Tres cosas que sí hubo que decidir:

- **Cambia dónde estás, no cómo vas.** Quien llega por el aire sigue volando, y
  eso obliga a **re-anclar la parábola** en el sitio nuevo: la forma cerrada se
  evalúa desde el despegue, y dejar `_launchY` como estaba sería evaluar una
  caída que empezó en otro mapa.
- **Entra por flanco.** Un booleano más en `snapshot()` (32 → 33), como la
  máscara de agachado del deslizamiento y por lo mismo: es estado que sobrevive
  a un paso. Sin él, un destino que caiga dentro de otra área es un bucle.
  Medido: 300 pasos quieto entre dos áreas encaradas, **una sola época**.
- **Y el rumbo lo pide, no lo escribe.** El dueño del rumbo es `LookControls`
  (vuelta 66): escribirlo desde el movimiento lo reescribiría el ratón en el
  paso siguiente. Va por `consumirRumboPedido()` y lo aplica `_simStep`. El
  servidor no tiene controles y no los necesita, porque el rumbo le llega en la
  entrada del cliente — o sea que esto no toca el protocolo.

**Y hay una mitad que no se ve**: reejecutar una entrada pasa por el mismo
`movement.update`, así que un área de teletransporte dentro de la cola sin
confirmar volvía a pedir su rumbo **en cada reconciliación** —varias veces por
segundo, arrancándole la mira al jugador—. El rumbo es un recado de un paso
**vivo**; una repetición del pasado no lo es. La posición y la época sí se
reejecutan, que es lo que tiene que pasar.

### 80.5 «Tiene geometría» no era la pregunta

`setScenario` guardaba el escenario sólo si tenía cajas o rampas. Con eso, un
mapa de **sólo puertas** —cero piezas y dos teletransportes— se montaba con
`scenario = null` y no teletransportaba a nadie: sin un error en ninguna
pantalla, que es como se pierden estas cosas. Lo que el movimiento necesita de
un escenario dejó de ser sólo contra qué chocar el día que un mapa pudo declarar
algo más.

Lo cazó el banco a la primera, y no por suerte: el caso de prueba del
teletransporte es justo un mapa sin geometría.

### 80.6 Una superficie que no se ve es una trampa

Vektor no tiene texturas ni luces, así que lo único que puede decir que una caja
no es una caja normal es una marca dibujada encima. Se pinta con líneas —una
geometría y un material para todas las del mapa—, **fuera de `occluders`** y
fuera del presupuesto: ningún rayo le pregunta nada.

- **Lo que distingue las tres es la forma** (vuelta 67): flecha **vertical** el
  rebote —plana en el suelo no diría «arriba»—, **horizontal** la velocidad, y
  **anillo** el teletransporte, en sus dos extremos. Y el largo de las flechas
  sale de la fuerza, así que mirando el mapa se ve cuánto empuja cada una.
- **El color es el azul eléctrico**, y es la **segunda** vez que un color de la
  paleta significa dos cosas. La paleta está llena desde la vuelta 55, donde ya
  se midió que no queda hueco: naranja las dianas, rojo la amenaza, verde la
  acción, ámbar el explosivo, amarillo la detección, azul y magenta los equipos,
  pizarra el declinar. Se admite por lo mismo que la primera excepción (el verde
  de la brújula): **no coinciden nunca**. Y hay un argumento más, que es lo que
  lo hace distinto de reutilizar un color de aviso: `electric` no señala nada,
  **nombra un material** —«esto es energía»— y lo lleva el escudo, que es un
  icono del HUD y un objeto a la altura de la cintura; esto está pintado en el
  suelo, bajo los pies.

### 80.7 Y se colocan viendo el efecto, que es la convención de la 78

- **La flecha de una plataforma de velocidad pone las dos cosas con un solo
  tirador**: el ángulo es el rumbo y la distancia al centro de la pieza es la
  fuerza. Es la punta de la flecha de una salida (vuelta 78) con un grado de
  libertad más.
- **La de un rebote es vertical y sólo se estira.** Girarla no significaría
  nada, así que no gira — y se estira **en pantalla** y no contra el suelo,
  porque un rayo contra el plano y=0 no dice nada de una altura. Es el tirador
  del alto de una pieza (vuelta 79) otra vez.
- **Agarrar una flecha elige su pieza**, en vez de apagar la selección: los
  números que se están moviendo viven en su ficha. Misma rama y mismo motivo
  que los tiradores de la 79.
- **Y un teletransporte son dos sitios unidos por una línea.** La línea no es
  decoración: con cuatro parejas en un mapa, saber cuál lleva a cuál leyendo
  ocho números es exactamente la barrera que la 78 vino a quitar.
- **El panel dice lo que se va a notar, no el número otra vez**: «Sube 5.49 u
  sobre la pieza, con la gravedad 30 de este mapa» y «Lanza a 9.5 u/s (el techo
  del aire de este mapa es 9.5)». Los dos salen de las mismas cuentas que el
  motor, no de una copia.

### 80.8 Lo que queda medido

- **`superficies80.mjs`** (sin navegador): la consulta de suelo publica la
  superficie que gana y la borra cuando no hay; el rebote sale a 3.8667 u en los
  tres refrescos y clavado en la parábola; pisarla andando también lanza; trece
  rebotes seguidos al mismo ápice; la velocidad respeta el techo (9.5 con fuerza
  30) y va al rumbo del mapa y no a donde mira el jugador; el teletransporte
  sube **una** época, pide su rumbo una sola vez y no rebota entre dos áreas
  encaradas; el saneado conserva lo bueno, **cuenta** lo que tira y **nunca se
  lleva la pieza por delante**; y un mapa sin nada de esto no suma ni una época.
- **`ed80.mjs`** (con el ratón de verdad sobre el lienzo): el desplegable pone
  la receta entera y no un objeto vacío; arrastrar la punta cambia rumbo y
  fuerza a la vez y el panel enseña los dos; hacerlo no deselecciona la pieza;
  el rebote sube de fuerza sin mover la pieza ni un decimal; el destino de un
  teletransporte se arrastra y su flecha lo gira; y lo que el editor escribe lo
  lee el saneado sin un problema y lo monta el escenario en su caja de colisión.
- **`ed80b.mjs`** (contra el producto, con el motor de «probar»): el rebote
  lanza a **4.47 u** andando hacia él, medido contra `engine.gameTime` y no
  contra el reloj de pared (vuelta 75).
- Y **la batería entera verde** (46 suites) después, que es lo que dice que
  nada de esto se llevó por delante lo de antes.

---

## §81 — El tubo, los dispositivos y publicar sin terminal

Tres cosas que salieron de la primera sesión larga construyendo con la fase 3
puesta. Las dos primeras son del editor; la tercera es un encargo aparte y es la
que más tiempo devuelve.

### 81.1 El encargo, tal cual

1. Componer un pozo a mano con ocho cajas en anillo —que en la vuelta 80 se dio
   por «lo puedo montar yo»— resultó **demasiado complicado y poco intuitivo**.
   Hace falta el botón.
2. **No se encontraba dónde colocar** las plataformas de rebote y velocidad ni
   el resto de dispositivos. Necesitan icono propio en la barra.
3. Cada vuelta obliga a ejecutar `git pull`, `npm install` y demás a mano, y son
   pasos de terminal que **acumulan dudas y errores**. La versión jugable tiene
   que actualizarse sola, y lo que siga necesitando el PC tiene que caber en un
   doble clic.

La primera **revierte** una instrucción de la vuelta 80, y esa reversión es el
dato más útil de esta vuelta: una cosa es que algo *se pueda* construir con las
piezas que hay y otra que se pueda construir **cómodamente**. La regla de la 74
—no ofrecer nada contra lo que el motor no sepa chocar— nunca dijo que la
composición a mano fuera una respuesta aceptable de interfaz; sólo dijo qué no
se puede ofrecer. El hueco entre las dos cosas es donde vive esta vuelta.

### 81.2 El tubo es una macro, no una primitiva

La colisión es AABB y eso no se toca: `resolveAxis` resuelve un eje cada vez
contra `minX/maxX/minZ/maxZ/bottom/top` y no hay orientación en ningún sitio. Un
cilindro sólido sigue en el mismo cajón que la rotación libre.

Lo que sí se puede es lo que ya se podía a mano, y la decisión es **dónde vive
esa composición**:

- **En el fichero, desplegada** — escribir las veintidós cajas al guardar.
  Descartado: sería un tubo que **ya no se puede volver a estirar**. El editor
  volvería a editar veintidós piezas, el gizmo de la 79 no tendría a qué
  agarrarse y cambiar el radio sería rehacerlo.
- **En el mapa como objeto, desplegada al montar** — `tubos: [...]` en el
  fichero y `cajasDeTubos()` en `Scenario`, **antes** de construir nada. Elegida.
  De esa línea hacia abajo, la colisión, los oclusores, los disparos y el
  presupuesto ven cajas y ya está; y el editor edita **una** cosa con **un**
  gizmo.

Y es seguro en red por lo mismo que la física de la vuelta 72: **no viaja ningún
número**. Los dos extremos montan el mismo mapa y despliegan el mismo anillo con
la misma función. Un tubo que viajara desplegado sería un tubo que se puede
mentir.

### 81.3 Por filas y no por sectores, y se midió antes de elegir

El anillo que uno se imagina —«ocho cajas», como decía el encargo— es dividir el
círculo en N sectores y meter cada trozo de pared en su caja. Está mal, y no un
poco: **la caja de un arco diagonal muerde hacia dentro**, porque un AABB de un
arco inclinado es bastante más gordo que el arco. Medido sobre el hueco libre
que le queda al jugador:

| Sectores | Hueco libre | Mordisco |
|---|---|---|
| 8 | 0.707·R | **29.3%** |
| 16 | 0.804·R | 19.6% |
| 32 | 0.899·R | 10.1% |

O sea: un pozo que por dentro **no es redondo**, es un octógono con los lados
hundidos, y no mejora pagando más piezas — a 32 sectores sigue comiendo el 10% y
ya cuesta 32 cajas.

Por **filas** no hay mordisco ninguno. Se rebana el anillo en franjas paralelas a
un eje y cada franja pone su cara interior en el punto **más ancho** de su tramo,
así que el hueco libre **nunca baja del `radio` declarado**. Lo que se paga es
que el escalón de la escalera se ve; lo que se compra es que el número que pone
el editor sea el número que el jugador tiene.

Medido con el de fábrica —radio 3, 12 caras, 22 cajas—: el hueco más estrecho de
720 direcciones sale **3.005**, y andando desde el centro el jugador se para
entre **2.6** (en los ejes, donde la pared es una cara plana, que es 3 − 0.4 de
radio de cuerpo) y **2.95** (en las diagonales, donde la escalera se retira).
Ninguno de dieciséis rumbos sale del pozo.

### 81.4 Tres decisiones de forma del tubo

- **El radio es el hueco libre, no la pared.** Es el único número que significa
  algo para quien construye: lo que el jugador tiene para bajar. La pared se
  declara aparte (`grosor`) y crece hacia fuera.
- **`x`/`z` es el centro**, y es la única divergencia del formato —una pieza
  declara su esquina mínima—. La esquina de un círculo no quiere decir nada, y
  el radio se mide desde el centro de todas formas.
- **No se gira, y no es un recorte.** Un anillo de revolución girado es el mismo
  anillo, así que un aro de giro prometería un gesto sin efecto — que es
  exactamente el fallo de la vuelta 67 (un control que promete lo que el juego
  va a ignorar). El día que un tubo tenga puerta, girarlo pasará a significar por
  dónde se entra, y ese día el aro tiene sentido.

### 81.5 Los dispositivos: compartir dato no es compartir puerta

Un rebote **es** una pieza con `superficie`. Eso no cambia en esta vuelta, y es
lo que hace que el motor no sepa que existe la palabra «dispositivo». Lo que
cambia es por dónde se llega: hasta aquí había que crear la pieza, elegirla,
bajar hasta «Superficie» dentro de su ficha y abrir un desplegable. O sea
**saber la implementación para usar la mecánica**, que es justo la barrera de
entrada que la convención de la vuelta 78 vino a quitar.

Tres cosas de las que se hizo, y ninguna es decoración:

- **Colocar y encontrar son dos problemas, y el segundo se olvida al
  construirlo.** Un rebote en un mapa de cuarenta piezas no se distingue de una
  caja baja mirándolo desde arriba; el encargo decía las dos cosas («no conseguí
  localizar dónde colocar… no son fáciles de encontrar»). La hoja lista los que
  hay con dónde están y pinchar uno lo elige.
- **El alto de fábrica no es tuning: es lo que hace que funcione.**
  `COVER.stepHeight` es 0.25, así que una plataforma más alta sólo empuja
  cayendo encima y no entrando andando (vuelta 80). Naciendo como un bordillo de
  0.6 sería una mecánica que va la mitad de las veces y sin que nada lo
  explique. Nace a **0.2**, y el panel dice por qué.
- **Y colocar no cambia de hoja.** El dispositivo queda elegido con su flecha ya
  dibujada —que es con lo que se coloca— y su ficha sale en esa misma hoja.
  Mandar a otra pestaña a quien acaba de pulsar un botón es perderle el sitio.

Y una que se ve al medirla: **un raíl de iconos sólo vale si la palabra cabe
entera**. El raíl lleva la palabra debajo desde la 78 —un raíl de pictogramas es
un examen— y «Dispositivos» no cabía: a 56 px se cortaba en «ispositivo» y a 68
se partía por la mitad. Se ensancha el raíl a 76 y baja la letra a 8 px **para
todos**, no sólo para la larga: dos tamaños de letra en la misma columna se leen
como dos clases de botón. Y es barato justo por lo que el raíl vino a dar — las
secciones crecen a lo largo de él y la columna de contenido no se entera.

### 81.6 Publicar sin terminal

El despliegue era correcto y estaba documentado paso a paso, y aun así el coste
real era otro: quien publica tiene que tener el portátil delante, acordarse del
`--ha=false` y saber qué hacer si `fly status` devuelve dos filas.

`.github/workflows/desplegar.yml` despliega al llegar un commit a la rama de
trabajo. Cuatro decisiones:

- **Construye en Fly (`--remote-only`)**, no en el corredor de GitHub: la imagen
  no tiene que viajar por la red dos veces, y el `Dockerfile` ya hace `npm ci` y
  `npm run build` dentro.
- **`--ha=false`, y además comprobado.** La regla de la vuelta 59 —una sola
  máquina, porque dos son dos mundos para el mismo código de sala— deja de ser
  una nota que hay que acordarse de leer y pasa a ser un paso que falla en rojo.
  Y si hubiera más de una, el propio despliegue la corrige con
  `fly scale count 1`: el remedio es un comando y la alternativa es un duelo
  roto esperando a que alguien mire un registro.
- **`/salud` tres veces, exigiendo la misma máquina.** Es la comprobación que la
  guía pedía hacer a mano, y no es redundante con la anterior: la lista puede
  decir una y contestar dos.
- **Los despliegues hacen cola** (`cancel-in-progress: false`). Cancelar uno a
  medias deja una imagen a medio subir; con la cola, gana el último empujón, que
  es lo que se quiere.

**La credencial no pasa por aquí.** `FLY_API_TOKEN` lo crea y lo guarda su dueño
en la web de GitHub (`fly tokens create deploy -x 8760h`, un token **sólo de
despliegue** y con caducidad), y no se pega en un fichero del repositorio, ni en
un chat, ni en un correo. El flujo de trabajo comprueba que existe **antes** de
llamar a `flyctl` y, si no está, dice en una línea qué hacer — porque el error
de autenticación de `flyctl` no lo dice.

### 81.7 Y lo que sigue necesitando el PC, en un doble clic

El editor no entra en el despliegue a propósito: es una herramienta de desarrollo
y escribe ficheros en el repositorio. `Alchemist.bat` (Windows) y
`Alchemist.command` (Mac y Linux) hacen los tres pasos y los explican por
pantalla. Dos detalles que son el diseño:

- **`git pull --rebase --autostash`, no `git pull`.** Quien usa el editor **edita
  mapas**, o sea ficheros del mismo repositorio que nosotros tocamos. Un `pull`
  a secas falla con trabajo local a medias, y falla en un idioma que no ayuda.
  Con `--autostash` se guarda lo suyo, se trae lo nuestro y se vuelve a poner
  encima; y si chocara —sólo puede pasar si los dos tocamos el mismo fichero— se
  deshace solo y lo dice en castellano, **sin perder nada**.
- **La instalación se decide por contenido, no por fecha.** `git pull` reescribe
  `package-lock.json` aunque su contenido no cambie, así que una marca de tiempo
  reinstalaría en cada arranque. Se compara con la copia que se guardó la última
  vez que se instaló de verdad.

### 81.8 Lo que queda medido

- **`tubo81.mjs`** (sin navegador): un tubo en el fichero son 22 cajas en el
  motor y **todas AABB con volumen**; el hueco libre nunca baja del radio en
  cuatro combinaciones de radio y caras; **nadie sale del pozo andando** en
  dieciséis rumbos —parándose entre 2.6 y 2.95 de un radio de 3—; los topes del
  formato acotan y un tubo sin `z` no llega al mapa y **se dice**; y el tubo más
  caro que se puede declarar son 44 piezas contra las 1500 que costaban 0.0004
  ms por paso (vuelta 76).
- **`ed81.mjs`** (con el ratón de verdad sobre el lienzo): el botón de forma deja
  un tubo montado **sin meter veintidós cajas en el mapa**; se estira por sus
  tiradores sin mover el centro; el saneado y el serializador lo conservan sin
  desplegarlo; la pestaña de dispositivos está en el raíl, **con otro color** y
  con su palabra; sus tres botones dejan el dispositivo puesto, a 0.2 de alto y
  **sin cambiar de pestaña**; y la lista los enseña y los elige.
- Y **la batería entera verde** (46 suites) después.

Dos avisos que costaron una medida cada uno y valen para la próxima:

- **`movement.update` toma el delta en segundos y el instante en
  milisegundos.** Pasándole el delta en ms el jugador avanza 108 u en un paso y
  acaba pegado a la pared de la sala, que desde fuera se lee exactamente como
  «atraviesa el tubo». La aserción del techo pasó y la del **suelo** —que de
  verdad estuviera andando— la cazó, que es la regla de la vuelta 57.
- **`zonas-test` mide una proporción cerca de su umbral.** Salió roja una vez
  con 67% contra un tope de 65%, y parecía una regresión. Muestreada cinco veces
  con el código nuevo da **51-61%**, y con el viejo **54-60%**: es ruido, no un
  cambio. Antes de creerse un rojo estadístico, hay que muestrearlo — y el
  procedimiento de la vuelta 78 (`git stash`, reiniciar, volver a pasar) es lo
  que separa las dos cosas.

---

## §82 — Los dispositivos, después de jugarlos

Feedback de la primera sesión larga usando rebote, velocidad y teletransportes
en un mapa de verdad. Cinco puntos, y el primero **revierte una decisión de la
vuelta 80**.

### 82.1 El lanzamiento no tiene techo

El encargo, literal: «demasiado débil, apenas saca al jugador de la propia
plataforma… mejor poder pasarse de potencia y bajarla después que estar
limitado a la baja como ahora».

La causa no era el tope del formato (40). Era esta línea de la vuelta 80:

```js
const v = Math.min(sup.fuerza, this.fisica.airStrafeMaxSpeed)
```

`airStrafeMaxSpeed` de fábrica son **9.5 u/s**, que es la marcha de correr. O
sea que la plataforma más potente que un mapa podía declarar te lanzaba a la
velocidad a la que ya ibas andando.

El argumento de la 80 era correcto y sigue siéndolo: saltarse el techo abre un
camino para pasar de `airStrafeMaxSpeed` **sin air-strafe**, que es la técnica
del juego. Lo que estaba mal era la conclusión, por tres razones que sólo se
ven jugando:

- **El air-strafe es del jugador y esto es del mapa.** Un lanzamiento no
  compite con una técnica: hay que ir a pisar una losa concreta, no se repite a
  voluntad y quien construye el mapa decidió ponerla ahí. Son dos economías
  distintas.
- **La salida que ofrecía la 80 tiene un efecto colateral enorme.** Decía: «un
  mapa que quiera lanzar más fuerte sube su techo, que ya puede desde la 72».
  Subir `airStrafeMaxSpeed` cambia **cómo vuela todo el mapa** —cada salto, cada
  encadenado, cada caída— para poder poner una plataforma potente. Es pagar el
  mapa entero por un dispositivo.
- **Y no cuesta nada en red.** Sigue sin viajar ningún número: los dos extremos
  montan el mismo mapa y derivan el mismo empuje, que es el patrón de la física
  de la 72.

Lo que queda es un tope **del formato**, como los de `SALA`: `fuerzaMax` pasa de
40 a **300** y existe para que un fichero corrupto no meta un número absurdo en
el mundo. El número no es de gusto — sale de que `resolveAxis` es un barrido que
acota contra la cara más cercana, así que a 300 u/s un paso de 60 Hz avanza 5 u
y **se sigue parando en la pared** en vez de atravesarla. Y el impulso vertical
se separa en su propio tope (`saltoMax`, 60), porque son dos cosas distintas y
compartir número era una casualidad.

### 82.2 Y un clamp que le robaba el lanzamiento, que no se veía

Levantar el techo destapó otra cosa. `_updateAirAccel` acaba así:

```js
const max = this.fisica.airStrafeMaxSpeed
const speed = Math.hypot(this._airVelX, this._airVelZ)
if (speed > max) { /* escalar el vector entero a `max` */ }
```

Con un lanzamiento a 60 u/s eso es una trampa: mirar hacia un lado deja la
proyección de la velocidad sobre la dirección pedida por debajo de `wishSpeed`,
así que entra por la rama de la ganancia, y el escalado de abajo **frena el
vuelo entero de 60 a 9.5 en un solo paso**. Un lanzamiento que se apaga por
girar la cabeza.

El arreglo es una línea y es la regla, no un parche: el techo pasa a ser
`max(techo, lo que ya traías)`. Lo que este tope tiene que impedir es que el
air-strafe **gane** por encima del techo; lo que no puede hacer es **quitar**
marcha que no ha puesto él. Medido: el caso de siempre sale idéntico —girando
25 s seguidos sin plataforma, el pico queda clavado en **9.5000**— y un
lanzamiento acaba en la misma coordenada mire el jugador a donde mire (−23.042
en los cuatro rumbos probados).

### 82.3 La marca se repite, y va rellena

Era **una** flecha de líneas en el centro de la pieza. Eso falla por los dos
extremos: regular en una losa de 4×4, y un garabato en medio de un descampado
en una del tamaño del suelo de un mapa — que es justo lo que esta vuelta abre.

Ahora es un **galón** (una uve gruesa apuntando a donde lanza) o un **muelle**,
repetidos en rejilla por toda la cara de la pieza, con un tope de repeticiones
para que una losa de 200×200 no sean seis mil dibujos. Un mapa entero de
velocidad se ve como un mapa entero de velocidad.

Y van en **triángulos, no en líneas**. No es una preferencia: en WebGL el
grosor de una línea no se toca —`linewidth` se ignora, que es exactamente lo
que se midió con el contorno de la brújula en la vuelta 41— así que «franja
gruesa» sólo se puede dibujar rellena. Sigue fuera de `occluders` y fuera del
presupuesto: ningún rayo le pregunta nada.

El muelle se calibró mirándolo: a 1.5 u de alto —lo primero que se probó— mide
casi lo que un jugador y la losa se lee como un bosque de alambres. Baja a
0.85. Es un dibujo en el suelo que dice qué pisas, no una pieza del mapa.

### 82.4 Un dispositivo puede no tener losa

`superficie.invisible` le quita la malla y le deja **todo lo demás**: se sigue
pisando, se sigue chocando y su marca se sigue dibujando. Es para un mapa donde
el dispositivo *es* el suelo y una caja gris encima sobra.

Lo que se paga hay que decirlo porque no se adivina: **las balas la
atraviesan**. Los disparos van contra la malla dibujada desde la vuelta 64, así
que sin malla no hay contra qué cortar y el tiro sigue hasta el suelo de
debajo. Con la losa de 0.2 con la que nacen los dispositivos son 20 cm en dónde
cae la marca de impacto; con una pieza alta sería una pared invisible que no
para balas, y por eso el editor lo avisa en su ficha en vez de prohibirlo.

Se consideró lo contrario —dejar la malla con el material transparente— y es
peor: un `MeshBasicMaterial` transparente **sigue recibiendo el rayo**, así que
sería una pared invisible que sí para balas. De los dos errores posibles, el
que se elige es el que se nota menos y se puede explicar en una línea.

### 82.5 Norma permanente: un dispositivo nace con voz y con destello

Esto no es un punto más del feedback: es una regla para todo lo que venga.
**Cada dispositivo se construye con su sonido y su efecto visual de uso,
decididos al construirlo, no añadidos después.**

El porqué es la regla de la marca de la vuelta 80 llevada un paso más allá. En
un juego sin texturas ni luces, lo que no se dibuja no existe; la marca dice
*qué es* esto y el destello dice *que acaba de pasar*. Sin lo segundo, pisar
una plataforma de rebote y saltar por tu cuenta **se ven exactamente igual**. Y
el sonido, porque el oído no hay que apuntarlo a ninguna parte (vuelta 73): es
el único canal que avisa de algo que pasa a tu espalda.

Cinco decisiones dentro de eso:

- **Lo que distingue los gestos es la forma, no el color** (regla de la 67, y
  el azul eléctrico de la 80). Rebote: un anillo tumbado que se abre y sube.
  Velocidad: un anillo **de pie**, encarado al rumbo, que sale disparado hacia
  donde lanza. Puerta: el mismo anillo **cerrándose** en la entrada y
  **abriéndose** en la salida — los dos extremos son el mismo gesto invertido a
  propósito, que es lo que hace que llegar se lea como la otra mitad de haber
  entrado.
- **Un `InstancedMesh` y nada más** (`src/game/dispositivos.js`), que es el
  patrón de `impacts.js`: una geometría, un material y una malla para el pool,
  y apagarse es bajar a negro, que con mezcla aditiva **es** invisible. Con el
  reloj del mundo, así que en pausa un destello se queda quieto.
- **Tres voces, y ninguna es otra con el volumen cambiado**, que es la regla
  del silbido de la vuelta 40. Rebote: el tono **sube**, al revés que el
  aterrizaje (que cae y ataca en 12 ms). Velocidad: ruido por un pasa-banda que
  **sube** de 420 a 2600 Hz, justo al revés que el silbido de una bala. Puerta:
  dos parciales **inarmónicos** en relación 2.37 cayendo — ni octava ni quinta,
  porque una relación armónica suena a nota musical y una puerta no es una nota.
- **El movimiento deja un recado y el motor lo gasta.** `usoDeDispositivo` es un
  **recado de un paso vivo**, exactamente como `rumboPedido` de la vuelta 80: no
  va en `snapshot()` porque no es estado, y **el servidor no lo necesita** —
  `partida.js` no tiene ni escena ni altavoces—. Y con la misma trampa: la
  reconciliación pasa por el mismo `update`, así que `cliente.js` lo limpia tras
  reejecutar, o una plataforma dentro de la cola sin confirmar sonaría varias
  veces por segundo.
- **Y la puerta de un rival se oye sin un campo nuevo en el protocolo.** Lo que
  viaja es que su `poseEpoch` ha cambiado, y eso también lo hace una
  reaparición; distinguirlos no pide un campo, pide **preguntarle al mapa**, que
  los dos extremos montan igual: si de donde saltó había un área de
  teletransporte, fue una puerta. Suena en **el sitio del que se fue**, que es
  quien tiene derecho a enterarse. Con emisor **propio** y su curva
  (`SURFACES.audio`, 30 u): colgarlo del emisor del rival le pondría el radio de
  16 u de las pisadas, que es el aviso escrito en `CLAUDE.md` desde la 63.

### 82.6 Y una deducción que dejó de valer

`_pisadasDelRival` daba por teletransporte «ir a más del doble del techo del
aire». En cuanto una plataforma pudo lanzar a 60 u/s, **un lanzamiento se leía
como un teletransporte** y le borraba al rival la referencia de zancada.

Ahora lo dice la época de pose, que es el dato que de verdad significa «no hubo
camino» — y exactamente la razón por la que existe desde la vuelta 50 en vez de
mirar cuánto se ha movido alguien. Es la misma frase de aquella vuelta,
cobrándose sola dos vueltas después: *una comprobación de distancia confunde un
teletransporte con un jugador rápido*.

### 82.7 Lo que queda medido

- **`disp82.mjs`** (sin navegador): la fuerza declarada es la que se aplica
  dígito a dígito y el recorrido escala con ella (×3.4 de 12 a 120); girar la
  cabeza tras un lanzamiento deja la misma coordenada en los cuatro rumbos; el
  air-strafe sigue clavado en **9.5000** sin plataforma; trece rebotes seguidos
  al **mismo ápice** (un empuje del mapa no gasta fatiga); una puerta avisa una
  sola vez y con sus dos extremos; la marca crece con la losa y se para en su
  tope; e invisible quita el oclusor, conserva la caja de colisión y sigue
  lanzando.
- **`ed82.mjs`** (con el ratón de verdad, y con el motor de verdad para el
  destello y la voz): los cuatro presets se aplican **sin mover el centro**;
  «Suelo» cubre la sala de lado a lado; una losa de 180×150 se escribe y llega
  al motor sin acotarse; la casilla de invisible escribe el campo, saca su aviso
  y al quitarla **no deja un `false`** en el fichero; y probando, un rebote
  enciende su destello y **crea sus dos osciladores**, que es cómo se comprueba
  que una voz se ha disparado de verdad sin montar la sonda del máster.
- Y **la batería entera verde** (46 suites) después.

### 82.8 Tres rojos que no eran de esta vuelta

Conviene anotarlo porque es el procedimiento de la vuelta 78 funcionando. La
batería salió con tres suites en rojo; `git stash`, reiniciar y volver a
pasarlas contra el código de antes las dejó **rojas igual**. Ninguna era una
regresión:

- **`audio39`**: `src/audio/weaponSamples.js` es un fichero **generado** y
  estaba con diez muestras declaradas mientras `public/audio/` no existía —el
  manifiesto listaba ficheros que no están—. Con `samplesEnabled: false` nadie
  los pide, así que no se notaba; el día que alguien encienda el booleano serían
  diez 404. Se arregla como cualquier generado: volviendo a pasar
  `npm run audio:weapons`, que con el interruptor apagado lo deja vacío.
- **`spawn43`**: el muro de aparición del Plano A se movió de z 15.2 a 15.5 y la
  banda se quedó en 15.2, así que dejaron de coincidir. Se mueve **la banda al
  muro**, no al revés: el muro es donde lo puso quien edita el mapa, y la regla
  de la vuelta 43 es que la banda empieza en su cara.
- **`spawner`**: contaba como ciegas las casillas **de dentro de la banda**, que
  es justamente lo que la vuelta 43 exige que estén. Salían cero antes de mover
  el muro y cinco después, y el agregado se puso rojo sin que nada se hubiera
  roto. El banco medía un número en vez de la propiedad (vuelta 78): ahora el
  agregado se mide **fuera de la banda**, y lo de dentro lo afirma la línea que
  ya existía.

## §83 — El bloque grande: ventilador, hielo, tirolina y colisión curva

El triaje de la vuelta 79 dejó cuatro mecánicas aparcadas por escrito en
`docs/propuestas/06-superficies-y-estructuras.md`, cada una con la razón de por
qué no cabía en el bloque barato de la 80. Esta vuelta las construye las cuatro,
y de paso paga una deuda que llevaba desde la 69.

Lo que las cuatro tienen en común, y es lo que hace que quepan en una vuelta:
**ninguna viaja por la red**. Los dos extremos montan el mismo mapa, derivan los
mismos números y dan los mismos pasos, que es el patrón de la física de la 72 y
de las superficies de la 80.

### 83.1 El ventilador: no es una fuerza, es otra gravedad

La razón por la que estaba aparcado no se ve en el editor, y está escrita desde
la 79: **la vertical de Vektor está resuelta en forma cerrada**
—`y = y₀ + v₀·t − ½g·t²` desde el despegue (vuelta 27)— así que un empuje
sostenido **no es sumar una fuerza por frame**. Eso sería volver a integrar por
Euler y perder la independencia del refresco que costó la vuelta 44.

Lo que es, es **otra gravedad**. Dentro del volumen la parábola se evalúa con
`gravedad − fuerza`, y lo único que hay que resolver es la frontera: al entrar o
al salir, la parábola **se re-ancla** en el punto y con la velocidad que se
traía. `_gVuelo` guarda con qué gravedad se despegó, viaja en `snapshot()` y es
lo que `_land` usa para despejar el instante exacto del contacto.

De ahí tres cosas que no son evidentes:

- **Estar de pie dentro de uno te levanta.** Sin eso, el empuje sólo existiría
  para quien ya está volando y la única forma de usar un ventilador sería saltar
  dentro. Es «pisarla cuenta, no sólo caer sobre ella» (vuelta 80) aplicado a un
  volumen. Despega con velocidad cero: lo que sube es la gravedad negativa.
- **El ápice, con gravedad negativa, no existe dentro del volumen.** `_apexFeetY`
  —que es lo que decide si un salto pasa por encima de una caja— se resuelve en
  dos tramos: hasta el techo del ventilador con la gravedad de dentro, y de ahí
  arriba con la del mapa.
- **Y `_airTimeLeft` es `Infinity`** mientras la gravedad efectiva no sea
  positiva: no hay «cuánto queda de vuelo» si el vuelo no baja.

Medido (`vent83`): ápice **16.8583 u idéntico a 60, 144 y 240 Hz** (dispersión
0.0006%), a **0.347%** de lo que predice la parábola de dos tramos, mayor cambio
de altura en un solo paso **0.29 u** —o sea ningún salto en la frontera— y un
mapa sin ventiladores acaba en la misma coordenada hasta el último decimal.

### 83.2 El hielo: lo único del juego que le da velocidad al suelo

Tampoco estaba aparcado por capricho. **A pie en Vektor no hay velocidad**: un
paso es `posición + dirección × marcha × dt`, y soltar W para al jugador en ese
mismo paso. «Resbaladizo» no es bajar un rozamiento que no existe — es estrenar
un modelo de velocidad en el suelo, con sus campos en `snapshot()`.

Eso es lo que se ha hecho, y con la puerta cerrada por construcción: mientras no
haya hielo debajo y la velocidad de suelo valga cero, `_gobiernaElHielo` devuelve
`false` y el paso es el camino de siempre. Medido: el mismo paseo por un mapa sin
hielo acaba en `6.008711581, -28.248016082, 0.886333333` con y sin la mecánica.

En una pista de hielo, `fuerza` **es el rozamiento** —en u/s², cuanto más bajo
más se resbala— y no un empuje. Es el mismo campo con otro significado, así que
la ficha del editor lo dice con todas las letras y la fila de la lista lo llama
por su nombre: un panel que lo llamara «fuerza» a secas invitaría a subirlo para
resbalar más.

Y lo que se paga, anotado y no escondido: **es una integración, no una forma
cerrada**, así que dispersa un **0.799%** entre 60 y 240 Hz. Se admite por lo
mismo que el modelo vectorial del aire (vuelta 32): con el paso de mundo fijo a
60 Hz desde la 44, el número de integraciones por segundo de juego **es el
mismo** en cualquier monitor, y lo que queda es fase de muestreo.

Medido (`hielo83`): 19.01 u de deriva tras soltar la tecla en hielo contra
**0.0000** en suelo normal; el rozamiento declarado manda (30.24 / 22.14 / 6.2 u
para 0.6 / 1.6 / 6); salir del hielo cuesta 1.06 u y 300 ms de recuperar el
control, acabando en velocidad de suelo exactamente cero; 13 raspados
deslizándose y 0 parado.

### 83.3 La tirolina: un estado de movimiento nuevo

El triaje la puso en «vuelta propia, del tamaño del deslizamiento», y lo es por
la misma razón: **es un estado**, con sus campos que viajan, su forma cerrada y
su regla de qué marcha conserva al soltarse. Es el primer estado nuevo desde la
vuelta 69.

Cinco decisiones, y ninguna es tuning:

- **El cable es de un solo sentido.** Se declara `desde` y `hasta` y siempre se
  viaja en esa dirección. Es lo que deja dibujar una flecha que no miente: un
  cable de doble sentido tendría que decidir por qué extremo has entrado, y
  entonces la flecha del editor diría una cosa distinta a cada jugador.
- **Se avanza en forma cerrada**, `d(t) = velocidad · t` desde el enganche, no
  `v · dt` sumado paso a paso. A velocidad constante los dos dan *casi* lo
  mismo, y este proyecto ya sabe lo que cuesta ese «casi».
- **Engancharse pega al cable**, y eso es un salto de hasta `alcanceU`, o sea un
  teletransporte para quien te dibuja: sube `poseEpoch` (vueltas 44 y 50).
- **Soltarse conserva la velocidad del cable**, las dos componentes. **No** es la
  regla del deslizamiento —que siembra el vuelo con tu carrera y no con su
  empujón— y la diferencia no es de gusto: allí se evitaba que una **técnica del
  jugador** rematara por encima del techo lo que otra técnica había dado; aquí la
  velocidad **la decide el mapa**, exactamente como la plataforma de la 82.
- **Y va por el flanco de la tecla contextual**, que entra en la máscara de
  entradas como octavo bit. Mantenerla pulsada da **un** enganche, como mantener
  SPACE da un salto desde la 68, y el flanco se deduce comparando la máscara de
  este paso con la del anterior — así no hace falta ni un campo más en el
  protocolo.

**La tecla contextual reparte ahora tres cosas**, y el orden es la regla de la
vuelta 27 ampliada: dentro del radio del explosivo `use` desactiva y **nada
más**; fuera manda el cable que tengas al alcance; y si no hay cable, el
artilugio. Quién dice que hay cable es **el propio movimiento**
(`hayTirolinaAlAlcance`), no una segunda cuenta desde el motor.

#### El paso del enganche también avanza, y eso lo cazó el banco

La primera versión gastaba el paso del enganche en agarrarse y empezaba a
avanzar en el siguiente. Parecía inofensivo y no lo era: **un paso perdido es
una fracción distinta del viaje según el refresco** —a 60 Hz es 1 de 90 y a 240
es 1 de 360—, así que el recorrido de un cable salía con **0.84% de dispersión**
entre monitores. Una forma cerrada no puede permitirse eso, y la causa no estaba
en la fórmula sino en cuántas veces se evalúa. Con el enganche avanzando:
**0.0000%**.

Medido (`tiro83`): recorrido idéntico a 60/144/240 Hz; para **justo en el
extremo** (x 20.000000 de un cable que acaba en 20); conserva 13.8451 u/s
horizontales y −2.0768 verticales, que son exactamente las del cable; los ojos
cuelgan 0.5500 u por debajo; snapshot/restore a mitad de cable y un segundo
después los dos están en la misma coordenada hasta el noveno decimal; y la
altura baja en **recta** —mayor cambio de pendiente entre pasos 0.00000000—,
que es lo que demuestra que ahí debajo no hay gravedad.

### 83.4 La colisión convexa, y «se hace entera»

`CLAUDE.md` decía desde la 79 cómo había que hacer ésta: «No es una cosa sino
tres —giro de 90° (ya está), OBB, y convexa de N lados, que es lo que de verdad
hace falta—; un OBB suelto resuelve el 20% de los casos y paga el 90% del
precio, que es reescribir `resolveAxis`».

Así que la primitiva es **una sola**: un prisma convexo, guardado como **sus
caras** (`src/maps/prisma.js`). Un polígono convexo **es** la intersección de sus
semiplanos, y con esa forma la colisión sale siendo la que ya había: la banda
`[lo, hi]` que `clampAgainstBand` acota en un eje se despeja de los semiplanos
exactamente igual que se despejaba de `minX − radio` y `maxX + radio`. Por eso
**`resolveAxis` no se reescribe**: los prismas son una pasada más que acaba
llamando a la misma función, y un mapa sin ellos recorre un bucle vacío.

Y las dos formas que se pueden dibujar salen de la misma primitiva:

- **`lados: 4` es una caja girada**, que es la rotación libre que se pedía desde
  la fase 5 del editor. No es un caso especial escondido: es lo que «cuatro
  lados» significa. Medido: con `giro: 0` para al jugador en **la misma
  coordenada** que la caja equivalente, en los cuatro rumbos.
- **De cinco en adelante es el polígono regular inscrito** en ese ancho y ese
  fondo: la columna, que es la curva. Es lo mismo que hace el tubo de la 81
  —aproximar una curva con lo que el motor sabe chocar— pero por dentro.

Lo que se paga, y va escrito porque no se adivina: **las esquinas se cortan a
inglete y no en redondo**. Engordar un polígono convexo un radio de verdad deja
las esquinas redondeadas; desplazar cada cara y cruzar los semiplanos sobra un
poco justo en los vértices. Es el mismo defecto que la colisión de cajas tiene
desde el primer día, así que un prisma se comporta **como una caja** y no como
una cosa nueva que hay que aprender.

Medido (`curva83`): un muro de 12×1.5 girado 45° para al jugador a **1.1500 u de
su eje** en los seis rumbos que le llegan de frente, y los otros dos lo recorren
a lo largo y salen por la punta —ninguno se cuela—; un pilar de doce caras para
entre **3.2978 y 3.4141 u** del centro, con la apotema más el radio del cuerpo en
3.2978 exacto; **14 641 puntos barridos sin una sola discrepancia** entre lo que
el suelo admite y lo que la horizontal deja; y cien pilares de doce caras cuestan
**0.00248 ms por paso** contra un presupuesto de 0.2.

### 83.5 La deuda de la vuelta 69, y la mitad que no estaba escrita

La colisión curva tenía una dependencia anterior anotada desde la 69: **la
comprobación de no levantarse debajo de algo**, porque un tejado sólido es
precisamente una pieza con aire debajo. `slide69` [9] era la alarma que la
guardaba.

Escribirla fue una línea: el objetivo de altura de ojos se acota contra
`scenario.techoSobre(x, z, feetY)`, y es **el mismo número** que usa la
horizontal —ahí la cabeza es `feetY + eyeHeight`— así que los dos sistemas
admiten los mismos sitios.

Lo que no estaba escrito en ninguna parte es la otra mitad, y sin ella la
primera no sirve de nada: **`groundHeightAt` ignoraba `bottom`**. Una pieza que
empieza por encima de tu cabeza era tu suelo, así que pasar por debajo de un
dintel **te subía a su techo de golpe** —el suelo te daba 3.6 estando a 0.2—.
Nunca había pasado porque ninguna pieza de ningún mapa tenía la base en el aire;
desde que el editor deja subirlas (vuelta 76), sí.

`slide69` [9] deja de ser una alarma y pasa a ser la medida que venía a pedir:
un test que ya no puede fallar no guarda nada (vuelta 57). Medido: agachado se
pasa por debajo con los pies en 0.200; soltando la tecla los ojos se quedan en
**1.2000** de los 1.7 y la coronilla en **1.4000**, que es justo la base del
dintel; y al salir se levanta solo, sin volver a tocar la tecla.

### 83.6 Lo que vale su valor de fábrica no viaja

Las tres mecánicas nuevas añaden **nueve campos** a `snapshot()`, y esa foto la
manda el servidor a los dos jugadores sesenta veces por segundo. Medido: 138 B
por jugador y foto, o sea **16 KB/s de bajada** — y `red45` [5] se puso rojo con
135.8 KB/s contra un listón de 120.

La respuesta no es subir el listón. `JSON.stringify` **se salta las propiedades
`undefined`**, así que un campo que vale su valor de fábrica se escribe como
`undefined`: desaparece del cable sin desaparecer del objeto —la forma se
conserva, que es lo que el bucle caliente necesita— y `restore()` ya devolvía el
valor de fábrica a lo que no llegara.

Medido: la foto de un jugador volando vuelve a **575 B**, que es exactamente lo
que pesaba antes de esta vuelta, y `red45` baja a **119.0 KB/s**. La regla, para
el día que se añada estado nuevo: **lo que vale su valor de fábrica no viaja**.

### 83.7 Dos bugs que salieron del editor, y los dos valen fuera de él

- **Leer una lista del mapa no puede escribir en el mapa.** Los cinco accesores
  de listas del editor la creaban al pedirla (`if (!Array.isArray(mapa.x))
  mapa.x = []`). Parece inofensivo y no lo es, porque **el mapa es lo que compara
  deshacer/rehacer**: pintar el panel le añadía campos al final y un mapa
  restaurado ya no era igual al guardado —mismos datos, otro orden de claves—.
- **Y el saneado es un punto fijo, también en el orden de las claves.** Sanear
  dos veces da lo mismo byte a byte, y eso es lo que hace que deshacer/rehacer
  pueda comparar dos mapas con un `JSON.stringify`. Un objeto creado con las
  claves en otro orden rompe esa comparación sin cambiar ni un dato: `ed76` [6]
  salió rojo con un «rehacer no devuelve el mapa al dígito» y los dos mapas eran
  el mismo.

Y uno de dibujado que no dio ni un error en pantalla: **una geometría que se
funde con otras tiene que traer sus mismos atributos**. Un prisma iba al mismo
montón que las cajas de su altura —para eso está el montón, para que todo un
`kind` sea una llamada de dibujo— y `mergeGeometries` exige los mismos atributos
y el mismo índice. Faltaban `uv` e índice, y la fusión fallaba **entera**: el
montón de esa altura no se dibujaba. Lo único que lo delató fue una línea en la
consola del navegador, que es lo que `ed76` cuenta.

---

## §84 — El hielo no dejaba entrar, y los dispositivos se ven distinto

Vuelta corta y de arreglo: un bug que se notaba jugando y cuatro cosas de
apariencia que pidió quien lo juega. Nada de esto cambia el modelo de nada.

### 84.1 «Un escalón que no deja entrar desde ciertos ángulos»

Así llegó contado, y era exacto. Lo primero que hubo que descartar es lo obvio:
la losa de un dispositivo mide 0.2 y `COVER.stepHeight` es 0.25, así que
`resolveAxis` la salta por la primera condición de su bucle y **no puede
bloquear a nadie**. La colisión no era.

Lo que era está en la siembra del hielo, y es una promesa que caducó sin que
nadie se enterara. `_landingVelX/Z` guarda la velocidad horizontal del último
aterrizaje, y su propio comentario decía, desde la vuelta 32:

> Fuera de la ventana esto no lo lee nadie: el salto siguiente vuelve a sembrar
> desde el suelo.

Era verdad hasta la vuelta 83, que le puso un segundo lector: **entrar en el
hielo se siembra con lo que venías haciendo**, y «lo que venías haciendo», si
vienes por el aire, es esa velocidad. El campo nunca se borra —sólo en
`reset()`— así que un salto cualquiera deja escrito un rumbo que sigue ahí un
minuto más tarde. Entrar andando en una pista te sembraba **hacia donde
aterrizaste la última vez**; y como en hielo manda la velocidad del suelo y no
las teclas (vuelta 83), si aquel rumbo apuntaba hacia fuera, entrabas, te
sacaba, volvías a entrar y te volvía a sacar.

De ahí las dos mitades del síntoma: se sentía como un tope, y dependía del
ángulo porque dependía de **dónde apuntaba un salto anterior**.

Medido antes (`hielo84`, entrar caminando hacia el centro desde 36 rumbos):

| | entran |
|---|---|
| recién aparecido | **36 / 36** |
| tras un salto en otra dirección | **0 / 36** |

Los 36 fallos se quedaban entre 5.67 y 5.96 u del centro, o sea clavados en el
borde de la pista (6 u).

**El arreglo es una ventana, y no un número nuevo.** La velocidad de aterrizaje
sólo cuenta como «lo que traías» si el aterrizaje es reciente, y la medida de
«reciente» ya existe: `MOVEMENT.chainJumpWindowMs`, que es exactamente la que
decide si un salto encadena, o sea **la que ya significa «todavía llevas la
marcha con la que aterrizaste»**. `_landedAt` viaja en `snapshot()` desde que
existe, así que los dos extremos de una partida deciden esto igual sin un campo
más en el protocolo.

Medido después: **36 / 36 en los dos casos**. Y lo que la siembra de vuelo
existía para dar sigue estando —caer dentro de una pista con marcha mete
deslizando 10.27 u sin tocar una tecla—, el hielo sigue siendo hielo —22.18 u de
deriva al soltar con rozamiento 1.6, contra los 22.14 medidos en la 83— y un
mapa sin hielo acaba dígito a dígito donde acababa.

### 84.2 La losa de un dispositivo no se dibuja

Lo pidió quien lo juega —«que sólo se vea el icono, sin el bloque debajo»— y
está bien pedido por una razón que no es de gusto: **un dispositivo no es una
pieza del mapa**. Es una marca en el suelo que hace algo. La caja gris de debajo
no decía nada que la marca no dijera mejor, y encima competía con ella: un galón
dibujado sobre una tapa clara se lee la mitad.

**La regla no es «todos los dispositivos», es «los que son suelo»**, y el corte
no es un número inventado: `COVER.stepHeight` (0.25) es la altura por debajo de
la cual se entra andando, o sea justo la que separa una losa pintada en el suelo
de una pieza contra la que se choca. **Una pieza con la que el jugador se va a
tropezar tiene que verse**, así que de ahí arriba se sigue dibujando. Con los
0.2 con que nacen todos desde la vuelta 81, eso cubre el botón entero.

La casilla `invisible` de la vuelta 82 no se va: pasa a ser lo que de verdad
queda por decidir —esconder un dispositivo **alto**— y la ficha del editor lo
dice así, con su aviso de siempre (las balas lo atraviesan).

### 84.3 Amarillo, y por qué el argumento de la vuelta 80 estaba mal planteado

Las marcas iban en azul eléctrico, y la 80 lo justificó mirando la **paleta**:
no podía ser ámbar (hay una bomba), ni rojo (te disparan), ni amarillo (te han
visto), ni naranja (eso es una diana). Todo eso sigue siendo cierto y aun así
faltaba la mitad, porque el azul no competía con otro **significado**: competía
con el **fondo**. Un mapa de Vektor no tiene ni texturas ni luces, así que es
gris y negro entero, y un cian apagado sobre gris es un tono frío sobre otro
tono frío — a diez unidades la marca se leía como una raya más de la rejilla.

`COLORS.dispositivo` (#FFC21E) es el tercer color de la paleta que significa dos
cosas, y se admite por lo mismo que el verde de la brújula y el azul de la
carga: **no coinciden nunca**. `alert` es el `?` de «te ha visto», un billboard
que flota sobre un muñeco y sólo existe en el entrenamiento; esto está pintado
en el suelo, bajo los pies, y existe en los dos modos. Y lo que de verdad los
separa es la forma, que es la regla de la vuelta 67: un signo de interrogación
no se confunde con un galón. Va más ámbar que el limón de `alert` justo para
que, en el único sitio donde podrían salir a la vez, no sean el mismo amarillo.

**El cable de una tirolina se queda azul**, y no es una excepción: es la única
marca que no está pintada en el suelo. Cruza el aire, contra el cielo o contra
el fondo del mapa, donde el gris no compite con nada. Son dos materiales, no
uno, y el banco comprueba que los dos colores salen a la vez.

### 84.4 Una tirolina se lee de un vistazo, no recorriéndola

Los anclajes eran tres rayas en los ejes del mundo, y desde lejos tres rayas son
tres rayas: lo que se veía era el cable engordando un poco en las puntas. Ahora
es un **rombo alrededor del cable** —un anillo de cuatro lados en su plano
perpendicular, con sus cuatro radios— que se lee como una pieza enganchada ahí,
que es lo que es. Sigue sin tener cara buena, que era la gracia de la cruz.

Y las flechas repartidas dicen el sentido **mientras recorres el cable con la
vista**; lo que faltaba era decirlo sin recorrerlo. Va una grande en el extremo
de llegada, `ZIPLINES.marca.flechaFinal` (2.2) veces lo que las otras, que es lo
que la separa de ser una más de la fila.

### 84.5 La plataforma de velocidad se queda sin destello

Y es la única de las cuatro. Lo tuvo desde la vuelta 82 —un aro de pie que salía
disparado hacia donde lanza— y lo que lo quita es haberlo jugado: **el
lanzamiento ya se siente entero**. Es el único de los gestos que le pasa al
jugador *en el cuerpo* —los otros tres son un empujón corto, un empujón
sostenido o un salto de sitio— así que el aro no contaba nada que la pantalla no
estuviera contando ya a 60 u/s, y encima corría hacia delante tapando justo lo
que hay que mirar al salir despedido.

**La norma de la vuelta 82 sigue en pie y no se contradice**: un dispositivo
nace con su voz y su destello. Lo que esta vuelta añade es que jugarlo puede
quitarle uno de los dos — y cuál se queda no es casual: **el sonido, porque el
oído no hay que apuntarlo a ninguna parte** (vuelta 73). Quien pasa cerca sigue
enterándose de que alguien acaba de salir lanzado; quien lo usa ya lo sabía.

---

## §85 — Lo primero que tarda en llegar: proyectiles, y el arco

Hasta esta vuelta **todo el juego era impacto instantáneo**. Una bala se
resuelve con un rayo en el mismo paso en que sale, y de ahí cuelgan cosas que
no son detalles: el netcode del duelo se construyó alrededor de «rebobino al
instante que el tirador tenía en pantalla y contesto» (vuelta 46), y no había
nada en el mundo que durase entre dos pasos. Un arco rompe las dos, y por eso
esto se trató como una pieza de ingeniería y no como una ficha más.

### 85.1 La trayectoria está en forma cerrada, como el salto

`p(t) = p0 + v0·t + ½·a·t²` desde el lanzamiento, y un paso **no suma `v·dt`**:
evalúa la fórmula en `t` y en `t − dt` y se queda con el segmento entre las dos.
Es la decisión de la parábola del salto (vuelta 27) aplicada a otra cosa y por
la misma razón — integrar por Euler acumula error y ese error va con el tamaño
del paso— y aquí compra además dos cosas que allí no hacían falta:

- **Se puede dibujar la curva antes de disparar sin simularla.** El láser
  evalúa la misma función en veinticuatro instantes, así que lo que se ve y lo
  que pasa no pueden discrepar por construcción.
- **Y un proyectil que llega tarde se adelanta sumándole tiempo a su reloj.**
  El del rival viaja por la red; ponerlo al día es `t += viaje`, no simular los
  pasos perdidos.

**El paso es un segmento, no un punto.** Un cohete a 60 u/s avanza una unidad
por paso: comprobar sólo dónde acaba lo dejaría atravesando una pared de 0.6.
Medido de 20 a 300 u/s contra un muro de 0.6: **0 se cuelan**.

Medido (`vuelo85`): la misma flecha con pasos de 60, 144 y 240 Hz impacta con
**0.0038%** de dispersión en la altura —lo que queda es que el punto de corte se
interpola dentro del paso, y el mundo va a 60 fijos—; la curva dibujada cae a
**0.000125 u** de donde acaba de verdad; y un paso con **ocho volando cuesta
0.0016 ms** contra 0.2 de presupuesto.

### 85.2 `cortarSegmento`: la primera pregunta que no se contesta con un raycast

El motor ya tenía una función que dice contra qué acaba una recta:
`_superficieBajoElRayo`, de la vuelta 64, que resuelve las piezas con
`intersectObjects` contra las mallas fundidas. Eso es correcto y es lo que tiene
que hacer —da el punto y la normal exactos de un triángulo— y **se paga una vez
por disparo**. Un proyectil pregunta lo mismo **sesenta veces por segundo y por
proyectil**, contra mallas de hasta dieciocho mil triángulos.

Así que esto es el reparto de la vuelta 46 llevado a la geometría del mapa:
**primero lo que es aritmética**. Las cajas por sus tres parejas de planos (el
*slab test*), los prismas por los mismos semiplanos que ya usa `resolveAxis`,
las rampas despejando dónde el segmento cruza su cuña, y la sala por sus seis
planos —que es lo que ya hacía el rayo de la 64, porque sus paredes están
dibujadas con líneas y no hay contra qué lanzar nada—.

Lo que lo hace seguro no es que sea el mismo código: es que **está medido contra
él**. `corte85` barre 5.544 segmentos por el Plano A desde siete puestos libres
y compara dónde acaba cada uno:

| | discrepancia máxima |
|---|---|
| Plano A (cajas y rampas) | **0.0013 u** (la bisección de la cuña) |
| pilar de 12 caras y muro a 45° | **0.000000 u** |

Y cuesta **0.62 µs** por paso contra los 12.8 µs del raycast: **veinte veces
menos**.

### 85.3 Y el rayo estaba mal con los prismas desde la vuelta 83

Lo que salió de comparar los dos caminos no fue un fallo del camino nuevo. Con
el pilar de doce caras, la aritmética decía 18.5 y el rayo 21.5 — exactamente el
diámetro del pilar de diferencia. **La aritmética tenía razón.**

`geometriaDePrisma` recorría los vértices en el sentido contrario al que three
llama «cara frontal», en sus tres bloques: tapa, fondo y costados. Y sin luces
en la escena eso **no se ve**: una malla con las normales del revés se dibuja
exactamente igual. Lo que sí hacía era un bug de juego, y de los que importan:
con `side: FrontSide` un rayo que llega de fuera **atraviesa la cara de entrada**
y corta en la de salida. Consecuencias, todas reales desde la 83:

- un disparo contra una columna daba **tres unidades más allá**, y la marca de
  bala salía en su cara de detrás;
- y como `_shoot` decide si la cobertura se come el tiro comparando esa
  distancia con la del muñeco, **un muñeco pegado al otro lado de la columna
  quedaba más cerca que la columna**: se mataba a través de ella.

Arreglado invirtiendo el winding de los tres bloques. Después, `corte85` da
**0.000000 u** con prismas.

La lección, que vale para cualquier cosa parecida: **un segundo camino que
contesta la misma pregunta no es duplicación si se compara con el primero**. Es
lo que convierte dos implementaciones en una verificada — y aquí encontró un
fallo que llevaba dos vueltas sin dar la cara porque el juego no tiene luces.

### 85.4 El arco: apuntar es la dirección y cargar es la velocidad

Las dos decisiones que quedaban abiertas, tomadas y con su razón.

**Cómo se relacionan apuntar y cargar.** Apuntar pone la dirección y cargar pone
la velocidad de salida; las dos hacen la misma parábola y ninguna es un
modificador de la otra. Mirando más arriba se llega más lejos —hasta los 45°,
que es lo que dice la física y no una regla— y cargando más la curva se estira y
se aplana. Se eligió así porque es lo único que deja que **el láser no mienta**:
si la carga cambiara el daño y no la curva, el dibujo sería idéntico para un
tiro flojo y uno fuerte, y entonces lo que enseña no sería lo que va a pasar. El
daño sube con la carga **porque sube la velocidad**.

**Y sí hay techo** (`cargaMs`, 750 ms). Sin él no habría forma de saber cuándo
se ha terminado de tensar, y aguantar un segundo de más sería una ventaja sin
coste. Con techo, llenarse **es** una señal: la luz que sube por el láser llega
a la punta y ahí se queda.

Los números salen de una cuenta, no del gusto. Con la gravedad del arma (10) y
disparando horizontal desde la altura de ojos: sin cargar la flecha recorre
**15.2 u** antes de tocar el suelo, y cargada del todo **30.3 u**, que es cruzar
el Plano A de punta a punta. El tiro rápido es de cerca y el cargado es de mapa
entero **sin que haya que escribir esa regla en ninguna parte**. El daño va de
45 —lo que se pidió— a 110, que es lo mismo que la Scout: mata de un tiro a
quien no lleve chaleco. A la cabeza mata siempre y sale solo, porque **lo que ya
vale una vida entera no se escala** (vuelta 70).

**Y la gravedad de un proyectil la declara el arma, no el mapa.** Es la
excepción deliberada a la física de la vuelta 72: un mapa decide cuánto pesas
tú, que es una decisión sobre tu cuerpo. Si decidiera además cómo cae tu flecha,
**aprender el arco en un mapa no serviría en otro**, y la curva de un arco es
exactamente lo que hay que aprender.

`mode: 'carga'` es el cuarto modo, y no es `semi` con un adorno: en `semi` la
pulsación **es** el disparo, y aquí es el principio de otra cosa que dura tres
cuartos de segundo y se puede abortar. Dos reglas que salieron construyéndolo:

- **No se tensa antes de que el arma esté lista**, y eso es lo que hace que
  soltar dispare **siempre**. La alternativa —dejar tensar durante el
  enfriamiento y comerse la flecha al soltar— es un arma que a veces no hace
  nada sin decir por qué.
- **Una carga se aborta en todos los caminos menos en uno.** Por
  `_releaseTrigger` pasan todas las formas de soltar el gatillo que no son
  soltar el botón —perder el foco, pausar, morir, cambiar de arma— y en las
  cuatro la flecha no puede salir: soltar el ratón para abrir el menú no
  dispara, y guardarse un arco tensado y sacarlo después sería una flecha que
  sale sola.

### 85.5 La curva se ve porque arranca en la boca, y no miente porque converge

Éste costó dos intentos y los dos los decidió mirar una captura.

**Primero**: la curva salía del ojo. Geométricamente impecable y **ilegible** —
está entera en el plano que contiene la dirección de la vista, así que en
pantalla no es una curva, es un segmento vertical de treinta píxeles bajo la
cruz de la mira.

**Segundo**: sacar el **proyectil** de donde estaría el arma, que es la solución
del fogonazo de la vuelta 40. Y ahí `red85` lo tumbó con el rival delante: con el
proyectil desplazado 22 cm a la derecha, **apuntar al centro de un cuerpo a doce
unidades falla** y la flecha pasa de largo, porque la cabeza mide 0.137 de radio
(vuelta 65) — la mitad del desplazamiento. Un arma que no acierta donde apunta
la mira es un fallo mayor que un dibujo torcido.

**Lo que quedó**: el proyectil sale del ojo, como el rayo de cualquier disparo, y
la curva **arranca en la boca del arma y converge a la de verdad** en siete
puntos. El arranque se ve —sale de abajo a la derecha, que es de donde saldría—
y de ahí en adelante, **incluido el punto de caída, que es lo que de verdad se
apunta**, lo que se dibuja es la trayectoria exacta. Es la regla de la 40 —mover
el dibujo, no la bala— con la mitad que allí no hizo falta: volver.

### 85.6 En red viaja el lanzamiento, no la trayectoria

El patrón de la física de la vuelta 72 aplicado a algo que se mueve solo: lo
único que viaja es **de dónde, hacia dónde y con cuánta carga**, y de ahí los dos
extremos derivan la misma parábola porque dan los mismos pasos de 60 Hz contra
el mismo mapa. Un campo con la posición del proyectil en la foto serían sesenta
correcciones por segundo de algo que no necesita ninguna — y encima **un
proyectil sobrevive a quien lo lanzó**: la foto es de los jugadores, y un cohete
en el aire ya no es de nadie.

De ahí, cuatro piezas:

- **`lanzamientoDeArma` la llaman los dos extremos.** Es la pieza que hace que
  no tenga que viajar la trayectoria, y escrita dos veces sería una flecha que
  el tirador ve dar y el servidor ve fallar — medio metro de diferencia, que es
  el ancho de un cuerpo. Misma idea que `net/disparo.js` con el rayo.
- **El aviso va al otro, no a los dos.** Quien lo tiró ya lo tiene volando desde
  el instante del clic porque lo predijo, igual que su propio movimiento;
  mandárselo sería pintarle una segunda flecha un viaje más tarde.
- **Y con su número de paso**, que es lo que permite adelantarlo. Arrancar el
  vuelo desde cero pintaría un cohete saliendo de donde el rival estaba hace
  25 ms.
- **Y se cae la compensación de retraso, a propósito.** Rebobinar al instante que
  el tirador tenía en pantalla (vuelta 46) es lo correcto para una bala, que
  llega en el mismo paso en que sale: lo que se corrige es el viaje del
  **mensaje**. Una flecha tarda medio segundo en llegar, y ese medio segundo es
  del **mundo** — esquivarla es exactamente lo que el arma ofrece a quien la ve
  venir. Rebobinar aquí sería matar a alguien por donde estaba cuando el otro
  soltó la cuerda.

Lo que **sí** se conserva es todo lo de alrededor: la cadencia se valida igual,
el veredicto sale igual por su `seq` y la fase manda igual. Una mecánica nueva
no es un protocolo nuevo, que es la lección del cuchillo de la vuelta 71.

Medido (`red85`, conduciendo `Partida` sin navegador): el arco lanza en vez de
resolver un rayo; al rival se le avisa y al tirador no; la flecha tarda **13
pasos (217 ms)** en cruzar doce unidades y **hace daño al llegar**; con carga 0
quita **45** y con carga 1 **100**; y un cliente que manda `c: 99` se queda en
**52.000 u/s**, que es el máximo del arma — acotado como el paso a rebobinar de
la vuelta 46.

### 85.7 Y una flecha se ve venir

Es la mitad de que un arma con tiempo de vuelo sea justa, y sin luces en la
escena lo único que lo puede contar es la silueta (vuelta 38). Un huso alargado
**orientado a la velocidad**, en blanco roto y no en el gris del mapa, y
**más largo cuanto más cargada salió** (`PROJECTILES.estela.porFuerza`): a veinte
unidades eso es lo único que distingue la que quita media vida de la que mata.

El destello de carga llena costó otra captura: medio metro de radio **a treinta
centímetros del ojo ocupa la pantalla entera**. Sale a 2.4 u por delante, que es
donde medio metro mide medio metro. Es la lección de la vuelta 40 por la otra
punta — allí el problema era que el destello estaba dentro de algo, aquí que
estaba dentro del ojo.

---

## §86 — El U2: un cohete que sigue volando cuando tú ya no estás

El nombre en clave con el que llegó el encargo era **«yo muero, pero tú
también»**, y eso no es una frase: es la mecánica. Un cohete tarda en llegar, así
que quien lo lanza puede caer por otro disparo mientras el suyo sigue volando — y
matar igual. **Eso ya funcionaba** antes de escribir una línea del arma, porque la
vuelta 85 puso el pool de proyectiles en el mundo y no en el jugador: una baja no
apaga lo que ya salió.

### 86.1 Explota en área, y el área es una sola fórmula

`caidaDeArea` (vuelta 85) es lineal con un núcleo donde vale entero, y la
comparten el cohete y las tres granadas que vienen. Lineal y no cuadrática a
propósito: con el cuadrado, la mitad del radio ya vale un cuarto y el radio
declarado diría una cosa mientras la explosión hace otra.

Los tres números del U2 salen de una cuenta: **120 en el núcleo** (1.2 u) mata a
vida llena, a mitad de radio quedan **79** —cuatro quintos de una vida y ni una
más— y en el borde (5 u) **cero**.

**Y dar de pleno no es un caso aparte que se sume.** Un cuerpo tocado por el
cohete está a distancia cero del centro de la explosión, así que se lleva el
núcleo entero. Sumarle además el daño directo sería contar dos veces lo mismo, y
haría que el número que mata dependiera de si la onda pilló al cuerpo por delante
o por detrás.

**Un chaleco no para una onda expansiva**, y por eso `shieldAbsorb` es **cero** y
no un número pequeño. Con 0.25 el chaleco se comía 30 de los 120 del núcleo y el
impacto directo **dejaba vivo con 10** — medido en `u286`, y eso contradice lo
único que el arma promete. Un chaleco es una placa delante del pecho: para lo que
llega por delante en línea recta, y una explosión no llega por delante, llega de
todas partes a la vez. Lo que se paga está medido y es justo: que ignore el
chaleco no la hace matar más lejos, la hace matar **donde ya mataba**.

**Y el dueño no está exento**, que es la otra mitad del nombre en clave. Lo que se
le rebaja (`propio: 0.7`) no es piedad: un arma que se suicida al primer despiste
es un arma que nadie saca. Medido: a los pies, 84 de 100.

### 86.2 La reserva, y cómo se gana

Es **lo primero del juego con munición contada**. Hasta aquí todas las armas
recargaban infinito porque `magazine` era la única cuenta que existía; aquí hay
un cohete en el tubo y una reserva, y de ahí sale la decisión que el arma pide:
lanzar ahora o guardárselo.

Lo que se pidió: dos al comprar, cuatro como tope, y el tercero y el cuarto por
bajas — «al menos una baja distinta por cada uno de los dos primeros disparos».
La regla que lo cumple es **una frase**: **un cohete que mata repone uno**, con
tope. Hacen falta dos cohetes con baja para llegar a cuatro, porque cada uno vale
uno — matar a dos de un solo cohete sigue valiendo uno. No hizo falta una segunda
condición ni llevar la cuenta de a quién se mató con qué.

**Y se reinicia al empezar ronda y al morir con él equipado**, que es lo que se
pidió. Lo segundo sale gratis: morir cuesta el equipo desde la vuelta 64, y el
arma y sus cohetes son lo mismo. La reserva viaja en el **inventario** y no en la
foto, por lo mismo que el dinero: cambia cada pocos disparos, no sesenta veces por
segundo, y es **de quien la recibe** — cuántos cohetes le quedan al rival no se
enseña.

**Y sin reserva no hay recarga, y se dice.** Un arma que no responde a la R sin
explicar por qué es un arma que parece rota.

Medido (`u286`): un cohete de pleno mata con chaleco y casco; reventar más cerca
hace más daño que lejos; el dueño encaja 84 y sobrevive; con la reserva a cero,
un cohete con baja la sube a **1**; en el máximo se queda en **4**; y uno que no
mata a nadie no la mueve.

### 86.3 El primer sonido del juego que dura

`playRocket('silbido')` es la única voz que se **devuelve** para poder pararla.
Todo lo demás en `sfx.js` se dispara y se olvida —un disparo, un golpe, un
destello— porque todo lo demás ocurre en un instante. Un cohete vuela medio
segundo, y lo que eso pide es un asa: se enciende al salir, su emisor se mueve con
él en cada frame y **se apaga donde revienta**.

Dos cosas que son el mecanismo:

- **La clave del mapa es el número de serie, no la ranura del pool.** Una ranura
  se reutiliza en cuanto queda libre: con la ranura, un cohete nuevo heredaría el
  silbido del anterior y apagar uno callaría al otro.
- **Y el emisor lo sigue**, que es la mitad de que sirva de algo. Lo que dice de
  dónde viene es el panner, y un panner clavado en el punto de salida dice que el
  cohete sigue en el tubo. Va por frame y no por paso, como el dibujo, porque es
  lo que el oído compara con lo que ve.

Y la explosión **pierde agudos con la distancia, no volumen** — eso lo hace el
aire, no el altavoz; el volumen ya lo pone el panner.

### 86.4 Un `NaN` en un proyectil no choca con nada

El fallo de esta vuelta, y la lección vale para cualquier cosa que vuele.

`_onMouseDown` desviaba al camino de carga **con cualquier arma que tuviera
bloque `tiro`**, y el U2 lanza pero no carga. Así que `cargaActual` dividía por un
`cargaMs` que no existe, salía `NaN`, y el cohete nacía con velocidad `NaN`.

Lo que pasa entonces es lo que no se ve venir: **ninguna comparación con `NaN` es
cierta**, así que el proyectil no se para en ninguna pared, no caduca por
distancia y **vuela para siempre**. Con su silbido detrás. Lo que llegaba a la
pantalla eran sesenta excepciones de audio por segundo en la consola —`panner.positionX`
rechazando un no-finito— y el juego seguía corriendo, que es exactamente el
«degrada en silencio» de la vuelta 60.

Tres arreglos, y los tres se quedan:

- **El camino de carga lo decide el modo** (`mode === 'carga'`), no tener bloque
  `tiro`. El modo es el dato que dice **cómo se dispara**; el bloque dice **qué
  sale**.
- **Un proyectil con un número roto no sale.** Es `_guardState` del movimiento
  aplicado al pool: un vuelo que no sale es un fallo que se ve, uno que vuela para
  siempre es un fallo que no.
- **Y un número roto no llega a una matriz de audio.** `Emitter.setPosition` lo
  rechaza y el emisor se queda donde estaba, que es lo único sensato.

Cómo se encontró, que es lo repetible: **no depurando el síntoma**. Los 441
errores decían «linearRampToValueAtTime» y apuntaban a three. Lo que lo resolvió
fue `git stash` —verde con el código viejo, rojo con el nuevo, y sólo con el U2 en
la mano: el arco daba cero— y luego **una guarda con un aviso en el sitio por el
que el valor pasa**, que nombró al culpable en la primera ejecución.

---

## §87 — Core, Blind y KO: tres granadas, y lo primero del juego que se queda en el suelo

El encargo llegó en dos mensajes y con dos bocetos a mano: las tres granadas con
la misma mecánica de carga que el arco, **cocinado** de cuatro segundos con suelo
de uno, efecto en área con la caída del U2, **un objeto físico que rebota, rueda
y se queda tirado hasta detonar**, **un color por tipo** para que el rival sepa de
qué se aparta, y **un segundo lanzamiento con el clic derecho**, corto y a ras de
suelo, «para que el jugador no necesite perder el campo de visión del horizonte
por mirar hacia abajo para dejar caer una granada».

### La ranura: la cuarta, y llevaba reservada desde la vuelta 27

`slot: 'throwable'`, tecla **G**. No compiten por la ranura principal, y eso no es
una comodidad de implementación: **una granada no es un arma, es algo que además
se llevas**. La tecla lleva reservada con su bind y sin lógica desde la vuelta 27
justo para esto — el mapa de controles tiene que ser el definitivo desde el
principio, o cuando la mecánica llegue alguien ya habrá puesto ahí su atajo
favorito. Es exactamente lo que hizo el cuchillo con la 3 en la vuelta 71.

De ahí sale `THROWABLE_WEAPONS`, derivada de la ranura como `PRIMARY_WEAPONS`, y
el ajuste `SETTINGS.throwable` con su catálogo. No hay una segunda lista en
ninguna parte.

Y las tres entran en la tienda del duelo **ocupando el hueco que ya tenían**: la
`granada`, la `aturdidora` y la `cegadora` estaban ahí desde la vuelta 64
**precintadas**, con su precio y su combinación a la vista y sin poder comprarse.
Los códigos no se mueven, que es lo que el precinto prometía.

### El cocinado: dos relojes, y ésa es la decisión

La carga se llena en `cargaMs` (600 ms) y **la mecha sigue corriendo**. O sea que
pasado el medio segundo, aguantar **ya no da alcance, sólo quita aviso**. Ésa es
la decisión entera que el arma pide, y sale de tener dos relojes y no uno.

El suelo de un segundo (`GRENADES.mecha.minimoS`) es lo que se pidió y lo que
impide que cocinar se convierta en suicidarse. Consecuencia deliberada: **no se
puede reventar con una en la mano**. Y otra, que viene de la regla del arco: por
`_releaseTrigger` pasan pausar, morir, perder el foco y cambiar de arma, y en los
cuatro la granada **no sale** — así que pausar con una cocinada no te mata, te la
devuelve.

Lo que viaja por la red es **cuánto se ha sostenido** (`d.h`) y no la mecha ya
calculada: `mechaDeGranada` la deriva en los dos extremos con el suelo dentro, así
que un cliente que pidiera cero se lleva el mismo segundo que todos. Mentir ahí
sólo puede **alargarte** la tuya.

### El rebote: una parábola que se vuelve a anclar

Un choque ya no libera la ranura: re-ancla la forma cerrada en el punto del golpe
con la velocidad reflejada y el reloj a cero. Es la técnica del ventilador de la
vuelta 83 aplicada a un impacto, y compra lo mismo — **un bote no introduce ni una
integración**, así que se comporta igual a 60 que a 240 Hz.

El roce va **escalado por la componente normal**: con un roce fijo, un contacto de
refilón pierde lo mismo que un botazo y la granada se clava en dos décimas.

### Y rodar es lo que obligó a generalizar el modelo

Lo primero que se probó fue seguir botando con rozamiento en cada contacto, y **se
cayó midiéndolo**: en cuanto los botes se hacen más cortos que un paso, **el número
de contactos por segundo lo pone el refresco y no el mundo**. Medido, 0.27% de
dispersión entre 60 y 240 Hz en dónde acaba, creciendo con lo que ruede — que es
exactamente lo que el paso fijo de la vuelta 44 vino a cerrar.

Lo que quedó: rodando, lo que frena es una **aceleración constante contra la
marcha**, o sea `p(t) = p0 + v0·t + ½·a·t²` con la `a` en horizontal. La cabecera
de `proyectiles.js` decía esa fórmula desde la 85 y la `a` era sólo la gravedad;
ahora es un vector de verdad, y es la misma curva partida en trozos — lo que un
tramo quita de velocidad se lo encuentra el siguiente, y la suma de los trozos es
**exactamente** la curva entera.

**Y la gravedad sigue puesta mientras rueda**, que no es un detalle: es lo que hace
que una granada que llega al borde de una caja se caiga por él en vez de seguir
rodando por el aire.

Queda un residuo, anotado y no escondido: cada anclaje pasa por `cortarSegmento`,
que corta **el segmento del paso** y no la parábola, así que el punto de contacto
lleva el error de la cuerda. Con `apoyoU` a 0.0025 —lo que tarda en caerse
aproximadamente un paso de mundo— hay del orden de un contacto por paso en vez de
cinco, y la dispersión baja de **0.072% a 0.0275%**, que es la banda del modelo del
aire con paso fijo.

### Las tres cosas que hacen, y quién las decide

| | qué hace | quién la aplica |
|---|---|---|
| **Core** | daño de área, 110 en el núcleo | el servidor (vuelta 56) |
| **KO** | −55% de marcha 2.4 s | el servidor, y viaja en `movement.snapshot()` |
| **Blind** | tapa la pantalla 2.8 s | **cada cliente, contra su propio pool** |

La Blind **no aparece en `net/partida.js` en absoluto**, y eso es la decisión, no
un recorte: cegar es algo que le pasa a **una pantalla**, y las pantallas las
tienen los clientes — que montan el mismo mapa, reciben el mismo lanzamiento y
derivan la misma parábola. Un campo en la foto para decir «estás ciego» sería
mandar un dato que el que lo recibe ya tiene.

Y apartar la vista sirve, que es lo que se pidió con esas palabras: lo que llega se
multiplica por cuánto la estabas mirando, con suelo en `mirandoMinimo` (0.15). Va
por ángulo y en recta, no por un cono con borde: una cegadora que pasara de cegar
del todo a no cegar nada por medio grado sería una lotería, no una decisión. Y
**pide línea de visión**, con el mismo `hasLineOfSight` que decide dónde puede
nacer un muñeco (vuelta 42).

La KO es el único efecto de las tres que toca el movimiento, así que es el único
que tiene que viajar: tres campos en `snapshot()` (`aturdidoHasta`,
`aturdidoDuracion`, `aturdidoFreno`), **y los tres desaparecen del cable cuando
valen lo de fábrica** (regla de la vuelta 83). Medido: la foto de un jugador sin
aturdir pesa lo mismo que antes de esta vuelta.

En el cliente **no se predice**: el movimiento en red lo decide el servidor y el
campo llega en la foto. Predecirlo aquí sería una segunda idea de cuándo empieza,
y la diferencia entre las dos serían correcciones. Lo que se pierde es el viaje de
una foto sobre dos segundos y medio.

### El tiro corto: dos números, la misma función

`GRENADES.corto` son el cabeceo que se le baja al rumbo de la cámara (22°) y las
dos velocidades. Nada más. Lo que resuelve está en el encargo: se apunta a donde
se estaba mirando y **la granada sale con el ángulo ya bajado**, así que no hay que
mirar al suelo.

Y el láser pasó a salir de `lanzamientoDeArma` en vez de repetir su cuenta:
mientras hubo un solo modo de lanzamiento una copia de la fórmula no se notaba, y
con dos **una copia es un láser que enseña la parábola larga mientras el botón
derecho tira la corta**. Es la regla de siempre aplicada a lo único que no puede
permitirse discrepar: el dibujo de lo que va a pasar.

Medido (`gran87`): el tiro largo toca a **6.1 / 11.3 u** apuntando plano y a **39.2**
a 45°; el corto, a **2.4 / 3.3 u**, y rueda hasta **3.6 / 6.3**.

### El color, y por qué no hay ninguno nuevo

De todo lo demás las separa **la forma**: son octaedros que giran, y lo que vuela
hasta ahora eran husos orientados a la velocidad. Así que el color sólo tiene que
distinguirlas **entre sí**, y para eso los tres que ya hay en la paleta son los más
separados que se puede: **rojo** la que hace daño, **blanco** la de luz, **azul
eléctrico** la de aire.

Que cada uno signifique ya otra cosa se admite por lo de siempre: no coinciden. El
rojo de `threat` es un icono flotando sobre un muñeco y una cuña en el borde de la
pantalla; el `electric` es el escudo y el cable de una tirolina.

### Tres fallos que encontró construirlo, y ninguno era de esta vuelta

**Un `mete` negativo regalaba munición** (desde la vuelta 86). `_refillMagazine`
calculaba `magazine - this.ammo`, y `this.ammo` es el del arma **que acabas de
dejar**: sacando el U2 (cargador 1) con el Rift en la mano y treinta balas dentro,
`mete` salía **−29** y la línea de abajo se lo sumaba a la reserva. Treinta cohetes
de la nada, sin un error en ninguna pantalla. Lo cazó `gran87nav` contando
granadas: quedaba una de más después de tirar las dos.

**`reiniciarReserva` no la llamaba nadie** (desde la vuelta 86). Estaba escrito que
lo que se gana matando no se acumula entre vidas, y el método existía; lo que
faltaba era llamarlo. Con las granadas habría sido peor, porque su reserva no se
repone de ninguna otra manera.

**Y el modo de un arma estaba escrito tres veces** (el HUD, la armería y
opciones), y las tres listas conocían `auto` y `semi` y nada más: desde la vuelta
85 el arco salía como **«SEMI»** en el HUD y como un hueco en la armería. Ahora es
`WEAPON_MODES`, una sola lista.

### Y uno que sí era de esta vuelta, con la lección de siempre

Un `GRANADAS is not defined` en `vuelo.js` produjo **1228 errores en una tanda** y
el juego siguió corriendo, porque `_loop` reprograma el frame siguiente antes de
trabajar: es el «degrada en silencio» de la vuelta 60, otra vez. Lo que lo cazó fue
que el banco de navegador **cuenta los `pageerror` y falla con ellos**. Sin esa
línea, las tres granadas habrían llegado a probarse con el dibujo apagado.

### Lo medido

`gran87` (sin navegador, el modelo puro):

- Tiro largo plano: toca en **6.08 / 11.30 u** y para en **8.00 / 15.13**.
- Tiro largo a 45°: toca en **39.18 u**.
- Tiro corto: toca en **2.39 / 3.32 u** y para en **3.57 / 6.31**.
- **Dos botes** antes de ponerse a rodar, y se para a los 1.03 s.
- Dispersión en dónde revienta entre 60, 144 y 240 Hz: **0.0275%**.
- Cocinado: 0 s → 4 s · 1 → 3 · 2 → 2 · 3 → 1 · 3.5 → 1 · 10 → **1**.
- Una flecha **no rebota** y revienta en la misma coordenada que antes de la
  vuelta.

`gran87red` (conduciendo `Partida`, sin una línea de red):

- Sin cocinar revienta a los **4.00 s**; cocinada 3 s, a **1.00 s**; pidiendo mecha
  cero, **1.00 s**.
- El Core a 2.2 u: el rival a **0** y el que la tiró en **88.3**.
- A 30 u no llega nada.
- La KO: **6.500 → 2.925 u/s**, los tres campos en `snapshot()`, y vuelve a
  6.500000 exacto.
- Sin aturdimiento, **ni un campo `aturdido*` en la foto**.
- La Blind no quita vida ni frena a nadie.

`gran87nav` (conducido con el ratón, contra el producto): la G la saca, el clic
izquierdo y el derecho lanzan, la reserva pone la segunda y la tercera no existe
—y el HUD dice por qué—, la pantalla se pone blanca al **0.65** de opacidad y se
pasa sola. **Cero errores de página.**

`duelo87`: las tres salen en la tienda del 1v1, ninguna con precinto, cero errores.

### Lo que no se hizo

- **Una granada no choca contra un cuerpo.** No hace daño por tocarte, lo hace al
  estallar, así que un impacto directo sería una segunda forma de repartir daño
  que nadie ha decidido. Atraviesa a quien se cruce y sigue su camino.
- **Y un lanzamiento no cuenta como disparo**, que es la regla del cuchillazo de
  la vuelta 71: la precisión de la sesión es la de la puntería.

### §87.1 — La curva de carga es de quien apunta, y se verificó midiendo

La pregunta llegó antes de la primera sesión de pruebas y es de equilibrio, no
de código: **¿ve el rival el láser mientras cargas?** Si lo viera, esquivaría el
100% de los lanzamientos y las tres armas de tiro curvo dejarían de existir.

**No lo ve, y no puede verlo**, por cuatro cosas que ya estaban en pie:

1. `Trayectoria` se instancia en la escena del **motor local** y `dibujar` se
   llama desde un solo sitio, gobernado por `this.cargando`.
2. `_cargaDesde` sólo lo escribe `_empezarCarga`, llamada desde `_onMouseDown`.
   No hay camino desde la red.
3. `ACCIONES` —la máscara de entradas— son ocho bits de movimiento. **No hay bit
   de gatillo**: mantener el botón no viaja.
4. La foto (`foto.p[id]`) no tiene ningún campo de carga, y `movement.snapshot()`
   es de movimiento. Lo que viaja de un lanzamiento es el **lanzamiento**, al
   soltar.

Pero eso es una deducción, así que se midió **contra el producto y mirando las
dos pantallas a la vez**, que es lo que la vuelta 60 enseñó con la brújula: un
error de 180° sólo se ve comparando. `laser87` abre dos navegadores en la misma
sala, los pone cara a cara con `MSG.COLOCAR` y cuenta los píxeles del láser en
las dos.

**Y la premisa costó tres intentos, que es la lección de esta nota.** Las tres
primeras versiones salieron con «B no ve nada» en verde y las tres estaban
**vacías**, cada una por un motivo distinto:

- El código de sala se leía de la barra y salía `duelo`: los dos navegadores
  estaban **en partidas distintas**. Se lee de `#codigo`, que es donde la página
  lo escribe.
- Puestos a ±7 del origen, El Espejo hace **exactamente lo que se diseñó en la
  vuelta 66**: tapar el centro. B miraba una caja gris.
- Y buscando un par con `hasLineOfSight` a 1.4 de altura salió uno que dejaba a
  A **encima de una pieza de 3.6**, porque `COLOCAR` pone x y z y el suelo sube
  al jugador. El barrido exige además que los dos puntos tengan el suelo a cero.

Con la premisa de verdad —**4.711 px del cuerpo del rival en la pantalla del
otro**, comprobados antes de cada medida y otra vez al final— el resultado es:

| | el que apunta | el rival |
|---|---|---|
| Arco, cargando | 353 px | **0** |
| Granada, tiro largo | 393 px | **0** |
| Granada, tiro corto | 29 px | **0** |

Los 29 px del tiro corto no son un láser débil: son el recorte del banco, que
deja fuera la franja de abajo de la pantalla. Mirando la captura, la curva sale
de la boca del arma y acaba en su anillo de caída, a ras de suelo, entera.

Dos avisos que vienen con esto y no se adivinan:

- **El rojo del Core es un píxel cálido.** Una Core tirada en el suelo
  contaminaba la cuenta del láser (que va en `COLORS.dispositivo`). El banco
  mide con la **Blind**, que es blanca y además no hace daño — así los dos
  siguen vivos para que la premisa siga en pie.
- **Tensar con el cargador vacío no hace nada, a propósito** (vuelta 85). Medir
  ahí «cero píxeles de láser» es medir la recarga, no el láser: el banco espera
  a que el arma esté lista antes de cada medida.

Lo que el rival **sí** ve, y es por diseño: el proyectil ya lanzado —esquivarlo
es lo que el arma ofrece a quien lo ve venir (vuelta 85)— y el arma que empuñas
en su ficha flotante, desde tu primer disparo (vuelta 56). El día que se quiera
darle además una señal de «está tensando», eso es una decisión de diseño con su
precio, no un detalle: hoy la promesa es la contraria.

---

## §88 — La primera sesión de verdad con el arsenal entero

Vuelta de feedback, no de mecánica: Yago jugó la noche anterior con las once
armas montadas y salieron cuatro fallos, tres números mal calibrados y tres
huecos de interfaz. Lo que sigue es por qué cada uno estaba ahí, porque tres de
los cuatro fallos **no eran de la vuelta anterior** y el patrón se repite: *una
mecánica nueva es lo que enseña los agujeros de la anterior* (§87), y **una
sesión de juego de verdad es lo que enseña los agujeros de todas**.

### §88.1 — El air-strafe no estaba roto: era inalcanzable

El síntoma, literal: «el jugador no gira en el aire moviendo cámara+WASD, se
mueve *sobre raíles* en línea recta, con solo un roce sutil de giro ocasional».
Venía marcado como prioritario y con una hipótesis razonable —que algo reciente
lo hubiera roto sin que ningún banco lo cazara—, porque contradecía medidas ya
dadas por buenas en las vueltas 32, 44 y 82.

**Lo primero fue medirlo, y el modelo estaba intacto** (`aire88`, sin
navegador). Estrafe puro a 40°/s: el rumbo gira **−27.5° en un vuelo** y la
marcha sube de 6.500 a **6.760 u/s**, clavado en los −29° y los 8.32 tras seis
saltos que la vuelta 32 dejó escritos. La curva de ritmo de giro también sale
igual: 20°/s da 6.670, 80°/s baja a 6.229 y 140°/s a 5.007, o sea que girar
demasiado rápido sigue frenando.

Lo que no funciona es **con W pulsada**:

| teclas en el aire | giro del rumbo | marcha final |
|---|---|---|
| D puro, 40°/s | −27.5° | 6.760 |
| W+D, 40°/s | **0.0°** | **6.500** |
| W+D, 80°/s | −5.1° | 6.560 |

Esa fila de en medio **es** el informe: cero grados de giro y la marcha plana.
Y la de abajo es el «roce sutil de giro ocasional», al pie de la letra.

**Por qué pasa, y por qué estaba escrito que pasara.** La nota de
`airWishFactor` dice desde la vuelta 32 que la condición «W suelta» del modelo
escalar «aquí no hace falta porque sale sola de la geometría»: con la vista
puesta donde vas, la proyección de tu velocidad sobre la dirección pedida ya
vale 6.5 —muy por encima de los 0.78 de `wishSpeed`— y no cabe ganancia. Con
W+D la dirección pedida cae a 45° de la marcha, la proyección vale 4.6 y
tampoco cabe nada. Todo correcto, y todo exactamente lo que hace el género.

El error estaba en la conclusión, no en la medida. Lo que «sale solo de la
geometría» es **que no pase nada**; lo que no sale solo es que el jugador se
entere de por qué. Y lo que hace cualquiera que venga de otro shooter es
mantener W. **Una mecánica que sólo existe si sueltas una tecla que nadie
suelta es una mecánica que no existe**, y eso no se arregla documentándola.

**El arreglo es una línea, y va en `_readWish`.** En el aire, con una tecla de
estrafe pulsada, W deja de contar para la dirección pedida. Está donde estaba el
problema —no en `_updateAirAccel`, que es correcta y está medida— y por eso no
toca el modelo: la aceleración, el techo, la forma cerrada de la parábola y la
dispersión entre refrescos se quedan como estaban. Con el interruptor puesto,
W+D **es** D.

Tres cosas que son el mecanismo y no tuning:

- **Es seguro en red sin añadir nada.** `_readWish` la corren los dos extremos
  con las mismas máscaras y el mismo yaw, así que derivan la misma dirección;
  no viaja ningún número, exactamente como la física de la vuelta 72. Medido en
  una sala de verdad, ocho saltos con W+D girando el ratón: **0 correcciones en
  1113 fotos** y error de reconciliación **0.00e+0 u** (`aire88red`).
- **Sólo con estrafe puro de un lado.** Con A y D a la vez `x` vale cero y no
  hay a dónde girar, así que ahí W sigue mandando: si no, el jugador se quedaría
  sin dirección en el aire.
- **Y `_seedAirVelocity` corre antes de que `airborne` se ponga a true**, así
  que el despegue sigue sembrando con la dirección entera —W+D despega en
  diagonal, como siempre— y lo que cambia es lo que se pide **ya en el aire**.
  Si algún día se invierte ese orden en `_takeOff`, esto se rompe en silencio.

**Y dos llamantes de `_readWish` hay que excluir a mano**, que es lo que costó
más que la línea. El **vuelo del editor** (`_volar`) fuerza `airborne` y resuelve
el paso como el de a pie, así que sin la guarda volar con W+D por el mapa saldría
de lado — es la trampa de la vuelta 78 otra vez: lo que fuerza `airborne` hereda
las reglas del aire sin haberlas pedido. Y el **modelo escalar** tiene su «W
suelta» escrita como un `if` explícito en `_updateAirStrafe`: quitarle la W por
debajo cambiaría lo que ese interruptor sirve para comparar.

**La puerta está cerrada por construcción**, medido como manda la vuelta 83: un
paseo con saltos **sin** W+estrafe en el aire acaba en
`-0.944798276, -7.031114058, 0.511333333` con el interruptor apagado y
encendido, idéntico hasta el último decimal; uno **con** W+estrafe cambia, que es
lo que tiene que hacer.

`MOVEMENT.airStrafeIgnoraFrente` se queda como ventana hacia atrás, igual que
`airVector` y `slide.enabled`: no sale en el panel, porque no es un ajuste del
jugador.

### §88.2 — El duelo no tenía dispersión, ninguna

El punto siguiente del feedback —«disparar saltando se comporta igual que en el
suelo, línea recta perfecta»— parecía calibración y eran dos fallos, uno encima
del otro.

**El primero: en red no se aplicaba.** `_shoot` mandaba
`this.camera.rotation.y/x` **crudos** a `net.disparar`, y `applySpread` sólo
corría por la rama del entrenamiento. O sea que el ajuste existía desde siempre,
el panel lo daba por bueno y **el modo donde de verdad importa no lo aplicaba**:
el fallo de la vuelta 67 por la puerta de la red. No lo cazó nadie porque los
bancos de netcode miden reconciliación y compensación de retraso, no cuánto se
abre una bala.

**El segundo: 1.2° en el aire no se puede notar.** `currentSpreadDeg` devolvía
`movementSpreadDeg` para correr **y** para volar, y 1.2° a quince unidades son
**31 cm** — menos de lo que mide de ancho el cuerpo del rival (0.586 u en la
cintura). Un desvío más pequeño que el blanco no es un desvío, es ruido.

El arreglo son dos cosas. `ACCURACY.airSpreadDeg` (3°) es un número aparte
porque **correr y saltar no son el mismo gesto**: correr es una marcha que se
puede soltar, saltar es una decisión que quita el suelo, y lo que un shooter
cobra por ella es la puntería. A quince unidades son 79 cm, dos cuerpos y medio.
Y la condición del aire va **primero**, porque en el aire la marcha también
supera el umbral y con el orden al revés el número nuevo no se aplicaría nunca.

`_miraConDesvio` desvía **el vector y no los dos ángulos por separado**, y luego
vuelve a rumbo y cabeceo: un cono en yaw/pitch se estrecha con el cabeceo, así
que apuntando a los pies el desvío sería otro. `direccionDeMira` —la conversión
de ida, la que usan los dos extremos en `net/disparo.js`— hace de inversa, así
que no hay una segunda idea de hacia dónde mira alguien. Medido (`desvio88`,
200.000 disparos por fila): el cono del duelo y el del entrenamiento dan
**1.4973 contra 1.4998 de media y 3.0000 de máximo los dos**, a 0°, −20°, −45° y
−70° de cabeceo.

Lo sortea **el cliente**, y eso es lo correcto aquí: lo que viaja es el rumbo con
el que salió la bala, uno solo, y los dos extremos resuelven ese mismo rayo.
Sortearlo en el servidor sería un tirador que ve su bala ir a un sitio y recibe
un veredicto de otro. Y **no toca al cuchillo ni a los proyectiles**: una flecha
no se desvía por saltar, que ya estaba escrito en `_lanzarProyectil`.

### §88.3 — Tres cosas que la ranura prometía y no cumplía

**Las granadas.** El síntoma: «comprado 1 KO + 2 Blind, la tecla de granadas no
cicla entre ellas». El servidor guardaba **una sola clave**
(`inventario.granada = item.clave`) y la vuelta 87 lo justificaba así: «la ranura
es una, y comprar otra sustituye a la que hubiera sin devolver lo pagado». Eso es
un razonamiento sobre la implementación, no sobre el juego: **la ranura es la
tecla, y una tecla puede ciclar**. Lo que producía era una tienda que cobra dos
artículos y entrega uno, sin decirlo.

Ahora es una lista con tope (`ECONOMY.granadasMax`, 2 clases = 4 granadas), y
tres reglas la hacen honesta: comprar la que ya llevas **la rellena**, pasado el
tope **se rechaza y el panel lo dice antes de cobrar** —`porQueNo` mira el mismo
inventario, así que no hay una segunda idea de si cabe— y cada clase llega llena
por el mismo camino que el U2. La tecla saca la que estuviera elegida y, con una
granada ya en la mano, pasa a la siguiente: ciclar siempre haría que sacar una
concreta fuera cuestión de contar pulsaciones.

Y salió gratis una cuarta voz de `playEquip` que llevaba sin usarse desde la
vuelta 73: **`utilidad`**. No era un olvido — con una sola clase en la ranura,
«llevo una más» no era un estado que existiera.

Medido: en servidor (`granadas88`, sin navegador) las dos clases entran, la
tercera se rechaza y no se cobra, y comprar una repetida rellena su reserva; en
una sala de verdad con dos navegadores (`duelo88`) el dinero baja de **$800 a
$300** con KO y Blind, la tercera deja el saldo **clavado en $300** con «sólo 2
clases» escrito en su artículo, y la mano va **PULSE → KO → BLIND → KO**.

**El cohete que mata y no repone.** «Un cohete impactó en el pecho del rival y no
se repuso el misil extra.» Investigado: **sí mató y sí se repuso**. Lo que pasa
es que en un 1v1 **esa baja cierra la ronda**, y `_empezarRonda` ponía la reserva
en `r.inicial` a secas (vuelta 86, «lo que se gana matando es de esa ronda, no
del partido»). O sea que el premio se cobraba y se borraba un instante después,
sin un aviso en ninguna pantalla: **`porBaja` era inalcanzable en el duelo desde
que existe**, porque la única baja que repone un cohete es la que se hace con un
cohete.

Pasa a `max(inicial, lo que tengas)` con tope en `maxima`. La promesa del arma se
cumple donde se hizo, y lo que la 86 quería proteger sigue protegido por otra
puerta: **morir cuesta el arma y con ella su reserva** (`_perderEquipo`), así que
el que pierde no acumula nada.

**Y ESC no cerraba las opciones.** La armería tiene ese manejador desde que
existe y el panel de opciones no, así que la única salida era encontrar «Volver»
al final de una lista de veinte ajustes — y en el duelo, donde a opciones se
llega desde el menú de ESC (vuelta 73), la tecla con la que acabas de entrar no
servía para salir. Va en **burbuja** y no en captura a propósito: reasignando una
tecla, `Controls` escucha en captura y para el evento ahí, que es lo que deja que
Escape cancele la captura sin cerrar el panel de debajo. El orden de las dos
fases **es** la regla.

### §88.4 — Calibración: el arco y el Core

**El arco valía lo mismo que una Scout y costaba mucho más.** A tope hacía 110 al
torso, que es exactamente lo que hace una bala de Scout, y pedía 750 ms de
tensar, un arco de vuelo y adelantar a quien se mueve. **Dos precios distintos
por el mismo resultado no es una elección, es un arma peor.** Sube a 130 —mata de
una al torso sin chaleco, como ya hacía, y **con chaleco deja en 22**, o sea que
el remate es cualquier cosa— y los 45 sin cargar se quedan donde estaban, porque
se confirmaron jugando y son la referencia con la que se aprende el arma.

La cadencia pasa de 55 a **80 RPM**, o sea de 1090 a **750 ms**. El número no es
redondo por casualidad: es **lo mismo que cuesta cargar del todo**, así que
encajar una flecha nunca es más rápido que tensarla y el arma conserva su ritmo,
que era la condición («no disparos sin enfriamiento, pero un poquito más
rápidos»).

**El Core mataba sólo cayendo encima.** 110 con núcleo de 1 u: a 2 u dejaba en
12, a 3 u en 34. Jugándolo eso se lee como una granada que no hace nada, porque
la diferencia entre un lanzamiento excelente y uno bueno era la diferencia entre
matar y no despeinar. Sube a **140 con núcleo de 1.4**, y lo que se mueve **no es
el radio** —sigue en 6, así que a quién alcanza no ha cambiado— sino dónde está
el escalón: mata a vida llena hasta 2 u, deja en 9 a 3 u y en 39 a 4 u.

Y `propio` baja de 0.8 a **0.7** justo para que el número nuevo no se lleve por
delante la regla vieja: con 0.8 habrían sido 112 de pleno, o sea suicidio, y la
regla del U2 —«un arma que se suicida al primer despiste es un arma que nadie
saca»— se habría caído sin que nadie la tocara. Con 0.7 son 98: te deja en 2.

### §88.5 — Tres huecos de interfaz, y el que más costaba era el más barato

**El dinero sólo se veía abriendo la tienda**, o sea justo cuando ya es tarde
para pensarlo: la economía de una ronda se decide durante la anterior —si esta
bala vale la pena, si conviene guardar para el rifle— y eso pide tener el número
delante mientras se juega. Va arriba a la derecha, bajo los FPS y el engranaje,
en el verde de acción —el mismo con el que la tienda marca lo que se puede
comprar: mirar el saldo y mirar la tienda son la misma conversación—.

Vive como estado de React y no en `stats` porque **no es un valor por frame**:
cambia unas pocas veces por ronda y llega por `MSG.ECONOMIA`, no en la foto. Es
la excepción del arma desde la vuelta 39. Y `null` no es cero: es «aquí no hay
economía» —entrenando, o en un mapa que reparte (vuelta 72)— y entonces no se
monta nada, porque un `$0` fijo diría que estás arruinado en vez de que no hay
tienda. Quién lo decide es `cliente.conEconomia`, o sea **la bienvenida**, no que
llegue o no un mensaje: la regla de la 64 aplicada a un rótulo.

**«Sin límite» armaba la bomba.** Desde la vuelta 78 la duración es del jugador y
vale para los dos modos, y nadie miró qué pasaba al cruzarla con el explosivo: su
cuenta atrás **es** el reloj de esa sesión, así que poner «sin límite» y salir
con dianas clásicas cerraba a los 45 s una partida que acababa de prometer no
acabarse. Es el fallo que la 78 vino a cerrar, por la otra punta, y peor de leer,
porque lo que ignoraba el ajuste no era un cronómetro sino **un objetivo entero**
con su pitido. Se mira `endless`, que es el mismo campo del que cuelgan el HUD y
el resumen — una segunda condición sería una segunda idea de qué significa «sin
límite». Y se dice **en el propio ajuste**: enterarse al empezar la ronda es
enterarse tarde.

**Y un mapa se publica, que no es lo mismo que guardarlo.** Desde la vuelta 74
«guardar y publicar son la misma acción», y eso era correcto cuando el editor lo
usaba una persona en su propio PC. En cuanto un mapa a medio dibujar aparece en
el selector del juego deja de serlo: son dos decisiones y hay que poder tomarlas
por separado.

`publicado` se guarda **sólo cuando vale `false`**, que es la disciplina de la
vuelta 83 —lo que vale su valor de fábrica no se escribe— y aquí compra algo
concreto: los cuatro mapas de `config.js` y **todos los que ya están en disco** no
declaran nada, así que siguen saliendo exactamente como salían. Un campo cuyo
defecto fuera «no publicado» habría hecho desaparecer del selector los mapas de
quien ya tenía mapas, al abrirlos. Lo que cambia es de dónde nace uno nuevo: el
editor los crea sin publicar.

El filtro va en **un solo sitio**, las dos listas derivadas (`TRAINER_SCENARIOS`
y `DUEL_SCENARIOS`), que es de donde salen el selector de escenarios y el
desplegable del duelo. `SCENARIOS` **no** se filtra a propósito: el editor tiene
que poder abrir un borrador y una sala creada con su clave tiene que poder
montarlo — lo que se decide es qué se **ofrece**, no qué existe. Y la barra de
arriba del editor dice «· borrador», porque la regla de la vuelta 77 es que la
barra dice el estado y enterarse abriendo una hoja es enterarse después de haber
guardado cuatro veces.

### §88.6 — Lo que se aplazó, y por qué

Del feedback quedaron fuera seis cosas, y las seis por la misma razón: **no son
calibración ni un hueco, son sistemas**, y meterlos a medias es peor que no
meterlos.

- **Efectos de tercera persona para Blind, KO y Core** (que se vea desde fuera a
  quien está cegado, aturdido o quemándose). No es difícil, es que hoy **el rival
  no tiene ni un campo de estado visual en la foto**: la Blind no existe en el
  servidor a propósito (§87) y la KO viaja en `movement.snapshot()` como tres
  números del movimiento, no como «está aturdido». Añadirlo es decidir qué de eso
  pasa a ser del protocolo, y eso tiene el precio que la §87 ya dejó escrito para
  la carga del arco.
- **Tabla de estadísticas con HS, KN, U2 y BOW por jugador.** El marcador de hoy
  tiene una fila —la tuya— porque no hay identidades (vuelta 41), y las columnas
  que se piden son **contadores por arma y por zona que nadie lleva**: el
  servidor cuenta bajas, no con qué. Es una vuelta suya.
- **FAQ dentro del juego** y **traducción al inglés con interruptor**. Los dos
  son trabajo de contenido, no de motor, y el segundo además obliga a decidir
  dónde vive el texto — hoy está escrito a mano en el JSX.
- **Lista pública de partidas.** Infraestructura nueva de verdad: hoy no hay
  registro de salas a propósito (`idFromName(código)` **es** el encaminado, vuelta
  47) y un buscador es exactamente el registro que no existe. Va al roadmap.
- **Rangos y experiencia.** Piden cuentas persistentes, que es la línea que
  `roadmap.md` ya tiene anotada como «modo invitado vs. logueado».
- **Banner de instalar como PWA** y **revancha al terminar la partida**. Los dos
  caben y los dos son suyos; van los primeros de la lista siguiente.

---

## §89 — La noche de los duelos con dinero

Segunda vuelta de feedback seguida, y el reparto es distinto al de la 88: de las
seis cosas, **dos eran fallos de verdad, una era un rótulo que sobraba, una era
código correcto que nadie encontraba, una era calibración y una no era nada**.
Separarlas es la mitad del trabajo, porque las cinco llegaron con la misma
forma —«esto está mal»— y sólo dos lo estaban.

### §89.1 — Un `subgrid` no crece: amontona

El síntoma: en las fichas del Core, la Blind, la KO «y parece que también en las
armas de arriba», el texto se solapaba y quedaba ilegible en la zona de «ESCUDO
· PRECISIÓN».

Lo era, y medirlo antes de tocar nada (`arm89`) dio el mapa entero:

| ficha | filas que emite | solapes |
|---|---|---|
| Pulse, Rift, Volt, Scout, Vanta | 5 | 0 |
| Bow | 7 | **2** |
| U2 | 8 | **3** |
| Core, Blind, KO | 9 | **4** |

Las cuatro últimas filas de una granada compartían el **mismo `top`** al píxel.

**La causa es un número escrito tres veces y subido ninguna.** La rejilla de la
armería alinea las fichas con `subgrid` desde la vuelta 43 y las estadísticas de
dentro desde la 71, y para eso hacía falta declarar cuántas filas ocupa una
ficha: `repeat(11, auto)` en `.armoury__grid`, `span 11` en `.armoury__card` y
`span 5` en `.armoury__stats`. Once y cinco eran ciertos cuando todas las armas
tenían cinco estadísticas. Entonces llegó el arco con dos filas propias (vuelta
85), el U2 con tres (86) y cada granada con cuatro (87), y **no se tocó ninguna
de las tres reglas** — estaban en otro fichero.

Y lo que hace un `subgrid` cuando le sobran hijos no es crecer: los mete en
pistas implícitas que la rejilla de arriba no dimensiona, así que se dibujan
unos encima de otros. **No dio ni un error**, que es la firma de esta clase de
fallo: no hay excepción, hay píxeles.

**El arreglo no es un número mayor: es que no pueda haber un número que se
quede corto.** Las estadísticas se parten en dos:

- **Las que tienen todas** —cadencia, cargador, peso, daño y escudo ·
  precisión— siguen siendo filas de la rejilla, que es lo que las alinea entre
  fichas y lo único que hace que comparar sea mirar y no leer.
- **Las que sólo tiene alguna** —cargado, carga, mecha, ceguera, aturdimiento,
  explosión, reserva— se van a **una sola fila**, en flujo normal
  (`.armoury__extras`). Ahí no hay pistas que agotar, así que añadir mañana una
  fila a un arma **no puede pisar nada**, y el alto de esa fila lo pone la ficha
  que más tenga, de modo que «escudo · precisión» sigue cayendo a la misma
  altura en las once.

Y lo que queda de número lo declara **quien lo produce**: `Armoury.jsx` publica
`--armoury-filas` y `--armoury-stats` y el CSS los lee. Es la regla de siempre
—una sola fuente de verdad— aplicada a una constante de maquetación, que es
justo donde no se había aplicado. Medido después: **0 solapes en las diez
fichas**, y las cinco filas comunes alineadas.

La lección, que no es del CSS: **un número que hay que acordarse de subir en
otro fichero es un número que no se sube.** Tres vueltas seguidas añadieron
filas y ninguna lo vio.

### §89.2 — El dinero funcionaba, y nadie lo encontró

«El dinero sigue sin verse en el HUD, jugando un duelo real con economía — se
reportó arreglado la vuelta pasada, así que parece una regresión.»

**No lo era, y lo primero fue comprobarlo en vez de creerlo.** Contra el build
que sirve el despliegue —el mismo hash que reporta `/salud`—, en un duelo de
verdad con dos navegadores y comprando (`dinero89`):

| momento | bloque | encima | opacidad |
|---|---|---|---|
| antes del rival | `$800` | nada | 1 |
| con rival, fase de compra | `$800` | nada | 1 |
| jugando, ratón capturado | `$800` | nada | 1 |
| tras comprar el chaleco | `$300` | nada | 1 |
| en ronda | `$300` | nada | 1 |

Cero errores de página, y el despliegue de la 88 salió correcto (la acción de
GitHub terminó en `success` sobre `cd1440b`). El código estaba bien, el enlace
de callbacks estaba bien, y aun así el jugador no vio el dinero en toda una
noche.

**Y eso es un fallo igual, sólo que de otra clase.** Mirando la captura se ve
por qué: la vuelta 88 lo puso **debajo** del contador de FPS y del engranaje de
ESC, en 26 px. Un número pequeño colgado de dos rótulos grises se lee como una
tercera línea de telemetría, no como tu cartera — y la petición original decía
«en una posición prominente», que es exactamente lo que no era.

Lo que cambia no es dónde está: es **la jerarquía de esa esquina**. El dinero es
del juego y los FPS son telemetría, así que el dinero va primero y a 42 px, y
los FPS y el engranaje bajan. Es la misma esquina que pedía el encargo y ahora
sí es lo primero que se ve.

Queda la regla, que vale para cualquier cosa que se añada a un HUD: **«está en
pantalla» y «se ve» son dos medidas distintas, y la segunda no se comprueba con
un `locator`.** Un banco puede decir que el elemento existe, tiene tamaño, no
tiene nada encima y opacidad 1 —lo dijo, cinco veces— y el jugador seguir sin
encontrarlo. Para eso hay que mirar la captura y preguntarse contra qué compite.

### §89.3 — ESC cerraba y no volvía

La vuelta 88 le enseñó a ESC a cerrar el panel de opciones y se quedó a mitad:
con el panel ya cerrado, la única salida de la pausa era ir a buscar «Reanudar»
con el ratón. Una tecla que hace lo de al lado y no lo obvio es peor que una que
no hace nada.

Ahora ESC reanuda, en el entrenamiento y en el duelo. Lo que tiene de
interesante es **por qué hay una espera y no una condición**
(`RESUME_KEY_DELAY_MS`, 1300 ms):

- **Quien suelta el ratón al pulsar ESC es el navegador, no la página**, y el
  orden entre su `pointerlockchange` y el `keydown` no está garantizado. Sin
  espera, una sola pulsación podría pausar y reanudar a la vez, y entonces ESC
  dejaría de servir para abrir el menú. Deducirlo del estado no vale: el estado
  es justo lo que puede haber cambiado ya.
- **Y el navegador tampoco deja.** Tras una salida de captura provocada por el
  usuario, Chrome rechaza `requestPointerLock` durante algo más de un segundo, y
  ese rechazo **no da error visible**: no pasa nada, que es el fallo que se está
  arreglando, otra vez.

Un humano que lee el menú y vuelve a pulsar tarda mucho más que 1300 ms.

Y el panel abierto se resuelve **sin pelearse por el orden de dos escuchas**:
el manejador se gatea con `panelOpen`, que en la pulsación que cierra el panel
todavía vale `true` porque React no ha confirmado el estado. Así, cerrar y
reanudar nunca caen en la misma tecla — y no hace falta `stopImmediatePropagation`,
que es lo que haría falta si se intentara por eventos (`stopPropagation` no para
a las escuchas hermanas del mismo `window`).

Medido (`esc89b`): un ESC dentro de la espera no reanuda; pasada la espera sí;
con opciones abiertas, ESC las cierra y no reanuda, y el siguiente sí.

Y una nota de instrumentación que ya costó una vuelta antes (§48): **una tecla
sintética no suelta la captura**, porque eso lo hace el navegador. El banco sale
con `document.exitPointerLock()`, que es lo que llega al mismo
`pointerlockchange`. Medido de paso (`esc89`): el `keydown` de un ESC sintético
**sí** llega a la página con la captura todavía puesta, así que la guarda de
«jugando, no» tiene que existir aunque en un navegador de verdad ese evento
probablemente no se entregue.

### §89.4 — El peso, y lo que el peso no arregla

«El movimiento se siente demasiado ligero — con Pulse equipada da la sensación
de volar. Sería bueno revisar el peso aplicado por arma.»

Son dos cosas y sólo una está en el peso. El arsenal entero cabía en un **10%**
—pistola 6.50 u/s, rifle 5.88— y eso jugando no se nota: elegir arma no se
sentía en las piernas, que es lo único que el peso viene a hacer.
`MOVEMENT.load.perKg` sube de 0.04 a **0.07** y la escalera se abre:

| arma | kg | antes | ahora |
|---|---|---|---|
| Pulse, Vanta, granadas | ≤1.1 | 6.50 | **6.50** |
| Volt | 2.6 | 6.14 | **5.86** |
| Bow | 2.8 | 6.08 | **5.77** |
| Scout | 3.2 | 5.98 | **5.59** |
| Rift | 3.6 | 5.88 | **5.41** |
| U2 | 5.4 | 5.41 | **4.88** (suelo) |

**Lo que no se toca es `free`**, y no por pereza: «la pistola no cuesta
velocidad» es una decisión escrita —la que se lleva siempre no puede costar, o
el coste estaría en no haber elegido— así que el peso se calibra subiendo lo que
pagan los pesados, nunca bajando lo que es gratis.

**Y por eso esto no arregla la sensación de volar con la pistola en la mano**,
que es lo otro que decía el informe: la pistola no paga nada ni antes ni ahora.
Eso sale de tres sitios, y los tres son decisiones grandes que no se tocan sin
que alguien juegue delante:

- **La marcha base** (`MOVEMENT.speed`, 6.5), que es la referencia contra la que
  está medido el resto del proyecto — pisadas, deslizamiento, techo del aire,
  peso de cada arma.
- **La gravedad y el salto** (30 y 8.67), de donde salen el ápice de 1.2528 u y,
  con él, **qué cobertura es saltable**: la tabla de `COVER` es una consecuencia
  de esos dos números, no una lista independiente.
- **Y el control en el aire**, que **acaba de subir** en la vuelta 88: con W
  pulsada el air-strafe ahora gira y acelera, o sea que hay más gobierno en el
  vuelo del que había la semana pasada. Que la ligereza se note justo ahora
  encaja con eso, y no es un fallo: es la mecánica funcionando.

Se queda anotado como calibración pendiente **con el jugador delante**, porque
mover cualquiera de los tres invalida medidas que llevan cuarenta vueltas en
pie.

### §89.5 — El rótulo bajo el logo

«En el menú principal, bajo el logo, aparece "RONDA CON EXPLOSIVO" — no debe
aparecer ningún texto destacado de ese tipo ahí, nunca.»

Correcto, y la sospecha también: era un resto. `panel__eyebrow` decía qué se
juega al pulsar el primer botón, y la vuelta 88 —que quitó el explosivo del modo
sin límite— **quitó la bomba y no la etiqueta**, así que con esa duración puesta
el menú anunciaba un objetivo que ya no iba a salir. El fallo de la 67 —un
control que promete lo que el juego ignora— en un sitio donde ni siquiera hay
control que tocar.

Se va, y la regla se queda: **debajo de la marca van las instrucciones y nada
más.** Lo que se juega al pulsar un botón lo dice el botón, que para eso lleva su
nombre y su duración justo debajo. `panel__eyebrow` sigue viva porque de ella
cuelga el veredicto del resumen, que ahí sí es un rótulo.

### §89.6 — El air-strafe: lo que se pidió comprobar

El informe pedía una comprobación rápida de que el cambio de la 88 se aplicó de
verdad. Se aplicó, y por dos caminos independientes:

- **Está en el build que se sirve**: dos accesos a `airStrafeIgnoraFrente` en el
  bundle principal, con el mismo hash que reporta `/salud` (y sólo valen los
  accesos a propiedad, que es la cautela de la vuelta 61).
- **Y se comporta**: W+D a 40°/s gira el rumbo **−27.5°** y sube de 6.500 a
  **6.760 u/s**, idéntico a D puro; seis saltos encadenados llevan de 6.500 a
  **7.789**. Sin el interruptor, 0.0° y 6.500 planos. Cero correcciones en 1127
  fotos de un duelo real.

Lo que sí dicen esos números, y conviene decirlo antes de que se pruebe a fondo:
**la ganancia por vuelo es de 0.26 u/s**, un 4%, y el techo está en 9.5. O sea
que la mecánica funciona y **es cara**: hacen falta muchos saltos bien
encadenados para notarla. Si al probarla despacio sigue pareciendo poca, lo que
hay que mover no es el arreglo sino el precio — `airAccel` (10) y
`airWishFactor` (0.12), que son los dos números que deciden cuánto se gana por
grado girado. Eso es tuning y se calibra jugando, no midiendo.

---

## §90 — Las tres últimas: Fang, Reaper y Titan

El encargo cerraba el arsenal de esta primera versión con tres armas, y las tres
pedían algo que el juego no tenía. No eran tres fichas nuevas en `WEAPONS`: eran
**una mecánica cada una**.

- **Reaper** — «1 a la cabeza incluso con casco». El casco es binario desde la
  vuelta 64 y se come el disparo entero, así que eso **no se puede escribir con
  un número**.
- **Titan** — «mata de un disparo a cualquier parte del cuerpo sin importar la
  armadura», y «un destello de mira visible para el rival al apuntar». Lo
  primero es la misma pared por la otra punta; lo segundo contradice algo que la
  vuelta 87 dejó escrito y verificado.
- **Fang** — «una vez en el suelo, se puede recoger caminando sobre él». Hasta
  aquí **todo lo que salía de un arma terminaba**.

### §90.1 — Atravesar una armadura no es más daño

La tentación es obvia: subir el daño hasta que el casco no llegue. No vale, y
por la misma razón por la que la puñalada por la espalda de la vuelta 71 no es
un número grande: **lo que para un número grande es justo la armadura que se
quiere atravesar**. Con el casco, además, ni siquiera es cuestión de cantidad —
`encajarImpacto` devuelve *antes* de mirar el daño: rompe el casco y se acabó.

Así que `perforaArmadura` vive donde vive `mortal`, arriba de la escalera, y
tiene dos valores porque las dos armas piden cosas distintas:

| | casco | chaleco | resultado |
|---|---|---|---|
| `'casco'` (Reaper) | lo atraviesa | lo para | cabeza: **1 siempre**; cuerpo: 2 pelado, 3 con chaleco |
| `'todo'` (Titan) | lo atraviesa | lo atraviesa | **1 en cualquier zona, siempre** |

Y dos decisiones dentro de eso:

**El Reaper no atraviesa el chaleco a propósito.** Podría —es un plomo grande— y
entonces sería un Titan de 900 dólares. Que se salte una armadura y no las dos
es lo que lo deja por debajo del Titan **sin tener que bajarle el daño**, que es
el ajuste que habría hecho el arma aburrida en vez de más barata.

**Y lo que no para, no se gasta.** Ninguna de las dos rompe el casco al
atravesarlo. Un casco que se pierde sin haber servido de nada es peor que no
llevarlo: el jugador pagaría 350 por un objeto que desaparece sin devolver nada,
y eso no es un coste, es una trampa.

Del Titan salen tres números y ninguno es de gusto: `damageScale: 3` porque la
zona más barata del modelo son las **piernas a 34**, y 34 × 3 = 102 — o sea que
«mata en cualquier zona» sale de la escala y no de una regla nueva. `rpm: 24`
porque es exactamente el doble de la Scout. Y `weight: 6.5` porque es lo más
pesado del arsenal.

**El peso topa, y se deja topar.** 6.5 kg cae por debajo de
`MOVEMENT.load.minFactor`, así que el Titan anda a 4.88 u/s: **exactamente lo
mismo que el U2**. Se valoró bajar el suelo para que fuera más lento que el
lanzacohetes y se descartó — mover `minFactor` cambia lo que anda el U2, que es
calibración de otra arma y con cuarenta vueltas de medidas detrás. Y la
comparación que el encargo hacía no era contra el U2 sino **contra la Scout**:
ahí la penalización sí crece, 4.88 contra 5.59.

### §90.2 — El destello, y por qué enmienda a la vuelta 87

La 87 verificó, con dos navegadores y pixel a pixel, que **la curva de carga es
de quien apunta y nunca del rival**, y dejó escrito que el día que se le quisiera
poner al rival una señal de lo que estás haciendo, eso sería «una decisión de
diseño con su propio precio, no un detalle de implementación».

Ésta es esa decisión, y conviene decir por qué se toma aquí y no antes: **el
Titan es la primera arma que la necesita**. Un arma que mata de un tiro en
cualquier zona y a través de cualquier armadura sólo puede ser justa si **se
puede ver venir**, que es la misma idea que hace justa una flecha (vuelta 85) —
allí lo que se ve venir es el proyectil y aquí es la intención.

Lo que se rechazó, y por qué:

- **Un sonido al apuntar.** Es más barato —no toca el protocolo— y está mal por
  dos lados: se oye desde detrás de una pared, o sea que sería un detector; y
  choca de frente con lo que el Fang de esta misma vuelta compra, que es el
  silencio.
- **Simularlo en el servidor.** Sería lo autoritativo, y significa mudar la
  mirilla entera al servidor: transición, encuadre, sensibilidad. La mirilla es
  del cliente desde la vuelta 70 y eso está medido; moverla por esto es rehacer
  un sistema para pintar una raya.
- **Deducirlo del arma.** El servidor sabe que llevas un Titan, no que has
  apretado el botón derecho. Deducir «está apuntando» de que lleva el arma
  convierte el destello en permanente, que es lo mismo que no tenerlo.

Lo que queda es un **flanco declarado por el cliente y comprobado por el
servidor**: viaja en la entrada (`z`), sólo cuando lo hay, y el servidor no se
cree un destello de un arma que no lo declara. **Ocultarlo sí se puede** desde
un cliente modificado, y eso queda escrito en vez de escondido: es el precio
conocido de que la mirilla sea del cliente, y es lo que habría que cerrar el día
que la partida valga algo.

Y una regla de dibujo que no es opcional: **se cuelga de `seen`**, el veredicto
de encuadre más rayo que decide la brújula desde la vuelta 42. Un reflejo que
atraviesa la geometría no es un reflejo, es un radar — y el arma estaría pagando
un coste que además le regala información al de enfrente.

Medido (`destello90`), y **con su premisa delante**, que es la lección de la
vuelta 46 y la que costó tres intentos en `laser87`: El Espejo tiene el centro
tapado a propósito, así que dos puntos enfrentados a doce unidades suelen tener
una caja en medio — y ahí **no sale ningún marcador**, que es correcto y se lee
igual que un fallo. El banco busca un par con línea de visión en vez de
suponerlo.

| | A (Titan) | B ve |
|---|---|---|
| premisa | — | cuerpo del rival **75.7 px** de alto |
| sin mirilla | `mirilla=false` | **0 px** |
| apuntando | `mirilla=true` | **64.8 × 5.7 px** |
| bajándola | `mirilla=false` | **0 px** |
| Scout apuntando de verdad (`_scopeOn=true`) | `mirilla=false` | **0 px** |

### §90.3 — El Fang: lo primero que se queda en el mundo

Hasta esta vuelta, **todo lo que salía de un arma terminaba**. Una bala se
resuelve con un rayo en el paso en que sale; una flecha revienta contra lo que
toque; una granada estalla. Incluso lo que dura —el silbido del U2 (vuelta 86),
una granada rodando (vuelta 87)— termina. Un cuchillo lanzado no.

**Dónde vive.** Se probó primero como un estado nuevo del pool de vuelo
(`proyectiles.js`), que es donde parecía que iba: ya tiene posición, dueño,
número de serie y se apaga al empezar una ronda. Se descartó por dos cosas. La
primera es de coste: `paso()` recorre el pool sesenta veces por segundo, y lo que
está clavado **no se mueve** — pasearlo por el bucle caliente es pagar por nada.
La segunda es más de fondo: ese módulo es «lo que vuela y tarda en llegar», y un
cuchillo clavado no vuela, no tiene parábola, ni reloj, ni gravedad, ni choca con
nada. Es otra cosa, y las otras cosas van en otro fichero.

`src/game/clavadas.js` sigue el reparto de `proyectiles.js` / `vuelo.js` al pie
de la letra: **el modelo sin `three`**, porque lo monta el motor y también
`net/partida.js` en Node, y **el dibujo en `vuelo.js`**, que es donde ya vive lo
que se ve de un proyectil — un `InstancedMesh` más, compartiendo el huso, y una
llamada de dibujo más en total.

**Quién recoge.** En el entrenamiento, el motor. En el duelo tenía que ser el
servidor, y eso no es una preferencia: un cuchillo en el suelo es **munición**, y
lo que se puede tener lo decide el servidor desde la vuelta 64. Si cada cliente
lo recogiera por su cuenta, los dos podrían recoger el mismo.

De ahí sale una consecuencia que hay que respetar: **el cliente no lo predice**.
Se consideró —es lo que hace con su propio disparo— y se cayó con un ejemplo:
plantarlo localmente además de recibirlo del servidor deja **dos cuchillos donde
hay uno**, y recoger el suyo no quita el del otro. Lo que se pierde por no
predecir es un viaje de mensaje, y eso no se nota porque lo que llega **ya está
quieto**: un proyectil que llega tarde hay que adelantarlo (vuelta 85), un
objeto parado no.

**El identificador.** No puede ser la ranura del pool ni el número de serie del
vuelo, aunque las dos cosas existan ya: bajo latencia el cliente lanza el suyo
al instante del clic y recibe el del rival un viaje después, así que **los tres
extremos numeran en órdenes distintos**. Lo pone quien manda en el mundo y viaja
en el mensaje.

**Y la regla de producto, que es la que hace el arma:** *acertar la gasta;
fallar la deja clavada*. Se valoró lo contrario —que se recuperase siempre, como
una flecha que se saca del cuerpo— y es peor: convierte el arma en munición
infinita con un paseo de por medio. Tal como está, cada lanzamiento tiene **dos
resultados distintos y los dos significan algo**, que es lo que hace que ir a
buscar el que has fallado sea una decisión y no un trámite.

Dos condiciones más, y las dos son reglas:

- **Sólo lo recoge quien ya lleva Fang.** Recoger es *recargar*, no *comprar*:
  un arma que se adquiere pisándola convierte la tienda en una sugerencia. Y en
  el duelo importa el doble, porque el cuchillo del suelo puede ser del rival.
- **Nunca por encima de lo que compraste**, con el `reserva.maxima` de siempre.

Medido en los dos modos. `fang90` conduce `Partida` sin navegador: se compra por
450 ($800 → $350), se clava, **el rival recibe su aviso de plantar**, acertar
deja el suelo a cero y fallar deja uno, recogerlo sube la reserva de 1 a 2 con
su aviso a los dos, quien no lleva Fang pasa por encima y no pasa nada, una
ronda que empieza limpia el suelo, y el pool se queda en ocho metiéndole doce.
`fang90ent` lo repite en el **motor del entrenamiento con ratón y teclado de
verdad**, que es el camino que el otro banco no recorre: la **G** saca el Fang
(1 en la mano, 2 de reserva), lanzar lo clava a 3.4 u y baja la reserva a 1, y
andar por encima la devuelve a 2 dejando el suelo limpio. Cero errores de página
en los dos.

### §90.4 — Una ranura con dos armas deja de ser una constante

`SECONDARY_WEAPON` era un `find` sobre el catálogo, y la nota de `MELEE_WEAPON`
decía desde la vuelta 71 lo que había que hacer el día que hubiera dos: **la
lista sale del `slot`**, como las principales.

Lo que costó más que eso fue **quién dice cuál es la de serie**. Estaba en el
catálogo de la tienda (`deSerie`), que es donde se usa para escribir «de serie»
en la ficha, y desde ahí **no se puede leer**: `SETTINGS` se evalúa antes que
`ECONOMY`, así que un `const` de módulo que preguntara al catálogo revienta al
cargar con un «Cannot access before initialization». Se probó mover la
derivación debajo de `ECONOMY` y funciona, pero deja el valor de fábrica del
ajuste sin poder leerlo. La salida buena es **invertir la dependencia**: lo
declara el arma y `catalogoDeTienda()` lo sella al vuelo. Sigue habiendo un solo
sitio que dice cuál es la pistola gratis, que es lo que evita que el catálogo
regale una y el saneado te ponga otra en la mano.

Y una que el propio panel enseñó: la armería decidía qué ficha lleva botón con
una frase escrita a mano —«la pistola y el cuchillo se llevan, no se equipan»—.
Era cierta mientras esas dos ranuras tuvieran un arma sola; con el Reaper dentro
es **un panel que se niega a equipar un arma recién comprada**. Lo que esa frase
significaba de verdad es «una ranura sin elección no tiene botón», y eso se
cuenta desde el catálogo.

### §90.5 — Dos agujeros que encontró construirlo

**La reserva no bajaba en el servidor, desde la vuelta 86.** `inv.reserva` se
ponía al comprar y volvía a subir con `_premiarBajaDeProyectil`, y **nunca
bajaba**: no medía lo que te queda sino lo que te dieron. Como el inventario
viaja y el cliente lo copia tal cual, un cohete que mataba **repartía de más** —
con dos gastados, la baja devolvía tres. No lo cazó nadie porque el mensaje sólo
sale en unos pocos momentos y porque el cliente lleva su propia cuenta, que es
la correcta hasta que llega una corrección.

Se encontró porque el Fang no se dejaba recoger: el servidor creía que siempre
llevabas el tope. Es la lección de la 87 otra vez — **una mecánica nueva es lo
que enseña los agujeros de la anterior**.

El arreglo es una resta con suelo en cero por lanzamiento, y **coincide con el
cliente en el mismo instante**: allí el disparo vacía el cargador y el cargador
se llena de la reserva; aquí se resta directamente. No se manda economía por
esto, que sería tráfico para decirle al cliente lo que acaba de hacer.

**Y un verbo no puede llamarse como un dato.** `MSG.CLAVADA` lleva sus tres
acciones en la forma del mensaje —`x/y/z` planta, `q` quita, `l` limpia— y la
primera versión usaba `z` para limpiar. Un mensaje de plantar lleva `z` siempre,
así que **cada cuchillo clavado habría borrado el suelo entero**, sin un error
en ninguna pantalla. Lo cazó leerlo antes de probarlo, no un banco, y vale para
cualquier protocolo donde los verbos y los campos comparten espacio.

Y una tercera, menor y latente: `tick()` pedía `1 + exceso` entradas de la cola
sin acotarlas contra las que hay. Con `colchon` en cero —que hoy no pasa, porque
`NET.jitterBufferTicks` no es cero, pero es un número de configuración—
`shift()` devuelve `undefined` y **el paso revienta con la sala dentro**. Queda
acotado.

### §90.6 — Lo que se queda fuera, con su porqué

**Cuántos cuchillos te quedan no se ve en el HUD.** La reserva no se ha dibujado
nunca —el U2 la tiene desde la 86 y las granadas desde la 87, y las tres se
apañan con el aviso de «no te quedan»— y con un arma que se va a recoger del
suelo eso pasa de ser un hueco a ser una pregunta que el jugador se hace cada
ronda. No se ha construido aquí a propósito: meter un contador en esa esquina es
la decisión de jerarquía que la vuelta 89 acaba de tomar —el dinero primero, los
FPS detrás— y añadir una tercera cosa sin medirla es exactamente cómo se pierde
de vista lo que ya está. Es lo primero de la lista si se vuelve al HUD.

**El clic derecho del Fang no hace nada**, y está declarado en su ficha. El de
una granada existe para dejarla caer a tus pies; un cuchillo a tus pies no sirve
de nada. Un botón vacío hay que decirlo, o se lee como un arma a medias.

**Y el Reaper no es comprable en la ronda 1**, aunque sea la ronda de pistolas
en cualquier otro juego. El techo de esa ronda es **por tipo** desde la vuelta
64 y el Reaper es `arma`; con 800 de saldo inicial tampoco llegaría a sus 900,
así que abrir una excepción habría sido escribir una regla para un caso que no
ocurre.
