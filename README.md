# Vektor <sub>by FlickLAB</sub>

Prototipo local de *aim trainer* de FlickLAB. El objetivo de esta primera fase
es uno solo: **validar la sensación de apuntado, el rendimiento y el "feel" del
disparo** antes de tocar nada de backend.

Proyecto nuevo e independiente: no reutiliza código de FlickLAB.

## Arrancar

```bash
npm install
npm run dev
```

Abre la URL que imprime Vite, haz click en el canvas y a disparar.

| comando | qué hace |
| --- | --- |
| `npm run dev` | servidor de desarrollo con HMR |
| `npm run build` | build de producción en `dist/` |
| `npm run preview` | sirve el build de producción |

## Controles

- **Click** sobre el canvas: captura el ratón (Pointer Lock) y arranca la sesión.
- **Click izquierdo**: disparar.
- **R**: recargar. Funciona también con el cargador a medias.
- **Escape**: suelta el ratón y **pausa** el cronómetro. En la pantalla de pausa
  hay un botón **Reanudar**, y también vale un click en cualquier sitio.

Sólo con la variante de movimiento activa (`MOVEMENT.enabled`):

- **WASD** o **flechas**: desplazamiento horizontal relativo a la cámara. El
  cabeceo no interviene: mirar al suelo o al cielo no cambia hacia dónde andas.
- **SHIFT** mantenido: caminar, una marcha intermedia entre correr y agachado
  (`MOVEMENT.walkSpeed`). Es la velocidad más rápida con la que se dispara sin
  penalización — ver *Precisión y movimiento*.
- **SPACE**: salto. Sin doble salto — no se puede volver a saltar hasta tocar
  el suelo. Si dejas la tecla pulsada, rebota al aterrizar.
- **CTRL** (o **C**) mantenido: agacharse. Baja la altura de la cámara y
  reduce la velocidad mientras se mantiene. Con SHIFT y CTRL a la vez manda la
  marcha más lenta de las dos, o sea agachado.

> **Cuidado con CTRL en Chrome.** Agacharse avanzando es Ctrl+W, y Ctrl+W
> cierra la pestaña — es un atajo reservado del navegador y una página no
> puede impedirlo. Ctrl+A/S/D sí quedan neutralizados. Por eso **C** está
> mapeado también a agacharse; si prefieres sólo CTRL, quita `KeyC` de
> `MOVEMENT.keys.crouch`.

## Modos

Un único interruptor, `MOVEMENT.enabled` en `src/config.js`, cambia entre los
dos. El motor es el mismo: no hay código duplicado.

### Gridshot estático (`MOVEMENT.enabled: false`)

La línea base de puntería pura. El jugador está clavado en el centro de la
sala y el cono de aparición sigue la mirada, así que las dianas salen siempre
dentro del campo de visión. Es el modo original y no ha cambiado nada.

### Gridshot con movimiento (`MOVEMENT.enabled: true`)

El jugador se desplaza dentro de un radio de `MOVEMENT.radius` unidades desde
el centro (5 por defecto, que cae justo sobre una línea de acento de la
grilla, así que el límite se ve). Salta y se agacha.

El cono de aparición cambia de régimen: **el vértice es la posición actual del
jugador** —incluida su altura real, esté agachado o en el aire— pero **la
dirección es fija en el mundo** (`SPAWN.anchoredAxisYawDeg` /
`anchoredAxisPitchDeg`). Ni la mirada, ni el salto, ni el agachado la rotan.
Eso es lo que hace que desplazarse cambie de verdad el ángulo hacia las
dianas, en lugar de que el cono te siga y el movimiento no cuente para nada.

En ambos casos: una diana a la vez, *pop* al acertar y otra en menos de
100 ms, sesión de 30 segundos y resumen con precisión, dianas y dianas/s.

## Panel de opciones

Botón **Opciones** en la pantalla de inicio y en la de pausa. Los cambios se
aplican al momento y se guardan en `localStorage`, así que sobreviven a una
recarga. **Restablecer** vuelve a los valores de `config.js`.

