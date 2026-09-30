# Propuesta 18 · anexo — Inventario de textos: español neutro y catálogo

> **Estado:** auditoría de la vuelta 108, anexo del plan (`18-idiomas.md`). No
> toca ningún fichero del juego.
> **Encargo:** pasar Vektor a **español neutro** como idioma principal (la beta
> es latinoamericana) y dejar preparado un **catálogo de textos** para añadir
> después inglés y portugués de Brasil.

Todos los textos que ve el jugador están escritos a mano en español de España y
repartidos por el código. Antes de mover ninguno hay que saber **cuántos son,
dónde están y cuáles no se pueden mover tal cual**. Eso es este documento.

## 0. Cómo se ha medido

- **«Coger» y derivados** (§1): `grep -rniE` con el patrón del encargo y uno más
  ancho (`\bc[oó]g[a-záéíóúñ]*` y `coja/cojo/cojan`), en `src`, `net`, `editor`
  y `escritorio`, con `LC_ALL=C.UTF-8` — sin él, `[oó]` no casa con la tilde y
  la búsqueda se deja cosas. Cada coincidencia se leyó a mano.
- **Textos visibles** (§2 y §3): un extractor con `@babel/parser` (ya está en
  `node_modules` por el plugin de React) que saca de cada `.js/.jsx` los
  literales, las plantillas y el texto JSX, **sin comentarios**, y descarta lo
  que es mecánica: `className`, selectores, `classList`, `console.*`,
  comparaciones, claves de objeto, rutas SVG, transformaciones CSS, JSON del
  protocolo. Los `.html` se pasaron por un parser de HTML (texto y atributos
  `title`, `placeholder`, `aria-label`). El volcado está en el scratchpad de la
  sesión, no en el repositorio.
- **Lo que el extractor cuenta son fragmentos, no mensajes**: una frase JSX
  cortada por un `<kbd>` sale en tres trozos. Por eso §3 da dos números.
- **Límite conocido**: una palabra suelta en mayúsculas sin tilde (`ABATIDO`,
  `LISTO`, `INVULNERABLE`) cae en el filtro de identificadores; se buscaron
  aparte y son media docena.

---

## 1. «Coger» y derivados

**Es lo único obligatorio de verdad**: en México, Argentina, Venezuela y buena
parte de Centroamérica «coger» es vulgar, y en un juego de disparos donde «se
coge un arma» la frase se lee exactamente como no se quiere.

### Resumen

| | Coincidencias |
|---|---|
| Total en `src`, `net`, `editor`, `escritorio` | **62** en 17 ficheros |
| **Visibles** | **11**: **1 la ve el jugador**, **10 sólo Alchemist** |
| En comentarios | 50 |
| Falso positivo | 1 (`src/styles.css:4054`, «una fila **coja**», adjetivo y además comentario) |
| En nombres de variables o funciones | **0** — las funciones ya se llaman `recoger*` (`recogerEnInventario`, `_recogerPeana`, `_alRecoger`, `MSG.RECOGER`) |
| `escritorio/` (Rust, JSON, HTML) | 0 |

**Verbo que se propone para todo el juego: «recoger».** Es el que usa ya el
aviso bajo la mira (`E · Recoger Pulse`, `src/game/engine.js:1682`), es el
estándar de los shooters en español latino («Recoger arma») y no cambia de
sentido en ningún país. «Tomar» vale como alternativa; «agarrar» se usa donde el
objeto no es sólo un arma (el caso del cable de la fila 11).

### 1.1 Visibles — hay que cambiarlos

