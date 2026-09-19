# Roadmap — Vektor by FlickLAB

Recopilación de **todo lo que se ha dicho que vendría después**, en un sitio, para
no tener que reconstruirlo cada vez rebuscando en `docs/decisions.md` o en la
conversación de la vuelta en que salió.

**Qué es:** un inventario ordenado por dependencia. Cada entrada dice de dónde
sale, qué tiene que existir antes, cómo se sabría que está bien y qué toca de lo
que ya está construido.

**Qué no es:** un compromiso. No hay fechas, ni orden dentro de una fase que sea
obligatorio, ni promesa de que nada de esto se construya. La regla de
`CLAUDE.md` §6 sigue mandando por encima de este fichero: **si el encargo no lo
pide explícitamente, no se añade**. Un renglón aquí no autoriza una vuelta.

Y lo que aquí es un renglón **es un renglón a propósito**. Apuntar una idea no es
diseñarla: cuando a una le llegue el turno, lo que se escribe es una propuesta en
`docs/propuestas/`, con su evaluación y sus números, como se hizo con el escenario
de cobertura y con el 1v1.

---

## Cómo se lee

Las fases van **por dependencia, no por calendario**. La 2 no es «el mes que
viene»: es «esto necesita que la 1 exista». Dentro de una fase el orden es
discutible; entre fases, no tanto.

Tres etiquetas por entrada, cuando aportan algo:

- **Bloqueante** — lo que tiene que estar antes. Si dice «nada», se puede coger ya.
- **Medible** — qué banco lo cerraría. Si no se sabe medir, no está listo para
  construirse: es la regla de siempre.
- **Rompe** — qué convención o qué pieza existente habría que revisar.

---

## La decisión de secuencia: primero el navegador

**Ya está tomada, y ordena buena parte de lo de abajo.**

Vektor prioriza **el navegador como vía principal de crecimiento** mientras el
juego busca sus primeros jugadores reales. El motivo es una ventaja concreta y no
una preferencia técnica: **cero fricción de instalación**. Un enlace que se pega
en un chat y se abre en el momento, contra las herramientas con las que se compara
—Kovaak's, Aim Lab— que exigen descargar, instalar y, en un caso, comprar antes
de haber apuntado a nada. Esa distancia entre «me lo has contado» y «estoy
jugando» es hoy lo mejor que tiene el producto, y no se regala.

**El launcher nativo con UDP se construye más adelante, sobre el mismo código**,
el día que exista una comunidad pidiendo ese nivel de precisión competitiva. No
antes. Construirlo ahora sería ponerle una instalación por delante a un juego que
todavía no tiene a quién pedírsela — o sea, gastar la única ventaja que tiene
para resolver un problema que aún no tiene nadie.

Dos cosas que hacen que esto sea una secuencia y no una renuncia:

- **La ambición competitiva está escrita y sigue en pie**, con su porqué, en
  `docs/decisions.md` §0.2. Lo que se decide aquí es **cuándo**, no **si**.
- **«Sobre el mismo código» es literal, y está construido.** El netcode no sabe
  qué hay debajo: el transporte son tres funciones (más un aviso). Cambiar de
  WebSocket a UDP es escribir esas funciones otra vez, no rehacer predicción,
  reconciliación ni compensación de retraso. Por eso ese aislamiento **no se
  rompe por comodidad** aunque falten años para usarlo: es lo que hace que este
  aplazamiento no cueste nada.

Mientras tanto, lo que sí se puede hacer por la latencia dentro del navegador
—elegir bien dónde vive el servidor, y que el netcode siga midiéndose— ya se está
haciendo. Y la única cosa que de verdad urgía de este apartado, que el juego
**esté** desde España, es la fase 1.0 y está hecha.

---

## Fase 0 — De dónde se parte

No es trabajo, es el punto de partida, y está aquí porque la mitad de lo de abajo
se apoya en cosas que ya existen y no se ven.

