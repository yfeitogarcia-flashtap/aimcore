# Propuesta 08 — El arsenal del mapa: reglas de partida y peanas

**Estado:** **diseñada, sin construir nada.** Reescrita en la vuelta 105 con las
reglas que Yago fijó ese día; la versión de la vuelta 95 queda resumida en §10,
con lo que cambia y por qué.

El encargo de la 105, en una frase: **el mapa dice con qué se juega en él**, en un
panel «Reglas de partida» de Alchemist que se guarda dentro del mapa. Dos cosas:

- **Las armas del mapa**, marcadas por su código de armería.
- **El modo de armas**, uno de tres y excluyentes:
  - **Equipadas**: todos salen con el mismo equipo.
  - **Peanas**: se recogen del suelo, sin compra ni economía.
  - **Armería**: se compra como hoy.

Y las peanas con reglas concretas:

- Son ilimitadas y duplicables, y no se agotan ni desaparecen.
- Se cogen apuntando y con **E**, con aviso en pantalla.
- Encima llevan **la misma ficha que un jugador**, con la silueta.
- **El servidor valida** cada recogida.
- Opcionalmente, **se desvanecen** unos segundos después de que alguien la coja.

Más cinco preguntas, que se contestan en §6.

---

## 0. La respuesta corta

**Un solo dato con dos campos, y tres modos que lo leen distinto.** Las armas
marcadas son siempre *el arsenal del mapa*; el modo dice *cómo se consigue*:

| Modo | Las armas marcadas son… | Dinero | Cómo se consigue un arma |
|---|---|---|---|
| **Armería** | lo que ofrece la armería | en rondas, sí (como hoy) | se compra (rondas) o se equipa (todos contra todos) |
| **Equipadas** | el equipo con el que sale todo el mundo | no | te lo dan al salir |
| **Peanas** | lo que puede haber encima de una peana | no | apuntando a una peana y pulsando E |

**Un mapa sin reglas es Armería con el catálogo entero**, que es exactamente lo
que se juega hoy: los mapas que ya están en disco no cambian ni un byte (la
disciplina de la vuelta 83). Y **Los Pilares no se reescribe**: su
`sinEconomia` + `dotacion` de la vuelta 72 **se lee como** Equipadas, igual que
`modosDeMapa` deduce los modos de un mapa viejo sin tocar el fichero (vuelta 98).

Son **cuatro fases**, y las dos primeras no tienen mecánica nueva:

| Fase | Qué | Coste |
|---|---|---|
| 1 | **Reglas de partida**: el panel, las armas marcadas, Armería filtrada y Equipadas completa | pequeño |
| 2 | **La peana en el motor**, en el entrenamiento, con la ficha y la E | grande |
| 3 | **La peana en red**, con el servidor de árbitro, en duelo, equipos y todos contra todos | mediano |
| 4 | **Desvanecerse**, la opción por peana | pequeño |

---

## 1. El dato

```js
reglas: {
  armas: ['krakov', 'rift', 'pulse', 'reaper', 'core', 'fang'],  // marcadas
  modo: 'peanas',                  // 'armeria' | 'equipadas' | 'peanas'
  equipo: {                        // con qué sale cada uno (Equipadas y Peanas)
    chaleco: true, casco: false,
    // En Equipadas, además, un arma por ranura de entre las marcadas:
    principal: 'krakov', pistola: 'pulse', especial: null,
    granadas: ['core'], arrojadizo: 'fang',
  },
},
peanas: [
  { x: 0, z: 0, arma: 'krakov' },
  { x: 0, z: 2, arma: 'krakov', desvanece: 8 },   // fase 4
],
```

Cinco reglas del formato, todas conocidas:

- **Se marcan claves, se enseñan códigos.** En Alchemist cada arma sale con su
  código de armería (`1 2` la Rift) porque es el nombre que el jugador conoce
  (vuelta 98). En el fichero van las claves: el código es el orden de la ficha en
  su sección y **se mueve** cuando entra un arma nueva, y un mapa que guardase
  `1 2` cambiaría de arma solo.
