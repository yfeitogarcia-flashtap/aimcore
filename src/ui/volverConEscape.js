import { ESC_MISMA_PULSACION_MS, RESUME_KEY_DELAY_MS } from '../config.js'

/**
 * **ESC es un «atrás» forzado, y siempre acaba en la partida** (vuelta 101).
 *
 * Hasta aquí una pulsación de ESC dentro de `RESUME_KEY_DELAY_MS` —la espera que
 * Chrome impone para volver a capturar el ratón— **no hacía nada**, y quien
 * quiere volver pulsa varias veces seguidas: todas caían dentro de la espera, y
 * se quedaba en el menú. Ahora una pulsación en la espera **deja pedida la
 * vuelta** y se cumple en cuanto se puede; una fuera de ella, en el acto.
 *
 * Es de las dos páginas —el entrenamiento y el multijugador— y está escrito una
 * vez por la convención de la 63: dos ideas de qué hace ESC son un juego que se
 * comporta distinto según el modo.
 *
 * @param {() => void} capturar lo que devuelve a la partida (pedir la captura)
 */
export function crearVueltaConEscape(capturar) {
  let soltadoEn = -Infinity
  let pendiente = null

  const cancelar = () => {
    if (pendiente !== null) clearTimeout(pendiente)
    pendiente = null
  }

  return {
    /** El ratón se acaba de soltar: empieza la espera del navegador. */
    soltado(ahora = performance.now()) {
      soltadoEn = ahora
      cancelar()
    },
    /** Ya se ha vuelto (o se ha ido a otra pantalla): nada pendiente. */
    cancelar,
    /** ¿Hay una vuelta pedida esperando al navegador? */
    get pendiente() {
      return pendiente !== null
    },
    /**
     * **Una pulsación de ESC.** Devuelve si se ha tomado como «volver»: la que
     * soltó el ratón no cuenta (ver `ESC_MISMA_PULSACION_MS`).
     *
     * `cierraAlgo` es para el ESC que cierra una tienda o un panel: ése no pudo
     * soltar el ratón —lo soltó abrirlos—, así que aunque llegue pegado a la
     * apertura es una vuelta y no el eco de la salida.
     */
    pedir(ahora = performance.now(), cierraAlgo = false) {
      const desde = ahora - soltadoEn
      if (desde < ESC_MISMA_PULSACION_MS && !cierraAlgo) return false
      if (desde >= RESUME_KEY_DELAY_MS) {
        cancelar()
        capturar()
        return true
      }
      if (pendiente === null) {
        pendiente = setTimeout(() => {
          pendiente = null
          capturar()
        }, RESUME_KEY_DELAY_MS - desde)
      }
      return true
    },
  }
}
