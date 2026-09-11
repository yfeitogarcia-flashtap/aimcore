/**
 * Transición entre escenarios.
 *
 * **Este módulo es sustituible entero.** El resto del motor no sabe —y no debe
 * saber— que hoy la transición es un fundido. Sólo conoce el contrato:
 *
 *     transition.run(build)   // tapa → llama a build() → destapa
 *
 * `build` es síncrona y se ejecuta con la escena ya tapada, así que el jugador
 * nunca ve aparecer la geometría de golpe. Nada de lo que hay detrás —colisión,
 * activación de anclajes, entrada del jugador— depende de la forma de la
 * transición: sólo de que `build` se llame en algún momento entre el principio y
 * el final.
 *
 * Si mañana el fundido se cambia por, digamos, una elevación de las piezas desde
 * el suelo, se reescribe este fichero y nada más. Por eso la fábrica recibe ya
 * `scene` y `camera` aunque el fundido no los use: una versión en 3D los
 * necesitaría, y así el cambio no toca `engine.js`.
 */

import { TRANSITION } from '../config.js'

/**
 * @param {object} context
 * @param {HTMLElement} context.host elemento sobre el que montar la capa
 * @param {import('three').Scene} [context.scene] disponible para futuras
 *   transiciones que animen la geometría en vez de taparla
 * @param {import('three').Camera} [context.camera] ídem
 */
export function createSceneTransition({ host, scene = null, camera = null }) {
  const veil = document.createElement('div')
  veil.className = 'scene-transition'
  veil.setAttribute('aria-hidden', 'true')
  host.appendChild(veil)

  let active = false
  /**
   * Última construcción pedida. Si llegan varias mientras hay una transición en
   * marcha —el jugador cambiando de escenario a toda prisa— se queda con la
   * última en lugar de encadenar fundidos.
   */
  let pendingBuild = null

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

  const setVeil = (opacity, durationMs) => {
    veil.style.transitionDuration = `${durationMs}ms`
    veil.style.opacity = String(opacity)
  }

  return {
    /** ¿Hay una transición en curso? */
    get active() {
      return active
    },

    /**
     * Ejecuta una transición completa alrededor de `build`.
     *
     * @param {() => void} build construye el estado nuevo. Se llama una sola
     *   vez, con la escena tapada. Si lanza, la capa se levanta igualmente: más
     *   vale ver una escena rota que quedarse a oscuras para siempre.
     * @returns {Promise<void>}
     */
    async run(build) {
      pendingBuild = build
      if (active) return
      active = true

      try {
        setVeil(1, TRANSITION.outMs)
        await wait(TRANSITION.outMs + TRANSITION.holdMs)

        // Se coge la última pedida, no la que abrió la transición.
        const toBuild = pendingBuild
        pendingBuild = null
        try {
          toBuild?.()
        } finally {
          setVeil(0, TRANSITION.inMs)
          await wait(TRANSITION.inMs)
        }
      } finally {
        active = false
      }

      // Llegó otra petición mientras se destapaba: se atiende ahora.
      if (pendingBuild) await this.run(pendingBuild)
    },

    dispose() {
      pendingBuild = null
      veil.remove()
    },
  }
}