| ajuste | qué hace |
| --- | --- |
| Sensibilidad | slider y campo numérico sobre el mismo valor |
| Tipo de diana | Clásica · Cono · Hitbox completo |
| Arma | Scalar-2 · Axis-7 · Vertex-9 |
| Tamaño de diana | escala la figura entera sin deformar sus proporciones |
| Distancia de aparición | distancia base del cono respecto al jugador |
| Cadencia | milisegundos entre apariciones. Menos es más difícil |
| Dianas simultáneas | x1 · x2 · x3 · x5 — cuántas pueden estar vivas a la vez |
| Modo dinámico | las dianas vivas se desplazan mientras están en pantalla |
| Límite de fotogramas | 60 · 144 · 240 · Sin límite |
| Silenciador | sólo con un arma que lo admita |
| Mensajes de ayuda | avisos breves en el HUD, activados por defecto |

El panel sólo se abre con la partida parada, así que reconstruir las mallas al
cambiar de tipo o de tamaño nunca cae dentro del bucle de render.

## Armas

Tres arquetipos, en el bloque `WEAPONS` de `config.js`.

| arma | modo | RPM | cargador | recarga | silenciador | carácter del retroceso |
| --- | --- | --- | --- | --- | --- | --- |
| **Scalar-2** | semi | 500 | 18 | 1.2 s | sí | ninguno — se dispara como antes de que hubiera armas |
| **Axis-7** | auto | 600 | 30 | 2.3 s | no | rifle: subida vertical marcada los primeros ocho disparos, luego deriva a la izquierda |
| **Vertex-9** | auto | 800 | 25 | 1.8 s | sí | SMG: patada más inmediata pero la mitad de techo vertical, y más bamboleo lateral que vertical |

Scalar-2 es el valor por defecto.

**Modos.** `semi` dispara una vez por click. `auto` dispara en continuo mientras
se mantenga pulsado, al intervalo que marcan las RPM. Las RPM acotan los dos
modos por igual: con Scalar-2 no salen más de 8.3 disparos por segundo por
mucho que se haga clic.

El intervalo se cuenta desde el momento en que *tocaba* cada disparo, no desde
el frame en que sale. Sin eso, el redondeo al refresco del monitor inflaría el
intervalo y las RPM reales dependerían de los Hz de la pantalla.

**Cargador y recarga.** Cada arma empieza la sesión con el cargador lleno. Con
el cargador a cero el gatillo sólo suena en seco —un clic flaco y sin cuerpo,
distinto del disparo— y lo hace una vez por pulsación: el fuego automático no
repite el clic. **R** recarga, también a medias; durante la recarga no se
dispara y volver a pulsar R ni la reinicia ni la acumula. Al completarse, el
cargador vuelve al máximo y el patrón de retroceso al primer disparo: un
cargador nuevo es una ráfaga nueva.

**Silenciador.** Interruptor en el panel, presente sólo con un arma que lo
admita (`supportsSuppressor`). Cambia el sonido y nada más: ni daño, ni
retroceso, ni cadencia. Si queda activado y se cambia a un arma que no lo
admite, el motor lo ignora en lugar de aplicarlo a medias.

**Retroceso.** El patrón es un `[pitch, yaw]` en grados por cada disparo
consecutivo de la ráfaga. Son incrementos, no posiciones: el motor los suma.
Pitch positivo sube, yaw positivo desvía a la izquierda. Agotado el patrón deja
de acumularse — ese es el techo del arma —, y un array vacío significa sin
retroceso.

El empuje se suma a la rotación de la cámara igual que lo haría el ratón, así
que el arma desplaza la mira además de lo que mueva el jugador. **No hay
recuperación**: compensar el retroceso es cosa del jugador. Como el raycasting
sale de donde apunta la cámara en ese instante, el retroceso afecta a los
impactos sin ningún tratamiento aparte.

La ráfaga se cierra al soltar el botón o tras `RECOIL_RESET_MS` (200 ms) sin
disparar; la siguiente vuelve a empezar por el primer disparo del patrón. El
primero de cada ráfaga sale limpio: se dispara y *después* el arma empuja.

Los valores son un punto de partida con el carácter descrito, para calibrar
jugando igual que la sensibilidad o el tamaño de diana.

### Precisión y movimiento

Encima del patrón de retroceso, moverse deprisa abre el disparo. No es un
patrón: es un desvío **aleatorio de verdad** en cada disparo, así que no se
aprende ni se compensa — sólo se evita yendo más despacio.

| estado | dispersión |
| --- | --- |
| Quieto, caminando (SHIFT) o agachado (CTRL) | ninguna: precisión completa |
| Corriendo | activa |
| En el aire | activa, sin importar la marcha: saltar penaliza como correr |

