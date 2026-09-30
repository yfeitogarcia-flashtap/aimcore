# Propuesta 16 — Integraciones con Discord

**Estado:** **propuesta, sin construir nada.** Escrita en la vuelta 108 a
partir del encargo de Yago, que pide valorar cuatro cosas —avisos por webhook, un
bot sencillo, Rich Presence desde la app de escritorio y Vektor como Discord
Activity— con su coste, su riesgo y un orden. **El Social SDK de Discord queda
descartado** de salida: no tiene versión web (sólo C++, Unity y Unreal; §6), y
Vektor es una página.

Todo lo que dice este documento sobre Discord se ha comprobado contra **la
documentación oficial**, leída del repositorio público de donde se genera
(`discord/discord-api-docs`), y contra el código del Embedded App SDK
(`discord/embedded-app-sdk`). Las webs de `discord.com` y `docs.discord.com` no se
pudieron abrir desde aquí; donde algo no está en esos dos repositorios se dice, y
§7 junta lo que queda sin verificar.

---

## 0. La respuesta corta

| | Qué | € | Días | Riesgo | Depende de la 14 |
|---|---|---|---|---|---|
| **A** | Webhooks: «partida lanzada», resultado, anuncio del mapa del mes | 0 | **1,5–2** (+1–2 el mapa del mes) | Bajo, **con una condición de privacidad** (§1.4) | No |
| **B** | Bot por **interacciones HTTP** en el mismo huésped: `/duelo` y rol de beta tester | 0 | **2–3** `/duelo`; **0** el rol a mano, **3–5** el rol automático | Bajo | `/duelo` no; el rol automático, **sí** |
| **C** | Rich Presence desde la ventana de Tauri | 0 | **3–4** + un `.exe` nuevo | Bajo; alcance pequeño | No |
| **D** | Vektor como Discord Activity | 0 | **1** de prueba; **15–25** el port | **Alto e incierto** | En parte |

**El veredicto sobre la D, que es lo que decide el orden:**

- **El WebSocket pasa por el proxy: sí, con certeza alta.** La documentación lo
  dice sin rodeos: «While we currently only support websockets, we're working with
  our upstream providers to enable WebTransport» y «WebRTC is not supported». Vektor
  sólo usa WebSocket, así que el cable encaja tal cual. Lo que **no** está dicho es
  cuánto retraso añade el salto por el proxy —que por dentro son Cloudflare
  Workers— ni si respeta la ruta y la consulta (`/sala/<código>?pase=…`); las dos
  cosas se miden en la prueba de un día.
- **El bloqueo del ratón (`requestPointerLock`) dentro del iframe de Discord: no
  confirmado.** La documentación oficial no lo menciona en ninguna parte —ni para
  permitirlo ni para prohibirlo—, no hay ningún *issue* en el repositorio del SDK
  que hable de ello, y no se pudo leer el atributo `sandbox`/`allow` del iframe del
  cliente. Los indicios apuntan en direcciones distintas (§4.3). **Grado de
  certeza: bajo.** Se decide con una prueba de un día, y sin ella no se escribe ni
  una línea del port.
- **Y aun funcionando las dos, la D choca con el principio de la IP propia**
  (`decisions.md` §0.1): el proxy de Discord **es Cloudflare**, que es justo lo que
  las operadoras españolas bloquean en días de partido. Eso no la mata —el juego
  seguiría en `fly.dev` para todo lo demás—, pero sí la convierte en un canal que
  puede caerse a la vez que Discord y sin que lo arreglemos nosotros.

**El orden recomendado** (§5): **A** primero —día y medio y es lo que más se ve—;
**la prueba de un día de la D** en paralelo, porque es barata y decide si merece
la pena todo lo demás; **B** con `/duelo` después, reutilizando la aplicación de
Discord que la prueba ya habrá creado; **C** cuando toque sacar el siguiente `.exe`
por otra razón; y **el port de la D sólo si la prueba sale limpia**. El rol de beta
tester, **a mano** hasta que la propuesta 14 dé cuentas.

---

## Lo que hay hoy, y la regla que no se negocia

Lo que ya existe y esto aprovecha:

- **Un webhook ya funciona**: `net/beta.js` reenvía el feedback a
  `VEKTOR_FEEDBACK_WEBHOOK`, un canal de Discord, con `allowed_mentions: { parse:
  [] }` y sin esperar la respuesta. Es el patrón entero de la A.
- **El huésped ya tiene rutas HTTP propias** (`/feedback`, `/contador`, `/salud`) en
  `net/servidor.mjs`, y lee la IP del jugador de `Fly-Client-IP`. El endpoint del
  bot sería una ruta más.
- **Un código de sala es su dirección** (vuelta 47): `generarCodigo()` de
  `net/codigo.js` saca seis símbolos de un alfabeto de 27, y la sala nace **al
  primer `upgrade`** con `/sala/<código>` (`salaDe`), configurada con el `?mapa=` y
  el `?modo=` de quien entra primero.
- **Hay un gancho al lanzar** (`alLanzar` en `new Lobby({...})`, hoy sólo alimenta
  el contador) y **no hay ninguno al acabar**: el final se sabe por
  `partida.terminada` y por `_terminarPartida`, pero nadie avisa hacia fuera.
- **La ventana y la página ya hablan**, en los dos sentidos y por caminos distintos
  (vuelta 98): la página **pide** a la ventana con `invoke` —que pasa por la
  capacidad `principal`, **atada al origen** del despliegue—, y la ventana **le
  cuenta** a la página con un `eval` de un `CustomEvent`, que no depende del origen.

Y la regla que atraviesa las cuatro, escrita en la vuelta 47, en el roadmap
(«Lista pública de partidas») y en la propuesta 14:

> **La presencia no puede convertirse en un registro de salas.** No hay lista de
> partidas a propósito: una partida es un enlace que alguien decide pasar.

Un canal de Discord que recibe **cada sala nueva con su enlace** es, literalmente,
esa lista. §1.4 y §3.3 dicen cómo se hace la A y la C sin romperla.

---

## 1. (A) Avisos por webhook a tu servidor

### 1.1 Qué es y qué se puede mandar

