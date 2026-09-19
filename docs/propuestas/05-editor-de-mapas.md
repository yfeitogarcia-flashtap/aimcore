# Propuesta 05 — Editor visual de mapas

**Estado:** **fase 1 construida en la vuelta 74**; las fases 2 a 6 siguen
diseñadas y sin tocar. Lo que cambió al construirla está en §8.

**Estado original:** diseñada, sin construir nada. El encargo (vuelta 74) fue
proponer cómo dividirla en fases y contestar dos preguntas concretas: si los
parámetros de partida entran en la primera versión, y cómo un mapa del editor
se vuelve un escenario jugable. Las dos respuestas —**el fichero es el mapa** y
**los parámetros se parten en dos**— se aceptaron tal cual, y el recorte de la
rotación libre (§3) también.

**Qué se pide:** poder diseñar y editar mapas de Vektor sin escribir código:
grilla vacía con el movimiento real para probar, menú de formas, escalado por
eje con bloqueo, rotación, imán y rejilla, simetría por giro, colocación de
salidas y zonas, métricas en vivo, deshacer/rehacer y aviso de presupuesto.

---

## 1. Lo que ya está hecho sin que nadie lo llamara «editor»

Antes de diseñar nada conviene inventariar lo que existe, porque es bastante más
de lo que parece y **cambia el tamaño del proyecto**:

| Lo que hace falta | Lo que ya hay |
|---|---|
| Probar con el movimiento y la física reales | El motor **ya se hospeda fuera de `App.jsx`**: es lo que hace la página del duelo desde la vuelta 56. Una tercera página que instancie `Engine` no es una idea nueva, es el mismo patrón por tercera vez. |
| Física del mapa | `scenario.fisica` y `fisicaDeEscenario(key)` existen desde la vuelta 72. Un mapa **ya puede** declarar gravedad, salto y techo del aire. |
| Simetría por giro | `giro180(piezas)` existe desde la vuelta 66 y es exactamente lo que se pide. |
| Zona de confinamiento como **área** | `spawnZone` **ya es una lista de cajas** (`{x, z, w, d}`), la misma convención que `boxes`. No hay que convertir puntos en áreas: ya lo son. |
| Salidas con rumbo | `duelo.salidas` con `yaw`, desde la vuelta 66. |
| Métricas de validación | **Están escritas**: `mapa66.mjs` y `pilares72.mjs` miden simetría, solapes, distancia entre salidas, línea de visión, cajas de compra, coste de cruzar, primer contacto, asomo y alturas alcanzables. Importan `Scenario` y `hasLineOfSight` **sin navegador**. |
| Vocabulario de piezas | `COVER.heights` y `COVER.colors`, con la rampa de grises. |

O sea: la mayor parte de la lógica de un editor de mapas **ya está escrita**, en
forma de bancos. Lo que no hay es una pantalla desde la que usarla.

Eso reordena el proyecto entero. El trabajo caro no es dibujar cajas: es la
pieza de §2 y el límite de §3.

---

## 2. El eje de todo: **un escenario tiene que poder no venir de una clave**

Hoy un escenario **es** una entrada de `SCENARIOS`, y eso está clavado en tres
sitios que sólo saben leer una clave de texto:

```js
constructor(scene, key) { this.key = SCENARIOS[key] ? key : 'empty'; … }
export function scenarioRoom(key)      { const d = SCENARIOS[key]; … }
export function fisicaDeEscenario(key) { const p = SCENARIOS[key]?.fisica; … }
```

Un editor produce un escenario que **todavía no existe en ningún sitio**, así
que mientras montar uno pase por una clave, no hay nada que montar. Ésta es la
única pieza sin la que no arranca ninguna fase, y es pequeña: que los tres
acepten **una definición o una clave**, y que la clave siga resolviéndose contra
el catálogo como hasta ahora.

Y de ahí sale la segunda mitad, que es la que contesta a «cómo se publica»: si
una definición puede venir de fuera del literal, puede venir **de un fichero**.

