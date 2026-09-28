# Propuesta 11 — Salas de varios, espectador y lobby de evento

**Estado: fase 1 construida en la vuelta 100** —el protocolo nuevo, el todos
contra todos y las N salidas en Alchemist (ver §9)—; las fases 2 a 4, escritas y
sin construir. Es el bloque que el encargo de la vuelta 97 puso por delante de las
propuestas 08 (armas del mapa) y 09 (perforación).

Lo que se pidió son tres cosas, y el encargo ya trae la observación que las une:
**las tres dependen de que una sala pueda tener más de dos personas dentro.**

1. **Salas de N jugadores con equipos opcionales**: 2v2, 3v3 y 5v5 como
   configuraciones de la misma base, y el todos contra todos como equipos de uno.
   Prioridad: todos contra todos y 3v3 antes que 5v5.
2. **Modo espectador**: entrar sólo a mirar, cambiar entre las vistas de cada
   jugador o volar en cámara libre, ver el marcador. Para pantallas grandes en
   eventos. En partidas por internet, valorar un retraso para que no se puedan
   chivar posiciones.
3. **Lobby de evento para zonas LAN**: un organizador crea un lobby con código,
   los PCs entran con un apodo y sin cuentas, y se ven en una lista para retarse.
   Valorar que el servidor corra en un PC de la sala.

---

## 0. Lo que esta propuesta decide, y lo que no

Decide **el orden y los cortes**: qué hay que construir antes de qué, qué cabe en
una vuelta y qué no, y cuál de las tres cosas es la barata. No decide el diseño
de juego de un 3v3 —cuántas rondas, qué economía— porque eso se calibra jugando
y todavía no hay con qué jugar.

Y trae **una medida**, porque la pregunta de «cuántas salas de 10 aguanta la
máquina» tiene respuesta hoy y es incómoda: ver §2.

---

## 1. La base: una sala de N butacas, y los equipos encima

La forma que propone el encargo es la correcta y es además la que menos toca:
**una sola base de N jugadores**, donde los modos son configuración.

- **2v2, 3v3, 5v5** son N = 4, 6, 10 con dos equipos.
- **Todos contra todos** es N jugadores con **N equipos de uno**, no un segundo
  sistema. Es la misma idea que `TRAINER_SCENARIOS` derivándose de `soloDuelo` en
  vez de haber dos listas: lo que cambia es un dato, no un camino.

Lo que **no** es configuración, y hay que verlo antes de empezar: hoy `equipo`
significa **dos cosas a la vez** —la ranura de salida y el color— y con equipos
dejan de ser la misma. Un 3v3 tiene seis ranuras y dos colores. Así que el primer
corte del trabajo es separar `ranura` de `equipo`, con `equipo = ranura` como
valor derivado mientras haya un jugador por bando: eso deja el 1v1 de hoy
funcionando dígito a dígito y es lo que hace que el resto se pueda construir
encima sin un modo aparte.

**Y el color no puede identificar a diez personas.** Los dos colores de equipo se
eligieron midiendo en CIELAB (ΔE 51 entre ellos y 79 contra el más cercano de los
reservados) y **no hay sitio para ocho más**: naranja, rojo, verde, ámbar,
amarillo y azul eléctrico ya significan algo en pantalla. De ahí sale una
decisión, y encaja con el punto 8 del encargo (las skins nunca serán de color,
porque el color es información):

> En todos contra todos, **todos los rivales son del mismo color**, porque para
> ti todos son lo mismo: un rival. A quién tienes delante lo dice la ficha
> flotante con su apodo, que existe desde la vuelta 42 y hoy pone `VK-01`.

En 3v3 y 5v5 el color sigue diciendo **de qué lado**, que es lo único que un
color tiene que contestar en un tiroteo.

---

## 2. Lo que cuesta hoy, medido (`salas97`)

Antes de diseñar nada se ha medido el coste de una sala con N butacas, con el
`Partida` de hoy y contando **los bytes que el servidor manda de verdad**:

| jugadores | ms por paso | % de un paso | bajada de la sala | bytes por foto |
|---|---|---|---|---|
| 2 | 0.119 | 0.71 % | 171 KB/s | 1 459 B |
| 4 | 0.203 | 1.22 % | 684 KB/s | 2 919 B |
| 6 | 0.251 | 1.50 % | 1 512 KB/s | 4 301 B |
| 8 | 0.255 | 1.53 % | 2 705 KB/s | 5 770 B |
| 10 | 0.322 | 1.93 % | **4 147 KB/s** | 7 077 B |

