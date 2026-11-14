# Propuesta 21 — Modo evento: Vektor en un stand de feria

**Estado:** propuesta, vuelta 109. Sin construir. El encargo pide nueve cosas y
una medida de prudencia —un ensayo de jornada completa antes del evento—, y esta
propuesta las ordena, las dimensiona y dice qué existe ya.

**El montaje:** dos PCs de juego con la app de escritorio, un portátil de admin
que hace de servidor, todo por cable a un router sin internet. Tres días, de
mañana a tarde, mucha rotación de gente.

---

## 0. La respuesta corta

- **Es una página nueva, no un modo del juego.** `/evento/`, con su propia
  pantalla de inicio (apodo → JUGAR → resultado → vuelta sola), y dos páginas más
  servidas por el portátil: `/evento/tele` y `/evento/admin`. Monta **el motor de
  siempre** para las dianas y **el cliente de red de siempre** para el duelo, igual
  que la página del duelo monta el motor desde la vuelta 56. Como en ella no hay
  menú, armería, opciones ni Alchemist, no hay ningún sitio al que ESC pueda
  llevar a nadie.
- **Las reglas del stand viven en el servidor y no en las pantallas**: un módulo
  nuevo, `net/evento.js` (ventanas, ranking, rachas, códigos, premios), que no sabe
  de disco, más uno pequeño que sí sabe (`net/evento-disco.js`). Es la separación
  de la vuelta 47 —la partida pone el mundo, el huésped pone el reloj y el cable—
  aplicada a un evento.
- **Nada se pierde porque nada se sobrescribe**: cada partida, borrado y entrega
  de premio es **una línea añadida** a un registro en el disco del portátil, con
  `fsync`. El estado se reconstruye leyendo el registro al arrancar, así que un
  cierre en seco del servidor cuesta lo que tarda en volver a abrirse.
- **Las dianas puntúan aciertos × precisión²**, que tiene una propiedad que se
  puede demostrar: **un disparo sólo suma si tiene al menos dos tercios de tu
  precisión media de acertar**. Disparar a lo loco resta por construcción, sin
  ninguna regla aparte (§3).
- **Tamaño: entre cinco y siete vueltas** de trabajo, más el ensayo. El corte
  mínimo que ya sostiene un stand (dianas, ranking, códigos, tele, staff y
  guardado) son **tres**; el duelo, el panel del master y la final van detrás (§12).
- **Lo que más riesgo tiene no es el código, es el montaje**: Windows marca una red
  sin internet como *pública* y su cortafuegos bloquea entonces al servidor; la app
  hoy sólo sabe abrir la dirección de Fly; y la tecla de Windows, Alt+Tab y
  Alt+F4 sacan al jugador de la app aunque la página no se entere. Todo eso tiene
  arreglo, pero sólo se descubre montándolo de verdad (§14 y §15).
- **La marca del cliente cuesta poco si se diseña desde el principio** y mucho si
  se retoca después: media vuelta para vestir la capa del evento (pantallas, tele,
  HUD, mapa con sus logos); el juego entero rebautizado no se recomienda (§11).

---

## 1. Lo que existe ya

Más de lo que parece. La lista, con dónde está cada cosa:

| Pieza | Dónde | Estado |
|---|---|---|
| Un servidor que corre en un PC y **sirve el juego** | `net/servidor.mjs`, `npm run host` (vuelta 58) | Hecho. Imprime las IPv4 de red (vuelta 66). |
| Escribir en el disco del servidor | `VEKTOR_DATOS`, `net/beta.js` (vuelta 107) | Hecho para el contador y el buzón. Es el precedente, no el diseño: escribe una vez por minuto y en UTC. |
| La sala con LISTO, cuenta atrás, sacar a alguien e inactividad | `net/lobby.js` (vueltas 101 y 107) | Hecho. Se lanza sola a los 3 s con todos listos. |
| Duelo a rondas | `net/partida.js` (vuelta 62) | Hecho, **con el formato global**: 14 rondas de 180 s (`ROUNDS.maxRondas`, `duracionSegundos`). |
| Arma fija y sin compra | `duelo.sinEconomia` + `dotacion` (vuelta 72), `reglas` Equipadas (`src/game/arsenal.js`, vuelta 106) | Hecho: es lo que hace Los Pilares. Con dotación, la fase de compra se fuerza a cero. |
| Un mapa de duelo simétrico | El Espejo (vuelta 66) | Hecho: 32 u entre salidas, primer contacto a los 3.5 s. |
| Un apodo en la partida | `Partida.entra(…, { nick })` (hasta 16 caracteres) | **A medias**: la partida lo acepta y lo dibuja en la ficha; el lobby pone siempre `VK-NN`. |
| Dianas cronometradas de 30 s | `SESSION_MODES.timed`, sala vacía | Hecho. `onFinish` ya entrega aciertos, disparos, bajas, precisión y duración. |
| El motor con un mapa que no es el del jugador | `new Engine(lienzo, callbacks, { escenario, dianas })` (vueltas 60 y 74) | Hecho. **Los demás ajustes siguen saliendo del store del jugador** (`getSettings()`). |
| HUD y mira fuera de `App.jsx` | `src/ui/duelo.jsx` (vuelta 73) | Hecho: es como el duelo y Alchemist montan los del juego. |
| Soltar y recuperar el ratón | `src/game/captura.js` (vuelta 105) | Hecho. En la app, **ESC es de la ventana** (0.5.0). |
| Recargar la página sólo cuando se puede | `src/ui/actualizacion.js` (vuelta 93) | Hecho, con la condición de cada página. |
| Códigos cortos que no se confunden al dictarlos | `net/codigo.js` (vuelta 47) | Hecho: 27 símbolos, sin O/0, I/L/1, S/5 ni B/8. |
| Los tokens de la interfaz | `src/ui/cabina.css` (vuelta 99) | Hecho. |
| Logos de una marca en un mapa | Estampados (vuelta 93) | Hecho: dos imágenes por mapa, cuatro colocados. |
| El catálogo de textos en español neutro | `src/textos/` (vuelta 108) | Hecho y sin conectar a ninguna pantalla. |
| La app de escritorio | `escritorio/` (vueltas 91–105) | Hecha, **con la dirección de Fly escrita en `tauri.conf.json`** y su capacidad atada a ese origen. |
| Construir el `.exe` sin un Windows delante | `.github/workflows/escritorio.yml` (vuelta 94) | Hecho. |

