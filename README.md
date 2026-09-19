# Vektor <sub>by FlickLAB</sub>

Prototipo local de *aim trainer* de FlickLAB. El objetivo de esta primera fase
es uno solo: **validar la sensación de apuntado, el rendimiento y el "feel" del
disparo** antes de tocar nada de backend.

Proyecto nuevo e independiente: no reutiliza código de FlickLAB.

## Arrancar

```bash
npm install
npm run dev
```

Abre la URL que imprime Vite, haz click en el canvas y a disparar.

| comando | qué hace |
| --- | --- |
| `npm run dev` | servidor de desarrollo con HMR |
| `npm run build` | build de producción en `dist/` |
| `npm run preview` | sirve el build de producción |
| `npm run audio:weapons` | importa las muestras de arma (disparo, silenciado, recarga) y las comunes de `Reference/Audio/` (paso manual) |

## Controles

- **Click** sobre el canvas: captura el ratón (Pointer Lock) y arranca la sesión.
- **Click izquierdo**: disparar.
- **R**: recargar. Funciona también con el cargador a medias.
- **1** saca el arma principal y **2** la pistola, que se lleva siempre. **Q**
  alterna entre las dos.
- **TAB** (mantenida): marcador de la sesión — bajas, muertes, precisión y KD.
- **B**: abre la **armería** — el panel donde se elige y se equipa el arma
  principal. Jugando, **pausa** igual que Escape.
- **V** conmuta el silenciador, **E** es la acción contextual y **4** aplica una
  carga de escudo. Todo esto se reasigna — ver *Controles reasignables*.
- **Escape**: suelta el ratón y **pausa** el cronómetro. En la pantalla de pausa
  hay un botón **Reanudar**, y también vale un click en cualquier sitio.

> **En pausa no avanza nada.** Ni el cronómetro, ni la cuenta atrás del
> explosivo, ni la recarga, ni la carga del escudo, ni la reaparición — y desde la
> vuelta 42, tampoco los muñecos: ni disparan, ni se mueven, ni aparecen. Hasta
> entonces seguían disparando con el juego parado y podían matarte desde el panel
> de pausa.

Sólo con la variante de movimiento activa (`MOVEMENT.enabled`):

- **WASD** o **flechas**: desplazamiento horizontal relativo a la cámara. El
  cabeceo no interviene: mirar al suelo o al cielo no cambia hacia dónde andas.
  Se recorre **la sala entera**; lo único que frena son las paredes, con
  `MOVEMENT.wallMargin` de holgura.
- **SHIFT** mantenido: caminar, una marcha intermedia entre correr y agachado
  (`MOVEMENT.walkSpeed`). Es la velocidad más rápida con la que se dispara sin
  penalización — ver *Precisión y movimiento*.
- **SPACE**: salto. Sin doble salto — no se puede volver a saltar hasta tocar
  el suelo. **Salta la pulsación, no la tecla apoyada**: mantener SPACE da un
  salto y hasta que no la sueltes y la vuelvas a pulsar no hay otro. A cambio,
  el juego se acuerda de lo que has pulsado: una pulsación en el aire **vale al
  tocar el suelo** (`MOVEMENT.jumpBufferMs`), y si te sales de un saliente
  andando todavía puedes saltar durante una décima larga
  (`MOVEMENT.coyoteMs`) — saltar en el borde de un cajón estrecho funciona.
- **SPACE justo al aterrizar**: **salto encadenado**. Si vuelves a pulsar
  dentro de una ventana estrecha alrededor del momento de tocar el suelo —un
  pelo antes o un pelo después, `MOVEMENT.chainJumpWindowMs`— el salto nuevo
  arranca con la marcha que traías en el aire en lugar de recalcularla desde el
  suelo. Encadenando mantienes el ritmo aunque llegues agachado; el control
  aéreo sigue siendo el de siempre.
  No es un acelerador: se **conserva** lo que llevabas, nunca se multiplica. Lo
  que acelera es el *air-strafe* (abajo), y encadenar es lo que deja seguir
  usando lo ganado. Y sólo cuenta si aciertas el tiempo: dejar la tecla apoyada
  no encadena, porque no vuelve a saltar.
- **A o D en el aire, girando el ratón hacia ese mismo lado**: **air-strafe**.
  Ganas velocidad por encima de tu carrera mientras estrafeas sin avanzar. Ver
  la sección propia más abajo.
- **Corriendo, pulsar C**: **deslizamiento**. Te tiras al suelo conservando la
  marcha —y de entrada mejorándola: 9.4 u/s contra los 6.5 de carrera— y frenas
  en línea recta hasta la marcha de agachado, unos 4.2 metros de recorrido. Se
  sale soltando C, dejando que se agote o **saltando**, y el salto sale con tu
  carrera, no con el empujón. No se gobierna: la dirección es la que llevabas al
  entrar. Hay que venir corriendo (andando con SHIFT no entra) y hay un
  enfriamiento entre uno y otro.
- **C** mantenido: agacharse. Baja la altura de la cámara y reduce la velocidad
  mientras se mantiene. Con SHIFT y C a la vez manda la marcha más lenta de las
  dos, o sea agachado.

> **Agacharse es C, no CTRL, y no es una preferencia.** Agacharse avanzando era
> Ctrl+W, y Ctrl+W **cierra la pestaña** en Chrome y en Edge: es un atajo que
> resuelve el navegador antes de que el evento llegue a la página, así que no
> hay forma de impedirlo desde aquí. Se manifestaba como un cierre intermitente
> «sin motivo» — sólo pasaba con W pulsada en el instante de agacharse.
> Ctrl+A/S/D sí se pueden neutralizar, pero con W no. Si aun así prefieres CTRL,
> es añadir `'ControlLeft'` y `'ControlRight'` a `MOVEMENT.keys.crouch`, con lo
> que vuelve el cierre.

## Controles reasignables

Todo lo que se pulsa está en un solo sitio, `KEYBINDS` en `src/config.js`, y se
puede cambiar desde **Opciones → Controles**: se pulsa la tecla actual y se
captura la siguiente pulsación. Cada acción tiene su botón **por defecto**.

| grupo | acciones |
| --- | --- |
| Movimiento | adelante, atrás, izquierda, derecha, saltar, agacharse, caminar |
| Combate | disparar, recargar, cambiar de arma, silenciador, **usar / artilugio** |
| Equipo | **arma principal (1)**, **pistola (2)**, cuerpo a cuerpo (3), escudo (4), artilugio (5), arrojadizo (G) |
| Interfaz | **marcador (TAB)**, **armería (B)** |
| Depuración | vista del avatar (F3) |

De las de **Equipo**, la **1 y la 2 equipan** cada una su ranura, la **4 aplica
una carga de escudo** y las otras tres están **reservadas y no hacen nada
todavía**: la tecla existe para que el mapa de controles sea el definitivo desde
el principio y nadie se encuentre luego con que su bind favorito ya estaba
cogido. El panel marca las que no tienen efecto.

**E es una sola acción, no dos.** Dentro del radio de algo con lo que se puede
interactuar —hoy el explosivo— **siempre** interactúa, y nada más: que ahí dentro
sacara un artilugio es como se pierde una ronda. Fuera de ese radio equipará el
lanzacohetes, que todavía no existe.

Cuatro reglas que el sistema no se salta:

- **Dos acciones no comparten tecla.** Ni reasignando, ni editando localStorage.
- **Nada va en Ctrl, Alt o Meta**, ni suelto ni en combinación: **Ctrl+W cierra
  la pestaña** y el navegador lo resuelve antes que la página. **TAB sí se
  puede**, y se comprobó pulsándola de verdad en vez de suponerlo: jugando no
  mueve el foco, ni con la tecla mantenida. Fuera de la partida se deja pasar,
  porque es como se recorren los paneles con el teclado.
- **Escape no se reasigna**: es la pausa. El panel lo dice.
- Lo guardado se **sanea** al cargar: un bind corrupto, desconocido o repetido
  cae a su valor de fábrica.
- Y si una tecla **cambia de dueño** entre versiones, la vieja se suelta sola. En
  la vuelta 42 el silenciador se mudó de la **B** a la **V** para dejarle la B a
  la armería: si nunca tocaste esa tecla, te llevas las dos nuevas sin hacer nada.
  Si la habías reasignado a mano, se respeta lo tuyo.

Las **flechas** y el **Shift derecho** siguen funcionando como alternativas
fijas: no son binds y no se pueden perder.

## Dónde ha ido a parar tu bala

Un disparo que no da en nadie deja una **marca** donde acaba: en la caja, en la
pared o en el suelo, encarada a la superficie que ha recibido el tiro y apagándose
en menos de medio segundo. Es lo que convierte un fallo en información: sin ella,
tirar contra una pared y tirar al aire se ven igual y no hay forma de corregir.

Sale igual **entrenando contra muñecos y jugando un duelo**, porque es lo mismo:
el efecto vive en el motor, no en un modo. Contra un cuerpo alcanzado no se
dibuja nada — ahí ya lo dice el anillo de la mira.

## Pisadas de los demás

Cuando un rival **corre** cerca, se le **oye**, con dirección y volumen según
dónde esté: si pasa por tu izquierda, suena a tu izquierda. Es la forma de
enterarte de que hay alguien detrás de una esquina sin verlo.

Son de **los demás** y de nadie más: tus propias pisadas no suenan. No te dirían
nada que no sepas —estás pulsando la tecla— y taparían justo lo que estas
pisadas vienen a dejar oír.

**Andar con SHIFT y agacharse son silencio, no un volumen más bajo.** Para eso
están esas teclas: lo que se paga por ellas es la velocidad. Si no quieres que te
oigan llegar, no corras.

**Y hay un radio: 16 unidades.** Más lejos no se oye absolutamente nada; más
cerca, el volumen sube de verdad según se acerca —a partir de dos metros y medio
ya suena a tope y no sube más—. El tope está bastante por debajo de un disparo, a
propósito: una pisada dice *dónde* hay alguien, y confundirla con un tiro es
peor que no oírla.

El paso se cuenta en **suelo recorrido**, no en tiempo, así que el ritmo sale
solo de lo rápido que vaya el otro.

## Probarlo en local, y publicarlo

```bash
npm install          # una vez
npm run host         # construye y levanta el juego y las partidas en el 5199
```

Luego, en el navegador: **http://localhost:5199/**, y el botón **Duelo 1v1** del
menú lleva al 1v1 —crea un código y te da el enlace para pasárselo al otro—. Si
prefieres ir directo, `/duelo/` hace lo mismo.

**Para jugar con alguien de tu casa, `localhost` no vale.** Apunta siempre al
equipo que lo escribe, así que si le pasas ese enlace, el otro abre su propio PC
y no pasa nada —ni siquiera da error—. Lo que hay que pasarle es la dirección de
red de tu equipo, y **`npm run host` la imprime al arrancar**:

```
  en este equipo   http://localhost:5199/
  desde tu red     http://192.168.1.42:5199/   (Ethernet)
```

Para probar un 1v1 tú solo hacen falta **dos navegadores distintos** —o uno
normal y otro de incógnito—, no dos pestañas: el navegador frena la pestaña que
no está delante y el duelo se ve a tirones sin que nada esté roto.

**Ojo:** `npm run host` construye **al arrancar** y sirve lo que había en ese
momento, cacheado en memoria. Si cambias código, **párala y vuelve a lanzarla**.
Para saber si lo que se está sirviendo es lo de ahora, `http://localhost:5199/salud`
dice qué build tiene cargado.

Y para desarrollar con recarga en caliente, `npm run dev` (Vite en el 5173) con
`npm run net` aparte para las partidas.

### Publicar en Fly.io

**El despliegue no se actualiza solo al hacer push.** No hay ninguna acción
automática: subir a GitHub guarda el código y nada más. Publicar es, desde el
repositorio ya actualizado (`git pull`):

```bash
fly deploy --ha=false
```

El `--ha=false` no es opcional: por defecto Fly crea **dos** máquinas, y como las
salas viven en la memoria del proceso, dos máquinas son **dos mundos** para el
mismo código de partida —los dos jugadores entran, cada uno en la suya, y no se
ven, sin un solo error en pantalla—. El paso a paso completo está en
`docs/despliegue-fly.md`.

## El duelo 1v1: rondas y reconexión

Se entra por el botón **Duelo 1v1** de la pantalla de inicio. Lleva a la página
del duelo, que crea una partida sola y enseña su código, el enlace para copiar,
un campo para entrar en el código de otro y los selectores de **mapa** y de fase
de compra.

**Las opciones de la partida son de quien la crea**, y sólo hasta que entra el
rival: al que se une por el enlace le salen apagadas, porque cambiarlas no
reconfigura la sala —empieza otra, con otro código— y eso dejaría al otro solo en
la de antes.

**El menú de ESC tiene tres botones:** *Pausar la partida*, *Opciones* y *Salir
de la partida*. Las opciones son las mismas del juego —controles, sensibilidad,
sensibilidad de la mirilla— y se abren **sin salir de la partida**; el mundo
sigue corriendo mientras las miras, así que ahí eres un blanco. Pausar es lo
único que para el mundo, y lo para para los dos.

**Y el botón «copiar» copia siempre**, también cuando juegas por la IP de tu red:
ahí el navegador no da portapapeles moderno y hace falta el camino de abajo. Lo
que copia es una URL completa. Un aviso que no está en nuestra mano: WhatsApp no
convierte en enlace una dirección de red privada con puerto —lo que se comparte
fuera de casa es la dirección del despliegue, que sí sale clicable—.

### El mapa: El Espejo

El duelo tiene su propio mapa, distinto del del aim trainer. Es **simétrico**
—media vuelta, no un espejo: lo que ve uno es exactamente lo que ve el otro— con
las dos salidas en **extremos opuestos**, a 32 unidades y sin verse entre ellas.
Cada uno sale detrás de su propia pantalla y con dos salidas, una por lado: una
estrecha, pegada a la pared y con una puerta de paso, y otra abierta con
cobertura suelta. Con el giro, a cada jugador le tocan cambiadas, así que rotar
significa algo.

Cruzarlo de una salida a la otra son **7 segundos** a marcha de carrera, y lo
antes que dos jugadores pueden encontrarse corriendo el uno hacia el otro son
**3 segundos y medio**: da tiempo a elegir carril y no a aburrirse. Es plano, sin
plataformas ni rampas — la altura es donde un 1v1 se desequilibra primero, y eso
se añade midiendo, no de entrada.

