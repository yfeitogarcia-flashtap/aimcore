# Propuesta 17 — LATAM primero

**Estado:** propuesta, vuelta 108. **Sin construir nada.** Escrita a partir del
encargo de Yago, que trae la premisa entera en su primera frase:

> El primer público de la beta será probablemente latinoamericano: streamers
> pequeños con PCs muy antiguos y conexiones modestas.

Y cuatro preguntas: **(a)** servidores por región, **(b)** qué pasa con la
compensación de retraso con 150–250 ms de ping, **(c)** PCs modestos —modo de
rendimiento bajo, requisitos mínimos, cómo medir, y qué queda para Windows 7—, y
**(d)** conexiones lentas —el ancho de banda de hoy y si hay que adelantar la foto
en binario—. Se contestan por orden, con lo medido aquí, lo leído en la
documentación de Fly y lo que **no** se ha podido comprobar dicho en voz alta
(§1).

Encaja con dos propuestas de esta misma vuelta: la **19** (una aplicación de Fly
estable y otra de pruebas) y la **20** (contador y feedback en Supabase, con la
región como parte de la clave). Lo que aquí se reparte por regiones es **la
estable**; pruebas se queda en una máquina en París.

---

## 0. La respuesta corta

| Pregunta | Respuesta |
|---|---|
| **(a) ¿Qué regiones?** | **São Paulo (`gru`) y Dallas (`dfw`), además de París (`cdg`).** Querétaro, Bogotá, Santiago y Buenos Aires **ya no existen en Fly**: se cerraron en la consolidación de septiembre de 2025, y `gru` es hoy su **única** región en Latinoamérica. México, Centroamérica y Colombia van mejor a Dallas; Brasil, el Cono Sur y Perú, a São Paulo. |
| **(a) ¿Qué cambia de la regla?** | Pasa de «una máquina» a **«una máquina por región, y una sala vive en una sola»**. El código de sala **lleva la región en su primer símbolo** (sigue siendo de seis y se sigue dictando), y el WebSocket que llega a la máquina equivocada se **reenvía con `fly-replay`** en la propia petición de `upgrade`. Sin registro de salas: la vuelta 47 sigue en pie. |
| **(a) ¿Cuánto cuesta?** | **~15 $/mes fijos** (hoy ~5,6): tres máquinas —3,62 $ París, 3,99 $ Dallas, 5,16 $ São Paulo— y **la misma IPv4 dedicada de 2 $**, que es anycast y vale para todas. El tráfico de São Paulo cuesta **el doble** que el de Europa (0,04 $/GB contra 0,02). Una beta realista: **20–30 $/mes** en total, o ~20 con compresión (§6). |
| **(b) ¿El tope de 200 ms?** | **Hoy muerde mucho antes de lo que parece.** No es «a 200 ms de ping»: el rebobinado es el ping **más ~85 ms de retraso de dibujo propio del juego** en el duelo, ~100 en equipos y **~135 en el todos contra todos**. Así que el tope ya se come compensación a partir de **115 ms de ping en el duelo y de 65 en el todos contra todos**. A 200 ms de ping un disparo al centro del pecho de alguien que corre de lado **falla**. |
| **(b) ¿La alternativa justa?** | **Regiones primero**, que es lo que baja el ping de verdad. Y el tope, **partido en dos**: 150 ms para la red de quien dispara **más** el retraso de dibujo fijo de esa sala, que el servidor conoce. Compensa lo mismo en todos los modos (150 ms de ping), y por encima **paga quien tiene el ping alto**, como hoy. Más el ping de cada uno **a cada región**, visible en el lobby. |
| **(c) ¿Modo bajo?** | Vektor **no tiene luces ni sombras** (§5.1), así que lo que cuesta GPU es la resolución, el antialias MSAA, el fondo panorámico y un par de efectos de pantalla. El modo bajo: **sin antialias, resolución interna al 75 %, sin fondo, sin fogonazo**, 60 FPS de tope. Una opción de *Opciones* (es de la máquina, no de la partida), **que no puede quitar información**. |
| **(c) ¿Windows 7?** | **La app de escritorio no, y no por una casilla.** WebView2 dejó de dar soporte a Windows 7 en la versión 109 (enero de 2023) y **las versiones fijas posteriores ni arrancan** ahí; además el `.exe` sale de Rust estable, que **desde la 1.78 exige Windows 10**. Lo que queda para Windows 7 es **el navegador: Firefox ESR 115**, con parches de seguridad hasta **marzo de 2027** según Mozilla. WebGL2, pointer lock y WebSocket funcionan ahí; hay que probarlo, no suponerlo. |
| **(d) ¿Ancho de banda?** | Medido aquí: **~0,48 Mbit/s de bajada** por jugador en un duelo, ~0,42 en un 5v5, ~0,23 en el todos contra todos, y **~0,06 Mbit/s de subida**. Cabe en cualquier conexión de 3–10 Mbit/s. Lo que rompe a un streamer **no son nuestros bytes: es su propia subida saturada por OBS**. |
| **(d) ¿Foto binaria?** | **No adelantarla.** Antes, **`permessage-deflate`**: es una opción del servidor, no toca el protocolo, y en el banco baja la bajada entre **4 y 14 veces** (el 14× es de un banco sintético). Ojo: la librería `ws` no comprime mensajes de menos de 1024 B por defecto, y la foto del duelo pesa ~900. |

**El orden** (§9): primero lo que no cuesta nada y ya se puede medir —el ping por
región en el lobby, contar los disparos topados, compresión—; luego las dos
regiones; después el tope partido y el modo bajo. Windows 7 se queda en
«pruébalo con Firefox» y requisitos por escrito.

---

## 1. Lo que no se ha podido comprobar desde aquí

Dicho primero, porque cambia cuánto pesa cada número de abajo.

- **La salida de red de esta sesión bloquea casi toda la web.** `fly.io`,
  `wondernetwork.com`, `learn.microsoft.com`, `mozilla.org`, `tauri.app` y
  `wikipedia.org` devolvieron *bloqueado por el proxy*. Lo que sí funciona es el
  **buscador** (resúmenes y titulares, no las páginas) y **clonar repositorios
  públicos de GitHub**.
- **La documentación de Fly se ha leído en su fuente**: el repositorio público
  `superfly/docs`, con su último commit del **29 de septiembre de 2026**. De ahí
  salen la lista de regiones, la fórmula de precios por región, el precio de la
  IPv4 y del tráfico, y `fly-replay`. Es lo mismo que publica
  `fly.io/docs`, pero **no es la página**: antes de pagar, mírala.
- **La de Tauri, igual**: el repositorio `tauri-apps/tauri-docs`.
- **Las latencias de §2 son estimaciones**, calibradas con dos cifras públicas que
  sí devolvió el buscador. No hay ni una medida desde Latinoamérica: como con el
  bloqueo de LaLiga (propuesta 03 §1.3), **la sonda tiene que estar donde ocurre
  el fenómeno**, y un contenedor en la nube no está en Bogotá.
- **Lo de Microsoft, Mozilla y Rust** (fin de WebView2 en Windows 7, Firefox ESR
  115, Rust 1.78) sale de los resúmenes del buscador, con varias fuentes que
  coinciden. Las URL están en §11; no se han abierto.
- **No se ha medido nada en una GPU de verdad.** Este contenedor dibuja con
  SwiftShader (la CPU haciendo de tarjeta gráfica). §5.5 es el procedimiento para
  que lo mida alguien con el PC delante.

---

## 2. Cuánto ping hay desde cada sitio

**Estimación, no medida.** Método: la distancia en línea recta entre ciudades da
el suelo físico (la luz en fibra va a ~200 km por milisegundo, ida y vuelta);
las rutas reales dan un rodeo de **1,6 a 2,5 veces** ese suelo —calibrado con las
dos cifras públicas que se pudieron leer: **Ciudad de México–Dallas, 32 ms** y
**Bogotá–São Paulo, ~110 ms** (WonderNetwork y checkping.io, §11), que están a
2,1× y 2,5× de su suelo—; y encima se suman **10–20 ms de acceso** de una casa con
cable o fibra. **Con wifi o 4G, sumad 10–50 más**, y variables.

