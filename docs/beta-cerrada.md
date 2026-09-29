# Beta cerrada: lo que falta para invitar a 5–10 personas

**Estado:** vuelta 107 — **construidos el 1, el 2, el 3 y el 5** (cómo se
juega, feedback con la versión dentro, y contador). Faltan el 4 (versión estable
aparte), el 6 (carta), el 7 (párrafo de privacidad), el 8 (prueba de red) y el 9
(lista de fallos). El plan era de la vuelta 106.

**En cinco líneas.** Se puede invitar a 5–10 personas cuando una tarde de juego se
pueda contar sin nadie de Vektor delante. Para eso hacen falta tres piezas en el
juego —cómo se juega, enviar feedback y un contador— y ya están. Faltan cuatro que
no son código: una versión estable aparte de la de trabajo, la carta, el párrafo
de privacidad y la lista de fallos conocidos. Y una prueba de red entre dos casas
(V103-2 y las peanas en red), que es lo último que se mide antes de invitar.

**Cómo se lee el feedback (lo tiene que poner Yago, una vez).** Dos secretos de
Fly, que no pasan por nadie más:

- `fly secrets set VEKTOR_FEEDBACK_WEBHOOK=<el webhook de un canal de Discord>`
  (en Discord: ajustes del canal → Integraciones → Webhooks → Copiar URL). Cada
  mensaje llega al canal con la pantalla, el modo, el mapa y la versión.
- `fly secrets set VEKTOR_FEEDBACK_CLAVE=<una palabra tuya>` y se leen en
  `https://<el juego>/feedback/leer?clave=<esa palabra>`. Sin disco se pierden al
  desplegar; con el webhook puesto no importa.
- El contador está en `https://<el juego>/contador`. Para que no se ponga a cero
  con cada despliegue hace falta un volumen de Fly montado y `VEKTOR_DATOS` apuntando
  a él; sin eso, cuenta desde el último despliegue y la página lo dice. Se invita a gente de confianza que no
ha visto Vektor nunca y que no va a leer nada antes de jugar. Lo que decide qué
es imprescindible es una pregunta: **¿se puede jugar una tarde, contar qué ha
pasado y que Yago lo lea, sin que nadie de Vektor esté delante?** Lo que no
cambia la respuesta es deseable.

## En dos columnas

| Imprescindible | Deseable |
|---|---|
| 1. «Cómo se juega» en 20 segundos | 1. Nick de invitado (fase 1 de la propuesta 07) |
| 2. Botón «Enviar feedback» que llega a Yago | 2. Una encuesta de una línea al acabar una partida |
| 3. Contador mínimo de partidas y jugadores | 3. Contador de balas en reserva en el HUD |
| 4. Una versión estable para la beta, aparte de la de trabajo | 4. Firmar el `.exe` |
| 5. La versión, a la vista y dentro del feedback | 5. Revancha al acabar y banner de instalar |
| 6. La carta de invitación | 6. FAQ dentro del juego |
| 7. Un párrafo de privacidad | 7. Tabla de estadísticas por jugador |
| 8. Cerrar las pruebas de red que están abiertas | 8. Inglés |
| 9. La lista de fallos conocidos, escrita y enviada | 9. Un canal de Discord para los testers |

---

## Imprescindible

### 1. «Cómo se juega» en 20 segundos

**Qué es.** Una pantalla que sale **una vez**, justo después de «Jugar ahora» en
la primera visita, y se vuelve a abrir desde Opciones. Cuatro tarjetas, una
frase cada una, y un botón «Entendido» que se puede pulsar desde la primera:

1. **Mover y apuntar**: WASD, ratón, espacio, agacharse. La tecla sale del bind
   (vuelta 97), así que en la app dice `CTRL IZQ`.
2. **ESC es el menú, y se vuelve con un clic** (F2): la única cosa del juego que
   un navegador hace distinta a lo que el jugador espera.
3. **Entrenamiento o Multijugador**: qué es cada uno en una línea.
4. **Invitar**: en Multijugador se crea una sala y se copia el enlace.

**Por qué es imprescindible.** El paso 2 de la portada ya lleva los controles
como pares de tecla y verbo (vuelta 94), pero lo que se ha visto jugando es que
nadie los lee antes de entrar. Y el fallo que más cuesta explicar a distancia
—«le doy a ESC y no vuelvo»— se previene con una frase.

**Lo que no es.** No es un tutorial jugable ni un vídeo: eso son semanas, y 20
segundos de lectura bastan para gente que ya juega a shooters. Se guarda que se ha
visto en `localStorage`, como un ajuste más.

### 2. Botón «Enviar feedback» que llega a algún sitio legible sin programar

