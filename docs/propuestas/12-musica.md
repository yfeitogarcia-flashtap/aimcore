# Propuesta 12 — Música

**Estado: escrita, sin código** (vuelta 104). Se pidió una valoración, no una
construcción. Esta propuesta dice **qué es legalmente limpio, qué cuesta y en qué
orden**. No decide ningún gusto musical.

El encargo llega con un descarte ya hecho, y hay que dejarlo escrito para que
no vuelva a proponerse:

> **Spotify no se integra.** Su política de desarrolladores prohíbe usar su
> plataforma para crear un juego («Do not create a game») y mezclar su audio con
> el de otra aplicación. Además, una app en modo desarrollo sólo admite 5
> usuarios, pasar a producción pide una base de usuarios activos que Vektor no
> tiene, y reproducir exige Premium a cada jugador. No es una cuestión de
> esfuerzo: es una puerta cerrada por contrato.

Quedan cuatro vías, y **no compiten**: se pueden tener varias a la vez.

| | Vía | Legal | Coste | Tiempo | ¿Toca el audio del juego? |
|---|---|---|---|---|---|
| A | Controles de medios del sistema (app de escritorio) | Limpia | 0 € | 1 vuelta | No |
| B | Botón con enlace a una playlist oficial | Limpia | 0 € | Media vuelta | No |
| C | Música propia o licenciada, dentro del juego | Limpia **con contrato** | De ~0 a varios miles de € | 1–2 vueltas + gestión | Sí |
| D | Balance juego/música, y los pasos por encima | Limpia | 0 € | 1 vuelta | Sí (el nuestro) |

---

## 0. Dos reglas del proyecto que esta propuesta respeta

- **Sin assets externos** (CLAUDE.md §2). La única excepción son los estampados
  (vuelta 93), y se admitió porque ahí sintetizar era **imposible** y porque es
  de un mapa, no del juego. La música grabada sería **la segunda excepción**, y
  sólo la vía C la necesita. A, B y D no añaden ni un fichero.
- **El oído es el único canal que no hay que apuntar** (vueltas 60 y 73). Las
  pisadas se oyen a través de las paredes hasta 16 u, y de eso dependen el todos
  contra todos y la foto por destinatario (vuelta 100). **Nada de lo que se
  construya puede tapar una pisada.** Por eso la vía D no es opcional si se hace la C.

---

## A. Controles de medios del sistema, en la app de escritorio

**Qué es.** Un pequeño bloque en el lobby y en el menú de ESC que enseña la
canción que suena en Windows —título, artista y carátula— con tres botones:
anterior, play/pausa y siguiente. Da igual de dónde venga: Spotify, YouTube en
el navegador, Apple Music, VLC. Es lo mismo que hacen las teclas multimedia del
teclado y el panel de volumen de Windows.

**Cómo.** Windows publica esas sesiones en
`GlobalSystemMediaTransportControlsSessionManager` (`Windows.Media.Control`,
Windows 10 1809 en adelante). El proceso nativo de Tauri lo lee con el crate
`windows` y se lo pasa a la página por el mismo canal que ya usa F11 (vuelta 98:
un `eval` y no un evento de la capacidad, que va atado al origen). **Sólo existe
en la app**: una página web no puede ver lo que suena en otras aplicaciones, y la
Media Session API del navegador sólo publica lo propio. En el navegador el bloque
**no se enseña**, por la misma regla que «Arrancar en pantalla completa» (vuelta 97).

**Por qué es limpia.** No usa la plataforma de Spotify ni la de nadie: no hay
clave de API, ni cuenta, ni SDK, ni contrato que aceptar. Lee lo que el propio
sistema operativo publica para cualquier programa, y **no toca el audio**: la
música sigue saliendo de su aplicación y la mezcla la hace Windows, como siempre.
Es exactamente lo que hacen las teclas multimedia.

**Lo que hay que saber.**

- Es de **Windows**. En Mac y Linux existen equivalentes (MPRIS en Linux; en Mac
  no hay una API pública estable), pero la app hoy sólo sale para Windows.
- La carátula llega como imagen de la aplicación que suena; se enseña y no se
  guarda.
