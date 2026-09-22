# Propuesta 07 — Cuentas, sesión y presencia en vivo

**Estado:** **diseñada, sin construir nada.** El encargo (vuelta 92) fue
exactamente eso: «igual que hicisteis con el editor de mapas: proponednos una
división en fases, empezando por lo mínimo imprescindible para que exista una
cuenta y una sesión, y qué de esta lista encaja en cada fase».

**Qué se pide:** un listado en la pantalla de inicio de los jugadores conectados
ahora mismo, desde el que se pueda **invitar a un duelo**, **agregar a amigos**,
**ver estadísticas** e **invitar a un grupo** cuando exista multijugador por
equipos; más **login o jugar como invitado**.

**Y lo que desbloquea**, que es la mitad de por qué merece la pena: el **buscador
de partidas** que la vuelta 88 aplazó, el **sistema de rangos** de
`docs/roadmap.md` §3.2, y la visión de comunidad de **Vektor Alchemist** (§4 del
roadmap) — que hoy no puede existir porque un mapa no tiene autor.

---

## 0. La respuesta corta

**Son seis fases, y la primera no tiene servidor de cuentas.**

| Fase | Qué existe al acabarla | Lo caro |
|---|---|---|
| **1** · Identidad de invitado | Te llamas algo y el rival lo ve | Nada nuevo: es texto ajeno en pantalla |
| **2** · La cuenta mínima | Login, y tu nick es tuyo | **El primer servidor con estado**: base de datos y sesiones |
| **3** · Presencia | Quién está conectado ahora | Un canal vivo, y **decidir quién te ve** |
| **4** · Invitar y amigos | Retar desde la lista; lista de amigos | Dirigir un mensaje a alguien que no está en tu sala |
| **5** · Estadísticas y rangos | Tus números, y una escalera | **El servidor tiene que contar**, y hoy no cuenta |
| **6** · Grupos | Entrar juntos a una partida | Bloqueada por el multijugador por equipos, que no existe |

De la lista del encargo: **invitar a duelo** cae en la 4, **agregar amigo** en la
4, **ver estadísticas** en la 5 y **invitar a grupo** en la 6. El **login o
invitado** se reparte entre la 1 (invitado) y la 2 (login).

Y una advertencia de tamaño, porque es la diferencia con el editor de mapas:
**el editor era una pantalla sobre lógica que ya existía** (propuesta 05 §1).
Esto no. Aquí, a partir de la fase 2, hay que montar y **mantener** una pieza
que Vektor no tiene hoy de ninguna forma: un servicio con datos de personas que
sobrevive a que se apague la sala. El primer coste no es escribirlo, es que a
partir de ese día hay copias de seguridad, migraciones y una política de datos.

---

## 1. De dónde se parte, que es más de lo que parece

Igual que en la propuesta 05, conviene inventariar antes de diseñar:

| Lo que hace falta | Lo que ya hay |
|---|---|
| Un sitio donde enseñar la lista | **La pantalla de inicio en tres pasos** (vuelta 92). El segundo paso ya es «¿a qué juegas?» y es exactamente donde va. |
| Un nick por jugador | El placeholder `VK-00` y `instance.friendly` están puestos **desde la vuelta 38** esperando esto, y `markers.js` ya dibuja la ficha con nick. |
| Invitar a alguien a una partida | Una partida **es un enlace** (`enlaceDeSala`, vuelta 47). Invitar es mandar ese enlace: no hay que inventar un formato. |
| Una sala a la que llegar | `idFromName(código)` / el encaminado por código del huésped de Node. No hay registro de salas **a propósito** (vuelta 47), y eso hay que respetarlo — ver §3. |
| Un servidor propio | El huésped de Node en Fly, con IPv4 dedicada (vuelta 58). Ya hay una máquina nuestra en la que poner cosas. |
| Un canal vivo con el navegador | El transporte de cuatro funciones (`send`/`onMessage`/`close`/`onClose`, vueltas 46 y 51). Un WebSocket de presencia es **otro transporte**, no un netcode nuevo. |
| Contar bajas y muertes | El marcador de sesión (TAB) los cuenta **en el cliente**, y el servidor cuenta rondas ganadas por ranura. |

