# Propuesta 14 — Cuentas, amigos e invitaciones para la beta cerrada

**Estado:** **propuesta, sin construir nada.** Escrita en la vuelta 107 a partir
del encargo de Yago, que ya trae el stack elegido y el flujo dibujado:

- **Un Supabase propio de Vektor**, separado del de FlickLAB.
- **Resend** enviando desde un subdominio de `flicklab.gg`, con SPF, DKIM y DMARC.
- **Cloudflare Turnstile** contra bots en el registro.
- **RGPD mínimo**: política de privacidad, casilla de consentimiento, borrar la
  cuenta desde el propio juego, y guardar sólo correo y nick (más lo que Supabase
  Auth necesita para existir: el hash de la contraseña y sus fechas).
- **El flujo**: ENTRAR A VEKTOR, CREAR CUENTA y «Jugar como invitado»; un registro
  con el nick comprobado en vivo, contraseña dos veces y la casilla; «Revisa tu
  bandeja» con «Reenviar email»; un enlace que **sólo verifica** y no inicia
  sesión; «He olvidado mi contraseña»; y la sesión que se recuerda.
- **Tres fases**: cuentas, amigos (con presencia) e invitar a una sala.

Esta propuesta **concreta la fase 2 de la 07 y funde sus fases 3 y 4**; §9 dice
exactamente qué sustituye y qué deja en pie. Y respeta sus dos decisiones de
fondo, que aquí se repiten porque son las que no se negocian:

> **Se sigue pudiendo jugar sin cuenta, en igualdad.** Una partida es un enlace
> que se pega en un chat (vuelta 47), y eso no puede dejar de funcionar porque
> alguien no se haya registrado — ni porque Supabase esté caído.
>
> **La presencia no puede convertirse en un registro de salas.** Dice quién está,
> no qué salas hay.

---

## 0. La respuesta corta

| Fase | Qué existe al acabarla | €/mes con los planes gratuitos | Horas | Plazo |
|---|---|---|---|---|
| **1** · Cuentas | Registro, verificación, entrar (con correo **o con Discord**, §3.6), olvidé la contraseña, borrar la cuenta, y el servidor de partida sabe quién eres | **0 €** | **70–95 h** | 2,5–3 semanas |
| **2** · Amigos | Solicitud, aceptar, lista, bloquear, y quién de tus amigos está conectado | **0 €** | **35–50 h** | 1,5–2 semanas |
| **3** · Invitar a sala | Desde la lista, «Invitar» manda el código de tu sala; aceptar te lleva al lobby | **0 €** | **20–30 h** | 1 semana |

**Los tres caben en los planes gratuitos para una beta de 10 a 50 personas**, y
el sitio donde dejan de caber no es el tamaño —500 MB de base de datos son
cientos de miles de filas de correo y nick— sino **dos cosas de operación** que
§7 cuenta con números: **Supabase pausa un proyecto gratuito tras una semana sin
actividad** y **no tiene copias de seguridad**, y **Resend corta en 100 correos
al día**. El día que se abra el registro a desconocidos, lo razonable es pagar
Supabase Pro (**~23 €/mes**) y, si el ritmo de altas pasa de unas cincuenta al
día, Resend Pro (**~19 €/mes**). Turnstile es gratis sin tope práctico.

**La decisión de arquitectura que sostiene todo lo demás** está en §2 y cabe en
una línea: **el navegador del jugador no habla nunca con Supabase; habla con
nuestro huésped de Fly, y el huésped habla con Supabase.** De ahí salen gratis
tres cosas que el encargo pide o que CLAUDE.md exige: la sesión en una cookie
`httpOnly` (propuesta 07), el principio permanente de la IP propia (vuelta 58,
`decisions.md` §0.1) y que el login funcione igual dentro de la ventana de Tauri.

---

## 1. De dónde se parte

| Lo que hace falta | Lo que ya hay |
|---|---|
| Un servidor nuestro con IP propia | El huésped de Node en Fly (`net/servidor.mjs`), una sola máquina en `cdg`, que ya sirve `dist/` y las salas. |
| Un sitio donde pintar las pantallas | **Cabina** (vuelta 99): tokens, tarjetas, botones. El primer paso —logotipo y «Jugar ahora»— es donde van las tres puertas del encargo. |
| Un nombre por jugador | El lobby pone `VK-NN` por orden de llegada (`net/lobby.js`) y el marcador ya lleva `n` (vuelta 101). Las fichas flotantes ya dibujan un nick. |
| Invitar a alguien | **Una partida es un enlace** (`enlaceDeSala`, vuelta 47) y **toda partida sale de un lobby** (vuelta 101). Invitar es mandar ese enlace a una persona concreta. |
| Un canal vivo con el navegador | El transporte de cuatro funciones (vueltas 46 y 51). Un canal de presencia es **otro transporte**, no un netcode nuevo. |
| Saber dónde estás | `esEscritorio()` (vueltas 97 y 98), con dos señales nativas. |

Lo que no hay, y es todo el proyecto: **estado que sobreviva a la sala**, y datos
de personas.

---

## 2. La decisión de arquitectura: el huésped hace de portero

Supabase se puede usar de dos maneras, y la diferencia importa aquí más que en
cualquier otro proyecto:

- **(a) Directo desde el navegador** con `supabase-js`, que es lo que hace casi
  todo el mundo: la página llama a `https://<ref>.supabase.co`, y la sesión (el
  testigo de acceso y el de refresco) se guarda en `localStorage`.
- **(b) A través de nuestro huésped**: la página llama a rutas nuestras
  (`/cuenta/...`) en el mismo origen que el juego, y el huésped llama a Supabase
  de servidor a servidor. El testigo de refresco vive en una cookie `httpOnly`.

**Se propone (b)**, y no por gusto: son cuatro razones y cada una sola bastaría.

1. **La propuesta 07 ya lo decidió** (§3, «un testigo en una cookie `httpOnly`, no
   en `localStorage`»). Y la razón de allí sale reforzada: la fase 1 de la 07 —y
   esta propuesta— meten **el nombre de otra persona** en el DOM de tu pantalla,
   y la ficha flotante es DOM en 3D (`CSS3DRenderer`). Un descuido con ese texto
   es un XSS, y con `localStorage` un XSS **se lleva la cuenta**. Con `httpOnly`,
   se lleva como mucho una hora de testigo de acceso.
2. **La IP propia** (vuelta 58, `decisions.md` §0.1): todo lo que un jugador
   visite directamente va en infraestructura con IP propia, porque las operadoras
   españolas anulan IPs **enteras** de Cloudflare por orden de LaLiga. La API de
   Supabase sirve tráfico detrás de su propia pasarela, y **hay que comprobar si
   esa pasarela comparte las IPs que se bloquean**; con (b) da igual, porque el
   tráfico entre Fly y Supabase no pasa por una operadora española.
