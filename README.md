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

## Modo: Gridshot

Una diana a la vez, en posición aleatoria dentro de un cono frente a la cámara.
Al acertar, la diana hace *pop* y aparece otra en menos de 100 ms en otro sitio.
Sesión de 30 segundos y pantalla de resumen con precisión, dianas y dianas/s.

## Ajustes

**Todo lo ajustable vive en [`src/config.js`](src/config.js)** — colores,
sensibilidad, duración de la sesión, tamaño y distancia de las dianas, ángulo
del cono, tiempos del feedback y volúmenes. Ningún otro archivo repite esos
valores.

Los más probables de tocar mientras se prueba el feel:

```js
SESSION_DURATION_S      // duración de la sesión
LOOK.sensitivity        // 0.022°/count, misma convención que en los FPS
TARGET.radius           // tamaño de la diana
TARGET.distance         // a qué distancia aparecen
SPAWN.coneHalfAngleDeg  // cuánta pantalla cubren las apariciones
COLORS.crosshair        // color del crosshair (punto único de cambio)
```

En desarrollo el motor queda expuesto en `window.aimcore`, así que se puede
trastear en caliente desde la consola (`aimcore.controls.setSensitivity(2)`).
Vite lo elimina del build de producción.

## Estructura

```
src/
├── config.js           todas las constantes de tuning
├── App.jsx             une el motor con el HUD
├── styles.css
├── audio/sfx.js        sonido sintetizado con la Web Audio API
├── game/
│   ├── engine.js       bucle rAF, sesión, input y raycasting
│   ├── scene.js        sala de líneas
│   ├── lookControls.js rotación de cámara desde el ratón crudo
│   └── targets.js      aparición de dianas y pops
└── ui/                 Hud, Crosshair, Summary
```

### Por qué React no toca el bucle de render

El motor es three.js puro y vive fuera de React. React sólo conoce la fase de
la partida y el resultado final; el cronómetro y los contadores se escriben
directamente en el DOM por refs desde el bucle. Una partida entera provoca un
puñado de renders de React en vez de miles.

En el bucle no se crea geometría, ni vectores, ni objetos: los vectores de
muestreo son de módulo, los *pops* salen de un pool fijo y la diana se
reposiciona en lugar de recrearse. Medido en este repo, la lógica de juego
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
- **Sin assets.** El sonido se sintetiza con osciladores; no hay archivos de
  audio ni texturas.

## Fuera de alcance (siguiente fase)

Sin Supabase, sin login, sin persistencia: todo vive en memoria del cliente y
se pierde al recargar. Cuentas, ranking, backend y menú de opciones
(sensibilidad y crosshair personalizables) van aparte.