El umbral es `ACCURACY.speedThreshold`, igualado a `MOVEMENT.walkSpeed`, de
modo que caminar queda justo por debajo. La magnitud es un ángulo aleatorio
entre 0 y `ACCURACY.movementSpreadDeg` (1.2° de partida), en una dirección
aleatoria. Aplica igual a las tres armas.

El desvío se aplica **al rayo, no a la cámara**: la mira no tiembla, se desvía
la bala. El retroceso sí mueve la cámara, así que al desviar una dirección de
tiro que ya lleva ese empuje los dos offsets se suman sin pisarse.

Con 1.2° la penalización es deliberadamente selectiva: la diana Clásica por
defecto abarca ~1.5° de radio angular, más que el cono entero, así que a centro
de masa no se falla ni corriendo. Donde muerde es en el tiro fino — la cabeza
del hitbox, de ~0.42°, baja del 100% al 42% de aciertos corriendo. Súbelo si
quieres que correr penalice también el centro de masa.

### Tipos de diana

**Clásica** (esfera) y **Cono** comparten lógica: un disparo, una baja. Sólo
cambia la geometría.

**Hitbox completo** es una figura humanoide de tres zonas con vida compartida
(`TARGET.maxHealth`, 100 por defecto):

| zona | forma | daño | disparos para abatir |
| --- | --- | --- | --- |
| Cabeza | esfera pequeña arriba | 100 | 1 |
| Torso | cápsula en el medio | 50 | 2 |
| Piernas | cilindro abajo | 34 | 3 |

Las combinaciones salen solas: piernas + torso deja 16 de vida, y cualquier
tercer impacto remata. Un impacto que no mata hace parpadear su zona, para que
se distinga de un fallo. Este tipo aparece **más lejos por defecto** (20 frente
a 15.5), aunque el slider de distancia manda igual: al cambiar de tipo, la
distancia salta al valor base de ese tipo y a partir de ahí la mueves tú.

**El hitbox va siempre de pie en el suelo**, nunca flotando: es una figura
humana. Su origen está en los pies (`anchor: 'feet'` en `TARGET_TYPES`), la
altura la pone el suelo y el cono de aparición sólo decide su posición
horizontal — con lo que el slider de distancia pasa a medir distancia
horizontal para este tipo. Clásica y Cono siguen apareciendo a cualquier
altura dentro de su franja.

**Y tiene sus propias reglas de aparición**, en el bloque `HITBOX` de
`config.js`, porque un dummy de pie pide otra distribución que una esfera
flotante:

- **Abanico frontal mucho más ancho**: `spawnConeHalfAngleDeg` a 55°, o sea un
  frente de 110°, frente a los 36° de Clásica y Cono. Sigue siendo frontal, no
  360°.
- **Profundidad variable**: cada dummy sortea su propia distancia entre el 60%
  y el 140% del valor del slider (`distanceScale`), nunca por debajo de
  `minSpawnDistance`. Con el slider en 20 salen entre 12 y 28 unidades, en vez
  de todos alineados sobre el mismo arco.

Ambas cosas son horizontales: la altura la sigue poniendo el suelo. El tipo
declara su perfil con `spawn: HITBOX`, así que el gestor de dianas no necesita
saber qué tipo es cuál — mira si hay perfil y lo usa.

### Modo dinámico

Independiente del acumulativo. Con él activo, cada diana viva elige un punto
de destino aleatorio dentro de su propio volumen de aparición y se mueve hacia
él en línea recta a `TARGET.moveSpeed` unidades por segundo — sin aceleración
ni easing. Al llegar, o al agotar `TARGET.moveMaxSeconds` persiguiendo el
mismo punto, elige otro.

Los ejes salen del tipo de anclaje, sin lógica aparte: Clásica y Cono flotan,
así que reciben destinos en X/Y/Z; el hitbox se apoya en el suelo, así que sus
destinos están siempre a nivel de suelo y sólo se mueve en X/Z, sin cambiar de
altura mientras está vivo. Las diagonales salen solas de elegir destinos en 2D.