- **Un 1v1 jugable de verdad**, desplegado, con el motor completo delante
  (vueltas 45-57): predicción, reconciliación, compensación de retraso, abatido
  autoritativo, pausas con voto y avisos de conexión. Error de reconciliación
  cero hasta 300 ms de RTT.
- **La partida no sabe de red** (`net/partida.js`) y la corren dos huéspedes, Node
  y un Durable Object. Añadir un tercero es escribir reloj y cable, no reglas.
- **El código de la partida es la dirección del Durable Object**: no hay lista de
  salas, ni matchmaking, ni nada que limpiar.
- **Huecos ya abiertos a propósito**, que son medio trabajo hecho de varias cosas
  de abajo: `instance.friendly` existe en `false`; el marcador de TAB es una
  rejilla con **una** fila y sitio para más; las teclas **3**, **5** y **G** tienen
  bind y no tienen lógica; `_equipUltimate` es un método vacío; la puntuación
  normaliza por suma de pesos, así que una variable nueva entra sin tocar la
  fórmula.

---

## Fase 1 — Que una partida entre dos aguante una tarde

El duelo se juega, pero **no se sostiene**: no hay forma de volver si se cae la
línea, no hay forma de ganar, y falta la mitad de lo que el juego ya sabe hacer.
Nada de esta fase necesita cuentas, ni servidor nuevo, ni dinero.

### 1.1 Reconexión tras desconexión

Hoy, de las tres formas de quedarse fuera —`ADIOS`, cable cortado y silencio de
`NET.offlineMs`— las tres **se avisan** (vuelta 51) y ninguna **se arregla**: el
aviso rojo es definitivo y lo único que queda es recargar, que es entrar como un
jugador nuevo.

Lo que ya juega a favor: **el número de paso se conserva entre visitas** y el
mundo se para cuando la sala se queda vacía (vuelta 47, medido en `sala47.mjs`
[6]: 14 pasos en 5,4 s vacía, y los 14 son la reconexión). O sea que volver a una
sala **no es empezar otra partida** — eso ya está.

Lo que falta es identidad de sesión: hoy el id es un contador (`p1`, `p2`) y la
ranura sale de la primera libre, así que quien vuelve es alguien distinto, con
otro color y otra salida. Hace falta que el servidor guarde la ranura un rato y
que el cliente sepa reclamarla.

- **Bloqueante:** nada. Es la primera que se puede coger.
- **Medible:** matar el socket a mano, volver, y comprobar que vuelves a **tu**
  ranura, con tu color y tu marcador; y que el rival no ha visto aparecer a un
  tercero. `aviso51.mjs` ya sabe cortar el cable de verdad.
- **Rompe:** la asignación de ranura de la vuelta 49 («la primera libre») pasa a
  tener un estado intermedio, *reservada*. Ojo: liberar tarde deja una sala de dos
  que no admite a nadie.

### 1.2 Condición de victoria

Un duelo que no acaba no es una partida, es un banco de pruebas. Y hay una
decisión vieja esperando justo a esto: **en Deathmatch no salen estrellas**
porque media fórmula es el tiempo contra el explosivo, y «el día que el modo
tenga condición de victoria, se revisa» (`CLAUDE.md`, convenciones).

- **Bloqueante:** nada.
- **Medible:** que la sesión termine en los dos clientes en el **mismo paso**, no
  en el mismo milisegundo de nadie — es la regla del reloj de la red.
- **Rompe:** `SESSION_MODES` y el resumen final, que hoy sólo sabe de la bomba.

### 1.3 El HUD del duelo, entero

De la vuelta 56 quedó dicho qué falta y por qué: el **contador permanente de
bajas** «espera al HUD completo», y el marcador de TAB tiene la rejilla lista
para la segunda fila desde la vuelta 41 — con una sola fila, la tuya, porque una
lista de rivales inventada diría que hay multijugador cuando no lo había.

- **Bloqueante:** nada para las bajas; el nick de verdad (2.1) para que la segunda
  fila diga algo más que `p2`.
- **Rompe:** nada. Los dos huecos se dejaron abiertos exactamente para esto.

### 1.4 Escudo y casco en el duelo