```
src/maps/*.json   →   import.meta.glob   →   SCENARIOS = { …integrados, …deFichero }
```

Con eso, «guardar un mapa» y «que el mapa exista» son la misma acción. No hay
un paso de publicación aparte que se pueda olvidar, ni un formato de exportación
distinto del formato que el juego lee: **el fichero que escribe el editor es el
dato que monta el motor.** Es la regla de siempre —una sola fuente de verdad—
aplicada a los mapas.

---

## 3. El límite duro, y es el que hay que hablar antes de empezar: **la colisión es AABB**

Esto es lo que más cambia respecto a lo pedido, así que va antes que las fases.

El mundo de Vektor, para el jugador que lo choca, son **cajas alineadas a los
ejes** más un caso especial:

```js
this.boxes.push({ minX, maxX, minZ, maxZ, bottom, top, kind })
```

`resolveAxis` resuelve **un eje cada vez** contra esas seis cifras. No hay
orientación en ningún sitio, y no es un descuido: es lo que permite que la
colisión sea barata, que `giro180` sea tres líneas (girar una caja es mandar su
esquina máxima al otro lado del origen) y que el cliente y el servidor lleguen
al mismo resultado dígito a dígito, que es de lo que vive la predicción.

De ahí salen tres consecuencias que el encargo toca de lleno:

**Rotación libre en Y.** Una caja girada 30° se **dibuja** girada y **para las
balas** bien —el rayo va contra la malla, no contra la AABB—, pero el jugador
sigue chocando contra la caja **sin girar**. El resultado no es un fallo
visible: es andar contra aire en una esquina y atravesar la pared en la otra, y
en red es una corrección por paso. Rotación en pasos de **90°** sí es gratis
—intercambiar ancho y fondo— y es la que cubre el 95% de lo que se construye.

**Rotación en X.** Volcar una caja no tiene expresión ninguna en este modelo: lo
que hoy se inclina son las rampas, y son un caso aparte que **no frena**, sólo
levanta el suelo, resuelto a lo largo del eje Z y sólo de él.

**Tejado, triángulo, cuña.** Sólo existen como `ramps`. Una rampa se puede pisar
y no se puede golpear con la cabeza: un tejado bajo el que se pasa andando no
está modelado. Y sólo van en Z.

**Y el hueco/ventanal tiene un premio y una factura.** El premio: la colisión
**ya sabe** pasar por debajo de algo —`box.bottom >= headY` en `resolveAxis`— y
una caja ya admite `base`, así que un dintel es un dato que hoy se puede
escribir. De hecho `base` ya se usa: los tres parapetos del Balcón nacen a 2.6.
Pero los tres se apoyan sobre la plataforma, que ocupa su huella entera desde el
suelo, así que **no hay ni una pieza con aire debajo** — y un vano es
exactamente eso. La factura está anotada en `CLAUDE.md` desde la vuelta 69:

> **Levantarse debajo de una caja no se comprueba, porque hoy no puede pasar.**
> Ninguna pieza de ningún escenario tiene la base levantada […] El día que un
> mapa declare una plataforma de verdad hay que escribir esa comprobación, y
> `slide69` [9] se pondrá rojo para recordarlo.

O sea: **el primer ventanal del primer mapa del editor es el día del que habla
esa nota.** Es trabajo acotado y conocido —hay un banco esperándolo— pero hay
que hacerlo antes de ofrecer la herramienta, no después.

### La regla que se propone, y gobierna todas las fases

> **El editor no puede poder construir algo contra lo que el motor no sepa
> chocar.**

Un editor que ofrece rotación libre sobre una colisión AABB no es un editor con
una limitación: es una máquina de fabricar mapas rotos, y te enteras cayéndote
por un tejado, no con un banco en rojo. Así que cada forma entra en el menú
**cuando su colisión existe**, y no antes. El menú de formas queda repartido
así:

| Hoy, gratis | Trabajo pequeño y acotado | Vuelta propia |
|---|---|---|
| Cubo, prisma, muro, bordillo, plataforma, parapeto (todos son la misma caja con otros números y otro `kind`) · giros de 90° | Rampa en las **4** orientaciones · hueco/ventanal/puerta como **composición** (jambas + dintel con `base`) + la comprobación de agacharse | Rotación libre (OBB) · tejado y triángulo **sólidos** · todo lo que se choque y no esté alineado |

Y para que no se pierda la capacidad, lo que compensa a la rotación libre en un
juego de cajas es el **giro de 90° más la composición**: una torre con un vano,
un tejado a dos aguas hecho de rampas, un pasillo en L. Es lo que hay en los
cuatro mapas de hoy y no se ha echado de menos todavía.

---

## 4. Las dos preguntas

### 4.1 ¿Cómo se convierte en un escenario jugable? — **Fichero, y el fichero es el mapa**

Hay tres formas de entenderlo, y las tres tienen una respuesta distinta según el
modo:

**Para entrenamiento** (muñecos, Plano A y compañía): el fichero **es** la
publicación. Con `src/maps/*.json` cargado por `import.meta.glob` (§2), guardar
desde el editor deja el mapa en la lista del selector en cuanto Vite recarga.
No hace falta pasárnoslo, ni que lo toquemos. Para que esté en el **despliegue**
hace falta reconstruir, o sea un commit — que es algo que ya haces.

**Para duelo**, no es tan simple, y conviene decir por qué antes de que parezca
una traba: la geometría de una partida tiene que existir **idéntica en los dos
clientes y en el servidor**. `net/partida.js` corre `movement.js` contra un
`Scenario` de verdad, y la bienvenida manda **la clave**, no el mapa. Un mapa
que sólo viviera en el navegador de quien lo dibujó sería el fallo que la vuelta
65 ya nombró:

> el cliente predice su propio movimiento contra la geometría que tiene montada,
> así que dos escenarios distintos serían una corrección por paso contra paredes
> que sólo existen en un lado.

Así que para duelo hay exactamente dos caminos honestos:

- **(a) El mapa está en el build.** Es lo que hacen los cuatro de hoy. Sale
  gratis con §2 y es lo que se propone para todas las fases de este documento.
- **(b) El mapa viaja.** Es de verdad interesante —es «mapas de comunidad», que
  ya está en `docs/roadmap.md`— y es **una vuelta suya**, no un detalle del
  editor: hay que decidir qué tope de tamaño viaja, saneado de geometría que
  llega de fuera en el servidor, y qué pasa si el segundo en entrar no la
  recibe entera. Eso no cabe dentro de este proyecto sin desdibujarlo.

**Recomendación:** (a) en todas las fases; (b) explícitamente fuera, y anotada
como la fase 6 opcional. El editor no publica a un servidor: **escribe un
fichero en `src/maps/`, y estar ahí es lo que hace real a un mapa.**

### 4.2 ¿Los parámetros de partida, en la v1? — **Partidos en dos, y no por comodidad**

La pregunta mezcla dos cosas que en este código ya viven separadas, y la
separación es la respuesta:

**Lo que es del mapa va en el editor, y pronto** — porque son campos del propio
escenario y porque **sin ellos las métricas mienten**. La altura a la que se
llega de un salto es `jumpSpeed² / (2·gravity)`: un panel de métricas que no
sepa la gravedad del mapa no puede decirte si esa torre de 3.4 se sube.

`fisica` (gravedad, salto, techo del aire) · `sinEconomia` y `dotacion` ·
`salidas` con su rumbo · `spawnZone` · caja de compra · `soloDuelo`.

**Lo que es de la partida no va en el editor, ni en la v1 ni nunca** — porque
no es del mapa. La duración de una ronda, cuántas hay y los segundos de fase de
compra viven en `ROUNDS`, y la fase de compra ya se elige **por sala, al
crearla** (`?compra=`, vuelta 64). Meterlos en el fichero del mapa sería
modelarlos en el sitio equivocado y crear dos sitios que dicen lo mismo — que es
exactamente cómo una sala acaba jugándose con dos reglas distintas.

