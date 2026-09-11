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
| Escenario | `src/game/scenario.js` | Convierte los datos de `SCENARIOS` en mallas, colisionadores, oclusores y anclajes. |
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

**Ojo con las alturas de `COVER`:** el bordillo (0.6) y ahora también la
cobertura baja (1.25) se saltan; la Media (1.9) sólo se supera subido a un
bordillo. Si tocas `jumpSpeed` o `gravity`, revisa esa tabla.

**Con cobertura, las dianas salen en anclajes curados, no por muestreo.** Un
cono no sabe poner una diana en una tronera. Cada anclaje lleva su zona, su
suelo y si obliga a asomarse, y se sortea **entre los visibles**: se baraja el
orden y se coge el primero que pase el test de visibilidad, que es un sorteo
uniforme entre los visibles y de paso ahorra raycasts.

**Lo que se dibuja de unos datos no se guarda como imagen.** La miniatura de
cada escenario se dibuja en SVG desde `SCENARIOS`, con `coverHeight` y
`coverEdgeColor` compartidos con la escena 3D. Una captura se desincroniza en
cuanto alguien mueve una caja y nadie se entera.

**Bajo el punto de mira gana lo más cercano, siempre.** El tablero de acciones no
tiene prioridad por ser interfaz: se compara su distancia con la de la diana y la
del escenario. Cualquier candidato nuevo se suma a esa comparación, nunca delante
de ella.

**En el aire la marcha se congela.** `currentSpeed` devuelve la del despegue
mientras `airborne`. Cambiarla a media trayectoria deja el vuelo igual de largo y
la mitad de recorrido, que se siente como flotar.

**La colisión frena en el sentido del avance, no hacia la cara más cercana**, y a
quien ya esté dentro de una caja no se le expulsa. Con cajas grandes —la
plataforma del Balcón ocupa la sala entera— "salir por el lado más próximo" son
cuarenta unidades de teletransporte.

**El test de visibilidad es de activación, nunca por frame.** Es un raycast
contra toda la geometría del escenario y no cabe en el presupuesto de un frame.
Si no hay ningún anclaje visible se reintenta tras `SPAWN.anchorRetryMs`, jamás
al frame siguiente.

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

Sala fija de **80×80×16**, rejilla en suelo y paredes. Sesión de **30 s** por
defecto, más **PRÁCTICA LIBRE ∞** sin límite de tiempo con finalización manual.

**Dianas:** tres tipos — *clásica* y *cono* (ancladas al centro, esfera), e
*hitbox completo* (anclado a los pies, tres zonas con **vida compartida** y daño
por zona: cabeza 100 / torso 50 / piernas 34; cono de aparición más ancho y
distancia variable por muñeco). Modo dinámico opcional: destino aleatorio a
velocidad constante, con comprobación de separación para evitar solapes.
Selector de dianas simultáneas x1 / x2 / x3 / x5 / x8. **Ojo:** con cobertura, el
nivel es un *techo*, no una cantidad — el número real lo pone cuántos anclajes se
ven desde donde está el jugador (en el Plano A, entre 2 y 6 según la zona).

**Escenarios:** variante activable desde opciones, no reemplazo. *Sala vacía*
(Gridshot de siempre, muestreo por cono) y **Largo y Puerta**, el primer
escenario con cobertura: Espina con una sola Puerta de 4 u, El Largo con tres
Media escalonadas, Los Cajones de corta distancia, el Balcón elevado (+2.6) con
rampa y parapeto con dos troneras, y un Vestíbulo despejado alrededor del spawn.
Trece anclajes curados. El vocabulario de piezas y la rampa de grises están en
`COVER`; la geometría, en `SCENARIOS`.

Con un escenario montado: el jugador **colisiona** contra las cajas (resuelto un
eje cada vez, con soporte de suelo y rampas), los **disparos se paran en la
cobertura**, y el **modo dinámico y la distancia de aparición no se aplican** —
las dianas se quedan en su anclaje porque un destino aleatorio las metería dentro
de un muro.

**Movimiento:** WASD, tres marchas (correr / SHIFT andar / CTRL o C agachado,
gana la más lenta), salto sin doble salto **resuelto en forma cerrada** —misma
trayectoria a cualquier refresco—, límites reales de la sala con margen de
seguridad. Por encima de `ACCURACY.speedThreshold` y
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

**Panel de acciones disparable:** DOM en 3D vía `CSS3DRenderer` anclado respecto
al spawn del jugador, con planos WebGL invisibles paralelos para el raycast.
Botones Pausa / Reiniciar / Cambiar arma / Silenciador / Opciones. Acertarle no
cuenta como acierto ni fallo, no gasta munición ni aplica recoil, y tiene su
propio sonido de confirmación.

**HUD:** aciertos, fallos, precisión, tiempo (∞ en práctica libre), munición
actual/máximo con parpadeo en reserva baja, indicador de recarga, contador de
FPS (media móvil), silueta del arma equipada y mensajes de ayuda contextuales.

**Selector de escenario:** plano cenital por escenario dibujado desde los datos,
más la ficha —entrena / riesgo / rejugabilidad— del que esté elegido. Al cambiar,
una transición corta tapa el montaje.

**Opciones** (accesibles antes de empezar y desde la pausa, persistidas):
escenario, sensibilidad, tipo de diana, arma, tamaño de diana, distancia de spawn, cadencia
de aparición, dianas simultáneas, límite de FPS, supresor (sólo si el arma lo
admite), mensajes de ayuda y modo dinámico.

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

**Pendiente tras subir la gravedad:** la escala de `LANDING` se quedó corta. Con
`fullSpeed: 7.0`, cualquier caída desde un salto normal en adelante satura a
fuerza 1, así que el golpe suena igual bajando de un cajón que del Balcón. Se
arregla subiendo `LANDING.fullSpeed` a ~12.5; no se tocó porque no estaba en el
encargo. Detalle en `docs/decisions.md` §18.

---

## 7. Historia y porqués

`docs/decisions.md` guarda el histórico completo: cada decisión de diseño
relevante, su razonamiento y las alternativas descartadas. No se carga en cada
sesión — consúltalo cuando necesites saber **por qué** algo está como está antes
de cambiarlo.