Y lo que **no** existe, que es el resto del encargo: la pantalla del evento, las
ventanas horarias, la puntuación de las dianas, los rankings, los códigos para
reclamar, los premios, la final, los dos accesos con PIN, la tele, el reenvío
desde un PC sin red, el arranque con doble clic y que la app sepa abrir otra
dirección.

---

## 2. La pantalla de evento (punto 1)

Una página nueva, `/evento/`, que sirve el portátil. Cuatro estados y nada más:

1. **Apodo.** Un campo, el botón **JUGAR** y, encima, qué se juega ahora («DIANAS
   · 30 s» o «DUELO · el ganador se queda») y hasta qué hora. Debajo, pequeño: «¿Ya
   jugaste? Escribe tu código». El campo nace con un apodo propuesto
   (`ROJO-27`) para que nadie tenga que pensar si hay cola.
2. **Partida.** Las dianas o el duelo, con el HUD y la mira del juego (vuelta 63:
   lo que existe no se reescribe).
3. **Resultado.** El puesto **de ahora** («vas 4.º de hoy»), los números de la
   partida y **el código para reclamar el premio**, grande, con «Tómale una foto a
   esta pantalla». Doce segundos y vuelta sola.
4. **Vuelta al apodo**, recargando la página entera (§2.3).

### 2.1 Sin email ni datos personales, y el código hace de identidad

No hay cuentas ni hacen falta: **el apodo es único en todo el evento y el código
es su contraseña**. Si alguien escribe un apodo que ya existe, la pantalla
pregunta «Ese apodo ya está en uso: ¿eres tú? Escribe tu código», y si no, que
elija otro. Con eso salen gratis tres cosas que de otra forma no se pueden hacer:
que el ranking cuente **la mejor partida de cada persona** y no diez filas de la
misma, que la regla de la pareja del duelo sepa quién es quién, y que quien vuelve
al día siguiente siga siendo él.

El código usa el alfabeto de `net/codigo.js`, con cinco símbolos (14 millones de
combinaciones, de sobra para tres días), y **el primero dice qué PC lo dio**. Eso
hace que un PC sin red pueda dar un código válido sin preguntar a nadie (§7).

La pantalla dice «Usa un apodo, no tu nombre», porque **un apodo que es un nombre
real sí es un dato personal**, y va a salir en una tele en mitad de una feria.

### 2.2 ESC nunca saca al jugador de ahí

No hace falta bloquear nada dentro de la página, porque en ella **no hay a dónde
ir**: no importa `App.jsx`, ni la armería, ni las opciones. Lo que hay que decidir
es qué pasa al soltarse el ratón:

- **En las dianas, el reloj sigue.** Hoy, soltar el ratón pausa la sesión
  (`_suspend`), y en un stand eso es un PC parado con alguien que se ha ido.
  Aquí sale «Haz clic para seguir» y los 30 s siguen corriendo: soltar el ratón no
  compra tiempo.
- **En el duelo, lo de siempre**: el mundo no se para por un ESC desde la vuelta
  60, y la inactividad de la 107 echa a quien se va.
- **Y en la app, ESC es de la ventana** (vuelta 105): la página lo recibe como un
  aviso y en el modo evento lo ignora. Hay que comprobar en el ensayo que el
  WebView no suelta el ratón por su cuenta (la vuelta 107 vio que entrega la tecla
  también a la página).

Lo que la página **no** puede impedir es salir **de la app**: la tecla de Windows,
Alt+Tab, Alt+F4 y Ctrl+Alt+Supr. Eso es del montaje (§14).

### 2.3 Una página nueva por jugador

Tras cada resultado, **la página se recarga entera** si el servidor contesta. No es
pereza: es el seguro más barato contra lo que nunca se ha medido, que es el motor
corriendo diez horas seguidas con sesiones encadenadas —memoria, geometrías,
contexto de WebGL—. Cada jugador empieza con una página recién hecha. El clic en
JUGAR es el gesto que piden el audio y la captura del ratón, así que recargar no
cuesta nada a quien juega. Sin servidor, la página no se recarga (no podría
volver) y se reinicia en su sitio.

### 2.4 Los ajustes son de la ventana, no del jugador

Las dianas se juegan con **mapa, arma y ajustes fijos** que manda el servidor con
la ventana. Hoy el motor lee los ajustes del store del jugador, que se guarda en
`localStorage`; en el evento, **el store vive sólo en memoria** y nace con los de
la ventana, pasados por `sanitizeSettings`. Es la regla de la vuelta 60 («el
escenario de una partida no es una preferencia del jugador») extendida a todos los
ajustes, y es una opción del store, no una copia de él.

**La sensibilidad también es fija**, y es una decisión: la misma en los dos PCs y
con el mismo ratón al mismo DPI. Si el master quiere, puede ofrecer tres niveles
(baja, media, alta) en la pantalla del apodo; recomiendo empezar sin elección,
porque en una cola nadie quiere esperar a que el de delante pruebe sensibilidades.

**Tamaño:** la pantalla entera con las dianas es **M** (fila 2 de §12), y dentro
va todo esto: el store en memoria, el «no pausar», la puntuación (§3) y la cola
de reenvío (§7.2).

---

## 3. Las dianas y su puntuación (punto 2)

### 3.1 La ventana de dianas

