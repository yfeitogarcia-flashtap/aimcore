# Propuesta 18 — Español neutro, y un catálogo para el inglés y el portugués

**Estado:** vuelta 108. **Construido: el catálogo** (`src/textos/`) y su banco
(`textos108`), sin que ninguna pantalla lo use, así que la experiencia no cambia.
**Propuesto y sin construir: todo lo demás.** El inventario de lo que hay que
cambiar, fichero a fichero, es el anexo `18-idiomas-inventario.md`.

## 0. La respuesta corta

- **Español neutro como idioma principal.** Tuteo (tú, y ustedes en plural;
  nunca vosotros), «mouse», «hacer clic», «caminar», «lugar», y **nunca
  «coger»**. La auditoría encontró **un solo «coger» que ve el jugador**: «No se
  puede coger: lejos», al fallar una recogida de peana. Encontró además **cuatro
  «vosotros» y dos «pincha»** en «Cómo se juega» y en la sala del multijugador.
  Otros diez «coger» están en Alchemist. El aviso de siempre, «E · Recoger», ya
  estaba bien.
- **Un catálogo por idioma**: `es.js` es la fuente, y `en.js` y `pt-BR.js` caen
  en ella en lo que les falte. Se lee con `t('clave', { hueco })`, y con
  `partes()` cuando dentro de la frase hay algo que no es texto, como la tecla
  del bind en un `<kbd>`. No tiene dependencias, así que lo leen la página, el
  huésped y Alchemist.
- **El catálogo ya tiene 42 claves en neutro**: los paneles de la beta, el aviso
  de la peana, sus motivos de «no se puede», los motivos que manda el servidor y
  los textos de la sala. Eso es exactamente lo obligatorio que ve el jugador. El
  inglés tiene las 42; el portugués, ninguna todavía.
- **El plan son cinco fases.** La primera es corta y va antes de invitar a
  nadie: los siete textos obligatorios, ya en neutro, pasan a leerse del
  catálogo. Después se muda el juego por zonas (unas 590 claves), luego viene el
  selector de idioma, luego el inglés y luego el portugués de Brasil. Alchemist
  va al final: hoy sólo lo usa Yago.
- **«Como en FlickLAB»: no tengo el código de FlickLAB delante.** El formato que
  he elegido es el más común —un módulo por idioma, claves anidadas por pantalla,
  huecos `{nombre}` y plurales `{ one, other }`— y se convierte a JSON o a otra
  sintaxis de huecos en minutos **mientras sean 42 claves**. Con 590, son horas.
  Si FlickLAB usa otra forma, pásamela antes de la fase 2.

## 1. Lo que se construyó en la vuelta 108

`src/textos/index.js`, `es.js`, `en.js` y `pt-BR.js`:

| Pieza | Qué hace |
|---|---|
| `t(clave, vars, idioma?)` | El texto con sus huecos rellenos. Lo que falta en un idioma sale de la fuente, y se anota en `faltas`. Una clave que no existe sale tal cual (`sala.algo`), y un hueco sin valor se queda escrito (`{arma}`): los dos se ven en pantalla y se cazan mirando, en vez de salir vacíos. |
| `partes(clave, vars)` | La misma frase en trozos, con los valores tal cual. React la pinta sin más, y así un `<kbd>` entra por un hueco sin cortar la frase en tres claves. Es lo que resuelve la trampa §4.1 del inventario. |
| Plurales | `{ one: 'Falta {n} jugador', other: 'Faltan {n} jugadores' }`, resueltos con `Intl.PluralRules` de cada idioma. Nunca un `n === 1 ? … : …` escrito a mano: en portugués y en inglés las reglas no son las del español. |
| `idiomaDelNavegador(navigator.languages)` | Cualquier español da `es`, cualquier portugués `pt-BR` (el de Portugal también, antes que caer a español), cualquier inglés `en`, y lo demás, la fuente. |
| `ponerIdioma()` / `idiomaActual()` | El idioma puesto. Uno que no existe cae a la fuente y lo dice. |

**`textos108`** (grupo A de la batería, sin navegador) mide seis cosas:

- ningún idioma tiene claves que no estén en la fuente;
- cada clave lleva los mismos huecos en todos los idiomas;
- un plural es plural en todos;
- **en la fuente no hay ni un «coger»** (con tildes: «cogió» también) **ni un
  «vosotros»**, ni «ordenador», «fichero», «pinchar», «ratón», «vale» o «móvil»;
- la caída a la fuente y los plurales funcionan en los tres idiomas;
- **ninguna pantalla importa el catálogo todavía**, que es la promesa de esta
  vuelta. Esta comprobación se quita en la fase 1, que es cuando la promesa deja
  de ser verdad a propósito.

Imprime además cuántas claves tiene cada idioma: hoy son 42, 42 y 0.

