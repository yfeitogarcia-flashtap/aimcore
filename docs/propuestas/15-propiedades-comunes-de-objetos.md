# Propuesta 15 — Propiedades comunes de todo lo colocable en Alchemist

**Estado:** **propuesta, sin construir nada.** Escrita en la vuelta 107 a
petición de Yago: que todo lo que se coloca en un mapa pueda decir, con los
mismos cuatro controles,

- **a quién afecta**: a todos, al equipo A, al equipo B o al jugador de la salida N;
- **cuándo está activo**: siempre, en la fase de compra, durante la ronda, desde
  el segundo X, hasta el segundo X;
- **cuántas veces se usa**: sin límite, N por jugador, N en total, N por ronda;
- **quién lo ve**: todos, su equipo o nadie;

y, **para las peanas en concreto**, con qué munición entregan el arma (cargador y
reserva) y si **se desvanecen X segundos** tras cogerlas.

Lo primero que hace esta propuesta es lo que hizo la 05 con el editor y la 10 con
las capas: **inventariar antes de diseñar** (§1). La tabla cambia el tamaño del
encargo, porque dice que **la mitad de las filas no admiten ninguna de las cuatro
propiedades** y que, de las que sí, cada propiedad cuesta cosas muy distintas en
red.

---

## 0. La respuesta corta

**Cuatro campos opcionales con el mismo nombre en cada objeto que *hace algo*, y
ni un byte nuevo en los mapas de hoy.**

```js
// en un teletransporte, una tirolina, un ventilador, una peana, una pieza con
// dispositivo o una barrera — y en nada más:
afecta: { bando: 0 },                       // o { salida: 3 }; sin campo = todos
activo: { fase: 'compra' },                 // o { fase: 'ronda', desde: 20, hasta: 90 }; sin campo = siempre
usos:   { n: 2, cuenta: 'jugador', repone: 'ronda' },   // sin campo = sin límite
ve:     'bando',                            // 'nadie'; sin campo = todos
```

| Fase | Qué | Qué viaja por la red | Horas |
|---|---|---|---|
| **1** · A quién afecta | Bando o salida en dispositivos, barreras y peanas | **Nada**: el bando ya va en la bienvenida | 20–28 |
| **2** · Peanas: munición y desvanecerse | La fase 4 de la propuesta 08, más la munición | Un aviso cuando una peana se apaga o vuelve | 16–22 |
| **3** · Cuándo está activo | Por fase y por segundo de la fase; **puertas** con barreras | **Un número por fase**: el paso en que empezó | 22–30 |
| **4** · Quién lo ve | Dibujar o no, por bando | Nada, y **no es un secreto** (§5.4) | 8–12 |
| **5** · Cuántas veces | Por jugador y por ronda; «en total» sólo en peanas | Un contador en la foto propia cuando no vale lo de fábrica | 18–26 |

Tres cosas que salen de la auditoría y deciden el diseño:

- **Estas propiedades son de lo que *hace algo* al jugador**, no de la geometría.
  Una caja que sólo existe para el equipo A es una pared que para las balas de
  todos y el cuerpo de unos (o al revés): dos respuestas a «contra qué choca
  esto», que es el fallo de la vuelta 96 con las barreras. La excepción útil son
  **las barreras**, que ya están fuera de `occluders` y de lo que vuela: una
  barrera «sólo para B» o «sólo en la compra» es **una puerta de salida**, que es
  justo lo que un mapa de equipos pide.
- **«Quién lo ve» nunca puede ser más estrecho que «a quién afecta».** Es la
  regla de la vuelta 80 —*una superficie que no se ve es una trampa*— escrita como
  invariante del saneado (§5.4).
- **«N en total» es la única propiedad que crea estado compartido que cambia
  durante la partida**, y en un dispositivo de movimiento eso es una corrección
  por paso cuando dos jugadores lo usan a la vez. Se admite en peanas —donde el
  servidor ya valida y el cliente no predice (vuelta 106)— y **no** en lo que
  mueve el cuerpo (§5.5).

---

## 1. La auditoría: qué se puede colocar hoy

Sale de `CAMPOS` y `sanearMapa` (`src/maps/formato.js`) y de `TIPOS_DE_MAPA`
(`editor/editor.js`). Las columnas son las cuatro propiedades pedidas, contestadas
**para hoy**: cómo se comporta cada cosa sin tocar nada.

### 1.1 Lo colocable en Alchemist