El Plano A («Largo y Puerta») se queda para el aim trainer y los muñecos, y por
eso los mapas del duelo **no salen en el selector de escenarios**: no tienen
explosivo, ni recogibles, ni nada que buscar.

### El otro mapa: Los Pilares

Se elige en el desplegable de **mapa**, junto al código, antes de pasarle el
enlace a nadie. Y no es «El Espejo con otras cajas»: **se mueve distinto**.

- **Pesa menos.** La gravedad de este mapa es menos de la mitad de la normal, así
  que un salto sube **3.3 unidades** —contra 1.25— y dura **1.4 segundos** contra
  medio. Coger carrerilla antes de saltar cambia de verdad dónde acabas.
- **El aire manda.** El techo del air-strafe sube a 12 u/s (contra 9.5), y con un
  vuelo tan largo eso son 17 unidades de salto. Los vanos entre plataformas están
  medidos contra ese número: quien no estrafee se queda corto.
- **Hay altura, y subir es una decisión.** Las **torres** (3.2 u) se suben desde
  el suelo justo, y las **atalayas** (6 u) sólo desde una torre. La del centro es
  lo único que corta la línea recta entre las dos salidas, y para tomarla hay que
  cruzar un vano a la vista de todos.
- **Y las líneas de tiro son largas**: la sala mide 56 de lado y las dos salidas
  están a 48 unidades, sin verse entre ellas.

**Aquí no se compra: se reparte.** No hay tienda, ni dinero, ni elección de arma.
Cada ronda —y también al reaparecer— te dan **Scout, chaleco y el cuchillo**, y
nada más. Sin casco a propósito: con el chaleco hacen falta dos balas al cuerpo y
**una a la cabeza sigue matando de un tiro**, que es lo que hace que un mapa de
francotiradores se juegue apuntando arriba. Tampoco hay fase de compra: las
rondas se encadenan, y el selector de fase sale apagado diciendo por qué.

Lo demás es idéntico a El Espejo: las mismas 14 rondas, la misma condición de
victoria, la misma reconexión.

### Las rondas

Un duelo se juega **a 14 rondas** (mayoría de 8). Cada ronda dura **3 minutos** o
hasta que uno mate al otro; si se acaba el tiempo sin muertes, gana la ronda quien
llegue con más vida, y si las dos vidas están exactamente igualadas la ronda **no
cuenta para nadie y se repite**. Un 7-7 lleva a **prórroga**, que se juega en
tandas de dos rondas hasta que alguien acabe una tanda por delante.

Entre ronda y ronda hay **15 segundos de fase de compra**: cada jugador vuelve a
su salida, se queda encerrado en una caja de 4 u alrededor de ella y **no recibe
la posición del rival**, así que no hay forma de verse ni de dispararse. Es la
ventana de la tienda, que se cuenta un poco más abajo.

**Y la ronda avisa antes de acabarse:** en los últimos **15 segundos** el
contador se pone en rojo y suena un pitido suave por segundo, el último más
agudo. Suave a propósito — avisa, no sobresalta.

Todo es configurable en `ROUNDS` (`src/config.js`).

### Si se corta la conexión

Irse y caerse son dos cosas distintas:

- **Irse** es pulsar «Salir de la partida». El rival gana esa ronda y la partida.
- **Caerse** —wifi, portátil dormido, pestaña cerrada— no manda ningún aviso, así
  que el juego lo trata como lo que es: la partida **se pausa** para el que sigue
  conectado, con un cartel que lo dice, y se guarda la butaca entera (vida,
  rondas, ranura y arma).

Quien se cayó tiene **90 segundos** para volver: al abrir de nuevo el enlace del
duelo se reconecta solo a la misma partida, o le sale un botón **Reconectar** si
abre otro. Si no vuelve, la partida se da por abandonada y la gana el rival. Y el
que está esperando no queda atrapado: a los 15 segundos le aparece un botón para
dar la partida por abandonada cuando quiera.

Recargar la página **no** es irse: es como se vuelve.

## La armería del duelo: dinero, rondas y compra

Entre ronda y ronda hay una **fase de compra** —quince segundos de fábrica, y
quien crea la partida elige cuántos o si no la hay— con cada jugador encerrado
en su zona y sin ver al otro. Ahí se abre la armería con **B** (reasignable en
opciones): el mundo sigue corriendo, pero el ratón se suelta para poder pinchar.

**Y si eliges partida sin fase de compra, la tienda no cierra:** se compra
durante la ronda entera, cuando puedas. No hay ventana entre rondas donde meterla,
así que la ventana es la ronda — con el mundo corriendo, que es el precio: con el
panel abierto eres un blanco.

**Se compra de dos formas, y las dos valen igual:** pinchando el artículo, o
tecleando su **combinación** — categoría y código, que van escritos en la esquina
de cada ficha. La Pulse es `1 1`, la Volt `3 1` y la Rift `4 3`. Los códigos
dejan huecos a propósito para las armas que faltan: cuando lleguen, lo que ya te
sabes no cambiará de sitio.

**Con el arma en la mano, el clic derecho pone y quita el silenciador.** No
cuesta dinero, no está en la tienda y se puede hacer en cualquier momento — es
tu arma, no un accesorio que se compra. Lo dicen las fichas de la Pulse, la Volt
y la Rift, que son las tres que lo admiten.

**El cuchillo tampoco se compra:** el Vanta va contigo siempre, en cualquier
mapa, como la pistola.

**Lo que compras suena al ponértelo** —cada cosa con lo suyo: el chaleco con una
cremallera, el casco con un golpe sordo, un arma con el cerrojo— y su artículo
pasa a decir **«Equipado»** mientras lo lleves. Si no te llega el saldo no suena
nada, porque no se te ha dado nada.

**Y los números de cada arma se pueden mirar sin comprar:** el botón «Ver fichas
de las armas», abajo en la tienda, abre la misma ficha que la armería del
entrenamiento — con la Scout y el Vanta incluidos. En los mapas que reparten, la
tecla de la armería abre directamente eso, que es lo único que hay que ver.

**Y en Los Pilares nada de esto existe.** Ese mapa reparte el equipo en vez de
venderlo, así que no hay tienda, ni dinero, ni fase de compra: la tecla de la
armería abre las fichas de las armas y el selector de fase sale apagado. No es
lo mismo que elegir «sin fase», que es justo lo contrario —ahí se compra todo el
rato—.

### El dinero

| | cuánto |
|---|---|
| Ronda 1 | 800, y **sin armas largas**: la primera se juega con pistola |
| Ganar una ronda | +3200 |
| Perderla | +2400, y sube si encadenas derrotas |
| Matar | +300 |

Con eso, la ronda 2 no es igual para los dos: el que ganó llega al rifle (2900) y
poco más, o se lleva el subfusil (1600) con compra completa; el que perdió no
llega al rifle y elige entre subfusil con algo de equipo o ahorrar para la
siguiente. **Y morir cuesta el equipo**: quien cae empieza la ronda siguiente con
la pistola y sin chaleco.

El chaleco (500) y el casco (350) **paran balas de verdad**: el duelo usa la
misma escalera de daño que el entrenamiento —el casco se come el primer tiro a la
cabeza, el escudo cubre el cuerpo—. Las granadas salen en el panel con su precio
y su combinación, **precintadas con «Próximamente»**: todavía no existen, y
venderlas sería prometer algo que no hay. Lo que sí se puede comprar ahora mismo
va marcado en verde, para que no haya que leer letra pequeña para saber cuál es
cuál.

Todos los números están en `ECONOMY` (`src/config.js`) y son de partida: se
calibran jugando.

## Cómo suena un disparo

Todas las armas suenan sintetizadas en tiempo real, sin un solo fichero de audio,
y **las tres** llevan la misma voz seca y metálica: ataque instantáneo, un golpe
de ruido, metal saturado encima y un grave corto por debajo. Nada se sostiene.

Cada una tiene su carácter, y sale de su ficha: la **Pulse** es corta y aguda, la
**Volt** es la más breve de las tres —dispara cada 75 ms, y una cola más larga se
pisaría a sí misma— y la **Rift** es la que conserva cuerpo. Medido, la Pulse ha
subido 12.8 dB y la Volt 11.1 respecto a la voz que tenían.

Las silenciadas no son las normales con el volumen bajado: se les quitan el grave
y el chasquido de banda ancha —las dos capas que delatan un disparo a distancia—
y se les deja el **cerrojo**, que suena un instante después.

## Muestras de audio (probadas y apagadas)

En la vuelta 63 se probaron en juego diez muestras grabadas —los tres disparos,
sus tres variantes silenciadas, las tres recargas y el gatillo en seco— y se
**descartaron**. No por calidad: sonar a sintetizado es parte de lo que es
Vektor, y que no haya nada que descargar ni decodificar es parte de que corra en
cualquier máquina.

Así que `AUDIO.samplesEnabled` está en **`false`** y el juego suena entero
sintetizado. El carril se queda montado y los ficheros siguen en
`Reference/Audio/`, sin entrar en el build: con el interruptor apagado el
importador no copia nada.

Para volver a probarlas: pon `AUDIO.samplesEnabled` a `true` en `src/config.js`,
deja en `Reference/Audio/` **sólo** las que quieras probar y pasa
`npm run audio:weapons`. La convención, por si llega el día:

1. Deja los ficheros en su carpeta, con la **clave** del arma (`pulse`, `rift`,
   `volt`), no su etiqueta. Valen `.mp3`, `.ogg` y `.wav`, en ese orden de
   preferencia:

   | Sonido | Fichero |
   |---|---|
   | Disparo | `Reference/Audio/weapons/<arma>.<ext>` |
   | Disparo con silenciador | `Reference/Audio/weapons/<arma>-suppressed.<ext>` |
   | Recarga | `Reference/Audio/weapons/<arma>-reload.<ext>` |
   | Cargador vacío | `Reference/Audio/comunes/gatillo-seco.<ext>` |

2. `npm run audio:weapons`. Copia lo que haya a `public/audio/` y escribe el
   manifiesto `src/audio/weaponSamples.js`. Es un paso manual, como los tres
   scripts de trazado: `Reference/` no se sirve nunca.

**Lo que no hace falta hacer:** nada más. Un arma sin fichero sigue sonando
sintetizada, y también si el fichero no se decodifica o si todavía está
descargándose — un disparo nunca espera a su muestra. Que falte la variante
`-suppressed` **no** hace que suene la normal: con supresor puesto sonaría un
disparo sin supresor, que es información falsa, así que cae al perfil silenciado
sintetizado.

**La recarga es la excepción, y a propósito:** no tiene síntesis debajo porque
nunca ha sonado de ninguna manera. Sin fichero se queda en silencio, como hasta
ahora. Un chasquido de emergencia diría «tu arma ha hecho algo» sin decir qué.

**Cómo volver atrás.** Un sonido que no encaje: se saca su fichero de
`Reference/` y se vuelve a pasar `npm run audio:weapons` — el manifiesto es la
lista de lo que hay. Todos a la vez: `AUDIO.samplesEnabled: false` en
`src/config.js`. La síntesis no se sustituye nunca, así que siempre está debajo.

**Qué le pasa al build.** Medido con un fichero de 7 KB: el bundle de JavaScript
no cambia **ni un byte ni de hash** (840.370 B en los dos casos). Lo que hay en
`public/` se copia tal cual, no se empaqueta: no entra en el JS, no se convierte
en base64 y no toca el arranque ni el primer pintado. Cada muestra es una
petición aparte, cacheable por su nombre, que sale **después del primer click**
—que es cuando existe el contexto de audio— y en paralelo. Con tres armas y las
dos variantes con supresor son cinco ficheros: a 128-192 kbps y ~150 ms de
disparo, del orden de 5-10 KB cada uno y 25-50 KB en total, menos del 6% de lo
que ya pesa el JS. Desde que se pide hasta que está lista para sonar, medido con
una muestra de 120 ms: **~90 ms**.

Lo único que habrá que calibrar con el primer fichero real es **el nivel**: una
grabación viene normalizada a tope y la síntesis no. En el banco, la muestra de
prueba dio un pico 3.3 veces más alto que el disparo sintetizado, y un salto así
al cambiar de arma se oye. Para eso está `AUDIO.sampleVolume`.

## Avatar del jugador

El cuerpo que llevará quien juegue cuando haya multijugador. Hoy sólo se puede
mirar: **F3** abre una vista en tercera persona que lo orbita, fuera de partida
—con el cronómetro corriendo la cámara es del jugador—.

**Es exactamente el mismo cuerpo que una diana**, y eso es la idea, no una
simplificación: una cápsula con la cabeza ovalada, tres piezas —una por zona del
hitbox: cabeza, torso y piernas— y **lo único que cambia es el color**. Naranja
si es una diana de entrenamiento; el de su equipo si es un jugador.

Así, a un rival se le reconoce por **el color**, que se ve igual desde cualquier
ángulo, y no por su forma, que se ve distinta desde cada uno. Hacia dónde mira lo
dice la brújula que lleva encima, no el cuerpo.

**Colores de equipo de partida:** azul `#2F6BF0` y magenta `#D94BD9`. La paleta
libre es estrecha —el naranja es de las dianas, el rojo de que te disparan, el
verde de los botones y la brújula, el ámbar del explosivo, el amarillo de que te
han detectado y el azul eléctrico de la carga—, y los dos que quedan se
eligieron midiendo: entre ellos hay ΔE 51 en CIELAB, y contra el más cercano de
los reservados, 79.

Tres cosas más:

- **Agacharse lo achata.** Sólo escala en vertical: no hay esqueleto ni
  animación, y el factor sale de la misma altura de ojos de la que salen las
  zonas de disparo.
- **Sin arma visible**, ni en primera ni en tercera persona. Lo que se dibuja de
  un arma es su silueta —en el HUD y en la ficha flotante—, no un modelo en la
  mano.
- **Sin texturas y sin líneas**, como todo lo demás: en esta escena no hay ni una
  luz, así que un mapa no se vería.

Antes de esto había un humanoide de cuarenta y dos piezas con brazos que se
afinaban, hombreras, dedos y costuras de luz. Se tiró entero, y a propósito: un
modelo con extremidades **promete** información que no da —sin esqueleto ni
animación, los brazos no apuntan a ningún sitio— y hay que pagarlo por cada
jugador de una partida. El porqué largo está en `docs/decisions.md` §38.

Nada de esto es un sistema de skins de pago: eso depende de economía y cuentas,
que no existen.


## Modos de sesión

Dos botones en la pantalla de inicio:

- **Jugar ahora** — sesión cronometrada de `SESSION_DURATION_S`, que termina
  sola y saca el resumen. Con escenario, es **la ronda del explosivo**: la bomba
  lleva el reloj y los muñecos **no reaparecen** (ver más abajo).
- **Deathmatch** — el escenario **sin bomba**. Dura lo que diga su ajuste: sin
  límite (lo de siempre, con `∞` en el HUD y cierre manual desde la pausa) o 3, 5
  o 10 minutos. En la sala vacía este botón se sigue llamando **Práctica libre
  ∞**: sin cobertura ni muñecos que disparen no hay deathmatch que valga.

En Deathmatch el resumen enseña **bajas, muertes, KD y precisión**, y **no hay
estrellas**: las estrellas puntúan cumplir un objetivo —la mitad de la nota es
lo que tardas en desactivar— y sin bomba no hay contra qué medir. El porqué
completo está en `docs/decisions.md` §41.4.

**Reiniciar** conserva el modo; **Volver al inicio**, en el resumen, devuelve a
la pantalla de selección.

## Marcador (TAB)

Manteniendo **TAB** se abre un panel con **nick, bajas, muertes, precisión y KD**
de la sesión en curso, y se cierra al soltarla. Sólo se abre jugando: en la pausa
y en opciones, TAB sigue siendo del navegador para recorrer los paneles con el
teclado.

El nick es un **placeholder** (`VK-00`, el mismo vocabulario que los `VK-01` de
los muñecos): no hay cuentas ni nombres configurables todavía. Y hay **una sola
fila**, la tuya. El layout es una rejilla preparada para más —el día que haya con
quién compararse, una fila es un div más— pero una lista de rivales vacía o
inventada diría que existe algo que no existe.

## Variantes de puntería

Un único interruptor, `MOVEMENT.enabled` en `src/config.js`, cambia entre los
dos. El motor es el mismo: no hay código duplicado.

### Gridshot estático (`MOVEMENT.enabled: false`)

La línea base de puntería pura. El jugador está clavado en el centro de la
sala y el cono de aparición sigue la mirada, así que las dianas salen siempre
dentro del campo de visión. Es el modo original y no ha cambiado nada.

### Gridshot con movimiento (`MOVEMENT.enabled: true`)

El jugador recorre **la sala entera**: no hay radio artificial que lo ate al
centro —lo hubo, `MOVEMENT.radius`, y desapareció cuando el movimiento pasó a
cubrir todo el mapa—. Lo único que lo frena son las paredes, con
`MOVEMENT.wallMargin` de holgura. Salta, encadena saltos, hace air-strafe y se
agacha.

El cono de aparición cambia de régimen: **el vértice es la posición actual del
jugador** —incluida su altura real, esté agachado o en el aire— pero **la
dirección es fija en el mundo** (`SPAWN.anchoredAxisYawDeg` /
`anchoredAxisPitchDeg`). Ni la mirada, ni el salto, ni el agachado la rotan.
Eso es lo que hace que desplazarse cambie de verdad el ángulo hacia las
dianas, en lugar de que el cono te siga y el movimiento no cuente para nada.

En ambos casos: una diana a la vez, *pop* al acertar y otra en menos de
100 ms, sesión de 30 segundos y resumen con precisión, dianas y dianas/s.

## Escenarios

Se elige en **Opciones → Escenario**, y es una variante activable: la sala vacía
sigue ahí sin cambiar.

Cada escenario se presenta con su **plano cenital** —dibujado a partir de la
geometría real, así que siempre coincide con lo que vas a jugar— y, el que tenga
cobertura, con una ficha corta de qué entrena, qué tiene de exigente y cuánto se
deja rejugar. Los planos van en **columna fija de 140 px**, la mitad de lo que
medían cuando se repartían el ancho entre dos: el selector crece en filas a
medida que haya más escenarios, en vez de encoger los que ya estaban. Al cambiar de escenario hay una transición breve mientras se monta
el nuevo.

**Sala vacía** — el Gridshot de siempre. Las dianas salen por muestreo dentro del
cono, con la distancia y el modo dinámico que digan las opciones.

**Largo y Puerta** — el primer escenario con cobertura. Ocupa **su propia sala
de 40×40**, la mitad de lado que la vacía: la misma cantidad de cobertura con
mucho menos suelo entre pieza y pieza. Cruzarlo en diagonal son ~8 s a marcha de
carrera en vez de ~17.

Apareces en el **Vestíbulo**, pegado al fondo del mapa y con **un muro delante**:
una sola pieza de 14 u, más alta que tú, atravesada entre tu punto de aparición y
el resto de la sala. Detrás de él **no te ve nadie** —ni uno de los 68 puntos por
los que salen los muñecos— y de ahí sólo se sale rodeándolo por un extremo o por
el otro. Asomarse cuesta un cuarto de segundo por el oeste y algo menos de un
segundo por el este; cruzarlo de punta a punta, 2.4 s. Es tu primera cobertura y
está puesta para que practiques el asomo con ella.

Y **de la línea de ese muro hacia atrás no aparece ningún muñeco**, en ningún
modo: esa banda queda fuera del mapa de rutas por el que se mueven, así que ahí
ni nacen ni patrullan. Reaparecer donde ya te esperaba uno era morirse otra vez
sin tocar el ratón. A la izquierda, **El Largo**: un carril
de unas 25 unidades de visión limpia, roto por tres bloques Media escalonados que
se cruzan a base de asomadas cortas. En el centro, **La Espina**, un muro que
parte el mapa de norte a sur con un único hueco de 2.5 u —**La Puerta**—, el
único punto del mapa que se puede pre-apuntar con certeza. A la derecha, **Los
Cajones**: corta distancia, asomada agachado y giros cortos. Al fondo, **El
Balcón**: una plataforma elevada con **una rampa en cada extremo** y un parapeto
con dos troneras que miran El Largo de punta a punta.

Desde el punto de aparición se ve el paso central, así que la sesión arranca con
dianas **de frente y a distancia** —el Balcón al fondo, los Cajones a media
sala— y con varias a los flancos, que obligan a girarse.

Las dianas no salen de un puñado de sitios fijos: el mapa declara **rutas**, y
cualquier punto de una ruta vale a la vez para que nazca una diana y para que
camine hacia él. En Largo y Puerta son **14 rutas y 68 puntos**, repartidos por
las seis zonas. Tres detalles que se notan jugando: una diana nunca reaparece en
el punto exacto donde la acabas de matar, mientras queden rutas libres los
muñecos se reparten en vez de amontonarse en la misma, y **el mapa nunca se queda
en una sola zona**.

### Quedarse quieto no vacía el mapa

Una zona no puede acumular más de la mitad de los muñecos vivos
(`SPAWN.zoneShare`). En cuanto hay dos vivos hay dos zonas, te quedes donde te
quedes y por mucho que tardes en moverte.

No es un adorno: plantado en la pasarela del Balcón sólo se ven puntos de **dos**
de las seis zonas, y como las dianas se sortean entre las que ves, las
reapariciones acababan cayendo todas arriba hasta dejar el resto del mapa vacío.
Medido antes: el 10% del tiempo los cinco muñecos estaban en la misma zona, y
sólo dos zonas del mapa llegaban a usarse. Después: **ni una sola vez**, campando
en las seis zonas y con x2, x5 y x8.

El sesgo hacia delante sigue haciendo más probable la zona que estás mirando —eso
no ha cambiado—, pero ya no puede dejar las demás a cero. Y si te plantas en un
sitio desde el que sólo se ve una zona, los que no caben salen **donde no los
ves**: tendrás que ir a buscarlos, que es justo el punto.

### Cómo leer las estructuras

El gris dice la altura, y la altura dice lo que puedes hacer:

| Pieza | Altura | De pie | Agachado |
|---|---|---|---|
| Bordillo | 0.60 | no tapa — y te subes de un salto | no tapa |
| Baja | 1.25 | disparas por encima — y te subes de un salto | te tapa entero |
| Media | 1.90 | te tapa entero (desde un bordillo, disparas por encima) | te tapa |
| Alta | 3.60 | corta del todo | corta del todo |
| Bloque | 4.80 | corta del todo, también desde el Balcón | corta |

Más claro, más alto, menos se pasa.

Ninguna pieza se atraviesa, en ningún estado: ni de pie, ni agachado, ni en el
aire. Las rampas tampoco — son sólidas por debajo y por los costados, y sólo se
pasa por encima. La única holgura es el escalón de 0.25 u, que es lo que te deja
subirte a un bordillo sin saltar.

### Qué cambia al jugar con cobertura

- **Chocas con las estructuras.** Rozar un muro desliza, no frena en seco.
- **Los disparos se paran en la cobertura.** No se mata a través de un muro.
- **Las dianas salen en trece sitios fijos**, elegidos a mano por zona, y sólo en
  los que **ves desde donde estás**. La mayoría de las veces salen **hacia donde
  estás mirando**, no a la espalda — pero no siempre: de vez en cuando aparece
  una detrás, para que no te acomodes.
- **Con modo dinámico, los muñecos hitbox patrullan.** Cada uno tiene un grupo de
  puntos en su zona y va de uno a otro caminando. Los recorridos están
  verificados de antemano, así que nunca se quedan encajados en un muro. Si no ves ninguno, no sale ninguna: muévete.
  Por eso el selector de dianas simultáneas es un techo y no una cantidad: con x8
  verás entre dos y seis a la vez según la zona en la que estés.
- **El modo dinámico y la distancia de aparición no se aplican.** Las dianas se
  quedan en su sitio; moverlas las metería dentro de los muros.

## El explosivo

Con un escenario montado y cronómetro (no en práctica libre) aparece un
**explosivo** en algún punto del mapa. Tienes **45 segundos**.

**No hay nada en el HUD que te diga dónde está.** Ni marcador, ni flecha, ni
distancia. Lo único que tienes es el **pitido**: suena más fuerte cuanto más
cerca estás, y más rápido y agudo cuanto menos tiempo queda. El marcador —un
rombo ámbar parpadeante— está en el mundo, así que lo verás si miras hacia él,
pero hay que buscarlo.

Con **audio espacial** activado (opciones, por defecto sí) el pitido llega
además **con dirección**: no sólo sabes si estás cerca, sino hacia dónde girar.
Desactivado se queda en volumen por proximidad, como antes.

Para desactivarlo, ponte al lado y **mantén E unos tres segundos**. Un anillo en
el suelo se va llenando. Si sueltas, el progreso se pierde entero, pero no hay
más castigo que el tiempo perdido.

Desactivarlo o que estalle terminan la sesión, y el resumen te dice cuál de las
dos cosas pasó.

## Combate: los dummies disparan

En **modo escenario con dianas de hitbox completo**, los muñecos dejan de ser
blancos quietos. Cuando uno te ve y estás dentro de su rango de enganche (24 u),
abre fuego.

Dispara con **el mismo modelo de arma que tú**: cadencia, cargador, recarga y
sonido salen de `WEAPONS` —hoy lleva la Rift— así que no hay una segunda idea
de lo que es un arma. Lo único suyo es la puntería: apunta al centro de tu cuerpo
y desvía el disparo dentro de un cono.

**La dificultad se elige en el panel**, y es un nivel, no dos mandos:

| Nivel | Cono (cuánto falla) | Reacción (cuánto tarda en abrir fuego) |
|---|---|---|
| Fácil | 15° | 900 ms |
| Normal | 9° | 650 ms |
| Difícil | 5° | 400 ms |

Van juntos a propósito. Lo que se nota jugando es una sola cosa —cuánto
aprietan—, y con dos mandos separados se acaba con combinaciones que no
corresponden a ninguna dificultad real: un tirador de élite que tarda un segundo
en reaccionar. Normal es exactamente lo que había antes, y los tres son puntos de
partida a calibrar jugando.

El cono parece enorme para un tirador y no lo es: **el disparo es instantáneo y
va a donde estás ahora**, así que moverse no le hace fallar ni un poco. Todo lo
que falla sale de ahí. Medido de pie en el punto de aparición del Plano A: con
4.5° entra el 84% de los disparos; con 9°, el 54%.

La velocidad de movimiento no es un parámetro de dificultad a propósito: ya existe
como **velocidad de patrulla** en el panel de opciones.

### Qué se ve encima de un muñeco

Tres capas, en el mundo y no en una esquina de la pantalla — son datos **de un
sitio del mapa**, y una lista en el HUD obliga a traducir «hay dos» a «cuáles».
De abajo arriba:

1. **La brújula**: una cuña verde con volumen flotando sobre la cabeza, que gira
   para apuntar hacia donde mira el muñeco. **No se gira hacia ti**: si lo
   hiciera apuntaría siempre al jugador y no diría nada. **Sale sólo sobre un
   muñeco que ves de verdad**: dentro de la pantalla y sin cobertura por medio, y
   con el mismo test de visión que decide dónde puede aparecer uno. Flotando
   sobre un muro te decía dónde hay alguien a quien no puedes ni ver ni disparar,
   que es un aviso de rayos X que el juego no da por ningún otro sitio. Su cola
   va más oscura que el resto, y
   eso es lo que distingue a uno que te encara de uno de espaldas: sin luces en
   la escena, de frente y de espaldas la silueta sería la misma. **Y la punta
   cae**, que es la misma información por el otro canal: de perfil, donde el
   claro/oscuro no dice nada porque se ven las dos caras a la vez, lo que apunta
   es la pendiente. Lleva **contorno negro**, que es lo que le conserva el filo
   sobre las piezas claras del mapa —contra ellas el verde solo se queda en 1.3
   de contraste—. **Es pequeña a propósito**: ocupa el 61% del ancho de la
   silueta del muñeco —la primera versión ocupaba el 105%, más que el propio
   muñeco— sin dejar de leerse a media distancia, porque más allá de 8 u deja de
   encoger en pantalla.

   **Y cuando le estás viendo la espalda, su cola se enciende.** Es el único
   aviso de este marcador que no dice hacia dónde mira sino qué puedes hacerle:
   se enciende exactamente dentro del arco en el que una puñalada fuerte mata de
   un golpe, ni un grado más. Con el cuchillo en la mano eso deja de ser un
   detalle.
2. **Un `?` amarillo** mientras te ha visto y todavía no dispara —ésa es su
   ventana de reacción, y es exactamente el hueco que tienes para cubrirte— o
   **un `!` rojo** mientras te dispara, uno por muñeco, así que se cuentan las
   amenazas de un vistazo. Se apagan al perder el contacto y al caer el muñeco.
   **Éstos sí salen aunque el muñeco esté tapado**, al contrario que la brújula:
   son avisos, y un aviso que sólo llega cuando ya ves al que dispara llega
   tarde.