- **Lo que vale su valor de fábrica no se escribe** (vuelta 83). Un mapa sin
  `reglas` es Armería con todo, y el saneado es un punto fijo byte a byte.
- **El saneado dice lo que tira** (vuelta 74). Pasa con un arma que no existe, con
  una peana con un arma no marcada o con peanas en un modo que no las usa. En este
  último caso se conservan y se dice: quien cambia de modo para probar no pierde
  su colocación.
- **Una ranura no se puede quedar sin pistola** (vuelta 89). Si las marcadas no
  incluyen ninguna pistola, sales con la de serie igual. `slots.secondary` es la
  ranura a la que se cae cuando falla otra.
- **El cuchillo no se marca**: se lleva siempre, en cualquier mapa y en cualquier
  modo (vuelta 73).

**Tope del formato, como los de `SALA`**: `PEANAS.max` (160 = dieciséis armas por
diez). Existe para que un fichero corrupto no meta mil, no para limitar el diseño.
El ejemplo del encargo cabe con holgura: la misma armería repetida en la zona de
cada uno de diez jugadores.

---

## 2. Qué hace cada modo en cada modo de juego

| | Duelo y equipos (rondas) | Todos contra todos (sin rondas) |
|---|---|---|
| **Armería** | como hoy, con el catálogo filtrado a las marcadas | la armería equipa, filtrada a las marcadas |
| **Equipadas** | cada ronda y al reaparecer, el equipo; sin tienda ni fase de compra | al reaparecer, el equipo; la armería sólo enseña fichas (`soloFicha`, vuelta 73) |
| **Peanas** | sales con el equipo base; lo recogido se conserva si sobrevives la ronda y se pierde al morir; empezar ronda restaura todas las peanas | sales con el equipo base; reaparecer te lo devuelve y pierdes lo recogido |

Tres cosas de la tabla que son el diseño:

- **Peanas y Equipadas son mapas sin economía**, y eso lo obliga el modo, no un
  aviso. §2 de la versión de la 95 sigue en pie: un arma gratis a doce unidades de
  la salida deja la tienda de decoración. Con los modos excluyentes esto deja de
  ser una restricción y pasa a ser la definición: *Peanas* **es** «sin compra».
- **«Morir cuesta el equipo» sigue siendo la regla** (vuelta 64), y en Peanas
  cuesta lo recogido. Lo que no se pierde nunca es el equipo base, porque en un
  mapa sin tienda no habría forma de recuperarlo. Es el orden de `_perderEquipo` y
  `_dotar` de la vuelta 72, sin cambios.
- **El todos contra todos ya es «Armería sin dinero»** desde la vuelta 100 (la
  bienvenida lleva `libres`). Filtrarla a las marcadas es la misma función de
  catálogo que en el duelo, de modo que no aparece una segunda lista.

---

## 3. La peana

### No se agota, no desaparece y la coge quien quiera

**Coger no la gasta.** La coge uno, la cogen cinco a la vez, y sigue ahí. De ahí
salen tres consecuencias:

- **No hay estado por peana que viaje**, salvo con la opción de desvanecerse (§5).
  El servidor no lleva la cuenta de quién la cogió, porque cogerla no cambia la
  peana: cambia tu inventario.
- **«Una peana, un jugador» no es un problema que resolver.** No hay carrera por
  el rifle del centro, a menos que el creador la pida con la opción de §5.
- **La peana deja de ser un premio y pasa a ser un sitio.** Por eso se puede
  repetir la misma armería en la zona de cada uno: diez peanas de Krakov son diez
  sitios donde se consigue un Krakov.

### Cómo se coge: apuntando y con E

- **Se apunta a la peana, dentro de un alcance corto, y se pulsa E.** El alcance
  es `PEANAS.alcanceU`, del orden de 2.5 u, por encima del de la tirolina (2.2) y
  a distancia de brazo. **Pasar por encima no coge nada**, al revés que los
  recogibles de la vuelta 33 y el Fang de la 90. Con peanas repetidas en un
  pasillo, recoger al pisar te cambiaría el arma cada vez que pasas.
