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
 * El instante exacto de una pulsación de salto sellada en el paso `n` con
 * fracción `jt`. El paso cubre `[fin − SIM_STEP_MS, fin]`, así que una fracción
 * de 0 es el principio del paso y una de 1 su final.
 */
export function instanteDeSalto(n, jt) {
  return instanteDePaso(n) - SIM_STEP_MS + jt * SIM_STEP_MS
}

/** Tipos de mensaje. Uno por letra: esto se lee mucho en el inspector. */
export const MSG = {
  BIENVENIDA: 'b',
  ENTRADA: 'e',
  FOTO: 'f',
  ADIOS: 'x',
}