30 s, **sala vacía, dianas clásicas, tres a la vez, sin movimiento** y la **Pulse**:
semiautomática, sin peso y sin retroceso que aprender. El arma ya acota el disparo
a lo loco, porque cada disparo es un clic. Todo eso lo fija el master por ventana,
y lo de arriba es lo que recomiendo de partida.

**Y las dianas salen de una semilla.** Hoy se sortean con `Math.random`
(`src/game/targets.js`). Con una semilla por partida, la final puede dar a los dos
finalistas **exactamente las mismas dianas** (§6). En el ranking normal, cada
partida lleva una semilla distinta, para que nadie se aprenda la secuencia a base
de jugar.

### 3.2 La puntuación

**Puntos = 100 × aciertos × precisión²**, donde precisión = aciertos / disparos.

| Jugador | Aciertos | Disparos | Precisión | Puntos |
|---|---|---|---|---|
| Rápido y preciso | 45 | 55 | 82 % | **3 012** |
| Cuidadoso | 36 | 40 | 90 % | 2 916 |
| Lento y perfecto | 25 | 25 | 100 % | 2 500 |
| A lo loco | 50 | 120 | 42 % | 868 |

Por qué esta y no «+100 por acierto, −50 por fallo», que se explica mejor:

- **Con la resta fija, disparar a ciegas sale a cuenta** en cuanto aciertas uno de
  cada tres (100·⅓ − 50·⅔ = 0). En un Gridshot con tres dianas, un disparo rápido
  sin apuntar acierta bastante más que eso.
- **Con la precisión al cuadrado, el umbral se calibra solo**: un disparo suma
  sólo si su probabilidad de acertar es al menos **⅔ de tu precisión media**
  (con P = 100·A³/D², un disparo que acierta con probabilidad q suma
  q·300·A²/D² y resta 200·A³/D³, y eso sólo es positivo si q > ⅔·A/D). Quien
  va al 90 % no puede permitirse un tiro al 55 %; quien va al 50 % tampoco gana
  nada disparando al 30 %. No hay un número que el jugador pueda aprenderse para
  engañar a la fórmula, porque el número es él mismo.
- **Y tampoco premia ir despacio**: el que acierta mucho y bien gana al que
  acierta todo y poco, que es lo que dice la primera fila de la tabla.

Desempate: más precisión; si sigue, quien lo hizo antes. En la pantalla del
resultado se ve la cuenta entera («45 aciertos · 82 % · 3 012 puntos») y una línea
que lo dice para quien se pregunte: «Cada acierto vale más cuanto mejor apuntas».

Las estrellas de `scoring.js` no sirven aquí y no se tocan: puntúan cumplir el
objetivo del explosivo, no una ronda de dianas.

**Tamaño:** dentro de la fila 2 de §12, semilla incluida.

---

## 4. El duelo exprés (punto 2)

Entre los dos PCs, en **una sola sala fija** del servidor del stand. **El ganador
se queda**: el PC del que pierde vuelve al apodo para el siguiente, y el del que
gana se queda con su nombre y «Esperando rival · racha 2». En cuanto el retador
pulsa JUGAR, la partida se lanza sola, porque los dos están listos: es la regla de
la vuelta 107 (3 s con todos listos), sin cuenta de 45 s de por medio.

### 4.1 El formato

Lo que propongo de partida, todo configurable por el master:

- **El primero en ganar dos rondas** (tres como mucho), **45 s por ronda**.
  Impar a propósito: la vuelta 62 puso 14 rondas, un número par, **para que
  exista la prórroga**; aquí lo que se quiere es lo contrario.
- **El Espejo**, con **reparto fijo**: Rift y chaleco, sin casco. Es lo que ya
  hace un mapa con `sinEconomia` y `dotacion`, y la fase de compra se pone a cero
  sola. Una variante del mapa para el evento (con los logos del cliente, §11) es
  trabajo de Alchemist, no de motor.
- **Gracia de inicio de ronda de 1 s**, que el mapa ya sabe declarar
  (`duelo.invulnerabilidadMs`, vuelta 78).
- **Al acabar el tiempo de una ronda**, gana quien más vida conserve (la regla de
  siempre). Si los dos siguen con 100 —nadie ha dado a nadie—, la ronda se repite
  **una vez**, y la siguiente es **a la primera baja, sin reloj**: con gente que no
  ha jugado nunca, «se repite» puede no acabar.

Un duelo dura así unos dos minutos con la entrada y la salida.

### 4.2 Lo que falta en el servidor

- **El formato por sala.** `ROUNDS.maxRondas` y `duracionSegundos` son globales.
  Pasan a ser de la partida, con los de `ROUNDS` como valor por defecto, igual que
  `configurarCompra` ya hace con la fase de compra. Lo usa también el lobby de
  siempre, que podrá ofrecer «partida corta».
- **El lobby en modo evento**: sala fija (el código lo pone el servidor, no se
  teclea), mapa y modo fijos, sin anfitrión que lance (se lanza solo) y **con el
  apodo libre** en vez de `VK-NN`.
- **Un aviso al acabar** (`alTerminar`), hermano del `alLanzar` que ya existe, con
  quién ganó a quién: es lo que `evento.js` anota.

### 4.3 La racha y la pareja

**Racha** = victorias seguidas sin levantarse. **La mejor racha del día** es la
que cuenta para el ranking. Y la regla del encargo, escrita para que no tenga
huecos:

> Una victoria contra **el mismo rival que la victoria anterior** no suma a la
> racha, **pero tampoco la rompe**.

O sea que si A gana a B, B vuelve a retarle y A le vuelve a ganar, A sigue con la
racha que llevaba. Lo que sí la rompe: perder, que se cierre la ventana, o
retirarse. «Mismo rival» se decide por el apodo, que es único (§2.1).

Lo que **no** se puede cerrar del todo sin identificar a nadie, y conviene decirlo:
dos amigos alternando apodos nuevos podrían inflarse una racha. El staff puede
borrar entradas (§8), y el ranking de duelo enseña la racha con los rivales al
lado, que es lo que hace que se note.