- **«Apuntar» es un rayo contra un volumen, no un píxel.** Cada peana tiene un
  cilindro de agarre alrededor del arma que enseña. El rayo de la mira se corta
  contra él analíticamente, como el hitbox (vuelta 65), y `cortarSegmento` descarta
  que haya pared en medio. No se raycastea ninguna malla.
- **El aviso sale bajo la mira**, donde van los mensajes de ayuda:
  «**E** · Recoger Krakov». Si ya la llevas, dice «**E** · Recargar Krakov». La
  tecla **sale del bind**, con `keysOf('use')` (vuelta 97): si alguien la reasignó
  a la F, dice F.

### Y la E ya hace tres cosas: el orden

La E es `use`, la tecla contextual, y hoy reparte tres cosas (vueltas 27 y 83): el
explosivo, la tirolina y el artilugio. La versión de la 95 descartó una cuarta con
un argumento que sigue siendo cierto («es cómo se pierde una ronda por un
reflejo»). **Aquí se admite, porque lo que la desambigua es apuntar**, y apuntar
es la señal de intención más fuerte que tiene el juego. Orden:

1. **Dentro del radio del explosivo**, desactivar, y nada más ahí dentro (vuelta
   27, intacta). Sólo existe en el entrenamiento con escenario, y en esos mapas no
   hay peanas en red.
2. **Una peana apuntada y al alcance**, recogerla.
3. **Un cable al alcance**, engancharse.
4. Si no, el artilugio.

La peana va delante del cable porque apuntar a algo concreto es más deliberado
que estar cerca de algo. Al revés, alguien que apunta a un rifle debajo del
anclaje de una tirolina saldría volando. Y dos seguros, porque el orden no basta
para que no sorprenda:

- **Alchemist avisa** (en naranja, es de ergonomía y el mapa se juega igual) de una
  peana a menos de `ZIPLINES.alcanceU` de un anclaje: en ese sitio la E hace dos
  cosas según dónde mires.
- **El aviso bajo la mira es la verdad de lo que va a hacer la E.** Lo decide la
  misma función que ejecuta la pulsación, y no una segunda cuenta que pueda decir
  otra cosa (vuelta 67).

**Un bind nuevo no es la salida**, y conviene decirlo porque parece la limpia. La
invariante de `KEYBINDS` es que dos acciones nunca comparten tecla, así que una
acción «Recoger» no podría nacer en la E. Nacería en otra tecla que nadie buscaría
para coger un arma.

### Lo que se lleva: sustituye su ranura

- **La peana escribe su ranura** por `CAMPO[item.ranura]` (vuelta 92), el único
  camino por el que se escribe un arma. **Lo que hubiera ahí desaparece**: no cae
  al suelo ni vuelve a ninguna peana (§9).
- **Se pone en la mano** si la ranura cambió, que es la regla de comprar (vuelta
  67). Recargar no te cambia el arma que empuñas.
- **Cubre cuatro ranuras**: principal, pistola, especial y arrojadizas (granadas y
  Fang). No cubre el cuchillo, que se lleva siempre, ni el chaleco ni el casco, que
  son de `pickups.js` desde la vuelta 33: una segunda forma de coger un casco
  serían dos.
- **Una granada de una peana respeta `ECONOMY.granadasMax`** (vuelta 88): si ya
  llevas dos clases y la tercera no cabe, el aviso lo dice en vez de la tecla. Un
  límite que se aplica en silencio es un agujero.

### La ficha encima: la misma que la de un jugador

**Es el mismo componente**: la ficha de `markers.js`, con la silueta de
`weaponSilhouetteSvg()` y el nombre del arma donde un jugador lleva su nick. No se
dibuja otra.

**Y sale con las reglas de visibilidad de los jugadores**: encuadre más rayo, con
`sight.js`, el mismo veredicto que decide la brújula (vuelta 42). Así, **una peana
detrás de una pared no se anuncia**. Hay una diferencia que conviene decidir en voz
alta. La ficha de un rival pide además **sostener la mira** 350 ms (`dwellMs`),
porque una ficha por jugador visible es una pantalla de rótulos. **Aquí se propone
sin esa espera**, porque la ficha de una peana es la información con la que se
decide ir a ella. Si jugándolo sobran rótulos, es una bandera del componente, no
un segundo componente.