Un webhook de canal es una URL con un secreto dentro: quien la tenga escribe en
ese canal, sin bot y sin sesión. Lo que admite, según la referencia de *Execute
Webhook*:

- `content` hasta **2000 caracteres** y hasta **10 `embeds`** por mensaje (título,
  descripción, campos, color, imagen, pie).
- `allowed_mentions` para que nada de lo que escriba un jugador haga ping —la
  propia documentación lo recomienda «si pasas texto de usuarios»—. `net/beta.js`
  ya lo pone a `parse: []`; se mantiene.
- `flags` con `SUPPRESS_NOTIFICATIONS`, para avisos que no deben sonar en el móvil
  de nadie (un resultado, sí; «se ha abierto una sala», no).
- **Componentes no interactivos** si se añade `?with_components=true` a un webhook
  que no es de una aplicación: en la práctica, **un botón de enlace** («Entrar a la
  sala») que no manda nada al huésped al pulsarse.
- `?wait=true` devuelve el mensaje creado con su `id`, y con ese `id` el mensaje
  **se puede editar después** (`PATCH /webhooks/{id}/{token}/messages/{id}`). Esto
  es lo que permite que un aviso de «partida en juego» se convierta en su
  resultado en vez de publicar dos mensajes.

### 1.2 Límites de frecuencia

La documentación **no publica un número** para webhooks: dice que los límites
«no deben escribirse en el código», que se leen de las cabeceras
`X-RateLimit-*`, que un 429 trae `retry_after`, y que el límite se cuenta **por
webhook** (el `id` y el token son su «recurso de primer nivel»). Hay además un tope
duro por IP: **10 000 peticiones inválidas (401, 403, 429) en 10 minutos** y la IP
queda bloqueada un rato; y **un webhook que devuelve 404 no se vuelve a usar**, o la
restricción llega igual.

La cifra que circula en la comunidad —unos cinco mensajes cada dos segundos por
webhook y unos treinta por minuto por canal— **no está en la documentación** y no
se usa como diseño. Con una beta de 10 a 50 personas esto son unos pocos mensajes
por hora; lo que hace falta es una **cola de un solo hilo** en el huésped que:

1. mande de uno en uno,
2. respete `retry_after` en un 429,
3. **olvide el webhook** tras un 404 (y lo anote en `/salud`, para que se vea), y
4. tenga un tope propio (p. ej. 20 por minuto) que tire lo que sobre: perder un
   aviso de resultado no cuesta nada; un bloqueo de la IP de Fly contra la API de
   Discord costaría también el feedback.

### 1.3 Qué eventos del huésped existen para colgarlos

| Aviso pedido | ¿Existe el evento? | Qué hace falta |
|---|---|---|
| **Sala nueva abierta** | Sí: `salaDe()` la crea al primer `upgrade`, y ahí se suma `contador.sala()`. | Nada técnico — pero **no se recomienda así** (§1.4): abrir `/duelo/` ya crea una sala, así que el canal recibiría una por cada visita, la mayoría vacías. |
| **Partida lanzada** | Sí: `alLanzar(jugadores)` en `Sala`. | Pasarle también `modo`, `mapa` y el código (hoy recibe sólo el número). Una línea en `Lobby._lanzar`. |
| **Resultado** | **No.** `_terminarPartida` (equipos) y el final del todos contra todos cambian la fase y nadie avisa fuera. | Un `alTerminar(resumen)` en `Partida`, encadenado por el `Lobby` hasta la `Sala`, con lo que ya sabe el marcador: modo, mapa, rondas o bajas, motivo (`mayoria`, `prorroga`, `abandono`, reloj) y duración. |
| **Mapa del mes** | **No existe en el juego.** | §1.5. |

Un detalle del resultado que conviene tener delante: **los nombres son `VK-07`**
(el lobby numera por llegada) hasta que la propuesta 14 dé nicks. Un «VK-03 gana
8–6 a VK-01» se puede publicar sin problema de privacidad —no identifica a nadie—
pero dice poco; con cuentas pasa a decir quién. Por eso el resultado es de las
cosas que **mejoran solas** cuando llegue la 14, sin tocarlas.

### 1.4 El riesgo de privacidad: un enlace publicado es una puerta abierta

El código **no es un secreto** (vuelta 47: «es un identificador») y el enlace no
lleva nada más: **cualquiera del canal que lo pulse entra en la sala**, ocupa un
hueco y el anfitrión sólo puede sacarlo a mano (`MSG.SACAR`, vuelta 107). Y un
aviso automático de cada sala con su enlace es exactamente la lista pública de
partidas que el proyecto decidió no tener.

Lo que se propone, y es lo que hace que la A sea de riesgo bajo:

- **Nunca se publica un enlace sin que lo pida el anfitrión.** Un botón en el lobby
  —«Anunciar en Discord», en la columna de la derecha de `Lobby.jsx`, con los
  tokens de Cabina— que manda **una vez** el aviso con el enlace. Es lo mismo que
  hoy hace el anfitrión pegando el enlace en el canal, con mejor formato: **no hay
  registro**, hay un gesto de una persona. Con tope (uno por sala cada pocos
  minutos) para que no sea un altavoz.
- **«Partida lanzada» y el resultado van sin enlace**, o con el enlace sólo si la
  sala se anunció. Ya no se puede entrar a una partida en juego (el lobby la
  lanza con los listos), así que un enlace ahí sólo sirve para acabar en el lobby
  de después.
- **El servidor de Discord de la beta es privado**, lo que baja el riesgo pero no
  cambia la regla: el día que el canal sea público, la regla es la que protege.
- **El webhook es un secreto de Fly**, como `VEKTOR_FEEDBACK_WEBHOOK`: `fly secrets
  set VEKTOR_DISCORD_SALAS=…` y `VEKTOR_DISCORD_RESULTADOS=…` (un canal por tipo de
  aviso, para que se puedan silenciar por separado). Nunca en `config.js`, que viaja
  al navegador, ni en el repositorio. Quien tenga la URL escribe en el canal con el
  nombre y el avatar que quiera: si se filtra, se borra el webhook en Discord y se
  crea otro.

### 1.5 El mapa del mes

**No existe.** No hay en el juego ni en el formato de mapa nada que diga «este es
el destacado». Hacerlo son tres piezas, de menos a más:

1. **El dato**: una línea en `config.js` (`MAPA_DEL_MES: { clave, desde }`) y no un
   campo en cada mapa, que serían N sitios pudiendo decir «soy el del mes» a la vez.
   El juego lo puede usar además para ponerlo primero en el carrusel del lobby.
2. **El aviso**: un paso del flujo de despliegue (`.github/workflows/desplegar.yml`)
   que, si esa línea cambió en el commit, manda el webhook de anuncios. Así el
   anuncio sale **cuando el cambio está desplegado** y no antes, y no hay un
   segundo sitio que diga cuál es el del mes. El webhook iría como secreto de
   GitHub, no de Fly.
3. **La imagen**: la miniatura de un mapa se dibuja **en SVG desde los datos**
   (vuelta 29), y **un embed de Discord no enseña SVG**. Hace falta un PNG: o se
   genera en el propio flujo (el editor ya dibuja el plano; un Playwright en el
   corredor lo captura), o Yago sube una captura a mano. Lo primero es un día más.

**Coste**: 1 día sin imagen, 2 con ella. **Qué decide Yago**: quién elige el mapa
y con qué criterio; el código no tiene opinión.

### 1.6 Coste y riesgo de la A

- **Dinero**: 0 €. Los webhooks no cuestan y el huésped ya está.
- **Tiempo**: la cola y los tres avisos, **1–1,5 días**; el botón de anunciar en el
  lobby, **medio día**; el mapa del mes, **1–2** aparte.
- **Riesgo**: bajo y conocido. El técnico —bloquear la IP de Fly contra la API de
  Discord por un bucle de 429— lo cierra la cola; el de producto, §1.4.
- **Depende de la 14**: no. Mejora con ella (nicks de verdad en los resultados).

---

## 2. (B) Un bot sencillo

### 2.1 Gateway contra interacciones por HTTP

Discord entrega las interacciones —un comando con barra, un botón pulsado— de dos
formas, y la documentación dice que **son excluyentes**:

- **Por el *gateway***: un proceso **siempre conectado** a Discord por WebSocket
  (lo que hacen `discord.js` y compañía), con latidos, reconexiones e *intents*.
- **Por HTTP**: se configura una *Interactions Endpoint URL* en el portal y Discord
  hace un `POST` a esa dirección con cada interacción. **No hace falta ningún
  proceso conectado**, y los endpoints de interacción **no cuentan** para el límite
  global de 50 peticiones por segundo del bot.

**Se propone HTTP**, y el sitio es el huésped de Node que ya existe: una ruta
`/discord/interacciones` junto a `/feedback`. Las razones:

- **Una máquina, y ya está pagada.** El huésped vive en una sola máquina de Fly
  (vuelta 59) y un bot de *gateway* sería un segundo proceso que mantener vivo, o
  un proceso más dentro de éste con su reconexión.
- **Y lo que el bot hace es lo que el huésped ya sabe**: crear salas. Viviendo en el
  mismo proceso, el comando puede mirar `salas` directamente.
- **No hay nada que escuchar.** Un bot de *gateway* se justifica cuando hay que
  reaccionar a mensajes, a gente que entra o a voz; ninguna de las dos cosas del
  encargo lo pide.

Lo que exige el modo HTTP, todo documentado:

- **Verificar la firma de cada petición**: cabeceras `X-Signature-Ed25519` y
  `X-Signature-Timestamp`, firmando `timestamp + cuerpo` con la clave pública de la
  aplicación, y **contestar 401** si no cuadra. Node lo hace con `node:crypto`
  (`crypto.verify` con una clave Ed25519 importada como JWK), **sin dependencias**.
  La documentación es explícita: si el endpoint no contesta al `PING` **y** no valida
  las firmas, el portal no acepta la URL. (Que para comprobarlo Discord mande además
  peticiones con firma mala es lo que cuenta la comunidad; la documentación no lo
  detalla.)
- **Contestar al `PING`** (tipo 1) con un `PONG`.
- **Responder en menos de 3 segundos**, o el testigo de la interacción se invalida
  (luego vale 15 minutos para mensajes de seguimiento). Crear una sala es
  instantáneo, así que `/duelo` contesta en el acto sin diferir.
- **El cuerpo se lee crudo** antes de parsearlo, porque la firma es sobre los bytes
  exactos: `leerCuerpo()` ya lo da así.
- **Los comandos se registran una vez** con un `PUT` a la API (comandos del
  servidor de la beta, que se actualizan al instante), desde un script `npm run
  discord:comandos` con el token del bot como variable de entorno. No es algo que el
  huésped haga al arrancar.

### 2.2 `/duelo`: basta con generar un código, y conviene reservarlo

La pregunta del encargo tiene respuesta corta: **sí, basta con generar un código
válido y devolver el enlace**. `generarCodigo()` corre igual en Node, y la sala
nacerá cuando el primero abra `/duelo/<código>`. Pero hay tres detalles que hacen
que merezca la pena ir un paso más allá, y los tres son baratos porque el bot vive
en el mismo proceso:

1. **Colisión**: con 387 millones de códigos es despreciable, pero el comando puede
   comprobar `salas.has(código)` y sacar otro. Una línea.
2. **La configuración**: `/duelo modo:todos mapa:La Rotonda` tiene que acabar en esa
   sala. Hoy la configura **quien entra primero** con su consulta, y el enlace ya la
   lleva (`?mapa=…&modo=…`, vuelta 72 y 100), así que funcionaría. Más robusto es
   **crear la sala ya** con `salaDe(código, null, mapa, modo)`: queda configurada
   pase lo que pase con el enlace, y si nadie entra se olvida sola a los
   `NET.salaOlvidadaMs` (10 minutos), como cualquier sala vacía.
3. **La respuesta**: un mensaje en el canal con el enlace y un **botón de enlace**
   («Entrar»), que no manda nada al huésped. Público —es lo que hace `/duelo` útil:
   retar a alguien en el canal— y con el anfitrión siendo **quien abra el enlace
   primero** (la primera butaca, vuelta 67), que normalmente es quien escribió el
   comando.