Y una cosa que no es de código: **el campeón puede levantarse sin decir nada** y
que se siente otro en su PC. La pantalla de espera tiene **Me retiro** y, si pasan
dos minutos sin rival, la racha se cierra sola (la del día queda guardada). Lo
demás es del staff.

**Tamaño: M** (fila 5 de §12), entre el formato por sala, el lobby de evento y la
racha.

---

## 5. Las ventanas horarias (punto 2)

El master define cada día una lista de ventanas: **inicio, fin y qué se juega**
(dianas, duelo, pausa o final). La hora la pone **el reloj del portátil**, que es
el único del stand; las pantallas reciben la diferencia con el suyo y la corrigen.

- **La tele avisa a los 5 min, a 1 min y en los últimos 10 s**, y los PCs ponen
  una franja arriba en el último minuto.
- **No se empieza lo que no va a acabar**: con menos de 35 s de ventana, una
  partida de dianas no arranca, y con menos de 3 min un duelo tampoco. La pantalla
  dice «Siguiente: DUELO a las 12:30». Con eso, cortar una partida a medias pasa
  muy pocas veces.
- **Y cuando pasa, la partida termina y no cuenta.** Un duelo cortado no suma ni
  resta, y la racha se cierra con lo que llevaba (la mejor del día ya está
  guardada).

**Sin internet no hay hora de red**: el portátil arranca con la hora que tenga. La
pantalla de admin la enseña en grande al abrir el día, y abrirlo pide confirmarla.

**Tamaño:** dentro de la fila 1 de §12; la edición de ventanas está en el panel
del master (§8).

---

## 6. Rankings, premios y final (puntos 3 y 4)

### 6.1 El ranking

Uno por modo y por día. **Dianas**: la mejor puntuación de cada persona. **Duelo**:
la mejor racha de cada persona, con desempate a quien la consiguió antes.

**El día lo abre y lo cierra el staff, no el calendario.** `net/beta.js` agrupa por
fecha UTC, y para un evento eso no vale: lo que el staff entiende por «el día» es
lo que pasa entre abrir y cerrar. Cerrar **congela** el ranking: lo que llegue
después (un PC que reenvía tarde, §7) queda anotado como «fuera de plazo» y lo ve
el staff, pero no lo mueve.

### 6.2 Los premios

Por modo y configurables: una lista de puestos con su premio («1.º: mouse»,
«2.º y 3.º: alfombrilla»), **uno para quien gane la final** (§6.3) y una opción
de **un premio por persona y día**, por si la misma persona gana en los dos modos. Al cerrar el día, el staff ve la lista con
puesto, apodo, código, premio y una casilla de **Entregado**. La persona enseña su
código (la foto de la pantalla) y el staff la marca.

**La tele nunca enseña códigos**, sólo apodos: el código es lo que separa a quien
ganó de quien lo vio en la tele.

### 6.3 La final

Al final del día, con los rankings congelados: **el 1.º de dianas contra el 1.º de
duelo**, y si son la misma persona, entra el 2.º de duelo. **Al mejor de tres**:

1. **Dianas**: los dos a la vez, cada uno en un PC, **con la misma semilla**, o sea
   las mismas dianas en el mismo orden. Gana la puntuación; desempate por
   precisión; si sigue, se repite.
2. **Duelo**: un duelo exprés como los del día.
3. **Si van 1-1, muerte súbita**: una ronda de 60 s; gana la primera baja, y si
   nadie cae, quien más vida conserve; con empate exacto, otra.

La lanza el master desde el panel y los PCs pasan a la pantalla de la final, con
los dos nombres. **Si un finalista no está**, el staff pulsa «No está» y entra el
siguiente del mismo ranking. La tele pone la final a pantalla completa.

**Tamaño:** el ranking y los premios van en la fila 1 de §12; la final es **S**
(fila 7), porque a esas alturas orquesta piezas que ya existen.

---

## 7. Guardado y reenvío (punto 5)

### 7.1 En el portátil

