/**
 * **Lo que viaja por el cable**, y el reloj en el que se mide.
 *
 * Tres reglas que son el protocolo entero:
 *
 * 1. **El reloj es el número de paso.** Cada entrada viaja sellada con su paso
 *    `n`, y los dos extremos la ejecutan con `now = n · SIM_STEP_MS`. No hay
 *    `performance.now()` de nadie en la simulación: el reloj del cliente y el
 *    del servidor no tienen por qué coincidir, pero el número de paso sí.
 * 2. **Las teclas viajan como máscara**, en un orden fijo. Ocho bits desde la
 *    vuelta 83, que es cuando la tecla contextual pasó a ser del movimiento:
 *    la tirolina se engancha y se suelta con ella, así que tiene que viajar o
 *    el servidor reejecutaría un jugador que nunca se agarra a nada.
 * 3. **La pulsación de salto lleva su fracción de paso.** La ventana de
 *    encadenado son 130 ms medidos entre la pulsación y el aterrizaje exacto
 *    (vuelta 44), así que redondear la pulsación al paso se cargaría 16.7 ms de
 *    precisión en la mecánica más fina del movimiento. `jt` es 0..1 dentro del
 *    paso, y ambos extremos reconstruyen el mismo instante.
 *
 * Va en JSON a propósito mientras se valida el concepto: se lee en el inspector
 * del navegador. Lo que costaría en binario está medido en el informe.
 */
import { SIM_STEP_MS } from '../src/config.js'

/**
 * Orden fijo de los bits. Añadir una acción es añadirla **al final**: los dos
 * extremos leen esta misma lista, así que meterla por el medio le cambiaría el
 * significado a todos los bits de detrás.
 */
export const ACCIONES = ['forward', 'back', 'left', 'right', 'jump', 'crouch', 'walk', 'use']

export function empaquetarTeclas(teclas) {
  let mascara = 0
  for (let i = 0; i < ACCIONES.length; i++) if (teclas[ACCIONES[i]]) mascara |= 1 << i
  return mascara
}

export function desempaquetarTeclas(mascara, destino) {
  for (let i = 0; i < ACCIONES.length; i++) destino[ACCIONES[i]] = (mascara & (1 << i)) !== 0
  return destino
}

/**
 * El instante del reloj compartido en que acaba el paso `n`. Es lo que recibe
 * `movement.update` como `now`, y de ahí sale el aterrizaje exacto.
 */
export function instanteDePaso(n) {
  return n * SIM_STEP_MS
}

/**
 * El instante exacto de un evento sellado dentro del paso `n` con fracción
 * `f` (0..1). El paso cubre `[fin − SIM_STEP_MS, fin]`, así que una fracción de
 * 0 es el principio del paso y una de 1 su final.
 *
 * Lo usan las dos cosas que ocurren **entre** pasos y cuyo instante importa: la
 * pulsación de saltar (la ventana de encadenado mide 130 ms, redondear al paso
 * costaría 16.7) y el clic de disparo (el rebobinado se mide desde él).
 */
export function instanteEnPaso(n, f) {
  return instanteDePaso(n) - SIM_STEP_MS + f * SIM_STEP_MS
}

/**
 * **Un disparo, tal como viaja.** Va dentro de la entrada del paso en que se
 * hizo el clic, no en un mensaje aparte: así llega por el mismo camino, en el
 * mismo orden y con el mismo sello de paso que el resto de la intención del
 * jugador.
 *
 * Lleva **su propio rumbo**, y eso no es redundante con el `yaw` de la entrada:
 * el de la entrada se muestrea al empezar el paso y el ratón se mueve entre
 * medias, así que un disparo resuelto con el yaw del paso saldría desviado lo
 * que el jugador haya girado en esos milisegundos. Y lleva `pitch`, que el
 * movimiento no usa para nada pero una bala sí.
 *
 * @typedef {{ f: number, yaw: number, pitch: number, seq: number }} Disparo
 */

/** Tipos de mensaje. Uno por letra: esto se lee mucho en el inspector. */