Si quieres tocarlos tú, lo que hace falta es **un par de selectores más en la
página del duelo**, al lado del de fase de compra y el de mapa, viajando en la
dirección del socket como ellos. Es un trabajo pequeño e independiente de este
proyecto: media vuelta, cuando quieras.

Hay un caso intermedio que sí es del mapa y hoy no lo es: `ROUNDS.cajaCompra`
son `{ancho: 4, fondo: 4}` **globales**. Como pides la zona de confinamiento
como área editable, pasa a ser un campo del mapa con el global de valor por
defecto — el mismo patrón que `fisica` en la vuelta 72.

---

## 5. Las fases

Cinco, y cada una acaba en algo que se puede usar. El orden no es por dificultad:
es por **cuándo dejas de depender de nosotros**, que es lo que el encargo pide de
verdad.

### Fase 1 — El esqueleto que anda

*Qué hace posible:* abrir `/editor/`, poner cajas sobre la rejilla vacía,
guardar, y **entrar a andar por dentro con el movimiento real**.

- Los tres puntos de §2: `Scenario`, `scenarioRoom` y `fisicaDeEscenario` aceptan
  una definición además de una clave.
- `src/maps/*.json` descubiertos y fundidos en `SCENARIOS`.
- Tercera entrada de Vite, `/editor/`, **sólo en desarrollo** (`npm run editor`).
  No entra en `dist/`: es una herramienta de autor, no una pantalla del juego, y
  la vuelta 73 ya midió lo que cuesta añadir peso a una página (64 KB). Ponerlo
  en el despliegue es una línea del `input`, el día que haga falta.
- Dos modos con una tecla: **editar** (cámara libre cenital/orbital) y **probar**
  (el `Engine` de verdad, con su `movement.js`, su colisión y su física). No es
  una simulación aparte: es el motor, como en el duelo.
- Caja: crear, seleccionar, mover, borrar. Alto/ancho/largo por número y por tirador.
- Guardar y cargar. **Y abrir los cuatro mapas de hoy**, que es la prueba de que
  el formato del editor y el del juego son el mismo: si El Espejo no se abre y se
  vuelve a guardar idéntico, el formato está mal.

### Fase 2 — Construir de verdad

*Qué hace posible:* montar un mapa entero sin pelearte con la herramienta.

- Menú de formas: la tabla de §3, columna «hoy, gratis». Muro, bordillo,
  plataforma y parapeto son **presets** de la caja, no primitivas nuevas.
- Vocabulario de altura: elegir `kind` de `COVER.heights`, que además pinta el
  gris que le toca. Altura libre en número para lo que no encaje.
- **Bloqueo por eje**: escalar una, dos o las tres dimensiones. Cada eje con su
  candado.
- **Rejilla**: snap configurable (0.5 u de partida — es la escala de las
  coordenadas de los mapas de hoy).
- **Imán entre piezas**: cara contra cara y canto contra canto, con tolerancia.
  Apilar pone la base sobre el techo de la de abajo (`base`), que es el campo que
  el motor ya tiene.
- Giro de 90°.
- **Deshacer/rehacer.** Sobre un historial de definiciones, no de comandos: la
  definición de un mapa es pequeña y serializarla entera por paso es más barato
  y mucho menos frágil que invertir operaciones.
- **Presupuesto**, y se mide en vez de contarse: §5.1.

### Fase 3 — El mapa deja de ser sólo geometría

*Qué hace posible:* que lo que dibujas sea un mapa de duelo completo, con todo
lo que hoy nos pides que escribamos.