| Desde | **París** `cdg` (hoy) | **São Paulo** `gru` | **Dallas** `dfw` | Virginia `iad` |
|---|---|---|---|---|
| Ciudad de México | 150–180 | 150–190 | **35–55** | 60–80 |
| Bogotá | 150–180 | 110–130 | **80–110** | 75–100 |
| Lima | 180–220 | **70–120** | 100–130 | 100–120 |
| Santiago de Chile | 210–240 | **45–70** | 150–180 | 140–170 |
| Buenos Aires | 210–240 | **35–60** | 150–180 | 140–170 |
| São Paulo | 190–210 | **10–25** | 130–150 | 120–140 |
| Madrid (referencia) | **25–40** | 190–220 | 120–140 | 90–110 |

Tres cosas que salen de la tabla y deciden el resto:

- **Desde Latinoamérica a París son 150–240 ms**, que es exactamente lo que dice
  el encargo. Y París está donde está por España y por LaLiga, no por gusto
  (propuesta 03).
- **No hay una región que sirva a toda Latinoamérica.** São Paulo es buena para el
  sur y mala para México (el tráfico entre los dos suele pasar por Miami); Dallas
  al revés. Hacen falta **dos**.
- **Colombia es el caso frontera**: Dallas y Virginia le quedan parecidas y algo
  mejor que São Paulo, porque las rutas de la costa norte de Sudamérica salen a
  Miami antes de bajar. Perú, al revés: mejor São Paulo, por poco.

---

## 3. (a) Servidores por región

### 3.1 Qué regiones hay de verdad

Las que **no** están, primero, porque el encargo las nombra: **Querétaro (`qro`),
Bogotá (`bog`), Santiago (`scl`) y Buenos Aires (`eze`) se cerraron** en la
consolidación de regiones de Fly de septiembre de 2025 —la misma que cerró Madrid
y que ya obligó a irse a París (vuelta 58)—. Guadalajara (`gdl`) y Río (`gig`)
tampoco están. La lista de hoy, leída en `superfly/docs` (`reference/regions.mdx`):

> `ams` `arn` `cdg` `dfw` `ewr` `fra` **`gru`** `iad` `jnb` `lax` `lhr` `nrt`
> `ord` `sin` `sjc` `syd` `yyz`

Diecisiete, y **una sola en Latinoamérica**. Para México y Centroamérica lo más
cerca es **Dallas**; Los Ángeles da parecido a Guadalajara y peor al resto.

**La recomendación: `cdg` + `gru` + `dfw`.**

| Región | A quién sirve | Ping típico (§2) |
|---|---|---|
| `cdg` París | España (la de hoy) | 25–40 |
| `gru` São Paulo | Brasil, Argentina, Chile, Uruguay, Paraguay, Perú | 10–120 |
| `dfw` Dallas | México, Centroamérica, Caribe, Colombia, Venezuela | 35–110 |

`iad` (Virginia) sólo si en la beta aparecen muchas salas **mezcladas de España y
México**: es el punto medio (90–110 desde Madrid, 60–80 desde México). No se pone
de salida; §3.5 dice cómo se sabría.

**Si Fly no bastara**, lo que hay más cerca de verdad está fuera de Fly: Vultr
tiene Ciudad de México, Santiago y São Paulo, y Latitude.sh tiene Bogotá (según el
buscador; no verificado en sus páginas). **No se recomienda para la beta**: sería
otro proveedor, otro despliegue y otra IP, y se pierde lo que hace barato todo lo
de abajo —una sola aplicación, una IP anycast y un `fly deploy`—. Es la opción del
día en que 30 ms en Ciudad de México importen más que la comodidad.

### 3.2 La regla de la vuelta 59, y en qué se convierte

La regla de hoy es **una máquina**, y no por ahorro: las salas viven en la memoria
del proceso, así que dos máquinas son **dos mundos** para el mismo código de
partida. Lo que dejó escrito `fly.toml` es la condición para romperla:

> El día que haga falta más de una máquina, lo que hace falta **antes** es
> encaminar por código de sala hasta la misma.

Eso es lo que se propone, y la regla pasa a ser:

> **Una máquina por región, y una sala vive en una sola máquina, que la dice su
> código.**

La invariante que protegía la 59 no cambia: **dos máquinas nunca sirven el mismo
código.** Lo que cambia es que ya no se garantiza teniendo una sola, sino
porque el código dice dónde vive y cualquier otra máquina **no lo abre: lo
reenvía**.

### 3.3 El código lleva la región

Hay dos formas de saber en qué máquina vive una sala: **un registro** (una tabla
«código → máquina» en algún sitio) o **que lo diga el código**. El registro está
descartado desde la vuelta 47, y con razón: es una lista de partidas que hay que
mantener, limpiar y consultar, y un sitio más que se puede caer.

Así que **el primer símbolo del código dice la región**. Con el alfabeto de hoy
(27 símbolos, `net/codigo.js`) y tres regiones, nueve símbolos cada una:

| Región | Primer símbolo | Ejemplo |
|---|---|---|
| `cdg` | `A C D E F G H J K` | `CMQXTU` |
| `dfw` | `M N P Q R T U V W` | `NMQXTU` |
| `gru` | `X Y Z 2 3 4 6 7 9` | `3MQXTU` |

Por qué así y no de otra manera:

- **Sigue siendo un código de seis que se dicta** (vuelta 47). Un `?region=gru` en
  el enlace no sobrevive a leerlo en voz alta por Discord; el símbolo sí.
- **Todos los códigos tienen región.** No hay un «código viejo sin región»: el
  alfabeto entero está repartido, y los que ya circulan en un chat caen en alguna.
- **Pierde un tercio de combinaciones por región**: de 387 millones a 129 por
  región. Para salas privadas entre amigos sobra igual.
- **Repartir de otra forma el día que llegue una cuarta región no cuesta nada**,
  y no es casualidad: **las salas no sobreviven a un despliegue** —viven en
  memoria y el despliegue reinicia la máquina—, así que al cambiar la tabla no
  queda ninguna sala viva que mudar.
- **Y la tabla es una sola**, como la normalización del código: la leen el
  cliente (para generar un código en la región elegida) y el servidor (para
  reenviar). Su fuente sería una variable de `fly.toml` (`VEKTOR_REGIONES = "cdg
  dfw gru"`) que el servidor publica en un `/regiones` para la página y que el
  despliegue lee con `grep`, como ya lee `app`. En local, sin `FLY_REGION`, no hay
  reenvío y todo es de la máquina que hay.

### 3.4 Cómo llega el WebSocket a su máquina: `fly-replay`

Con anycast, **cada petición entra por la máquina más cercana a quien la hace**.
Si un madrileño abre el enlace de una sala de Dallas, su página la sirve París —y
está bien, el juego es el mismo en las tres— pero su WebSocket también llega a
París. París no abre la sala: **contesta al `upgrade` con una cabecera
`fly-replay`**, y el proxy de Fly repite la petición entera contra Dallas. La
documentación lo dice con todas las letras (`blueprints/connecting-to-user-machines`):
funciona con cualquier petición HTTP, **WebSockets incluidos**, y la máquina que
reenvía **no debe negociar el `upgrade` ella misma**.

En `net/servidor.mjs`, al principio del manejador de `upgrade`, antes de
`handleUpgrade` (esbozo, no escrito en el código):

```js
const region = regionDeCodigo(codigo)          // de la tabla de §3.3
const aqui = process.env.FLY_REGION            // Fly la pone en cada máquina
if (aqui && region && region !== aqui) {
  // Una sola vuelta: si esto ya viene reenviado, no se reenvía otra vez.
  if (peticion.headers['fly-replay-src']) {
    socket.end('HTTP/1.1 503 Service Unavailable\r\n\r\n')
    return
  }
  socket.end(`HTTP/1.1 307 Temporary Redirect\r\nfly-replay: region=${region}\r\n` +
    'Content-Length: 0\r\nConnection: close\r\n\r\n')
  return
}
```