Se dejaron fuera de la vuelta 56 **a propósito**: sólo vida. El modelo ya existe
entero en local —tres segmentos de 50, absorción por arma, casco binario, la
cabeza que no cubre nadie— y lo que falta es moverlo al lado autoritativo y que
viaje en la foto.

Es además **la primera mitad de la economía** (fase 5): un escudo que se recoge
del suelo es el mismo objeto que un escudo que se compra.

- **Bloqueante:** nada técnico; sí una decisión de diseño —si en el duelo hay
  recogibles por el mapa o no, que es una pregunta de ritmo, no de código—.
- **Medible:** que el cliente prediga el consumo de escudo sin corrección, igual
  que se midió la reaparición en la 52.
- **Rompe:** la foto crece. Ver *Deuda: el protocolo*.

### 1.5 Las tres señales de que te disparan, contra un rival de verdad

Los iconos `?` / `!`, el fogonazo y el silbido se quedaron fuera de la 56 y **no
por olvido**: dicen en qué fase está quien te dispara, y esa máquina de estados
(`enemyFire.phaseOf()`) hoy sólo existe para los muñecos. Un jugador no tiene
«ventana de reacción».

Lo interesante es que la respuesta correcta ya está anotada desde la vuelta 37:
la fase **la publica quien la tiene**, no la deduce quien la pinta. Contra un
rival eso significa que el disparo tiene que viajar en la foto — y la vuelta 56 ya
dejó escrito que ése es el día en que esto se puede hacer.

- **Bloqueante:** que el disparo del rival viaje en el estado.
- **Rompe:** el fogonazo y el silbido son mundo, no interfaz, y los dos llevan
  presupuesto por frame. Medir antes de encenderlos con más de dos jugadores.

### 1.6 Deslizamiento (*slide*) — **hecho en la vuelta 69**

Pedido en la vuelta 68 y **ya diseñado**:
`docs/propuestas/04-deslizamiento.md`. Correr y agacharse para tirarse al suelo
conservando la marcha, salir soltando la tecla o saltando.

Va **la última de esta fase a propósito**, aunque no dependa de nada: es una
mecánica de movimiento, o sea de lo que más se nota y lo más difícil de deshacer
una vez que la gente la tiene en los dedos, y que la partida aguante una tarde
pesa más. La propuesta trae el diseño entero, los tres sitios donde puede romper
el juego y la ventana para revertirlo.

Y trae **una corrección del encargo** que conviene no perder: el gesto pedido era
W + CTRL + SPACE, y **Ctrl+W cierra la pestaña** (convención de la vuelta 27). El
gesto propuesto es correr + agacharse, con SPACE como salida.

- **Bloqueante:** nada.
- **Medido** (`slide69.mjs`): **4.20875 u en los tres refrescos**, dispersión
  0.0000%, una vez que el avance dejó de ser `v·dt` y pasó a ser la diferencia
  de dos distancias cerradas. Y el resto de §5: 1 deslizamiento manteniendo la
  tecla, salto a 6.5 y no a 9.43, 0 u de desvío girando 180°/s, cero
  correcciones en `red45` y el interruptor apagado dejando el paseo en la misma
  coordenada hasta el último decimal.
- **Rompe:** la marcha congelada del despegue (deslizarse y saltar llegaría al
  techo del aire gratis), el hitbox-silueta de la vuelta 65 con un blanco bajo y
  rápido, y levantarse debajo de una caja, que hoy no se comprueba porque no hacía
  falta.

---

## Fase 2 — Saber quién juega

Todo lo de las fases 3 a 6 —ranking, mapas de comunidad, economía, cobrar—
necesita **una identidad que sobreviva a la partida**. Hoy eres `p1` o `p2` y la
partida muere con la sala, que es exactamente lo que se decidió en la vuelta 47 y
sigue siendo lo correcto mientras no exista nada de esto.

### 2.1 Nicks e identidad de sesión