| # | Fichero:línea | Lo ve | Texto actual | Propuesta en neutro |
|---|---|---|---|---|
| 1 | `src/game/engine.js:916` | **jugador** | `No se puede coger: ${m.m}` | `No se puede recoger: ${motivo}` — y ver §4.4: `m.m` llega del servidor como **código** (`lejos`, `pared`) o como **frase** (`no es un arma`, `sólo 2 clases`), así que hoy el jugador lee «No se puede coger: lejos». Propuesta de frases: «Estás demasiado lejos», «Hay una pared en medio», «Solo puedes llevar 2 tipos de granada». |
| 2 | `src/maps/formato.js:717` | Alchemist | `peanas: el mapa no está en modo Peanas, así que no se pueden coger (se conservan)` | `…así que no se pueden recoger (se conservan)` |
| 3 | `src/maps/formato.js:980` | Alchemist | `Modo Peanas sin ninguna peana: nadie podría coger un arma (hoja Reglas).` | `…nadie podría recoger un arma (hoja Reglas).` |
| 4 | `src/maps/formato.js:984` | Alchemist | `Hay peanas de armas que el mapa no admite (…): no se podrían coger.` | `…: no se podrían recoger.` |
| 5 | `editor/index.html:891` | Alchemist | `En Peanas es el equipo base: las armas se cogen del suelo y lo recogido se pierde al morir.` | `…las armas se recogen del suelo y lo que recojas se pierde al morir.` (evita «recogen… recogido» seguidos) |
| 6 | `editor/index.html:899` | Alchemist | `Nunca se agotan: la coge quien quiera, las veces que quiera.` | `Nunca se agotan: cualquiera puede recogerla, las veces que quiera.` |
| 7 | `editor/index.html:900` | Alchemist | `Se cogen <b>apuntándolas y con la tecla de acción</b>, a distancia de brazo…` | `Se recogen <b>apuntándolas y con la tecla de acción</b>, a distancia de brazo…` |
| 8 | `editor/editor.js:3874` | Alchemist | `Se coge apuntándole y con la E. No se agota; si ya la llevas, recarga.` | `Se recoge apuntándole y con la tecla de acción. No se agota; si ya la llevas, recarga.` — la «E» escrita a mano incumple además «Un rótulo de control dice el bind» (vuelta 97). |
| 9 | `editor/editor.js:7308` | Alchemist | `Se sale con el equipo base y las armas se cogen de las peanas, apuntando y con la tecla de acción. Sin tienda ni dinero.` | `…y las armas se recogen de las peanas…` |
| 10 | `editor/editor.js:7385` | Alchemist | `Estas peanas no se pueden coger: el mapa no está en modo Peanas (se conservan).` | `Estas peanas no se pueden recoger: …` |
| 11 | `editor/editor.js:7391` | Alchemist | `La peana N está al alcance de un cable: la tecla de acción coge el arma si la apuntas y el cable si no.` | `…la tecla de acción agarra el arma si la apuntas y el cable si no.` («recoger el cable» no se dice; «agarrar» vale para los dos) |

**Junto a ellos, «recoger»** — no es vulgar y **no hay que tocarlo**, se anota
porque convive con los de arriba y el glosario tiene que ser uno:

- `src/game/engine.js:1682` — `${tecla} · Recoger ${nombre}` (y `Recargar`).
- `src/ui/Armoury.jsx:568` — `acertar la gasta, fallar la deja clavada · se recoge pasando por encima`.
- `src/config.js:2303` — `Sin cuchillos: recoge uno del suelo`.
- `editor/index.html:891` — «lo recogido», en la misma frase que el nº 5.

### 1.2 En comentarios — no se cambian ahora, sólo se cuentan

| Fichero | Nº | Líneas |
|---|---|---|
| `src/config.js` | 17 | 479, 498, 500, 2617, 2746 (`coja`), 2796, 3816, 3988, 4462, 4463 (×2), 4467, 4472, 4496, 5049, 6498, 7062 |
| `src/game/arsenal.js` | 9 | 5, 9 (`cogible`), 21, 101, 121, 127, 128, 178 (×2) |
| `net/partida.js` | 5 | 498, 505, 2469, 2521, 2613 |
| `src/game/scenario.js` | 4 | 445, 717, 1576, 1590 |
| `src/game/clavadas.js` | 3 | 3, 32, 34 |
| `src/game/engine.js` | 2 | 1501, 1711 |
| `editor/editor.js` | 2 | 4449, 5235 |
| `net/lobby.js` | 2 | 10, 286 |
| `src/game/peanas.js`, `src/game/pickups.js`, `src/game/transition.js`, `src/keybinds.js`, `net/cliente.js`, `net/prueba.js` | 1 cada uno | 5; 6; 74; 13; 1100; 359 |
| **Total** | **50** | |

Los comentarios los leen quien programa y Yago, no el jugador. Se pueden cambiar
de paso el día que se toque cada fichero; no hay prisa.

---

## 2. Expresiones de España en textos visibles

### 2.1 Tratamiento: **tú**, y se queda

El juego **tutea** al jugador en todas partes («Pulsa», «Equípate», «tu
rival», «cuéntanos») y el tuteo es lo normal en el español neutro de los
videojuegos. **No hay ni un «usted» ni un voseo** («tenés», «sos», «podés»):
cero coincidencias. El único plural de trato son **cuatro vosotros** (filas 1–4
de abajo), y en neutro no se sustituyen por «ustedes» sino **reescribiendo sin
dirigirse al grupo**, que es lo que evita el problema en los tres idiomas. «Te
expulsamos por inactividad» (`src/config.js:8223`) es un *nosotros* del juego y
vale.

**Lo que no aparece** en ningún texto visible, buscado a propósito: ordenador,
móvil, coche, guay, mola, tío, flipar, enfadar, pillar, currar, chaval, vale la
pena, mogollón. Cero.

### 2.2 Obligatorio