3. **La ventana de escritorio abre la URL del despliegue** (§6). Con (b), el
   login es una página más de nuestro origen: la cookie la guarda WebView2 como
   guarda cualquier otra, y no hay que registrar ningún dominio de terceros en la
   capacidad de Tauri, que está atada al origen (vuelta 97).
4. **El servidor de partida ya recibe la cookie**: el WebSocket de una sala es
   del mismo origen, así que la petición de `upgrade` lleva las cookies sin que
   el cliente haga nada (§5). **El testigo no viaja en la dirección**, que es
   donde acaba escrito en los registros.

**Lo que se paga, dicho entero:**

- **Unas diez rutas más en el huésped** (§3.4), que hoy sólo sirve ficheros y
  salas. Y el huésped pasa a estar **en el camino del login**: si Fly cae, no se
  entra. No es un precio nuevo — si Fly cae, tampoco hay juego.
- **Los límites por IP de Supabase Auth ven una sola IP**, la de Fly. Hay que
  subirlos en el panel y **poner los nuestros en el huésped**, que sí ve la IP del
  jugador (`Fly-Client-IP`). Ver §7.
- **No se usa `supabase-js` en el navegador**, y con él se van la sesión
  automática y el refresco transparente. Se escriben a mano, y son pocas líneas:
  el testigo de acceso vive en memoria de la página, y cuando caduca la página
  pide otro a `/cuenta/refrescar` con la cookie.
- **`net/partida.js` no se entera de nada**: la regla de la vuelta 47 —el huésped
  pone el reloj y el cable; la partida pone el mundo— sigue en pie. La cuenta se
  resuelve en el `upgrade`, antes de sentar a nadie, y a `Partida` le llega un
  jugador con su `enviar` y, como mucho, un nick y un identificador como campos
  de la butaca (la 07 §3 ya lo dejó escrito así).

Y el **respaldo de Cloudflare** (`worker/sala.js`) no verifica testigos: allí
todos son invitados. Es respaldo desde la 58; si algún día vuelve a ser
producción, verificar un ES256 con WebCrypto son las mismas treinta líneas.

---

## 3. Fase 1 — Cuentas

### 3.1 El flujo, pantalla a pantalla

**Primer paso (el del logotipo), tres puertas.** Hoy tiene «Jugar ahora»; pasa a
tener tres, y la regla de la 94 decide su peso:

- **ENTRAR A VEKTOR** y **CREAR CUENTA**, del mismo tamaño.
- **Jugar como invitado**, que **no puede ser un enlace gris al pie**: es la
  promesa de igualdad, y un botón que parece la salida de emergencia dice lo
  contrario. Mismo tamaño que los otros dos, en la fila de abajo. Con sesión ya
  guardada, el paso entero se salta y se entra con tu nick.

**Crear cuenta.** Una tarjeta de Cabina:

- **Nick**, con la comprobación **en vivo**: 350 ms después de la última tecla,
  `GET /cuenta/nick?n=…` contesta *libre*, *cogido* o *no vale* (y por qué: largo,
  caracteres, reservado). **La comprobación no reserva nada**: la reserva de
  verdad es la restricción `unique` de la base de datos al crear, y si alguien
  se adelanta en ese medio segundo, el envío lo dice en el campo del nick y no en
  un cartel genérico.
- **Correo.**
- **Contraseña y repetirla**, con el mínimo dicho debajo antes de escribir (10
  caracteres; sin reglas de mayúsculas y símbolos, que empeoran las contraseñas
  en vez de mejorarlas).
- **La casilla**: «He leído la **política de privacidad** y tengo 14 años o
  más». Los 14 no son un adorno: es la edad de consentimiento digital en España
  (LOPDGDD, art. 7), y un shooter es exactamente el juego al que llega alguien
  de 12.
- **Turnstile**, en modo gestionado: casi siempre invisible.
- **Crear cuenta**, apagado mientras falte algo — y cada campo que falte dice qué
  le falta (vuelta 94: un control que no hace nada tiene que decir por qué).

**«Revisa tu bandeja».** Pantalla propia, con el correo escrito («te hemos
mandado un enlace a *y…@gmail.com*»), la frase «si no está, mira en spam» y
**Reenviar email**, que se apaga 60 s tras cada envío con la cuenta atrás en el
propio botón. Y **Jugar como invitado** también aquí: nadie tiene que quedarse
esperando un correo para jugar.

**El enlace del correo sólo verifica.** Abre
`/cuenta/verificar?token_hash=…&type=signup`, el huésped llama a Supabase para
canjearlo, **tira la sesión que Supabase devuelve** y enseña «**Cuenta
verificada. Ya puedes entrar**», con un botón a la portada. No es timidez: §6
explica por qué es lo único que funciona igual en el navegador y en la app.

**Entrar.** Correo y contraseña. Un error dice **uno solo**: «correo o contraseña
incorrectos», sin distinguir cuál — distinguirlos es regalar una lista de qué
correos tienen cuenta. Con la cuenta sin verificar, el error sí lo dice («tu
correo no está verificado») con su **Reenviar**, porque ahí quien lo lee ya ha
demostrado la contraseña.

**He olvidado mi contraseña.** Se pide el correo, y la respuesta es **siempre la
misma** exista o no la cuenta («si hay una cuenta con ese correo, te hemos
mandado un enlace»). El enlace abre `/cuenta/restablecer?token_hash=…`, una
página de nuestro origen con dos campos de contraseña; el huésped canjea el
testigo, cambia la contraseña con esa sesión efímera, **la tira** y dice
«Contraseña cambiada. Vuelve a Vektor y entra». Y cambiarla **cierra todas las
sesiones abiertas** de esa cuenta, que es para lo que alguien la cambia la mitad
de las veces.

**La sesión se recuerda.** El testigo de refresco va en una cookie `httpOnly`,
`Secure`, `SameSite=Lax`, con la caducidad del refresco de Supabase. Abrir el
juego pide `/cuenta/yo`: con cookie buena, entras con tu nick; con cookie mala o
caducada, **caes a invitado y se dice** («tu sesión ha caducado, vuelve a
entrar») — la lección de la vuelta 51: quedarse fuera se dice, no se sufre.

**Borrar la cuenta**, en *Opciones*, al final y en su propio bloque. Pide la
contraseña otra vez (una cookie robada no puede borrar una cuenta) y escribir el
nick. Borra **en el acto** y en cascada: perfil, amistades, solicitudes. Y dice
lo que no puede borrar: los registros técnicos de Supabase y de Resend, que
caducan solos en sus plazos (y la política lo dice con los plazos).

### 3.2 Qué se guarda, y el único dato que se añade a lo pedido