Y el desglose: **el 100 % de esos bytes son la foto** (`MSG.FOTO`).

La conclusión es de las que cambian el plan:

- **La CPU no es el problema.** A 16.67 ms por paso caben ~50 salas de 10 en el
  núcleo compartido que hay hoy. El rebobinado y la colisión escalan con N y
  siguen siendo calderilla.
- **El tráfico sí.** Una sola sala de 10 son **33 Mbit/s de subida**. Eso no cabe
  en la máquina de hoy ni cabría en diez máquinas: es el cuadrado —N fotos de N
  cuerpos— con la foto en JSON y a 60 Hz.

Así que **el protocolo tiene que cambiar antes de que haya diez jugadores, no
después**, y esta medida dice exactamente qué palancas sirven y cuánto:

| palanca | sala de 10 |
|---|---|
| hoy (60 Hz, todos a todos) | 4 147 KB/s |
| fotos a 30 Hz | 2 073 KB/s |
| fotos a 20 Hz | 1 382 KB/s |
| sólo 4 rivales de media por foto | 2 073 KB/s |
| **20 Hz + 4 rivales** | **691 KB/s** |

691 KB/s por sala son 5.5 Mbit/s: seis salas de 10 caben en 33 Mbit/s, que es
donde estamos hoy con una sola. Y las dos palancas son baratas por un motivo que
conviene ver: **las dos existen ya a medias en el código**.

- **Bajar el ritmo de la foto no toca la simulación.** El mundo va a 60 Hz fijos
  y el cliente **ya dibuja al rival interpolando entre dos fotos** con el reloj de
  las fotos y no con el suyo (vuelta 45). Mandar una de cada tres es cambiar cada
  cuántos pasos se llama a la función que ya existe. Lo que se paga está acotado y
  se puede medir: el rival se dibuja con hasta 50 ms más de antigüedad, y el
  disparo **no se entera**, porque se juzga contra el paso que el tirador dice que
  tenía en pantalla (vuelta 46) y ése sigue viajando exacto.
- **Y mandar una foto distinta a cada uno ya se hace.** Durante la fase de compra
  la foto sale **por destinatario** y no lleva al rival (vuelta 62). El mecanismo
  está montado y probado; lo que falta es el criterio.

**El criterio no puede ser «lo que ves».** Sería lo obvio y rompería algo
decidido: las pisadas se oyen **a través de las paredes** hasta 16 u, y el oído es
el único canal que no hay que apuntar a ninguna parte (vueltas 60 y 73). Así que
la regla es **por distancia y no por línea de visión**: entra en tu foto quien
esté dentro del radio en el que podrías oírle, más quien se vea. Con eso, en un
mapa de duelo de 40×40 la media cae sola; en uno pensado para diez, más.

---

### 2.1 Lo que costaría al mes en Fly (vuelta 99)

Pedido antes de abrir salas grandes, con el escenario del encargo: **5 salas de
10 jugadores, 2 horas al día**, o sea 300 horas de sala al mes. Lo que se paga en
Fly por tráfico es **lo que sale de la máquina** (lo que entra —las entradas de
los jugadores— no se cobra), y la máquina está en París (`cdg`), que es la tarifa
de Europa y Norteamérica: **0.02 $/GB** según la página de precios de Fly (que
hay que volver a mirar el día de abrir: los precios cambian y esto no se mide
desde aquí).

| protocolo | una sala de 10 | por hora de sala | al mes (300 h) | coste |
|---|---|---|---|---|
| hoy (60 Hz, todos a todos) | 4 147 KiB/s | 15.3 GB | ~4.6 TB | **~92 $/mes** |
| nuevo (20 Hz + ~4 rivales por foto) | 691 KiB/s | 2.5 GB | ~0.76 TB | **~15 $/mes** |

Tres cosas que acompañan al número:

- **La CPU no cambia la cuenta**: cinco salas de 10 son ~10 % de un paso en el
  núcleo compartido de hoy (1.93 % por sala, §2), así que la máquina es la misma
  —`shared-cpu-1x` de 512 MB, unos pocos dólares al mes— y lo que se paga de más
  es sólo el tráfico.