**Dónde está el botón.** En el menú de ESC de las dos páginas (entrenamiento y
multijugador) y en la portada. Abre un panel con un campo de texto, tres
etiquetas para elegir —*fallo*, *idea*, *sensación*— y «Enviar». Nada más.

**Qué viaja además del texto, sin que el jugador lo escriba:** la versión del
build (la huella que ya publica `/salud`), si es la app o un navegador, el modo y
el mapa, los FPS medios y el ping del último minuto, y **los últimos errores de
página** si los hay. Eso último es lo que convierte «se me colgó» en algo que se
puede arreglar: la vuelta 60 enseñó que un error por frame no rompe el juego, lo
degrada en silencio.

**A dónde llega: recomendación, un canal de Discord.** La página manda el texto
al huésped (`POST /feedback`), y el huésped lo reenvía a un *webhook* de un canal
privado. Yago lo lee en el móvil, con fecha, y puede contestar al tester por
privado. Cuatro razones:

- **No hay que programar nada para leerlo**, ni entrar en Fly ni en GitHub.
- **La dirección del webhook es un secreto y se queda en el servidor**: la guarda
  Yago como secreto de Fly, igual que `FLY_API_TOKEN` en GitHub. Si la tuviera
  la página, cualquiera podría escribir en el canal.
- **El huésped pone un tope**: un envío cada 30 s por conexión y un tamaño máximo.
  Sin eso, un botón es una forma de llenar un canal.
- **Es la misma pieza del contador** (punto 3), así que se escribe una vez.

**Alternativa sin servidor**: un formulario de Google abierto en otra pestaña,
con la versión y el modo metidos en la dirección. Cero código en el huésped, y
las respuestas quedan en una hoja de cálculo. Se paga en dos sitios: **saca al
jugador del juego**, y **en la app de escritorio no se puede abrir**: la ventana
no tiene permiso para abrir enlaces fuera (vuelta 91, «nada de shell»), así que
habría que dárselo. Por eso va de segunda.

### 3. Contador mínimo de partidas y jugadores, sin cookies ni datos personales

**Qué se cuenta, y en qué unidad.** Lo que el servidor ya sabe sin preguntar a
nadie:

- **Partidas multijugador empezadas y acabadas**, por modo y por mapa.
- **Jugadores en cada partida** (butacas ocupadas) y **pico de gente a la vez**.
- **Sesiones de entrenamiento**: la página avisa al acabar una sesión con un
  mensaje sin identificador (modo, mapa, duración). El entrenamiento no pasa por
  el servidor, así que es la única cuenta que necesita un aviso nuevo.

**Lo que no se cuenta, a propósito: personas distintas.** Saber que la misma
persona ha vuelto tres días exige guardarle un identificador en el navegador, y
eso es exactamente lo que «sin cookies» descarta: un número aleatorio en
`localStorage` que viaja al servidor **es** un identificador, se llame como se
llame. Así que el contador habla de **partidas y butacas**, no de gente. Con 5–10
testers, cuántas personas han jugado lo sabe Yago mejor que ningún contador.

**Dónde se lee.** El huésped vive en memoria y se reinicia con cada despliegue,
así que los números no pueden quedarse ahí. Se mandan **una vez al día y al
apagarse** (un despliegue apaga la máquina con aviso) al mismo canal de Discord
del feedback, en un mensaje de cinco líneas. Guardarlos en un volumen de Fly es la
otra vía y cuesta más: un volumen es una máquina atada a un disco, y la regla de
**una sola máquina** (vuelta 59) ya lo hace posible, pero es infraestructura que
mantener para cinco números.

**Ni IP, ni navegador, ni hora exacta por persona**: el mensaje diario lleva
totales. El registro del huésped (el de Fly) sí ve IPs, como cualquier servidor;
no se guardan aparte ni se cruzan con nada.

### 4. Una versión estable para la beta, aparte de la de trabajo

**Hoy cada empujón a la rama de trabajo se despliega solo** (vuelta 81) en la
misma dirección que abriría un tester, y desde la 93 **su pestaña se recarga
sola** con lo nuevo. Eso es perfecto para Yago y malo para una beta: un tester
que juega un martes por la tarde recibe lo que se esté construyendo ese martes,
bancos en rojo incluidos.

**Lo mínimo**: una segunda aplicación de Fly para trabajar, y que la de la beta
sólo se despliegue **al pulsar un botón** (un *workflow* manual en GitHub, o una
etiqueta `beta-*`). La dirección de la beta no cambia y la app de escritorio sigue
apuntando a ella. Es una copia de `fly.toml` con otro nombre y un disparador
distinto en `.github/workflows/desplegar.yml`; lo único que tiene que hacer Yago
es crear la segunda aplicación en Fly, porque eso pide su cuenta.

### 5. La versión, a la vista y dentro del feedback