Una carpeta, por ejemplo `C:\VektorStand\datos\`, con dos ficheros:

- **`registro.jsonl`**: una línea por cada cosa que pasa —partida, borrado,
  entrega de premio, abrir o cerrar el día, cambio de ventanas—, **añadida y con
  `fsync`** antes de contestar al PC. Nunca se reescribe: borrar una entrada es
  añadir una línea que dice «ésta no cuenta», así que **un borrado se puede
  deshacer** (el staff se equivoca, y a las siete de la tarde más).
- **`stand.json`**: la configuración (ventanas, premios, reglas y los PIN ya
  cifrados), escrita con el truco de siempre para no dejar un fichero a medias:
  primero un temporal y luego cambiarle el nombre.

Al arrancar, el servidor **lee el registro de arriba abajo y reconstruye todo**.
Por eso un cierre en seco cuesta lo que tarda en abrirse otra vez. Tres días de
partidas son unas tres mil líneas, o sea nada.

**Al cerrar el día**, una copia en `copias\AAAA-MM-DD\`: el registro de ese día,
los dos rankings y la lista de premios en CSV (que se abren en Excel), **y la
misma copia en el USB si está puesto**. Si no está, o no se puede escribir, el
panel lo dice en rojo: la regla de la vuelta 60 («si no se puede guardar, se
dice»). Recomiendo además **una copia al USB cada hora**, que es lo que salva el
caso de que el portátil muera a mitad de la tarde.

### 7.2 En los PCs

**Las dianas no necesitan red para jugarse**: la página ya está cargada y el motor
corre en el PC. El resultado se guarda en una cola local con un **identificador
único**, se manda y **se borra de la cola cuando el servidor lo confirma**. Si no
hay red, se reintenta cada pocos segundos; el servidor descarta lo que ya tiene
(por el identificador), así que reenviar dos veces no duplica nada.

Sin red, el resultado dice **«Puesto: se sabrá en cuanto vuelva la conexión»** y
**sí da el código**, porque lleva la letra del PC delante y no puede chocar con el
del otro (§2.1). El panel del staff enseña «PC 2 sin conexión desde las 14:03» y
cuántas partidas tiene pendientes.

**El duelo sí necesita red**, y ahí está lo que ya hay: si un PC se cae a mitad, la
partida se pausa y le guarda la butaca (vuelta 62). En el evento, ese margen se
acorta a 30 s y, pasado, el duelo se anula sin contar.

**Y nadie de fuera puede mandar resultados**: cada PC lleva una clave suya en su
configuración y el servidor rechaza lo que llegue sin ella. Es poco, pero en una
red sin internet y por cable es suficiente; si el router tiene wifi, **se apaga**.

**Tamaño:** repartido entre las filas 1 (el registro) y 2 (la cola) de §12.

---

## 8. Master y staff (punto 6)

`/evento/admin`, desde el navegador del portátil. Dos PIN distintos, guardados
cifrados (`scrypt`) en `stand.json`, con cinco intentos fallidos = un minuto
bloqueado, y la sesión que se cierra sola a los diez minutos sin tocar nada.

- **Master**: las ventanas de cada día, las reglas de cada modo (mapa, arma,
  ajustes de las dianas, formato del duelo), los premios, el PIN del staff y lanzar
  la final.
- **Staff**: abrir y cerrar el día, buscar por apodo o código, **borrar una
  entrada** (con confirmación, y deshacer), **marcar un premio como entregado**,
  **exportar la copia** ahora mismo, cerrar una racha y «No está» en la final. Y,
  arriba, el estado del stand: los dos PCs (conectado, sin conexión, pendientes),
  la hora del portátil y si el USB está puesto.

Para no bloquear lo demás, **las ventanas, las reglas y los premios pueden empezar
siendo un fichero** (`stand.json` escrito a mano) y el panel del master llegar
después. El del staff no: lo usan personas que no van a abrir un JSON a las seis
de la tarde con cola.

Y un riesgo que no es técnico: **los apodos ofensivos salen en la tele**. Un
filtro de palabras en español e inglés corta los obvios; lo demás lo borra el
staff, y por eso borrar está a dos clics.

**Tamaño:** el del staff va con la tele en la fila 3 de §12 (**M**); el del master
es **S** (fila 6).

---

## 9. La tele (punto 7)

`/evento/tele`, a pantalla completa en el navegador del portátil, con la tele como
segunda pantalla. Tres zonas y nada más:

- **Arriba, la ventana activa** en grande: «DIANAS · hasta las 12:30», con la
  cuenta atrás de lo que queda, y debajo **la siguiente**.
- **En el centro, el ranking del modo activo**, diez filas como mucho: puesto,
  apodo y puntos (o racha). En duelo, además, **«Rey de la pista: Pepe · racha 3»**
  y el marcador del duelo en curso.
- **Abajo, los premios del día** y la hora de la final.

**Legible desde lejos** quiere decir números: en una tele de 55" a 1080 px, la
letra más pequeña de la pantalla no baja de **48 px** y la del ranking va a 72, con
los tokens de Cabina en su escala más alta y sin grises sobre gris. Y se comprueba
como manda la vuelta 89 —«está en pantalla» y «se ve» son dos medidas distintas—:
**leyéndola desde el pasillo en el ensayo**, no en el código.

Los avisos de cambio de ventana ocupan media pantalla en el último minuto. La tele
recibe los cambios por el mismo WebSocket del servidor, sin sondear.

**Tamaño:** con el panel del staff en la fila 3 de §12.

---

## 10. El servidor del stand y la app (punto 8)

### 10.1 Doble clic

Un `Stand.bat` en la raíz, hermano de `Alchemist.bat`, que **no hace nada que
necesite internet**: ni `git`, ni `npm install`, ni construir. El build va hecho
de casa (§13). Arranca `node net/servidor.mjs` con el modo evento y su carpeta de
datos, y antes **comprueba y lo dice en verde o en rojo**:

- que Node está instalado, y con él las dependencias del servidor (`ws`), que
  también se dejan puestas desde casa;
- que el portátil tiene la dirección fija que se espera;
- que el cortafuegos deja entrar al puerto del juego;
- que la carpeta de datos se puede escribir y el USB está (o no);
- que `dist/` es el build del evento (la huella que ya publica `/salud`);
- y abre el panel de admin y la tele.

Si el servidor se cae, el `.bat` lo vuelve a lanzar solo: el estado sale del
registro (§7.1).

### 10.2 La dirección que no cambia

**Dirección fija en los tres equipos**, no sólo en el portátil (por ejemplo
`192.168.50.10` el portátil y `.11` y `.12` los PCs, con el router en `.1` y su
DHCP fuera de ese tramo). Así el router no hace de nada más que de cable: **si se
rompe, cualquier switch lo sustituye** sin tocar nada, y un portátil de repuesto con
la misma dirección y una copia del registro **lo sustituye sin tocar los PCs**.

### 10.3 Que la app abra el stand

Hoy la app abre `https://ancient-violet-678.fly.dev/` porque está escrito en
`tauri.conf.json`, y su capacidad sólo existe para ese origen. Lo que propongo:

- **Un fichero `stand.txt`** junto al `ventana.txt` de siempre (la carpeta de
  configuración de la app), con la dirección del stand y el número de PC. Si
  existe, la app abre esa dirección; si no, la de siempre. **Sólo admite
  direcciones de red local** (192.168.x.x, 10.x.x.x, 172.16–31.x.x): un fichero no
  puede convertir la app en un navegador de cualquier sitio.
- **Lo que pierde con otro origen está medido de antemano**, y es poco: la marca
  que dice «estoy en la app», F11 y ESC son nativos y no dependen del origen
  (vuelta 98). Lo que cuelga de la capacidad es **Salir**, que en el evento no
  existe. Aun así, conviene añadir a la capacidad un patrón con las direcciones de red
  local, si Tauri lo admite como se espera (se comprueba al construirlo).