Cuatro cosas del mecanismo:

- **`region=` y no `instance=`**, porque hay exactamente una máquina por región
  (§3.7 lo comprueba). Así la dirección no depende del identificador de una
  máquina, que cambia si se rehace.
- **Sin `fallback` a otra región**, a propósito: si Dallas está caída, abrir la
  sala en París sería **otro mundo con el mismo código**, que es el fallo de la
  vuelta 59 por la puerta de atrás. Mejor un error que el cliente enseña: «el
  servidor de esa región no contesta».
- **El reenvío va por la red interna de Fly**, así que el madrileño juega contra
  Dallas con **su** ping a Dallas (120–140), no con el de París más el de
  París–Dallas.
- **La página no se reenvía nunca.** Sólo el `upgrade`. `/salud`, `/contador` y el
  feedback siguen siendo de la máquina que contesta (§3.6).

### 3.5 Quién elige la región, y con qué

**La elige quien crea la sala, y de fábrica es la de la máquina que le sirvió la
página**, o sea la más cercana a él. Un streamer mexicano crea en Dallas sin
enterarse, que es como tiene que ser: el paso «elegir servidor» no añade nada
cuando todos son del mismo sitio.

Cuando no lo son —el caso de verdad es **un streamer y sus espectadores de otros
países**—, hace falta ver el ping de **cada jugador a cada región**, y eso se puede
medir desde el navegador sin tocar el servidor de partida: la página hace unas
peticiones pequeñas a `/ping` con la cabecera **`fly-force-region: gru`** (o
`dfw`, o `cdg`), que la documentación de Fly admite en peticiones normales, y se
queda con la mediana de cinco. Cada uno manda sus tres números al lobby.

En la pantalla del lobby:

- **Una columna «Ping» por jugador**, con el número de la región de la sala. **En
  número y con una palabra («alto») por encima de 150, no con un color**: en los
  menús de Cabina el naranja es lo elegido y el verde es la acción (vuelta 99), y
  un semáforo de ping sería el tercer significado de un color en la misma
  pantalla.
- **El anfitrión ve una sugerencia**: la región que hace **mínimo el peor ping de
  la sala**, que es la que reparte mejor el retraso. Con un empate, la de menor
  media.
- **Cambiarla sólo se puede con la sala vacía**, y es **crear otra sala** con otro
  código: es exactamente la regla de la vuelta 67 para las opciones de una
  partida («son de quien la crea, y sólo hasta que entra alguien»). **Mudar una
  sala llena** —que el lobby mande a todos el código nuevo y reconecten solos— es
  una fase 2; se construye si la beta enseña que las salas mezcladas son
  frecuentes.

Y ésta es la medida que decidiría si hace falta `iad` (§3.1): **cuántas salas se
lanzan con el peor ping por encima de 150**. Si son muchas y son de
España+México, la cuarta región se paga sola.

### 3.6 Lo que se parte al haber tres máquinas

- **`/salud` ya dice la región** (`region: process.env.FLY_REGION`, vuelta 59) y
  la máquina. No hay que añadir nada; lo que cambia es cómo se pregunta (§3.7).
- **`/contador` y el feedback son de cada máquina.** Hoy guardan en memoria o en
  el volumen `VEKTOR_DATOS`, y con tres máquinas serían tres contadores. La
  propuesta 20 los lleva a Supabase **con la región como parte de la clave**, que
  es justo lo que esto necesita; hasta que esté, cada región cuenta lo suyo y la
  página lo dice. Si se mantienen los volúmenes, uno por región (0,15 $/GB/mes).
- **`VEKTOR_DOMINIO` no cambia** (vuelta 97): la redirección es por nombre y la
  hace cualquier máquina. **La app de escritorio tampoco**: abre la dirección de
  siempre y anycast la lleva a su máquina más cercana.
- **Pruebas y estable** (propuesta 19): las regiones van **en estable**. Pruebas
  se queda con una máquina en París y el comprobador de hoy, porque ahí sólo
  juega Yago.
- **Los secretos de Fly son de la aplicación**, no de la máquina: el webhook del
  feedback y la clave de lectura valen para las tres sin hacer nada.

### 3.7 Lo que cambia en `desplegar.yml`

Hoy el despliegue comprueba **exactamente una máquina** y la corrige con `fly
scale count 1`. Pasaría a comprobar **exactamente una por región de la lista y
ninguna fuera**, y a preguntar a `/salud` **región por región** (esbozo):

```sh
REGIONES="$(grep -m1 VEKTOR_REGIONES fly.toml | sed 's/.*= *"\(.*\)"/\1/')"   # cdg dfw gru
hay="$(flyctl machines list --json $args \
  | jq -r '[.[] | select(.state != "destroyed") | .region] | sort | join(" ")')"
esperado="$(echo $REGIONES | tr ' ' '\n' | sort | tr '\n' ' ' | sed 's/ $//')"
if [ "$hay" != "$esperado" ]; then
  flyctl scale count "$(echo $REGIONES | wc -w)" --region "$(echo $REGIONES | tr ' ' ,)" \
    --max-per-region 1 --yes $args
fi
for r in $REGIONES; do
  for i in 1 2 3; do
    cuerpo="$(curl -fsS -H "fly-force-region: $r" "$URL")"
    # exigir .region == $r y la misma .maquina las tres veces
  done
done
```

`fly deploy --ha=false` **no hay que cambiarlo**: actualiza las máquinas que
existen en cada región, y `--ha=false` sigue impidiendo que cree una segunda en
alguna. `fly.toml` se queda con `primary_region = 'cdg'`, que sólo decide dónde se
crearía la primera máquina de una aplicación vacía.

### 3.8 Lo que cuesta

Precios leídos de `superfly/docs` (§11), calculados con su fórmula (precio de
Virginia por segundo, por el recargo de cada región, por 30 días):

| | Al mes |
|---|---|
| Máquina `shared-cpu-1x` 512 MB en **París** (la de hoy) | 3,62 $ |
| Máquina `shared-cpu-1x` 512 MB en **Dallas** | 3,99 $ |
| Máquina `shared-cpu-1x` 512 MB en **São Paulo** (recargo ×1,62 sobre Virginia) | 5,16 $ |
| **IPv4 dedicada** — una por aplicación, anycast desde todas las regiones | 2,00 $ |
| **Fijo** | **~14,8 $** (hoy ~5,6) |
| Tráfico de salida, **Europa y Norteamérica** | 0,02 $/GB |
| Tráfico de salida, **Sudamérica** | **0,04 $/GB** |

**La IPv4 no se multiplica**, y conviene verlo porque es lo que hace esto barato:
una IP anycast se anuncia desde todos los centros de Fly, así que la misma
dirección que compró la propuesta 03 contra el bloqueo de LaLiga sirve también en
São Paulo y en Dallas. **Y la inmunidad a ese bloqueo no cambia**: la IP sigue sin
compartirla nadie.

**Una duda que no se ha podido resolver**: Fly cobra el tráfico «por grupo de
región», y la documentación no deja claro si es el grupo de la **máquina** o el
del **borde** por el que sale hacia el jugador (la propuesta 11 §2.1 supuso el de
la máquina). Con jugadores latinoamericanos en `gru` las dos lecturas dan tarifa
sudamericana, y en `dfw` las dos dan norteamericana; **sólo cambia en salas
mezcladas entre continentes**, que son pocas. La factura del primer mes lo dirá.

El tráfico, con lo medido en §6.1 (0,21 GB por hora de jugador en un duelo; 1,9
GB por hora de sala en un 5v5; 1,05 GB en un todos contra todos de diez):

| Escenario | São Paulo | Dallas | París | Tráfico total | **Con compresión (÷4)** |
|---|---|---|---|---|---|
| **Beta pequeña**: 1 000 h-jugador/mes en `gru`, 1 000 en `dfw`, 500 en `cdg` | 8,4 $ | 4,2 $ | 2,1 $ | **~15 $** | **~4 $** |
| **La de la propuesta 11**: 5 salas de 10, 2 h/día, **todas en `gru`**, 5v5 | 22,8 $ | — | — | ~23 $ | ~6 $ |