El encargo dice «sólo correo y nick». Se propone **una excepción, dicha en voz
alta**: la **versión de la política aceptada y la fecha**. El RGPD pide poder
*demostrar* lo aceptado (art. 7.1), y la única forma de demostrar qué casilla
marcó alguien es guardar qué texto había. Son dos columnas y no identifican a
nadie más de lo que ya lo hace el correo.

Lo que **no** se guarda, a propósito: IP, agente de usuario, país, historial de
partidas, estadísticas, ajustes. Supabase Auth guarda por su cuenta la fecha de
alta, el último acceso y el hash (bcrypt) de la contraseña: **nosotros no vemos
nunca una contraseña**, y eso es lo que hace admisible tener contraseñas cuando
la 07 las descartaba (ver §9).

### 3.3 El nick: la primera regla contra la suplantación

- **Entre 3 y 16 caracteres, de `A–Z a–z 0–9 _ -`.** Nada de Unicode: un nick con
  una «а» cirílica es otro nick que se lee igual, y la suplantación empieza ahí.
- **Único sin distinguir mayúsculas** (`Yago` y `yago` son el mismo).
- **Reservados**: `vektor`, `flicklab`, `admin`, `moderador`, `soporte`,
  `sistema`… y **el patrón `VK-NN`**, que es el de los invitados. Si un registrado
  pudiera llamarse `VK-03`, se haría pasar por el invitado de la butaca 3.
- **Una lista de palabras vetadas**, corta y a mano, en castellano e inglés.
  Nunca va a ser completa; es un filtro de lo obvio, no moderación (§7).
- **En la fase 1 no se cambia el nick.** Cambiarlo es la segunda puerta de la
  suplantación (me llamo como tú un día, vuelvo a mi nombre al siguiente) y la
  fase 1 no la necesita. Si uno es ofensivo, **lo cambia un administrador** desde
  el panel de Supabase y al jugador se le pide uno nuevo al entrar.
- **Y se dibuja como texto, nunca como HTML** (`textContent`), también en la
  ficha flotante. Es la regla de la fase 1 de la 07 y es la que protege la cookie.

### 3.4 Las rutas del huésped

Todas en `net/servidor.mjs` (o en un módulo suyo, `net/cuentas.mjs`), **sin
dependencias nuevas**: Node trae `fetch` y `crypto`, y la API de Supabase Auth es
HTTP con JSON. El proyecto tiene tres dependencias de producción y no sube a
cuatro por esto.

| Ruta | Qué hace |
|---|---|
| `GET /cuenta/nick?n=` | ¿libre? Llama a una función SQL (§8) |
| `POST /cuenta/crear` | Comprueba Turnstile, límites por IP, y da de alta en Supabase con el nick en los metadatos |
| `POST /cuenta/reenviar` | Reenvía el correo de verificación (60 s entre envíos, 5 al día por correo) |
| `GET /cuenta/verificar` | Canjea el testigo del correo y **tira la sesión** |
| `POST /cuenta/entrar` | Contraseña → testigos; el de refresco a la cookie, el de acceso al cuerpo |
| `POST /cuenta/refrescar` | Cookie → testigo de acceso nuevo (rota la cookie) |
| `GET /cuenta/yo` | Quién soy: nick, o 401 y la cookie borrada |
| `POST /cuenta/salir` | Cierra la sesión en Supabase y borra la cookie |
| `POST /cuenta/olvide` · `GET/POST /cuenta/restablecer` | El flujo de §3.1 |
| `POST /cuenta/borrar` | Reautentica y borra con la llave de servicio |
| `GET /cuenta/discord` · `GET /cuenta/discord/vuelta` | Entrar con Discord (§3.6): PKCE en el huésped |
| `POST /cuenta/nick` | «Elige tu nick» la primera vez que se entra con Discord (§3.6) |

**La llave de servicio de Supabase** (la que se salta RLS) vive en un secreto de
Fly y **sólo la usan dos rutas**: `crear` si hace falta y `borrar`. Todo lo demás
habla con Supabase **con el testigo del propio jugador**, así que las políticas
de RLS (§8) son el guarda de verdad y un fallo del huésped no puede enseñar la
fila de otro.

**Y `/salud` dice si las cuentas están encendidas y si las claves públicas se
han cargado** (§5): es la regla de la vuelta 61 —un banco comprueba contra qué
mide en vez de suponerlo— aplicada a una pieza nueva.

### 3.5 Coste, riesgos y plazo de la fase 1

**Dinero: 0 €/mes.** Supabase Free, Resend Free, Turnstile gratis, y el dominio
`flicklab.gg` ya existe. La máquina de Fly no cambia: diez rutas que se piden
unas pocas veces por jugador y día no se notan al lado de 60 pasos por segundo
por sala.

**Horas: 60–80.**

| Trozo | Horas |
|---|---|
| Proyecto de Supabase (región UE), Resend y DNS del subdominio, Turnstile | 4–6 |
| Esquema, disparador, RLS, función del nick, limpieza de no verificados (§8) | 5–7 |
| Rutas del huésped, cookie, límites por IP | 14–18 |
| Verificación del testigo en el `upgrade` y el nick en la butaca (§5) | 4–6 |
| Pantallas en Cabina: tres puertas, registro, bandeja, entrar, olvidé, verificada, restablecer, borrar | 18–24 |
| Plantillas de correo (§4) y política de privacidad | 4–6 (+ revisión legal, fuera) |
| Bancos: el flujo entero contra un Supabase de pruebas, la app, y «el enlace sin haber entrado» | 8–10 |
| Probarlo en la app de Windows | 3 |

**Plazo: 2–3 semanas**, y el camino crítico no es el código: es **la
propagación del DNS y el calentamiento del dominio de envío** (§4) y **tener el
texto de la política revisado**, que no depende de nadie de aquí.

**Cómo se sabe que está terminada** (la vara de medir de la 07 §3, más dos):

1. Se crea una cuenta, se verifica **desde el móvil**, se entra en el PC, se
   cierra el navegador, se vuelve a abrir, y sigues siendo tú.
2. Lo mismo **en la app de Windows**, verificando el correo en el navegador.
3. Un testigo caducado manda al invitado **diciéndolo**, no a una pantalla colgada.
4. **El enlace por código sigue funcionando sin haber entrado nunca**, y una
   partida de invitados y registrados mezclados se juega exactamente igual.
5. Con Supabase apagado a propósito, **se juega de invitado** y la puerta de
   entrar dice que no está disponible.

---

### 3.6 Entrar con Discord (añadido en la vuelta 108)

**El encargo:** «Entrar con Discord» como tercera puerta, junto a correo más
contraseña e invitado, **en la fase 1 si no complica**. **Veredicto: entra en la
fase 1**, con 10–15 horas más y una condición que se prueba el primer día (la
app, abajo). Complica poco porque Supabase trae Discord como proveedor y el
huésped ya es el portero (§2): es **un flujo OAuth más por el mismo sitio**, no
una arquitectura nueva.