- **En modo stand la ventana nace a pantalla completa y no se cierra con Alt+F4**:
  pide un atajo de staff. Y si el servidor no contesta al arrancar, enseña «Buscando
  el servidor del stand…» y reintenta, en vez de la página de error del WebView.
  El orden de encendido de la mañana deja de importar.

Es una versión nueva del `.exe` (la 0.6.0) por el workflow de siempre. Encaja con
la propuesta 19, que ya prevé dos instalaciones de la app desde el mismo workflow
(«Vektor» y «Vektor Pruebas»): una tercera, o un fichero en la de siempre, es la
misma idea.

**Tamaño: S** entre el `.bat` y la app (fila 4 de §12), más **una tarde de
montaje** que no es código (§14).

---

## 11. La marca del cliente (punto 9)

La pregunta es cuánto cuesta ocultar Vektor y FlickLAB y vestirlo con la marca de
otro. Depende de **cuánto del juego** se quiera vestir, y la respuesta cambia mucho
según la capa:

| Capa | Qué se cambia | Coste |
|---|---|---|
| **Las pantallas del evento** (apodo, resultado, tele, admin) | Nombre, logo y dos colores de acento desde un fichero de tema. Son pantallas nuevas: se escriben ya con la marca intercambiable. | **S**, si se hace desde el principio |
| **Lo que se ve jugando** | La marca de Vektor del HUD, el título de la página y el favicon. Son pocos sitios. | **S** |
| **El mapa** | Una copia de El Espejo y de la sala de las dianas con los logos del cliente en estampados, que existen desde la vuelta 93. | **S**, y es trabajo de Alchemist |
| **La app** | Nombre e icono del `.exe`. En el stand **nadie los ve**: la ventana va a pantalla completa y la instalamos nosotros. | **S**, y no hace falta |
| **Los colores del juego** | No se tocan. Naranja es una diana, verde es la acción, rojo es que te disparan (vueltas 37–67); cambiarlos por los del cliente es cambiar lo que el jugador lee, y volver a medirlos en CIELAB. | **M**, y no se recomienda |
| **El juego entero** (menús, Cabina, armería, Alchemist) | Todo el texto y todos los logos. | **L**, y no se recomienda |

**O sea: «el stand con la marca del cliente» cuesta media vuelta si se diseña
desde el principio**, porque las pantallas son nuevas y el resto son pocos sitios.
Retocarlo después, M. Rebautizar el juego, no.

Tres cosas a tener en cuenta:

- **Un logo de cliente es un asset externo**, y eso ya tiene su sitio: la excepción
  de los estampados (vuelta 93) —«no es del juego, es de un mapa»— vale igual para
  «no es del juego, es de un evento». Va en el fichero de tema del evento y no
  entra en el build del juego.
- **Si el color de la marca es naranja, verde o rojo**, se usa sólo en el marco de
  las pantallas del evento, nunca en el mundo.
- **Recomiendo no ocultar del todo el «hecho con Vektor»**: una línea pequeña en la
  tele y en el resultado. Es la única publicidad que el stand le hace al juego.

Y lo que no puedo darte es el **precio de venta**: no tengo datos del mercado de
activaciones de marca. Lo que sí sale de aquí es la estructura (§16).

---

## 12. El orden, con lo que cuesta cada parte

Escala: **S** = hasta media vuelta, **M** = una vuelta, **L** = dos o más.

| # | Parte | Tamaño | Depende de |
|---|---|---|---|
| 0 | El límite de Chrome al capturar el ratón (§14, `decisions.md` §109.8). No es del evento, pero el evento lo pisa. | **S** | — |
| 1 | `net/evento.js` + `evento-disco.js`: registro, reconstrucción, ventanas, ranking de dianas, códigos, cierre de día y copia. Con sus bancos sin navegador. | **M** | — |
| 2 | La pantalla de evento con las dianas: store en memoria, no pausar, semilla, puntuación, resultado, cola de reenvío y recarga por jugador. | **M** | 1 |
| 3 | La tele y el panel del **staff**, con las ventanas todavía en `stand.json`. | **M** | 1 |
| 4 | `Stand.bat` y la app en modo stand (0.6.0). **Primer ensayo en el hardware de verdad.** | **S** | 2 |
| — | ***Aquí ya se puede montar un stand de dianas***: ranking, códigos, premios, tele, staff y guardado. | | |
| 5 | El duelo exprés: formato por sala, lobby de evento, apodo libre, ganador se queda, racha y pareja. | **M** | 1, 2 |
| 6 | El panel del **master**: ventanas, reglas y premios desde la pantalla. | **S** | 3 |
| 7 | La final del día. | **S** | 5 |
| 8 | La marca del cliente, si hay cliente. | **S** | 2, 3 |
| 9 | Ensayo de jornada completa (§13) y lo que salga de él. | **S** + lo que salga | todo |

Total: **entre cinco y siete vueltas**, más el ensayo. Tres razones para este orden:

- **Los datos primero.** Lo único que no tiene arreglo a las siete de la tarde es
  haber perdido el ranking del día. Por eso el registro y su banco van antes que
  ninguna pantalla.
- **El corte de la fila 4 es un stand entero.** Si el calendario aprieta, un stand
  de dianas con ranking y premios ya es el evento, y el duelo se añade cuando esté.
- **El hardware de verdad cuanto antes.** Los riesgos gordos (§14) son del montaje,
  y descubrirlos en la vuelta 4 deja tres vueltas para arreglarlos.

---

## 13. El ensayo de jornada completa

Tres ensayos, de menos a más, y el último con el horario de la feria.

### 13.1 En la mesa, sin hardware (dentro de la batería)

