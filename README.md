# AimCore

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
- **Escape**: suelta el ratón y **pausa** el cronómetro. Otro click reanuda.

Sólo con la variante de movimiento activa (`MOVEMENT.enabled`):

- **WASD** o **flechas**: desplazamiento horizontal relativo a la cámara. El
  cabeceo no interviene: mirar al suelo o al cielo no cambia hacia dónde andas.
- **SPACE**: salto. Sin doble salto — no se puede volver a saltar hasta tocar
  el suelo. Si dejas la tecla pulsada, rebota al aterrizar.
- **CTRL** (o **C**) mantenido: agacharse. Baja la altura de la cámara y
  reduce la velocidad mientras se mantiene.

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
| Tamaño de diana | escala la figura entera sin deformar sus proporciones |
| Distancia de aparición | distancia base del cono respecto al jugador |
| Cadencia | milisegundos entre apariciones. Menos es más difícil |
| Modo acumulativo | permite varias dianas vivas a la vez |
| Modo dinámico | las dianas vivas se desplazan mientras están en pantalla |

El panel sólo se abre con la partida parada, así que reconstruir las mallas al
cambiar de tipo o de tamaño nunca cae dentro del bucle de render.

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

El modo dinámico no toca cuándo aparece o desaparece una diana: eso lo siguen
mandando la cadencia y el modo acumulativo. En pausa las dianas se congelan con
el cronómetro.

### Modo acumulativo

Desactivado (por defecto) hay una sola diana viva y la siguiente espera a que
caiga la actual — el Gridshot de siempre. Activado sale una diana nueva cada
`cadencia` milisegundos aunque las anteriores sigan en pie, hasta el tope de
`TARGET.maxActive` (6). Con cadencias muy bajas se llena en un instante: sube
la cadencia al activarlo.

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
TARGET.moveSpeed        // velocidad de las dianas en modo dinámico
TARGET.moveMaxSeconds   // tiempo máximo persiguiendo un mismo destino

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
- **La sala creció a 64×64.** Con la sala anterior (44×44) el slider de
  distancia no tenía recorrido: las dianas lejanas caían fuera de las paredes
  y el muestreo las descartaba. Misma estética, sólo más grande.
- **Las tres zonas del hitbox usan el mismo naranja** con distinto brillo
  —cabeza clara, piernas apagadas— para que se distingan sin salirse de la
  paleta.
- **Los ejes del modo dinámico los decide el anclaje.** Los destinos salen del
  mismo muestreo que las apariciones, así que anclar el hitbox al suelo ya
  basta para que sólo se mueva en horizontal: no hay una restricción de ejes
  escrita aparte que pueda desincronizarse.
- **La precisión cuenta impactos, el ritmo cuenta bajas.** Con el hitbox dejan
  de coincidir, así que el resumen muestra los impactos aparte cuando difieren.

## Fuera de alcance (siguiente fase)

Sin Supabase, sin login y sin cuentas: lo único que persiste son los ajustes,
en el `localStorage` de este navegador. Las estadísticas de partida siguen en
memoria y se pierden al recargar.

Fuera de alcance también, por decisión explícita: fuego automático, retroceso
y escenarios con cobertura. Cuentas, ranking y backend van aparte.