Opciones del comando: `modo` y `mapa` como listas cerradas (**choices**) sacadas de
`escenariosDeModo` al registrar los comandos, así que un mapa que no se ofrece en
ese modo no se puede pedir. `/duelo` sin nada da lo de fábrica, como abrir
`/duelo/`.

Y encaja con §1.4 sin esfuerzo: **pedir `/duelo` es el gesto de una persona**, en
un canal que ella elige. No es un registro.

### 2.3 El rol de beta tester

Tres niveles, del más barato al más completo:

1. **A mano** (0 días). Yago asigna el rol desde Discord. Con 10–50 testers es lo
   razonable hasta que haya cuentas, y no pide nada.
2. **Un comando de administración** (`/beta dar @usuario`, 1 día), sólo visible
   para quien tenga permiso de gestionar roles (`default_member_permissions`). Lo
   que hace por debajo es una llamada REST:
   `PUT /guilds/{guild}/members/{usuario}/roles/{rol}` con el **token del bot**.
   Requisitos, todos de la referencia: la aplicación tiene que estar **instalada
   como bot** en el servidor (no basta con los comandos), el bot necesita el
   permiso **`MANAGE_ROLES`**, y el rol de beta tester tiene que estar **por debajo
   del rol más alto del bot** en la jerarquía. Admite la cabecera
   `X-Audit-Log-Reason`, para que el registro de auditoría diga por qué. Frente a
   hacerlo a mano sólo gana si el que lo da no es administrador — o sea, poco.
3. **Automático al vincular la cuenta** (3–5 días, **depende de la 14**). Aquí es
   donde encaja «Entrar con Discord»: si la cuenta de Vektor se crea o se vincula
   con el proveedor Discord de Supabase, el huésped conoce el id de Discord de esa
   persona y puede darle el rol él mismo con la llamada del punto 2 (si está en el
   servidor) o **meterla en el servidor con el rol puesto** (`PUT
   /guilds/{guild}/members/{usuario}`, que exige un testigo OAuth del usuario con el
   alcance `guilds.join`).

   Hay una alternativa oficial que conviene conocer: **Linked Roles** (*role
   connections*). La aplicación declara metadatos —p. ej. `beta_tester = 1`—, el
   servidor configura el rol «exige Vektor con beta_tester = 1», y es **la persona**
   la que se verifica desde Discord pasando por una página nuestra
   (`role_connections_verification_url`, alcance `role_connections.write`). No hace
   falta `MANAGE_ROLES` y el rol lo concede Discord. A cambio es un flujo OAuth más
   en el huésped y **no está verificado** que se pueda pedir ese alcance a través
   del inicio de sesión de Supabase y reutilizar el testigo (Supabase no guarda el
   testigo del proveedor más allá del inicio de sesión); probablemente habría que
   hacer ese flujo aparte, directamente contra Discord.

**Se recomienda el nivel 1 ahora y el 3 cuando exista la 14**, con Linked Roles
como variante a valorar entonces. El 2 no compensa: cuesta un día para ahorrar un
clic derecho.

### 2.4 Coste y riesgo de la B

- **Dinero**: 0 €. Crear una aplicación y un bot en Discord no cuesta nada.
- **Tiempo**: el endpoint con su firma, `/duelo` y el script de registro, **2–3
  días**. El rol, 0 / 1 / 3–5 según el nivel.
- **Riesgo**: bajo. Lo nuevo es **una ruta pública que acepta peticiones de fuera
  y crea salas**; la firma Ed25519 es lo que impide que cualquiera la use para
  fabricar salas, y por eso se verifica **antes** de leer nada más. El token del bot
  y la clave pública, secretos de Fly.
- **Depende de la 14**: `/duelo`, no. El rol automático, sí.

---

## 3. (C) Rich Presence desde la app de Tauri

### 3.1 Cómo se hace

Rich Presence es lo que sale en el perfil de Discord: «Jugando a Vektor · Duelo en
El Espejo · 5–3», con imagen, tiempo transcurrido y hasta dos botones con enlace.
Hay tres maneras según la documentación y sólo una sirve aquí:

- **El Social SDK** —la que Discord recomienda hoy para juegos nativos— es C++; se
  podría enlazar desde Rust, pero es mucho más de lo que hace falta para una línea
  de estado. Descartado por coste, no por imposible.
- **El RPC por WebSocket local** (`127.0.0.1`): **obsoleto** y «sólo para antiguos
  participantes de la beta privada», dice la documentación. Descartado.
- **El RPC por IPC**: el cliente de escritorio de Discord abre una tubería local
  (`\\?\pipe\discord-ipc-{n}` en Windows); se hace un `HANDSHAKE` con el **Application
  ID** y luego se manda `SET_ACTIVITY`. **Esto es lo que se propone.** El crate de
  Rust **`discord-rich-presence`** (versión 1.1.0, enero de 2026, ~600 000
  descargas) lo hace entero —`DiscordIpcClient::new(id).connect()` y
  `set_activity(...)`, con estado, detalles, marcas de tiempo, imágenes, grupo y
  botones— sin dependencias nativas.

Hace falta **una aplicación en el portal de desarrolladores** (la misma que la del
bot y la de la Activity: una aplicación de Discord puede ser todo a la vez) y su
Application ID, que **no es secreto**: va escrito en `main.rs`. Las imágenes grandes
y pequeñas se suben al portal como *Rich Presence Art Assets* y se nombran por su
clave (una por mapa, que se exportan de la miniatura como en §1.5).

Una advertencia de la documentación que hay que leer entera: el RPC dice que el
acceso de aplicaciones **no aprobadas** está limitado a **50 testers**. En la
práctica, la comunidad lleva años mandando `SET_ACTIVITY` por IPC sin aprobación
(es lo que hacen el crate de arriba y cientos de programas), y lo que la
documentación restringe parece ser `AUTHORIZE` y el resto de órdenes que piden la
cuenta del usuario. **No se pudo confirmar** en la fuente oficial; es de lo primero
que se comprueba al construirlo (§7).

### 3.2 Cómo se entera la ventana de lo que pasa en la página

La ventana **no sabe nada del juego**: no contiene el juego (vuelta 91) y sólo abre
la URL del despliegue. Así que el estado tiene que **viajar de la página a la
ventana**, y el único camino en ese sentido es el que ya usan la pantalla completa y
Salir: **una orden de Tauri por `invoke`**.

