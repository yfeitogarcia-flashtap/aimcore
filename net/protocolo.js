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
  return compraSegundos <= 0 && fase === 'ronda'
}