Dos cosas del mecanismo:

- **Tope de fichas a la vez** (las `n` más cercanas de las que se ven) y **rayos
  con presupuesto por frame** (`MARKERS.sight.raysPerFrame`), como la brújula.
  Veinte peanas en el encuadre no pueden ser veinte rayos en un frame.
- **Lo que se ve de la peana es el arma**, la misma silueta extruida del arma en
  pantalla (vuelta 105), girando despacio sobre un zócalo bajo. Es una malla por
  tipo de arma (`InstancedMesh`), así que diez peanas de Krakov son **una** llamada
  de dibujo. Fuera de `occluders`, sin colisión y fuera del presupuesto: una peana
  que parase balas sería cobertura que nadie decidió.

### Sonido y destello (norma permanente de la vuelta 82)

Una peana es un dispositivo, así que nace con los suyos, y los dos existen:

- La voz es **`playEquip('arma')`**, el cerrojo de «acabas de tener un arma»
  (vuelta 73).
- El destello es **un anillo de `dispositivos.js`** abriéndose desde el zócalo.

Sale en quien la coge, y no en los demás: coger una peana no cambia el mundo.

---

## 4. En red: el servidor valida cada recogida

- **El cliente pide** (`MSG.RECOGER { i }`, el índice de la peana). **El
  identificador es su índice en la lista del mapa**, que los dos extremos derivan
  del mismo fichero sin que viaje nada (vuelta 90).
- **El servidor comprueba**, en este orden y por lo más barato primero (vuelta 46):
  1. que el jugador está vivo;
  2. que el modo es Peanas;
  3. que la peana existe, está puesta y lleva un arma marcada;
  4. la distancia de sus ojos a la peana, contra el alcance **más una holgura de
     red** (`PEANAS.holguraU`);
  5. y un `cortarSegmento` de sus ojos a la peana, contra paredes.

  **No se rebobina.** Recoger no es un disparo y no tiene un instante que juzgar:
  la holgura cubre lo que te has movido en un viaje.
- **Contesta por el inventario de siempre** (`MSG.ECONOMIA`, vuelta 64): el arma
  entra en tu ranura y **se te pone en la mano** con la regla de comprar. **El
  cliente no lo predice**: un viaje de retraso no se nota en algo que no se mueve
  (vuelta 90), y predecirlo sería una segunda idea de qué llevas.
- **Rechazar también contesta**, como un disparo rechazado (vuelta 56). Si no, el
  aviso de la mira se queda esperando algo que no va a llegar.

---

## 5. Fase 4 — Desvanecerse, la opción por peana

`desvanece: X` (segundos, **apagada de fábrica**). Tras la primera recogida la
peana sigue **X segundos** y se apaga para todos. Es para los mapas de carrera al
centro: el primero que llega se lleva el rifle y los demás tienen X segundos para
seguirle.

- **Vuelve al empezar la ronda**, en los modos de rondas: el mapa empieza como el
  creador lo dejó (vuelta 62).
- **En el todos contra todos, que no tiene rondas, vuelve sola** a los
  `vuelve: Y` segundos (de fábrica, 30). Sin eso, una peana que desaparece la
  primera vez no vuelve nunca, y a los tres minutos el mapa es otro.
- **Lo único que viaja** es su cambio de estado, un mensaje por peana al apagarse y
  al volver, a todos, un suceso cada muchos segundos. **Su reloj es el número de
  paso**, que en pausa no corre (vueltas 45 y 54).
- **Mientras se desvanece se dice**: la ficha cuenta hacia atrás y la silueta se
  apaga. Una peana que desaparece sin aviso es una trampa (vuelta 80).

---

## 6. Las cinco preguntas

### Coger el arma que ya llevas: sí, recarga