Un banco nuevo, **`jornada21`**, sin navegador: el servidor del stand de verdad y
dos clientes simulados que juegan partidas sintéticas sin parar, **con el reloj del
servidor adelantado a mano**, como ya hacen `cuenta107` y `afk107`. Así una jornada
de diez horas, con sus ventanas de verdad, se pasa en segundos, muy por debajo de
los ocho minutos que la batería le da como mucho a un banco. En medio:

- se mata el proceso del servidor en seco (`kill -9`) a mitad de una partida, y se
  vuelve a lanzar;
- un cliente se queda sin red cinco minutos (de ese reloj) y luego reenvía su cola;
- el mismo resultado llega tres veces;
- se borra una entrada y se deshace;
- se cierra el día y se abre el siguiente.

Lo que tiene que dar, y con su denominador delante (vuelta 46): **cero partidas
perdidas y cero duplicadas** de N jugadas, rankings idénticos a recalcularlos desde
cero, la racha y la pareja bien contadas en cada caso, y **la copia del día igual
byte a byte** a la que sale de reconstruir el registro.

### 13.2 En el hardware, dos horas

El montaje entero **desde la caja y con la guía en la mano**, cronometrado: cables,
direcciones fijas, cortafuegos, doble clic, la app encontrando el servidor. Y una
lista que se marca a mano:

- la tecla de Windows, Alt+Tab, Alt+F4, F11 y ESC en los dos PCs;
- ESC a mitad de unas dianas: el reloj sigue y un clic vuelve;
- la tele **leída desde el pasillo**, a la distancia a la que pasará la gente;
- los dos PIN, y que el staff no pueda tocar lo del master;
- apagar el router con un duelo en marcha;
- y montar en el portátil de repuesto con la copia del USB.

### 13.3 La jornada completa

**Un día entero con el horario de la feria** (por ejemplo, de 10:00 a 20:00), con
las ventanas de verdad y sin tocar nada entre medias salvo lo previsto. Para que
haya juego todo el día sin diez personas delante, la página del evento lleva un
**jugador automático** que sólo se enciende con un parámetro de ensayo: apunta a la
diana más cercana con un error aleatorio y dispara, como ya hacen los bancos. Así
cada PC juega **unas 600 partidas en el día**, más de las que jugará la feria, y
se ve lo que en un banco de dos minutos no se ve: memoria que crece, temperaturas
y FPS a las seis de la tarde.

Y personas de verdad en dos turnos (con una hora basta), para medir **cuánto
tarda cada una** de la cola a la vuelta al apodo, que es lo que decide cuánta gente
pasa por el stand.

**Incidentes con hora**, apuntados en una hoja con lo que tardó cada recuperación:

| Hora | Incidente | Lo que tiene que pasar |
|---|---|---|
| 11:30 | Desenchufar el cable del PC 2 durante 2 min, a mitad de unas dianas | La partida acaba, el código sale, la cola se reenvía al volver |
| 13:00 | Apagar el router 1 min con un duelo en marcha | El duelo se anula sin contar; los dos PCs vuelven solos |
| 15:00 | Cerrar el servidor desde el administrador de tareas | El `.bat` lo relanza; nada perdido |
| 16:30 | Apagar un PC con el botón | Arranca, la app abre sola el stand |
| 17:00 | Cambiar las ventanas de la tarde desde el panel | La tele avisa y los PCs obedecen |
| 18:00 | Un apodo ofensivo: borrarlo; entregar tres premios | Dos clics cada cosa |
| 19:30 | La final, con un finalista que «no está» | Entra el siguiente |
| 20:00 | Cerrar el día y sacar la copia | La copia está en el disco y en el USB |
| Al día siguiente, 10:00 | Encender todo en frío y abrir el día 2 | En menos de diez minutos, con el día 1 congelado y entero |

Lo que se apunta cada hora: memoria de la app en los dos PCs, FPS, temperatura,
partidas jugadas, pendientes de envío. **El ensayo se da por bueno con cero
partidas perdidas, cero duplicadas y ninguna recuperación que haya pedido tocar un
PC.**

Y lo que se congela al acabar: **la versión del evento** (una etiqueta de git y su
`dist/` en el portátil). Nada se actualiza durante los tres días. La página tiene
el vigilante de actualizaciones de la vuelta 93; en el evento sólo recargaría en la
pantalla del apodo, pero lo correcto es que no haya nada que recargar.

---

## 14. Riesgos para tres jornadas con público

Ordenados por lo que costarían si pasan, con lo que los cubre.

**Del montaje**

- **El cortafuegos de Windows.** Una red sin internet sale como «red no
  identificada», o sea **pública**, y la regla que Windows crea la primera vez que
  se abre Node suele ser sólo para redes privadas: los PCs no llegan al servidor
  **sin un error en ninguna pantalla**. Cubre: poner la red como privada y una
  regla de entrada para el puerto, las dos en la guía; el `.bat` lo comprueba.
- **Salir de la app.** Tecla de Windows, Alt+Tab, Alt+F4, las notificaciones y los
  overlays (los de NVIDIA, Steam o Discord) sacan al jugador sin que la página
  pueda hacer nada. Cubre: un usuario de Windows sólo para el evento, con inicio de
  sesión automático y la app al arrancar; la tecla de Windows desactivada por
  directiva; «No molestar» todo el día; overlays desinstalados; Alt+F4 bloqueado en
  la app (§10.3). **Ctrl+Alt+Supr no se puede bloquear**: es del staff mirar.
- **La luz.** Un corte de un segundo apaga el router y los PCs (el portátil tiene
  batería). Cubre: un SAI pequeño para el router; en los PCs, la BIOS en «encender
  al volver la corriente», inicio automático y la app al arrancar, o sea
  recuperación sola en un minuto.
- **La hora del portátil.** Sin internet no se corrige sola, y las ventanas cuelgan
  de ella. Cubre: el panel la enseña al abrir el día y pide confirmarla.
- **Windows Update y el reposo.** Desconectado no actualiza, pero si alguien
  conecta un PC al wifi del recinto, sí. Cubre: actualizaciones pausadas, reposo y
  salvapantallas apagados, la tapa del portátil sin efecto.