**Por qué merece la pena para esta beta en concreto.** El primer público es
latinoamericano y vive en Discord (propuesta 17). Cada alta por Discord es **un
correo menos** que mandar con el tope de 100 al día de Resend (§7), **una
contraseña menos** que olvidar, y Discord ya ha hecho de filtro contra bots.

**El flujo, con el huésped de portero** (PKCE hecho en el servidor, sin
`supabase-js` en la página):

1. **ENTRAR A VEKTOR** y **CREAR CUENTA** ganan un botón «Entrar con Discord»,
   del mismo peso que el de correo. Pulsarlo pide `GET /cuenta/discord`.
2. El huésped genera el verificador PKCE, lo guarda en una cookie `httpOnly` de
   diez minutos y redirige a
   `https://<ref>.supabase.co/auth/v1/authorize?provider=discord&redirect_to=https://<el juego>/cuenta/discord/vuelta&code_challenge=…&code_challenge_method=s256`.
3. Discord pide permiso (sólo `identify` y `email`: ni servidores, ni amigos, ni
   mensajes). Supabase recibe la respuesta y manda al jugador a
   `/cuenta/discord/vuelta?code=…`.
4. El huésped canjea el código (`POST /auth/v1/token?grant_type=pkce` con el
   verificador de la cookie), pone la sesión en la cookie de siempre y **tira la
   cookie del verificador**.
5. **Si es la primera vez**, la cuenta todavía no tiene nick (Discord trae su
   nombre de usuario, pero el nick de Vektor sigue las reglas de §3.3 y es
   único). Sale la pantalla **«Elige tu nick»**, con la misma comprobación en
   vivo y **la casilla de la política y los 14 años**, que un OAuth no marca por
   nadie. Hasta completarla, `/cuenta/yo` contesta `necesitaNick` y se juega de
   invitado. Si se cierra a medias, la cuenta sin perfil se borra a las 48 h, como
   las no verificadas.

**Lo que cambia de esta propuesta:**

- **§3.4**: dos rutas más, `GET /cuenta/discord` y `GET /cuenta/discord/vuelta`,
  y `POST /cuenta/nick` para «Elige tu nick».
- **§8**: el disparador `crear_perfil` **no puede exigir el nick al crear la
  cuenta**, porque una cuenta de Discord nace sin él y el alta entera fallaría. Pasa a crear el
  perfil **sólo si el nick viene en los metadatos** (correo y contraseña) y, si
  no, lo crea `POST /cuenta/nick` con la clave de servicio. La limpieza de 48 h
  cubre también las cuentas sin perfil.
- **Correo repetido**: Supabase **enlaza automáticamente** una identidad de
  Discord a una cuenta que ya exista con el **mismo correo verificado**. Quien se
  registró con correo y luego pulsa Discord entra en la misma cuenta, con su nick.
  Es lo que se quiere, y depende de que Discord marque ese correo como verificado.
- **Borrar la cuenta** (§3.1) con Discord no tiene contraseña que pedir. Se pide
  **volver a pasar por Discord** (el mismo flujo con `prompt=consent`) y escribir
  el nick.
- **Lo que se guarda** (§3.2): Supabase guarda la identidad de Discord (su id, el
  nombre de usuario, el avatar y el correo) en `auth.identities`. **Es más que
  «correo y nick»**, y la política de privacidad lo tiene que decir. Vektor no
  lee ni enseña nada de eso: el nick sigue siendo el que eliges.

**La condición: la app de escritorio.** §6 dejaba OAuth fuera por Google, que
rechaza los inicios de sesión en vistas web incrustadas como WebView2. **Discord
no tiene esa política publicada**, así que en la app el flujo sería navegar
dentro de la propia ventana a `discord.com` y volver al juego, sin *deep link*.
Pero no está probado, y hay dos cosas que pueden fallar: el captcha de Discord
(hCaptcha) y las claves de acceso (*passkeys*) dentro de WebView2. **La prueba es
de un día**, y va primero:

- **Si pasa**, el botón sale en los dos sitios.
- **Si no pasa**, en la app el botón no sale, y una línea dice «Para entrar con
  Discord, usa el navegador». Entrar con correo sigue funcionando en la app. Una
  puerta que sale sólo donde funciona es la regla de SALIR (vuelta 99).

**Lo que tiene que hacer Yago, además de lo de §4:**

1. En <https://discord.com/developers/applications> → *New Application*
   («Vektor»). En *OAuth2*, copiar el **Client ID** y el **Client Secret**.
2. En *OAuth2* → *Redirects*, añadir `https://<ref>.supabase.co/auth/v1/callback`.
3. En Supabase → *Authentication* → *Sign In / Providers* → *Discord*: activar y
   pegar el Client ID y el Client Secret.
4. En Supabase → *Authentication* → *URL Configuration*, añadir a las direcciones
   permitidas `https://<el juego>/cuenta/discord/vuelta`, una por cada versión
   (pruebas y estable, propuesta 19).

La misma aplicación de Discord sirve después para el bot y la presencia de la
propuesta 16: **una aplicación, no tres**.

**Horas: 10–15 más**: las tres rutas, la pantalla «Elige tu nick», el cambio del
disparador, el banco del flujo contra un Supabase de pruebas y la prueba en la
app.

## 4. El correo: Resend, el subdominio y lo que hace que llegue

**Qué subdominio.** Se propone **`vektor.flicklab.gg`** para las dos cosas: la
web del juego (apuntando a la IPv4 de Fly, con el DNS en modo sólo-DNS) y el
remitente (`no-responder@vektor.flicklab.gg`). Tres motivos:

- **La reputación de envío queda aparte de la de `flicklab.gg`.** Si mañana un
  bot quema la reputación de Vektor, el correo de FlickLAB no lo paga.
- **El dominio del enlace es el del remitente.** Un correo de `flicklab.gg` con un
  enlace a `ancient-violet-678.fly.dev` es exactamente el patrón que los filtros
  castigan. Esto hace además que el enlace del correo sea el primer uso de
  `VEKTOR_DOMINIO` (vuelta 97), que redirige con 302 la dirección vieja y **no
  redirige a la app**.
- **Un solo nombre que aprender** para quien lo recibe.

**Los registros DNS**, que se piden a Resend al verificar el dominio:

- **DKIM**: el `TXT` en `resend._domainkey.vektor.flicklab.gg`.
- **SPF**: Resend pone el *return-path* en un subdominio suyo (`send.vektor…`) con
  su `MX` y su `TXT v=spf1 include:amazonses.com ~all`.
- **DMARC**: `_dmarc.vektor.flicklab.gg` con `p=none` y un `rua` a un buzón de
  FlickLAB durante las dos primeras semanas, para **ver** quién manda en nombre
  del dominio; luego `p=quarantine`. Empezar en `reject` sin haber mirado los
  informes es cómo se pierde el primer correo legítimo sin saberlo.