**Total realista para una beta latinoamericana: ~20–30 $/mes sin compresión y
~18–21 $ con ella.** Más ~5,6 $ si la propuesta 19 añade la aplicación de pruebas.

---

## 4. (b) La compensación de retraso con pings altos

### 4.1 Lo que se rebobina, que no es el ping

La cuenta es la de `docs/decisions.md` §107.6, y es la clave de toda esta
sección: lo que el servidor rebobina es

> **ping + adelanto del reloj propio + retraso con que se dibuja al rival**
> (+ lo que el colchón adaptable añada si las fotos llegan a tirones, + un frame)

con los números de `NET`: `leadTicks` 2 (33 ms), y el retraso de dibujo es
`max(interpDelayTicks, fotoCada · interpolarFotos)` pasos: **3 pasos (50 ms) en el
duelo**, 4 (67 ms) en 3v3–5v5 (fotos a 30 Hz) y **6 (100 ms) en el todos contra
todos** (fotos a 20 Hz). Así que con cable y el colchón en su suelo:

| Modo | Retraso propio del juego | El tope de 200 empieza a morder a partir de… |
|---|---|---|
| Duelo, 2v2 (60 Hz) | ~85 ms | **115 ms de ping** |
| 3v3–5v5 (30 Hz) | ~100 ms | **100 ms de ping** |
| Todos contra todos (20 Hz) | ~135 ms | **65 ms de ping** |

Y con wifi a tirones, el colchón sube hasta 7 pasos más (117 ms), y el tope
muerde antes. A 60 FPS en vez de 144, unos 10 ms más.

**El tope de 200 se copió de Source (vuelta 46), pero Source lo gasta casi entero
en red**: su interpolación en CS:GO son ~15 ms. Aquí el propio juego se come
entre 85 y 135 de esos 200 antes de que el ping cuente. **El tope de Vektor es
bastante más estricto que el de Source, y no lo decidió nadie**: salió de sumar
tres decisiones correctas por separado.

### 4.2 A 150, 200 y 250 ms de ping

Lo que el tope niega, y cuánto se ha movido el rival en ese tiempo si corre de
lado a 6,5 u/s (la marcha con pistola). Para leerlo: el torso del cuerpo que
recibe disparos mide **~0,28 u de radio** y la cabeza **~0,13** (vuelta 65).

| Ping | Duelo: pide / se le da / desfase | Equipos (30 Hz) | Todos contra todos (20 Hz) |
|---|---|---|---|
| **150** | 235 / 200 / **0,23 u** | 250 / 200 / 0,33 u | 285 / 200 / 0,55 u |
| **200** | 285 / 200 / **0,55 u** | 300 / 200 / 0,65 u | 335 / 200 / 0,88 u |
| **250** | 335 / 200 / **0,88 u** | 350 / 200 / 0,98 u | 385 / 200 / 1,20 u |

Lo que eso significa jugando, **contra un rival que se mueve** (contra uno quieto
no pasa nada, a ningún ping):

- **A 150 en el duelo**, un tiro al centro del pecho todavía entra (0,23 < 0,28) y
  **un tiro a la cabeza no**. En el todos contra todos ya no entra ni el del pecho.
- **A 200**, en ningún modo entra un tiro al centro de alguien que corre: hay que
  apuntar medio cuerpo por delante de lo que se ve.
- **A 250**, un cuerpo entero por delante.

Y desde la vuelta 103 el «tic» y la X salen de lo que el tirador veía, así que
esto se ve como **una marca de acierto que no hace daño**. Para un jugador nuevo
es indistinguible de un juego roto. La información ya existe —el servidor anota
`pedidoMs`, `rebobinadoMs` y `topado` en cada veredicto, y F3 enseña el
concedido— pero nadie la mira en una partida.

**Y con París de única región, desde Latinoamérica esto es la norma**: 150–240 ms
de ping (§2). Con las regiones de §3 casi desaparece: México, Brasil y el Cono Sur
quedan en 10–70, Colombia y Perú en 70–130.

### 4.3 Las alternativas

**1. Subir el tope a secas** (por ejemplo a 300). Compensa a todos, y **lo paga el
que recibe**: «me han matado detrás de la pared» pasa de un máximo de 200 ms a 300,
o sea de 1,3 u a 2 u de carrera ya a cubierto. Es la puerta que el tope existe
para cerrar, y además premia al que miente sobre su instante (el número lo manda
el cliente; el tope es lo único que le acota). **No.**

**2. Tope por sala, dinámico según el peor ping de la sala**, con suelo y techo.
Justo dentro de la sala —todos juegan con la misma regla—, pero **el que tiene
buen ping paga el ping del otro** sin haberlo elegido, y la regla cambia de una
partida a otra. **No como primera opción.**

**3. Tope que depende del ping del que recibe.** La idea sería dar más compensación
al tirador cuando la víctima también tiene ping alto. Hace que lo que te protege
dependa de tu conexión y no de lo que haces, y convierte un cable malo en una
armadura. **No.** (Lo que hacen otros juegos —Overwatch— es lo contrario: a partir
de cierto ping **del tirador**, se le compensa menos. Que es lo que Vektor ya hace
con un tope fijo.)

**4. Emparejar por región y enseñar el ping.** No toca el tope: evita que haga
falta. Es §3 y §3.5, y es **lo que más cambia**, porque lleva a la mayoría de
Latinoamérica de 150–240 ms a 10–130.

**5. Partir el tope en dos: la red del tirador y el retraso propio de la sala.**
El servidor **conoce** el retraso de dibujo que impone cada sala —sale de
`fotoCada`, `interpolarFotos`, `interpDelayTicks` y `leadTicks`, que son suyos—,
así que el tope puede ser **«hasta N ms de red, más lo que el propio juego pone»**:

```
tope(sala) = NET.maxRewindRedMs + adelanto + retraso de dibujo de suelo de la sala
```

Con `maxRewindRedMs = 150`: **233 ms en el duelo, 250 en equipos, 283 en el todos
contra todos**. Compensa lo mismo en todos los modos —**150 ms de ping**—, que es
lo que un jugador puede entender («por encima de 150 de ping, apunta por delante»),
y deja de castigar al todos contra todos por ir a 20 Hz, que es una decisión de
ancho de banda (vuelta 100), no del jugador. El colchón adaptable **no** entra en
la parte fija: los tirones del wifi los paga quien los tiene, como hoy.

Lo que se paga, dicho: en el duelo el «detrás de la pared» del que recibe pasa de
200 a 233 ms (0,2 u más a 6,5 u/s); en el todos contra todos, de 200 a 283 (0,54
u más). Es la misma cantidad **de ping** compensada en los tres modos; lo que
crece es el retraso que el juego ya tenía y que antes se comía el tirador.

### 4.4 La recomendación

**4 primero, 5 después, y ninguna de las otras.**

1. **Regiones y ping visible** (§3). Es lo que baja el número de verdad.
2. **Medir antes de tocar el tope**: el servidor ya calcula `topado` en cada
   veredicto; contarlo por sala y por región y publicarlo en `/salud` (o en el
   contador de la propuesta 20) es una línea. En la primera semana de beta dirá
   **qué fracción de los disparos topa**, que es el dato que decide.
3. **El tope partido (5), con 150 ms de red**, cuando esa medida diga que topa más
   de lo razonable (propongo: más del 5 % de los disparos en salas de una sola
   región). Una sola función en `net/protocolo.js` que llamen el servidor (para el
   tope) y el cliente (para enseñarlo en F3), la disciplina de la vuelta 46. Y el
   comentario de `NET.colchonAdaptable.maxTicks` («por debajo del rebobinado de
   200 ms») se revisa con él.
4. **Y por encima de 150 de ping, paga quien lo tiene**, como hoy. Se le dice en el
   lobby (§3.5) antes de empezar, que es lo que falta: enterarse jugando es
   enterarse tarde (vuelta 67).

