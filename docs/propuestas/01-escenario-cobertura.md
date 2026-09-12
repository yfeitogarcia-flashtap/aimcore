# Propuesta 01 — Primer escenario con cobertura

**Estado:** **Plano A construido** (ver `docs/decisions.md`, ronda 14) y
**reescalado a su propia sala de 40×40** en la ronda 24: las cotas de este
documento son las de la propuesta original sobre 80×80 y ya no coinciden con
`SCENARIOS`. Para la geometría vigente manda `config.js`. Planos B y C siguen en
propuesta; no se construyen hasta validar A jugando.
**Versión visual (plantas dibujadas):** https://claude.ai/code/artifact/5446051b-7eef-4aa7-b8b8-8e681aae3439

Tres layouts para el primer escenario con cobertura de Vektor, dentro de la sala
actual de 80×80×16. Bloques geométricos de un solo color, sin texturas,
verticalidad de un solo nivel. Cada uno resuelve una situación distinta que la
sala vacía no entrena.

---

## Vocabulario de alturas

Las alturas no son arbitrarias: salen de `config.js`. El ojo está a **1.70** de
pie y **1.05** agachado, y el salto sube lo que diga `jumpSpeed` (ver más abajo:
el valor cambió tras esta propuesta). Los tres planos usan sólo estas seis piezas.

| Pieza | Altura | De pie (ojo 1.70) | Agachado (ojo 1.05) | ¿Encima? |
|---|---|---|---|---|
| Bordillo | 0.60 | no tapa | no tapa | **sí**, de un salto |
| Baja | 1.25 | disparas por encima | te tapa entero | no |
| Media | 1.90 | te tapa entero | te tapa entero | no — pero desde un bordillo el ojo sube a 2.30 y disparas por encima |
| Alta | 3.60 | corta del todo | corta del todo | no — desde plataforma (ojo 4.30) sí se ve por encima |
| Bloque | 4.80 | corta del todo | corta del todo | no, tampoco desde plataforma |
| Plataforma | 2.60 | suelo elevado, sólo por rampa | — | parapeto a 3.80 = pecho de quien está arriba |

Dos combinaciones nacen de esta tabla y se usan a propósito:

- **Bordillo + Media pegados**: subirse al bordillo es la única forma de disparar
  por encima de la Media. Cobertura total o ventaja de altura, nunca las dos.
- **Plataforma + parapeto 3.80**: quien está arriba queda cubierto hasta el
  pecho, y las troneras (huecos en el parapeto) son la única línea de tiro. Es la
  idea del "rival en una ventana".

---

## Plano A — «Largo y Puerta» *(construido)*

> **Cambios respecto a esta propuesta, hechos al construirlo.** El razonamiento
> completo está en `docs/decisions.md` §14.10-14.11.
>
> - **Los dos anclajes del Vestíbulo se movieron a las bocas de cada salida.**
>   Donde los ponía esta propuesta no se veían desde el spawn —la divisoria tapa
>   el cono entero— y la sesión arrancaba sin ninguna diana.
> - **La plataforma del Balcón llega a ±39, no a ±38.** El jugador alcanza ±38.5
>   y se caía por la rendija trasera.
> - **El parapeto se apoya sobre la plataforma** (de 2.6 a 3.8), no sobre el
>   suelo: si no, sólo asomaría una rodaja de cabeza por encima.
> - **Los disparos se paran en la cobertura.** No estaba en el encargo y sin ello
>   el escenario no significaba nada.
> - **El modo dinámico y el *slider* de distancia no se aplican** en escenarios.
> - **El panel de acciones se ancla al spawn de verdad** (antes, a z = 0).


Un carril largo, un cuello de botella y un cuarto de cerca, separados por una
espina que cruza el mapa de norte a sur.

### Zonas

- **El Largo** — 23×60 u, carril izquierdo. Unas 50 unidades de visión limpia,
  rotas por tres bloques Media escalonados a izquierda y derecha. Se cruza a base
  de asomadas cortas, nunca de una carrera.
- **La Espina / La Puerta** — muro Alta (3.6) de Z +22 a Z −22 con un solo hueco
  de 4 u en mitad. Es el paso rápido entre carril y cajones, y el único punto del
  mapa que se puede pre-apuntar con certeza.
- **Los Cajones** — 48×20 u a la derecha. Racimo de Baja y Bordillo separados
  4-7 u, con una divisoria Alta que parte la zona en dos bolsas. Distancias de 8
  a 16 u: asomada agachado y giros cortos.
- **El Balcón** — franja elevada (+2.60) al fondo, rampa por la derecha y
  parapeto con **dos troneras** que miran el Largo de punta a punta.
- **Vestíbulo** — banda de salida, despejada (ver aviso 06).

### Anclajes de aparición

| Grupo | Nº | Notas |
|---|---|---|
| Largo lejano | 3 | 20-35 u, detrás de la cobertura escalonada |
| Troneras del balcón | 2 | elevados; sólo tiro desde el Largo, ángulo hacia arriba |
| Bocas de la puerta | 2 | pre-apuntado del choke |
| Cajones | 4 | 8-16 u, asomada agachado |
| Vestíbulo | 2 | contacto inmediato al salir |