3. **La ficha**: silueta del arma arriba y nick debajo. **No sale por estar a la
   vista**: sale tras mantener la mira encima un instante. Una ficha por cada
   muñeco visible sería una pantalla de rótulos; apuntar es lo que dice a cuál
   estás mirando. El día que haya equipos, a un compañero se le verá siempre —
   saber quién juega contigo no se gana apuntando.

El `?`, el `!` y la ficha sí miran a la cámara, porque lo suyo es leerse; la
brújula no, porque lo suyo es orientar.

### Saber que te disparan sin estar mirando

Todo lo anterior está **delante**: la brújula, el `?` y el `!` sólo existen para
los muñecos que tienes en pantalla, y el anillo de la mira dice *que* te han dado
pero no de dónde. A un tirador a la espalda sólo se le podía buscar girando a
ciegas. Tres señales más, y **ninguna necesita que le estés mirando**:

- **Una cuña roja en el borde de la pantalla**, hacia el lado real del que te ha
  disparado, medio segundo y con el centro libre —cuando te disparan, lo último
  que se puede tapar es el sitio al que hay que apuntar—. El ángulo se mide desde
  donde miras **en ese instante**, así que sirve para girar: si te gira la mira el
  retroceso, la cuña lo tiene en cuenta. Y se mide en horizontal: un disparo desde
  el Balcón sigue viniendo de un lado, mires al suelo o no.
- **El silbido de la bala que falla por poco.** Un chasquido fino que baja de
  tono, distinto del disparo, y que suena **desde el punto por el que pasó la
  bala**: si te pasa por la derecha, se oye por la derecha. Salta cuando pasa a
  menos de 1.8 u del oído, y no cuando la para una caja ni cuando el que dispara
  está a bocajarro —ahí el propio disparo ya lo dice—.
- **Un fogonazo blanco** en el pecho del que dispara, unas decenas de
  milisegundos. Es lo que delata a un muñeco quieto entre cajas al fondo del
  mapa. No hay arma dibujada: lo que se enciende es la boca del arma.

No hay trazadoras: una bala visible es otra cosa y se decide aparte.

Tres cosas más que conviene saber:

- **Dispara en ráfagas** de cuatro con pausa. Sin eso, un arma automática vacía
  el cargador de una sentada y no queda hueco para responder ni para cubrirse.
- **La cobertura tapa de verdad.** Si no hay línea de visión, no dispara;
  asomarse y volver a cubrirse reinicia su tiempo de reacción.
- **Te dan por zonas**, y son tus tres zonas: cabeza, torso y piernas, las mismas
  del hitbox con el que tú les disparas a ellos.
- **Y te dan donde se te ve.** Lo que recibe los disparos es exactamente la
  silueta que se dibuja de un jugador — un tiro que pasa al lado de la cabeza o
  por encima de ella no cuenta, ni contra ti ni contra un rival.

## Vida, escudo y casco

**100 de vida.** El daño por zona es el de siempre —cabeza 100, torso 50,
piernas 34— con el cuerpo escalado para el jugador, que a diferencia de un muñeco
tiene que cruzar el mapa bajo fuego. La cabeza **no** se escala: vale una vida.

**Escudo, hasta 150 en tres segmentos de 50.** Cubre el cuerpo y absorbe un
porcentaje fijo según el arma que te dispara (Pulse 50%, Rift 45%,
Volt 35%). Todavía no varía con la distancia.

Se aplican de una en una con **4**: la carga tarda **dos segundos** y suena, un
zumbido eléctrico que sube. En campo abierto eso es ruido que te delata, así que
es una decisión, no un trámite. Caben cinco cargas en el inventario.

**Casco: binario.** El primer disparo a la cabeza lo rompe —crujido, y ahí se
queda el disparo, no pierdes vida—; el siguiente te mata. No se repara ni se
rellena: se recoge otro o se juega sin él.

**Mientras no haya economía ni partidas**, empiezas cada sesión con **un segmento
de escudo puesto y el inventario vacío**, y lo demás está por el suelo: ocho
recogibles curados en el Plano A —cuatro cargas de escudo, tres cruces de vida y
**un casco, arriba en el Balcón**—, repartidos por las zonas que hay que cruzar y
ninguno en el Vestíbulo, que es donde apareces. Se cogen **por proximidad**, sin
tecla, y vuelven a aparecer al cabo de un rato. Si no te hacen falta —vida llena,
inventario lleno— se quedan donde están.

**Si te matan**, sale **ABATIDO** en grande y la pantalla se oscurece por los
bordes —no a negro: ver quién te ha matado y desde dónde sigue siendo
información—. La viñeta se va aclarando según se acerca la reaparición, así que el
propio aclarado es la cuenta atrás.

Reapareces en el punto de salida tras una espera que empieza en 3 s, **sube 2 s
por cada muerte** hasta un tope de 15, y **baja 3 s con cada baja tuya**, sólo si
la espera ya pasaba de 10.

Y al volver tienes **dos segundos de invulnerabilidad**, con su marco azul y su
cuenta junto al bloque de vida. Sin ellos, reaparecer donde estabas con los
mismos muñecos encarados al mismo sitio es morir otra vez antes de ver la
pantalla.

En el HUD: barra fina de vida con su cruz, escudo de tres segmentos, cargas y
casco, abajo a la izquierda. El escudo y el casco son **siluetas vectorizadas de
sus referencias**, con la visera del casco recortada de verdad: el icono anterior
era un arco de CSS que no se leía como casco. Por debajo de 45 de vida **y sin escudo**, parpadea
en rojo —el mismo aviso que el cargador corto—. Al recibir un disparo se encienden
dos avisos que dicen cosas distintas: un **anillo suave alrededor de la mira**,
que dice cuánto te han dado y está donde ya estás mirando, y una **cuña roja en
el borde** hacia el lado del que disparó, que dice de dónde. Ninguno de los dos
tapa el centro: la cuña lleva el hueco de la mira recortado por una máscara, así
que el sitio al que hay que apuntar queda libre por construcción.

## Estrellas

Con **explosivo** el HUD muestra **cinco estrellas que se actualizan mientras
juegas**, no sólo al final. En Deathmatch no salen: puntúan cumplir un objetivo,
y sin bomba no hay contra qué medir (ver *Modos de sesión*). Salen de dos cosas a partes iguales:

- **Precisión** — aciertos entre disparos, **medida contra el objetivo de tu
  arma**. La Pulse pide un 85% para el máximo, la Rift un 50% y la Volt
  un 40%: un arma que sacude es más indulgente, así que elegir la difícil no te
  penaliza en la nota.
- **Tiempo** — cuanto antes desactives dentro de los 45 s, mejor.

Como el tiempo cuenta la mitad, **las estrellas bajan solas según pasan los
segundos** aunque no falles un tiro. Empiezas con las cinco y las vas gastando.

Que el explosivo detone **no es una estrella baja**: es **Fallido**, un resultado
aparte. No llegar a desactivar no es jugar mal, es no terminar.

Desde que los muñecos disparan hay además **daño recibido y muertes**, con peso
0.1 cada una: la nota sigue siendo sobre todo puntería y ritmo, y sobrevivir es
un extra, no la mitad del examen. Los pesos y los cortes de estrella están en
`SCORING`, en `src/config.js`.

## Air-strafe: acelerar en el aire

En el aire, mover el ratón **hacia el mismo lado que la tecla de estrafe** te
acelera por encima de tu carrera. Es la maniobra de siempre del bunny-hop: se
aprende con el ritmo, no machacando teclas.

Hay **dos modelos conviviendo** tras `MOVEMENT.airVector`, mientras se decide
cuál se queda. No es un ajuste de juego y no está en el panel de opciones: es un
interruptor para comparar jugando.

### `airVector: true` — vector de velocidad (por defecto)

En el aire tienes una velocidad de verdad, con dirección. Lo que cambia:

- **Sueltas W en pleno vuelo y sigues yendo hacia donde ibas.** El estrafe va
  girando esa marcha poco a poco en vez de tirarte a lateral puro. Medido:
  corriendo de frente y girando a 40°/s, el rumbo pasa de 0° a −29° en un vuelo.
- **Hay inercia.** Sin teclas se sigue volando; ya no te quedas clavado en el
  aire al soltarlas. Es la otra cara de tener dirección, y se nota en todos los
  saltos.
- **El ritmo de giro es la habilidad.** 40°/s es el óptimo y sube de 6.5 a 8.3
  u/s en seis saltos; girar como un molino (140-220°/s) **te frena** hasta por
  debajo de tu carrera. Justo al revés que el otro modelo.
- **Mirar a donde vas no acelera**, y no hace falta prohibirlo: con la vista en
  la dirección de la marcha ya no cabe ganancia. Sale de la geometría.
- **El techo sigue siendo duro:** `MOVEMENT.airStrafeMaxSpeed`, 9.5 u/s.

Rozar la cara de un cajón bajo mientras subes **no** te quita la marcha —vas a
pasar por encima—, pero chocar con un muro sí: se pierde la componente que choca
y la otra desliza entera.

### `airVector: false` — marcha escalar (lo de antes)

Una velocidad sin dirección, recalculada cada frame desde las teclas. Acelera por
**ángulo girado** con A o D y W suelta, hasta `airStrafeMaxYawRateDeg` (140°/s:
girar más no da más), y no depende del refresco. Funciona, pero soltar W te deja
en lateral puro al instante — que es justo lo que llevó al modelo vectorial.

### Lo que vale para los dos

Al aterrizar manda la regla de siempre: lo ganado se conserva **sólo si
encadenas** dentro de `MOVEMENT.chainJumpWindowMs` (con vector, se conserva
también la dirección). Fuera de esa ventana el siguiente salto sale a marcha de
carrera.

Ojo con leer el 46% del techo como «cruzo el mapa un 46% antes»: girar **curva la
trayectoria**, así que en línea recta se gana bastante menos.

El salto en sí no cambia — misma altura (1.2528 u) y misma duración (578 ms) en
los dos modelos. Esto sólo toca la marcha horizontal.

**Una excepción conocida que ya no lo es.** El modelo vectorial es una
integración —la entrada es el ratón— y hasta la vuelta 43 el ratón se muestreaba
una vez **por frame**, así que el resultado dependía del refresco: **1.38%** entre
60 y 240 Hz encadenando durante cuatro segundos. Era el único sitio del juego
donde el monitor cambiaba el resultado.

Desde la vuelta 44 el mundo avanza en **pasos fijos de 60 Hz** y el ratón se
muestrea una vez por paso, así que esa dependencia se cae: **1.53% → 0.07%** de
dispersión entre 60 y 360 Hz, y en un monitor múltiplo de 60 (60, 120, 240, 360)
el resultado es **idéntico hasta el último decimal**. El tiempo en el aire pasa a
ser el mismo (3900 ms) en todos, y la curva de ritmo de giro a 240 Hz es dígito a
dígito la de 60, con el óptimo donde estaba (40°/s).

Lo que cambia para quien juega: en un monitor de 240 Hz la marcha final de ese
banco baja un **1.36%**, porque el juego pasa a comportarse en todas partes como
se comportaba a 60 —que es la referencia con la que se calibró el modelo—. A 60
Hz no cambia nada. El porqué está en `docs/decisions.md` §32 y §44.

## Fatiga de salto

Rebotar en el sitio salía gratis e infinito. Ahora se desgasta: **dos saltos
parados salen gratis** y, a partir del tercero, cada uno pierde un 12% de impulso
hasta un suelo del 55%. No se bloquea nunca —saltar siempre hace algo— y se
olvida sola: 1.4 s sin saltar, o **un solo salto con desplazamiento de verdad**,
y vuelve el salto entero.

Lo que decide si un salto contó como parado es **la velocidad**, no lo que
avanzaste en línea recta. Es deliberado: un bhop cerrado, girando todo el rato,
avanza poco y va rápido, y medir el desplazamiento habría castigado justo a quien
domina la técnica. Quien encadena de verdad no nota esta regla nunca.

Un detalle que no es un fallo: **encadenar desde parado no perdona**. Un salto
encadenado conserva la marcha del aterrizaje, y la de un rebote es cero; para
volver a saltar entero hay que romper la cadena y coger carrerilla.

## Aterrizaje

Al caer desde cierta altura suena un golpe sordo y la cámara se hunde unos
centímetros durante una décima de segundo. Escala con la velocidad de la caída y
no hace nada si te bajas de un bordillo.

Es sólo sensación: no toca la gravedad ni la fuerza del salto.

## Panel de opciones

Botón **Opciones** en la pantalla de inicio y en la de pausa. Los cambios se
aplican al momento y se guardan en `localStorage`, así que sobreviven a una
recarga. **Restablecer**, al final del panel, vuelve a los valores de
`config.js` de golpe.

**Y si tu navegador no deja guardarlos, el panel te lo dice** en vez de callarse:
suele ser una ventana privada, las cookies de terceros bloqueadas o el navegador
puesto a borrar los datos del sitio al cerrarse. Ojo con otra cosa que no es del
navegador y se parece mucho: lo guardado va **por dirección**, así que si el
juego cambia de dominio, los ajustes de antes se quedan en el dominio viejo.

Cada ajuste lleva además **su propio botón «por defecto»**, en la misma línea
que su etiqueta, que restablece **sólo ese**: trastear con la sensibilidad y
querer volver atrás no debería costar también el escenario, el arma y la
cadencia. El botón se queda a la vista y apagado mientras el ajuste esté en su
valor de fábrica —si apareciera y desapareciera, la fila cambiaría de alto cada
vez que se roza un slider— y el valor sale del mismo `SETTINGS[clave].default`
del que parte el saneado, así que no hay una segunda lista que se pueda quedar
vieja.

| ajuste | qué hace |
| --- | --- |
| Sensibilidad | slider y campo numérico sobre el mismo valor |
| Escenario | Sala vacía · Largo y Puerta, con su plano y su ficha |
| Tipo de diana | Clásica · Cono · Hitbox completo |
| Arma principal | dice cuál llevas; **se equipa en la armería** (tecla B), no aquí. El silenciador, también |
| Tamaño de diana | escala la figura entera sin deformar sus proporciones |
| Distancia de aparición | distancia base del cono respecto al jugador |
| Cadencia | milisegundos entre apariciones. Menos es más difícil |
| Dianas simultáneas | x1 · x2 · x3 · x5 · x8 — cuántas a la vez; con explosivo, **cuántas en toda la ronda** |
| Duración de Deathmatch | Sin límite · 3 · 5 · 10 minutos |
| Dificultad de los muñecos | Fácil · Normal · Difícil — cono y reacción a la vez |
| Modo dinámico | las dianas vivas se desplazan mientras están en pantalla |
| Velocidad de patrulla | 1.5 a 8 u/s, sólo con el modo dinámico puesto |
| Límite de fotogramas | 60 · 144 · 240 · Sin límite |
| Audio espacial | los sonidos del mundo suenan con dirección |
| Mensajes de ayuda | avisos breves en el HUD, activados por defecto |