---

## 5. (c) PCs modestos

### 5.1 Lo que cuesta dibujar hoy

Lo primero, porque el encargo pregunta por sombras: **Vektor no tiene luces ni
sombras.** El mundo son `LineSegments` con `LineBasicMaterial` (la rejilla) y
mallas con materiales sin iluminación, fundidas por tipo de pieza (vuelta 76). La
única escena con luces es la del arma en mano (`armaEnMano.js`), y **no se
construye** desde la vuelta 105 (`VIEWMODEL.disponible: false`). Así que no hay
nada que quitar ahí.

Lo que sí cuesta, de más a menos en una gráfica integrada:

| Qué | Dónde | Por qué pesa |
|---|---|---|
| **Resolución** | `renderer.setPixelRatio(min(devicePixelRatio, RENDER.maxPixelRatio = 2))` | En un portátil con pantalla escalada al 125–150 % se dibujan 1,5–2,2 veces más píxeles de los que parece. |
| **Antialias MSAA** | `RENDER.antialias: true` al crear el `WebGLRenderer` | En una integrada, multiplicar muestras es ancho de banda de memoria, que es justo lo que no tiene. **Es un atributo del contexto: no se cambia sin crear otro.** |
| **Fondo panorámico** | `src/game/backdrop.js`: una esfera con una textura de **2048×1024** dibujada en un canvas al montar el mapa | 8 MB de textura, y dibujarla en el canvas cuesta CPU al cargar el mapa. Sólo en mapas que declaran fondo. |
| **Capa CSS3D** | `CSS3DRenderer` (fichas de nick y de peanas) | DOM en el espacio: barato si no hay fichas, caro en CPU si hay muchas. Hoy salen pocas (sólo apuntando). |
| **Fogonazo propio** | `src/game/fogonazo.js`: un degradado radial a pantalla, animado en el compositor | Barato en una gráfica normal; a pantalla completa en una integrada vieja, cada disparo es un pase de mezcla. |
| **Transparencias** | Cristales de barrera, marcas de dispositivo, destellos aditivos | Pocas y pequeñas. |
| **Los cuerpos** | 3 llamadas de dibujo por jugador (sus tres zonas) | Diez jugadores son 30 llamadas: nada. Medido en `dibujo100` (la pendiente, no los milisegundos). |

La CPU del juego no preocupa: un paso de mundo cuesta **0,07 ms** con ocho
muñecos, y aunque un PC de 2012 sea cinco veces más lento sigue siendo nada.

### 5.2 El modo de rendimiento bajo

Una opción en **Opciones**, «Calidad gráfica: Normal / Baja», porque es de **la
máquina** y no de la partida —la regla de la vuelta 92, la misma que puso ahí el
límite de FPS—. Lo que hace «Baja», en el orden en que más gana:

1. **Sin antialias.** Se aplica al volver a entrar a una partida (el motor crea
   el `WebGLRenderer` al construirse), y la fila **lo dice**.
2. **Resolución interna al 75 %** (`setPixelRatio(0.75)` sobre los píxeles CSS, y
   el navegador escala). No más baja: Vektor es casi todo **líneas finas**, y una
   rejilla de un píxel escalada se deshace mucho antes que una textura. El número
   hay que elegirlo mirando una captura (vuelta 89).
3. **Sin fondo panorámico**: el mapa se juega con el fondo apagado, que es lo
   mismo que ya pasa si su imagen no llega (vuelta 78). La rejilla de los muros
   vuelve, que es lo que hay sin fondo.
4. **Sin fogonazo propio.** El sonido y el retroceso siguen contando el disparo
   (propuesta 13).
5. **Límite de FPS a 60 de fábrica.** El mundo va a 60 Hz fijos (vuelta 44), así
   que dibujar más rápido en una integrada no mueve nada del juego y calienta el
   portátil. **No hace falta un tope de 30**: por debajo de 60 se apunta peor, y
   el objetivo del modo bajo es precisamente no bajar de ahí.

Y una cosa que **no** hace, y que es la regla de la vuelta 67 aplicada al
rendimiento: **el modo bajo no puede quitar información.** La brújula, los
contornos, la mira, las marcas de impacto y los avisos se quedan. Hay un detalle
que obliga a medir: el contorno de la brújula está calibrado **con antialias**
(vuelta 41: «el anillo exterior son píxeles de antialias a medio cubrir» y la
opacidad 0,5 se eligió por eso). Sin antialias hay que volver a pasar `br41` y
`brujula39` en el modo bajo y comprobar que la brújula sigue por encima de los 80
px del listón.

**Y el juego avisa si detecta que va mal**, pero no cambia solo: si los primeros
diez segundos de una partida dan la mediana del frame por encima de 20 ms,
un aviso bajo la mira ofrece el modo bajo. Un ajuste que se mueve solo es un
ajuste que no se sabe en qué posición está (vuelta 78).

**Un segundo aviso, más importante**: si el nombre del dibujante
(`WEBGL_debug_renderer_info`) contiene «SwiftShader», el navegador **no está
usando la gráfica**, y el juego irá a 15–25 FPS pase lo que pase. Es lo que le pasa
a Chrome con una Intel HD 3000 (§5.4). Se dice con una frase: «Tu navegador está
dibujando sin la tarjeta gráfica; prueba con Firefox».

**Y falta una cosa que en una integrada vieja es real: no hay ninguna escucha de
`webglcontextlost`.** Si el controlador de la gráfica se reinicia (en Windows,
cualquier cuelgue de más de dos segundos), el lienzo se queda en negro sin decir
nada. Lo mínimo es escucharlo y ofrecer recargar.

### 5.3 Qué hace falta como mínimo

**Lo que no se puede bajar, porque lo pide el motor:** **WebGL2**. Three.js dejó
de admitir WebGL1 en la versión r163, y Vektor va en la r170. WebGL2 en Windows
pide una gráfica con Direct3D 11.

Requisitos para publicar, **como objetivo a validar con §5.5, no como medida**:

| | Mínimo (modo bajo, 60 FPS a 1366×768) | Recomendado (normal, 1080p) |
|---|---|---|
| Sistema | **Windows 10 o 11** (app o navegador); Windows 7/8.1 **sólo con Firefox ESR 115**, sin garantías (§5.6) | Windows 10 u 11 |
| Navegador | Chrome o Edge al día; Firefox 115 o posterior | Chrome o Edge al día, o la app |
| Procesador | 2 núcleos / 4 hilos, ~2,5 GHz (Intel Core i3 de 3.ª generación, 2012) | 4 núcleos (Core i5 de 4.ª gen. o Ryzen 3) |
| Memoria | 4 GB | 8 GB |
| Gráfica | **Intel HD Graphics 4000**, AMD Radeon HD 7000 o NVIDIA GT 600 (con Direct3D 11) | Intel UHD 620 o cualquier dedicada de 2014 en adelante |
| Conexión | 3 Mbit/s de bajada, **y la subida del stream al 75 % de la tuya** (§6.2) | Por cable, no wifi |

**Lo que se sabe que no funciona:** la **Intel HD Graphics 3000** (Sandy Bridge,
2011) **en Chrome**: está en la lista negra de WebGL de Chrome por cuelgues, y ni
forzándola da WebGL2 acelerado. **Firefox sí la usa** (según los resultados del
buscador; §11). Es la razón del aviso de SwiftShader de §5.2.

### 5.4 Un streamer tiene un segundo programa pidiendo la gráfica

Lo que el encargo no dice y cambia la medida: **un streamer está codificando
vídeo a la vez que juega**. Con OBS en `x264` (por CPU) en un i3 viejo, el
codificador se come la mitad del procesador; con **QuickSync** (la integrada de
Intel) o **NVENC** se come parte de la gráfica. Medir Vektor sin OBS abierto mide
otro PC. §5.5 lo incluye.

### 5.5 Cómo medirlo en una integrada antigua

Esto lo tiene que hacer alguien con el PC delante; desde aquí sólo hay
SwiftShader.

