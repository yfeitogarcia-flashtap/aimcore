/**
 * **Lo que viaja por el cable**, y el reloj en el que se mide.
 *
 * Tres reglas que son el protocolo entero:
 *
 * 1. **El reloj es el número de paso.** Cada entrada viaja sellada con su paso
 *    `n`, y los dos extremos la ejecutan con `now = n · SIM_STEP_MS`. No hay
 *    `performance.now()` de nadie en la simulación: el reloj del cliente y el
 *    del servidor no tienen por qué coincidir, pero el número de paso sí.
 * 2. **Las teclas viajan como máscara**, en un orden fijo. Siete bits.
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

/** Orden fijo de los bits. Añadir una acción es añadirla **al final**. */
export const ACCIONES = ['forward', 'back', 'left', 'right', 'jump', 'crouch', 'walk']

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
  ADIOS: 'x',
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