- **Por jugador son ~0.55 Mbit/s de bajada** (69 KiB/s), que cabe en cualquier
  conexión de casa; con el protocolo de hoy serían 3.3 Mbit/s, que no.
- **Y si los jugadores salen de Europa, la tarifa no cambia**: se cobra por la
  región de la máquina, no la del jugador. Lo que cambia es el ping.

O sea: con el protocolo de hoy, cinco salas de diez son ~90 $/mes y además no
caben por ancho de banda; con el nuevo, ~15 $/mes. **El cambio de protocolo va
primero**, que es lo que ya decía esta propuesta.

### 2.2 Mapas de varias salas: el interés por sala (vuelta 99, respondiendo)

La visión de después del todos contra todos: un mundo grande hecho de **salas**
—una pieza de Alchemist con sus paredes de rejilla, sus puertas y su tamaño— y
**túneles** que las conectan, reutilizables entre mapas, para modos tipo KOTH o
battle royale.

**¿Resuelve parte del tráfico mandar a cada uno sólo su sala y las contiguas?**
Sí, y es exactamente la palanca de «4 rivales de media por foto» de la tabla de
§2 con un criterio mejor: en vez de una distancia, un **grafo** que el mapa ya
declara. Lo que cambia la cuenta es el exponente: hoy la foto es **N × N**
(cada uno recibe a todos); por salas es **N × (los que hay en tu sala y en las de
al lado)**, que no crece con el tamaño del mapa sino con la densidad. Para 10
jugadores en 6 salas, ~3-4 por foto, que es la fila de 691 KiB/s; para 30 en 20
salas sigue siendo ~3-4, que es lo que haría viable un battle royale.

Tres condiciones, y las tres salen de cosas que ya son reglas del juego:

- **Tiene que ser «sala y contiguas» o distancia, lo que sea mayor**, no sólo la
  sala. Las pisadas se oyen a través de las paredes hasta 16 u (vueltas 60 y 73),
  y una granada o un cohete cruzan una puerta: quien está al otro lado de un muro
  tiene que estar en la foto aunque no se vea. Las contiguas son además el
  colchón para que quien cruza una puerta no **aparezca de golpe**: ya venía en tu
  foto desde que entró en la sala de al lado.
- **Y un túnel es una sala más del grafo**, estrecha. Si no, dos salas unidas por
  un túnel largo serían «contiguas» aunque estén a 40 u.
- **El protocolo de la fase 1 se diseña ya con este hueco**: la foto por
  destinatario pregunta a **una** función `¿entra B en la foto de A?`. En la fase
  1 contesta por distancia; el día de las salas contesta por el grafo, y el
  cable no se entera. Es la misma disciplina del transporte (vuelta 46): lo que
  va a cambiar se pone detrás de una sola puerta.

De regalo, y no es menor: **lo que no te llega no lo puede enseñar un
programa de trampas**. Filtrar por sala es también el primer anti-*wallhack*.

**¿Qué tamaño de mapa para 10 jugadores?** Con las referencias que ya están
medidas: El Espejo son 1 600 u² para dos, con el primer contacto a los **3.5 s**;
se corre a 6.5 u/s. Para que diez se encuentren sin pasar minutos solos:

- **Entre 300 y 500 u² transitables por jugador**: 3 000–5 000 u² en total, o
  sea una huella de unos **70 × 70** con un 70 % de suelo pisable.
- En salas: **5-7 salas de 25-30 u de lado** (600-900 u² cada una), unidas por
  túneles de 8-12 u (1.5 s cada uno), y **ninguna sala a más de tres saltos de
  otra**. Cruzar de punta a punta queda en ~15 s, y lo normal es tener a alguien
  en tu sala o en la de al lado cada 10-20 s.
- **KOTH**: una sala central (la colina) contigua a todas y un anillo de 4-6
  alrededor, para que llegar a la colina sea siempre un salto.
- **Battle royale con 10**: empezar más grande (8-10 salas) y **cerrar salas por
  fases**; con el grafo, «la zona» es cerrar las puertas de una sala, que es más
  legible que un círculo que encoge.

Nada de esto se construye ahora: está aquí para que el protocolo de la fase 1 no
lo cierre sin querer.

### 2.3 El caso extremo: 50 en una sala abierta de 200 × 200 (vuelta 100)