**Llena cargador y reserva hasta lo que traería recién cogida**, que es la regla
del Fang (vuelta 90): recoger lo que ya llevas es recargar, no comprar. Con todo
lleno **no pasa nada**, y el aviso lo dice («Krakov · lleno») en vez de ofrecer
una tecla que no hará nada. Es la regla de `pickups.js`: si no hay hueco, el
objeto se queda como está, que aquí es siempre.

### Con qué munición llega: la de comprarla

**Cargador lleno y su reserva inicial**, exactamente lo que da comprarla
(`r.inicial`, vueltas 86 y 88). Si llegase a medias, el mismo Krakov valdría
distinto según de dónde saliera, y el jugador tendría que aprender dos Krakovs.

### ¿El anfitrión cambia el modo de armas en el lobby? No: lo decide el mapa

**El modo de armas es del mapa**, por la misma razón que su física (vuelta 72): es
lo que lo define. Las peanas están colocadas para Peanas, y el mismo mapa en
Armería es un mapa lleno de peanas que no hacen nada. Un Equipadas de francotirador
en Armería deja de ser el mapa de francotirador. **El lobby lo enseña**, como hoy
enseña «el mapa reparte» (vuelta 72): una fila más en el resumen, «Armas: peanas».

Si algún día se quiere que el anfitrión elija, el camino es que **el mapa declare
qué modos admite** y el lobby ofrezca esos, igual que un mapa se publica por modo
de juego (vuelta 98). Nunca que el lobby imponga uno que el mapa no pensó. Esto
queda fuera de las cuatro fases.

### Cómo encaja en duelo, equipos y todos contra todos

La tabla de §2. En una línea: **los tres modos de armas valen en los tres modos de
juego**, y lo que cambia entre ellos es lo que ya cambiaba: las rondas deciden
cuándo vuelve el equipo y cuándo se restauran las peanas, y el todos contra todos
lo resuelve al reaparecer.

### Coste de red y CPU con muchas peanas

**Red: cero por foto.** Las peanas son datos del mapa, que los dos extremos montan
igual (vuelta 72). Lo que viaja son sucesos:

- una petición por recogida y su inventario de vuelta (lo mismo que una compra);
- con la opción de §5, un mensaje por peana al apagarse y al volver.

Ciento sesenta peanas pesan lo mismo que una.

**CPU, medido** (`peanas105`, en Node, sobre el Plano A):

| | 160 peanas |
|---|---|
| buscar la apuntada, por paso | **0.27 µs** |
| un corte de segmento, sólo a la candidata | **1.48 µs** |
| total, frente a los 200 µs de un paso | **0.9 %** |

El servidor paga lo mismo **sólo cuando alguien pulsa E**, no por paso.

**Dibujo**: una llamada por tipo de arma distinta (`InstancedMesh`), más el zócalo y
el brillo, que son una cada uno. Lo caro de verdad serían las fichas, que son DOM
en el espacio (`CSS3DRenderer`), y por eso llevan tope y presupuesto de rayos
(§3). Se mide en la fase 2 con la escalera de siempre (0, 40, 160 peanas) y su
denominador delante.

---

## 7. El panel «Reglas de partida» en Alchemist

Una hoja nueva del raíl, con la palabra debajo (vuelta 78):

- **El modo de armas**: tres botones excluyentes, con una frase de qué significa
  cada uno *en ese mapa*.
- **Las armas del mapa**: las fichas de la armería por categorías, cada una con su
  código, una casilla y «todas» y «ninguna» por categoría. Salen de
  `catalogoDeTienda()` y `RANURAS`, no de una lista a mano.
- **El equipo**:
  - en Equipadas, una ranura por fila, eligiendo de entre las marcadas;
  - en Peanas, sólo el equipo base (chaleco y casco);
  - en Armería, oculto, porque no significa nada ahí. Se apaga y se dice, que es
    la regla de la vuelta 94.
- **Las peanas se colocan en la vista**, con la convención permanente de la vuelta
  96: nacen delante de la cámara y dentro de la sala, se eligen pinchándolas, se
  arrastran por su cuerpo, **Supr las borra**, **se duplican** con el duplicado sin
  solapes de la vuelta 93 (Ctrl+C / Ctrl+V), tienen fila en Capas con su ojo, y
  su ficha se dibuja ya en el editor. Entran en `TIPOS_DE_MAPA`, que es lo que les
  da todo eso sin tocar nada más.