- **Salidas** de jugador 1 y 2, con su rumbo, colocadas y giradas a mano.
- **Zona de aparición** (`spawnZone`) como cajas editables — ya lo son.
- **Caja de compra** como área editable, con el global de valor por defecto.
- **Simetría**, y es la decisión de diseño de esta fase: el espejo **no es un
  botón que duplica**, es **una propiedad del mapa**. Se marca «este mapa es
  simétrico», se dibuja media sala y la otra media se genera al montar, con
  `giro180`. Un botón que duplicase una vez dejaría las dos mitades
  desincronizándose en la primera edición posterior — que es justo lo que la
  vuelta 66 evitó no escribiendo cada caja dos veces. Las piezas centradas en el
  origen se marcan como tales, como hoy.
- **Panel de física** (gravedad, salto, techo del aire) y de **dotación**
  (`sinEconomia`, arma, chaleco, casco), o sea el 4.2 que sí es del mapa.

### Fase 4 — Las métricas en vivo, que es el punto del encargo

*Qué hace posible:* validar un mapa tú mismo, sin esperar a que lo midamos.

Aquí no se escribe lógica nueva: se **mueve** la que ya hay en `mapa66.mjs` y
`pilares72.mjs` a `src/game/metricas.js`, funciones puras que reciben un
`Scenario` montado. El panel del editor y los bancos llaman a las mismas. Dos
copias serían un editor que dice verde con el banco en rojo, y la que te
creerías es la que tienes delante.

Lo que enseña, ordenado por lo que más se mira:

1. **Alturas alcanzables**, con la física del mapa: ápice de un salto
   (`jumpSpeed²/2g`), tiempo de vuelo, cuánto avanza un salto al techo del aire,
   y **qué se sube desde el suelo, qué desde cada altura y qué no se sube**. Es
   la métrica que convierte «he dibujado una torre de 3.4» en «no se sube».
2. **Salidas**: distancia, si se ven entre ellas, y si se ve algo entre las
   esquinas de las dos cajas de compra (las 16 líneas de `mapa66`).
3. **Cruzar**: camino real de una salida a otra en unidades y segundos, que
   cueste lo mismo en los dos sentidos, y **primer contacto posible** en
   segundos.
4. **Simetría**: piezas sin su pareja girada, y cuántas centradas.
5. **Solapes**: piezas metidas unas dentro de otras.
6. **Asomo**: cuántos puestos de la otra mitad se ven desde cada extremo, y que
   los dos vean lo mismo.
7. **Caja de compra**: que quepa dentro de los límites de movimiento y no tenga
   piezas dentro.

Con **su denominador siempre al lado** (vuelta 46): «ve 20 de 154», no «ve 20»
— un número solo no dice de cuántos sale, y un 100% sobre cero se lee como un
éxito.

### Fase 5 — Geometría orientada *(sólo si hace falta)*

*Qué hace posible:* rotación libre, tejados sólidos, triángulos que se chocan.

Es la columna derecha de §3 y es **una vuelta suya**, con su propio banco: OBB
en `resolveAxis`, o cajas alineadas más un volumen orientado aparte. La zona que
toca está documentada como un campo de minas de coma flotante —el
`−1.4 + 0.4 = −0.9999999999999999` que dejó de bloquear un muro— así que no se
mete de rebote en una fase de herramientas.

**Propuesta: no hacerla hasta haber construido dos o tres mapas con las fases
1-4** y ver qué es lo que de verdad se echa en falta. Puede que sea esto; puede
que sea una biblioteca de piezas compuestas, que es mucho más barata.

### Fase 6 — Publicar sin reconstruir *(opcional, y es de red)*

Mapas que viajan. Ver §4.1(b). Fuera de este proyecto a propósito.

---

### 5.1 El aviso de presupuesto, y por qué no es contar cajas

Pides aviso si el mapa acumula demasiada geometría. Contar cajas sería el número
fácil y el equivocado: lo que cuesta una caja no es dibujarla —las mallas se
funden por tipo, veinte cajas son cinco llamadas— sino tres cosas distintas:

- **Colisión**: `resolveAxis` recorre **todas** las cajas, por eje y por paso.
- **Visión**: los rayos de `hasLineOfSight` van contra los triángulos de los
  oclusores. Los usan los disparos, los marcadores y la elección de dónde
  aparece un muñeco.
- **Aparición**: el barrido de puntos, que en el peor caso son 68 rayos.

Así que el aviso mide lo que el proyecto presupuesta de verdad: **coste p99 de
un paso de mundo**, ejecutando unos cientos de pasos contra el mapa que tienes
delante, contra el presupuesto documentado (~0.2 ms; un paso con ocho muñecos
cuesta 0.07). Al lado, como denominador: número de cajas y triángulos de
oclusión. Un número medido y su denominador, que es la disciplina de la casa —y
de paso es el único que sigue siendo cierto el día que la colisión cambie.

---

## 6. Lo que esta propuesta deja fuera, a propósito

- **Editar rutas, recogibles y sitios de explosivo.** Son del entrenamiento y
  salen de un barrido medido (`rutas-buscar.mjs`), no de ponerlas a ojo: un
  punto de ruta colocado a mano es un muñeco apareciendo dentro de una pared.
  Lo natural es que el editor **llame a ese barrido** sobre el mapa terminado,
  no que te deje pintarlos. Cabe en la fase 4 como un botón, o después.
- **Texturas, luces, materiales.** No hay ni una luz en la escena y el gris de
  una pieza **es** su altura: es codificación funcional. Un selector de color
  rompería lo único que hace legible el mapa.
- **Los parámetros de partida** (§4.2), que no son del mapa.
- **Mapas que viajan** (§4.1b).

## 7. Riesgos, en orden

1. **Ofrecer una forma antes que su colisión** (§3). Es el único riesgo que
   produce mapas rotos en vez de trabajo de más, y la regla de §3 existe para él.
2. **Que el formato del editor no sea el del juego.** Se cierra en la fase 1 con
   la prueba de abrir y volver a guardar los cuatro mapas de hoy sin que cambie
   un dígito.
3. **Que las métricas del panel y las de los bancos se despeguen.** Se cierra con
   `src/game/metricas.js` y una sola implementación.
4. **Que el editor engorde el juego.** Se cierra sacándolo de `dist/` en la
   fase 1.

---

## 8. Lo que cambió al construir la fase 1 (vuelta 74)

El diseño se sostuvo entero. Lo que se aprendió construyéndolo:

**Lo que se hizo**, y es lo que la fase 1 prometía: los tres puntos de §2
(`Scenario`, `scenarioRoom` y `fisicaDeEscenario` aceptan una definición),
`src/maps/*.js` fundidos en `SCENARIOS`, `/editor/` como tercera página **fuera
de `dist/`**, cajas con imán a la rejilla y edición por número, giro de 90°,
abrir los cuatro mapas de hoy, guardar, y **probar con el motor completo**.

**Lo que se movió de sitio:** el registro de mapas iba a salir de
`import.meta.glob` y no puede: `vite.config.js` importa `src/config.js`, y el
huésped de Node también, así que el registro tiene que ser un módulo con
importaciones estáticas. Lo genera el editor al guardar y el servidor de
desarrollo al arrancar, como `weaponPaths.js`.

**Tres fallos que el diseño no vio** (el detalle en `docs/decisions.md` §74.5):

1. **`Scenario.room` y `Scenario.fisica` preguntaban por la clave**, no por la
   definición. Un mapa sin guardar se probaba con la sala de la sala vacía y la
   gravedad de fábrica, en silencio. Es la mitad invisible de §2.
2. **Un mapa sin `boxes` tumbaba el montaje de la escena entera.** Con cuatro
   escenarios escritos a mano no podía pasar; con ficheros, sí.
3. **Un bucle infinito de reinicios del servidor de desarrollo**, porque el
   registro cae dentro del grafo de la configuración de Vite. El síntoma fue la
   batería entera con «0 pass» y la primera hipótesis fue la equivocada. Se
   corta escribiendo el registro **sólo si cambia**.