Pedido antes de prometer salas grandes: cincuenta jugadores en una sola sala sin
paredes que filtren, para saber **dónde está el límite de verdad**. Medido con el
protocolo de la vuelta 100 (`salas100`, contra `Partida` y contando los bytes que
el servidor manda; `dibujo100`, contra el motor en un navegador). Los cincuenta
andan repartidos por la sala —rumbo nuevo al azar cada dos segundos—, porque
juntarlos en el centro dejaría al filtro sin nada que filtrar.

| 50 en 200 × 200 | CPU del servidor por paso | subida de la sala | por jugador | rivales por foto |
|---|---|---|---|---|
| sin filtro, 60 Hz (el protocolo de antes, con la foto ligera) | 1.46 ms (8.8 %) | 19.4 MiB/s (156 Mbit/s) | 398 KiB/s | 49 |
| sin filtro, 20 Hz | 0.45 ms (2.7 %) | 6.5 MiB/s | 133 KiB/s | 49 |
| **filtro de serie (80 u), 20 Hz** | **0.37 ms (2.2 %)** | **3.1 MiB/s (25 Mbit/s)** | **63 KiB/s** | **19.7** |
| filtro a 60 u, 20 Hz | 0.32 ms | 2.2 MiB/s | 46 KiB/s | 12.3 |
| filtro de serie, 10 Hz | 0.21 ms | 1.5 MiB/s | 32 KiB/s | 19.7 |

Y el cliente, que era la tercera pregunta:

- **Recibir** una foto con 49 dentro (6.6 KiB) cuesta 0.05 ms de `JSON.parse` y
  0.05 ms de leerla: **2 ms de CPU por segundo** a 20 Hz.
- **Interpolar** a los 49 cada frame: **0.01 ms**.
- **Dibujarlos**: cada cuerpo son **3 llamadas de dibujo** (sus tres zonas); 49
  añaden ~150 llamadas y ~0.4 ms de `render()` **en SwiftShader**, o sea la CPU
  haciendo de tarjeta gráfica. En un PC con gráfica es calderilla; lo que vale de
  la cifra es la pendiente, y es plana.

**Dónde está el límite, entonces: en el cable, no en la CPU ni en el cliente.**

- **La CPU** aguanta ~40 salas así por núcleo (2.2 % de un paso cada una).
- **El cliente** recibe 0.5 Mbit/s y dibuja 150 llamadas más: cabe en cualquier
  PC que ya mueva el juego.
- **El cable**: 25 Mbit/s de subida **por sala de cincuenta**. En la máquina de
  Fly de hoy eso es una sala, quizá dos, y ~70 $/mes si se juega dos horas al día
  (3.2 TiB). Es el mismo cuadrado de §2 con otro número: sin paredes, lo único que
  lo corta es la distancia, y a 80 u en una sala de 200 cada uno sigue viendo a
  veinte.

**La siguiente palanca no es de interés, es de formato.** De los 6.6 KiB de esa
foto, cada rival pesa ~138 B en JSON —cinco números con tres decimales, su arma,
su vida, su ranura—. En binario son unos 16 B (posición y rumbo en enteros de 16
bits, época, vida y arma en bytes): **ocho veces menos**, y 50 en una sala abierta
pasaría a ~400 KiB/s. Eso es cambiar `JSON.stringify` por un empaquetado en los
dos extremos y **no toca nada más** —el cable ya es de texto por decisión de la
vuelta 45 («se lee en el inspector»)— y es lo primero que habría que hacer el día
que las salas de cincuenta sean un producto y no una medida. Detrás, dos más ya
medidas: foto a 10 Hz para los que están lejos (la última fila) y un `lejosU`
más corto.

**¿Tiene sentido ampliar el tamaño máximo de sala (hoy 200 u de lado)?** **No,
y por tres motivos:**

- **No hace falta para cincuenta.** Con la cuenta de §2.2 —300 a 500 u² por
  jugador—, cincuenta piden 15 000–25 000 u², o sea una sala de **125 a 160 de
  lado**. 200 × 200 son 800 u² por jugador: ya es un mapa **vacío** para
  cincuenta, no uno apretado.
- **Crecer abierto no escala el tráfico, lo esparce.** Medido: en 300 × 300 cada
  uno ve a 10 y en 400 × 400 a 6, que es lo mismo que decir que la mitad del tiempo
  no ves a nadie. Lo que escala de verdad es **el grafo de salas** de §2.2: el
  tráfico sale de la densidad de tu sala y la de al lado, no del tamaño del mundo.