**De los datos**

- **Perder el ranking.** Cubre: registro añadido con `fsync` (§7.1), copia al USB
  cada hora y al cerrar, y el portátil de repuesto.
- **El disco lleno o el USB que no está.** Cubre: el panel lo dice en rojo.
- **El staff borra lo que no era.** Cubre: borrar es reversible.

**Del juego**

- **Diez horas sin recargar.** Nadie ha medido el motor tanto tiempo. Cubre: una
  página nueva por jugador (§2.3) y las 600 partidas del ensayo.
- **El ratón y ESC.** La regla de Chrome sobre el gesto (vuelta 105) se resolvió en
  la app haciendo ESC de la ventana; el modo evento lo apoya en no pausar y en «Haz
  clic para seguir». Va en la lista del ensayo.

  **Y hay una regla nueva de Chrome que pide arreglo antes del evento**, medida al
  pasar la batería de esta vuelta: Chromium 153 rechaza `requestPointerLock` con
  «Too many pointer lock requests in a short window of time» a partir de unas
  **cinco peticiones en cinco segundos**, y no vuelve a admitir hasta pasados 3 o 4
  s sin pedir. Nuestro reintento cada 250 ms (`src/game/captura.js`, vuelta 105)
  **gasta ese cupo sin conseguir nada**. Un visitante que aporree menús lo pisa, y el
  WebView2 de la app es Chromium y lo tendrá en cuanto se actualice. Es
  `docs/decisions.md` §109.8, y es la primera cosa que hay que construir, antes que
  el propio modo evento.
- **Que los dos PCs no sean iguales.** Distinto ratón, DPI, monitor o aceleración
  del puntero de Windows es una ventaja para uno de los dos, y en una final con
  premio es una reclamación. Cubre: el mismo modelo de todo y la aceleración
  apagada, comprobado en el ensayo.

**De la gente**

- **Cola y ritmo.** Unos 70 s por persona en las dianas da como mucho unas **cien
  personas por hora** con los dos PCs. Si hay más, la cola se gestiona en el stand,
  no en el software: lo que sí ayuda es el apodo propuesto (§2) y que el resultado
  vuelva solo.
- **Apodos ofensivos en la tele.** Cubre: filtro y borrar a dos clics (§8).
- **El campeón que se levanta sin decir nada** (§4.3).
- **Lo legal, y no es mi terreno**: unas **bases del concurso** a la vista
  (cómo se puntúa, cómo se reclama, qué pasa con los empates), qué hacer con
  **menores** (en una feria habrá, y el juego es de disparos aunque sea abstracto:
  pregúntalo a la organización) y **qué se hace con los apodos al acabar**. Sin
  emails no hay base de datos de personas, pero un apodo puede ser un nombre real.
  Mi recomendación: borrar los apodos de la copia cuando se hayan entregado los
  premios y quedarse con las cifras. Que lo revise quien lleve lo legal.

---

## 15. Cómo encaja con lo que ya está escrito

- **Con la fase 4 de la propuesta 11** (lobby de evento para LAN): aquello pensaba
  en una sala LAN donde varios PCs se retan entre sí; esto es un stand con dos PCs
  y un formato cerrado. Se dan la mano en lo de fondo —el servidor corre en la sala,
  no hay descubrimiento automático, nada de esto se despliega en Fly— y esta
  propuesta no necesita la lista de jugadores de aquella.
- **Con la regla de la vuelta 47** (no hay registro de salas): no se toca. Hay **una
  sala fija** que pone el servidor del stand, y el modo evento **no existe en el
  despliegue**: se enciende con una variable del huésped, como `VEKTOR_LOBBY`.
- **Con las propuestas 07 y 14** (cuentas): no hay cuentas. La persistencia es del
  portátil y del evento, sin datos de nadie, y muere con la copia. Es lo contrario
  de «un servicio con datos de personas que sobrevive a la sala», que es lo que
  aquellas propuestas dicen que cuesta mantener.
- **Con la regla de las vueltas 60 y 74** (el escenario de una partida no es una
  preferencia del jugador): se amplía a todos los ajustes con el store en memoria
  (§2.4).
- **Con «Sin assets externos»**: el logo de un cliente entra por la puerta de los
  estampados y del fichero de tema del evento, no del juego (§11).

---

## 16. Y la monetización

El encargo trae el bloque de siempre: **el juego es 100 % gratis**, y sobre la
mesa hay cosméticos de forma o efectos (nunca de color), mapas patrocinados por
marcas, activaciones creativas en Alchemist con escuelas de diseño de videojuegos,
pase de temporada y membresía de comunidad. La cuota para jugar está descartada.

El modo evento **no toca el juego gratis**: quien juega en el stand no paga nada y
no da nada. Pero sí es la primera pieza que existe de una de las vías, **la de las
marcas**, por dos lados:

- **El stand como producto para marcas.** Las mismas piezas se pueden ofrecer en
  dos niveles: un stand de Vektor «con la colaboración de» la marca (sus logos en
  el mapa y sus premios), y un stand **con su marca** (§11: la capa del evento
  vestida). Lo que cuesta de verdad cada evento no es el código, que se hace una
  vez: es el montaje, el hardware y las personas de los tres días.
- **El mapa patrocinado sale de aquí casi hecho.** Un mapa con los estampados de la
  marca, un ranking propio y premios **es** lo que el stand necesita. Llevarlo
  después al juego publicado, con su ranking mensual, pide lo que ya está escrito
  en la propuesta 14 (cuentas) y en la 20 (datos), y avisar de que es publicidad
  (la propuesta 12 ya lo anotó: en España tiene que ser identificable como tal).

Las activaciones con escuelas de diseño se apoyan en lo contrario: no en el stand,
sino en que Alchemist salga de `npm run dev`, que es el bloque «Alchemist dentro
de Vektor» del roadmap.