| Tipo (campo) | Qué es | A quién afecta hoy | Cuándo está activo | Cuántas veces | Quién lo ve | Campos |
|---|---|---|---|---|---|---|
| **Pieza** (`boxes`) | Caja alineada a los ejes. La geometría del mapa | A todos: cuerpo, balas, vista (`occluders`) y lo que vuela (`cortarSegmento`) | Siempre | Sin límite | Todos (gris por altura, vuelta 40) | `x z w d kind base? barrera? tinte? superficie?` |
| **· con `superficie: rebote`** | Te lanza hacia arriba al pisarla | A todos, en los dos extremos (`movement.js`) | Siempre, al pisar (andando o cayendo, vuelta 80) | Sin límite | Todos: muelles amarillos; la losa no se dibuja por debajo de 0.25 (vuelta 84) | `tipo fuerza invisible?` |
| **· con `superficie: velocidad`** | Te lanza en un rumbo | Igual | Igual | Sin límite | Galones amarillos; sin destello (vuelta 84) | `tipo fuerza rumbo salto invisible?` |
| **· con `superficie: hielo`** | Suelo con velocidad propia | Igual | Igual | Sin límite | Marca amarilla | `tipo fuerza` (rozamiento) `invisible?` |
| **· con `barrera`** | Límite para el cuerpo | Sólo el cuerpo: ni balas, ni vista, ni lo que vuela (vueltas 95 y 96) | Siempre | — | `cristal`: todos (arista). `invisible`: nadie en el juego; contorno en Alchemist | `barrera` (sin tinte ni superficie) |
| **Prisma** (`prismas`) | Sólido convexo de N caras; con 4, caja girada (vuelta 83) | Como una pieza | Siempre | — | Todos | los de una pieza + `lados giro` (`x z` es el centro) |
| **Rampa** (`ramps`) | Cuña sólida por arriba, en X o en Z (vuelta 93) | Como una pieza | Siempre | — | Todos | `x z w d fromZ/toZ o fromX/toX top tinte?` |
| **Tubo** (`tubos`) | Macro: pozo redondo desplegado en cajas (vuelta 81) | Como una pieza | Siempre | — | Todos | `x z radio grosor caras alto base` |
| **Escalera** (`escaleras`) | Macro: escalones que se suben andando (vuelta 93) | Como una pieza | Siempre | — | Todos | `x z ancho alto escalones huella rumbo base tinte?` |
| **Estampado** (`estampados`) | Logo a color en un plano suelto (vuelta 93) | **A nadie**: sin colisión, sin rayos, no se monta en Node | Siempre | — | Todos (sólo cliente; nace invisible hasta que llega la imagen) | `imagen cara x y z ancho alto giro?` |
| **Ventilador** (`ventiladores`) | Volumen que cambia tu gravedad (vuelta 83) | A todos los que estén dentro, en los dos extremos | Siempre, estando dentro (también de pie) | Sin límite | Todos (marca) | `x z w d base alto fuerza` |
| **Tirolina** (`tirolinas`) | Cable de un sentido de A a B (vuelta 83) | A quien pulsa E al alcance; sin tope de ocupantes | Siempre | Sin límite | Todos (cable azul, vuelta 84) | `desde{x y z} hasta{x y z} velocidad` |
| **Teletransporte** (`teletransportes`) | Área que te lleva a un destino con rumbo (vuelta 80) | A todos al **entrar** (por flanco), en los dos extremos | Siempre | Sin límite | Todos (anillo en los dos extremos); el de un rival **se oye** (vuelta 82) | `x z w d destino{x z yaw}` |
| **Peana** (`peanas`) | Arma en el suelo; apuntar y E (vuelta 106) | A quien la apunta, vivo, en modo Peanas; el servidor valida | Siempre; no se agota | Sin límite, por cualquiera a la vez | Todos: silueta plana y ficha con línea de visión, de 4 a 22 u | `x z arma` |
| **Salida de duelo** (`duelo.salidas`) | Punto con rumbo; dos en un mapa de duelo | A la ranura/bando N; en equipos, también a sus compañeros al lado (vuelta 101) | Al empezar cada ronda y al reaparecer sin rondas | — | Nadie en el juego; cono del color del equipo en Alchemist | `x z yaw` |
| **Salida de todos** (`todos.salidas`) | Punto con rumbo; de 3 a 10 | A la ranura N **sólo al entrar**: reaparecer usa la más lejana del vivo más cercano (vuelta 100) | Al entrar y al reaparecer | — | Nadie en el juego; cono blanco en Alchemist | `x z yaw` |
| **Caja de compra** (`duelo.cajaCompra`) | Corralito alrededor de cada salida | A cada jugador, en la de su bando | **Sólo en la fase de compra** (vuelta 62) | — | Nadie: no tiene malla, se nota chocando | `ancho fondo` |
| **Zona de aparición** (`spawnZone`) | Banda donde no nacen ni patrullan muñecos (vuelta 43) | A los muñecos del entrenamiento | Siempre, sólo entrenando | — | Nadie en el juego | lista de `x z w d` |