**Supabase manda los correos por SMTP de Resend** (`smtp.resend.com`, puerto
465). No es opcional: **el SMTP de fábrica de Supabase sólo manda a los miembros
del equipo del proyecto** y con un tope de unos pocos por hora; está para
probar, no para una beta.

**Las plantillas se reescriben**, por dos cosas: el enlace tiene que apuntar a
`/cuenta/verificar?token_hash={{ .TokenHash }}&type=signup` (y no al enlace de
fábrica, que **inicia sesión** — §6) y tienen que estar en castellano, con parte
de texto plano, sin acortadores de enlaces y sin imágenes remotas. El logotipo,
si va, va trazado (vuelta 41), no como imagen que haya que descargar.

---

## 5. Cómo sabe el servidor de partida quién es quién

**Con la clave pública de Supabase, sin llamarle por partida.**

1. En el proyecto de Supabase se activan las **claves de firma asimétricas**: los
   testigos de acceso salen firmados en **ES256**, y las claves públicas se
   publican en `https://<ref>.supabase.co/auth/v1/.well-known/jwks.json`. La
   clave simétrica heredada (HS256) **no se usa**: con ella, el huésped tendría
   que guardar el secreto con el que se fabrican testigos, y quien lo leyera
   podría fabricarse el de cualquiera.
2. **Al arrancar, el huésped descarga el JWKS y lo guarda en memoria.** Lo vuelve
   a pedir cada hora y **cuando llega un `kid` que no conoce** (que es cómo se ve
   una rotación), con un tope de una petición por minuto para que un testigo con
   un `kid` inventado no le haga llamar a Supabase en bucle.
3. **En el `upgrade` de una sala**, el huésped lee el testigo de acceso de la
   cookie (el mismo origen la manda sola) y lo verifica con `node:crypto`:
   `createPublicKey({ key: jwk, format: 'jwk' })` y `crypto.verify('sha256', …,
   { key, dsaEncoding: 'ieee-p1363' }, firma)`. Luego `iss`, `aud:
   'authenticated'`, `exp` con 30 s de tolerancia de reloj, y `sub`. **Unos 50
   µs, una vez por jugador y sala** — no por paso ni por foto.
4. **El nick va dentro del testigo**, con el *custom access token hook* de
   Supabase (una función de Postgres que añade `nick` a los *claims* al emitirlo).
   Así el huésped no necesita la base de datos para sentar a nadie. Un nick
   cambiado por un administrador tarda como mucho una caducidad de testigo en
   llegar.
5. **Lo que sale de ahí son dos campos de la butaca**: `cuenta` (el `sub`) y
   `nick`. Sin testigo, testigo caducado o mal firmado: **invitado, y la
   bienvenida lo dice** (un campo), para que la página enseñe «entraste como
   invitado» en vez de fingir que no pasa nada.

Tres consecuencias que hay que saber:

- **Si Supabase cae, las partidas siguen**, y los testigos ya emitidos siguen
  verificándose con la clave en memoria. Lo que no se puede es entrar o refrescar.
- **Un testigo vale hasta que caduca** aunque se cierre la sesión o se borre la
  cuenta. Por eso se propone bajar la caducidad del testigo de acceso a **15
  minutos** (de fábrica es una hora): el refresco es una petición barata, y el
  testigo sólo se mira al entrar en una sala.
- **El nick del cliente no se cree nunca.** El único nick de un registrado es el
  del testigo; el de un invitado lo sigue poniendo el lobby (`VK-NN`). Así ningún
  cliente modificado puede sentarse con el nombre de otro.

**Y en local** (`npm run dev` + `npm run net`) las cookies de `localhost` no
distinguen puerto, así que la del 5192 llega al 5199. Un Supabase de pruebas
aparte, con su propio JWKS, y una variable `VEKTOR_SUPABASE=` en el huésped; sin
ella, **las cuentas están apagadas y todo el mundo es invitado**, que es lo que
necesitan los bancos de red de siempre.

---

## 6. La app de escritorio

La ventana de Tauri **abre la URL del despliegue** y no contiene el juego
(vuelta 91). Para el login eso es buena noticia y tiene una trampa.

**Lo bueno**: con §2, entrar es una petición a nuestro propio origen y la cookie
la guarda WebView2 en su perfil, como cualquier otra. No hay que tocar
`main.rs` ni la capacidad.

**La trampa es el correo.** El enlace de verificación y el de restablecer se
abren **en el navegador por defecto del sistema**, no en la app. Si esos enlaces
iniciasen sesión —que es lo que hacen los de fábrica de Supabase, y lo que hace
un «enlace mágico»—, la sesión caería en la cookie de Chrome y **la app seguiría
sin sesión**. Arreglarlo exigiría un *deep link* (`vektor://…`,
`tauri-plugin-deep-link`), registrar el esquema en Windows al instalar, y pasarle
el código a una página remota desde el proceso nativo con un `eval`, como hace
F11 desde la vuelta 98. Todo eso existe y funciona; es **una semana de trabajo y
un `.exe` nuevo en cada PC**.

**Por eso los enlaces del correo sólo verifican**, que es lo que el encargo pide:
el enlace hace su trabajo en cualquier navegador, y **entrar se hace donde se
juega**. Ni un *deep link*.

Tres cosas más:

- **La sesión es de cada sitio donde se entra.** Aunque el origen sea el mismo,
  Chrome y la ventana de Tauri (WebView2, con su propio perfil) guardan sus
  cookies cada uno aparte: entrar en el navegador no te deja dentro de la app, y
  la pantalla no puede prometer lo contrario.
- **Por eso mismo se descarta el enlace mágico**, que la 07 prefería a las
  contraseñas: en la app, «te hemos mandado un enlace para entrar» lleva al
  jugador a entrar **en otro programa**.
- **Google queda fuera** por la misma razón y una más: Google rechaza los inicios
  de sesión dentro de vistas web incrustadas, así que en la app obligaría a abrir
  el navegador del sistema y volver con un *deep link*. **Discord entra en la
  fase 1 desde la vuelta 108** (§3.6), porque no tiene esa política publicada, a
  condición de que la prueba de un día en la app salga bien.

Y el aviso de siempre (vueltas 60 y 97): **las cookies son por dominio**. El día
que el juego se mude de `ancient-violet-678.fly.dev` a `vektor.flicklab.gg`, las
sesiones abiertas se pierden una vez. Si la fase 1 sale ya con el dominio nuevo,
ese día no llega.

---

## 7. Riesgos concretos

**Spam de registros.** Un formulario de alta abierto se llena de bots en días.