Al elegir destino se aplica **la misma comprobación de separación mínima** que
al hacer aparecer una diana: si el punto elegido queda demasiado cerca de otra
diana viva, o del destino que esa misma traía, se vuelve a sortear. Como tope,
`SPAWN.destinationAttempts` (6) intentos; agotados, se acepta **el mejor de los
probados** —el de mayor separación—, no el último por orden de llegada. Con la
sala llena puede no haber hueco, y el bucle nunca debe quedarse dando vueltas,
pero eso no obliga a quedarse con el peor candidato.

El modo dinámico no toca cuándo aparece o desaparece una diana: eso lo siguen
mandando la cadencia y el modo acumulativo. En pausa las dianas se congelan con
el cronómetro.

### Dianas simultáneas

**x1** (por defecto) es el Gridshot de siempre: una sola diana viva, y la
siguiente se cuenta desde la baja, no desde la aparición. De **x2** en adelante
van saliendo cada `cadencia` milisegundos aunque las anteriores sigan en pie,
hasta el número elegido. Con cadencias muy bajas se llena en un instante: sube
la cadencia al pasar de x1.

El pool de dianas se dimensiona para el mayor valor elegible, así que cambiar
de opción no obliga a reconstruirlo.

## HUD

Abajo a la derecha, el bloque del arma: silueta, nombre, cargador `actual/máximo`
y, durante la recarga, una barra de progreso. Cuando el cargador baja de
`HELP.lowAmmoRatio` (20%) el contador parpadea en naranja.

Las siluetas son SVG trazados a mano, sólo contorno, sin relleno y con el mismo
gris y grosor que el resto del HUD — ninguna imagen de por medio. Scalar-2 tiene
dos variantes, con y sin el cilindro del silenciador, y cambia con el
interruptor.

### Mensajes de ayuda

Avisos breves que aparecen junto al bloque del arma y se retiran solos pasados
`HELP.messageDurationMs`. Es un mecanismo genérico —texto y duración— del que
hoy hay un solo uso: *Pulsa R para recargar*, que salta una vez por cargador al
bajar del umbral, y otra vez si se aprieta el gatillo en vacío. El interruptor
**Mensajes de ayuda** del panel los apaga, y con ellos el parpadeo del contador.

## Rendimiento

El HUD lleva un **contador de FPS** discreto en la esquina superior derecha.
Mide los fotogramas realmente dibujados —no los ticks de `requestAnimationFrame`—
promediados sobre los últimos `RENDER.fpsSampleFrames` (30), porque el valor
instantáneo de un solo frame salta demasiado para leerlo.

El **límite de fotogramas** acota el ritmo de actualización del juego a 60, 144
o 240; *Sin límite* (por defecto) lo deja atado sólo al refresco del monitor.

No se descartan fotogramas a lo bruto: se acumula el tiempo de cada tick de
`requestAnimationFrame` y se descuenta un intervalo objetivo cada vez que se
dibuja, guardando el sobrante. Así el ritmo medio sale exacto aunque el
objetivo no sea un divisor del refresco —en un monitor de 144 Hz limitado a 60,
los intervalos alternan 13.9 y 20.8 ms y promedian 16.7— y el movimiento no va
a tirones. El delta que recibe la lógica de juego es siempre el tiempo real
transcurrido desde el fotograma anterior dibujado, nunca el intervalo objetivo,
de modo que el reloj de la partida no se separa del reloj de pared.

Pedir el mismo límite que el refresco de la pantalla lleva una tolerancia: sin
ella, un tick de 4.166 ms no llegaría por los pelos a un objetivo de 4.167 y el
ritmo se quedaría a la mitad.

## Ajustes por defecto

**Todo lo ajustable vive en [`src/config.js`](src/config.js)** — colores,
sensibilidad, duración de la sesión, tamaño y distancia de las dianas, ángulo
del cono, tiempos del feedback y volúmenes. Ningún otro archivo repite esos
valores.

Los más probables de tocar mientras se prueba el feel:

```js
SESSION_DURATION_S      // duración de la sesión
LOOK.sensitivity        // 0.022°/count, misma convención que en los FPS
TARGET.radius           // tamaño de la diana
TARGET.distanceSpread   // dispersión alrededor de la distancia elegida
SPAWN.coneHalfAngleDeg  // cuánta pantalla cubren las apariciones
COLORS.crosshair        // color del crosshair (punto único de cambio)

SETTINGS                // valores iniciales y rangos del panel de opciones
TARGET_TYPES            // formas, daño por zona y distancia base de cada tipo
TARGET.maxHealth        // vida por diana
TARGET.maxActive        // tope de dianas vivas en modo acumulativo
WEAPON_KEYS             // teclas de acción del arma (R para recargar)
HELP.lowAmmoRatio       // umbral de aviso de munición baja
HELP.messageDurationMs  // cuánto dura un aviso en pantalla
COLORS.action           // verde FlickLAB de los botones de acción

RENDER.fpsSampleFrames  // ventana del contador de FPS
SIMULTANEOUS_TARGETS    // opciones del selector de dianas a la vez
FRAME_LIMITS            // opciones del límite de fotogramas

TARGET.moveSpeed        // velocidad de las dianas en modo dinámico
TARGET.moveMaxSeconds   // tiempo máximo persiguiendo un mismo destino

WEAPONS                       // roster: modo, RPM y patrón de retroceso
RECOIL_RESET_MS               // pausa que cierra la ráfaga y reinicia el patrón

MOVEMENT.walkSpeed            // marcha de SHIFT, entre correr y agachado
ACCURACY.speedThreshold       // velocidad a partir de la cual se abre el tiro
ACCURACY.movementSpreadDeg    // radio angular máximo del desvío aleatorio

HITBOX.spawnConeHalfAngleDeg  // anchura del abanico frontal del hitbox
HITBOX.distanceScale          // horquilla de distancia, en fracción del slider
HITBOX.minSpawnDistance       // mínimo absoluto, por corto que quede el slider
SPAWN.destinationAttempts     // reintentos al buscar destino sin solape

// El máximo del slider de distancia NO se edita: sale de la sala.
WALL_CLEARANCE                // margen mínimo diana-pared (5 unidades)

MOVEMENT.enabled        // interruptor entre las dos variantes
MOVEMENT.speed          // velocidad horizontal de pie
MOVEMENT.crouchSpeed    // velocidad agachado
MOVEMENT.standHeight    // altura de ojos de pie (también en el modo estático)
MOVEMENT.crouchHeight   // altura de ojos agachado
MOVEMENT.jumpSpeed      // impulso vertical del salto
MOVEMENT.gravity        // gravedad constante
MOVEMENT.radius         // radio máximo de desplazamiento
MOVEMENT.keys           // mapeo de teclas, por código físico
```

En desarrollo el motor queda expuesto en `window.aimcore`, así que se puede
trastear en caliente desde la consola (`aimcore.controls.setSensitivity(2)`).
Ese nombre, como el del repositorio, se queda en `aimcore`: son identificadores
técnicos internos, no la marca.
Vite lo elimina del build de producción.

## Estructura

```
src/
├── config.js           todas las constantes de tuning
├── settings.js         ajustes de partida: validación y localStorage
├── App.jsx             une el motor con el HUD
├── styles.css
├── audio/sfx.js        sonido sintetizado con la Web Audio API
├── game/
│   ├── engine.js       bucle rAF, sesión, input y raycasting
│   ├── scene.js        sala de líneas
│   ├── lookControls.js rotación de cámara desde el ratón crudo
│   ├── movement.js     desplazamiento, salto y agachado
│   └── targets.js      dianas: tipos, zonas, vida y apariciones
└── ui/                 Hud, Crosshair, Options, Summary
```

### Por qué React no toca el bucle de render

El motor es three.js puro y vive fuera de React. React sólo conoce la fase de
la partida y el resultado final; el cronómetro y los contadores se escriben
directamente en el DOM por refs desde el bucle. Una partida entera provoca un
puñado de renders de React en vez de miles.

En el bucle no se crea geometría, ni vectores, ni objetos: los vectores de
muestreo son de módulo y las dianas salen de un pool fijo que se reutiliza —
sólo se reconstruye al cambiar de tipo o de tamaño desde el panel, que nunca
está abierto con la partida en marcha. Medido en este repo, la lógica de juego
cuesta ~0.1 ms por frame en p99, frente a los 4.17 ms de presupuesto a 240 Hz.

## Decisiones de esta fase

- **Sin arma ni viewmodel en pantalla.** Deliberado, no una limitación:
  Kovaak's y Aim Lab lo omiten para mantener el foco en la relación
  crosshair-diana. Se puede añadir después como opción.
- **Sin sonido de fallo.** Sólo click de disparo (siempre) y un tono más
  brillante al acertar. Si en las pruebas se echa en falta, se revisa.