### 1.2 Lo que no se coloca en Alchemist, y por qué no entra aquí

| Campo | Por qué queda fuera |
|---|---|
| `spawn` | El punto del jugador del entrenamiento. Un solo punto, siempre suyo |
| `fondo`, `room`, `fisica` | Son **del mapa**, no de un objeto: la física de la vuelta 72 es el ejemplo de por qué un mapa no puede tener dos |
| `duelo.invulnerabilidadMs`, `sinEconomia`, `dotacion`, `reglas` | Reglas de partida, no objetos. `reglas` ya decide qué armas y cómo (vuelta 106) |
| `pickups`, `objectiveSites`, `routes`, `anchors` | Salen de un barrido medido, no se colocan a ojo, y Alchemist los conserva tal cual (CLAUDE.md §6). Los recogibles **ya tienen reaparición** (`PICKUPS.respawnMs`, 15 s), que es el precedente de «desvanecerse» |

### 1.3 Lo que dice la tabla

- **Cinco tipos son geometría** (pieza, prisma, rampa, tubo, escalera): afectan a
  todos, siempre, y de ellos cuelgan la colisión, la vista, las balas y lo que
  vuela. **No admiten ninguna de las cuatro propiedades** (§2).
- **Uno no afecta a nadie** (estampado): sólo admite «quién lo ve».
- **Seis *hacen algo*** (las tres superficies, ventilador, tirolina,
  teletransporte) **más la barrera y la peana**: ésos son los que reciben las
  cuatro.
- **Las salidas y la caja de compra ya tienen «a quién» y «cuándo» por
  construcción**, así que no se les añade nada: una salida es de la ranura N
  porque se llama así.
- **Todo lo que hace algo al cuerpo está hoy en `movement.js` y corre en los dos
  extremos**, y **la peana es la única cosa del mapa que valida el servidor**.
  Ésa es la línea que decide qué cuesta cada propiedad en red.

---

## 2. Quién admite qué

| | afecta | activo | usos | ve |
|---|---|---|---|---|
| Rebote, velocidad, hielo | sí | sí | sí (no «en total») | sí |
| Ventilador | sí | sí | — (§5.5) | sí |
| Tirolina | sí | sí | sí (no «en total») | sí |
| Teletransporte | sí | sí | sí (no «en total») | sí |
| **Barrera** | sí | sí | — | ya lo decide su acabado |
| **Peana** | sí | sí | sí, **también «en total»** | sí |
| Estampado | — | — | — | sí |
| Pieza, prisma, rampa, tubo, escalera | — | — | — | — |
| Salidas, caja de compra, zona de aparición | — (ya lo tienen) | — | — | — |

**Por qué la geometría no**, con los tres casos que se piensan primero:

- **«Una pared sólo para el equipo A»** son dos respuestas a «¿se choca esto?»:
  una para el cuerpo (por bando) y otra para las balas (para todos, porque
  `occluders` no sabe de bandos). Es exactamente lo que la vuelta 96 arregló en
  las barreras al descubrir que paraban flechas y no balas.
- **«Una caja que desaparece a los 30 s»** cambia a mitad de ronda la vista de la
  que cuelgan la brújula, la aparición de muñecos, el destello del Titan, el rayo
  del disparo y la foto por destinatario (`net/interes.js`). Y rompe las mallas
  fundidas por altura (vuelta 40): un montón no se apaga a trozos.
- **Lo que sí se quiere de esos dos casos es una puerta**, y una puerta **es** una
  barrera activa sólo en la fase de compra, o sólo para el bando contrario. La
  barrera ya está fuera de `occluders` y de `cortarSegmento`, ya va en su propio
  montón de dibujo, y ya contesta sólo `resolveAxis` y `groundHeightAt`. Darle
  «cuándo» y «a quién» es darle una condición a dos preguntas que ya hace.

Y los dispositivos hay que decirlo así en Alchemist: las propiedades de una pieza
con superficie **son de su superficie**, no de la caja. La caja se sigue chocando
para todos: lo que se restringe es el empujón.

---

## 3. El dato

Cuatro campos **en el propio objeto**, con el mismo nombre en todos, y siempre
**después** de los que ya tiene:

```js
{ x: 4, z: -6, w: 3, d: 3, destino: { x: 18, z: 12, yaw: 1.57 },
  afecta: { bando: 1 },
  activo: { fase: 'compra' },
  usos: { n: 1, cuenta: 'jugador', repone: 'ronda' },
  ve: 'bando' }
```