| # | Fichero:línea | Texto actual | Propuesta | Por qué |
|---|---|---|---|---|
| 1 | `src/ui/Beta.jsx:42` | `Multijugador: crea una sala, manda el enlace, pulsad LISTO y a jugar.` | `…manda el enlace, que todos marquen LISTO y a jugar.` | vosotros |
| 2 | `src/ui/Lobby.jsx:221` | `Cuando acabe, el anfitrión puede lanzar la siguiente con los que estéis listos.` | `…con quienes estén listos.` | vosotros |
| 3 | `src/ui/Lobby.jsx:252` | `Se puede empezar desequilibrado si queréis: basta un listo en cada equipo.` | `Se puede empezar con equipos desiguales: basta un listo en cada equipo.` | vosotros |
| 4 | `net/lobby.js:375` | `Sois N y en este mapa caben M: elige uno con más salidas o que salga(n) K` | `Hay N en la sala y en este mapa caben M: elige uno con más salidas o que salgan K` | vosotros; además lo redacta el servidor (§4.4) y el plural va a mano (§4.2) |
| 5 | `src/ui/Lobby.jsx:299` | `Pincha un hueco libre para cambiarte.` | `Haz clic en un lugar libre para cambiarte.` | «pinchar» por hacer clic no se entiende en LATAM; en Chile es ligar y en México evoca «pinche» |
| 6 | `src/ui/Lobby.jsx:300` | `Pincha un hueco libre para cambiarte de color.` | `Haz clic en un lugar libre para cambiar de color.` | ídem |
| 7 | `editor/index.html:631` | `Pincha uno para elegirlo y que la cámara sepa cuál es.` | `Haz clic en uno para elegirlo…` | ídem (Alchemist) |
| 8 | `editor/index.html:917` | `Todo lo que hay en el mapa. Pincha una fila para elegirla en la vista…` | `…Haz clic en una fila para elegirla…` | ídem (Alchemist) |
| — | §1.1, filas 1–11 | «coger» | «recoger» / «agarrar» | vulgar |

### 2.3 Opcional — se entiende, pero suena a España

Agrupado por palabra, porque la decisión es de glosario y se toma una vez.