El pie de Opciones ya dice «Vektor de escritorio 0.5» en la app (vuelta 98). Le
falta **la huella del build**, la misma de `/salud`, para que «a mí me pasa»
pueda cruzarse con «eso se arregló ayer». Va también dentro de cada feedback
(punto 2), que es donde de verdad hace falta.

### 6. La carta de invitación

Un texto corto que Yago manda por privado, con:

- **El enlace** del juego y el de la **app de escritorio**, diciendo cuál
  recomendar (la app: pantalla completa, `Ctrl` para agacharse y ESC que vuelve
  a la primera).
- **Qué hacer con el aviso de Windows**: la app no está firmada y SmartScreen
  dice «editor desconocido» → *Más información* → *Ejecutar de todas formas*.
  Sin esa línea, la mitad se para ahí.
- **Qué probar**: una sesión de entrenamiento, un duelo 1v1 con otro tester y un
  todos contra todos de tres o más, con día y hora propuestos para el último,
  porque tres personas a la vez no coinciden solas.
- **Cómo contar lo que pase**: el botón «Enviar feedback».

### 7. Un párrafo de privacidad

Al lado del botón de feedback, una frase: qué se manda (el texto y los datos
técnicos del punto 2), a dónde (un canal privado de Yago) y que no se guarda
nada que identifique a nadie. No hace falta más con lo que se recoge, pero sí
hace falta que esté escrito antes de pedirle a alguien que escriba.

### 8. Cerrar las pruebas de red que están abiertas

- **V103-1/2/3** (el rival que no tiembla en wifi, F3 y `/salud`), pendientes de
  la prueba de Yago entre dos redes.
- **V101-2**, un todos contra todos de tres personas de verdad, que espera a que
  haya tres.
- **V106-1, las peanas en red**: coger, recargar y que te lo quiten al morir, con
  dos navegadores. La mitad se probó con «El espejo peanas» y encontró F4 y F5
  (vuelta 107: pantalla negra al crear la sala con ese mapa, y las peanas sin
  dibujar al cambiar de mapa). Los dos arreglados y medidos (`peanas107red`); lo
  que queda es repetir la prueba entera.

La beta es justo cuando van a jugar en redes que no controlamos. Invitarles antes
de saber cómo se porta el juego fuera de casa es convertir su primera tarde en la
prueba de red.

### 9. La lista de fallos conocidos, escrita y enviada

Lo que un tester va a encontrarse y ya sabemos. Mandarla con la carta ahorra que
diez personas reporten lo mismo y dice qué **sí** interesa que cuenten.

**Del juego:**

- **No se ve cuántas balas quedan en reserva** del U2, las granadas y el Fang
  (vuelta 90): sólo el aviso de «no te quedan».
- **Sin arma en pantalla**, a propósito (vuelta 106). Lo que cuenta el disparo es
  el sonido, el retroceso, la marca de impacto y, desde la misma vuelta, un
  fogonazo de luz abajo, un golpe de la vista (se quita en Opciones) y la silueta
  del HUD reaccionando.
- **Los nicks son `VK-01`, `VK-02`…**: no hay nombres (propuesta 07).
- **En un navegador, volver desde ESC pide un clic** si hace más de cinco
  segundos que no se ha tocado nada: el juego lo dice con un aviso (F2). En la app
  no pasa.
- **En la armería, a 1366×768 hay que bajar 77 px** para ver la ficha entera
  (vuelta 92).
- **Un rincón del Plano A** (el fondo de saco del Largo) donde no aparece nadie.

**De la red:**

- **Una sola máquina en París** (vuelta 58): unos 15 ms más que Madrid, y si esa
  máquina cae, cae todo. Para diez personas sobra capacidad (medido: una sala de diez gasta el 2 % de un paso de servidor, `salas100`).
- **Va por WebSocket, o sea TCP**: en una wifi mala un paquete perdido retiene a
  los de detrás. La vuelta 103 lo esconde en el dibujo; no lo quita.
- **Si alguien cierra la pestaña a media partida**, el rival espera hasta 90 s o
  reclama la partida a los 15 (vuelta 62). Es el comportamiento pensado, pero se
  va a leer como un cuelgue si nadie lo sabe.
- **El anti-trampas es aproximado**: la foto de cada uno ya no lleva a quien está
  detrás de una pared lejos (vuelta 100), pero un cliente modificado podría, por
  ejemplo, esconder el destello del Titan (vuelta 90). Con gente de confianza no
  importa; se dice para que nadie lo descubra como un fallo.

**De la app de escritorio:**

- **Sin firmar**, con su aviso de Windows (ver la carta).
- **Los ajustes de la app y del navegador son los mismos** mientras la dirección
  sea la misma, y dejarán de serlo el día que haya dominio propio (vuelta 97).