### Qué entrena que la sala vacía no

Sostener y cruzar un carril largo bajo presión, pre-apuntar un paso obligado, y
cambiar de largo a corto dentro de la misma sesión. Es **el control del centro**
de un mapa competitivo: la sala vacía entrena puntería, esto entrena dónde
ponerse.

---

## Plano B — «El Patio»

Un núcleo macizo en mitad de la sala y un anillo alrededor. No hay espalda segura
en ningún momento.

### Zonas

- **El Núcleo** — 18×18 u, Bloque 4.8. No se ve por encima desde ningún sitio, ni
  siquiera desde la atalaya. Define todo el mapa por lo que tapa.
- **El Túnel** — paso de 4 u a través del núcleo, el único atajo entre norte y
  sur. Corto, recto y sin cobertura: el chokepoint más puro de los tres planos.
- **La Atalaya** — plataforma (+2.60) en mitad del carril oeste, con parapeto y
  una tronera a cada lado, norte y sur. Quien la ocupa cubre los 60 u del carril
  en los dos sentidos. Rampa por el oeste.
- **Los Bolsillos** — cuatro esquinas en L, cada una una bolsa de ~15×15 con una
  sola entrada. No se ven desde el anillo: hay que entrar a limpiarlas.
- **El Anillo** — banda de ~20 u alrededor del núcleo, con cobertura repartida:
  Media en el norte, Baja y Bordillo en el sur, mixta en los laterales.

### Anclajes de aparición

| Grupo | Nº | Notas |
|---|---|---|
| Esquinas del núcleo | 4 | ángulos cerrados, nunca sabes por cuál |
| Bocas del túnel | 2 | choke, tiro de reacción |
| Troneras de la atalaya | 2 | elevados; duelo a la ventana a lo largo del carril |
| Bolsillos | 4 | obligan a rotar, quedan a la espalda |
| Anillo | 3 | 20-35 u en los carriles laterales |

### Qué entrena que la sala vacía no

Combate rotacional: la diana puede salir en cualquiera de los 360°, y moverse
alrededor del núcleo abre y cierra ángulos sin parar. Es **pelear alrededor de un
objeto central** — un patio, un sitio con estructura en medio. La habilidad es
limpiar una esquina antes de que te limpie ella.

---

## Plano C — «La Ejecución»

Dos rutas de aproximación, un umbral y una zona defendida. Direccional: se entra,
no se ronda.

### Zonas

- **Los Accesos** — dos rutas separadas por un Bloque. La izquierda es ancha y
  despejada con dos Media sueltas: rápida y expuesta. La derecha es un codo de
  dos giros de 90° formado por muros Alta: lenta y segura. Elegir ya es parte del
  ejercicio.
- **El Umbral** — muro Alta con dos huecos: boca ancha de 8 u para la ruta
  izquierda, puerta de 3.5 u para la derecha. Las dos desembocan en la misma
  zona, con una Media delante de cada una como primera cobertura.
- **El Cajón Doble** — Media 1.9 con un Bordillo 0.6 pegado detrás. El único
  sitio del mapa donde subirse al bordillo (ojo a 2.30) te deja disparar por
  encima de la Media.
- **La Plataforma** — puesto del defensor al fondo izquierdo (+2.60), parapeto
  con dos troneras cubriendo las dos entradas, y rampa por detrás del todo. Para
  tomarla hay que cruzar la zona entera.
- **El Rincón Ciego** — L de muros Alta al fondo derecho. No hay línea de visión
  desde ninguna de las dos entradas: hay que meterse, y meterse es moverse.
- **Línea larga** — ~30 u por el costado este, desde la puerta hasta el rincón.

### Anclajes de aparición

Aquí el **orden** importa tanto como la posición:

| Grupo | Nº | Notas |
|---|---|---|
| Contacto | 2 | en las bocas, 8-12 u, tiro inmediato |
| Ángulos de la zona | 4 | 12-20 u, detrás de la cobertura de entrada y del cajón |
| Troneras | 2 | elevados; hay que limpiarlas antes de cruzar el centro |
| Rincón ciego | 2 | inalcanzables desde cobertura: fuerzan el avance |
| Larga derecha | 1 | ~30 u por el costado este |

### Qué entrena que la sala vacía no

La ejecución: elegir entrada, limpiar ángulos en el orden correcto y aceptar que
hay dianas a las que no se llega sin moverse. Es el plano que hace que **la
dispersión por movimiento** signifique algo por fin — avanzar disparando cuesta
precisión, pararse a disparar cuesta exposición.

---

## Recomendación

**Plano A.** Tres gimnasios distintos en un solo mapa, es el que más se parece a
un mapa competitivo de verdad —que era el criterio—, y sus piezas (espina,
cobertura escalonada, balcón con troneras) son el vocabulario que los otros dos
también necesitan. Construirlo primero abarata los otros dos.