| Palabra | Fichero:línea | Texto actual | Propuesta |
|---|---|---|---|
| **ratón** | `src/ui/Beta.jsx:32` | `El ratón apunta; …` | `El mouse apunta; …` |
| | `src/ui/Beta.jsx:33` | `…gira el ratón hacia donde estrafeas…` | `…gira el mouse hacia…` |
| | `src/ui/Armoury.jsx:795` | `Teclea categoría + código para equipar sin ratón.` | `…sin mouse.` |
| | `src/ui/Options.jsx:255` | `…mueve la mira y se compensa con el ratón.` | `…con el mouse.` |
| | `net/prueba.js:479` | `Mueve el ratón o pulsa una tecla: si no, sales de la acción.` | `Mueve el mouse o presiona una tecla…` |
| | `src/keybinds.js:333-334` | `RATÓN 4`, `RATÓN 5` | `MOUSE 4`, `MOUSE 5` |
| | `editor/editor.js:7126` | `vuela la cámara (el ratón sobre el mapa)` | `(el mouse sobre el mapa)` |
| **pulsar** | `src/game/engine.js:2454` y `:4023` | `Pulsa ${tecla} para recargar` | `Presiona ${tecla} para recargar` |
| | `src/game/engine.js:3301` | `Carga de escudo · pulsa ${tecla} para aplicarla` | `…presiona ${tecla}…` |
| | `src/game/captura.js:166` | `<b>Haz clic</b> o pulsa cualquier tecla para volver a la partida` | `…o presiona cualquier tecla…` |
| | `src/ui/Controls.jsx:64` | `pulsa una tecla…` | `presiona una tecla…` |
| | `net/prueba.js:478` | `Tu sitio se guarda. Pulsa cualquier tecla o «Reconectar»…` | `Tu lugar se guarda. Presiona cualquier tecla o «Reconectar»…` |
| | `editor/sonidos.html:40` | `Pulsa en cualquier sitio para arrancar el audio…` | `Haz clic en cualquier lugar…` |
| | `editor/index.html:780` | `…lo avisa en rojo sin pulsarlo.` | `…sin presionarlo.` |
| | `Alchemist.command:22` | `Pulsa Intro para cerrar.` | `Presiona Enter para cerrar.` |
| **andar** | `src/App.jsx:95` | `andar` (rótulo de controles) | `caminar` |
| | `src/ui/Beta.jsx:33` | `… para andar, …` | `… para caminar, …` |
| | `src/ui/Armoury.jsx:203` | `…lo que carga se nota al andar.` | `…se nota al caminar.` |
| | `net/prueba.js:546` | `Andar sin hacer ruido` | `Caminar sin hacer ruido` |
| | `editor/index.html:458, 536, 552, 589, 597`; `editor/editor.js:3717, 5141` | `se suben andando`, `resbala al andar`… | `caminando`, `al caminar` |
| **sitio** | `src/App.jsx:644` | `Click en cualquier sitio para continuar.` | `Haz clic en cualquier lugar para continuar.` (y «Click» es el único con k: el resto dice «clic») |
| | `src/ui/Lobby.jsx:335` | `Esperando sitio: …` | `Esperando lugar: …` |
| | `src/ui/Options.jsx:254` | `…las balas van al mismo sitio.` | `…al mismo lugar.` |
| | `net/servidor.mjs:246` | ADIOS: `este sitio se ha abierto en otra ventana` | `tu lugar se abrió en otra ventana` (y §4.4) |
| | `editor/index.html:679`; `editor/editor.js:1876` | `te deja en otro sitio`; `sin sitio junto a su salida` | `lugar` |
| **hueco** | `src/ui/Lobby.jsx:95` | `Hueco libre` | `Lugar libre` |
| **vale** | `src/ui/Controls.jsx:166` | `…Ctrl sí vale, y agacharse sale ahí de fábrica en Ctrl.` | `…Ctrl sí se puede usar, y agacharse viene asignado ahí de fábrica.` |
| | `src/keybinds.js:171` | `Esa tecla ya vale para esta acción.` | `Esa tecla ya está asignada a esta acción.` |
| **fichero** | `editor/index.html:201` | `…en cuanto dejas el fichero…` | `archivo` |
| | `editor/editor.js:5597` | `y N fichero(s) del registro y el historial` | `archivo(s)` (y §4.2) |
| **Mayús** | `src/keybinds.js:307-308` | `MAYÚS IZQ`, `MAYÚS DER` | `SHIFT IZQ`, `SHIFT DER` |
| | `src/keybinds.js:202` | `Nada de combinaciones con Mayús.` | `…con Shift.` |
| | `editor/editor.js:7128, 7130`; `editor/index.html:266` | `Mayús`, `Ctrl+Mayús+Z` | `Shift`, `Ctrl+Shift+Z` |
| **Intro** | `src/keybinds.js:317` | `INTRO` | `ENTER` |
| | `net/prueba.js:673` | `Aceptar <kbd>Intro</kbd>` | `Aceptar <kbd>Enter</kbd>` |
| **Retroceso** | `src/keybinds.js:318` | `RETROCESO` | `BORRAR` (o `BACKSPACE`) |
| **pretérito compuesto** (el «ha pasado» de España donde LATAM dice «pasó») | `src/ui/Beta.jsx:94` | `Qué ha pasado, qué esperabas…` | `Qué pasó, qué esperabas…` |
| | `src/ui/Beta.jsx:108` | `No se ha enviado:` | `No se envió:` |
| | `net/cliente.js:332` | `se ha cortado la conexión con el servidor` | `se cortó la conexión con el servidor` |
| | `net/cliente.js:886` | `el servidor ha cerrado la partida` | `el servidor cerró la partida` |
| | `net/prueba.js:602 / 604` | `la has pedido tú` / `la ha pedido el rival` | `la pediste tú` / `la pidió el rival` |
| | `net/prueba.js:670` | `tu rival se ha quedado sin pausas libres` | `tu rival se quedó sin pausas libres` |
| | `net/prueba.js:1148` | `HAS GANADO` | `GANASTE` |
| | `net/prueba.js:1539` | `el rival ha abandonado` / `…se ha quedado sin nadie` | `el rival abandonó` / `…se quedó sin nadie` |
| | `src/config.js:8207` | `El anfitrión te ha sacado de la sala` | `El anfitrión te sacó de la sala` |
| | `src/beta.js:48` | `el servidor ha dicho ${status}` | `el servidor respondió ${status}` |
| | `escritorio/ventana/index.html:20` | `Vektor no ha podido conectar. Comprueba tu conexión…` | `Vektor no pudo conectarse. Revisa tu conexión…` |
| **diana(s)** (~20 textos: `Training.jsx`, `config.js`, `App.jsx:584`, `Beta.jsx:41`, `Options.jsx:138`) | p. ej. `Tipo de diana`, `Dianas simultáneas` | `Tipo de blanco`, `Blancos simultáneos` | Se entiende; en LATAM es más común «blanco» u «objetivo». Decisión de glosario: si cambia, cambian las ~20 a la vez. |
| **tildes diacríticas** (22 «sólo», 3 «éste/ésta») | p. ej. `Training.jsx:132`, `Lobby.jsx:262 «Éste»`, `editor/index.html:804 «Quitar ésta»` | `sólo`, `Éste` | `solo`, `Este` — la RAE las desaconseja desde 2010 y las guías de neutro no las usan. |

