/**
 * **El tajo: el destello de un golpe de cuchillo** (vuelta 71).
 *
 * Vektor **no dibuja el arma en la mano** —decisión de la vuelta 38, y no se
 * toca—, así que un arma cuerpo a cuerpo se queda sin lo que en otros juegos lo
 * cuenta todo: la animación. Lo que hay que resolver es decir tres cosas sin
 * enseñar nada: **que has golpeado**, **qué golpe ha sido** y **si ha entrado
 * por la espalda**.
 *
 * Se dice por la forma, no por el color, que es la regla de la casa desde la
 * vuelta 67: en esta paleta todos los tonos significan ya algo, y un destello
 * que reutilice uno se lee de reojo como lo que ese tono significa.
 *
 * - **Flojo**: una medialuna fina, a la izquierda.
 * - **Fuerte**: una medialuna más gruesa y más larga, a la derecha. Sale en el
 *   verde de acción, que es el único color de la paleta que puede significar
 *   dos cosas porque no coinciden nunca en pantalla —el otro sitio donde vive
 *   son los botones de menú y la brújula—.
 * - **Por la espalda**: **las dos a la vez**, cerrándose en un anillo. No es un
 *   golpe más fuerte: es otra cosa, y lo que distingue otra cosa es otra forma.
 *
 * Como el resto de lo que el motor dibuja fuera del lienzo (la mirilla), trae
 * su propia hoja de estilos y sale en los dos modos. Y se anima con la API de
 * animaciones del navegador, no por frame: un destello dura 180 ms y no tiene
 * por qué costar nada al bucle.
 */

import { COLORS, MELEE_FX } from '../config.js'

const ESTILO_ID = 'vk-slash-css'

function inyectarEstilos(doc) {
  if (doc.getElementById(ESTILO_ID)) return
  const style = doc.createElement('style')
  style.id = ESTILO_ID
  style.textContent = `
.vk-slash {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 5;
  overflow: hidden;
}
.vk-slash i {
  position: absolute;
  left: 50%;
  top: 50%;
  border-radius: 50%;
  border: ${MELEE_FX.grosorFinoPx}px solid ${COLORS.crosshair};
  /* Una medialuna es un anillo con tres cuartos de borde transparente: el
     trozo que queda es el arco, y girándolo se elige por qué lado entra. */
  border-color: ${COLORS.crosshair} transparent transparent transparent;
  opacity: 0;
}
.vk-slash i.vk-slash--fuerte {
  border-width: ${MELEE_FX.grosorFuertePx}px;
  border-color: ${COLORS.action} transparent transparent transparent;
}
`
  doc.head.appendChild(style)
}

export class Slash {
  constructor(contenedor) {
    const doc = contenedor.ownerDocument
    inyectarEstilos(doc)
    this.root = doc.createElement('div')
    this.root.className = 'vk-slash'
    this.root.setAttribute('aria-hidden', 'true')
    contenedor.appendChild(this.root)
    /**
     * **Pool fijo de dos arcos**, como el de los fogonazos y el de las marcas
     * de bala: un golpe por la espalda enciende los dos a la vez y nunca hacen
     * falta más, porque el cuchillo no dispara ráfagas.
     */
    this._arcos = [doc.createElement('i'), doc.createElement('i')]
    for (const arco of this._arcos) this.root.appendChild(arco)
  }

  /**
   * @param {'luz'|'fuerte'} tipo
   * @param {boolean} espalda si ha entrado por detrás: entonces son los dos
   *   arcos cerrándose, que es la forma de «esto no ha sido un golpe más».
   */
  show(tipo, espalda = false) {
    const fuerte = tipo === 'fuerte'
    const lado = fuerte ? 1 : -1
    this._animar(this._arcos[0], fuerte, lado)
    if (espalda) this._animar(this._arcos[1], fuerte, -lado)
  }

  /**
   * El arco entra ya abierto y se cierra mientras se apaga: es lo que se lee
   * como un filo pasando, y no como una luz que aparece y desaparece.
   */
  _animar(arco, fuerte, lado) {
    const d = fuerte ? MELEE_FX.diametroFuertePx : MELEE_FX.diametroFinoPx
    arco.className = fuerte ? 'vk-slash--fuerte' : ''
    arco.style.width = `${d}px`
    arco.style.height = `${d}px`
    arco.style.margin = `${-d / 2}px 0 0 ${-d / 2}px`
    const giro = lado > 0 ? 90 : -90
    arco.animate(
      [
        { opacity: 0, transform: `rotate(${giro - MELEE_FX.barridoDeg * lado}deg) scale(1.18)` },
        { opacity: 1, transform: `rotate(${giro}deg) scale(1)`, offset: 0.22 },
        { opacity: 0, transform: `rotate(${giro + MELEE_FX.barridoDeg * lado}deg) scale(0.9)` },
      ],
      { duration: fuerte ? MELEE_FX.duracionFuerteMs : MELEE_FX.duracionFinoMs, easing: 'ease-out' },
    )
  }

  dispose() {
    this.root.remove()
  }
}
