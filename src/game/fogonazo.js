/**
 * **El fogonazo: la luz de un disparo propio** (vuelta 106, propuesta 13).
 *
 * Vektor no dibuja el arma en la mano (vuelta 106), y lo primero que un arma en
 * la mano cuenta al disparar es **que ha salido una bala**, en el borde de la
 * vista y en el instante exacto. Esto lo cuenta con luz y nada más: un
 * degradado cálido abajo a la derecha, donde estaría la boca, que se enciende y
 * se apaga. No es una estrella ni un sprite de fuego —eso prometería un arma
 * que no se ve—, y no es el fogonazo de un muñeco (`muzzleFlash.js`), que está
 * en el mundo.
 *
 * Como la mirilla y el tajo, **es del motor y trae su propia hoja de estilos**,
 * así que sale igual entrenando y en el multijugador. Y se anima con la API de
 * animaciones del navegador sobre `opacity`, que corre en el compositor: sin
 * disparar no cuesta nada, y disparando no toca el dibujo de three.
 */

import { SENSACION } from '../config.js'

const ESTILO_ID = 'vk-fogonazo-css'

function inyectarEstilos(doc) {
  if (doc.getElementById(ESTILO_ID)) return
  const f = SENSACION.fogonazo
  const style = doc.createElement('style')
  style.id = ESTILO_ID
  // **Por debajo del HUD** (z-index 1): la luz pasa por detrás del bloque de
  // arma y de los contadores en vez de lavarlos.
  style.textContent = `
.vk-fogonazo {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 1;
  opacity: 0;
  background: radial-gradient(
    circle calc(${f.radio} * min(100vw, 100vh)) at ${f.x * 100}% ${f.y * 100}%,
    rgba(${f.color}, 1) 0%,
    rgba(${f.color}, 0.45) 45%,
    rgba(${f.color}, 0) 100%
  );
}
`
  doc.head.appendChild(style)
}

export class Fogonazo {
  constructor(contenedor) {
    const doc = contenedor.ownerDocument
    inyectarEstilos(doc)
    this.root = doc.createElement('div')
    this.root.className = 'vk-fogonazo'
    this.root.setAttribute('aria-hidden', 'true')
    contenedor.appendChild(this.root)
    /** La animación en curso: un disparo nuevo la corta, no se apila encima. */
    this._anim = null
    /** Cuántos ha dado, para que los bancos lo cuenten. */
    this.encendidos = 0
  }

  /**
   * @param {string} arma clave del arma que ha disparado
   * @param {{ silenciado?: boolean, alterno?: boolean }} [opciones]
   * @returns {boolean} si se ha encendido: un arma sin factor no quema pólvora
   */
  show(arma, { silenciado = false, alterno = false } = {}) {
    const f = SENSACION.fogonazo
    const factor = f.porArma[arma]
    if (!factor) return false
    let pico = f.opacidad * factor
    if (silenciado) pico *= f.silenciado
    if (alterno) pico *= f.alternaAuto
    if (pico > f.opacidadMax) pico = f.opacidadMax
    this._anim?.cancel()
    this._anim = this.root.animate(
      [{ opacity: pico }, { opacity: 0 }],
      { duration: f.duracionPorArma[arma] ?? f.duracionMs, easing: 'ease-out' },
    )
    this.encendidos += 1
    return true
  }

  dispose() {
    this._anim?.cancel()
    this.root.remove()
  }
}