O sea: la forma del producto ya encaja. Lo que no hay es **estado que sobreviva
a la sala**, y ése es todo el proyecto.

---

## 2. Fase 1 — Identidad de invitado (sin servidor)

**Lo mínimo imprescindible para que exista «una sesión»**, y a propósito **no
necesita cuentas**: te pones un nombre, se guarda en tu navegador, viaja en la
bienvenida y el rival lo ve en su ficha flotante y en el marcador.

Qué se construye:

- Un campo de nick en el segundo paso del menú, con un nombre sugerido
  (`VK-4821`) para que jugar no exija rellenar nada.
- Se guarda como los ajustes: store con **saneado**, que aquí no es una
  formalidad — ver abajo.
- Viaja **en la bienvenida**, que es donde ya viaja todo lo que se decide al
  entrar (la ranura, el pase, el mapa). No en la foto: no cambia sesenta veces
  por segundo.
- `markers.js` y el marcador dejan de escribir `VK-01` y escriben el que llegue.

Lo que hay que respetar, y es lo único delicado de esta fase:

- **Un nick es la primera entrada de datos ajenos que tiene el juego.** Hoy todo
  lo que se dibuja en tu pantalla lo ha producido tu propio cliente o el
  servidor. Un nick lo escribe una persona. Se acota en largo, se acota el
  alfabeto y se dibuja **como texto y nunca como HTML** — y como la ficha
  flotante es DOM en 3D (`CSS3DRenderer`), eso hay que mirarlo a mano.
- **El saneado es el de siempre** (`sanitizeSettings`): lo que llegue raro cae al
  valor de fábrica, que aquí es el nombre sugerido. Nadie se queda sin nombre.

**Coste:** pequeño. **Bloqueante:** nada. **Se puede hacer mañana.**

---

## 3. Fase 2 — La cuenta mínima

**Aquí empieza el proyecto de verdad**, y conviene decirlo sin adornos: es la
primera vez que Vektor tiene un servidor con estado.

Lo mínimo que es una cuenta:

- **Identificarse.** Correo con enlace mágico, o un proveedor (Google, Discord).
  Contraseñas propias no, porque eso es guardar secretos de personas y ninguna
  parte del encargo lo pide.
- **Un identificador estable** y un nick que es tuyo y no se repite.
- **Una sesión**: un testigo que el navegador guarda y manda, con caducidad.
- **Y jugar de invitado sigue existiendo, en igualdad.** No es una versión
  recortada: es la fase 1 entera, sin persistencia. Esto no es generosidad —
  **es lo que protege la promesa del enlace**: una partida es un código de seis
  caracteres que se pega en un chat, y eso no puede dejar de funcionar porque
  alguien no tenga cuenta. Es la misma regla que ya se le puso al SDK de Discord
  en el roadmap (§2.3): «el juego sigue jugándose sin ello».

Dónde vive, que es la decisión de arquitectura:

- **En el huésped de Fly, no en otro sitio.** Ya es nuestra máquina con IP
  propia, y el principio permanente de la vuelta 58 (`decisions.md` §0.1) dice
  que **todo lo que un jugador visite directamente** —y una API de login lo es—
  va en infraestructura con IP propia. Cloudflare queda para lo que no sirve
  tráfico a un jugador.
- **Con una base de datos de verdad y pequeña** (SQLite en un volumen, o
  Postgres gestionado). Aquí no se improvisa: es el primer dato que, si se
  pierde, no se puede regenerar desde el código.
