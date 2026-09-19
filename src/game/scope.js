/**
 * **La mirilla ampliada** (vuelta 70).
 *
 * Es la primera del juego y hoy sólo la tiene la Scout, que la declara con su
 * bloque `scope`. Este módulo dibuja **la lente**: el negro de alrededor, la
 * cruceta fina y el punto rojo. El encuadre y la sensibilidad no son suyos —los
 * lleva el motor, que es quien tiene la cámara y los controles—.
 *
 * **Vive en el motor y no en una página** por la convención de la vuelta 63: el
 * duelo y el entrenamiento comparten motor, así que escribiéndola aquí sale en
 * los dos y no hay dos mirillas que se separen. Y trae su propia hoja de
 * estilos, inyectada una sola vez, porque las dos páginas tienen CSS distinto:
 * un bloque copiado en cada una es la misma mirilla escrita dos veces, que es
 * justo lo que pasó con la mira hasta la vuelta 67.
 *
 * Lo único que **no** hace es esconder la mira de la página: cada una tiene la
 * suya y cada una sabe apagarla, y el motor avisa por `onScope`. Alcanzar desde
 * aquí a `#mira` o a `.crosshair` sería que un módulo del juego supiera cómo se
 * llaman los trozos de dos páginas.
 *
 * **Cero trabajo por frame cuando no hay nada que animar**: se escriben las dos
 * variables CSS sólo mientras la transición corre (140 ms), y al llegar a 0 ó 1
 * se deja de escribir.
 */

import { COLORS, SCOPE } from '../config.js'

const ESTILO_ID = 'vk-scope-css'

/**
 * La hoja, una vez por documento.
 *
 * La lente es un círculo con una sombra maciza de `100vmax`: eso pinta de negro
 * **todo lo que queda fuera** sin necesidad de una máscara ni de cuatro cajas, y
 * el borde del círculo sale limpio en cualquier proporción de pantalla.
 *
 * La cruceta son cuatro segmentos y no dos líneas enteras porque el centro tiene
 * que quedar libre: lo que se apunta es el punto rojo, y una cruz que lo cruza
 * tapa exactamente lo que se está mirando.
 */
function inyectarEstilos(doc) {
  if (doc.getElementById(ESTILO_ID)) return
  const style = doc.createElement('style')
  style.id = ESTILO_ID
  style.textContent = `
.vk-scope {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 6;
  opacity: var(--vk-scope-t, 0);
  display: none;
}
.vk-scope--on { display: block; }
.vk-scope__lente {
  position: absolute;
  left: 50%;
  top: 50%;
  width: calc(${SCOPE.radioVmin}vmin * 2);
  height: calc(${SCOPE.radioVmin}vmin * 2);
  margin: calc(${SCOPE.radioVmin}vmin * -1) 0 0 calc(${SCOPE.radioVmin}vmin * -1);
  border-radius: 50%;
  box-shadow: 0 0 0 100vmax #000;
  transform: scale(var(--vk-scope-s, 1.25));
}
.vk-scope__cruz { position: absolute; inset: 0; }
.vk-scope__cruz i {
  position: absolute;
  background: ${COLORS.crosshair};
  opacity: 0.55;
}
.vk-scope__cruz i:nth-child(1),
.vk-scope__cruz i:nth-child(2) {
  left: 50%;
  width: ${SCOPE.lineaPx}px;
  margin-left: ${-SCOPE.lineaPx / 2}px;
}
.vk-scope__cruz i:nth-child(1) { top: 0; height: calc(50% - ${SCOPE.huecoPx}px); }
.vk-scope__cruz i:nth-child(2) { bottom: 0; height: calc(50% - ${SCOPE.huecoPx}px); }
.vk-scope__cruz i:nth-child(3),
.vk-scope__cruz i:nth-child(4) {
  top: 50%;
  height: ${SCOPE.lineaPx}px;
  margin-top: ${-SCOPE.lineaPx / 2}px;
}
.vk-scope__cruz i:nth-child(3) { left: 0; width: calc(50% - ${SCOPE.huecoPx}px); }
.vk-scope__cruz i:nth-child(4) { right: 0; width: calc(50% - ${SCOPE.huecoPx}px); }
.vk-scope__punto {
  position: absolute;
  left: 50%;
  top: 50%;
  width: ${SCOPE.puntoPx}px;
  height: ${SCOPE.puntoPx}px;
  margin: ${-SCOPE.puntoPx / 2}px 0 0 ${-SCOPE.puntoPx / 2}px;
  border-radius: 50%;
  background: ${COLORS.threat};
}
`
  doc.head.appendChild(style)
}

export class Scope {
  /**
   * @param {HTMLElement} contenedor el padre del lienzo. La lente se dibuja
   *   encima del juego y por debajo del HUD: es parte de lo que se ve, no
   *   interfaz.
   */
  constructor(contenedor) {
    const doc = contenedor.ownerDocument
    inyectarEstilos(doc)

    this.root = doc.createElement('div')
    this.root.className = 'vk-scope'
    this.root.setAttribute('aria-hidden', 'true')
    this.root.innerHTML =
      '<div class="vk-scope__lente"></div>' +
      '<div class="vk-scope__cruz"><i></i><i></i><i></i><i></i></div>' +
      '<div class="vk-scope__punto"></div>'
    contenedor.appendChild(this.root)
    this._t = -1
    this.set(0)
  }

  /**
   * Dibuja la mirilla a medio camino: 0 es sin ella, 1 es puesta del todo.
   *
   * La lente entra **encogiendo** —de 1.25 a 1— en vez de sólo aparecer: es lo
   * que se lee como «el ojo se acerca al visor» y lo que hace que 140 ms se
   * noten como un gesto y no como un corte.
   */
  set(t) {
    const v = t < 0 ? 0 : t > 1 ? 1 : t
    if (v === this._t) return
    this._t = v
    const style = this.root.style
    style.setProperty('--vk-scope-t', v.toFixed(3))
    style.setProperty('--vk-scope-s', (1.25 - 0.25 * v).toFixed(4))
    this.root.classList.toggle('vk-scope--on', v > 0)
  }

  dispose() {
    this.root.remove()
  }
}