El paso pequeño: que te llames algo, que el rival lo vea en su ficha flotante y en
el marcador, y que dure lo que dure la partida. Sin cuentas todavía. El nick
placeholder (`VK-00`, `VK-01`) y `instance.friendly` están puestos desde la
vuelta 38 esperando esto.

- **Bloqueante:** nada.
- **Rompe:** un nick es texto de otro jugador dibujado en tu pantalla. Es la
  primera entrada de datos ajenos que tiene el juego, y hay que tratarla como tal.

### 2.2 Cuentas y persistencia

El salto de verdad, y el que abre la puerta a lo que hoy está fuera de alcance por
decisión: guardado en la nube, rankings, historial. Cambia la forma del backend —
hoy no hay ninguno más allá de un Durable Object por código— y cambia la
naturaleza del proyecto: pasa a haber datos de personas.

- **Bloqueante:** 2.1, y decidir **qué** se guarda antes de decidir dónde.
- **Rompe:** `sanitizeSettings` y el store de localStorage dejan de ser la única
  fuente de ajustes; hay que decidir quién gana cuando los dos discrepan. Y el
  coste de la nube pasa a tener una segunda partida además de las salas.

### 2.3 SDK Social de Discord

Idea recogida: apoyarse en el **SDK Social de Discord** en vez de construir la
capa social desde cero — identidad, lista de amigos, invitaciones a partida y
presencia. Encaja bien con la forma que ya tiene el producto: una partida **es**
un enlace con un código de seis caracteres, que es justo lo que se pega en un chat.

Puede además atajar buena parte de 2.2: si la identidad la pone Discord, lo que
hay que guardar es mucho menos.

- **Bloqueante:** 2.1. No necesariamente 2.2 — puede ser **en lugar de** buena
  parte de ella, y ésa es la decisión que hay que tomar antes de escribir nada.
- **Rompe:** una dependencia de plataforma de tercero, que es justo el riesgo 3 de
  la propuesta 02 («infraestructura general y no *game servers*») aplicado a la
  capa social. Hay que decidir si el juego sigue jugándose sin Discord — y la
  respuesta de hoy tendría que ser que sí: el enlace por código no puede dejar de
  funcionar.

---

## Fase 3 — Más de dos, y que importe

### 3.1 Modo de eliminación, todos contra todos

Varios jugadores en el mismo mapa, se cae el que cae, gana el que queda. **Sin
cajas de botín y sin air drops** — está dicho explícitamente y va en *Lo que se
descarta*, abajo, con el porqué.

Lo que esto le pide al netcode no es poco, y conviene verlo antes de empezar:

- **La foto se manda entera a todo el mundo** (vuelta 45). Con dos da igual; con
  ocho es cuadrático y además es **wallhack por protocolo**, porque el cliente
  recibe dónde está todo el mundo. Ver *Deuda: el protocolo*.
- **El cupo de zona y el sesgo de aparición** están pensados para un jugador y
  ocho muñecos. Con N jugadores la pregunta «¿se ve desde dónde?» tiene N
  respuestas.
- **Las pausas.** La vuelta 55 dejó la votación escrita para generalizar —«quien
  no contesta se suma al que va ganando», con el empate sin aprobar, es
  exactamente la regla de más de un rival—. Eso ya está pensado; en 1v1 no se
  nota, con cuatro sí.
- **El marcador de TAB** pasa de una fila a N, que es para lo que se hizo rejilla.

- **Bloqueante:** 1.1 (con ocho jugadores, alguien se cae siempre), 1.2, el
  protocolo por jugador, y **encaminar por código hasta la misma máquina**. Esto
  último es nuevo desde la vuelta 59 y es fácil de pasar por alto: las salas
  viven en la memoria del proceso, así que hoy la aplicación es de **una sola
  máquina**. Cloudflare lo daba gratis —`idFromName(código)` era el encaminado—;
  en Fly hay que ponerlo (`fly-replay` o equivalente) **antes** de escalar, no
  después.
- **Medible:** el coste por paso con N jugadores contra el presupuesto de siempre,
  y el ancho de banda. El servidor no era el problema con dos —2,55 µs por paso—;
  lo caro es el netcode, y eso escala distinto.