**Lo que sigue en pie sin tocar:** la regla de §3 —el editor no puede poder
construir algo contra lo que el motor no sepa chocar—, el reparto de formas, las
fases 2 a 5 y la 6 fuera de alcance.

**Y una medida que la fase 1 deja lista para la 4:** el paseo de prueba ya se
mide contra el mapa editado —5.88 u/s de marcha sostenida contra el reloj del
mundo, parada en z 8.400 contra una cara en 8.0— con las mismas funciones que
usará el panel de métricas.

---

## 9. Lo que se añadió después de la fase 1: historial de versiones (vuelta 75)

No estaba en el plan y se pidió al probarla: poder volver a una versión anterior
de un mapa sin romperlo. Entra aquí y no en la fase 2 porque es **la red debajo
de todo lo demás** — construir con confianza pide poder deshacer lo construido.

**Lo que se descartó, y es lo que parecía obvio:** hacerlo con git. Guardar con
un comentario, listar por fecha y volver atrás *es* git. La razón de no usarlo
no es técnica: la historia de este repositorio está curada y cuarenta commits de
«he movido una caja» la degradarían. Son dos cosas con lectores distintos — la
historia del repo es un artefacto, la de un mapa mientras se construye es
material de trabajo. El historial es un fichero al lado del mapa y git lo hace
duradero **al ritmo de quien commitea**.

**Y restaurar carga, no escribe.** La versión se pone delante en el editor y se
vuelve la del disco al guardar, con lo que volver atrás no puede romper el mapa
y queda como una versión más, nunca como un borrado.

De paso cerró tres cosas de la fase 1 que estaban mal y no se habían visto:

1. **Guardar te dejaba delante de un mapa en blanco.** La recarga que provoca
   escribir un mapa llegaba antes de que el servidor sirviera el registro nuevo.
   Lo cruza un relevo por `sessionStorage`, y la dirección lleva el mapa abierto.
2. **`vite.config.js` importaba `src/config.js`**, así que cada mapa era una
   dependencia de la configuración: guardar reiniciaba el servidor entero y, con
   el registro roto, **el servidor no podía ni arrancar** — y lo único que podía
   curarlo vivía dentro. Ahora no importa nada de `src/`.
3. **El módulo lo escribía el navegador.** La página mandaba el texto del
   fichero y el servidor lo volcaba: un punto de escritura arbitraria y una
   segunda idea de cómo se serializa un mapa. Ahora viaja el dato y el fichero
   sale de `mapaComoModulo`, la misma función que usa el editor.

Nada de esto cambia el plan: las fases 2 a 5 siguen como estaban.

---

## 10. La fase 2, construida (vuelta 76)

Se construyó tal como estaba planteada —menú de formas, candados por eje,
rejilla e imán, giro de 90°, deshacer/rehacer y presupuesto— y con ella los
siete ajustes que salieron de usar la fase 1 jugando. Lo que sigue es lo que
**no** se pudo hacer como estaba escrito, que es de lo único que hay que
acordarse.

### 10.1 El presupuesto: el instrumento se midió antes de creérselo

Estaba escrito «se mide en vez de contarse», y eso era lo correcto. Lo que no
se había previsto es que **un paso de mundo no se puede cronometrar en un
navegador**: `performance.now()` viene acotado a 100 µs fuera de un contexto
aislado y un paso contra diecisiete cajas cuesta mucho menos.

Costó tres versiones, y las dos primeras salían verdes midiendo el reloj:

| Versión | Qué medía | Qué decía |
|---|---|---|
| Paso a paso, p99 de 400 | un paso | **0.000 ms en Los Pilares** — un mapa entero a cero |
| Bloques de 25, p99 de 40 | 25 pasos | **0.0010 con 0 piezas y 0.0010 con 600** |
| Total de 2000 pasos, media | la tanda entera | 0 piezas 0.0000 · 200 0.0001 · **1500 0.0004** |