- Lleva a la app a la **0.5.0**: es código nativo nuevo, así que sí pide un
  `.exe` nuevo (a diferencia de todo lo que va en la web).
- **Coste**: cero. **Tiempo**: una vuelta, contando la prueba en un Windows real.

---

## B. Un botón con la playlist oficial de Vektor

**Qué es.** Una playlist pública —en Spotify, YouTube Music o las dos— con
música para jugar, y un botón en el lobby que la abre en la aplicación del
jugador.

**Por qué es limpia.** Enlazar a un contenido público es enlazar. No hay SDK ni
se reproduce nada dentro del juego. Si el botón lleva el logo de Spotify, hay que
seguir su **guía de marca** (tamaño, color y texto del logo): es la única
condición, y se evita poniendo sólo texto.

**Lo que da de sí.** Es también **la parte social** de la vía C: la playlist
puede llevar al «artista del mes» y es un sitio donde aparecer sin que haga
falta ningún contrato de sincronización.

**Coste**: cero. **Tiempo**: media vuelta (el botón), más cuidar la playlist,
que es trabajo editorial y no de código.

---

## C. Música propia o licenciada, dentro del juego

Es la única vía que **suena dentro de Vektor**: música de menú, del lobby, del
final de partida o, si algún día se decide, de fondo en una partida. Y es la
única que necesita **derechos**, así que es la que hay que mirar con cuidado.

### C.1 Qué derechos hacen falta

Para poner una canción dentro de un juego hacen falta **dos** licencias:

- **Sincronización** (la obra: letra y música, del compositor o su editorial).
- **Grabación** (el máster: de quien la grabó, normalmente el artista o su sello).

Si el artista es dueño de las dos cosas, **un solo contrato** con él basta. Y hay
una tercera cosa que en España hay que mirar: si el artista es **socio de SGAE**
(o de otra entidad de gestión), una parte de los derechos la gestiona la entidad
y no el artista, y puede hacer falta una licencia de ella. **Lo más simple es
trabajar con música «libre de entidad» (PRO-free)**, que es lo que venden las
bibliotecas de abajo y lo que se puede pactar con un artista emergente que no
esté dado de alta. Esto **hay que confirmarlo con un abogado** antes del primer
contrato: es la parte de esta propuesta que no se puede dar por cerrada desde el
código.

Y una cuarta, que no es legal sino práctica: **que la música sea segura para
quien retransmite**. Si un jugador emite en Twitch o YouTube y la canción del
lobby dispara una reclamación, ese jugador deja de emitir Vektor. Cualquier
licencia que se firme tiene que cubrir **la emisión en directo de la partida por
los jugadores**, por escrito.

### C.2 Tres fuentes, de menos a más trabajo

1. **Biblioteca de música con licencia de juego.** Por ejemplo, Epidemic Sound
   ofrece un plan de empresa que incluye apps y juegos (del orden de **100 $/mes,
   facturado anual**), con música libre de entidad. Lo que hay que leer antes de
   pagar: **si la licencia sigue valiendo para la música ya publicada cuando se
   deja de pagar** —en un juego que se sirve en vivo, «ya publicada» no es
   evidente— y si cubre la emisión de los jugadores. **Coste**: ~1 200 $/año.
2. **Música propia por encargo.** Un compositor hace las piezas y cede los
   derechos (o los licencia en exclusiva al juego). Es la opción con **menos
   letra pequeña** y la que mejor casa con Vektor —el audio del juego ya es
   sintetizado a propósito (vuelta 63), y una música que suene de la misma
   familia es identidad—. **Coste orientativo**: de unos cientos a unos pocos
   miles de euros por pieza según el compositor; **estimación, no presupuesto**.
3. **«Artista del mes»**, con artistas emergentes. Un artista cede (sin
   exclusiva y por un tiempo) dos o tres temas para el lobby y el final de
   partida, y a cambio Vektor le da escaparate: su nombre y un enlace en el lobby,
   su lugar en la playlist oficial (vía B) y, si se quiere, **un mapa
   patrocinado** con sus estampados (vuelta 93: dos imágenes por mapa, que es
   exactamente para lo que existen). **Coste**: puede ser cero en dinero, pero no
   en papeles —cada artista es un contrato, con sus plazos y su renovación—.
   **Y si el mapa es patrocinado, se dice**: en España la publicidad tiene que
   ser identificable como tal, así que el mapa lleva su «patrocinado por».