Cuenta: **8 filas obligatorias** en §2.2 (más las 11 de «coger» de §1) y **55
filas opcionales** en §2.3, de las que las de más peso son **ratón (8)**,
**pulsar (9)**, **andar (≈12)**, **sitio (8)** y el **pretérito compuesto
(≈15 en todo lo visible, 13 listadas)**.

---

## 3. Cuántos textos hay que mover al catálogo

Dos números por fichero: **fragmentos** (lo que el extractor encuentra, únicos
por fichero) y una **estimación de claves** del catálogo, que junta las frases
partidas por `<kbd>`/`<b>` y quita lo que no se traduce (nombres de armas, la
marca, números).

### 3.1 Juego (lo que ve el jugador) — primero

| Zona | Fichero | Fragmentos | Claves (≈) | Notas |
|---|---|---|---|---|
| Pantallas de React | `src/ui/Armoury.jsx` | 81 | 70 | fichas de arma: muchas plantillas con números |
| | `src/ui/Lobby.jsx` | 72 | 60 | |
| | `src/ui/Training.jsx` | 51 | 50 | |
| | `src/ui/Beta.jsx` | 34 | 15 | frases cortadas por `<kbd>` |
| | `src/ui/Options.jsx` | 30 | 25 | |
| | `src/App.jsx` | 26 | 25 | |
| | `src/ui/Controls.jsx` | 19 | 12 | |
| | `src/ui/Summary.jsx` | 15 | 12 | |
| | `src/ui/Hud.jsx` | 9 (+4 en mayúsculas y `textContent`) | 13 | `ABATIDO`, `INVULNERABLE`, `libre`/`tiempo`, `reapareces en…` |
| | `src/ui/Cabina.jsx`, `fields.jsx`, `Stars.jsx`, `ScenarioThumbnail.jsx`, `actualizacion.js` | 14 | 14 | incluye `aria-label` y `title` |
| Datos | `src/config.js` | 141 | **≈105** | se enseñan: `label` de los 27 ajustes, 23 acciones de `KEYBINDS` y sus 5 grupos, modos, duraciones, dificultades, tipos de diana, ranuras y categorías de la tienda, 10 colores de jugador, subtítulos de arma («revólver», «rifle de asalto»…), avisos de munición, `motivo`s de `CUENTA_DE_SALA` y `AFK`, `rangoDeJugadores`. **No se traducen** los ~20 nombres de arma ni, si se decide así, los de mapa. |
| | `src/keybinds.js` | 23 | 23 | errores de asignación y nombres de tecla (§4.3) |
| | `src/maps/*.js` (mapas de fichero) | ≈12 | ≈12 | `label` y ficha (`card.trains/risk/replay`) de cada mapa: son **datos del mapa** (§4.8) |
| Motor | `src/game/engine.js`, `captura.js`, `arsenal.js`, `actionPanel.js` | 23 | 18 | avisos bajo la mira; `actionPanel` está apagado |
| | `src/beta.js` | 4 | 4 | |
| Multijugador | `net/prueba.js` | 107 | 95 | tienda, pausas, marcador, avisos; ≈15 son del panel F3 |
| | `net/prueba.html` | 55 | 50 | ≈30 son del panel F3 (instrumento: puede quedarse sin traducir) |
| Servidor → cliente | `net/lobby.js`, `net/servidor.mjs`, `net/cliente.js`, `worker/sala.js` | 14 | 10 | ya redactados (§4.4) |
| | `net/beta.js` | 8 | 2 + 6 | 2 errores que ve el jugador en el panel de feedback; 6 de las páginas `/contador` y `/feedback/leer`, que sólo ve Yago |
| **Subtotal juego** | | **≈745** | **≈590** | |

### 3.2 Escritorio

| Fichero | Textos | Notas |
|---|---|---|
| `escritorio/ventana/index.html` | 1 | la página de «no he podido conectar» |
| `escritorio/src-tauri/tauri.conf.json` | 3 | `shortDescription`, `longDescription`, `copyright` («Vektor Installer 0.5.0 · FlickLAB») |
| Instalador NSIS | — | `"languages": ["Spanish"]` es el paquete de NSIS de España; valorar `SpanishInternational` y comprobar qué frases trae antes de cambiar. Para inglés y portugués, añadir idiomas a esa lista (con `displayLanguageSelector`). |
| `escritorio/src-tauri/src/main.rs` | **0 visibles** | sólo dos `.expect(…)` en español, que son pánicos y no llegan a ninguna pantalla |
| **Total** | **≈4** + la elección de idioma del instalador | La ventana carga la web, así que el juego en sí sale del catálogo de la web. |

### 3.3 Alchemist — sólo lo usa Yago, se deja para el final