Sólo la tercera responde a lo que se le pone delante, y por eso es la que se
compara con el presupuesto; el peor bloque se enseña al lado, cuantizado y
dicho. Es la regla de la vuelta 46 —una proporción necesita que se vea su
denominador— aplicada al cronómetro, y la del 62 —cinco disparos y la mediana—
por la misma puerta.

**Y el resultado de medirlo cambia para qué sirve el panel.** Con colisión AABB
y mallas fundidas por tipo, **un mapa no puede romper el presupuesto por
geometría**: 1500 piezas cuestan 0.0004 ms por paso contra los 0.2 de
presupuesto y los 0.07 que cuesta un paso real con ocho muñecos. Así que el
aviso es un cortafuegos para el día que una pieza cueste de verdad —un vano, un
tejado, una rotación libre— y lo que el panel hace hoy es **enseñar lo que
cuesta tu mapa**, que ya era lo que faltaba. Conviene no confundir las dos cosas
al leerlo.

### 10.2 «Sin muñecos» no es un mapa sin rutas

La primera versión del interruptor quitaba las rutas al mapa antes de montarlo,
razonando que dónde nace un muñeco sale de ellas. **Es falso, y el banco lo cazó
a la primera**: sin rutas las dianas no desaparecen, se muestrean por cono como
en la sala vacía. Salía una igual.

Lo correcto es que **si un mundo tiene muñecos es del mundo**, y entra por la
misma puerta que el escenario: `new Engine(…, { escenario, dianas })`. Es la
puerta de la vuelta 60, y por su mismo motivo — la alternativa era escribir
`simultaneousTargets` en el store del jugador, o sea reescribirle sus ajustes
por abrir el editor.

### 10.3 «Base» era un desplegable y no se entendía

Tenía razón el encargo. Lo que uno quiere al apilar es poner una caja encima de
otra, y con un menú de nombres de alturas (`media`, `alta`) eso hay que
deducirlo. Ahora son **dos controles y una frase**: un número —desde qué altura
empieza la pieza— y un botón que la apoya en el techo de lo que tenga debajo.

Y subir una pieza la sube **entera**: mover sólo la base la aplastaría contra su
propio techo hasta hacerla desaparecer, que es lo que hacía la primera versión
del campo numérico.

### 10.4 WASD no puede pedir el botón del ratón

La fase 1 dejó el vuelo detrás del botón derecho para no robarle las teclas a
quien escribe una clave en el panel. Usándolo se ve que el precio es alto: se
mira una esquina, se suelta, y para acercarse hay que volver a agarrar.

Las dos condiciones que de verdad hacían falta son **el puntero sobre la vista**
y **el foco fuera de un campo**, y el botón las cumplía de rebote. Es
`typingInField` (vuelta 56) en esta página: el editor sí tiene campos de texto,
así que la pregunta «¿esto es escribir o es jugar?» hay que contestarla.

### 10.5 Y el tamaño de la sala ya tenía tope, pero no se veía

`SALA` acota el ancho y el fondo a 10–200 u y el alto a 4–60 desde la fase 1, y
lo aplica el mismo saneado que lee un mapa al montarlo — así que un número fuera
de rango no llega al juego venga del editor o de un fichero escrito a mano. Lo
que faltaba era **decirlo en la pantalla**, y que los campos lo lleven en su
`min`/`max`.

**No se ató al presupuesto, y no debe atarse:** son dos límites distintos. El de
la sala es duro y del formato; el presupuesto es una medida de lo que cuesta la
colisión. Una sala de 200×200 con cuatro cajas es barata y una de 40×40 con
cuatrocientas no lo sería — derivar uno del otro mentiría en los dos sentidos.

### 10.6 El borrador ya no manda sobre la dirección

Un borrador de **otro** mapa se ignora si la barra pide uno concreto. Sin esto,
`/editor/#pilares` abría lo último que se hubiera tocado y no había forma de
decir cuál se quiere.