- **Y `net/partida.js` no se entera.** La regla de la vuelta 47 —el huésped pone
  el reloj y el cable; la partida pone el mundo— se mantiene: la cuenta se
  resuelve **antes** de sentar a nadie, y a `Partida` le sigue llegando un
  jugador con una función `enviar`. Si algún día hace falta el identificador
  dentro, entra como un campo más de la butaca, no como una dependencia.

Lo que rompe, y hay que decidirlo antes de escribir:

- **Los ajustes dejan de tener una sola fuente.** Hoy manda `localStorage`.
  Con cuenta hay dos, y hay que decidir quién gana. La respuesta que encaja con
  lo que el juego ya es: **manda el dispositivo**, y la cuenta guarda una copia
  para estrenar uno nuevo. La sensibilidad es del ratón que tienes delante.
- **Aparecen datos de personas**, con lo que eso trae. No es una línea de
  código, es una obligación permanente.
- **Y `localStorage` es por origen** (vuelta 60): la sesión se pierde al mudar
  de dominio, una vez. Conviene saberlo antes y no después.

**Coste:** el mayor de las seis. **Bloqueante:** fase 1.

---

## 4. Fase 3 — Presencia

Quién está conectado **ahora mismo**. Es lo que el encargo pide ver en la
pantalla de inicio.

Qué se construye:

- Un **WebSocket de presencia** contra el mismo huésped, aparte del de la sala.
  Y aparte no es un detalle: el de la sala tiene un reloj de 60 Hz y un
  protocolo de pasos; éste manda una lista cada pocos segundos. Meterlos en el
  mismo canal sería ponerle al netcode un mensaje que no tiene número de paso.
- Estado por jugador: **conectado**, **en partida** o **libre**, que es lo único
  que hace falta para saber a quién se puede retar.
- La lista, en el segundo paso del menú, junto a los dos modos.

Tres reglas que **son** el diseño:

- **No es un registro de salas, y no puede convertirse en uno.** La vuelta 47
  decidió que no hay lista de partidas porque `idFromName(código)` *es* el
  encaminado: no hay matchmaking ni nada que limpiar cuando una partida acaba.
  La presencia dice **quién está**, no **qué salas hay**. Si algún día hace
  falta el buscador de partidas (roadmap, aplazado en la 88), eso es una
  decisión aparte y con su propio precio.
- **Ser visible se elige.** Por defecto, sólo te ven tus amigos. Una lista de
  todo el mundo conectado es una lista de a quién molestar, y en un juego
  pequeño se nota antes que en uno grande.
- **Y la lista es datos ajenos**, como el nick: nombres que escriben otros,
  dibujados en tu pantalla.

**Coste:** medio. **Bloqueante:** fase 2.

---

## 5. Fase 4 — Invitar a duelo, y amigos

Las dos primeras acciones de la lista, y son **baratas** porque el producto ya
tiene la forma:

- **Invitar es mandar un enlace.** Creas la sala como ahora, y en vez de copiar
  el enlace a mano se le manda al otro por el canal de presencia. Le sale un
  aviso con quién le reta y a qué mapa, y aceptar es abrir esa dirección. **No
  hace falta ni una línea de netcode nuevo**: lo que viaja es una URL que ya se
  sabía construir (`enlaceDeSala`).
- **Amigos** es una relación guardada en la cuenta, con su petición y su
  aceptación. Es de lo más barato de esta propuesta una vez existe la fase 2.

Dos cosas que hay que construir aunque parezcan gratis:

- **Rechazar, y poder no recibir.** Una invitación que no se puede declinar es
  una notificación forzosa. Y hace falta **bloquear**, porque el día que se
  pueda mandar algo a alguien, se podrá molestar a alguien.
- **Una invitación caduca.** Un reto de hace veinte minutos lleva a una sala que
  ya no existe, y aceptar tiene que decir eso y no dejar una pantalla colgada
  —que es la lección de la vuelta 51: quedarse fuera se dice, no se sufre.