### C.3 Cómo sonaría, sin romper nada

- **Sólo se descarga si la música está puesta.** Un interruptor en Opciones,
  **apagado de fábrica** hasta que haya catálogo, y con él apagado no se pide ni
  un byte: la misma disciplina que `AUDIO.samplesEnabled` (vuelta 63), que tiene
  las muestras grabadas montadas y sin descargar.
- **Nunca espera nadie a una canción.** Como el fondo fotográfico (vuelta 78) y
  los estampados: si no llega, no suena, y el juego sigue.
- **Por defecto, en los menús y no en la partida.** Menú, lobby y pantalla final
  sí; dentro de una ronda, sólo si el jugador lo pide, y siempre con la vía D.
- **El servidor no sabe nada de música.** Es del cliente; no viaja por la red.
- **Coste de servir.** Un tema de 3 minutos en Opus a 128 kbit/s pesa ~3 MB.
  A mil reproducciones al día son ~90 GB al mes, o sea **~2 $/mes** en Fly al
  precio de tráfico de Europa. Con caché del navegador (el `ETag` de la vuelta
  93), menos.

### C.4 Lo que costaría en código

Un reproductor en `src/audio/` con su propio bus en el grafo de Web Audio
(para que la vía D pueda tocarlo), una carpeta pública con los temas y su
manifiesto, una fila en Opciones y el rótulo del «artista del mes» en el lobby.
**Una vuelta**, más una segunda si se quiere música dentro de la partida con su
mezcla bien medida.

---

## D. Balance juego/música, y los pasos siempre por encima

**Qué es.** Un control en Opciones —*Música ↔ Juego*— y una regla que no se
puede apagar: **lo que dice dónde está un rival siempre se oye**.

**Con la música de la vía C** (nuestra, dentro del juego) es sencillo y exacto:

- Un **bus de música** separado del resto en el grafo de Web Audio, con su
  volumen.
- **Atenuación automática** (*ducking*): cuando suena una pisada, un disparo, un
  silbido de bala o una puerta, la música baja unos decibelios durante ese
  instante y vuelve. Es lo que hacen los shooters competitivos, y se mide con el
  mismo banco de audio de las vueltas 62 y 63 (pico y cola en el máster).
- **Y en partida, por defecto, la música no suena**: el que la quiera la pone.

**Con la música de otra aplicación** (vía A, o Spotify abierto al lado) el juego
**no controla su volumen** a propósito. Técnicamente Windows permite cambiar el
volumen de otra aplicación desde fuera (es lo que hace el mezclador del sistema),
pero sería tocar el audio de un programa que no es nuestro, y el encargo pide lo
contrario. Lo que sí se puede hacer, y es suficiente:

- Subir el **volumen propio del juego** con su propio control, y
- **Avisar una vez** en el lobby, si la vía A detecta música sonando: «Baja la
  música en su aplicación para oír los pasos».

**Coste**: cero. **Tiempo**: una vuelta (va junto a la C).

---

## Resumen: qué es limpio y en qué orden

- **Limpio sin papeles**: A (controles de medios del sistema), B (enlace a una
  playlist) y D (nuestro propio balance).
- **Limpio con papeles**: C, siempre que cada tema tenga sincronización y máster
  cedidos por escrito, esté libre de entidad o con su licencia de entidad, y
  cubra la emisión de los jugadores. **Revisión legal antes del primer contrato.**
- **No limpio**: integrar Spotify (o cualquier servicio de streaming) dentro del
  juego. Descartado.

**Orden recomendado**: B primero (media vuelta, cero riesgo, y abre la relación
con artistas); A después (una vuelta y un `.exe` nuevo); C y D juntas cuando haya
el primer catálogo o el primer «artista del mes» firmado. Ninguna de las cuatro
toca la red ni el servidor.