| Fichero | Fragmentos | Notas |
|---|---|---|
| `editor/index.html` | 395 | casi todo `<p class="nota">` con `<b>` dentro |
| `editor/editor.js` | 323 | fichas, avisos, atajos, 43 sitios con `innerHTML` |
| `src/maps/formato.js` | 81 | `problemas` del saneado y `faltasParaPublicar`; sólo los enseña Alchemist (y el servidor de desarrollo al negarse a subir) |
| `editor/sonidos.html` + `sonidos.js` | 12 | banco de voces |
| `editor/editor.css` | 1 | `content: ' · en el disco'` |
| `src/config.js` (`FONDOS`) | 4 | nombres de los fondos: sólo los ofrece el editor |
| `scripts/alchemist.mjs`, `scripts/lib/alchemist-git.mjs`, `vite.config.js` | 66 | mensajes de consola del lanzador y del botón «Subir al juego» |
| `Alchemist.bat`, `Alchemist.command` | ≈70 `echo` | consola |
| **Subtotal Alchemist** | **≈950** | ≈750 claves. Ninguna urge para la beta. |

### 3.4 Total

**≈1 700 fragmentos, ≈1 350 claves**, de las que **≈590 son del juego** y son
las que importan para la beta. De ésas, **≈160 son del multijugador**
(`net/prueba.*`), que es el mayor bloque que no es React.

---

## 4. Trampas para el catálogo

Lo que no se puede mover al catálogo copiando la frase tal cual.

### 4.1 Frases hechas de trozos

- **JSX con teclas o nombres en medio.** `src/ui/Beta.jsx:32-35`,
  `src/ui/Options.jsx:179-188` («Se equipa en la **armería** (tecla X), con la
  Pulse en la tecla Y y el arma especial en la Z»), `src/ui/Controls.jsx:154-166`,
  `src/ui/Lobby.jsx:415` («La lanza el anfitrión (» + nombre + «) cuando haya
  bastantes listos»). Cada una son tres a seis trozos que en inglés o portugués
  cambian de orden. Hace falta un formato con **marcadores y componentes
  dentro** (`{tecla}`, `<kbd>…</kbd>`), no una clave por trozo.
- **Frases unidas con « · ».** `Armoury.jsx` compone casi todas las filas de la
  ficha así (`` `${flojo} ms · fuerte ${fuerte} ms` ``), y `Summary.jsx:90-94`
  arma «N muertes · N disparos · N fallos · N impactos» con condiciones en medio.
  Aguanta como plantilla con parámetros; no aguanta partido.
- **Artículo delante del nombre del arma.** `Options.jsx:180` («con **la**
  Pulse») y `Armoury.jsx:208` («**La** Pulse… **el** Reaper»): el género del
  nombre de un arma es del idioma, no del arma. Mejor frases sin artículo.
- **Concordancia con un valor.** `Armoury.jsx:363` dice `Equipada` (arma) y
  `net/prueba.js:1770` `Equipado` (artículo de la tienda); `engine.js:1679`,
  `${nombre} · lleno`. En el catálogo, una clave por concordancia.

### 4.2 Plurales a mano

Se hacen con `=== 1 ? '' : 's'` o con «(s)», y los dos se rompen en otro idioma:

- **Juego:** `net/lobby.js:364` («Falta/Faltan N jugador/es listo/s»),
  `net/lobby.js:375` («que salga/n»), `net/prueba.js:1213` («N ronda/s»),
  `src/ui/Summary.jsx:90` («**1 muertes**», sin plural ninguno),
  `src/config.js:5818` (`rangoDeJugadores`: «1 jugadores» si `min === max === 1`,
  hoy imposible porque el mínimo es 3).
- **Alchemist:** `editor/editor.js` 1862, 1876, 1885, 3321, 3618, 3640, 3712-3716
  («escalón(es)», «pieza(s)»), 5431, 5432, 5496, 5597 («fichero(s)»), 6272, 6387,
  6769, 6796; `src/maps/formato.js` 847, 864 («salida(s)»).
- La salida es `Intl.PluralRules` (o el plural de ICU en el formato de mensajes):
  español, inglés y portugués tienen las mismas dos formas, así que basta con
  `one`/`other`, pero tiene que estar en el mensaje y no en el código.

### 4.3 Teclas dentro del texto

- **`keyLabel` (`src/keybinds.js:305-345`) es un catálogo en sí mismo**:
  `ESPACIO`, `MAYÚS IZQ`, `CTRL IZQ`, `INTRO`, `RETROCESO`, `CLIC IZQ`,
  `CLIC RUEDA`, `RATÓN 4`, `sin asignar`, `NUM 5`. Y **lo que no está en la
  tabla sale en inglés crudo** (`Tab`, `CapsLock`, `Escape`, `ControlLeft`…),
  así que hoy ya mezcla idiomas. Entra en el catálogo entera.