**Coste:** bajo, dado lo anterior. **Bloqueante:** fase 3.

---

## 6. Fase 5 — Estadísticas y rangos

«Ver estadísticas» del encargo, y con ella el sistema de rangos del roadmap.

Y aquí hay un hueco que conviene ver antes de prometer nada: **hoy el servidor
no cuenta casi nada**. Cuenta rondas ganadas por ranura, y ya. Las bajas, las
muertes y la precisión de una sesión las lleva **el cliente**, para su marcador
de TAB. Y eso es exactamente lo que no vale para un ranking: un número que
calcula el cliente es un número que el cliente puede escribir.

Así que esta fase es en realidad **dos**:

1. **Que el servidor cuente.** `Partida` ya ve todos los disparos y todas las
   bajas —los resuelve él desde la vuelta 56—, así que es llevar la cuenta y
   mandarla al final, no inventar un sistema. De paso resuelve el residuo
   anotado en la vuelta 88: la tabla con HS, KN, U2 y BOW por jugador, que se
   aplazó justamente porque *«son contadores por arma y por zona que nadie
   lleva»*.
2. **Que se guarde y se enseñe.** Perfil, historial y, encima de eso, rangos.

Un aviso que vale la pena dejar escrito: **un rango es una promesa de que el
juego es justo**. Hoy la mirilla es del cliente (vuelta 70) y el destello del
Titan se puede ocultar desde un cliente modificado — está anotado en la vuelta
90 como precio conocido. Mientras no haya ranking eso es una curiosidad; con
ranking, es lo primero que hay que cerrar. No bloquea la fase, pero sí bloquea
llamarla «competitiva».

**Coste:** medio-alto. **Bloqueante:** fase 2 (la 3 y la 4 no).

---

## 7. Fase 6 — Grupos

«Invitar a grupo» está **bloqueada por algo que no es de esta propuesta**: hoy
un duelo es de dos butacas y no hay multijugador por equipos. Un grupo es un
conjunto de gente que entra junto **a una partida que admite más de dos**, y esa
partida no existe — es la fase 3 del roadmap.

Lo honesto es dejarla fuera hasta entonces y no construir a medias un grupo que
sólo puede jugar en parejas.

**Coste:** desconocido, y ése es el motivo de dejarla la última.
**Bloqueante:** fases 2-4 **y** el modo de equipos.

---

## 8. Lo que se mira y se deja fuera

- **Chat.** Nadie lo ha pedido y es, con diferencia, lo más caro de moderar de
  todo lo de aquí. Un juego con lista de amigos no necesita chat propio: la
  gente ya está hablando en otro sitio, que es de donde sale el enlace.
- **Un buscador de partidas públicas.** Es una decisión aparte y va contra la
  vuelta 47 (§4). Si se quiere, se decide con su propio precio delante.
- **Cosméticos y monetización.** Roadmap §6, y no dependen de esto más de lo
  imprescindible.
- **Construir la identidad sólo sobre Discord.** Sigue siendo una buena idea
  para ahorrar la fase 2 (roadmap §2.3) y sigue teniendo el mismo pero: el
  enlace por código no puede dejar de funcionar sin Discord. Si se elige esa
  vía, la fase 1 no cambia y la 2 se reduce mucho — pero la regla de «se juega
  igual sin cuenta» pasa de ser una decisión de producto a ser lo único que
  sostiene el juego cuando un tercero se cae.

---

## 9. Qué hacer primero, si hay que elegir una

**La fase 1.** Cuesta poco, no compromete nada, y es la que se nota: hoy en un
duelo el rival se llama `VK-01`. Y deja hecho lo único de esta propuesta que
hay que escribir con cuidado aunque no haya servidor — tratar el nombre de otra
persona como datos ajenos.

Todo lo demás espera a que haya una razón concreta para pagar la fase 2, porque
esa fase no se deshace.