- **Y hay tres cosas atadas a 200** que habría que mover a la vez: el plano
  lejano de la cámara (`CAMERA.far`, 200 u —más allá no se dibuja nada—), el
  alcance de una bala en red (`NET.shotRange`, 60 u) y el propio `lejosU` (80 u).
  Una sala de 400 sería un mapa donde la mitad del suelo que tienes delante no se
  ve y a la mitad de lo que se ve no se le puede dar.

Lo correcto para un mundo grande es **varias salas unidas**, no una más grande.

### 2.4 Embudos: la guía para los mapas de varias salas (vuelta 100)

La preocupación del encargo es la correcta, y tiene nombre: **un embudo** es un
sitio por el que hay que pasar para ir de un lado al otro, y en un mapa de varias
salas con diez jugadores se convierte en el sitio donde alguien espera apuntando
a la boca de un túnel. Cuatro reglas para las guías de construcción y para las
medidas de Alchemist, de más a menos importante:

1. **Cada sala, al menos dos entradas; mejor tres.** Una sala con una sola
   entrada es una ratonera: quien está dentro no puede salir sin cruzar el sitio
   que el de fuera está mirando, y quien quiere entrar tampoco. Es el recinto de
   la vuelta 42 —«una única boca, y todo lo que hubiera enfrente te veía por
   ella»— a escala de mapa, y la vuelta 43 lo resolvió igual: **salir por los dos
   extremos**.
2. **Circuitos, no ramas.** Las salas y los túneles forman un grafo, y lo que se
   pide es que **no tenga puentes**: ningún túnel cuyo corte deje el mapa en dos.
   Un puente es un embudo por definición —todo el que va de un lado al otro pasa
   por él—; en un grafo sin puentes siempre hay otro camino, así que esperar en
   una boca deja de ser una estrategia que gana sola. Las salas sin salida (una
   hoja del grafo) son el caso extremo de lo mismo.
3. **Túneles cortos y anchos, o con huecos a los lados.** Lo que hace malo un
   túnel no es que exista, es **cuánto rato estás dentro sin poder hacer nada**:
   uno de 12 u son casi dos segundos en línea recta, de espaldas a todo. La cuenta
   de §2.2 ya pedía 8-12 u; a eso se suma **un ancho mínimo de dos cuerpos y medio**
   (~2.5 u, el paso de La Puerta del Plano A) para que dos puedan cruzarse, y en
   los largos, **ventanas o huecos laterales** que den a la sala de al lado: un
   túnel con ventanas es un pasillo que se juega, no un tubo que se cruza.
4. **La boca no se ve de lejos.** Si la salida de un túnel se ve desde el fondo de
   la sala a la que da, quien sale lo hace a campo abierto contra alguien que
   lleva rato apuntando. Una pieza delante de cada boca —la pantalla de aparición
   del Plano A, otra vez— convierte el campeo en un asomo.

**Y lo que Alchemist medirá**, el día que existan las salas (la fase de mapas de
varias salas, detrás de la 2 y la 3): las salas y sus puertas son **datos** —una
sala es un recinto y una puerta es un hueco que la une con otra—, así que el
grafo se deriva de ellos y las cuatro reglas son **métricas**, no consejos:

- **Aviso en rojo: una sala con una sola entrada.** Es la que pidió el encargo y
  la más barata: contar puertas por sala.
- **Aviso: puentes del grafo** —el túnel que, si se tapa, parte el mapa—, que es
  la regla 2 y sale de un recorrido del grafo (los puentes de Tarjan; decenas de
  salas, microsegundos).
- **Ficha de cada túnel**: largo, ancho mínimo y segundos que se tarda en
  cruzarlo a la marcha de carrera, con el aviso encima de 12 u o por debajo de 2.5
  de ancho sin huecos laterales.
- **Y por cada boca, desde dónde se ve**: el mismo barrido de línea de visión que
  ya mide si dos salidas se ven, apuntado a la boca.

Hoy no hay salas en el formato, así que ninguna de las cuatro se puede medir
todavía; lo que sí mide Alchemist desde esta vuelta es la regla que las cuatro
tienen detrás en un mapa de una sala: **que ninguna salida vea a otra**
(«Medir», en la hoja Duelo).