**La máquina.** La más vieja que haya a mano de la tabla de §5.3: un portátil con
Core i3/i5 de 3.ª o 4.ª generación y **HD 4000 o HD 4600**, Windows 10, enchufado
a la corriente (con batería, Windows baja la frecuencia) y con el perfil de
energía en «alto rendimiento».

**Antes de medir, qué está usando el navegador.** `chrome://gpu` (o `edge://gpu`):
*WebGL2: Hardware accelerated*, y en *GL_RENDERER* el nombre de la Intel, **no**
«SwiftShader». En Firefox, `about:support` → *Gráficos*. Si sale SwiftShader, esa
fila de la medida no es la del juego: es la de la CPU haciendo de gráfica, y se
anota así.

**Qué se mide.** El tiempo de cada frame, no los FPS del contador (que promedia
treinta frames y esconde los tirones). Hacen falta:

- **p50** del tiempo de frame (lo normal),
- **p99** y el **1 % peor** expresado en FPS («1 % low»: la media de los FPS del 1 %
  de frames más lentos),
- **cuántos frames pasan de 33 ms** por minuto (un tirón que se nota),
- el **uso de CPU y GPU** del Administrador de tareas durante la prueba.

Hoy el motor guarda las muestras del contador en `_frameSamples`; la forma barata
de tener los percentiles es **un `?medir=60` en la dirección** que guarde 60
segundos de tiempos de frame en un `Float32Array` preasignado —la regla del bucle
caliente: sin asignar memoria— y los enseñe al acabar, para copiarlos. Sin eso,
la pestaña *Performance* de las herramientas de Chrome, o **PresentMon** para la
app de escritorio.

**Con qué.** Cuatro escenas de 60 s, cada una en **Normal** y en **Baja**, a
**1366×768** y a **1920×1080**:

1. **Entrenamiento, Plano A**, 8 muñecos, dinámico, recorriendo el mapa entero.
2. **Duelo en El Espejo** contra otra persona (o contra una segunda pestaña en
   otro PC).
3. **Todos contra todos en La Rotonda** con diez en la sala. Si no hay diez
   personas, lo que dibuja es lo que importa: `dibujo100` pone 49 cuerpos
   delante de la cámara sin red, y sirve igual en una gráfica de verdad.
4. **La escena 2 con OBS emitiendo** a 720p30, una vez con `x264 veryfast` y otra
   con QuickSync/NVENC.

**El listón.** En Baja, a 1366×768: **p50 ≤ 16,7 ms** (60 FPS) y **1 % low ≥ 45
FPS**, **también con OBS** en QuickSync. Si no lo da en esa máquina, esa máquina
no es el mínimo, y la tabla de §5.3 sube una fila. Y se miran las capturas de las
dos calidades una al lado de la otra (vuelta 89): si en Baja la rejilla o la
brújula se leen peor, el 75 % se sube.

### 5.6 Windows 7, y la app de escritorio

**La app de escritorio necesita Windows 10 o posterior, y no es sólo WebView2.**
Son dos cosas, y cualquiera de las dos basta:

- **WebView2 dejó Windows 7 y 8.1 en la versión 109**, en enero de 2023, junto con
  Edge. Las versiones 109 y anteriores siguen funcionando ahí **sin parches de
  seguridad**, y según el anuncio de Microsoft **las versiones fijas del runtime
  posteriores a la 109 no arrancan** en Windows 7. O sea que la app, si llegara a
  arrancar, sería un Chromium 109 congelado para siempre dibujando una página que
  cambia con cada despliegue.
- **Y no llega a arrancar**: el `.exe` se compila con Rust estable
  (`dtolnay/rust-toolchain@stable` en `escritorio.yml`) para
  `x86_64-pc-windows-msvc`, y **desde Rust 1.78 (mayo de 2024) ese objetivo exige
  Windows 10**, para el compilador y **para los programas que produce**. Existe un
  objetivo para Windows 7 (`x86_64-win7-windows-msvc`), pero es de nivel 3: sin
  binarios oficiales, compilando la biblioteca estándar a mano con una versión
  nocturna. Y no se sabe si Tauri 2 y sus dependencias compilan contra él.

Curiosamente, **la documentación de Tauri sigue diciendo «Windows 7 y
posteriores»** y trae una sección para instalar en Windows 7. Es de antes de esas
dos fechas; no la toméis como garantía.

**Lo que queda para Windows 7 es el navegador, y el navegador es Firefox.**

- **Chrome y Edge se congelaron en la 109** (enero de 2023). Funcionan, pero sin
  parches desde hace más de tres años: no es algo que se le pueda recomendar a
  nadie.
- **Firefox ESR 115** es la última versión para Windows 7, 8 y 8.1, y Mozilla ha
  ido alargando su soporte: según los resultados del buscador, **hasta marzo de
  2027** (la quinta prórroga). Hay que mirarlo en su página antes de escribirlo en
  unos requisitos.
- **Lo que Vektor necesita, Firefox 115 lo tiene**: WebGL2 (desde la 51), Pointer
  Lock y WebSocket. Y la sintaxis del juego cabe: Vite 6 construye por defecto
  para Firefox 78 en adelante.
- **Tres diferencias conocidas**, ninguna grave:
  - **`unadjustedMovement`** (el ratón sin aceleración del sistema) es de Chrome.
    `_pedirCapturaReal` ya lo prueba una vez y se lo salta si no está (vuelta 62),
    así que funciona; en Windows 7 conviene decir que se quite la «precisión del
    puntero» del panel de control.
  - **El selector CSS `:has()`** llegó en Firefox 121. Vektor lo usa en un sitio
    (`.lobby-hueco:has(.lobby-sacar)`, en `styles.css`): es de aspecto, no rompe
    nada.
  - **Volver con ESC** está modelado sobre las reglas de gesto de **Chrome**
    (vuelta 105, `captura.js`). Firefox tiene las suyas. **Hay que probarlo**; es
    la parte con más probabilidades de comportarse distinto.
- **Y de paso, la gráfica**: un PC con Windows 7 lleva muchas veces una HD 3000,
  que Chrome no usa y Firefox sí (§5.3). Otra razón para que la recomendación sea
  Firefox y no «cualquier navegador».

Lo que se escribe en los requisitos: «**Windows 10 u 11.** En Windows 7 u 8.1
funciona **en Firefox**, sin la app de escritorio y sin garantías». Y se prueba
una vez, con un PC de verdad, antes de escribirlo.

---

## 6. (d) Conexiones lentas

### 6.1 Lo que baja y lo que sube, medido

Medido en esta vuelta contra `Partida` sin navegador (el mismo método que
`salas100`): los jugadores andan girando y saltan cada poco, y se cuentan **los
bytes que el servidor manda de verdad a un jugador**. Es un banco de un solo uso
en la carpeta temporal, no se ha añadido a `bancos/` (esta vuelta sólo escribe
este documento); si se quiere conservar, es `banda17.mjs`.

| Sala | Fotos por segundo | Foto media | **Bajada por jugador** | + cabeceras (WS, TLS, TCP/IP) | **Subida** (entradas + cabeceras) |
|---|---|---|---|---|---|
| **Duelo**, El Espejo | 60 | 909 B | 53,3 KiB/s (**436 kbit/s**) | +4,9 KiB/s | ~2,8 + 4,9 KiB/s (**~60 kbit/s**) |
| **5v5** | 30 | 1 677 B | 49,1 KiB/s (402 kbit/s) | +2,4 KiB/s | ~60 kbit/s |
| **Todos contra todos**, 10 en La Rotonda | 20 | 1 379 B | 26,9 KiB/s (221 kbit/s) | +1,6 KiB/s | ~60 kbit/s |

Con disparos y bajas hay algo más (veredictos, avisos de tiro): `red45` midió en
su día **59–81 KB/s** en un duelo con combate, y la foto del rival se aligeró en la
vuelta 100. **En números redondos: ~0,5 Mbit/s de bajada por jugador en el peor
modo, y ~0,06 de subida.** `salas100`, pasado otra vez hoy, da lo mismo para el
todos contra todos que en la vuelta 100 (289 KiB/s la sala de diez; 28,9 por
jugador).