- **Turnstile** en el registro, verificado **en el huésped** (`siteverify`) antes
  de llamar a Supabase. Un testigo de Turnstile sólo vale una vez, así que se
  verifica en un sitio y no en dos.
- **Límites en el huésped**, por IP (`Fly-Client-IP`): 5 altas por hora, 20
  intentos de entrar por cada 5 minutos, y por **correo de destino** (5 correos al
  día a una misma dirección), que es lo que impide usar Vektor para bombardear el
  buzón de otro.
- **Nadie entra sin verificar**, y **los no verificados se borran a las 48 h**
  (`pg_cron`, §8), que es lo que libera los nicks que un bot se haya quedado.
- **Y el tope de Resend es un techo y una diana**: 100 correos al día. Un bot que
  los queme deja sin registro a las personas de verdad hasta el día siguiente. Los
  límites por correo y por IP son lo que lo impide; si aun así pasa, el aviso de
  §3.1 tiene que decir «no podemos mandar correos ahora» en vez de fingir que se
  ha mandado.

**Turnstile se sirve desde Cloudflare**, y aquí §0.1 muerde por otra puerta: el
guion se carga de `challenges.cloudflare.com`, que **es una IP de Cloudflare**.
Durante un bloqueo de LaLiga, **registrarse puede ser imposible desde España**
aunque el juego funcione. Es aceptable para una beta —se juega de invitado, y
entrar no pide Turnstile— pero la pantalla tiene que decirlo («no podemos
comprobar que no eres un robot, prueba dentro de un rato») y no quedarse con el
botón apagado. Si pasa mucho, Supabase admite también **hCaptcha**, que no vive en
Cloudflare. Y hay que probar que Turnstile carga dentro de WebView2.

**Entregabilidad.** Un dominio de envío nuevo no tiene reputación, y los
primeros correos a Outlook y Hotmail suelen caer en spam.

- SPF, DKIM y DMARC alineados (§4), texto plano además del HTML, un asunto que no
  parezca publicidad y el enlace al mismo dominio que el remitente.
- **Rebotes**: una dirección mal escrita que rebota resta reputación. Se
  comprueba la forma del correo antes de mandar, y el panel de Resend dice los
  rebotes; si pasan del 2–3 %, hay un problema.
- **La pantalla de la bandeja dice «mira en spam»** desde el primer día, y la
  carta de invitación de la beta (`beta-cerrada.md` §6) también.

**Nicks ofensivos.** §3.3 filtra lo obvio. Lo que no filtra, lo tiene que ver una
persona: en la beta cerrada son diez personas conocidas y basta con que Yago
pueda renombrar desde el panel. **Abrir el registro a desconocidos pide un botón
de «denunciar» y alguien que lo lea**, que es trabajo de personas y no de esta
propuesta.

**Suplantación.** Tres puertas y las tres se cierran en §3.3 y §5: caracteres
ASCII (sin homógrafos), `VK-NN` reservado para invitados, nick sin cambios en la
fase 1, y **el nick sólo lo pone el testigo**. Lo que queda es un nick parecido
(`Yag0`); se ve en la ficha, y en la fase 2 el que importa —tu amigo— sale en tu
lista con su nombre de verdad.

**Los límites de Supabase Free**, uno a uno:

| Límite | Cuándo muerde | Qué se hace |
|---|---|---|
| **Pausa tras una semana sin actividad** | Una semana de la beta sin que nadie entre | El proyecto se pausa y **entrar falla** (se juega de invitado). Se despausa a mano desde el panel, en minutos. Un «latido» diario desde una GitHub Action lo evita hoy, y es exactamente lo que el plan gratuito no quiere pagar: el día que el latido sea imprescindible, es el día de Pro. |
| **Sin copias de seguridad** | Si se pierde la base | Con sólo correo y nick, perderla es que cada uno se vuelva a registrar. Aceptable en la beta; **no** aceptable con amigos y datos de verdad, que es otro motivo para Pro antes de abrir. |
| **Dos proyectos activos gratis** | Si FlickLAB ya usa uno | El de Vektor es el segundo y no queda hueco para uno de pruebas: el de pruebas iría en otra organización, o en local con la CLI de Supabase. |
| **Límites de Auth por IP** | Siempre, por §2 | Todo llega desde la IP de Fly: se suben en el panel y los de verdad los pone el huésped. |
| 500 MB, 50 000 usuarios activos al mes, 5 GB de salida | Nunca en una beta | Una fila de perfil son unos cientos de bytes. |
| Sin SLA ni soporte | Si se rompe | Se juega de invitado: es la regla de §0 cumpliendo su función. |

**Región.** El proyecto de Supabase en la UE (Fráncfort o Irlanda), que es donde
el RGPD lo pone fácil; Fly ya está en París. Resend y Cloudflare son empresas de
EE. UU.: van en la política como **encargados del tratamiento**, con sus cláusulas.

**Legal, y no es una fórmula.** Esto no es asesoría jurídica. La política tiene
que decir quién es el responsable (FlickLAB, con sus datos), qué se guarda, para
qué, cuánto tiempo, quién más lo toca (Supabase, Resend, Cloudflare, Fly) y cómo
se ejercen los derechos; y la base del tratamiento de la cuenta es **prestar el
servicio** (art. 6.1.b), con la casilla como prueba de que se leyó. Conviene que
la lea alguien que sepa antes de abrir el registro a nadie de fuera.

---

## 8. El esquema

Cuatro tablas en toda la propuesta, y la fase 1 sólo usa una.