**`afecta`** — sin campo, todos. `{ bando: 0 }` o `{ bando: 1 }` (en Alchemist,
«Equipo A» y «Equipo B», con el color de `TEAMS`), o `{ salida: n }`, que es la
ranura. **No se escribe un `'todos'`**: lo que vale lo de fábrica no se escribe.

**`activo`** — sin campo, siempre. `fase`: `'compra'` o `'ronda'` (sin `fase`,
toda la partida); `desde` y `hasta`, en segundos **desde que empezó esa fase**.

**`usos`** — sin campo, sin límite. Dos ejes, porque las tres opciones del encargo
son tres casillas de una tabla de seis:

| | `repone: 'nunca'` | `'ronda'` | `'vida'` |
|---|---|---|---|
| **`cuenta: 'jugador'`** | N por jugador y partida | N por jugador y ronda | N por jugador y vida |
| **`cuenta: 'total'`** | N en total | **N por ronda** entre todos | — (no tiene sentido: ¿la vida de quién?) |

**`ve`** — sin campo, todos. `'bando'` (el de `afecta`) o `'nadie'`.

**Y las peanas, dos campos suyos**:

```js
{ x: 0, z: 2, arma: 'u2', municion: { cargador: 1, reserva: 1 }, desvanece: 12 }
```

Cinco reglas del formato, todas conocidas:

- **Lo que vale su valor de fábrica no se escribe** (vuelta 83). Los mapas de hoy
  **no cambian ni un byte**: ninguno declara ninguno de los seis campos, y el
  saneado no los inventa.
- **El saneado es un punto fijo, también en el orden de las claves.** Los campos
  se emiten en el orden `afecta, activo, usos, ve` (y en una peana, `municion,
  desvanece` antes de ellos), después de todo lo que el objeto ya tenía. En una
  pieza, detrás de `superficie`. De eso cuelga que deshacer/rehacer compare dos
  mapas con un `JSON.stringify`.
- **Lo que el saneado tira, lo dice** (vuelta 74). Un `afecta` en una caja sin
  dispositivo ni barrera, un `usos` en un ventilador, un `ve` más estrecho que su
  `afecta` o un `cuenta: 'total'` en un dispositivo de movimiento se quitan
  **diciéndolo**, y el objeto se queda. Una propiedad mal escrita no tira el
  teletransporte, igual que una superficie mal escrita no tira su pieza (vuelta 80).
- **Una propiedad que no significa nada en un modo se apaga, no se borra.** Un
  `{ bando: 1 }` en un mapa publicado también para el todos contra todos no se
  quita al guardar: se avisa (§6) y el juego decide qué hace ahí (§4).
- **Topes del formato**, como los de `SALA`: `usos.n` de 1 a 99, `desde`/`hasta`
  de 0 a 3600 s, `desvanece` de 1 a 300 s. Existen para que un fichero corrupto
  no meta un número absurdo, no para decidir a qué se juega.

### 3.1 La identidad de los objetos, que la propuesta 10 dejó pendiente

La propuesta 10 (§2.1) dice que un elemento **no tiene nombre**: se identifica por
su posición en su lista, y borrar uno renumera los demás. Eso bloquea agrupar y
bloquear. **Esto no lo necesita**, y conviene ver por qué para no pagarlo de más:

- **Las cuatro propiedades son campos del propio objeto, no referencias a otro.**
  Un teletransporte que dice `afecta: { bando: 1 }` no apunta a nada; borrar la
  pieza 3 no le cambia el significado.
- **En partida el mapa no cambia**, así que el índice sí es identidad estable
  mientras dura. Es lo que ya hace `MSG.RECOGER { i }` con las peanas: los dos
  extremos derivan el mismo índice del mismo fichero sin que viaje nada (vuelta
  106). Los contadores de §5.5 y el estado de «desvanecida» de §5.2 se indexan
  igual.
- **Lo que sí lo pediría** es la tentación siguiente: «este teletransporte se
  activa cuando alguien coge aquella peana», «esta puerta se abre cuando se pulsa
  aquel botón». Eso es una **referencia**, y una referencia por índice apunta a
  otro objeto en cuanto se borra uno anterior. **Queda fuera de esta propuesta**
  y, el día que se quiera, llega con la fase 2 de la 10 (un `id` en el formato),
  no antes.

Y una comodidad que sí se pide sin ids: **aplicar una propiedad a varios a la
vez**. Con la multiselección de Alchemist basta; los grupos de la 10 lo harían
permanente, y son su propio precio.

---

## 4. Qué significa cada valor en cada modo

`afecta` y `activo` dependen de cosas que cambian de un modo a otro: si hay
bandos, si hay rondas, si hay fase de compra. La tabla, para que nadie la
adivine:

| | Entrenamiento | Duelo | Equipos (2v2–5v5) | Todos contra todos |
|---|---|---|---|---|
| `afecta: { bando }` | **No aplica** a nadie | Ranura = bando | El bando | **No aplica** a nadie |
| `afecta: { salida: n }` | No aplica | Ranura n | **El bando** de la salida n (las salidas de equipos son del bando, vuelta 101) | Ranura n |
| `activo.fase: 'compra'` | Nunca activo | Si la sala tiene fase de compra | Igual | Nunca activo (no hay compra) |
| `activo.fase: 'ronda'` | La sesión | La ronda | La ronda | La partida |
| `usos.repone: 'ronda'` | La sesión | La ronda | La ronda | **Como `'nunca'`** |

**«No aplica» quiere decir que no le hace nada a nadie**, y se eligió contra la
alternativa —que valga para todos— por una razón: un teletransporte del equipo A
es una ruta que el mapa le da a un bando, y abrírsela a los diez jugadores de un
todos contra todos es un mapa distinto que nadie diseñó. Apagado, lo peor que pasa
es que un atajo no está. Y Alchemist lo avisa antes de guardar (§6).

**Una trampa que hay que ver**: `activo.fase: 'compra'` en una sala **creada sin
fase de compra** no se activa nunca, y la fase de compra **la elige quien crea la
sala**, no el mapa (vuelta 64). El mapa no puede saberlo. Alchemist lo dice en la
ficha («sólo se activa si la sala tiene fase de compra»), y un mapa que reparte
(`sinEconomia`, vuelta 72) nunca la tiene: ahí sí es un aviso naranja.

---

## 5. Cómo encaja cada propiedad con la red

La regla de fondo, la de la física de la vuelta 72 y los dispositivos de la 80 y
la 83: **no viaja ningún número que los dos extremos puedan derivar del mapa.**
Cada propiedad se mira contra eso.

### 5.1 A quién afecta: nada nuevo viaja

**El bando ya está en la bienvenida** (`bando`, vuelta 101) y la ranura también.
Así que el movimiento recibe una línea más al entrar —`movement.setBando(bando,
ranura)`— y a partir de ahí `teletransporteEn`, `superficieDelSuelo`, los
ventiladores y el alcance de la tirolina preguntan **«¿y a éste le afecta?»**
antes de devolver nada. El servidor hace lo mismo con cada `Partida`.

- **Seguro en red por lo de siempre**: los dos extremos montan el mismo mapa y
  saben el mismo bando, así que derivan la misma respuesta. El cliente **predice**
  un teletransporte «sólo para el equipo A» exactamente como uno para todos.
- **El bando no cambia durante una partida** (es `ranura % 2`), así que no va en
  `snapshot()`: un campo que no cambia no es estado del movimiento.
- **Una barrera por bando** se decide en `resolveAxis` y `groundHeightAt` con la
  misma pregunta. `cortarSegmento` no cambia: una barrera ya no para lo que vuela.
- **La puerta de un rival se sigue oyendo** (vuelta 82): el cliente la deduce de
  que cambió su época y de que de donde saltó había un área. Con áreas por bando,
  esa búsqueda pregunta además por **el bando del rival**, que viaja en su entrada
  de la foto (`bd`). Sin eso, un teletransporte del bando contrario que el rival no
  puede usar se oiría igual. El oído no se apaga por el `ve` del objeto: lo que
  suena es el jugador (vuelta 73).
- **Y en el entrenamiento hay que decidir quién es uno**: sin bando (`null`), como
  en el todos contra todos. Ver §4.

### 5.2 Peanas: munición y desvanecerse

**La munición.** Hoy una peana entrega el arma **con la munición de comprarla**
(vuelta 106). `municion.cargador` y `municion.reserva` cambian eso, acotados
contra el arma: el cargador no pasa de su `magazine`.

**Y aquí hay un hueco que conviene ver antes de prometer nada**: **casi ninguna
arma tiene reserva**. Desde la vuelta 86 la reserva existe sólo en el U2, las
granadas y el Fang; todo lo demás **recarga infinito**. Así que «reserva: 30» en
una peana de Rift no es un número más: es **estrenar la munición finita en las
armas de bala**, que cambia cómo se juega cada una, y encima **el HUD no dibuja la
reserva** (el residuo anotado en la vuelta 90). Se propone:

- **`cargador` en todas**; **`reserva` sólo en las que ya la tienen**. En una
  Rift, el campo se tira diciéndolo («la Rift no tiene reserva: recarga sin
  límite»).
- **Munición finita para las armas de bala es otra decisión**, con su contador en
  el HUD delante. No se cuela por la ficha de una peana.