**De lo que no hay y se va a echar de menos**: lista de partidas (se entra por
enlace), cuentas, estadísticas por jugador, inglés.

---

## Deseable

1. **Nick de invitado** — la fase 1 de la propuesta 07, sin servidor. Con diez
   personas, saber quién es `VK-04` en el marcador de TAB es lo primero que se va
   a preguntar. Barata, y la única fase de esa propuesta que no pide mantener un
   servicio.
2. **Una encuesta de una línea al acabar una partida** — «¿qué tal?» de 1 a 5 y
   nada más, por el mismo canal del feedback. Da una señal de cada partida y no
   sólo de quien se acuerda de escribir.
3. **La reserva en el HUD** — el residuo de la vuelta 90. Es una decisión de
   jerarquía del HUD (vuelta 89) y por eso no va sola; pero es la pregunta que el
   jugador se hace cada ronda con un arma que se recoge del suelo.
4. **Firmar el `.exe`** — quita el aviso de Windows. Un certificado cuesta dinero
   y papeleo; para diez personas de confianza, la línea de la carta basta.
5. **Revancha al acabar y banner de instalar** — los dos que la vuelta 88 dejó
   para «los primeros de la lista siguiente». «Volver a jugar» ya existe desde la
   101 y hace casi lo mismo que la revancha.
6. **FAQ dentro del juego** — la carta y la lista de fallos hacen su papel
   mientras sean diez.
7. **Tabla de estadísticas por jugador** — HS, cuchillo, U2, arco (vuelta 88).
   Pide contadores por arma y zona que hoy nadie lleva.
8. **Inglés** — sólo si algún tester no habla español. Obliga a sacar los textos
   del JSX, que es la mitad del trabajo.
9. **Un canal de Discord para los testers** — que hablen entre ellos es lo que
   hace que quedar para un todos contra todos de cinco pase solo. Sirve además
   como destino del feedback (punto 2) si Yago lo prefiere público.

## Orden propuesto

Primero lo que no es código y no espera a nada: la **carta**, la **lista de
fallos** y el **párrafo de privacidad** (6, 9, 7), y la **prueba de red** de Yago
(8). Luego, en una vuelta: **versión estable aparte** (4), **feedback y
contador** juntos porque son la misma pieza del huésped (2, 3, 5), y **«cómo se
juega»** (1). Con eso se puede invitar. Lo deseable, según lo que digan las dos
primeras semanas de feedback.

## Pruebas abiertas de la vuelta 107

Lo que se arregló o se construyó en la 107 y sólo se cierra jugándolo. Todo lo
marcado *medido* tiene su banco en verde; falta la prueba de verdad.

| ID | Qué | Estado |
|---|---|---|
| V107-1 | ESC en la app: pausa y vuelve cinco veces seguidas, sin parpadeo (F3) | medido (`esc105`) |
| V107-2 | Sala creada directamente con «El espejo peanas»: el invitado no ve negro (F4) | medido (`peanas107red`) |
| V107-3 | Peanas en red: zócalo, arma y ficha a la vista; coger, recargar, perderla al morir (F5, cierra V106-1) | medido (`peanas107red`) |
| V107-4 | Aim Camp: se aparece en el suelo; sin tercer cono en Alchemist (F6) | medido (`salidas107`) |
| V107-5 | Sacudida apagada: sin golpe de vista; queda el retroceso (F7) | medido (`sensacion106`) |
| V107-6 | Peana tras una barrera: no se coge ni sale su ficha (F8) | medido (`peanas106`) |
| V107-7 | F3 «tú y el servidor · de acuerdo» cuenta; si sale «rechazados», captura (F9) | tu prueba |
| V107-8 | Invulnerabilidad en segundos; Aim Camp guarda 3 ms, a corregir por Yago (F10) | tu prueba |
| V107-9 | La fase de compra ya no ofrece «Sin límite» (D1) | medido (`lobby101`) |
| V107-10 | Cuenta atrás de la sala: 15/30/45 s, todos listos 3 s, «Sacar» (D2) | medido (`cuenta107`) |
| V107-11 | Inactividad: aviso 45 s, fuera 60 s, vuelta con tecla, expulsión 120 s (D3) | medido (`afk107`) |
| V107-12 | Alchemist: ficha de lo elegido y «Editar» (A1) | medido (`ficha107`) |
| V107-13 | Alchemist: «Subir al juego» bloquea un mapa al que le falta algo (A2) | medido (`publicar107`) |
| V107-14 | «Cómo se juega» la primera vez, con las teclas del bind | medido (`beta107`) |
| V107-15 | «Enviar feedback» llega al canal o a `/feedback/leer` (con los secretos puestos) | tu prueba |
| V107-16 | `/contador` después de jugar | tu prueba |