## 3. Qué toca del protocolo, y qué no

**No toca:**

- **El reloj sigue siendo el número de paso** y la entrada sigue viajando sellada
  con el suyo. Nada de esto depende de cuántos haya.
- **La predicción y la reconciliación** son de cada cliente contra su propio
  cuerpo: con diez dentro, cada uno sigue prediciendo uno.
- **La compensación de retraso** ya rebobina *a los demás* y no *al otro*: el
  bucle de `_resolverTiro` recorre jugadores. Con N el coste sube linealmente y
  el historial son 3.8 KB por jugador.
- **El transporte**, que son cuatro funciones y no sabe cuántos hay detrás.

**Toca, y son tres cosas:**

1. **El ritmo y el destinatario de la foto** (§2). Es el trabajo de verdad.
2. **Una ranura que no es un equipo** (§1).
3. **Un campo nuevo, y sólo uno, y es del espectador**: el **cabeceo**. La foto
   lleva `yaw` —lo necesita la brújula y la puñalada por la espalda— y **no lleva
   pitch**, porque el cuerpo que se dibuja no cabecea. Para ver la partida *desde
   los ojos* de alguien hace falta. Va con la disciplina de la vuelta 83: se
   escribe sólo cuando hay espectadores en la sala.

---

## 4. Qué toca del formato de mapa

Esto salió midiendo, y es el primer muro que aparece al levantar el tope de
butacas: **`Partida` reparte `salidas[ranura]` y un mapa de duelo declara
exactamente dos**. El tercero que entra revienta leyendo una salida que no existe.

- **Un mapa declara cuántos caben.** `duelo.salidas` pasa a ser una lista de N, y
  de su longitud se deriva el tope de la sala — como `TRAINER_SCENARIOS` se deriva
  de `soloDuelo`, y no un número aparte que se pueda contradecir con el mapa.
- **Y la simetría por giro de 180° no generaliza.** El Espejo se declara a medias
  y `giro180` escribe la otra mitad, y eso es lo que hace que la vista de uno sea
  la del otro (vuelta 66). Con seis salidas, la simetría que toca es de orden 3 o
  de orden 6, o directamente **dos bases enfrentadas** con giro de 180° — que es
  lo que hace un mapa de equipos de verdad y lo que ya sabe hacer el formato. Un
  mapa de todos contra todos **no tiene simetría que garantizar**: lo que tiene que
  garantizar es que ninguna salida vea a otra, que es una medida y ya existe
  (`mapa66`).
- **Alchemist tendrá que dejar poner N salidas.** Con la hoja de Duelo de hoy son
  dos fijas. Es un cambio pequeño y va con la fase, no antes.

---

## 5. Qué toca de las reglas, y por qué el todos contra todos es el barato

Aquí está el hallazgo que ordena las fases.

**Un 3v3 obliga a reescribir el final de una ronda.** Hoy una ronda se cierra con
**la primera muerte** y un empate de vidas la repite (vuelta 62). Con tres por
bando eso no significa nada: la ronda acaba cuando **cae un equipo entero**, el
desempate por vidas pasa a ser por vidas sumadas o por jugadores en pie, la
economía reparte por bando y hay que decidir **si hay fuego amigo** —que es una
decisión de juego con precio, no un interruptor—.

**Un todos contra todos no toca nada de eso, porque no tiene rondas.** Es un
marcador y un cronómetro, y la reaparición autoritativa por reloj de entradas ya
está construida y medida desde la vuelta 52 (`vivoEn`). O sea:

> **Todos contra todos = N butacas + N salidas + la foto por destinatario.**
> Nada de rondas, nada de economía, nada de equipos.

Por eso el orden que pide el encargo —todos contra todos y 3v3 antes que 5v5— es
además el orden correcto por dependencias, y se puede afinar: **el todos contra
todos es la fase 1, y de paso es la que prueba el protocolo nuevo con diez
personas sin tener que decidir ni una regla de juego.**

---

## 6. Espectador

Un espectador es **una conexión sin cuerpo**: recibe fotos, no manda entradas, no
ocupa butaca y no cuenta para `llena`. Eso es poco código, y lo que tiene detrás
son tres decisiones.

- **La cámara libre ya existe.** Es el vuelo del editor (vuelta 78): un `if` al
  principio del paso de movimiento, con la colisión puesta o quitada. No hay un
  modelo nuevo.