**Desvanecerse** es la fase 4 de la propuesta 08, que sigue sin construir, y
viene con la forma que ya tenía allí: cogerla la apaga `desvanece` segundos **para
todos**, y vuelve sola. Es el primer estado de una peana que cambia durante la
partida, así que:

- **Lo lleva el servidor** y lo cuenta con el **número de paso**, no con el reloj
  de pared: en pausa no corre (vuelta 54).
- **Viaja como aviso cuando cambia** (apagada / encendida, con el índice), por
  destinatario: el patrón de `MSG.CLAVADA` con los cuchillos del Fang (vuelta
  90). No va en la foto porque cambia cada muchos segundos.
- **El cliente no lo predice**, como no predice el Fang: coger ya es una petición
  que el servidor contesta (`MSG.RECOGER`), y la peana se apaga en tu pantalla con
  la respuesta. Un viaje, que no se nota en algo que está quieto.
- **Empezar una ronda las enciende todas**, como limpia el suelo de cuchillos.
- **En el entrenamiento** el motor hace de servidor de sí mismo, y el reloj es
  `engine.gameTime`.

### 5.3 Cuándo está activo: un número por fase

**Aquí sí viaja algo, y hay que decir por qué no rompe la regla.** Para saber si
un teletransporte con `desde: 20` está activo en el paso *n*, el cliente necesita
saber **en qué paso empezó la ronda**, y eso **no sale del mapa**: lo decide el
servidor cuando acaba la compra (o cuando todos dicen «listo», vuelta 102). Hoy
la foto lleva **cuánto queda** de la fase (`rd.resta`, en milisegundos), que es lo
que necesita un reloj en pantalla, y no **dónde empezó**, que es lo que necesita
una predicción.

- Se añade **`rd.p0`, el paso en que empezó la fase**: un número por fase, en la
  misma entrada `rd` de la foto que ya va, y lo mismo en `td` para el todos contra
  todos. No es un número derivable del mapa: es la única forma de que los dos
  extremos pregunten «¿ha pasado el segundo 20?» contra el mismo reloj, que es el
  número de paso (vuelta 45).
- **Sin él funcionaría a medias**: el cliente estimaría el inicio con `resta`, se
  equivocaría en un paso o dos, y en el instante exacto de abrirse la puerta
  habría **una corrección**. Es barato de evitar, así que se evita.
- **El cambio de fase ya tira la cola sin confirmar** (vuelta 62), así que una
  barrera «sólo en compra» que desaparece al empezar la ronda no puede sacar a
  nadie andando de su caja: es exactamente el corralito, que ya funciona así.
- **La geometría no cambia a mitad de ronda**, y por eso esto sólo vale para
  dispositivos y barreras (§2): ninguno toca `occluders`.
- **El dibujo**: una barrera de cristal que se apaga necesita su propio montón de
  dibujo por condición (hoy las barreras de un mapa son **una** llamada). Son unas
  pocas llamadas más por mapa, no por pieza.

### 5.4 Quién lo ve: una decisión de dibujo, y no un secreto

**Lo primero, dicho sin rodeos: `ve: 'bando'` no esconde nada de quien quiera
mirar.** El mapa entero va en el build (los mapas son módulos de `src/maps/`), así
que un cliente modificado dibuja el teletransporte del otro equipo aunque el
fichero diga que no se ve. **No se parece a la foto por destinatario** de
`net/interes.js`, que sí es un secreto: lo que no te llega no lo puede enseñar un
programa de trampas (vuelta 100). Esto es **legibilidad**: no llenarle la pantalla
al equipo B de marcas que no le hacen nada.

**Lo que sí puede ser secreto es el estado**: si una peana del equipo A está
desvanecida o cuántos usos le quedan a su teletransporte. Eso lo manda el
servidor (§5.2 y §5.5), y lo manda **sólo a quien lo ve**, con la misma pregunta
que decide la foto. Ésa es la parte de esta propiedad que encaja de verdad con
`interes.js`.

**Y la regla que no se negocia: lo que te afecta, lo ves.** Es la de la vuelta 80
—*una superficie que no se ve es una trampa*— y la de la barrera invisible, que
**no se ve en el juego pero se choca siempre igual y lo dice su ficha** (vuelta
95). Escrita como invariante del saneado:

- `ve` nunca más estrecho que `afecta`. `afecta: todos` con `ve: 'bando'` se tira
  diciéndolo: sería un dispositivo que al equipo B le lanza por los aires sin que
  lo haya podido ver.