- Una orden nueva en `main.rs`, `#[tauri::command] fn presencia(estado: …)`, con un
  estado **cerrado** (fase: menú / entrenamiento / lobby / partida; modo; mapa;
  marcador; desde cuándo) y no un texto libre, para que la página no pueda poner en
  el perfil de nadie lo que quiera.
- Una función en `src/escritorio.js`, `contarPresencia(estado)`, que llama a
  `invocar()` como `pedirPantallaCompleta` y que en un navegador **no hace nada**.
- Quien la llama son **los sitios donde ya cambia la fase**: `App.jsx` (inicio,
  entrenamiento, resumen) y la página del multijugador (lobby, partida, final). No
  por frame: al cambiar.
- **El canal está atado al origen**, y eso es aceptable aquí por la regla de la
  vuelta 97: *saber dónde estamos* no depende del origen; *pedirle algo a la
  ventana*, sí. Si el dominio cambia y la capacidad no, la presencia deja de
  actualizarse **en silencio** — como la pantalla completa. Es el orden correcto de
  los fallos: el juego sigue, se pierde un adorno.
- El proceso nativo **agrupa**: guarda el último estado y lo manda como mucho una
  vez cada pocos segundos (el cliente de Discord tiene su propio límite de
  actualizaciones de presencia; no está documentado su número).

### 3.3 Qué se enseña, y el botón «Unirse»

El encargo pone el ejemplo «Jugando a Vektor · Duelo en El Espejo», y eso es
exactamente lo que se recomienda: **modo, mapa, marcador y tiempo**. Lo que no:

- **Un botón «Unirse» con el enlace de la sala, no de fábrica.** Un perfil de
  Discord lo ve cualquiera que comparta un servidor contigo, y un enlace de sala ahí
  **es** la sala anunciada a todo el que mire: la regla de §1.4 otra vez, y la de la
  propuesta 14 («la presencia dice quién está, no qué salas hay»). Si se hace, que
  sea cuando el anfitrión haya pulsado «Anunciar» (§1.4). El «Unirse» nativo de
  Discord (`secrets.join`) no sirve de todas formas: lo interpreta el Social SDK, y
  aquí no hay.
- **Nada si la persona no quiere**: Discord ya tiene su ajuste de «compartir
  actividad», y el juego añade una fila en Opciones —**sólo en la app**, por la
  misma regla que «Arrancar en pantalla completa» (vuelta 97)— para apagarlo.

### 3.4 Qué pasa si Discord no está abierto, y en el navegador

- **Sin Discord de escritorio abierto**, la tubería no existe y `connect()` falla.
  No es un error: la ventana lo reintenta cada 15–30 s en un hilo aparte y se calla.
  Si Discord se cierra a media partida, la próxima escritura falla y se vuelve a ese
  bucle. **Nunca** puede bloquear el arranque de la ventana, que es la regla de
  `main.rs` («una ventana invisible por un error al leer un fichero es una app que
  no abre»).
- **Con Discord abierto sólo en el navegador**, no hay tubería: no sale nada.
- **Jugando en un navegador, no se puede.** Una página no puede abrir una tubería
  local, y el RPC por WebSocket local está cerrado (§3.1). Es de las cosas que sólo
  tiene la app, como la pantalla completa.

### 3.5 Coste y riesgo de la C

- **Dinero**: 0 €.
- **Tiempo**: la orden y el cliente IPC en `main.rs`, **1–1,5 días**; las llamadas
  desde la página y la fila de Opciones, **1 día**; imágenes, pruebas con Discord
  abierto, cerrado y reabierto, **1 día**. **Y un `.exe` nuevo** (0.6.0), que cada
  tester tiene que instalar: por eso conviene sacarlo **junto a otra cosa** que ya
  obligue a reinstalar.
- **Riesgo**: bajo. El alcance es lo pequeño: **sólo la gente con la app y con
  Discord de escritorio abierto** lo verá. Con una beta de 10–50 personas, la
  presencia la ven los amigos de esas personas, que es justo a quien se quiere
  llegar.
- **Depende de la 14**: no.

---

## 4. (D) Vektor como Discord Activity

### 4.1 El modelo

Una Activity es **una página web dentro de un iframe del cliente de Discord**, en
escritorio, en el navegador y en el móvil, que habla con Discord por `postMessage`
a través del **Embedded App SDK** (`@discord/embedded-app-sdk`, un paquete de npm
que se empaqueta con Vite: no es un asset externo). Se lanza desde un canal de voz o
desde el lanzador de aplicaciones, y todos los del canal que entran comparten un
**`instanceId`**.

La página no se sirve desde nuestro dominio: se sirve desde
**`<application_id>.discordsays.com`**, y ese dominio es un **proxy** que reenvía
según las ***URL Mappings*** del portal. Con una sola:

| Prefijo | Destino |
|---|---|
| `/` | `ancient-violet-678.fly.dev` |

todo Vektor —el HTML, los módulos, `/salud`, `/feedback`, los estampados de
`public/estampados/` y el WebSocket de `/sala/<código>`— cuelga del mismo origen
proxificado. Desde julio de 2025 ya no hace falta el prefijo `/.proxy/`. Como Vektor
**no usa assets externos** (§2 de CLAUDE.md; ni fuentes de Google, ni CDN) y todas
sus URLs son relativas al origen, **no habría que tocar ni una URL** ni usar
`patchUrlMappings`, que reescribe `fetch`, `WebSocket` y `XMLHttpRequest` globales
y la documentación desaconseja salvo que haga falta.

**La CSP** es lo que hace cumplir el aislamiento: una petición a un dominio no
mapeado falla con `blocked:csp`. Las excepciones son la API de Discord y su CDN de
avatares. Para Vektor esto no es un problema; lo sería el día que algo cargara de
fuera.

### 4.2 El WebSocket por el proxy

**Funciona, según la documentación, con certeza alta**: «All network traffic is
routed through the Discord Proxy», «Under the hood we utilize Cloudflare Workers»,
y lo único que soporta además de HTTP es WebSocket («WebRTC is not supported»,
WebTransport «working on it»). Las *URL Mappings* admiten cualquier protocolo
(`wss` incluido), por eso el destino se escribe sin él. Vektor abre
`wss://<origen>/sala/<código>?pase=…&mapa=…&modo=…` contra su propio origen, y con
el mapeo de `/` eso llega a Fly.

