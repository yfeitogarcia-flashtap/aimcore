# Propuesta 11 — Salas de varios, espectador y lobby de evento

**Estado: escrita, sin construir.** Es el bloque que el encargo de la vuelta 97
puso por delante de las propuestas 08 (armas del mapa) y 09 (perforación).

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

**Fase 1 — La sala deja de ser de dos** *(la gorda, y la que hay que medir)*
- Separar `ranura` de `equipo`, con el 1v1 saliendo dígito a dígito igual.
- `duelo.salidas` como lista de N, y el tope de la sala derivado de su longitud.
- **La foto por destinatario y por distancia**, y su ritmo bajado (§2).
- **Todos contra todos**: marcador, cronómetro, reaparición — nada de rondas.
- Medida de cierre: una sala de 10 por debajo de **700 KB/s** y con error de
  reconciliación cero, que es el listón que `red45` lleva midiendo desde la 45.

**Fase 2 — Equipos** *(depende de 1)*
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