El panel sólo se abre con la partida parada, así que reconstruir las mallas al
cambiar de tipo o de tamaño nunca cae dentro del bucle de render.

## Armas

Tres arquetipos, en el bloque `WEAPONS` de `config.js`. Se llamaban **Scalar-2,
Axis-7 y Vertex-9** hasta la vuelta 41: el renombrado no tocó ni una estadística,
y si tenías una elegida, sigue elegida — el ajuste guardado con el nombre viejo
se traduce al nuevo en vez de caer al valor de fábrica.

| arma | ranura | modo | RPM | cargador | recarga | silenciador | peso | marcha | carácter del retroceso |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Pulse** | pistola (**2**) | semi | 500 | 18 | 1.2 s | sí | 1.1 kg | 6.50 u/s | ninguno — se dispara como antes de que hubiera armas |
| **Rift** | principal (**1**) | auto | 600 | 30 | 2.3 s | sí | 3.6 kg | 5.88 u/s | rifle: subida vertical marcada los primeros ocho disparos, luego deriva a la izquierda |
| **Volt** | principal (**1**) | auto | 800 | 25 | 1.8 s | sí | 2.6 kg | 6.14 u/s | SMG: patada más inmediata pero la mitad de techo vertical, y más bamboleo lateral que vertical |
| **Scout** | principal (**1**) | semi | 48 | 10 | 2.6 s | **no** | 3.2 kg | 5.98 u/s | francotirador: una patada sola y grande, 2.4° de golpe |
| **Vanta** | cuchillo (**3**) | — | — | — | — | no | 0.6 kg | 6.50 u/s | cada golpe empuja la cámara: el flojo poco, el fuerte el doble |

### Vanta, el cuchillo

**La tercera ranura**, en la tecla **3**, y se lleva siempre igual que la
pistola. **Clic izquierdo, golpe flojo; clic derecho, golpe fuerte.** Dos fuertes
matan, cuatro flojos también, y las mezclas suman solas: no hay combinaciones que
aprenderse, hay 25 y 55 contra 100 de vida. Con chaleco hacen falta tres fuertes
o seis flojos.

**Y un golpe fuerte por la espalda mata siempre**, lleve el otro lo que lleve:
vida llena, chaleco y casco puestos, da igual. No es más daño — es otra cosa.
Sólo el fuerte: un flojo por detrás no mata de una.

**Cómo se sabe lo que pasa, si Vektor no dibuja el arma en la mano.** Cuatro
avisos, y cada uno dice algo distinto:

- **La mira se abre y se pone verde** cuando hay alguien a distancia de
  cuchillo, **y gira 45° si además le estás viendo la espalda**. Es lo único que
  se puede saber *antes* de golpear, y es justo lo que más decide: un fuerte por
  detrás mata lleve lo que lleve el otro. Una cruz y una X no se confunden ni de
  reojo.
- **Y la brújula sobre su cabeza se enciende** en ese mismo arco, así que a
  distancia también se ve venir.
- **La cámara se mueve** al golpear, como con el retroceso de un arma. El fuerte
  empuja el doble que el flojo.
- **Un arco cruza la pantalla**: fino y a la izquierda el flojo, grueso, verde y
  a la derecha el fuerte. **Por la espalda salen los dos a la vez**, cerrándose.
- **Y suena distinto**: el filo sube de tono al pasar, el golpe grave sólo suena
  si has conectado, y la puñalada por la espalda añade un metal que no lleva
  ningún otro golpe.

**Y ya tiene su silueta**, trazada de `Reference/Weapons/vanta.png` como las de
las demás. No lleva variante con silenciador, por lo mismo que la Scout: un
cuchillo no la admite.

### La Scout, y la mirilla

**Un rifle de francotirador** (vuelta 70). Una bala al cuerpo mata a quien no
lleve chaleco; con chaleco hacen falta dos, y a la cabeza siempre una —salvo con
casco, que se lleva la primera—. A cambio dispara cada segundo y cuarto: fallar
cuesta.

**Clic derecho: la mirilla.** Fondo negro, cruceta fina y punto rojo en el
centro, con un encuadre de 22° contra los 71 de siempre — más de tres aumentos.
Se pone y se quita con el mismo botón y tarda 140 ms, que es lo justo para que
asomarse, apuntar y disparar siga siendo un gesto. La Scout **no lleva
silenciador**, y por eso el clic derecho es suyo para esto: en las demás sigue
siendo el supresor.

**La sensibilidad con mirilla es suya**, y se ajusta en opciones. De fábrica es
la misma que la normal; bajarla es lo que hace que el tercer aumento sirva para
afinar y no para dar bandazos. En el duelo, las opciones se abren desde el menú
de **ESC** sin salir de la partida.

### El peso: lo que cuesta llevar el arma

Desde la vuelta 42 un arma **pesa**, y el peso frena. Hay peso gratis —hasta 1.2
kg no cuesta nada, y la pistola cae por debajo— y por encima se pierde un 4% de
marcha por kilo, con un suelo del 75%. Con el rifle vas un 10% más lento que
quien sólo lleva pistola.

Tres cosas del peso que conviene saber:

- **Frena las tres marchas** —correr, andar y agachado— en la misma proporción.
- **En el aire no cambia nada.** La marcha se congela al despegar, así que
  cambiar de arma a media trayectoria no alarga ni acorta el vuelo. Y el techo
  del air-strafe es el mismo con cualquier arma: el aire es técnica.
- **La pistola no cuesta velocidad**, a propósito: la que se lleva siempre no
  puede cobrarte por llevarla. Lo paga la principal, que es la que eliges.

Los números son de partida y se calibran jugando.

### La armería (tecla B)

El arma principal se elige en la **armería**, no en el panel de opciones. Se abre
con **B** o con su botón en la pantalla de inicio y en la pausa, se cierra con
**Escape**, y jugando **pausa la sesión** igual que Escape: elegir arma con ocho
muñecos disparándote no es una decisión.

Cada arma tiene su ficha, y las tres fichas están **alineadas fila con fila** a
propósito: comparar dos armas es mirar la misma línea en las dos, no recordar un
número mientras lees el otro. En cada una:

- **Su silueta** — la del arma con silenciador si lo lleva puesto, que es otra
  foto de verdad: lo que ves es lo que te llevas.
- **Su tecla** (1 o 2) y, si la llevas en la mano ahora mismo, una marca.
- **Un solo botón grande**: *Equipar*. La pistola no lo tiene, porque se lleva
  siempre.
- **Una casilla verde para el silenciador**, pequeña y marcada cuando está
  puesto. Es un interruptor de esa arma, no una acción del panel, y por eso no se
  parece al botón.
- **Sus estadísticas, puestas** —sin desplegar nada— con **barra comparativa**
  en cadencia, cargador y peso: la barra más larga es la que más tiene **del
  arsenal**, así que la diferencia se lee sin restar.

El **daño** que enseña es el del modelo de zonas —cabeza 100, torso 50, piernas
34—, que hoy es el mismo para las tres armas: lo que cambia el resultado es dónde
aciertes.

No hay precios ni botón de comprar. Comprar depende de rondas y de una economía
que todavía no existen.

### Dos ranuras: la principal se elige, la pistola se lleva

Se sale siempre con **dos armas**: la principal, que se equipa en la armería y
sale con la tecla **1**, y la **Pulse**, que va siempre encima y sale con la
**2**. **Q** alterna entre las dos. Por eso la Pulse **no tiene botón de
equipar**: ya la llevas, y ofrecerla también como principal sería ofrecer llevar
dos pistolas. La ranura la declara cada arma (`WEAPONS[x].slot`), así que no hay
una segunda lista que se pueda quedar vieja.

**Cada arma lleva su propio cargador y su propia recarga**, y la que dejas atrás
se congela tal cual estaba. Una recarga a medias **no avanza en segundo plano**:
se guarda lo que le faltaba y sigue desde ahí cuando vuelvas a equiparla. Cambiar
de arma no es una forma de recargar gratis.

El Rift es la principal por defecto. Si tenías guardada la Pulse como arma
—se podía elegir hasta la vuelta 39—, el ajuste vuelve al valor de fábrica: la
pistola dejó de ser una opción porque pasó a estar siempre.

**Modos.** `semi` dispara una vez por click. `auto` dispara en continuo mientras
se mantenga pulsado, al intervalo que marcan las RPM. Las RPM acotan los dos
modos por igual: con Pulse no salen más de 8.3 disparos por segundo por
mucho que se haga clic.

El intervalo se cuenta desde el momento en que *tocaba* cada disparo, no desde
el frame en que sale. Sin eso, el redondeo al refresco del monitor inflaría el
intervalo y las RPM reales dependerían de los Hz de la pantalla.

**Cargador y recarga.** Las dos armas empiezan la sesión con el cargador lleno. Al
llegar a cero **la recarga arranca sola**: quedarse mirando un gatillo muerto
no aporta nada. **R** recarga antes de tiempo, también con el cargador a
medias; durante la recarga no se dispara y volver a pulsar R ni la reinicia ni
la acumula. Al completarse, el
cargador vuelve al máximo y el patrón de retroceso al primer disparo: un
cargador nuevo es una ráfaga nueva.

**Silenciador.** Una casilla en la ficha de cada arma, dentro de la armería, y
**es de cada arma**: ponérselo a la Rift no se lo pone a la pistola. La tecla
**V** conmuta el del arma que lleves en la mano. Lo admiten las tres —cada una
trae su referencia `ghost-<arma>`, que es la misma arma fotografiada con
silenciador— así que tanto el HUD como la armería dibujan **otra silueta**, más
larga, en vez de la misma con un tubo pegado. Cambia el sonido y la silueta, y
nada más: ni daño, ni retroceso, ni cadencia.

> Si venías de una versión anterior, donde el silenciador era un solo interruptor
> para todo, lo que tuvieras puesto se reparte entre las armas que lo admiten en
> vez de perderse.

**Retroceso.** El patrón es un `[pitch, yaw]` en grados por cada disparo
consecutivo de la ráfaga. Son incrementos, no posiciones: el motor los suma.
Pitch positivo sube, yaw positivo desvía a la izquierda. Un array vacío significa
sin retroceso.

**El arma no deja de empujar mientras mantengas el gatillo.** Los primeros pasos
del patrón son la subida, que pasa una vez; al acabarse, el arma sigue con **la
cola en bucle** (`recoilLoopFrom`), que es el vaivén. La Rift deriva a la
izquierda, la Volt zigzaguea, y ninguna de las dos se para a medio cargador.

*Hasta la vuelta 60 sí se paraba, y era un fallo de bulto: la Rift tiene 15 pasos
de patrón y 30 balas, así que **media ráfaga salía sin retroceso ninguno** y
clavada en el mismo punto. Se veía como si el arma se controlase sola.*

El empuje se suma a la rotación de la cámara igual que lo haría el ratón, así
que el arma desplaza la mira además de lo que mueva el jugador. **No hay
recuperación**: compensar el retroceso es cosa del jugador. Como el raycasting
sale de donde apunta la cámara en ese instante, el retroceso afecta a los
impactos sin ningún tratamiento aparte.

La ráfaga se cierra al soltar el botón o tras `RECOIL_RESET_MS` (200 ms) sin
disparar; la siguiente vuelve a empezar por el primer disparo del patrón. El
primero de cada ráfaga sale limpio: se dispara y *después* el arma empuja.

Los valores son un punto de partida con el carácter descrito, para calibrar
jugando igual que la sensibilidad o el tamaño de diana.

### Precisión y movimiento

Encima del patrón de retroceso, moverse deprisa abre el disparo. No es un
patrón: es un desvío **aleatorio de verdad** en cada disparo, así que no se
aprende ni se compensa — sólo se evita yendo más despacio.

| estado | dispersión |
| --- | --- |
| Quieto, caminando (SHIFT) o agachado (C) | ninguna: precisión completa |
| Corriendo | activa |
| En el aire | activa, sin importar la marcha: saltar penaliza como correr |

El umbral es `ACCURACY.speedThreshold`, igualado a `MOVEMENT.walkSpeed`, de
modo que caminar queda justo por debajo. La magnitud es un ángulo aleatorio
entre 0 y `ACCURACY.movementSpreadDeg` (1.2° de partida), en una dirección
aleatoria. Aplica igual a las tres armas.

El desvío se aplica **al rayo, no a la cámara**: la mira no tiembla, se desvía
la bala. El retroceso sí mueve la cámara, así que al desviar una dirección de
tiro que ya lleva ese empuje los dos offsets se suman sin pisarse.

Con 1.2° la penalización es deliberadamente selectiva: la diana Clásica por
defecto abarca ~1.5° de radio angular, más que el cono entero, así que a centro
de masa no se falla ni corriendo. Donde muerde es en el tiro fino — la cabeza
del hitbox, de ~0.42°, baja del 100% al 42% de aciertos corriendo. Súbelo si
quieres que correr penalice también el centro de masa.

### Tipos de diana

**Clásica** (esfera) y **Cono** comparten lógica: un disparo, una baja. Sólo
cambia la geometría.

**Hitbox completo** es una figura humanoide de tres zonas con vida compartida
(`TARGET.maxHealth`, 100 por defecto):

| zona | forma | daño | disparos para abatir |
| --- | --- | --- | --- |
| Cabeza | esfera pequeña arriba | 100 | 1 |
| Torso | cápsula en el medio | 50 | 2 |
| Piernas | cilindro abajo | 34 | 3 |

Las combinaciones salen solas: piernas + torso deja 16 de vida, y cualquier
tercer impacto remata. Un impacto que no mata hace parpadear su zona, para que
se distinga de un fallo. Este tipo aparece **más lejos por defecto** (20 frente
a 15.5), aunque el slider de distancia manda igual: al cambiar de tipo, la
distancia salta al valor base de ese tipo y a partir de ahí la mueves tú.