Lo que **no** dice la documentación, y hay que medir:

- **Cuánto retraso añade.** Es un salto más, por un Worker de Cloudflare, en los dos
  sentidos. Para un juego que cuida hasta el colchón del rival (vuelta 103), un
  proxy que añada 20–40 ms y algo de *jitter* se nota. F3 ya enseña el RTT y el
  colchón: la prueba lo lee de ahí.
- **Si respeta la consulta y el `upgrade`**, y si deja pasar los *ping* y *pong* de
  control con los que el huésped detecta un cable mudo cada 5 s (`NET.pingMs`).
- **La IP del jugador desaparece**: el proxy existe para ocultarla, así que el
  huésped verá IPs de Cloudflare en `Fly-Client-IP`. El freno por IP del feedback
  (`net/beta.js`) dejaría de distinguir personas. El proxy puede añadir cabeceras
  firmadas (`X-Discord-Proxy-Payload`, con el contexto del usuario y firma Ed25519,
  documentadas) que sirven para eso y para saber quién es quién.
- **Y el bloqueo de LaLiga.** El principio permanente del proyecto (`decisions.md`
  §0.1) es que lo que un jugador visita va con IP propia, porque las operadoras
  españolas anulan IPs **enteras** de Cloudflare en días de partido. El proxy de las
  Activities **es** Cloudflare, por construcción y sin alternativa. No está
  verificado si `discordsays.com` cae en esos bloqueos (§7). Si cae, la Activity
  muere esas horas y el juego en `fly.dev` sigue; es un canal más, no el canal.

### 4.3 El ratón: ¿funciona `requestPointerLock` dentro del iframe?

**No se ha podido confirmar, en ningún sentido.** Lo que se sabe:

- **La especificación**: dentro de un iframe con atributo `sandbox`, el bloqueo del
  puntero sólo se permite si lleva `allow-pointer-lock`. Sin `sandbox`, se permite.
  Y en Electron —el cliente de escritorio de Discord— la aplicación anfitriona puede
  además **denegar** el permiso `pointerLock` desde su gestor de permisos.
- **La documentación de Activities no lo menciona** en ninguna página: ni el ratón,
  ni el bloqueo, ni la pantalla completa. Tampoco hay ningún *issue* en
  `discord/embedded-app-sdk` que hable de ello, y una búsqueda de código en GitHub no
  encontró el atributo `sandbox` del iframe del cliente.
- **Indicio a favor**: **Krunker Strike FRVR**, un FPS de ratón derivado de
  Krunker.io, es una de las Activities más jugadas y corre en el cliente de
  escritorio. Que un shooter con mirada libre funcione ahí sugiere que el ratón se
  puede capturar. Pero no se pudo leer (páginas de Discord y de FRVR bloqueadas desde
  aquí) **cómo** lo hace: podría usar el bloqueo del puntero, o una alternativa
  pensada para móvil.
- **Indicio en contra**: una Activity de código abierto (`mkosuke0/heli-1v1`, un
  1v1 en three.js) llama a `requestPointerLock` y trae escrita una **alternativa
  para cuando falle** («como no se puede fijar el cursor, se pilota con la posición
  del ratón»). Es una defensa, no una prueba: no dice en qué cliente falló.
- **Un falso positivo que conviene no repetir**: una búsqueda atribuye a Discord la
  frase «allow-pointer-lock y allow-popups están desactivados para no molestar al
  usuario». Viene de una **sugerencia de la comunidad sobre incrustar HTML en
  mensajes**, no de las Activities. No se pudo abrir para confirmarlo, y no dice
  nada de esto.

**Y aunque funcione, no funciona igual que en Chrome.** La captura de Vektor
(`src/game/captura.js`, vueltas 105 y 107) está construida sobre dos reglas de
Chrome —tras una salida **del usuario** hace falta un gesto y algo más de un
segundo; tras una salida **de la página**, no— y sobre un tercer camino, el de la
app, donde **ESC es de la ventana**. Dentro de Discord:

- el camino de la app no existe (`esEscritorio()` dirá que no, y bien);
- no se sabe **quién se queda ESC**: Discord usa ESC para cerrar sus propios
  paneles, y si lo atrapa antes que el iframe, el jugador no podrá salir del bloqueo
  con ESC, o saldrá y cerrará algo de Discord a la vez;
- y `unadjustedMovement` (la entrada cruda del ratón) puede comportarse distinto.

**La prueba de un día** que lo decide, antes de nada más:

1. Crear la aplicación en el portal, activar Activities y mapear `/` a una **página
   de prueba** servida por el huésped (una ruta nueva, `/discord-prueba`, o una
   máquina aparte): un lienzo, un clic que pide `requestPointerLock({
   unadjustedMovement: true })`, y en pantalla el resultado de la promesa,
   `pointerlockerror`, los `movementX/Y` que llegan, qué teclas recibe la página
   (ESC, Tab, Ctrl, F1–F12) y si `requestFullscreen` funciona.
2. En la misma página, **un WebSocket a una sala de verdad** con `VEKTOR_DEBUG=1`, y
   el RTT medido contra el mismo cliente abriendo `fly.dev` directamente.
3. Probarlo en **tres clientes**: escritorio de Windows, Discord en Chrome y móvil.
   Lo que importa es el primero; el segundo dice si el atributo del iframe es el
   mismo; el tercero sólo confirma que el móvil queda fuera (Vektor no tiene
   controles táctiles).
4. Y **cargar el juego entero** una vez por el proxy, para ver si algo pide fuera
   del origen.

Criterio: **si el bloqueo del puntero no funciona en el cliente de escritorio, la D
se descarta** —un aim trainer con el cursor suelto no es Vektor, y la alternativa de
«apuntar por la posición del ratón» es otro juego—. Si funciona pero ESC es de
Discord, se valora con Yago delante. Si el proxy añade más de ~30 ms de RTT de
mediana, igual.

### 4.4 Qué habría que cambiar en el juego si la prueba sale bien

Nada de esto se toca antes de la prueba; se lista para que el coste de §0 no sea un
número al aire.