## 2. El glosario: qué es neutro

Se decide **antes** de escribir claves, porque cada decisión se repite cientos de
veces. Las filas marcadas con «?» son de Yago.

| España | Neutro | Nota |
|---|---|---|
| coger (un arma, una peana) | **recoger** | «agarrar» sólo con el cable de una tirolina («agarra el cable») |
| vosotros, pulsad, estéis, queréis, sois | **ustedes**, o impersonal | «que cada uno marque LISTO», «con quienes estén listos» |
| pincha, pinchar | **haz clic, hacer clic** | en Chile «pinchar» es ligar; en México evoca «pinche» |
| ratón | **mouse** | |
| pulsa, pulsar | **presiona** | se entiende igual; «presiona» suena más a Latinoamérica. «Pulsa» se queda donde es el verbo de la tecla en una tabla corta |
| andar | **caminar** | «andar» se entiende, y «caminar» es lo que se dice |
| sitio | **lugar** | |
| fichero | **archivo** | sobre todo en Alchemist |
| ordenador | **PC** | hoy no aparece |
| ha pasado, has ganado | **pasó, ganaste** | el pretérito simple es lo normal en toda Latinoamérica |
| Mayús, Intro, Supr | **Shift, Enter, Supr** | los nombres que trae impresos un teclado latinoamericano. Sale de `keyLabel`, que además ya mezcla idiomas (`Tab`, `CapsLock`): se ordena en la fase 3 |
| diana | **diana** (?) | se entiende (tiro al blanco, dardos). «Blanco» choca con el color. Propuesta: se queda |
| mira telescópica / mirilla | **mira telescópica** | «mirilla» es la de una puerta |
| sólo (adverbio) | **solo** | la RAE quitó la tilde en 2010, y en Latinoamérica se escribe sin ella |

**Lo que no se traduce nunca**: Vektor, FlickLAB, Alchemist, los nombres de las
armas (Pulse, Rift, Titan…) y los de los mapas, que son nombres propios.
«LISTO» sí se traduce (READY, PRONTO): es un botón, no un nombre.

## 3. Las fases

### Fase 1 — Lo obligatorio, antes de invitar a nadie (3–4 h)

Es lo único que **cambia la experiencia** a propósito, y es lo que pediste que
cambiara: el «coger» que ve el jugador, los cuatro «vosotros» y los dos
«pincha». Las siete frases ya están escritas en neutro en el catálogo. La fase es
cambiar cada texto escrito a mano por su `t()`:

1. **La negativa de recoger.** Hoy el servidor manda un código (`lejos`,
   `pared`) o una frase (`no es un arma`, `sólo 2 clases`), y la página lo pega
   detrás de «No se puede coger:». Pasa a mandar **sólo códigos**
   (`lejos`, `pared`, `noEsArma`, `granadas` con su `n`), y la página enseña
   `t('peana.noSePuede.<código>')`.
2. **«Cómo se juega»** (`Beta.jsx`) entero desde el catálogo: es el panel más
   reciente, y el que prueba `partes()` con los `<kbd>` de verdad.
3. **La sala** (`Lobby.jsx`): los tres textos con «vosotros» y los dos con
   «pincha».
4. **El «Sois N…» del servidor** (`net/lobby.js`): manda la clave `sala.noCaben`
   y sus datos (`enSala`, `huecos`, `n`), y la página lo compone.

Se mide con los bancos que ya miran esas pantallas (`beta107`, `lobby101`,
`peanas107red`), cambiando lo que esperan leer, y con `textos108`, sin su última
comprobación.

### Fase 2 — El juego, por zonas (25–35 h)

Unas **590 claves**, en este orden, porque es el orden en que un tester las ve:

1. `src/ui/` y `App.jsx`: menús, entrenamiento, opciones, armería, resumen y HUD
   (unas 300).
2. **`config.js`** (unas 105): los `label` de los ajustes y de las acciones, los
   modos, las dificultades, las ranuras y los subtítulos de las armas. **Los
   datos se quedan en `config.js` y el texto se va**: cada ajuste conserva su
   clave (`sensitivity`) y el rótulo sale de `t('ajuste.sensitivity')`. Es la
   regla de «todo el tuning en `config.js`»: un rótulo no es tuning.
3. **`net/prueba.*`** (unas 145): la tienda, las pausas, el marcador y los
   avisos. **El panel F3 se queda en español**: es un instrumento de medida,
   como la vista de depuración.
4. **Lo que manda el servidor**, con clave y datos: los motivos de `ADIOS`, el
   «faltan X» del lobby y los errores del feedback. Durante **un despliegue**
   viajan las dos cosas (`{ m: 'frase', k: 'motivo.noListo' }`): una pestaña
   abierta con la versión anterior sólo sabe leer `m`, y se recarga sola cuando
   la página lo permite (vuelta 93). En el despliegue siguiente se quita `m`.