**El hitbox va siempre de pie en el suelo**, nunca flotando: es una figura
humana. Su origen está en los pies (`anchor: 'feet'` en `TARGET_TYPES`), la
altura la pone el suelo y el cono de aparición sólo decide su posición
horizontal — con lo que el slider de distancia pasa a medir distancia
horizontal para este tipo. Clásica y Cono siguen apareciendo a cualquier
altura dentro de su franja.

**Y tiene sus propias reglas de aparición**, en el bloque `HITBOX` de
`config.js`, porque un dummy de pie pide otra distribución que una esfera
flotante:

- **Abanico frontal mucho más ancho**: `spawnConeHalfAngleDeg` a 55°, o sea un
  frente de 110°, frente a los 36° de Clásica y Cono. Sigue siendo frontal, no
  360°.
- **Profundidad variable**: cada dummy sortea su propia distancia entre el 60%
  y el 140% del valor del slider (`distanceScale`), nunca por debajo de
  `minSpawnDistance`. Con el slider en 20 salen entre 12 y 28 unidades, en vez
  de todos alineados sobre el mismo arco.

Ambas cosas son horizontales: la altura la sigue poniendo el suelo. El tipo
declara su perfil con `spawn: HITBOX`, así que el gestor de dianas no necesita
saber qué tipo es cuál — mira si hay perfil y lo usa.

### Modo dinámico

Independiente del acumulativo. Con él activo, cada diana viva elige un punto
de destino aleatorio dentro de su propio volumen de aparición y se mueve hacia
él en línea recta — sin aceleración ni easing. Al llegar, o al agotar
`TARGET.moveMaxSeconds` persiguiendo el mismo punto, elige otro.

La velocidad se ajusta desde opciones, en **Velocidad de patrulla**: de 1.5 a 8
unidades por segundo, con 4 por defecto. La referencia útil es tu propia carrera
(6.5 u/s) — por encima de ella los muñecos dejan de poder seguirse andando, y la
pista bajo el slider lo dice mientras lo mueves.

Los ejes salen del tipo de anclaje, sin lógica aparte: Clásica y Cono flotan,
así que reciben destinos en X/Y/Z; el hitbox se apoya en el suelo, así que sus
destinos están siempre a nivel de suelo y sólo se mueve en X/Z, sin cambiar de
altura mientras está vivo. Las diagonales salen solas de elegir destinos en 2D.

Al elegir destino se aplica **la misma comprobación de separación mínima** que
al hacer aparecer una diana: si el punto elegido queda demasiado cerca de otra
diana viva, o del destino que esa misma traía, se vuelve a sortear. Como tope,
`SPAWN.destinationAttempts` (6) intentos; agotados, se acepta **el mejor de los
probados** —el de mayor separación—, no el último por orden de llegada. Con la
sala llena puede no haber hueco, y el bucle nunca debe quedarse dando vueltas,
pero eso no obliga a quedarse con el peor candidato.

El modo dinámico no toca cuándo aparece o desaparece una diana: eso lo siguen
mandando la cadencia y el modo acumulativo. En pausa las dianas se congelan con
el cronómetro.

### Dianas simultáneas

**x1** (por defecto) es el Gridshot de siempre: una sola diana viva, y la
siguiente se cuenta desde la baja, no desde la aparición. De **x2** en adelante
van saliendo cada `cadencia` milisegundos aunque las anteriores sigan en pie,
hasta el número elegido. Con cadencias muy bajas se llena en un instante: sube
la cadencia al pasar de x1.

El pool de dianas se dimensiona para el mayor valor elegible, así que cambiar
de opción no obliga a reconstruirlo.

**Con el explosivo armado, el selector cambia de significado**: pasa a ser el
**total de la ronda**, no el máximo a la vez. Los muñecos que caen **no vuelven a
salir**, así que la ronda se puede limpiar; si merece la pena el tiempo que
cuesta, con la bomba corriendo, es cosa tuya. Fuera de esa ronda —Deathmatch,
práctica libre, gridshot— el respawn es el de siempre.

## HUD

**El bloque de arma va abajo a la derecha**, en los dos modos: la silueta grande,
el nombre con su ficha corta —`AUTO` o `SEMI`, y `SIL` si llevas supresor— y la
munición en grande. Antes estaba centrado bajo la mira, que es justo debajo de lo
único que hay que mirar, y en el duelo no salía la silueta.

**La mira no se anima nunca**, ni al disparar ni al matar: es la referencia contra
la que apuntas. Lo que aparece al acertar es una marca dibujada **encima** —una X
blanca, más larga y con anillo si has matado—, y el anillo rojo de cuando te dan a
ti sigue donde estaba. Y es la misma mira en los dos modos.

Arriba a la izquierda, la **marca de Vektor**: un icono discreto, sin texto, en
el mismo gris apagado que el contador de FPS de la esquina de enfrente. Es una
firma, no información — ver *Logotipo*.

Arriba a la derecha, bajo el contador de FPS, un **engranaje con la palabra
ESC**: la marca de dónde están las opciones ahora que no hay tablero en la sala.
Es un rótulo, no un botón —con el ratón capturado no habría dónde pulsarlo—, y
va al mismo trazo gris y sin relleno que el resto del HUD. El engranaje se
**calcula** (ocho dientes entre dos radios, más el eje) en vez de pegar un `d`
de treinta y dos puntos escrito a mano.

Bajo la mira, el bloque del arma: silueta, nombre, cargador `actual/máximo` y,
durante la recarga, una barra de progreso. Enseña **la que llevas en la mano**,
no la elegida en opciones: con la pistola equipada cambian la silueta, el nombre
y el cargador. Cuando el cargador baja de
`HELP.lowAmmoRatio` (20%) el contador parpadea en naranja.

Las siluetas **no están dibujadas a mano**: se vectorizan con potrace a partir
de las referencias recortadas de `Reference/Weapons/` (ver abajo). Se dibujan
sólo a trazo, sin relleno, con el mismo gris y grosor que el resto del HUD.

**Cada arma tiene dos siluetas**, y la del silenciador es otra foto: la
convención es `<arma>.png` y `ghost-<arma>.png` —`pulse.png` y
`ghost-pulse.png`—. Ninguna se deriva de la otra. Como están encuadradas
distinto, la silenciada se escala para que su **altura** coincida con la normal:
es la misma arma, y lo que tiene que crecer al ponerle el silenciador es el
cañón, no el arma entera.

### Vectorizar las siluetas

```bash
npm run trace:weapons
```

`scripts/trace-weapons.mjs` es un script puntual —**no forma parte del build**—
que lee cada PNG de `Reference/Weapons/`, lo vectoriza y escribe
`src/ui/weaponPaths.js`. Lo que se versiona es esa salida, de modo que ni
potrace ni las imágenes llegan al navegador: `dist/` no contiene ni un PNG. La
máscara, las opciones de potrace y las utilidades de trazado viven en
`scripts/lib/trace.mjs`, compartidas con el script del logotipo.

Las referencias vienen con el arma recortada sobre fondo transparente, así que
la máscara que recibe potrace sale del **canal alfa** —opaco es arma,
transparente es fondo—. Es un umbral exacto y no una lectura del color, y por
eso el contorno es el del recorte y no una interpretación de la forma.

Las cuatro entradas comparten el tamaño de `viewBox` y sólo cambian de origen,
así que conservan su tamaño relativo: la pistola no se ve tan larga como el
fusil.

### Mensajes de ayuda

Avisos breves que aparecen junto al bloque del arma y se retiran solos pasados
`HELP.messageDurationMs`. Es un mecanismo genérico —texto y duración— del que
hoy hay un solo uso: *Pulsa R para recargar*, que salta una vez por cargador al
bajar del umbral, y otra vez si se aprieta el gatillo en vacío. El interruptor
**Mensajes de ayuda** del panel los apaga, y con ellos el parpadeo del contador.

## Logotipo

La marca de Vektor aparece en tres sitios, y ninguno de ellos es una imagen:

| dónde | qué se ve | de dónde sale |
| --- | --- | --- |
| Pestaña del navegador | la marca en naranja, fondo transparente | `vektor-mark-orange.png` |
| HUD, arriba a la izquierda | la marca sola, gris apagado, 44 px | `vektor-mark-white.png` |
| Pantalla de inicio | el logotipo completo, 184 px | `vektor-logo-white-orange.png` |

```bash
npm run trace:logo
```

`scripts/trace-logo.mjs` vectoriza las referencias de `Reference/Logo/` con el
mismo pipeline de potrace que las armas y escribe `src/ui/logoPaths.js` y
`public/favicon.svg`. Como allí, lo que se versiona es la salida: las PNG no
llegan al navegador.

Tres detalles que no se ven en el resultado pero lo explican:

- **El logotipo lleva dos tintas y el canal alfa no las separa** — la marca es
  blanca y «VEKTOR» naranja, y las dos son píxeles opacos. Se traza dos veces la
  misma imagen filtrando por saturación, y como los dos trazados salen de ella
  comparten `viewBox` y se superponen solos, sin cuadrar nada a mano. Medido:
  0.00% de píxeles a medio camino entre los dos colores, porque las letras
  flotan dentro del triángulo sin tocar sus líneas.
- **Se pinta relleno, no a trazo.** La marca ya es un dibujo de línea, así que el
  contorno de potrace rodea cada línea por sus dos lados: rellenarlo devuelve el
  original. Ponerle un `stroke`, como se hace con las siluetas de las armas
  —que son manchas macizas—, dibujaría dos filos por línea.
- **Con `fill-rule: evenodd`, obligatorio.** Potrace mete los huecos en el mismo
  trazado contando con esa regla; con la de por defecto, dos circunferencias y un
  triángulo se rellenan enteros y sale un disco.

En la pantalla de inicio el logotipo **sustituye** al rótulo de texto: ya lleva
«VEKTOR» dentro, así que repetirlo debajo sería decirlo dos veces. Sigue siendo
el `h1` de la pantalla y el SVG lleva su `aria-label`, así que para un lector de
pantalla no ha cambiado nada. El crédito «by FlickLAB» se queda donde estaba.

`vektor-logo-black.png` y `vektor-logo-black-orange.png` no se usan en el juego:
están en el repositorio como material de marca para fondos claros.

## Panel de acciones rápidas (apagado)

**Hoy no está en el mundo:** `ACTION_PANEL.enabled` está a `false`. Apagado, el
tablero no entra ni en la escena WebGL ni en la capa CSS3D, no se sigue al
jugador ni se maqueta por frame, y un disparo hacia donde estaba es un disparo
normal —cuenta, gasta bala y aplica retroceso—. Lo único que se conserva es su
**hueco reservado** (`clearVolume`): las auditorías del mapa siguen comprobando
que ningún punto de ruta cae dentro, así que volver a encenderlo es cambiar el
flag y no encontrárselo dentro de una caja. Lo que sigue describe cómo funciona
cuando está encendido.

Un tablero dentro de la sala, a `ACTION_PANEL.distance` a la derecha del
**punto de aparición** —no de una coordenada fija de la sala— y fuera del
abanico de las dianas. Anclarlo al spawn es lo que lo mantiene donde se espera
ahora que el movimiento cubre los 80×80: una coordenada fija podía quedar a
medio mapa. Si el jugador se acerca andando, el tablero se aparta para
conservar `ACTION_PANEL.minDistance` en vez de plantársele delante, y nunca
pasa de la pared. No hay gesto para abrirlo: está siempre ahí y se acciona
**disparándole**. Cinco botones: Pausa, Reiniciar, Arma (alterna la principal y
la pistola, como **Q**), Silenciador y Opciones, que abre el modal 2D de siempre.
El de silenciador desaparece —y con él su blanco— cuando el arma que llevas en la
mano no lo admite.

Se dibuja con `CSS3DRenderer`: es DOM de verdad colocado en el espacio y
sincronizado con la misma cámara que el `WebGLRenderer`, lo que permite
reutilizar la tipografía y el verde de marca sin repintarlos en WebGL. Lo que
se dispara son planos invisibles en la escena WebGL, colgados de un grupo con
la misma transformación que el tablero; compartir transformación es lo que
mantiene alineados el dibujo y el blanco sin repetir la trigonometría. Los
planos se colocan leyendo la caja real de cada botón ya maquetado, así que el
blanco sigue al diseño aunque cambien los estilos.

El raycast del panel es independiente del de las dianas y se comprueba antes:
darle a un botón **no cuenta como acierto ni como fallo, no gasta munición y no
mueve la cámara**, y tiene su propio sonido de confirmación —un bip corto, sin
ruido ni cuerpo grave, que no se confunde con el disparo—. Usa la mira limpia:
la dispersión por movimiento desvía balas, no la intención de pulsar un botón.
Un antirrebote de `ACTION_PANEL.cooldownMs` evita que mantener el gatillo sobre
un botón lo repita a 600 RPM.

El DOM del panel no recibe eventos de puntero: con el ratón capturado no habría
clicks, y la única forma de accionarlo es dispararle.

## Rendimiento

El HUD lleva un **contador de FPS** discreto en la esquina superior derecha.
Mide los fotogramas realmente dibujados —no los ticks de `requestAnimationFrame`—
promediados sobre los últimos `RENDER.fpsSampleFrames` (30), porque el valor
instantáneo de un solo frame salta demasiado para leerlo.

El **límite de fotogramas** acota el ritmo de **dibujado** a 60, 144 o 240; *Sin
límite* (por defecto) lo deja atado sólo al refresco del monitor. Lo que ya no
acota es el ritmo del juego: desde la vuelta 44 el mundo avanza en **pasos fijos
de 60 Hz**, dibuje el monitor lo que dibuje.

No se descartan fotogramas a lo bruto: se acumula el tiempo de cada tick de
`requestAnimationFrame` y se descuenta un intervalo objetivo cada vez que se
dibuja, guardando el sobrante. Así el ritmo medio sale exacto aunque el
objetivo no sea un divisor del refresco —en un monitor de 144 Hz limitado a 60,
los intervalos alternan 13.9 y 20.8 ms y promedian 16.7— y el movimiento no va
a tirones.

### El paso fijo del mundo

**El mismo mecanismo, aplicado a la simulación.** El tiempo real de cada
fotograma dibujado se acumula y se gastan pasos de `SIM_STEP_MS` (16.667 ms)
mientras quepan, **guardando el sobrante** y con la misma tolerancia. Medido: en
diez segundos salen **600 pasos exactos** a 30, 60, 75, 90, 144, 165, 240 y 360
Hz, con **0.000 ms de deriva**; con fotogramas irregulares tampoco se pierde el
ritmo; y un parón de tres segundos del navegador da **6 pasos**, no 180, porque
el delta viene acotado a 100 ms.