- **Saber que se está en Discord**, con **una sola función** (`esDiscord()`), como
  `esEscritorio()` en la vuelta 97. La señal natural son los parámetros que Discord
  pone en la URL al cargar el iframe (`frame_id`, `instance_id`, …) más el
  *handshake* del SDK, y **no** el dominio. Es un tercer «sitio» con sus propias
  reglas, y la convención de la 97 se aplica entera.
- **La sala sale del `instanceId`.** Todos los del canal de voz reciben el mismo, así
  que un código derivado de él (un *hash* a seis símbolos del alfabeto de
  `net/codigo.js`) los mete a todos **en el mismo lobby sin pasarse un enlace**. Es
  la regla de la vuelta 47 —el código *es* la dirección— con otra fuente. El lobby,
  la partida y el protocolo no cambian.
- **La captura**: una rama en `captura.js` para el iframe, según lo que diga la
  prueba sobre ESC y el gesto. Y los bancos de captura (`esc105`) tendrían que
  imitar a ese cliente, que es la lección de la 105: un banco que no imita al
  navegador de verdad sale verde con el fallo delante.
- **El tamaño**: una Activity se ve **enfocada**, en **PiP** (una miniatura mientras
  el jugador mira otra cosa) o en **rejilla**, y el SDK avisa del cambio. En PiP y en
  rejilla el juego tiene que pausar o enseñar un cartel; enfocada, el hueco es el
  del panel de Discord, más pequeño que la ventana de Tauri (mínimo 960×540). La
  cabina tiene medidas a 700×460 (`menu62`, `menu92`), pero el HUD no se ha medido
  por debajo de 1280.
- **La identidad**: el SDK da `authorize` → un código que el **huésped** cambia por un
  testigo con el secreto de la aplicación (una ruta más, `/discord/token`), y con él
  el nombre y el avatar de Discord. Es la forma natural de poner nicks en la
  Activity **sin la propuesta 14**; con la 14, ese id de Discord es el que vincula
  con la cuenta de Vektor si la persona entró con Discord. La documentación insiste
  en que **nada de lo que diga el cliente de Discord es de fiar** (nombres incluidos,
  que además no vienen saneados) y en validar en el servidor con
  `GET /applications/{id}/activity-instances/{instancia}` y el token del bot que
  quien se conecta está de verdad en esa instancia.
- **Las cookies**: si la 14 pone la sesión en una cookie `httpOnly`, dentro del
  iframe tiene que ser `SameSite=None; Partitioned` y del dominio `discordsays.com`
  (lo documenta Discord). Es decir: la sesión de la Activity es **otra sesión**,
  como la de la app de escritorio.
- **`localStorage` es por origen**, y el de `discordsays.com` es otro: los ajustes y
  las teclas del jugador empiezan de cero dentro de Discord. Es la factura de
  siempre (vueltas 60 y 97), una vez por sitio.
- **Actualizaciones**: `src/ui/actualizacion.js` recarga cuando cambia el build;
  dentro del iframe recargar debería funcionar, pero es de las cosas que se miran.
- **Enlaces de fuera** (el enlace de una sala para alguien que no está en el canal)
  pasan por `openExternalLink` del SDK, que pregunta al usuario. El SDK trae además
  `openInviteDialog` y `shareLink`, que harían lo que hoy hace «copiar enlace».

### 4.5 Coste y riesgo de la D

- **Dinero**: 0 €. Las Activities no cuestan, el proxy lo pone Discord y el tráfico
  sigue llegando a la misma máquina de Fly.
- **Tiempo**: **1 día** la prueba. Si sale limpia, el port son **3–5 semanas**
  (15–25 días): el SDK y `esDiscord()`, la sala por `instanceId`, la captura, los
  modos de tamaño, la identidad con su validación en el servidor, y medirlo todo en
  tres clientes que no se pueden automatizar como Chrome.
- **Riesgo**: **alto e incierto**, y por tres motivos que no dependen de nosotros:
  el ratón (§4.3), el retraso del proxy (§4.2) y el bloqueo de Cloudflare en España
  (§4.2). A cambio es lo único de las cuatro que **trae gente nueva**: se juega sin
  instalar nada ni abrir un navegador, desde la llamada donde ya están los amigos.
- **Depende de la 14**: en parte. Se puede hacer sin cuentas (el nombre lo da
  Discord); con cuentas, el vínculo es natural si existe «Entrar con Discord».

---

## 5. Orden recomendado

1. **A, los avisos por webhook** (1,5–2 días). Primero la cola y «partida lanzada»
   con `alLanzar`; luego `alTerminar` y el resultado editando el mismo mensaje; y el
   botón **«Anunciar en Discord»** del lobby como única forma de publicar un enlace.
   El mapa del mes, cuando Yago quiera empezar a elegirlo.
2. **La prueba de un día de la D**, en paralelo con la A. Es barata y es la única
   que puede cambiar el plan entero. Crea de paso **la aplicación de Discord**, que
   sirve para B, C y D a la vez.
3. **B, `/duelo` por interacciones HTTP** (2–3 días), en el huésped. El rol de beta
   tester **a mano** hasta que la propuesta 14 tenga «Entrar con Discord»; entonces,
   automático (o Linked Roles).
4. **C, Rich Presence** (3–4 días), en el siguiente `.exe` que se saque por otro
   motivo, para no pedir a nadie que reinstale sólo por esto.
5. **D completa, sólo si la prueba sale limpia** en el cliente de escritorio, y
   después de la 14 si se quiere que la cuenta sea la misma dentro y fuera de Discord.

Y la vara de medir de la 07 y la 14 vale igual aquí: **al acabar cualquiera de las
cuatro, el juego se juega exactamente igual sin Discord.** Un enlace pegado en
cualquier chat tiene que seguir siendo una partida.

---

## 6. Lo que se deja fuera

- **El Social SDK de Discord**: sin versión web (su tabla de plataformas es C++20,
  Unity 2021.3+ y Unreal 5.5+). Sería posible **sólo dentro de la app de Tauri**,
  enlazado desde Rust, y lo que daría de más frente a la C —amigos de Discord,
  invitaciones nativas, «Unirse» de verdad— choca con la regla de que la capa
  social no puede depender de un tercero (roadmap §2.3). Si algún día se reabre, es
  por esa puerta y con ese precio delante.