- **Y una fila de estado**: «8 peanas · 4 armas · 2 de ellas desvanecen». Es la
  regla de la vuelta 77, la barra dice el estado.

---

## 8. Qué se mide al construirlo

- **Fase 1.** Un mapa sin reglas se juega igual, dígito a dígito. Los Pilares se lee
  como Equipadas sin cambiar el fichero. Armería filtrada: el panel no enseña lo
  que el servidor rechazaría, en los dos extremos. Equipadas: reparte las cinco
  ranuras al empezar y al reaparecer, y morir no cuesta el equipo.
- **Fase 2.** Con teclado y ratón de verdad (vuelta 48):
  - apuntar y pulsar E coge, y pasar por encima no;
  - el aviso dice lo que hace la E, también debajo de un cable;
  - a cargador lleno no pasa nada;
  - la ficha no sale detrás de una pared;
  - y el coste con 0, 40 y 160 peanas.
- **Fase 3.** Sin navegador, contra `Partida`: el servidor rechaza fuera de alcance,
  con pared en medio, muerto y con un arma no marcada, y contesta igual. Cinco
  cogiendo la misma peana a la vez se llevan cinco armas. Morir cuesta lo recogido
  y no el equipo base. Una ronda nueva restaura. Y con navegadores: el arma entra
  en la mano un viaje después.
- **Fase 4.** Se apaga a los X s de la primera recogida y para todos, vuelve con la
  ronda o a los Y s, y en pausa no cuenta.

---

## 9. Qué se deja fuera, y por qué

- **Armas tiradas al suelo** al morir o al cambiar. Es un sistema entero
  (posición, identidad, caducidad) para algo que las peanas ya resuelven, y con
  peanas que no se agotan tiene aún menos sentido. Si algún día hace falta, el
  sitio es `clavadas.js` generalizado.
- **Que el anfitrión elija el modo de armas.** Contestado en §6: si llega, llega
  como «el mapa declara los que admite».
- **Peanas de chaleco o casco.** Existen desde la vuelta 33, y son los recogibles.
- **Una peana con cantidad** («quedan 3 Krakovs»). Contradice «no se agota», que es
  la regla, y el caso de la carrera ya lo cubre desvanecerse.

---

## 10. Qué cambia respecto a la versión de la vuelta 95

| Vuelta 95 | Vuelta 105 | Por qué |
|---|---|---|
| La peana se gasta y reaparece cada 20 s | No se gasta. Opción de desvanecerse | Las peanas son sitios, no premios, y se repiten |
| Se coge al pasar, sin tecla | Apuntando y con E, con aviso | Con peanas repetidas, pasar por encima te cambiaría el arma cada vez |
| No a una cuarta rama de la E | Sí, porque la desambigua apuntar | El argumento de la 95 era contra la proximidad, no contra la intención |
| Dotación y lista blanca, dos campos sueltos | Un panel, `reglas`, con tres modos excluyentes | Las dos formas del encargo eran el mismo dato leído de dos maneras |
| Peanas sólo en mapas de duelo sin economía | En los tres modos de juego, con modo Peanas | El todos contra todos ya no tiene economía, y Peanas **es** sin economía |

Lo que no cambia: **el arma que llevabas se va**, **el identificador es el índice
en la lista del mapa**, **el reloj es el número de paso**, **una ronda nueva
restaura el mapa** y **Peanas y Armería no conviven**.

---

## 11. Qué hacer primero

**La fase 1, sola**:

- es el panel y el dato, sin mecánica nueva ni protocolo;
- cubre Equipadas y Armería filtrada;
- y con ella se puede jugar el mismo día un mapa con su propio arsenal.

**La fase 2 se construye en el entrenamiento y se juega contra los muñecos antes de
tocar la red**, que es la convención de la vuelta 63 por su lado bueno: lo que vive
en el motor sale en los dos modos. La 3 va detrás, y la 4 es pequeña y va al final,
cuando haya un mapa de carrera que la pida.