- **Sin techo en la sala.** El brief pide suelo y paredes; cerrar por arriba
  ensuciaba el encuadre con rectángulos anidados.
- **Escape pausa, no termina.** Soltar la captura a mitad de sesión no debería
  arruinar la partida.
- **El movimiento es cinemática, no físicas.** Velocidad horizontal constante,
  una integración de la gravedad para el salto y un acotado al radio cada
  frame. El suelo es `y = 0` y no hay más colisiones.
- **La altura vertical se modela en dos piezas.** La altura de los pies sólo
  la mueve el salto; la de los ojos sobre los pies, sólo el agachado. La
  cámara es la suma, así que agacharse en el aire sale gratis y sin casos
  especiales.
- **Sin assets.** El sonido se sintetiza con osciladores; no hay archivos de
  audio ni texturas.
- **La sala mide 80×80 y ya no crece.** Cada ampliación anterior fue detrás de
  un rango de distancia mayor. A partir de aquí es al revés: el que se acota es
  el slider. Su máximo se **calcula** a partir del tamaño de la sala en vez de
  escribirse a mano (`computeMaxSpawnDistance` en `config.js`), de modo que el
  peor caso —jugador en el borde de su radio de movimiento y dummy sorteado a
  la distancia máxima— deje siempre al menos `WALL_CLEARANCE` (5 unidades) de
  margen hasta la pared. Manda el más restrictivo de los dos regímenes de
  distancia, porque el slider es uno solo: hoy sale **21**, con 5.6 unidades de
  margen en el peor caso del hitbox y 11.5 en el de Clásica y Cono. Si algún
  día cambian la sala, el radio de movimiento o las horquillas, el tope se
  recalcula solo.
- **Las tres zonas del hitbox usan el mismo naranja** con distinto brillo
  —cabeza clara, piernas apagadas— para que se distingan sin salirse de la
  paleta.
- **El abanico del hitbox se sortea en 2D, no aplastando un cono 3D.**
  Muestrear el cono en tres dimensiones y luego proyectarlo al suelo amontona
  las dianas cerca del eje, porque los extremos verticales del casquete se
  proyectan sobre azimuts pequeños. Sorteando el azimut directamente el reparto
  es uniforme de verdad.
- **Los ejes del modo dinámico los decide el anclaje.** Los destinos salen del
  mismo muestreo que las apariciones, así que anclar el hitbox al suelo ya
  basta para que sólo se mueva en horizontal: no hay una restricción de ejes
  escrita aparte que pueda desincronizarse.
- **El verde de marca sólo viste botones de acción.** JUGAR, REANUDAR,
  REINICIAR y VOLVER. El naranja sigue siendo el acento de la interfaz y el HUD
  se queda en blanco y gris: tres colores con tres trabajos distintos.
- **El clic en seco se dispara por pulsación, no por cadencia.** Repetirlo a
  800 RPM mientras se mantiene el gatillo sería insufrible.
- **El contador de FPS mide fotogramas dibujados, no ticks de rAF.** Es el
  número que hace falta para comprobar que el límite está haciendo su trabajo.
- **La dispersión desvía la bala, no la mira.** Un temblor aleatorio del
  crosshair sería insufrible y además impediría apuntar; desviando el rayo, el
  jugador ve exactamente dónde apunta y lo que pierde es certeza sobre dónde
  irá el disparo.
- **La marcha más lenta manda.** SHIFT y CTRL a la vez dan agachado porque el
  motor se queda con la menor de las velocidades pedidas, no por un orden de
  prioridad escrito a mano — seguiría siendo cierto si un día se retocan las
  constantes.
- **El retroceso no se recupera solo.** La cámara se queda donde la deja el
  arma. Es lo que convierte el patrón en algo que se aprende a compensar, en
  lugar de en un temblor que se corrige solo.
- **La precisión cuenta impactos, el ritmo cuenta bajas.** Con el hitbox dejan
  de coincidir, así que el resumen muestra los impactos aparte cuando difieren.

## Fuera de alcance (siguiente fase)

Sin Supabase, sin login y sin cuentas: lo único que persiste son los ajustes,
en el `localStorage` de este navegador. Las estadísticas de partida siguen en
memoria y se pierden al recargar.

Fuera de alcance también, por decisión explícita: fuego automático, retroceso
y escenarios con cobertura. Cuentas, ranking y backend van aparte.