- **Los que la llaman** (`keysOf`/`_tecla`/`keyLabel`): `engine.js` (8),
  `Controls.jsx` (5), `App.jsx` (4), `Options.jsx` (4), `net/prueba.js` (4),
  `keybinds.js` (3), `Armoury.jsx` (2), `Beta.jsx` (2), `editor.js` (2). Todas
  meten la tecla en una frase: marcador `{tecla}` en el mensaje.
- **Teclas escritas a mano**: `editor/editor.js:3874` («con la E», incumple la
  regla de la vuelta 97), `net/prueba.js:673` (`<kbd>Intro</kbd>`),
  `Beta.jsx:35` y `Hud.jsx:582` (`ESC`, excepción declarada), los atajos de
  Alchemist (`editor.js:7118-7135`: `ESPACIO`, `Mayús`, `Re Pág / Av Pág`,
  `Supr`, `Clic izq.`). Los nombres de tecla de herramienta también se traducen.
- **Tres tablas de controles que dicen lo mismo con palabras distintas**:
  `KEYBINDS[…].label` en `config.js` («Caminar»), `TECLAS_DE_ENTRADA` en
  `App.jsx:91` («andar») y `CONTROLES_DEL_DUELO` en `net/prueba.js:542`
  («Andar sin hacer ruido»). En el catálogo deberían ser **una** clave por
  acción, o se traducirán tres veces y se separarán.

### 4.4 Frases que redacta el servidor

El servidor manda **la frase ya escrita** y el cliente la pinta. Con catálogo,
el servidor tiene que mandar **una clave y sus parámetros**, y es un cambio de
protocolo que toca a los dos huéspedes (Node y el Durable Object).

- **Motivos de `ADIOS`** (el cartel rojo de desconexión):
  `CUENTA_DE_SALA.motivoNoListo` / `motivoSacado` (`config.js:8206-8207`),
  `AFK.motivo` (`config.js:8223`), `'la sala está llena'`
  (`net/servidor.mjs:230` **y** `worker/sala.js:96`), `'este sitio se ha abierto
  en otra ventana'` (`net/servidor.mjs:246`). Y uno al revés:
  `net/cliente.js:1119` manda al servidor `razon: 'el jugador se ha ido'`.
- **El «faltan X» del lobby**: `requisitos().motivo` en `net/lobby.js:356-379`
  («Falta un jugador listo en el equipo azul», «Sois N…», «Hay una partida en
  juego»), con plural y color dentro.
- **La negativa a recoger** (`MSG.RECOGER`, `net/partida.js:2516-2519`): manda
  **códigos** (`lejos`, `pared`) **mezclados con frases** de
  `recogerEnInventario` (`no es un arma`, `sólo N clases`, `src/game/arsenal.js:136,141`),
  y el cliente los pega detrás de «No se puede coger:». Es la primera que hay
  que arreglar, porque además hoy se ve mal en español.
- **El buzón de feedback**: `net/beta.js:128,130` devuelve `error` redactado
  («Demasiados mensajes seguidos…», «El mensaje está vacío.») y
  `src/ui/Beta.jsx:108` lo enseña tal cual.
- **Funciones compartidas que devuelven texto**: `rangoDeJugadores`
  (`config.js:5816`) y `capacidadDeTodos` los usan el lobby, su pantalla y
  Alchemist; `faltasParaPublicar` (`formato.js`) la usan el servidor de
  desarrollo y Alchemist. Lo que corre en Node **no puede importar un catálogo
  de Vite** (`import.meta.glob`, JSON con atributos): el catálogo tiene que ser
  **módulos `.js`**, la misma regla que la vuelta 74 puso a los mapas.

### 4.5 Texto dentro de `innerHTML`

- `net/prueba.js` — 13 sitios: tarjetas de pausa y de votación
  (`<b>RIVAL DESCONECTADO</b>…<small>…</small>`, `:592-604`, `:669-675`), aviso de
  desconexión (`:444-454`), marcador (`:1195-1213`) y artículos de la tienda
  (`:1677-1683`).
- `src/game/captura.js:166` (`<b>Haz clic</b> o pulsa…`),
  `src/ui/actualizacion.js:86` (aviso de versión nueva con dos botones dentro).
- `editor/editor.js` — 43 sitios (fichas completas con `<h3>`, `<label>`,
  `<input>`).
- El traductor no puede ver ni romper el marcado: o el mensaje lleva los
  componentes como marcadores, o el HTML se construye con nodos y el texto va
  por `textContent`. Y lo que se interpole (nombres de jugador) tiene que
  escaparse; hoy los nicks son `VK-07`, pero con cuentas dejará de ser así.

### 4.6 Mayúsculas: por CSS y a mano, las dos

- **79 `text-transform`** (`src/styles.css` 54, `net/prueba.html` 14,
  `editor/editor.css` 7, `src/ui/cabina.css` 4): el catálogo guarda «Listo» y se
  ve «LISTO». Bien para los tres idiomas; y recordar la lección de la vuelta
  106: un banco que lea `innerText` ve la mayúscula de CSS.