### 6.2 Contra una conexión modesta, y contra un stream

- **Bajada**: 0,5 Mbit/s en una conexión de 3–10 Mbit/s es entre el 5 y el 17 %.
  Cabe, compartiéndola con Discord y el navegador.
- **Subida**: 0,06 Mbit/s. **El stream del streamer sube 3–6 Mbit/s** (Twitch
  recomienda 3 000 kbit/s a 720p30 y hasta 6 000 a 1080p60). El juego es el **1–2 %**
  de su subida.

**El riesgo de verdad no son nuestros bytes: es que OBS llene la subida.** Una
subida saturada no pierde los paquetes, los **encola** en el router (lo que se
llama *bufferbloat*), y eso son **cientos de milisegundos de ping de más**. Con un
WebSocket, que va por TCP, un paquete que espera retiene a todos los de detrás
(vuelta 103). El síntoma sería «lag cuando empiezo a emitir», y ningún cambio de
protocolo lo arregla.

Lo que sí lo arregla es una línea en la guía para streamers: **el bitrate de OBS
por debajo del 75 % de tu subida medida** (es la recomendación de la propia OBS),
**y por cable**. Y el ping por región del lobby (§3.5) lo enseña: si sube cuando
empiezas a emitir, es tu subida.

### 6.3 Las palancas, y cuánto ahorra cada una

**1. Compresión del WebSocket (`permessage-deflate`).** Es una extensión estándar
que los navegadores negocian solos; en el servidor es **una opción de `ws`**, que
hoy está apagada (su valor de fábrica en el servidor). **No toca el protocolo, ni
el cliente, ni la foto.** Medido con el mismo banco, simulando la compresión con
contexto (un compresor por conexión que recuerda los mensajes anteriores, que es
lo que hace la extensión):

| Sala | Sin comprimir | Mensaje a mensaje, sin contexto | **Con contexto** |
|---|---|---|---|
| Duelo | 53,3 KiB/s | 27,8 KiB/s (÷1,9) | **3,7 KiB/s (÷14)** |
| 5v5 | 49,1 | 18,7 (÷2,6) | **4,4 (÷11)** |
| Todos contra todos | 26,9 | 11,7 (÷2,3) | **2,5 (÷11)** |

Dos avisos antes de creerse el ÷14:

- **El banco es sintético**: los jugadores andan con un patrón, y una partida de
  verdad tiene más entropía (saltos, disparos, números que cambian más). **La cifra
  honrada es «entre 4 y 14 veces»**, y la de verdad se mide encendiéndola en
  pruebas y leyendo `red45`.
- **`ws` no comprime mensajes de menos de 1024 B por defecto** (`threshold`), y la
  foto del duelo pesa ~900. Encenderla sin bajar ese número **no haría nada** en un
  duelo, sin un error en ninguna pantalla. Va con `threshold` a ~128.

Lo que cuesta:

- **CPU**: cada conexión comprime lo suyo (la foto ligera del rival se serializa una
  vez por foto, vuelta 100, pero se comprime una vez por destinatario). Medido aquí,
  del orden de decenas de microsegundos por mensaje: **~1–2 % de un núcleo por sala
  de diez a 20 Hz**. Cabe; hoy una sala de diez gasta el 1,9 % de un paso.
- **Memoria**: ~300 KB por conexión con la ventana de fábrica. Cien jugadores son
  30 MB de los 512. Con una ventana de 1 KB se ahorra memoria pero se pierde casi
  todo (el banco lo midió: 26,3 KiB/s en el duelo, lo mismo que sin contexto).
- **La propia documentación de `ws` avisa** de que en Node la compresión con mucha
  concurrencia puede fragmentar la memoria, y pide probarla con una carga
  representativa. Se enciende **primero en pruebas** (propuesta 19), se mira
  `/salud` (CPU, retraso del bucle, atascos, vuelta 103) una semana, y luego en
  estable.

Y de propina **baja la factura**: el tráfico de São Paulo, que cuesta el doble,
cae con ella (§3.8).

**2. Bajar el ritmo de la foto del duelo** (60 → 30 Hz): la mitad de bytes, pero
**sube el retraso de dibujo** de 50 a 67 ms —`max(3, 2·2) = 4` pasos—, o sea 17 ms
más de rebobinado, que es justo lo que §4 intenta no gastar. **No, mientras la
compresión dé lo mismo sin tocarlo.**

**3. La foto en binario** (propuesta 11 §2.3): ~8 veces menos en la parte de cada
rival. Es cambiar `JSON.stringify` por un empaquetado en los dos extremos, que es
una vuelta propia, rompe la decisión de la vuelta 45 («el cable es texto y se lee
en el inspector») y **se lleva mal con la compresión**: unos bytes ya apretados se
comprimen mucho peor que un JSON repetitivo. Para una sala de cincuenta en campo
abierto sigue siendo la palanca buena; **para una beta de duelos y salas de diez
en conexiones de 3 Mbit/s, no hace falta**.

### 6.4 El veredicto

**No adelantar la foto binaria.** El ancho de banda **no es el cuello de botella**
de un jugador latinoamericano: lo es la latencia (§2–§4) y, para un streamer, su
propia subida (§6.2). Si hiciera falta bajar bytes —por la factura de São Paulo o
por conexiones peores de lo previsto—, **la compresión va primero**: es una opción,
no un protocolo, y la mide la misma batería de siempre.

---

## 7. Coste total

| | Al mes |
|---|---|
| Tres máquinas (París, Dallas, São Paulo), 512 MB | 12,77 $ |
| IPv4 dedicada (una, anycast) | 2,00 $ |
| Volúmenes para el contador, si no va a Supabase (3 × 1 GB) | 0,45 $ |
| **Fijo** | **~15 $** (hoy ~5,6) |
| Tráfico de una beta pequeña (§3.8) | ~15 $ sin compresión · ~4 $ con ella |
| **Total realista** | **~20–30 $** · **~18–21 $ con compresión** |
| Si además hay app de pruebas (propuesta 19), una máquina en París | +5,6 $ |

El modo bajo, el tope partido y los requisitos no cuestan dinero: cuestan horas.

---

## 8. Riesgos

- **Fly vuelve a cambiar el mapa.** Ya cerró Madrid, Querétaro, Bogotá y Santiago
  de una vez. Si cierra `gru`, el Cono Sur vuelve a 150+ ms. Lo que lo hace
  tolerable es lo de siempre (propuesta 03 §3.2): el huésped es un fichero y
  mudarlo es un día, y con el código llevando la región, mover una región a otro
  sitio es cambiar una tabla.
- **Una región caída deja sin salas a los suyos.** Sin `fallback` a propósito
  (§3.4): mejor «el servidor de esa región no contesta» que dos mundos. Las otras
  regiones siguen.
- **Un despliegue reinicia las tres a la vez**, y con ellas todas las salas. Pasa
  hoy con una; con tres pasa en tres continentes, a horas en que en alguno se está
  jugando. La propuesta 19 (estable que sólo cambia cuando Yago lo decide) es lo que
  lo acota.
- **Estimaciones de ping, no medidas** (§2). Lo primero de §9 es sustituirlas por
  las del lobby.
- **El tope partido cambia qué muere detrás de una pared**, sobre todo en el todos
  contra todos. Se decide con la medida de `topado` delante, no antes.
- **Firefox en Windows 7 no está probado.** Puede que la captura del ratón y ESC se
  comporten distinto (§5.6).
- **La compresión en Node** puede costar más memoria de la que dice la cuenta
  (§6.3). Se enciende en pruebas primero.

---

## 9. El orden recomendado

**Fase 0 — Saber (sin regiones todavía, ~1 vuelta).**