### 3.2 Modo FlickLAB, con ranking

El modo con marca: partidas que cuentan, con clasificación. Es lo que convierte a
Vektor en algo a lo que se vuelve, y es también donde todo lo que hoy da igual
**empieza a importar**.

Dos avisos que ya están escritos en el repositorio y que son de esta entrada:

- **Trampas** (riesgo 4 de la propuesta 02): con servidor autoritativo siguen
  siendo posibles el aimbot y el wallhack. «Entre amigos da igual; el día del
  matchmaking público, no.»
- **El rebobinado** (vuelta 46): `tv` lo manda el cliente y el tope de 200 ms es
  lo que acota a quien mienta, pero «el día que haya partidas públicas habrá
  además que contrastar `tv` con lo que el servidor sabe del ping de ese cliente».

- **Bloqueante:** 2.2 o 2.3 (sin identidad persistente no hay clasificación), y
  antitrampas (ver *Deuda*). Matchmaking, que hoy no existe **por diseño**: el
  código de sala es la dirección del Durable Object, y un emparejamiento público
  necesita lo contrario, un registro de partidas.
- **Rompe:** la decisión de la vuelta 47 de no llevar lista de salas. No es un
  fallo de aquella decisión: era la correcta para lo que había.

### 3.3 Planos B y C

*El Patio* (núcleo macizo, túnel, atalaya, cuatro bolsillos y anillo) y *La
Ejecución*, los dos ya diseñados en `docs/propuestas/01-escenario-cobertura.md`.
La instrucción vigente es explícita: **no construirlos hasta que el Plano A esté
validado jugando**.

Van en esta fase y no antes por eso: lo que valida un mapa es gente jugándolo, y
gente jugándolo es la fase 3.

- **Bloqueante:** el Plano A validado jugando.
- **Medible:** `rutas-buscar.mjs` ya sabe barrer un plano y decir cuántas rutas y
  cuántos puntos admite. Donde no hay conjunto limpio, no hay ruta.

---

## Fase 4 — Mapas de comunidad

Que la gente haga mapas. Hoy un escenario es un dato —`SCENARIOS`, veinte cajas y
una `spawnZone`— y **eso es la mitad del trabajo hecho**: la miniatura se dibuja
desde los datos, las rutas se barren desde los datos, la sala sale del escenario
y no de `ROOM`. Un mapa de comunidad es, en lo técnico, un `SCENARIOS` que no
viene en el build.

Lo que falta no es el formato, es todo lo demás:

- **Validación.** Un mapa sin rutas limpias no es un mapa: `rutas-buscar.mjs` tiene
  que poder correr sobre lo que suba alguien, y decir que no cuando toque.
- **Distribución.** Dónde vive un mapa que no está en `dist/`, y cómo llega a los
  dos clientes de una partida **idéntico** — que los dos extremos simulen el mismo
  mundo es la condición de todo el netcode, no un detalle.
- **Moderación.** Contenido de terceros. Es una decisión de producto antes que de
  código.
- **Un editor**, o no. Hoy un mapa se escribe a mano en un fichero de datos, y
  eso ya es utilizable por alguien técnico.

- **Bloqueante:** 2.2/2.3 (subir algo pide saber quién lo sube) y almacenamiento,
  que hoy es deliberadamente cero: «una partida vive en memoria y muere con la
  sala».
- **Rompe:** la convención de que **no hay assets externos**. Un mapa de comunidad
  es dato, no asset, y esa distinción hay que mantenerla con cuidado: geometría
  procedural sí, ficheros binarios de terceros no.

---

## Fase 5 — Economía completa

Hoy la armería **equipa y nada más**, sin precios, sin dinero y sin botón de
comprar, y está escrito por qué: «comprar depende de rondas y de una economía que
no existen, y un `$0` en la ficha prometería una mecánica que no hay» (vueltas 42
y 43). Esta fase es hacer que existan.

El orden importa, porque cada pieza depende de la anterior:

### 5.1 Rondas