- **La vista de un jugador necesita el cabeceo** (§3). Con clic izquierdo se
  cicla, que es lo que pide el encargo.
- **El marcador ya viaja**: `bajas` y `muertes` están en la foto de cada jugador
  desde que hay foto. Lo que falta es la pantalla, y **la pantalla de un evento no
  es el HUD de un jugador** — se ve desde tres metros.

**El retraso para espectadores.** Es correcto y hay que ponerlo desde el
principio, porque sin él un espectador con el móvil al lado es un mapa entero
regalado. Lo que cuesta se puede acotar hoy: guardar 10 s de fotos de una sala de
10 a 60 Hz son ~4 MB por sala, y **a 20 Hz son 1.4 MB** — o sea que el retraso es
otra razón para bajar el ritmo de la foto del espectador, que además es el que
menos lo nota. Dos reglas que se quedan:

- **El retraso es del servidor, no del espectador.** Si lo aplicara el cliente,
  un cliente modificado lo quitaría y el retraso no protegería de nada.
- **Y en LAN se puede apagar**, que es justo el caso del encargo: una pantalla
  grande en una feria, con los jugadores en la misma sala, no puede ir treinta
  segundos por detrás de lo que se oye gritar.

**Las cámaras de televisión —planos automáticos, seguir la acción— quedan fuera**,
como dice el encargo. Y conviene saber por qué no es un adorno que se añade luego:
una cámara que «sigue la acción» necesita saber **dónde está la acción**, y eso es
un sistema de interés que no existe. Va después del retraso, no antes.

---

## 7. Lobby de evento para LAN

Lo que hace falta para una feria ya está casi todo:

- **El servidor corre en un PC de la sala** desde la vuelta 58: `npm run host`
  levanta el huésped **y sirve el juego**, y desde la 66 imprime las IPv4 de red
  por las que se llega desde otro PC. No depende del wifi del recinto, que es lo
  que pedía el encargo, y además quita los 15 ms de París.
- **Los apodos no necesitan cuentas.** Es exactamente la **fase 1 de la propuesta
  07** —un apodo de invitado guardado en el navegador, sin servidor— y es la única
  fase de aquella que se puede hacer en una tarde.

Lo que falta es **el lobby**, y ahí hay que ser explícito con una regla que esta
propuesta rompe a propósito:

> Desde la vuelta 47 **no hay registro de salas**: el código *es* la dirección, no
> hay matchmaking y no hay nada que limpiar. Un lobby **es** un registro de salas.

No es una contradicción si se acota bien, y el acotado es el propio encargo: el
registro **vive en un proceso y es de esa zona LAN**. Nace al arrancar el
huésped, muere con él, y no existe en el despliegue. Lo que la vuelta 47 rechazó
era un registro global con matchmaking y jugadores buscando partida; esto es una
lista de quién hay en esta sala física. Tres reglas para que no se convierta en lo
otro:

- **El lobby lo crea el organizador y tiene su código**, como una sala.
- **No hay descubrimiento automático.** Se entra por la dirección del PC que lo
  sirve, que en una feria está escrita en un cartel.
- **Y no se despliega.** El lobby es del huésped local; en Fly no se enciende.

**Los brackets automáticos quedan fuera**, como dice el encargo, y ahí la
dependencia es real: un cuadro de eliminatorias necesita resultados que sobrevivan
a la partida, o sea persistencia — la fase 2 de la propuesta 07, que es la primera
que obliga a montar y **mantener** un servicio con datos de personas.

---

## 8. Qué se puede hacer sin cuentas

Respuesta corta: **todo el bloque menos los brackets.**

| Pieza | ¿Cuentas? |
|---|---|
| Salas de N, todos contra todos | No |
| Equipos (3v3, 5v5) | No |
| Espectador, cámara libre y vistas | No |
| Retraso para espectadores | No |
| Lobby de evento con apodos | No — apodo de invitado (propuesta 07, fase 1) |
| Marcador de la partida | No |
| Brackets, historial, ranking del torneo | **Sí** (propuesta 07, fase 2+) |

Y la regla que se queda, que ya estaba decidida en la 07: **se sigue pudiendo
jugar sin cuenta y en igualdad**. Un lobby de feria es el caso donde eso deja de
ser un principio y pasa a ser un requisito de producto — nadie se registra en una
cola de diez minutos.