**C es el segundo natural**: reutiliza las piezas de A y añade direccionalidad.
**B es el más rejugable pero el más difícil de hacer legible** — un mapa
rotacional sin hitos claros se lee como un laberinto; mejor cuando el vocabulario
esté asentado.

| | A · Largo y Puerta | B · El Patio | C · La Ejecución |
|---|---|---|---|
| Riesgo | el mayor volumen de geometría | legibilidad | unidireccional, se repite igual |
| Rejugabilidad | alta (3 zonas separables) | muy alta | media sin anclajes sorteados |

---

## Lo que esto rompe del sistema actual

Seis cosas que hoy funcionan porque la sala está vacía. Ninguna es un bloqueo,
pero conviene decidirlas antes de tocar geometría, no durante.

1. **El color de las estructuras no puede ser naranja.** La referencia
   (`Reference/Maps/blockout-style.png`) es naranja entera, pero `#E4462B` es el
   color de las dianas y una estructura naranja compite con lo único que el ojo
   debe buscar (mismo razonamiento que el verde de acción, ver `decisions.md`
   §10.4). Propuesta: la rampa de grises de la tabla de alturas, que además
   codifica función — el gris claro no se pasa, el oscuro se salta.
2. **Las dianas ya no pueden aparecer por muestreo de cono.** Con cobertura, la
   gracia es que la diana salga en un sitio con sentido táctico. Eso pide
   **anclajes curados** atados a la geometría, con metadatos por anclaje (altura,
   si exige asomarse, a qué zona pertenece), en lugar del muestreo por rechazo
   actual. El *slider* de distancia pasaría de generar posiciones a filtrar
   anclajes.
3. **Hace falta un test de visibilidad.** Una diana detrás de un muro es
   injugable. Hay que comprobar línea de visión desde el jugador antes de activar
   un anclaje — barato **sólo si se hace al activar**, nunca por frame: el
   presupuesto de 0.2 ms p99 no admite raycasts continuos contra toda la
   geometría.
4. **El salto.** ~~Sólo sube 0.69 u~~ — **resuelto en parte, y con una
   corrección importante.** `jumpSpeed` pasó de 5.0 a **6.75** para probar el
   *feel* de un salto que supere la cobertura Baja. Dos avisos sobre las cifras
   que esta propuesta daba:

   - La fórmula continua (`v² / 2g`) **sobrestima** la altura real. El integrador
     de `movement.js` es Euler semi-implícito —resta la gravedad antes de mover—
     así que el ápice sale más bajo, y **depende de los FPS**. Con el
     `jumpSpeed: 5` original el salto no subía 0.694 sino 0.653 a 60 Hz y 0.684 a
     240 Hz.
   - Por eso el 6.44 que proponía este documento estaba mal por partida doble:
     salía de una altura Baja de 1.15 anterior a la tabla final de 1.25, y además
     usaba la fórmula continua.

   | `jumpSpeed` | ápice 60 Hz | 144 Hz | 240 Hz |
   |---|---|---|---|
   | 5.00 (antes) | 0.653 | 0.677 | 0.684 |
   | 6.75 (ahora) | 1.210 | 1.242 | 1.252 |

   **Resuelto en las rondas 17 y 18** (`docs/decisions.md`). La dependencia del
   refresco venía de integrar la gravedad paso a paso; el salto se calcula ahora
   en forma cerrada, y con eso se pudo subir la gravedad sin pagar precisión.
   Valores vigentes: `jumpSpeed 8.67`, `gravity 30`, ápice **1.2528 u** y 578 ms
   de vuelo, iguales en cualquier monitor. La cobertura Baja de 1.25 **sí es
   saltable de forma fiable**: verificado 12 de 12 a 60, 144 y 240 Hz. La tabla
   de arriba ya no necesita asterisco.
5. **El movimiento hoy sólo se recorta contra la sala.** `movement.js` limita X y
   Z contra las paredes y nada más. Con estructuras hace falta colisión contra
   una lista de cajas, resuelta por eje para que rozar una pared no frene al
   jugador en seco.
6. **El panel de acciones se va a comer un muro.** Está anclado respecto al spawn
   y ahora puede quedar dentro de una estructura. El escenario necesita reservar
   un volumen libre detrás del spawn — en los tres planos la banda de salida está
   despejada a propósito.

---

## Pendiente de decidir

1. **Qué plano** — A, B o C, o qué mezclar de cuáles.
2. **La rampa de grises** para las estructuras, o un criterio de color distinto.
3. ~~**El salto**~~ — cerrado. Integrador analítico (ronda 17) y `jumpSpeed 8.67`
   / `gravity 30` (ronda 18): 578 ms de vuelo, ápice 1.2528 u, sin dependencia
   del refresco y con la Baja saltable.
4. **Anclajes**: fijos siempre en los mismos puntos, o sorteo entre los anclajes
   visibles en cada aparición. Lo segundo es más rejugable y cuesta poco más.