5. **Los mapas**: su `label` y su ficha (`card`) son datos del mapa, escritos en
   su fichero. Un mapa gana un bloque opcional `textos: { en: {…}, 'pt-BR': {…} }`
   y, si no lo tiene, sale en español. El saneado lo acota como todo lo demás.

Cada zona que se muda se cierra con una regla que la guarda: **en esa zona no
queda un literal visible**. Esto lo puede medir el extractor de la auditoría
convertido en banco (`sinTextosSueltos`), con una lista de zonas ya mudadas que
crece vuelta a vuelta.

### Fase 3 — El selector de idioma (4–6 h)

- **Un ajuste `idioma`** (`auto`, `es`, `en`, `pt-BR`), en Opciones. `auto` usa
  `idiomaDelNavegador(navigator.languages)`. En la app, WebView2 da el idioma
  de Windows.
- `STORAGE_KEY` **no cambia** (`aimcore.settings.v1`, §3). El saneado acepta la
  clave nueva y el valor de fábrica es `auto`.
- `<html lang>` se pone con el idioma. Hoy `net/prueba.html` ni siquiera lo lleva.
- **Los nombres de las teclas** (`keyLabel`) pasan al catálogo, que es donde se
  ordena la mezcla de hoy (`Mayús` junto a `CapsLock`).
- **El instalador**: `"languages": ["Spanish"]` es el paquete de NSIS de
  España. Hay que ver qué frases trae antes de decidir si añadir `English` y
  `PortugueseBR` con selector de idioma.

### Fase 4 — Inglés (8–12 h + revisión)

Claude hace el borrador a partir de la fuente, y Yago lo revisa leyéndolo en el
juego. **Inglés de Estados Unidos** (*armory*, *color*), que es el que lee la
mayoría del público angloparlante de los shooters. Hay que decidir el glosario
propio: LISTO → *READY*, peana → *weapon stand*, armería → *armory*, fase de
compra → *buy phase*.

### Fase 5 — Portugués de Brasil (8–12 h + revisión nativa)

El borrador lo puede hacer Claude, pero **lo tiene que leer un hablante nativo**,
idealmente un streamer brasileño de la beta: el portugués de un juego tiene su
propio vocabulario (*mira*, *recarregar*, *partida*, *sala*) y un error ahí se
nota más que en ningún otro sitio. Suele ocupar **un 15–25 % más** que el inglés
y algo más que el español, así que hay que revisar cada pantalla (§4).

### Y Alchemist, al final

Unos 950 fragmentos, y los usa sólo Yago. Se muda cuando alguien más lo use,
que es «Alchemist dentro de Vektor» (roadmap, fase 4). Hasta entonces, sus diez
«coger» y sus dos «pincha» se cambian a mano en neutro la próxima vez que se toque
cada ficha. No hace falta una vuelta para eso.

## 4. Cómo se mide que una pantalla aguanta otro idioma

- **Un pseudo-idioma de pruebas** (`xx`), que no se ofrece al jugador. Alarga
  cada texto un 35 % y lo envuelve en `⟦ ⟧`. Así se ven dos cosas en una
  captura: **lo que no está en el catálogo** (sale sin los corchetes) y **lo que
  se desborda** (el texto largo rompe la ficha). Es la disciplina de la vuelta 89
  —«está en pantalla» y «se ve» son dos medidas— aplicada al idioma.
- **Un banco con ese pseudo-idioma** en las cuatro resoluciones de `menu94`, que
  cuenta los textos que se salen de su caja, como hizo `arm95` con las fichas de
  la armería.
- **`textos108`** sigue guardando las claves, los huecos y el neutro de la fuente.

## 5. Riesgos

- **Frases que hoy se arman por trozos.** Un plural a mano («1 muertes», en el
  resumen) o un artículo pegado al nombre («con la Pulse») no se traducen bien
  sin reescribirlos. El inventario tiene la lista (§4.1 y §4.2).
- **Texto dentro de `innerHTML`**: hay 13 sitios en `prueba.js` y 43 en Alchemist.
  Pasar a `textContent` con `partes()` es más trabajo que cambiar la frase, pero
  cierra de paso la puerta al XSS, que la propuesta 14 pide cerrar antes de
  meter nicks de otros en pantalla.
- **Las mayúsculas**: 79 textos las ponen por CSS y otros las llevan escritas.
  Con CSS, el catálogo guarda la frase normal y funciona en los tres idiomas; las
  escritas a mano se reescriben en minúsculas al mudarlas.
- **Que el catálogo se quede atrás.** Mientras haya zonas sin mudar, un texto
  nuevo se escribe a mano **pero ya en neutro**. La regla está en CLAUDE.md.