```sql
-- Fase 1 ─────────────────────────────────────────────────────────────
create table public.perfiles (
  id                     uuid primary key references auth.users (id) on delete cascade,
  nick                   text not null check (nick ~ '^[A-Za-z0-9_-]{3,16}$'),
  privacidad_version     text not null,
  privacidad_aceptada_en timestamptz not null default now(),
  creado_en              timestamptz not null default now()
);
create unique index perfiles_nick_unico on public.perfiles (lower(nick));
alter table public.perfiles enable row level security;

-- Cada uno lee su fila. Nadie escribe desde fuera: la crea el disparador
-- y la borra la cascada de auth.users.
create policy perfil_propio on public.perfiles
  for select using (auth.uid() = id);

-- El perfil nace con la cuenta, en la misma transacción: si el nick está
-- cogido (o reservado), el alta entera falla y no queda una cuenta sin nick.
create function public.crear_perfil() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  insert into public.perfiles (id, nick, privacidad_version)
  values (new.id, new.raw_user_meta_data ->> 'nick',
                  new.raw_user_meta_data ->> 'privacidad');
  return new;
end $$;
create trigger al_crear_cuenta after insert on auth.users
  for each row execute function public.crear_perfil();

-- ¿Libre? Sin exponer la tabla: contesta sí o no y nada más.
create function public.nick_libre(n text) returns boolean
  language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from public.perfiles where lower(nick) = lower(n))
     and not exists (select 1 from public.nicks_reservados where lower(n) like patron)
$$;
-- (nicks_reservados: una tabla de patrones — 'vektor', 'vk-%', … — sin RLS de
-- lectura pública, que sólo lee esta función.)

-- Los no verificados caducan a las 48 h y liberan su nick.
select cron.schedule('limpiar-no-verificados', '17 * * * *', $$
  delete from auth.users
  where email_confirmed_at is null and created_at < now() - interval '48 hours'
$$);

-- Fase 2 ─────────────────────────────────────────────────────────────
create table public.solicitudes (
  de        uuid references public.perfiles (id) on delete cascade,
  para      uuid references public.perfiles (id) on delete cascade,
  creada_en timestamptz not null default now(),
  primary key (de, para),
  check (de <> para)
);
create table public.amistades (
  a     uuid references public.perfiles (id) on delete cascade,
  b     uuid references public.perfiles (id) on delete cascade,
  desde timestamptz not null default now(),
  primary key (a, b),
  check (a < b)                        -- una fila por pareja, no dos
);
create table public.bloqueos (
  quien   uuid references public.perfiles (id) on delete cascade,
  a_quien uuid references public.perfiles (id) on delete cascade,
  primary key (quien, a_quien)
);
alter table public.solicitudes enable row level security;
alter table public.amistades   enable row level security;
alter table public.bloqueos    enable row level security;

create policy ver_mis_solicitudes on public.solicitudes
  for select using (auth.uid() in (de, para));
create policy pedir on public.solicitudes
  for insert with check (
    de = auth.uid()
    and not exists (select 1 from public.bloqueos
                    where (quien = para and a_quien = de) or (quien = de and a_quien = para)));
create policy retirar_o_rechazar on public.solicitudes
  for delete using (auth.uid() in (de, para));

create policy ver_mis_amistades on public.amistades
  for select using (auth.uid() in (a, b));
create policy dejar_de_ser_amigos on public.amistades
  for delete using (auth.uid() in (a, b));
-- Aceptar es una función, no un insert: borra la solicitud y crea la
-- amistad en la misma transacción, y sólo si la solicitud existe y es para ti.

create policy mis_bloqueos on public.bloqueos
  for all using (quien = auth.uid()) with check (quien = auth.uid());

-- Y los nicks de tus amigos, que es lo único de otro perfil que puedes leer.
create policy perfil_de_amigo on public.perfiles
  for select using (exists (
    select 1 from public.amistades
    where (a = auth.uid() and b = id) or (b = auth.uid() and a = id)));
```

**La fase 3 no añade ninguna tabla**, a propósito: §10.

---

## 9. Qué sustituye esta propuesta de la 07, y qué deja en pie

| En la 07 | Aquí |
|---|---|
| Fase 1, nick de invitado | **No hace falta para esto** y sigue siendo buena idea. Si se hace, un nick de invitado **no puede coincidir con uno registrado** y se dibuja con una marca distinta (§3.3). Mientras no se haga, los invitados siguen siendo `VK-NN`. |
| Fase 2: «enlace mágico o proveedor; contraseñas propias no» | **Se sustituye por correo y contraseña.** La razón de la 07 era no guardar secretos de personas, y con Supabase **no los guardamos nosotros**: el hash vive en Supabase Auth y el huésped no ve una contraseña ni en tránsito más allá del reenvío. Y la alternativa que proponía, el enlace mágico, **no funciona en la app de escritorio** sin *deep links* (§6). |
| Fase 2: base de datos en el huésped de Fly (SQLite o Postgres gestionado) | **Postgres gestionado, y es Supabase**, pero **alcanzado sólo a través del huésped** (§2): el principio de la IP propia se cumple igual. |
| Fase 2: cookie `httpOnly` | **Se mantiene**, y es lo que obliga a §2. |
| Fase 2: «recuperar la cuenta puede esperar; borrarla, antes de abrir» | **Las dos entran en la fase 1.** Con contraseñas, olvidarla es el primer fallo que va a tener alguien. |
| Fase 3, presencia | **Se funde con amigos** (fase 2 de aquí) y con su regla: sólo te ven tus amigos. |
| Fase 4, invitar y amigos | Amigos en la fase 2; invitar en la 3. **Invitar es mandar el enlace**, como decía la 07. |
| Fases 5 y 6 (estadísticas, rangos, grupos) | **Sin tocar.** El modo de equipos ya existe (vuelta 101), así que la 6 ya no está bloqueada por eso; sigue fuera de este encargo. |
| §10, lo que desbloquea | **La fase 1 de aquí desbloquea la comunidad de Alchemist** en el sentido de la 07 §10: un mapa ya puede tener autor. La moderación sigue siendo trabajo de personas. |

---

## 10. Fase 2 — Amigos, con presencia

**Qué se construye:**

- **Buscar por nick exacto y mandar solicitud.** Exacto y no por prefijo: una
  búsqueda por prefijo es un listado de todos los nicks del juego, que es lo que
  un bot quiere para mandar solicitudes a todo el mundo.
- **Aceptar, rechazar, retirar, quitar y bloquear.** Rechazar no avisa al otro
  (su solicitud se queda «enviada» hasta que caduca a los 30 días), y bloquear
  borra la amistad, las solicitudes en los dos sentidos e impide las nuevas.
  **El día que se pueda mandar algo a alguien, se podrá molestar a alguien** (la
  07 §5): bloquear no es un extra.
- **La lista en la cabina**: una sección del raíl, «Amigos», con quién está
  conectado arriba.
- **Presencia**: un segundo WebSocket al mismo huésped, `/presencia`, aparte del
  de la sala por lo que dijo la 07 §4 (éste no tiene número de paso). Se
  autentica igual que la sala (§5), con la cookie en el `upgrade`.

**Tres estados, y ninguno lleva una sala dentro:**

- **Conectado**: tiene el juego abierto.
- **En partida**: está sentado en una sala. **No dice cuál**, ni el mapa, ni el
  modo.
- **Desconectado**.

**Las reglas que impiden que esto sea un registro de salas**, escritas como
invariantes para que un banco las pueda comprobar:

1. **La presencia no transporta nunca un código de sala.** Ni en el estado ni en
   ningún campo. El único mensaje que lleva un código es una invitación (fase 3),
   y va de una persona a otra por un gesto de la primera.
2. **Sólo te ven tus amigos**, sin opción de «público» en esta fase. La lista de
   todo el que está conectado es la lista de a quién molestar.
3. **Y cada uno puede aparecer desconectado** (un interruptor), que es lo que
   cualquier persona espera de una lista de amigos.