export const MSG = {
  BIENVENIDA: 'b',
  ENTRADA: 'e',
  FOTO: 'f',
  /**
   * **Adiós, y desde la vuelta 62 va en los dos sentidos.** Del servidor al
   * cliente es «te echo, por esto». Del cliente al servidor es **«me voy»**, que
   * es la única forma de distinguir un abandono de una caída: un cable que se
   * corta no manda ningún mensaje (vuelta 51), así que el abandono se dice y la
   * caída es el silencio. Todo cierre sin este mensaje delante es una caída.
   */
  ADIOS: 'x',
  /**
   * **«El otro no vuelve»** (vuelta 62). Lo manda el que sigue conectado para
   * no esperar los noventa segundos enteros de la ventana de reconexión. El
   * servidor lo atiende sólo si hay una pausa por caída y ya han pasado los
   * primeros segundos: es un botón para el que espera, no una forma de echar a
   * alguien que acaba de parpadear.
   */
  RECLAMAR: 'r',
  /**
   * **Colocar a un jugador donde diga, para medir.** El servidor **sólo** lo
   * atiende con `VEKTOR_DEBUG=1`, y por eso no es una vía para hacer trampas:
   * apagado, el mensaje se tira sin mirarlo.
   *
   * Existe porque un banco que lleva a los dos jugadores a su puesto a base de
   * pulsar teclas depende de que sepan rodear una caja, y no saben: se atascan,
   * la tanda se mide sin línea de tiro y las dos columnas coinciden en el fallo
   * sin medir nada. Eso pasó tres veces antes de poner esto.
   */
  COLOCAR: 'c',
  /**
   * **Comprar** (vuelta 64). Del cliente al servidor: `q` es la clave del
   * catálogo (`volt`, `chaleco`, `supresor`…) y `a`, sólo para el supresor, de
   * qué arma. No lleva precio ni saldo a propósito: **lo que cuesta y si se
   * puede lo decide el servidor**, que es la misma regla que la cadencia.
   */
  COMPRAR: 'm',
  /**
   * **Recoger una peana** (vuelta 106, propuesta 08). Del cliente, `{ i }`: el
   * índice de la peana en la lista del mapa, que los dos extremos derivan del
   * mismo fichero sin que viaje nada (vuelta 90). El servidor comprueba —vivo,
   * modo Peanas, alcance con holgura y sin pared— y contesta **siempre** con el
   * mismo verbo, `{ i, ok, a, rc }`: si no, el aviso de la mira se quedaría
   * esperando algo que no va a llegar (vuelta 56). Lo recogido llega además por
   * `ECONOMIA`, que es el inventario de siempre.
   */
  RECOGER: 'rp',
  /**
   * **Listo para empezar la ronda** (vuelta 102), sólo en la compra **sin
   * límite**: ahí no hay reloj que la cierre, así que la cierra que todos los
   * que están conectados lo digan. `v` es 1 o 0 —se puede desmarcar— y el
   * estado vuelve en la foto (`rd.li`), como todo lo que tienen que ver igual
   * todos. No empieza por `l` a propósito: eso es del lobby (`esDelLobby`).
   */
  LISTO_COMPRA: 'cl',
  /**
   * **Lo que tienes y lo que puedes** (vuelta 64). Del servidor a **un** jugador:
   * dinero, inventario y el techo de la ronda. Va como mensaje suelto y no en la
   * foto por dos motivos: cambia cada pocos minutos, no sesenta veces por
   * segundo, y **el saldo del rival no se enseña** — en la foto compartida
   * viajaría a los dos.
   */
  ECONOMIA: 'eco',
  /**
   * **Pausa** (vuelta 53). Un solo tipo para las cuatro cosas que se pueden
   * decir sobre ella, en el campo `q`: `pedir`, `reanudar`, `si` y `no`.
   *
   * Va como mensaje suelto y **no dentro de la entrada**, que es donde viaja
   * todo lo demás que hace el jugador, por una razón concreta: mientras hay
   * pausa **no se producen entradas** —el mundo no avanza— así que meter ahí el
   * «reanudar» sería meterlo en un carril que justo entonces está parado.
   *
   * El estado de la pausa vuelve en la foto y no en un mensaje: los dos
   * jugadores tienen que verlo igual y al mismo tiempo, y la foto ya va a 60 Hz
   * con esa garantía. Un mensaje aparte sería un segundo camino que se puede
   * perder.
   */
  PAUSA: 'p',
  /**
   * **Ha salido un proyectil** (vuelta 85). Del servidor a **el otro**, no a
   * los dos: quien lo lanzó ya lo tiene volando en su pantalla desde el
   * instante del clic, porque lo predijo — que es la misma regla que su propio
   * movimiento desde la vuelta 45.
   *
   * Y lo que lleva es **el lanzamiento, no la posición**: de dónde salió, con
   * qué velocidad, con qué gravedad, de qué clase y **en qué paso**. De ahí los
   * dos extremos derivan la misma parábola, porque dan los mismos pasos de 60
   * Hz contra el mismo mapa — que es el patrón de la física de la vuelta 72
   * aplicado a algo que se mueve solo. Un campo con la posición del proyectil
   * en la foto serían sesenta correcciones por segundo de algo que no necesita
   * ninguna, y encima **un proyectil sobrevive a quien lo lanzó**: la foto es
   * de los jugadores, y un cohete en el aire ya no es de nadie.
   *
   * El paso viaja porque el mensaje llega tarde: el cliente que lo recibe
   * adelanta el vuelo lo que se haya perdido, en vez de arrancarlo desde cero
   * y dibujar un cohete que sale de una pared.
   */
  PROYECTIL: 'pr',
  /**
   * **Un cuchillo del mundo** (vuelta 90), y es el primer mensaje del protocolo
   * que habla de un objeto que **se queda**: todo lo demás que viaja son
   * jugadores, disparos y vuelos, y los tres terminan.
   *
   * Lleva las tres cosas que un cuchillo clavado puede hacer, y el verbo lo
   * dice la forma del mensaje: con `x/y/z` se planta, con `q` se quita —alguien
   * lo ha recogido— y con `l` se limpia el suelo entero, que es lo que hace una
   * ronda al empezar.
   *
   * **El verbo de limpiar es `l` y no `z` por un motivo tonto y caro**: `z` es
   * una coordenada, así que un mensaje de plantar la lleva siempre y el que
   * leyera «limpiar» ahí habría borrado el suelo cada vez que alguien clava un
   * cuchillo — sin un error en ninguna pantalla, que es como degradan estas
   * cosas. Un verbo no puede llamarse como un dato.
   *
   * **Va a los dos jugadores, incluido quien lo lanzó**, al revés que
   * `PROYECTIL`. Un vuelo lo predice su dueño; dónde acaba clavado y quién lo
   * recoge **no lo predice nadie**, porque es del mundo y porque recogerlo es
   * inventario, y lo que se puede tener lo decide el servidor desde la vuelta
   * 64. Mandarlo a uno solo dejaría al otro dibujando un cuchillo que ya no
   * está.
   *
   * Y el identificador lo pone el servidor, no la ranura del pool ni el número
   * de serie del vuelo: bajo latencia los tres extremos lanzan en órdenes
   * distintos, así que un número suyo nombraría cosas distintas en cada
   * pantalla.
   */
  CLAVADA: 'kc',
  /**
   * **Los avisos que no esperan a la foto** (vuelta 101). Con la foto a 20 Hz
   * en el todos contra todos, el veredicto de un disparo que mataba esperaba
   * hasta 50 ms a la foto siguiente, y la muerte del rival se veía dos fotos
   * más tarde, que es lo que se dibuja por detrás (`NET.interpolarFotos`).
   * Jugándolo se notaba como que «la baja llega tarde», y era exactamente eso.
   *
   * Los cuatro salen **en el paso en que ocurren**, y ninguno sustituye a la
   * foto: la foto sigue llevando el veredicto repetido (vuelta 46, por si se
   * pierde) y la vida; esto sólo llega antes. Por eso el cliente los trata como
   * lo que son, avisos: el veredicto se descarta si ya había llegado por su
   * `seq`, y lo que se dibuja de una baja se corrige solo con la foto.
   *
   * - `VEREDICTO`: el de tu disparo, a ti, en cuanto se resuelve.
   * - `GOLPE`: a quien encaja daño, con su vida y quién se lo hizo — la cuña
   *   de dirección y el anillo no esperan a la foto.
   * - `BAJA`: a todos, quién ha caído y quién le ha matado. El cuerpo se quita
   *   en el acto con su destello de muerte en vez de dos fotos después.
   * - `TIRO`: a los demás, que alguien ha disparado — de dónde, hacia dónde,
   *   con qué y si con supresor. Es lo que faltaba para que un rival sonara y
   *   se viera disparar como un muñeco del entrenamiento: fogonazo, voz de su
   *   arma y silbido si la bala te pasa cerca.
   */
  VEREDICTO: 'v',
  GOLPE: 'g',
  BAJA: 'k',
  TIRO: 'tr',
  /**
   * **El lobby** (vuelta 101). La sala existe antes que la partida: se entra,
   * se elige hueco, se pulsa LISTO y el anfitrión lanza. Los mensajes del lobby
   * empiezan todos por `l` y los mira `net/lobby.js`; el resto sigue siendo de
   * la partida, que no sabe que hay un lobby delante.
   *
   * - `LOBBY` (del servidor): el estado entero de la sala, a cada uno el suyo
   *   —dice quién eres—, cada vez que cambia.
   * - `CONFIG` (del anfitrión): modo, mapa o fase de compra.
   * - `LISTO`: tu botón, con `v` a verdadero o falso.
   * - `HUECO`: el hueco que quieres, con `h`.
   * - `MEZCLAR` (del anfitrión): reparte los equipos al azar y equilibrados.
   * - `LANZAR` (del anfitrión): empieza la partida con los listos.
   * - `VOLVER`: «Volver a jugar» al acabar — vuelves al lobby, y listo.
   * - `ENTRAR`: con una partida del todos contra todos en marcha, meterse.
   */
  LOBBY: 'lb',
  CONFIG: 'lc',
  LISTO: 'll',
  HUECO: 'lh',
  MEZCLAR: 'lx',
  LANZAR: 'lg',
  VOLVER: 'lv',
  ENTRAR: 'le',
}