- **Y mayúsculas escritas en el texto**: `ABATIDO`, `INVULNERABLE`
  (`Hud.jsx:707,715`), `'LISTO'` (`Lobby.jsx:108`), `PARTIDA GANADA`, `RONDA
  EMPATADA · SE REPITE`, `ESTÁS FUERA POR INACTIVIDAD`, `¿SIGUES AHÍ?`
  (`net/prueba.js`), `RONDA ${n} de ${m}` (mezcla), `ADEMÁS`
  (`Armoury.jsx:223`), y los nombres de tecla. Regla propuesta: **el catálogo en
  minúscula de frase y la mayúscula siempre por CSS**, salvo el énfasis dentro
  de una frase.

### 4.7 Atributos y textos estáticos que se olvidan

- `aria-label` y `title`: `Lobby.jsx:61,82` («Mapas anteriores/siguientes»),
  `Stars.jsx:35` («N de 5 estrellas»), `ScenarioThumbnail.jsx:43` («Plano de…»),
  `weaponSilhouette.js:41`, `fields.jsx:73` («Restablece sólo…»),
  `Controls.jsx:70`, y `title` en `net/prueba.html` y `editor/index.html`.
- **HTML estático**: `net/prueba.html` (55) y `editor/index.html` (395) no pasan
  por JS; necesitan atributos (`data-t="clave"`) y un paso que los rellene al
  cargar, o pasar a construirse desde JS.
- **`<html lang>`**: `index.html`, `editor/*.html` dicen `lang="es"` fijo, y
  `net/prueba.html` **no tiene `<html>`** (empieza en `<meta>`). Tiene que seguir
  al idioma elegido.

### 4.8 Textos que viven en los mapas

`label` y ficha (`card.trains`, `risk`, `replay`) de cada mapa están en
`src/maps/*.js`, **escritos por Alchemist**, y los integrados en `config.js`.
Traducirlos es un campo nuevo en el formato (`label: { es, en, pt }` o una
clave), con la disciplina de la vuelta 83 delante: el saneado es un punto fijo
byte a byte y un mapa sin traducciones tiene que abrirse y guardarse igual.
Alternativa barata: **los nombres de mapa no se traducen** (como los de arma) y
sólo la ficha pasa al catálogo por clave de mapa. Los nombres de zona del Plano
A (`El Largo`, `Los Cajones`…) son datos de rutas; comprobar si alguno llega a
pantalla antes de traducirlos.

### 4.9 Números y fechas

- **41 `toFixed`** en `src/ui/` y `net/prueba.js`: salen con punto decimal. El
  punto es lo de México y Centroamérica; Argentina, Chile y Colombia usan coma, y
  Brasil también. Para neutro se puede dejar el punto (es lo que ya hay y lo que
  espera un jugador de shooters), pero el catálogo debería formatear con
  `Intl.NumberFormat` del idioma elegido.
- `editor/editor.js:5479`: `toLocaleString('es-ES', …)` fijo.

### 4.10 Duplicados que ya existen

El mismo texto en dos sitios, que el catálogo debe unir en una clave:
`sólo N clases` (`arsenal.js:141` y `net/prueba.js:1731`), `siempre contigo`
(`Armoury.jsx:263` y `net/prueba.js:1708`), `no hay nada ahí`
(`Armoury.jsx:719` y `net/prueba.js:1831`), `no en este mapa`
(`Armoury.jsx:355` y `net/prueba.js:1710`), `Pulsa X para recargar`
(`engine.js:2454` y `:4023`), `la sala está llena` (`net/servidor.mjs` y
`worker/sala.js`), y las tres tablas de controles de §4.3. Es la convención de
la vuelta 63 aplicada al texto: la armería del entrenamiento y la tienda del
duelo dicen lo mismo con dos copias.

---

## 5. Orden propuesto

1. **«Coger» → «recoger»** (§1.1) y **los cuatro vosotros y los dos «pincha»**
   del juego (§2.2): es poco, es lo que un jugador de la beta leería como raro o
   vulgar, y se puede hacer ya sin catálogo.
2. **Arreglar la negativa de recoger** (§4.4): hoy dice «No se puede coger:
   lejos».
3. **Glosario** de una página con las decisiones de §2.3 (mouse, presionar,
   caminar, lugar, pretérito simple, diana o blanco, Shift/Enter) antes de
   escribir ni una clave.
4. **Catálogo del juego** (≈590 claves), empezando por `src/ui/` y `config.js`,
   con plurales y marcadores desde el principio; después `net/prueba.*`; y el
   protocolo de motivos con clave (§4.4).
5. **Alchemist** al final, cuando haya alguien más que Yago usándolo.