Por qué: había un sitio del juego donde el refresco cambiaba el resultado —la
aceleración en el aire, que es una integración con el ratón por entrada— y con
paso fijo deja de haberlo. Es además el requisito del multijugador: la predicción
de cliente sólo converge si cliente y servidor dan los mismos pasos
(`docs/propuestas/02-multijugador-1v1.md`).

**El dibujado sigue yendo al refresco del monitor.** Entre dos pasos, la cámara
se dibuja en el punto intermedio que le toque, así que una pantalla de 240 Hz
sigue viendo movimiento a 240 Hz aunque el mundo vaya a 60. La pose interpolada
existe sólo mientras se dibuja; el resto del tiempo la cámara está donde el
jugador está de verdad. Y una reaparición no se interpola: se dibujaría como un
barrido por medio mapa.

Pedir el mismo límite que el refresco de la pantalla lleva una tolerancia: sin
ella, un tick de 4.166 ms no llegaría por los pelos a un objetivo de 4.167 y el
ritmo se quedaría a la mitad.

## Multijugador 1v1 (prototipo)

Hay un 1v1 entre dos personas, con movimiento **y disparo**, y desde la vuelta 47
se puede jugar con alguien que esté en su casa. Sigue sin haber cuentas, ni
matchmaking, ni rankings, ni nada guardado: la partida muere con la sala.

**En local**, para desarrollar:

```
npm run dev     # el juego, como siempre
npm run net     # el servidor de partida, en ws://localhost:5199
```

Y se abre `http://localhost:5173/net/prueba.html#MQXTUV` **en dos pestañas** —con
el mismo código en las dos—. **Desde la vuelta 58 el código hace falta**: el
huésped de Node encamina por sala como el de la nube, así que dos pestañas sin
código abren cada una la suya y no se ven. Antes daba igual porque era una sola
partida y el código se ignoraba.

**Como en el despliegue**, con el huésped que corre en Fly.io — que es el mismo
fichero, sirviendo también la página:

```
npm run host      # construye y levanta el juego y las salas en http://localhost:5199
```

Y se abre `http://localhost:5199/duelo` en dos pestañas. Es literalmente lo que
hay publicado, en tu máquina.

**En Cloudflare**, que desde la vuelta 58 es el **respaldo** y no donde se juega.
Se prueba sin cuenta y sin internet, porque `wrangler` corre el Durable Object de
verdad en tu máquina:

```
npm run worker    # el Worker y la sala, en http://localhost:8787
```

Y se abre `http://localhost:8787/duelo` en dos pestañas. Ojo: el Worker sirve los
ficheros de `dist/`, no los de `src/`, así que `npm run worker` **construye
antes** — un cambio en el juego no se ve hasta volver a lanzarlo.

Para publicarlo, `npm run deploy` — los pasos completos, incluido qué plan
hace falta (**el gratuito**), están en
[`docs/despliegue-cloudflare.md`](docs/despliegue-cloudflare.md).

Clic en cualquier sitio para capturar el ratón; WASD, espacio, C y Shift como en
el juego, clic izquierdo para disparar y Escape para soltar. Cada pestaña ve a la
otra como un cuerpo del color del equipo contrario, moviéndose por el Plano A.

En pantalla, jugando, hay **mira, vida y el cartel de abatido con su cuenta de
reaparición**, y nada más: no hay munición, ni armas, ni HUD completo, ni
puntuación. **F3** enseña los números de red —RTT, correcciones, rebobinado,
re-anclajes del reloj— y los mandos para estropear la conexión a propósito;
vienen apagados, porque no son para jugar sino para medir.

Cada jugador lleva **el color de su equipo** —azul o magenta— según la ranura que
le dé el servidor, que es la misma de la que sale su punto de salida.

**Y desde la vuelta 56 juegas con el juego, no con una maqueta.** El duelo lo
lleva el motor completo: llevas **el arma de verdad** —la que tengas equipada, con
su cargador, su recarga, su retroceso y su dispersión al moverte—, y en pantalla
tienes **vida, munición y el nombre del arma**, una **cuña roja** hacia quien te
dispara y, sobre el rival, la **brújula** que dice hacia dónde mira y su ficha con
nick y arma. Sigue sin haber escudo ni casco: sólo vida.

Quien decide sigue siendo el servidor —dónde estás, a quién le has dado, cuándo
caes y cuándo vuelves—; el arma es tuya y lo único que el servidor le exige es
que no dispares más rápido de lo que esa arma permite.

**Escape abre el menú; pausar es un botón.** Soltar el ratón no gasta nada: te
saca el menú, suelta las teclas —así que con el menú abierto no andas— y el mundo
sigue corriendo, así que ahí sigues siendo un blanco. Para parar la partida hay
que pulsar **«Pausar la partida»**, y entonces sí: la pausa es de verdad y para
el mundo de **los dos** —ninguno ve moverse nada, ni lo suyo ni lo del rival—
porque la decide el servidor y no la pantalla.

Tienes **tres pausas libres** por partida. Abajo a la izquierda pone cuántas os
quedan a cada uno. Volver a pinchar levanta la tuya.

*Hasta la vuelta 60 bastaba con Escape, y se cambió por lo que pasaba jugando:
abrir el menú para mirar el código o copiar el enlace te gastaba una pausa sin
haberla pedido.*

**Y toda pausa tiene su reloj, que se ve en el propio cartel.** Una libre dura
como mucho **dos minutos** y una votada, **uno**; al acabarse la cuenta se
reanuda sola. La votada dura menos a propósito: el que dice que sí está pagando
un rato parado que no ha elegido.

**Gastadas las tres, se pide por votación — y votar no para la partida.** Escape
abre el menú de siempre y ahí hay un botón, **«Solicitar pausa por votación»**.
Al pulsarlo se manda la solicitud y el menú se cierra: vuelves a jugar en el
acto, sin esperar en ninguna parte.

Al rival le entra un cartel por el borde derecho con **Aceptar** y **Declinar**,
y quince segundos para decidir — **jugando**, porque mientras se vota no se
congela nadie. Jugando se contesta con **Intro** o **N** (con el ratón capturado
un botón no se puede pinchar); con el ratón suelto, con los botones. Si acepta,
arranca la pausa de un minuto. Si declina —o deja pasar el tiempo sin que salga—
la partida sigue como si no se hubiera pedido, sin ningún aviso que cerrar.

> Si el rival **no contesta**, su voto se suma a la opción que más apoyo tenga.
> En un 1v1 eso es el «sí» de quien la pidió, así que ignorar el cartel deja pasar
> la pausa: para que no salga hay que **declinarla**.

**Un abatido está abatido de verdad.** No se mueve mientras espera a reaparecer
—el servidor no le deja— y su cuerpo **desaparece** en vez de quedarse en pie
donde cayó. Y la baja se confirma al instante: la mira cambia de forma y suena
distinta a un acierto normal, porque una baja cierra un intercambio y hay que
poder saberlo sin mirar. El contador de bajas espera al HUD completo.

**Y cuando la partida deja de estar, se dice.** Hay tres formas de quedarse
fuera —te echan de una partida llena, se corta el cable o dejan de llegar fotos—
y las tres se veían igual: el juego quedándose quieto sin explicación. Ahora sale
un aviso **amarillo** si no llegan fotos (puede pasarse solo) o **rojo** si es
definitivo, con el motivo. Y el cliente ya no se congela cuando el servidor calla:
sigue prediciendo a tiempo real —medido, 61 pasos/s con la red cortada, contra los
0 de antes— en vez de frenarse hasta parar.

**Y reaparecer es un teletransporte.** Al morir lejos del punto de aparición, el
rival te veía **recorrer** la distancia hasta el spawn: la interpolación mezclaba
las dos fotos que rodean el salto y te pintaba en sitios donde nunca estuviste.
Ahora la marca de teletransporte viaja en la foto y no se interpola por encima de
ella — medido, el salto pasa de dibujarse en dos frames (con una posición
intermedia inventada) a uno solo.

**Y se puede cambiar de pestaña sin romper nada.** Si el navegador frena la
pestaña, el reloj del cliente **se re-ancla al volver** en vez de recuperar el
tiempo perdido corriendo: no hay nada que recuperar, porque sin bucle no se
produjo ni una entrada y el servidor te dejó parado donde estabas. Medido tras
60 s fuera: 6.5 u/s —andando— contra los 33 u/s que salían antes, y cero
correcciones.

### La partida va por código

Quien abre la página **ya ha creado una partida**: no hay botón de crear. Arriba
a la izquierda salen un código de seis caracteres y el enlace, y quien abra ese
enlace entra en la misma sala. En Cloudflare el código **es** la dirección del
Durable Object (`idFromName`), así que no hay lista de partidas, ni registro de
salas, ni nada que limpiar cuando una acaba.

El alfabeto del código no tiene parejas que se confundan al dictarlo —ni O/0, ni
I/L/1, ni S/5, ni B/8— y lo que se teclea mal se traduce en vez de rechazarse:
`mo-xtuv` entra en la sala `MQXTUV`. Son **dos jugadores por sala**; a un tercero
se le dice que está llena.

El panel de la izquierda enseña en vivo lo que hay que mirar, y los mandos de
abajo permiten **estropear la red a propósito**: latencia de ida, jitter y
porcentaje de paquetes perdidos, por pestaña.

### Cómo funciona

- **Predicción.** Cada paso de 60 Hz el cliente muestrea la entrada, la numera y
  la aplica **ya**. Nada de lo que haces con tu propio cuerpo espera a un viaje
  de ida y vuelta.
- **El servidor decide.** Corre el mismo `movement.update` con las mismas
  entradas, y manda una foto del mundo por paso.
- **Reconciliación.** Al llegar la foto, el cliente coloca el estado autoritativo
  y **reejecuta** las entradas que el servidor todavía no había visto. Como es
  literalmente el mismo módulo con las mismas entradas, sin pérdida de paquetes
  el resultado es idéntico y la corrección no se ve.
- **Al rival se le dibuja en el pasado**, entre dos fotos ya recibidas.
  Extrapolar al futuro es inventarse dónde está.

La partida **no tiene código de juego**: `net/partida.js` importa `movement.js`,
`scenario.js`, `hitPlayer` y `hasLineOfSight` tal cual y les pone un objeto plano
donde iría la cámara. La física del juego corre fuera del navegador sin cambiar
una línea.

Y **no sabe nada de red**: un jugador entra con una función `enviar(texto)` y ya
está. Eso es lo que permite que la corran dos huéspedes distintos —`ws` en Node
(`net/servidor.mjs`) y un Durable Object en Cloudflare (`worker/sala.js`)— sin que
ninguna regla del juego viva en dos sitios. Los bancos de medida se pasan contra
los dos, sin cambiar una aserción — y ésa fue exactamente la prueba de que mudar
el despliegue de Cloudflare a Fly.io en la vuelta 58 no había cambiado nada:
`partida.js` no se tocó.

### Lo que sale medido

| | |
|---|---|
| Error de reconciliación, de 0 a 300 ms de RTT | **0** (a lo sumo un ULP de coma flotante) |
| Correcciones con 0% de pérdida | **0** de 181 fotos |
| Corrección máxima con 10% / 25% de pérdida | 0.22 u / hasta 2.6 u |
| Entradas sin confirmar, de 0 a 150 ms de ida | 2 → 24 |
| Coste de reejecutar una entrada | **0.6-0.9 µs** (0.2 ms dan para 220-340) |
| Al rival se le ve | 3 pasos (50 ms) tras la última foto |
| Caudal en JSON, sin comprimir | ↑3.5 KB/s · ↓59-81 KB/s |
| Suelo de la tubería sin red de por medio | 40-60 ms |
| **Disparo**: acuerdo tirador ↔ servidor, con el rebobinado bajo el tope | **100%** |
| Lo mismo resolviendo sin rebobinar, con el rival apartado de verdad | 20% |
| Coste de resolver un disparo (corte + rayo) | 4.3 µs p50 · 9.0 µs p99 |
| Historial para rebobinar | 3.8 KB por jugador (1 s) |

La latencia **no** mete error de predicción: lo único que crece es la cola a
reejecutar. Y con el disparo pasa lo mismo mientras el rebobinado quepa bajo el
tope: de 0 a 160 ms de RTT, el servidor da por bueno **exactamente** lo que vio el
tirador. Pasado el tope sí se nota —a 300 ms de RTT pide 390 ms de rebobinado y
se le dan 200, y el acuerdo baja al 50%—, y eso es la decisión, no un fallo.

Donde sí aparece la corrección del movimiento es con pérdida de paquetes, que es
lo correcto.
El peor caso no es andar —ahí no pasa de un tercio de unidad— sino **perder la
pulsación de saltar**: el servidor no despega, tú sí, y hasta la foto siguiente
divergís lo que dura un vuelo (578 ms, unas 3.8 u a marcha de carrera).

## Ajustes por defecto

**Todo lo ajustable vive en [`src/config.js`](src/config.js)** — colores,
sensibilidad, duración de la sesión, tamaño y distancia de las dianas, ángulo
del cono, tiempos del feedback y volúmenes. Ningún otro archivo repite esos
valores.

Los más probables de tocar mientras se prueba el feel:

```js
SESSION_DURATION_S      // duración de la sesión
LOOK.sensitivity        // 0.022°/count, misma convención que en los FPS
TARGET.radius           // tamaño de la diana
TARGET.distanceSpread   // dispersión alrededor de la distancia elegida
SPAWN.coneHalfAngleDeg  // cuánta pantalla cubren las apariciones
COLORS.crosshair        // color del crosshair (punto único de cambio)

SETTINGS                // valores iniciales y rangos del panel de opciones
TARGET_TYPES            // formas, daño por zona y distancia base de cada tipo
TARGET.maxHealth        // vida por diana
TARGET.maxActive        // tope de dianas vivas en modo acumulativo
ACTION_PANEL            // interruptor, tamaño, escala, sitio y antirrebote del panel
WEAPON_KEYS             // teclas de acción del arma (R para recargar)
HELP.lowAmmoRatio       // umbral de aviso de munición baja
HELP.messageDurationMs  // cuánto dura un aviso en pantalla
COLORS.action           // verde FlickLAB de los botones de acción

RENDER.fpsSampleFrames  // ventana del contador de FPS
SIMULTANEOUS_TARGETS    // opciones del selector de dianas a la vez
FRAME_LIMITS            // opciones del límite de fotogramas

TARGET.moveSpeed        // velocidad de patrulla por defecto (ajustable en opciones)
TARGET.moveMaxSeconds   // tiempo máximo persiguiendo un mismo destino

WEAPONS                       // roster: modo, RPM y patrón de retroceso
RECOIL_RESET_MS               // pausa que cierra la ráfaga y reinicia el patrón

MOVEMENT.walkSpeed            // marcha de SHIFT, entre correr y agachado
MOVEMENT.wallMargin           // holgura que se deja junto a cada pared
ACTION_PANEL.distance         // a qué distancia del spawn se ancla el panel
ACTION_PANEL.minDistance      // distancia mínima que guarda con el jugador
ACCURACY.speedThreshold       // velocidad a partir de la cual se abre el tiro
ACCURACY.movementSpreadDeg    // radio angular máximo del desvío aleatorio

HITBOX.spawnConeHalfAngleDeg  // anchura del abanico frontal del hitbox
HITBOX.distanceScale          // horquilla de distancia, en fracción del slider
HITBOX.minSpawnDistance       // mínimo absoluto, por corto que quede el slider
SPAWN.destinationAttempts     // reintentos al buscar destino sin solape

// El máximo del slider de distancia NO se edita: sale de la sala.
WALL_CLEARANCE                // margen mínimo diana-pared (5 unidades)

MOVEMENT.enabled        // interruptor entre las dos variantes
MOVEMENT.speed          // velocidad horizontal de pie
MOVEMENT.crouchSpeed    // velocidad agachado
MOVEMENT.standHeight    // altura de ojos de pie (también en el modo estático)
MOVEMENT.crouchHeight   // altura de ojos agachado
MOVEMENT.jumpSpeed      // impulso vertical del salto
MOVEMENT.gravity        // gravedad constante
MOVEMENT.chainJumpWindowMs     // ventana del salto encadenado, a cada lado
MOVEMENT.airStrafeMaxSpeed     // techo duro de la aceleración en el aire
MOVEMENT.airStrafeGainPerRad   // cuánto se gana por radián girado
MOVEMENT.airStrafeMaxYawRateDeg // giro máximo que cuenta, en grados/s
MOVEMENT.wallMargin     // holgura que se deja junto a cada pared
MOVEMENT.keys           // mapeo de teclas, por código físico
```

En desarrollo el motor queda expuesto en `window.aimcore`, así que se puede
trastear en caliente desde la consola (`aimcore.controls.setSensitivity(2)`).
Ese nombre, como el del repositorio, se queda en `aimcore`: son identificadores
técnicos internos, no la marca.
Vite lo elimina del build de producción.

## Estructura

```
src/
├── config.js           todas las constantes de tuning
├── settings.js         ajustes de partida: validación y localStorage
├── App.jsx             une el motor con el HUD
├── styles.css
├── audio/sfx.js        sonido sintetizado con la Web Audio API
├── audio/samples.js    disparos grabados, con la síntesis siempre detrás
├── game/muzzleFlash.js el fogonazo de cada disparo enemigo
├── game/
│   ├── engine.js       bucle rAF, sesión, input y raycasting
│   ├── scene.js        sala de líneas
│   ├── lookControls.js rotación de cámara desde el ratón crudo
│   ├── movement.js     desplazamiento, salto y agachado
│   └── targets.js      dianas: tipos, zonas, vida y apariciones
└── ui/                 Hud, Crosshair, Options, Summary

net/                    prototipo de 1v1 — fuera de src/
├── partida.js          TODO lo que decide el servidor, sin saber de red
├── servidor.mjs        huésped de sobremesa: ws, reloj e informe (npm run net)
├── cliente.js          predicción y reconciliación
├── transporte.js       send / onMessage / close, y la red simulada
├── disparo.js          hitPlayer + hasLineOfSight, para los dos extremos
├── protocolo.js        lo que viaja por el cable, y en qué reloj
├── codigo.js           el código de sala: lo usan el cliente y el Worker
├── sala-cliente.js     de qué sala y a qué servidor, sacado de la dirección
├── pose.js             el objeto plano que hace de cámara en el servidor
└── prueba.html/.js     la página del duelo (ésta sí entra en el build)

worker/                 el respaldo en Cloudflare (ya no es donde se juega)
├── index.js            el portero: /sala/<código> al Durable Object
└── sala.js             huésped de la nube: el Durable Object

wrangler.jsonc          qué se publica en Cloudflare (respaldo)
Dockerfile              la imagen del huésped: construir el juego y servirlo
fly.toml                el despliegue en Fly.io, con IPv4 dedicada
```

### Por qué React no toca el bucle de render

El motor es three.js puro y vive fuera de React. React sólo conoce la fase de
la partida y el resultado final; el cronómetro y los contadores se escriben
directamente en el DOM por refs desde el bucle. Una partida entera provoca un
puñado de renders de React en vez de miles.

En el bucle no se crea geometría, ni vectores, ni objetos: los vectores de
muestreo son de módulo y las dianas salen de un pool fijo que se reutiliza —
sólo se reconstruye al cambiar de tipo o de tamaño desde el panel, que nunca
está abierto con la partida en marcha. Medido en este repo, la lógica de juego
cuesta ~0.1 ms por frame en p99, frente a los 4.17 ms de presupuesto a 240 Hz.

## Decisiones de esta fase

- **Sin arma ni viewmodel en pantalla.** Deliberado, no una limitación:
  Kovaak's y Aim Lab lo omiten para mantener el foco en la relación
  crosshair-diana. Se puede añadir después como opción.
- **Sin sonido de fallo.** Sólo click de disparo (siempre) y un tono más
  brillante al acertar. Si en las pruebas se echa en falta, se revisa.
- **Sin techo en la sala.** El brief pide suelo y paredes; cerrar por arriba
  ensuciaba el encuadre con rectángulos anidados.
- **Escape pausa, no termina.** Soltar la captura a mitad de sesión no debería
  arruinar la partida.
- **El movimiento es cinemática, no físicas.** Velocidad horizontal constante,
  una integración de la gravedad para el salto y un acotado al radio cada
  frame. El suelo es `y = 0` y no hay más colisiones.
- **La altura vertical se modela en dos piezas.** La altura de los pies sólo
  la mueve el salto; la de los ojos sobre los pies, sólo el agachado. La
  cámara es la suma, así que agacharse en el aire sale gratis y sin casos
  especiales.
- **Sin assets, con una sola puerta.** El sonido se sintetiza con osciladores y
  no hay texturas ni archivos de audio en el repositorio. La única excepción
  prevista es **lo que hace un arma** —disparo, disparo silenciado y recarga— más
  el cargador vacío, que pueden traer su muestra grabada por su carril
  (`npm run audio:weapons`) — y aun así la síntesis se queda debajo como
  respaldo de cada sonido que no tenga fichero.
- **La sala vacía mide 80×80 y ya no crece; cada escenario puede traer la
  suya.** El Plano A vive en 40×40 y con ella se encogen la rejilla, las
  paredes, el límite real de movimiento, el acotado de las dianas y el tablero
  de acciones. Reducir sólo la cobertura dentro de una sala grande no reduce el
  mapa: deja un anillo de suelo vacío alrededor por el que se sigue caminando.
  En la sala vacía cada ampliación anterior fue detrás de
  un rango de distancia mayor. A partir de aquí es al revés: el que se acota es
  el slider. Su máximo se **calcula** a partir del tamaño de la sala en vez de
  escribirse a mano (`computeMaxSpawnDistance` en `config.js`), de modo que el
  peor caso —jugador en el borde de su radio de movimiento y dummy sorteado a
  la distancia máxima— deje siempre al menos `WALL_CLEARANCE` (5 unidades) de
  margen hasta la pared. Manda el más restrictivo de los dos regímenes de
  distancia, porque el slider es uno solo: hoy sale **21**, con 5.6 unidades de
  margen en el peor caso del hitbox y 11.5 en el de Clásica y Cono. Si algún
  día cambian la sala, el radio de movimiento o las horquillas, el tope se
  recalcula solo.
- **Las tres zonas del hitbox usan el mismo naranja** con distinto brillo
  —cabeza clara, piernas apagadas— para que se distingan sin salirse de la
  paleta.
- **El abanico del hitbox se sortea en 2D, no aplastando un cono 3D.**
  Muestrear el cono en tres dimensiones y luego proyectarlo al suelo amontona
  las dianas cerca del eje, porque los extremos verticales del casquete se
  proyectan sobre azimuts pequeños. Sorteando el azimut directamente el reparto
  es uniforme de verdad.
- **Los ejes del modo dinámico los decide el anclaje.** Los destinos salen del
  mismo muestreo que las apariciones, así que anclar el hitbox al suelo ya
  basta para que sólo se mueva en horizontal: no hay una restricción de ejes
  escrita aparte que pueda desincronizarse.
- **La recarga automática no quita la manual.** R sigue sirviendo para
  recargar antes de quedarse seco, que es la decisión táctica; automatizar lo
  que no tiene decisión —el cargador vacío— es sólo quitar fricción.
- **El tope del slider de distancia se ancla al spawn, no al movimiento.**
  Ahora que se recorre la sala entera, atarlo al peor caso posible lo habría
  dejado en nada. Se garantiza el margen para el juego normal, cerca del punto
  de partida; quien se pegue a una pared verá las apariciones comprimirse
  contra ella, que es lo que el muestreo ya hacía por su cuenta.
- **Las siluetas se vectorizan, no se dibujan.** La vuelta anterior las trazó
  a ojo y no eran fieles. Sacarlas del canal alfa del recorte quita de en medio
  mi interpretación de la forma.
- **El panel se dibuja en DOM y se dispara en WebGL.** Son dos mitades con la
  misma transformación en lugar de una sola: CSS3D da los estilos ya escritos,
  y el raycast necesita geometría de verdad. La contrapartida conocida es que
  el DOM se pinta siempre por delante de la escena, así que una diana entre la
  cámara y el tablero quedaría tapada por él; está en la pared lateral y fuera
  del abanico de aparición justamente para que no pase.
- **El verde de marca sólo viste botones de acción.** JUGAR, REANUDAR,
  REINICIAR y VOLVER. El naranja sigue siendo el acento de la interfaz y el HUD
  se queda en blanco y gris: tres colores con tres trabajos distintos.
- **El clic en seco se dispara por pulsación, no por cadencia.** Repetirlo a
  800 RPM mientras se mantiene el gatillo sería insufrible. Y suena **también
  durante la recarga**, que es lo único que hay con el cargador a cero: la última
  bala arranca la recarga sola, así que «vacío y sin recargar» es un estado que
  el juego no llega a producir nunca.
- **El contador de FPS mide fotogramas dibujados, no ticks de rAF.** Es el
  número que hace falta para comprobar que el límite está haciendo su trabajo.
- **La dispersión desvía la bala, no la mira.** Un temblor aleatorio del
  crosshair sería insufrible y además impediría apuntar; desviando el rayo, el
  jugador ve exactamente dónde apunta y lo que pierde es certeza sobre dónde
  irá el disparo.
- **La marcha más lenta manda.** SHIFT y C a la vez dan agachado porque el
  motor se queda con la menor de las velocidades pedidas, no por un orden de
  prioridad escrito a mano — seguiría siendo cierto si un día se retocan las
  constantes.
- **El retroceso no se recupera solo.** La cámara se queda donde la deja el
  arma. Es lo que convierte el patrón en algo que se aprende a compensar, en
  lugar de en un temblor que se corrige solo.
- **La precisión cuenta impactos, el ritmo cuenta bajas.** Con el hitbox dejan
  de coincidir, así que el resumen muestra los impactos aparte cuando difieren.

## Fuera de alcance (siguiente fase)

Sin Supabase, sin login y sin cuentas: lo único que persiste son los ajustes,
en el `localStorage` de este navegador. Las estadísticas de partida siguen en
memoria y se pierden al recargar.

Fuera de alcance también, por decisión explícita: minimapa.
Cuentas, ranking y matchmaking van aparte.

El **multijugador** dejó de estar fuera de alcance en la vuelta 45, y la nube en
la 47 —que desde la 58 es **Fly.io** y no Cloudflare, por los bloqueos de IPs de
LaLiga en España: ver `docs/despliegue-fly.md`—, pero sólo hasta donde llega el
prototipo de arriba: una sala por código,
dos jugadores, movimiento y disparo. Sin cuentas, sin matchmaking, sin rankings y
sin nada guardado. El plan completo, con costes y riesgos, está en
[`docs/propuestas/02-multijugador-1v1.md`](docs/propuestas/02-multijugador-1v1.md);
los pasos para publicarlo, en
[`docs/despliegue-cloudflare.md`](docs/despliegue-cloudflare.md).

Y lo que se ha dicho que vendría después —reconexión, cuentas, ranking, modos,
mapas de comunidad, economía— está recogido en
[`docs/roadmap.md`](docs/roadmap.md), ordenado por dependencia y **sin fechas**.
Es un inventario, no un compromiso: lo de esta sección sigue fuera hasta que se
encargue.

## Documentación interna

- [`CLAUDE.md`](CLAUDE.md) — contexto operativo del repositorio: arquitectura,
  convenciones a respetar y avisos de entorno. Corto, para leer entero antes de
  tocar el código.
- [`docs/decisions.md`](docs/decisions.md) — historial completo de decisiones de
  diseño, su razonamiento y las alternativas descartadas. Para consulta puntual
  cuando haga falta saber por qué algo está como está.
- [`docs/despliegue-cloudflare.md`](docs/despliegue-cloudflare.md) — cómo poner
  el 1v1 en internet, paso a paso y sin dar nada por sabido: cuenta, plan, token
  con el permiso mínimo y cómo hacerlo llegar sin pegarlo en un chat.
- [`docs/propuestas/03-servidor-con-ip-propia.md`](docs/propuestas/03-servidor-con-ip-propia.md)
  — evaluación de sacar el servidor de partida de Cloudflare a una IP exclusiva,
  por los bloqueos de LaLiga en España: candidatos, coste mensual, cuánto del
  trabajo hecho se reutiliza y qué habría que construir. **Decidida y
  construida** en la vuelta 58.
- [`docs/despliegue-fly.md`](docs/despliegue-fly.md) — cómo publicar el juego y
  las partidas en Fly.io, paso a paso y sin dar nada por sabido, con el aviso de
  que la IPv4 tiene que pedirse **dedicada**: la compartida no resuelve nada.
- [`docs/roadmap.md`](docs/roadmap.md) — lo que vendría después, por dependencia
  y sin fechas: qué hace falta antes de cada cosa, cómo se sabría que está bien y
  qué se descarta a propósito. No autoriza nada; recopila.