No hay economía sin rondas: el dinero es lo que sobrevive de una ronda a la
siguiente. Es una decisión de modo antes que de tienda, y por eso va la primera.

- **Bloqueante:** 1.2 (una ronda necesita saber acabar).

### 5.2 Escudo, casco y consumibles con precio

El equipo defensivo ya está construido entero y ya se recoge del suelo. Ponerle
precio es el paso corto — y es la razón de que 1.4 esté donde está: el escudo en
red es el mismo objeto que el escudo comprado.

- **Bloqueante:** 1.4 y 5.1.

### 5.3 Precios del arsenal

Tres armas, dos ranuras, y la pistola que va siempre. La estructura de la decisión
ya está: la principal es la que se elige y la que paga —en peso hoy, en dinero
mañana—, y la pistola no cuesta velocidad porque «la que se lleva siempre no puede
costar, o el coste estaría en no haber elegido». Un precio es esa misma frase con
otra moneda.

- **Bloqueante:** 5.1.
- **Rompe:** las tres reglas de forma de la armería (vuelta 43), en particular la
  primera: **un solo botón grande por ficha, y es la acción**. Comprar y equipar
  son dos acciones, y meter la segunda sin romper esa regla es el diseño de esa
  vuelta, no un añadido.
- **Ojo:** la armería se abre **pausando**. Con rondas y economía, «pausar para
  comprar» deja de ser gratis, y en red la pausa la decide el servidor.

---

## Fase 6 — Monetización

La fase de la que menos hay escrito, y se queda así a propósito: lo recogido hasta
hoy son las **restricciones**, no un plan.

Lo que hay:

- **El suelo de coste está medido.** El plan gratuito de Cloudflare da ~4,6 horas
  de 1v1 al día (100.000 peticiones, a 6 peticiones por segundo de partida), y el
  de pago son 5 $/mes con ~46 horas incluidas y «menos de 1 $ por cada 100 horas
  de más». O sea: el coste marginal de una partida es **calderilla**, y lo que se
  monetiza no tiene por qué ser el servidor.
- **Las cajas de botín y los air drops están descartados**, y no por coste. Ver
  abajo.
- **Los tintes y las skins están descartados hoy**, y por una razón que es de
  diseño y no de negocio: «no hay assets y el color está ocupado — el naranja es
  de las dianas y el verde de la acción. Un arma teñida rompería la lectura del
  mapa». El día que haya paleta de sobra, se revisa; hoy no la hay — los dos únicos
  tonos libres se los llevaron los equipos en la vuelta 38, y el neutro de
  `COLORS.decline` fue lo que quedó en la 55, medido en CIELAB porque ya no había
  hueco evidente.

Lo que **no** hay y hace falta antes de escribir una sola línea: qué se vende, a
quién, y qué pasa con quien no paga. La respuesta a la última condiciona todo lo
demás, y la única regla que este proyecto ya tiene de fábrica es la de arriba
—nada que cambie lo que ves en el mapa—.

- **Bloqueante:** 2.2/2.3 y 5. No se cobra sin cuentas y sin economía.

---

## Fase 1.0 — Salir de la IP compartida *(hecha en la vuelta 58)*

Confirmado dos veces sobre el despliegue real: el bloqueo de IPs de Cloudflare que
LaLiga ordena a las operadoras españolas deja el juego **inaccesible desde España
en jornadas con partido**. No es hipotético y no se arregla desde dentro de
Cloudflare —el bloqueo es por IP entera e ignora el SNI, así que se lleva por
delante la página igual que la partida—.

Va delante de todo lo demás por una razón sencilla: lo de arriba son cosas que
harían el juego mejor, y esto es que el juego **no está** los días en que se
juega. La evaluación, con números y recomendación, está en
`docs/propuestas/03-servidor-con-ip-propia.md`.

**Hecho.** La premisa se confirmó desde España con el bloqueo activo —`fly.io`
cargaba mientras el despliegue de Cloudflare seguía caído— y la vuelta 58 movió
las dos cosas a un huésped de Node con IPv4 dedicada en Fly.io. El cliente no
cambió una línea y `net/partida.js` tampoco; los bancos de red pasaron contra el
huésped nuevo sin tocar una aserción, que era el listón de la 47.