- **`ve: 'nadie'` sólo es admisible en lo que no afecta a nadie de otro modo**, y
  en los dispositivos queda como está hoy: `superficie.invisible` quita la losa
  **y deja la marca** (vuelta 82). Así que en la práctica `'nadie'` sirve para un
  estampado y para poco más; se admite por uniformidad y Alchemist lo dice.
- **Los sonidos no los apaga `ve`** (§5.1): el oído dice que alguien ha hecho
  algo, no que exista el objeto.

### 5.5 Cuántas veces: el único estado que cambia por usarlo

Aquí está la propiedad cara, y lo es por **quién cuenta**:

- **`cuenta: 'jugador'`** es estado **de cada uno**, y lo derivan los dos extremos
  igual si cuentan los mismos pasos: es exactamente como la tirolina (vuelta 83),
  cuyos campos viajan en `snapshot()`. Así que los contadores por jugador van en
  el movimiento, **indexados por el índice del objeto**, y en la foto **sólo
  cuando no valen lo de fábrica** (vuelta 83: 575 B por foto y `red45` mirando).
  El cliente lo predice y la reconciliación lo corrige como corrige una posición.
- **`cuenta: 'total'`** es estado **compartido**: si dos jugadores pisan a la vez
  un rebote de un solo uso, **el servidor elige y uno de los dos clientes predijo
  mal** — un salto que no ocurrió y una corrección del tamaño del salto. Es la
  carrera que la propuesta 08 evitó a propósito con las peanas que no se agotan.
  Por eso **«en total» sólo se admite en peanas**, donde el servidor ya valida
  cada recogida y el cliente no predice nada: se agota, se avisa como en §5.2, y
  a quien llega tarde se le dice «ya no queda».
- **`repone: 'vida'`** cuelga de la reaparición, que en red ya es un
  teletransporte que decide el servidor en el reloj de las entradas (vuelta 52):
  el contador se pone a cero en el mismo paso, en los dos lados.
- **El ventilador no admite usos**: no se «usa», se está dentro. Contar entradas
  a un volumen que también te levanta estando de pie (vuelta 83) sería contar algo
  que el jugador no ve como un gesto.

Y el aviso que **tiene** que haber: un dispositivo agotado **se tiene que ver
agotado** (su marca apagada) y la peana también. Un rebote que un día lanza y al
siguiente no, sin nada que lo diga, es el fallo de la vuelta 67 en el suelo.

---

## 6. Alchemist

**Una tarjeta nueva en la ficha de cada objeto que las admite**, «Reglas del
objeto», con los cuatro controles escritos **una vez** para todos los tipos —la
regla de la 92 con `src/ui/fields.jsx`, aplicada a una página que no es de
React— y cada uno con su **«por defecto»**. Tres
cosas que son la convención del editor:

- **Se ve lo que cambia** (vuelta 78). Un objeto con `afecta` lleva **un borde del
  color de su equipo** en su marca, en el editor **y en el juego**; el color de
  un dispositivo sigue siendo el amarillo (vuelta 84) y lo que distingue a un
  bando es ese borde, no el relleno. Con `activo`, un reloj pequeño; con `usos`,
  el número. Mirando el mapa desde arriba tiene que poder leerse a quién sirve
  cada cosa sin abrir fichas.
- **Capas lo lista** (vuelta 96): la fila de cada objeto dice sus reglas en corto
  («· equipo B · compra · 1/ronda»), y el ojo sigue siendo de vista.
- **Y avisa, en naranja, lo que no significa nada donde se publica** (§4): un
  `{ bando }` en un mapa publicado en el entrenamiento o en el todos contra todos,
  un `fase: 'compra'` en un mapa que reparte, un `repone: 'ronda'` sin rondas. En
  rojo sólo lo que deja el mapa sin jugarse bien: **una salida de un bando que
  sólo tiene puertas del otro**, que es un equipo encerrado.

---

## 7. Combinaciones que no tienen sentido