**Dónde vive el estado**: en la memoria del huésped, que ya sabe quién está
sentado en qué sala. Es la regla de «una máquina» de la vuelta 59: con dos
máquinas, la presencia tendría que compartirse, y eso llega el mismo día que
encaminar salas por código. **No se usa Supabase Realtime** para esto, aunque
tenga presencia hecha: sería un tercer canal vivo, alcanzado desde el navegador
(o sea saltándose §2), y la regla «sólo tus amigos» habría que escribirla en
políticas de canal en vez de en un `if` al lado de donde se sabe quién es amigo
de quién. El huésped lee las amistades de un jugador **al conectarse a
presencia** (una consulta, con su testigo) y las vuelve a leer cuando esa
persona acepta o quita a alguien.

**Coste: 0 €/mes.** Unas pocas filas por jugador; un WebSocket inactivo por
jugador en la máquina de Fly, que con `soft_limit = 200` conexiones pide mirar el
número el día que haya más de cien personas con el juego abierto a la vez.

**Horas: 35–50.** Tablas y políticas (4), rutas de amigos en el huésped (8),
canal de presencia y su transporte (10–14), la sección del raíl y la búsqueda
(10–14), bloquear y caducar (4), bancos: dos navegadores que se hacen amigos, se
ven, uno se bloquea (5–8).

**Riesgos:** acoso por solicitudes (cubierto por bloquear y por buscar sólo
exacto); una lista de amigos que miente por un canal caído (se dice, con el
mismo aviso amarillo de «no llegan fotos» de la vuelta 51); y la tentación de
añadir «ver en qué sala está» — que es exactamente lo que el invariante 1 prohíbe.

**Plazo: 1,5–2 semanas.** **Bloqueante:** fase 1.

---

## 11. Fase 3 — Invitar a una sala

**Qué es:** desde el lobby de tu sala (o desde la lista de amigos estando en
uno), **Invitar** junto al nombre de un amigo conectado. Al amigo le llega un
aviso: «**Yago te invita** a su sala · Todos contra todos · La Rotonda», con
**Unirse** y **Ahora no**.

**Por qué es barata**: **una invitación es el enlace de la sala**
(`enlaceDeSala`, vuelta 47) mandado a una persona por el canal de presencia.
Aceptar es navegar a esa dirección, y lo que pasa después ya existe entero: el
lobby de la vuelta 101 recibe a quien llega, le da hueco, y si está llena lo dice.
**Ni una línea de netcode nuevo.**

**Lo que sí hay que construir:**

- **La invitación no se guarda en ninguna tabla.** Vive en memoria del huésped,
  va de un canal de presencia a otro y **caduca a los dos minutos** o cuando la
  sala se vacía (`NET.salaOlvidadaMs`), lo que llegue antes. Guardarla en Supabase
  sería guardar un código de sala que ya no existe, o sea el embrión del registro
  de salas; y a un amigo desconectado no se le invita, porque cuando vuelva la
  sala ya no será la misma.
- **Sólo puede invitar quien está en la sala**, sólo a un amigo, sólo si ese amigo
  no le ha bloqueado, y con tope (una invitación viva por pareja, diez por minuto
  y persona). El huésped lo comprueba: el cliente sólo pide.
- **Aceptar una invitación caducada lo dice** («esa sala ya no existe») en vez de
  llevar a un lobby vacío — la 07 §5 y la vuelta 51.
- **El aviso no roba el ratón ni una tecla.** En mitad de una partida, un cartel
  que se contesta con teclas es la regla del cartel de votación (vuelta 55), y
  Intro/N ya significan eso ahí; aquí **no se contesta jugando**: el aviso se
  queda en una esquina, sin teclas, y se contesta desde el menú de ESC o al
  acabar. Unirse a otra sala a mitad de una ronda es abandonar la tuya, y eso
  pasa por el botón de salir (vuelta 67: el adiós primero, la navegación
  después).
- **Invitar a un invitado no se puede**, porque no tiene canal ni amigos. Para
  eso sigue estando lo de siempre: copiar el enlace. **La invitación es un atajo
  para quien tiene cuenta, no una puerta que se cierra a quien no la tiene.**

**Relación con §10**: el invariante 1 se mantiene porque el código viaja **de una
persona a otra, por su gesto, y a nadie más**, que es exactamente lo que hace hoy
alguien que pega el enlace en un chat.

**Coste: 0 €/mes. Horas: 20–30.** Mensajes de invitación en el canal de presencia
(4–6), el aviso y sus estados en las dos páginas (8–12), topes y caducidad (3),
bancos: invitar, aceptar, sala llena, caducada, bloqueado (5–8).

**Riesgos:** molestar (topes, bloquear, «Ahora no» sin castigo) y que el aviso
aparezca en mal momento (sin teclas en partida). **Plazo: 1 semana.**
**Bloqueante:** fase 2.

---

## 12. Lo que se mira y se deja fuera

- **Iniciar sesión con Google o Discord.** Ahorra contraseñas y trae un *deep
  link* en la app (§6). Fase aparte, si se pide.
- **Cambiar el nick y cambiar el correo.** Pueden esperar a que haya a quién le
  haga falta; lo primero abre la suplantación y lo segundo pide verificar dos
  buzones.
- **Sincronizar ajustes con la cuenta.** La 07 lo decidió: **manda el
  dispositivo**. La sensibilidad es del ratón que tienes delante.
- **Chat.** Nadie lo ha pedido y es lo más caro de moderar (07 §8).
- **Presencia pública, «ver en qué sala está» y un buscador de partidas.** Son el
  registro de salas que la vuelta 47 decidió que no hubiera.
- **Estadísticas y rangos** (07 fase 5): piden que el servidor cuente, y no es
  este encargo.

---

## 13. Qué hacer primero

**La fase 1, entera y con el dominio nuevo.** Entera porque cada trozo que falte
es un fallo que va a tener alguien de la beta en la primera tarde —sin «olvidé mi
contraseña» se pierde la cuenta; sin «reenviar», un correo en spam es una cuenta
que no existe— y con el dominio nuevo porque así el enlace del correo y la web
coinciden desde el primer correo y la mudanza de cookies de §6 no ocurre nunca.

Y antes de escribir una línea, **tres comprobaciones de una hora cada una**, que
pueden cambiar el plan:

1. **Que Turnstile carga dentro de WebView2** y qué pasa con él durante un
   bloqueo de LaLiga.
2. **Que un correo de `vektor.flicklab.gg` llega a la bandeja** de Gmail, Outlook
   y un proveedor español, con SPF, DKIM y DMARC puestos.
3. **Que los límites por IP de Supabase Auth se pueden subir** lo bastante para
   que todo llegue desde la IP de Fly (§2).

Y la vara de medir de la 07 sigue siendo la buena: **al acabar la fase 1, el
juego se juega exactamente igual sin haber entrado.** Si hay algo que sólo se
pueda hacer con cuenta —además de tener amigos—, el corte se ha pasado de largo.
