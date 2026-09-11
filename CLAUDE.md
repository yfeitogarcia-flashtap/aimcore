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

**Recoil y cadencia se miden desde el instante *programado* del disparo, no
desde el frame que lo renderiza.** `_nextShotAt` se calcula a partir del momento
en que el disparo *tocaba*, no de `performance.now()` del frame. Si no se hace
así, la cadencia queda cuantizada por el refresco del monitor y un arma de 600
RPM dispara distinto a 60 Hz que a 240 Hz. Lo mismo aplica a cualquier
mecánica temporizada que se añada.

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
Selector de dianas simultáneas x1 / x2 / x3 / x5.

**Movimiento:** WASD, tres marchas (correr / SHIFT andar / CTRL o C agachado,
gana la más lenta), salto con gravedad constante sin doble salto, límites reales
de la sala con margen de seguridad. Por encima de `ACCURACY.speedThreshold` y
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

**Opciones** (accesibles antes de empezar y desde la pausa, persistidas):
sensibilidad, tipo de diana, arma, tamaño de diana, distancia de spawn, cadencia
de aparición, dianas simultáneas, límite de FPS, supresor (sólo si el arma lo
admite), mensajes de ayuda y modo dinámico.

---

## 6. Fuera de alcance por decisión, no por olvido

Backend, cuentas, guardado en la nube, rankings, minimapa, pasos sonoros,
escenarios con cobertura, colisión con estructuras. Si el encargo no lo pide
explícitamente, no se añade.

---

## 7. Historia y porqués

`docs/decisions.md` guarda el histórico completo: cada decisión de diseño
relevante, su razonamiento y las alternativas descartadas. No se carga en cada
sesión — consúltalo cuando necesites saber **por qué** algo está como está antes
de cambiarlo.