Lo que queda de esta fase, y no corre prisa: **retirar `worker/`** y la
dependencia de `wrangler` cuando el despliegue nuevo lleve semanas funcionando.
Hasta entonces se queda como respaldo.

---

## Deuda que arrastra todo lo de arriba

Transversal: no es una fase, es lo que hay que ir pagando según se sube.

### El protocolo

**La foto se manda entera a todo el mundo**, en JSON, sesenta veces por segundo.
Está anotado desde la vuelta 45 como «la primera optimización obvia» y desde la
47 con su precio en la nube, porque los mensajes que entran se cuentan. Los 24
campos del estado son para que reejecutes **tu** movimiento; del rival sólo se
dibujan cinco. Mandar a cada uno lo suyo baja la foto a la mitad, y en binario
(24 `Float32` son 96 B) a menos de la sexta parte.

Tres cosas de arriba lo convierten en bloqueante: **más jugadores** (3.1), porque
es cuadrático; **más estado** (1.4, 1.5), porque la foto crece; y **el wallhack por
protocolo** (3.2), porque hoy el cliente recibe dónde está todo el mundo y ninguna
cantidad de antitrampas arregla eso.

### Antitrampas

Aimbot y wallhack siguen siendo posibles con servidor autoritativo. Dos cosas
concretas ya identificadas: contrastar `tv` con el ping que el servidor conoce, y
dejar de mandarle a cada cliente lo que no tiene que ver. Ninguna urge entre
amigos; las dos son requisito de 3.2.

### Dos páginas, un juego

El duelo es `net/prueba.html` y el juego es `index.html`. Fue la decisión correcta
en la 45 y sigue siéndolo, pero el duelo ya hospeda el motor completo (56) y tiene
su propio menú, su propio HUD y su propia pausa. En cuanto haya modos y cuentas,
mantener dos menús es mantener dos productos.

### Lo que se miró y se dejó fuera, y conviene no volver a proponer

- **Hibernación de WebSockets** (vuelta 47): la API sirve para conexiones calladas;
  aquí llegan 60 mensajes por segundo y por jugador, y un reloj de 60 Hz **impide**
  hibernar por definición. No hay nada que ganar.
- **Daño por arma, sensibilidad por arma, mira por arma, preajustes de
  equipamiento** (vuelta 43): o el juego no tiene el dato, o no hay nada que
  preajustar. Un panel que los ofrezca miente.

---

## Lo que se descarta a propósito

Por decisión, no por olvido — la misma lista que `CLAUDE.md` §6, con lo que este
fichero añade.

- **Cajas de botín (*loot boxes*) y air drops.** Dicho explícitamente al plantear
  el modo de eliminación: ese modo se quiere **sin** ellos. Encaja con lo que el
  juego ya es: un aim trainer donde lo que decide una pelea es apuntar, y un
  objeto que cae del cielo es exactamente lo contrario de eso.
- **Cualquier cosa que cambie lo que ves en el mapa.** Es la regla que sale sola de
  la decisión de las skins: la lectura del mapa es del juego, no de la tienda.
- **Minimapa.** Fuera desde el principio. (Los **pasos sonoros** estaban aquí
  hasta la vuelta 60: se aparcaron «hasta que hubiera multijugador», lo hubo, y
  se construyeron.)
- **Matchmaking público antes de antitrampas.** No es una prohibición moral, es el
  orden: abrir partidas públicas sin 3.2 resuelto es publicar el problema.

---

## Y una nota de método

Lo de arriba son ideas, y una idea no es un encargo. Cuando una entre, entra como
han entrado las cincuenta y siete vueltas anteriores: una vuelta, un alcance
cerrado, un banco que pueda fallar y la documentación en el mismo commit.

Y la pregunta de la vuelta 57 vale para todas: **de cuántos frames sale ese
número**.