| Combinación | Qué pasa | Qué se hace |
|---|---|---|
| Teletransporte `afecta: { bando: 0 }` | **Tiene sentido y es seguro en red**: el bando lo sabe el servidor y el cliente lo predice porque llega en la bienvenida | Se admite. Es el caso por el que existe la fase 1 |
| `afecta: todos` + `ve: 'bando'` | Una trampa para el otro bando | El saneado quita `ve` y lo dice |
| `ve: 'nadie'` en un dispositivo | Lo mismo, para todos | Se tira: para eso existe `superficie.invisible`, que deja la marca |
| `cuenta: 'total'` en rebote, velocidad, hielo, tirolina o teletransporte | Correcciones cuando dos lo usan a la vez | Se tira; sólo en peanas |
| `usos` en un ventilador | No hay gesto que contar | Se tira |
| `cuenta: 'total'` + `repone: 'vida'` | ¿La vida de quién? | Se tira |
| `activo.hasta` ≤ `activo.desde` | Nunca activo | Se tira el bloque y se dice |
| `activo.fase: 'compra'` + `desde`/`hasta` más allá de lo que dura la compra | Nunca activo, y la compra la elige la sala | Aviso naranja con la duración de fábrica (`ROUNDS`) |
| Barrera `afecta: { bando: 0 }` en un mapa sin bandos | No choca a nadie | Aviso naranja (§4) |
| `afecta` en una caja sin dispositivo ni barrera | Una pared por bando (§2) | Se tira |
| Cualquier propiedad en geometría, salidas o caja de compra | §2 y §1.3 | Se tira |
| Peana con `municion.reserva` en un arma sin reserva | Munición finita que el juego no tiene (§5.2) | Se tira |
| Peana `desvanece` + `usos` «en total» | Se agota y además se apaga a ratos | Se admite: son dos cosas distintas y las dos las lleva el servidor |
| Tirolina `afecta: { bando }` con el anclaje en zona del otro | El bando contrario pulsa E y no pasa nada | Se admite, y el aviso bajo la mira **no** ofrece la tirolina a quien no puede usarla: lo decide la misma función que ejecuta la E (vuelta 106) |

---

## 8. Las fases y su precio

### Fase 1 — A quién afecta (20–28 h)

Bando y salida en superficies, ventiladores, tirolinas, teletransportes,
barreras y peanas. `movement.setBando`, las cuatro preguntas del escenario con su
condición, el servidor que valida el bando de una peana, el borde de color en la
marca, la tarjeta en Alchemist y los avisos de §4.

**Por qué primero:** es la que un mapa de equipos pide antes que nada —rutas y
salidas propias de cada bando— y **no viaja ni un número**: el bando ya está en la
bienvenida. Medida de cierre: **un teletransporte del bando B con un jugador del
A pisándolo durante 300 pasos da 0 correcciones** en `red45`, y el mismo mapa sin
el campo se monta **byte a byte igual**.

### Fase 2 — Peanas: munición y desvanecerse (16–22 h)

La fase 4 de la 08 más `municion`. El aviso de estado por destinatario, el
contador en número de paso, encender todas al empezar ronda, y la silueta
apagada mientras vuelve.

**Por qué segunda:** estaba ya pedida y escrita en la 08, las peanas son lo que
valida el servidor —así que es la parte sin predicción— y deja montado el aviso
de estado que la fase 5 reutiliza.

### Fase 3 — Cuándo está activo (22–30 h)

`rd.p0` y `td.p0` en la foto, la condición en las mismas cuatro preguntas, el
reloj de la sesión en el entrenamiento, las barreras como puertas con su montón de
dibujo por condición, y el reloj pequeño en la marca.

**Por qué tercera:** es la que da las puertas de salida, pero pide tocar la foto
y medir que la apertura de una puerta en el paso exacto no produce ni una
corrección.

### Fase 4 — Quién lo ve (8–12 h)

Dibujar o no por bando, y mandar el estado de §5.2 y §5.5 sólo a quien lo ve.
**Barata y la última de las baratas**, porque sin las anteriores sólo cambia el
dibujo de objetos que afectan a todos, y ahí la invariante de §5.4 no la deja
hacer casi nada.

### Fase 5 — Cuántas veces (18–26 h)

Contadores por jugador en el movimiento (fuera del cable cuando valen cero),
«en total» sólo en peanas, reponer por ronda y por vida, y la marca que se apaga
al agotarse. **La última porque es la cara**: es estado nuevo en `snapshot()`, y
cada campo ahí es un sitio donde dos extremos pueden discrepar. Medida de cierre:
`red45` con dispositivos de un uso **sigue en 0 correcciones** y la foto **no
crece** en un mapa que no los usa.

**Total: 84–118 h**, repartidas en cinco vueltas que se pueden aparcar entre sí:
ninguna rompe un mapa que no la use.

---

## 9. Lo que se mira y se deja fuera

- **Referencias entre objetos** («este teletransporte se abre al coger aquella
  peana»): piden identidad, o sea la fase 2 de la propuesta 10 (§3.1).
- **Geometría condicional** (paredes que aparecen o desaparecen): §2.
- **Munición finita para las armas de bala**: §5.2. Es una decisión de diseño con
  el HUD delante, no una casilla.
- **«Quién lo ve» como anti-trampas**: §5.4. El mapa es público.
- **Propiedades por jugador concreto con nombre** («sólo para Yago»): piden
  cuentas (propuesta 14) y no tienen sentido en un mapa, que se juega con quien
  llegue.