---

## 9. Las fases, y qué depende de qué

**Fase 1 — La sala deja de ser de dos** *(construida en la vuelta 100)*
- Separar `ranura` de `equipo`, con el 1v1 saliendo dígito a dígito igual.
- `duelo.salidas` como lista de N, y el tope de la sala derivado de su longitud.
- **La foto por destinatario y por distancia**, y su ritmo bajado (§2).
- **Todos contra todos**: marcador, cronómetro, reaparición — nada de rondas.
- Medida de cierre: una sala de 10 por debajo de **700 KB/s** y con error de
  reconciliación cero, que es el listón que `red45` lleva midiendo desde la 45.

  **Cumplida** (vuelta 100): una sala de 10 en La Rotonda son **309 KiB/s**
  (`salas100`, contra los 4 147 del protocolo de antes) y tres navegadores
  andando y saltando cuatro segundos a 20 Hz dan **0 correcciones** y error máximo
  0 (`todos100nav`). Lo que se construyó, y lo que quedó fuera:

  - Hecho: la foto por destinatario (`net/interes.js`), la entrada ligera del
    otro, el marcador por separado, el ritmo por sala (60 Hz el duelo, 20 el todos
    contra todos), el todos contra todos entero, La Rotonda, `todos.salidas` en el
    formato y en Alchemist.
  - **Separar `ranura` de `equipo` no hizo falta todavía**: sin equipos, la ranura
    sigue siendo el sitio y el nick, y el color de los rivales en el todos contra
    todos es uno para todos (§1). Se separan en la fase 2, que es la primera que
    tiene dos jugadores en el mismo bando.

**Fase 2 — Equipos** *(construida en la vuelta 101, junto con el lobby)*

  De 2v2 a 5v5 sobre la misma sala de N, lanzados desde **un lobby** que es el
  mismo para todos los modos (`net/lobby.js`, `src/ui/Lobby.jsx`). Las reglas que
  se decidieron —ronda por bando caído, sin fuego amigo, economía por jugador con
  premio por bando, compañeros visibles en la compra, pausas del bando— están en
  `docs/decisions.md` §101.5. **Un mapa de equipos es un mapa de duelo**: los
  compañeros salen junto a la salida de su bando (`salidasDeEquipos`) y Alchemist
  avisa si alguno no cabe. Lo que no está: conos de salida por jugador y caja de
  compra por equipo en el editor, que esperan al primer mapa pensado para 5v5.
  **Ranura y bando ya son dos campos** (lo que la fase 1 dejó pendiente).

  Lo que la propuesta pedía de partida, para el registro:
- 3v3 primero. Fin de ronda por equipo caído, desempate, economía por bando, y la
  decisión de fuego amigo tomada a propósito.
- 5v5 es la misma fase con otro número **si el mapa existe**: un mapa de diez no
  es un mapa de seis más grande.

**Fase 3 — Espectador** *(depende de 1; no depende de 2)*
- Butaca sin cuerpo, cámara libre, ciclar vistas, cabeceo en la foto, marcador de
  pantalla grande.
- El retraso, del servidor, apagable en LAN.

**Fase 4 — Lobby de evento** *(depende de 1 y de la fase 1 de la propuesta 07)*
- Apodo de invitado, lobby con código en el huésped local, lista de jugadores,
  crear partidas desde ahí.

**Fuera, y con su dependencia escrita:** cámaras de televisión (después del
retraso y de un sistema de interés), brackets (después de la fase 2 de la
propuesta 07), y **más de una máquina** — que hoy no se puede (vuelta 59: las
salas viven en la memoria del proceso) y que esta propuesta no necesita, porque
con las dos palancas de §2 caben varias salas de 10 en la que hay.

---

## 10. Lo que se recomienda no hacer

- **No empezar por el 5v5.** No es «3v3 con más gente»: es el primer sitio donde
  el tráfico y el mapa dejan de ser un ajuste.
- **No construir equipos antes del protocolo.** Con la foto de hoy, un 3v3 son
  1.5 MB/s por sala y el primer partido de verdad se cae solo.
- **No meter el retraso del espectador en el cliente.** No protegería de nada.
- **Y no convertir el lobby en matchmaking.** La vuelta 47 decidió que no hubiera
  registro de salas, y lo que aquí se abre es un registro **de una sala física**.