/** ¿Es un mensaje del lobby? Todos empiezan por `l` (ver `MSG.LOBBY`). */
export function esDelLobby(t) {
  return typeof t === 'string' && t.length === 2 && t[0] === 'l'
}

/**
 * **¿Está abierta la tienda?** Es la regla que decide si una compra se atiende,
 * y vive aquí porque **la miran los dos extremos**: el servidor para aceptarla
 * y el cliente para pintar el panel. Escrita en cada lado se despega, y el
 * síntoma sería el peor de los dos: un artículo que el panel enseña comprable y
 * el servidor rechaza sin decir por qué.
 *
 * Con fase de compra configurada, la ventana **es** la fase: quince segundos
 * entre ronda y ronda, cada uno en su caja. **Sin ella (a cero) no hay ventana
 * donde meter la tienda**, así que la ventana es la ronda entera y se compra
 * jugando (vuelta 65). No es un caso raro que haya que esquivar: a cero se
 * eligió *partida rápida*, y una partida rápida sin poder comprar nunca deja el
 * duelo con la pistola de serie de principio a fin — que fue exactamente lo que
 * pasó.
 *
 * @param {string} fase la de `rondas.fase`: `espera`, `compra`, `ronda` o `fin`
 * @param {number} compraSegundos lo que dura la fase en esta sala
 */
export function compraAbierta(fase, compraSegundos) {
  if (fase === 'compra') return true
  // **Cero es «sin fase», y sólo cero** (vuelta 102): la compra sin límite es
  // un número negativo (`ROUNDS.compraSinLimite`) y **sí** tiene fase —la más
  // larga—, así que ahí la tienda cierra al empezar la ronda como en las demás.
  return compraSegundos === 0 && fase === 'ronda'
}