- **Un bot de *gateway*** que escuche mensajes o voz: nada del encargo lo pide.
- **Una lista de salas en Discord** actualizada sola: es el registro de salas que el
  proyecto decidió no tener (vuelta 47).
- **Moderar el chat de Discord desde el juego**, o el juego desde Discord.

---

## 7. Lo que no se ha podido verificar

- **Si `requestPointerLock` funciona dentro del iframe de una Activity**, en
  ninguno de los tres clientes. Ni el atributo `sandbox`/`allow` del iframe, ni el
  gestor de permisos del Electron de Discord. → Prueba de §4.3.
- **Cómo captura el ratón Krunker Strike FRVR** en escritorio (el caso de estudio de
  Discord y la web de FRVR no se pudieron abrir).
- **Quién recibe ESC** dentro de una Activity, y qué otras teclas se queda Discord.
- **Cuánto retraso añade el proxy** a un WebSocket, si conserva la consulta del
  `upgrade` y si deja pasar los *ping*/*pong* de control.
- **Si `discordsays.com` —o el propio Discord— cae** durante los bloqueos de LaLiga a
  Cloudflare.
- **El límite numérico de los webhooks**: la documentación no lo da; la cifra de la
  comunidad (≈5 cada 2 s por webhook, ≈30 por minuto por canal) no es oficial.
- **Si `SET_ACTIVITY` por IPC exige aprobación** o una lista de testers para una
  aplicación no aprobada. La práctica dice que no; la documentación del RPC habla de
  50 testers para el acceso en general.
- **El límite de frecuencia de las actualizaciones de presencia** del cliente de
  Discord.
- **Si Supabase deja pedir `role_connections.write` o `guilds.join`** en su inicio
  de sesión con Discord y conservar el testigo para usarlo después.
- **Si una Activity de un shooter cae en las restricciones de edad** que Discord está
  extendiendo (el registro de cambios de 2026 habla de «Activities con restricción de
  edad»; no dice con qué criterio).

---

## Fuentes

Documentación oficial, leída del repositorio del que se genera
(`github.com/discord/discord-api-docs`, rama `main`, septiembre de 2026); la web
equivalente está en `docs.discord.com/developers/…`:

- Activities — cómo funcionan: `developers/activities/how-activities-work.mdx` ·
  https://docs.discord.com/developers/activities/how-activities-work
- Activities — red y proxy («only support websockets», «WebRTC is not supported»,
  Cloudflare Workers, cookies `SameSite=None Partitioned`):
  `developers/activities/development-guides/networking.mdx` ·
  https://docs.discord.com/developers/activities/development-guides/networking
- Activities — *URL Mappings*, CSP y excepciones:
  `developers/activities/development-guides/local-development.mdx` ·
  https://docs.discord.com/developers/activities/development-guides/local-development
- Activities — instancias, participantes, `activity-instances` y cabeceras firmadas
  del proxy: `developers/activities/development-guides/multiplayer-experience.mdx`
- Activities — modos de tamaño (enfocada, PiP, rejilla):
  `developers/activities/development-guides/layout.mdx`
- Activities — tutorial con `authorize`/`authenticate` y `/api/token`:
  `developers/activities/building-an-activity.mdx`
- Registro de cambios (quitar `/.proxy/`, julio de 2025; restricción de edad):
  `developers/change-log.mdx`
- Webhooks — *Execute Webhook*, `allowed_mentions`, `with_components`, editar
  mensajes: `developers/resources/webhook.mdx` ·
  https://docs.discord.com/developers/resources/webhook
- Límites de frecuencia, límite global y peticiones inválidas:
  `developers/topics/rate-limits.mdx` ·
  https://docs.discord.com/developers/topics/rate-limits
- Interacciones — endpoint HTTP, firma Ed25519, `PING`, plazo de 3 s:
  `developers/interactions/overview.mdx` y
  `developers/interactions/receiving-and-responding.mdx` ·
  https://docs.discord.com/developers/interactions/receiving-and-responding
- Botones de enlace: `developers/components/reference.mdx`
- Roles: *Add Guild Member Role* y *Add Guild Member* (`guilds.join`):
  `developers/resources/guild.mdx`; jerarquía: `developers/topics/permissions.mdx`
- Linked Roles: `developers/resources/application-role-connection-metadata.mdx` y
  `developers/tutorials/configuring-app-metadata-for-linked-roles.mdx`
- Rich Presence: `developers/platform/rich-presence.mdx`; RPC por IPC, `HANDSHAKE`,
  `SET_ACTIVITY` y el RPC por WebSocket obsoleto: `developers/topics/rpc.mdx` ·
  https://docs.discord.com/developers/topics/rpc
- Social SDK — plataformas: `developers/discord-social-sdk/core-concepts/platform-compatibility.mdx`

Código y otras fuentes:

- Embedded App SDK: https://github.com/discord/embedded-app-sdk (código revisado;
  sin *issues* sobre bloqueo del puntero en la búsqueda de GitHub).
- Crate `discord-rich-presence` 1.1.0: https://crates.io/crates/discord-rich-presence ·
  https://github.com/vionya/discord-rich-presence
- `requestPointerLock` y `allow-pointer-lock`:
  https://developer.mozilla.org/en-US/docs/Web/API/Element/requestPointerLock
- Krunker Strike FRVR como Activity (no se pudo abrir desde aquí):
  https://discord.com/build-case-studies/frvr
- Activity de código abierto con alternativa al bloqueo del puntero:
  https://github.com/mkosuke0/heli-1v1 (`discordApp/src/main.js`)
- La sugerencia de la comunidad sobre HTML incrustado que **no** trata de
  Activities (no se pudo abrir):
  https://support.discord.com/hc/en-us/community/posts/360043463831-Html-Embeds

**Lo que no se pudo abrir**: `discord.com`, `docs.discord.com`,
`support.discord.com`, `support-dev.discord.com` y las webs de terceros (FRVR,
Robo.js, Photon, Supertorio) estaban bloqueadas por el proxy de salida de este
entorno. La documentación oficial se leyó de su repositorio en GitHub, que es su
fuente.