1. `/ping` en el huésped, y el ping de cada jugador **a cada región** en el lobby
   con `fly-force-region` (§3.5). Se puede construir con una sola máquina:
   `fly-force-region` **no cae a otra región** si en la pedida no hay máquina, así
   que hasta que existan la petición falla y el lobby pone «—» en esa columna, en
   vez de un número falso. Con las máquinas puestas, dice la verdad. Y mientras
   tanto, el ping a París de cada tester latinoamericano ya es una medida.
2. Contar `topado` por sala y enseñarlo en `/salud` (§4.4).
3. Compresión en **pruebas**, con `threshold` bajo (§6.3), y `red45` antes y
   después.

**Fase 1 — Regiones (~1–2 vueltas).**

4. La tabla de regiones en el código de sala y `fly-replay` en el `upgrade`
   (§3.3–§3.4), con su banco: dos huéspedes locales con `FLY_REGION` distinto
   detrás de un proxy de juguete que haga de `fly-replay`, y los bancos de red de
   siempre verdes **sin tocar una aserción** (el listón de las vueltas 47 y 58).
5. `desplegar.yml` por región (§3.7) y crear las máquinas (§10).
6. El selector de región del anfitrión, con la sugerencia (§3.5).

**Fase 2 — Justicia y máquinas viejas (~1–2 vueltas).**

7. El tope partido (§4.3, opción 5), si la medida de la fase 0 lo pide.
8. El modo bajo (§5.2), con `br41` y `brujula39` repasados sin antialias, el aviso
   de SwiftShader y la escucha de `webglcontextlost`.
9. `?medir=60`, y la medida de §5.5 en una HD 4000 de verdad.
10. Requisitos mínimos publicados, y la guía para streamers (OBS al 75 % de la
    subida, por cable).

**Después, sólo si la beta lo pide**: mudar una sala llena de región, `iad`, la
foto binaria.

---

## 10. Lo que tiene que hacer Yago

Lleva tarjeta o es una prueba con un PC que no está aquí.

**Crear las máquinas** (en la aplicación estable si existe la propuesta 19; si no,
en `ancient-violet-678`), **después** de que la fase 1 esté desplegada, nunca
antes —sin el reenvío por código, dos máquinas son dos mundos (vuelta 59)—:

```sh
fly scale count 3 --region cdg,dfw,gru --max-per-region 1 --app ancient-violet-678
fly status --app ancient-violet-678          # tres filas, una por región
fly ips list --app ancient-violet-678        # la misma v4 dedicada de siempre, sin "shared"
```

Y comprobar que cada región contesta ella:

```sh
curl -s -H "fly-force-region: gru" https://ancient-violet-678.fly.dev/salud | jq '.region, .maquina'
curl -s -H "fly-force-region: dfw" https://ancient-violet-678.fly.dev/salud | jq '.region, .maquina'
curl -s -H "fly-force-region: cdg" https://ancient-violet-678.fly.dev/salud | jq '.region, .maquina'
```

Si el contador sigue en volúmenes (sin la propuesta 20), uno por región:

```sh
fly volumes create vektor_datos --region dfw --size 1 --app ancient-violet-678
fly volumes create vektor_datos --region gru --size 1 --app ancient-violet-678
```

**Volver atrás** es una orden: `fly scale count 1 --region cdg --max-per-region 1`
y quitar las dos regiones de `VEKTOR_REGIONES`.

**Pedir a dos o tres testers de la beta**, uno de México, uno de Colombia o Perú y
uno del Cono Sur, que abran el lobby y copien los tres pings: sustituyen la tabla
de §2 por medidas.

**Probar en Windows 7 con Firefox ESR 115**, si hay un PC así a mano: entrar,
capturar el ratón, ESC y volver, una ronda de duelo.

**Mirar los precios** en <https://fly.io/docs/about/pricing/> antes de crear nada:
aquí se han leído en la fuente de esa página, no en la página.

---

## 11. Fuentes

**Leídas en su fuente** (repositorios públicos clonados en esta vuelta):

- Regiones de Fly: `superfly/docs`, `reference/regions.mdx` (commit del
  29-09-2026) → <https://fly.io/docs/reference/regions/>
- Precios de máquina por región, IPv4 dedicada y tráfico: `superfly/docs`,
  `about/pricing.mdx` y `snippets/RegionPricingSelector.jsx` →
  <https://fly.io/docs/about/pricing/>
- `fly-replay`, `fly-prefer-region`, `fly-force-region`, `fly-force-instance-id`:
  `networking/dynamic-request-routing.mdx` →
  <https://fly.io/docs/networking/dynamic-request-routing/>
- `fly-replay` con WebSockets: `blueprints/connecting-to-user-machines.mdx` →
  <https://fly.io/docs/blueprints/connecting-to-user-machines/>
- IP anycast: `networking/services.mdx` y `reference/fly-proxy.mdx` →
  <https://fly.io/docs/networking/services/>
- `fly scale count --region --max-per-region`: `flyctl/cmd/fly_scale_count.mdx` y
  `launch/scale-count.mdx` → <https://fly.io/docs/launch/scale-count/>
- Tauri y Windows 7 / WebView2: `tauri-apps/tauri-docs`,
  `src/content/docs/distribute/windows-installer.mdx` →
  <https://v2.tauri.app/distribute/windows-installer/>
- `ws`, `perMessageDeflate` y su `threshold` de 1024: `node_modules/ws/README.md` y
  `lib/permessage-deflate.js` (versión 8.21.3) → <https://github.com/websockets/ws>

**Vistas sólo en los resultados del buscador** (la página no se pudo abrir):

- Consolidación de regiones de Fly (septiembre de 2025):
  <https://fly.io/blog/the-region-consolidation-project/> y
  <https://news.ycombinator.com/item?id=45380634>
- Microsoft Edge y WebView2 dejan Windows 7/8.1 en la 109:
  <https://blogs.windows.com/msedgedev/2022/12/09/microsoft-edge-and-webview2-ending-support-for-windows-7-and-windows-8-8-1/>
  y <https://github.com/MicrosoftEdge/WebView2Announcements/issues/53>
- Edge y WebView2 en Windows 10 22H2 con actualizaciones hasta octubre de 2028:
  <https://windowsforum.com/threads/edge-and-webview2-updates-on-windows-10-22h2-extend-to-october-2028.377261/>
- Rust 1.78 y Windows 10 como mínimo:
  <https://blog.rust-lang.org/2024/02/26/Windows-7/>
- Firefox ESR 115 en Windows 7 hasta marzo de 2027:
  <https://support.mozilla.org/en-US/kb/firefox-users-windows-7-8-and-81-moving-extended-support>
  (el anuncio anterior, hasta marzo de 2026:
  <https://blog.mozilla.org/futurereleases/2025/09/04/firefox-esr-115-support-for-windows-7-8-and-8-1-and-old-mac-os-versions-extended-until-march-2026/>)
- Three.js deja WebGL1 en r163: <https://github.com/mrdoob/three.js/pull/27836>
- Intel HD 3000 en la lista negra de WebGL de Chrome:
  <https://github.com/Alex313031/Thorium-Win/issues/355>
- Ping Ciudad de México–Dallas (~32 ms):
  <https://wondernetwork.com/pings/Mexico%20City/Dallas>
- Ping Bogotá–São Paulo (~110 ms): <https://checkping.io/ping-test/sao-paulo> y
  <https://wondernetwork.com/pings/Bogota/Sao%20Paulo>
- Vultr en Ciudad de México, Santiago y São Paulo:
  <https://www.vultr.com/features/datacenter-regions/>
- Bitrates de Twitch y el 75 % de la subida en OBS:
  <https://www.obsbot.com/blog/live-streaming/twitch-bitrate>

**Lo que no se pudo verificar en absoluto:** el resto de la tabla de latencias de
§2 (es una estimación por distancia calibrada con las dos cifras de arriba); si Fly
mantiene puntos de entrada de red en las ciudades cuyas regiones cerró; en qué
región factura Fly el tráfico (la de la máquina o la del borde, §3.8); que Tauri 2
compile para `x86_64-win7-windows-msvc`; y cualquier número de rendimiento en una
gráfica integrada real.
