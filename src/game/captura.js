/**
 * **La captura del ratón, y volver a ella a la primera** (vuelta 105, F2).
 *
 * Una sola pieza para las dos páginas —el entrenamiento y el multijugador—,
 * por la convención de la vuelta 63. Hace cuatro cosas:
 *
 * - **Sabe quién soltó el ratón.** La página lo suelta con `soltarRaton()`;
 *   cualquier otra salida (ESC, perder el foco) es del usuario. Chrome trata las
 *   dos distinto: tras una del usuario exige un gesto y algo más de un segundo
 *   de espera; tras una de la página, nada (`CAPTURA`, en `config.js`).
 * - **Reintenta mientras haya gesto.** Un clic o REANUDAR dentro de la espera
 *   fallaban sin decir nada; el gesto dura unos segundos, así que la petición se
 *   repite al acabar la espera y, si Chrome la rechaza, unas pocas veces más.
 * - **Y si no hay gesto, lo dice.** Un ESC no lo es, así que tras un rato sin
 *   tocar el ratón ESC no puede volver: sale un aviso, «Haz clic o pulsa
 *   cualquier tecla», y **cualquier tecla que no sea ESC** vuelve, porque ésa sí
 *   es un gesto. Nunca se queda atascado en silencio.
 * - **En la app de escritorio, ESC es de la ventana** (`main.rs`), como F11: la
 *   ventana se lo cuenta a la página (`vektor:escape`), la página suelta el
 *   ratón ella misma y por eso vuelve sin gesto, a la primera y siempre. Con el
 *   ratón ya suelto, ese ESC llega a la página como una pulsación normal, así
 *   que los menús lo entienden igual que en el navegador.
 */

import { CAPTURA, COLORS, RESUME_KEY_DELAY_MS } from '../config.js'
import { esEscritorio } from '../escritorio.js'
import { typingInField } from '../keybinds.js'

const ESTILO_ID = 'vk-captura-css'

/** Cómo se soltó la última vez. */
let salida = { t: -Infinity, porUsuario: false }
/** La página acaba de pedir soltarlo: el próximo cambio es suyo. */
let porLaPagina = false
/** Lo que hace la petición de verdad (el motor, con su `unadjustedMovement`). */
let pedirReal = null
let reintento = null
let intentos = 0
let aviso = null
let montado = false
let ultimoEscDeLaVentana = -Infinity

const activa = () => (navigator.userActivation ? navigator.userActivation.isActive : true)

/** Suelta el ratón **como página**: volver no pedirá gesto ni espera. */
export function soltarRaton() {
  if (!document.pointerLockElement) return
  porLaPagina = true
  document.exitPointerLock()
}

/** ¿Lo último fue una salida del usuario? Lo miran los bancos. */
export function ultimaSalida() {
  return { ...salida }
}

/**
 * **Pide volver a capturar**, con reintento y aviso. `pedir` hace la petición y
 * devuelve la promesa de `requestPointerLock` (o nada, en navegadores viejos).
 */
export function pedirCaptura(pedir) {
  montarCaptura()
  pedirReal = pedir
  intentos = 0
  intentar()
}

/** La página se va a otra cosa (un menú, el resumen): nada pendiente. */
export function cancelarCaptura() {
  cancelarReintento()
  ocultarAviso()
}

function cancelarReintento() {
  if (reintento !== null) clearTimeout(reintento)
  reintento = null
}

function intentar() {
  cancelarReintento()
  if (document.pointerLockElement || !pedirReal) return
  if (salida.porUsuario) {
    const falta = RESUME_KEY_DELAY_MS - (performance.now() - salida.t)
    if (falta > 0) {
      reintento = setTimeout(intentar, falta)
      return
    }
    // Sin gesto, Chrome la rechaza seguro: se dice ya en vez de probar.
    if (!activa()) {
      mostrarAviso()
      return
    }
  }
  let resultado
  try {
    resultado = pedirReal()
  } catch {
    fallo()
    return
  }
  if (resultado && typeof resultado.then === 'function') resultado.then(null, fallo)
}

function fallo() {
  if (document.pointerLockElement || reintento !== null) return
  if (activa() && intentos < CAPTURA.reintentos) {
    intentos += 1
    reintento = setTimeout(intentar, CAPTURA.reintentoMs)
    return
  }
  mostrarAviso()
}

function mostrarAviso() {
  if (!aviso) return
  aviso.classList.add('vk-captura--on')
}

function ocultarAviso() {
  aviso?.classList.remove('vk-captura--on')
}

/** ¿Está el aviso puesto? Lo miran los bancos. */
export function avisoDeCaptura() {
  return Boolean(aviso?.classList.contains('vk-captura--on'))
}

function inyectarEstilos() {
  if (document.getElementById(ESTILO_ID)) return
  const style = document.createElement('style')
  style.id = ESTILO_ID
  style.textContent = `
.vk-captura {
  position: fixed;
  left: 50%;
  bottom: 12vh;
  transform: translateX(-50%);
  z-index: 60;
  display: none;
  padding: 10px 18px;
  background: rgba(10, 10, 10, 0.92);
  border: 1px solid ${COLORS.action};
  color: #fff;
  font: 600 15px/1.3 system-ui, sans-serif;
  letter-spacing: 0.04em;
  pointer-events: none;
  white-space: nowrap;
}
.vk-captura--on { display: block; }
.vk-captura b { color: ${COLORS.action}; }
`
  document.head.appendChild(style)
}

/**
 * Se monta una vez por documento: la escucha del cambio de captura, las dos
 * formas de dar el gesto que falta y, en la app, el ESC de la ventana.
 */
export function montarCaptura() {
  if (montado || typeof document === 'undefined') return
  montado = true
  inyectarEstilos()
  aviso = document.createElement('div')
  aviso.className = 'vk-captura'
  aviso.setAttribute('role', 'status')
  aviso.innerHTML = '<b>Haz clic</b> o pulsa cualquier tecla para volver a la partida'
  document.body.appendChild(aviso)

  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement) {
      cancelarCaptura()
      intentos = 0
      return
    }
    salida = { t: performance.now(), porUsuario: !porLaPagina }
    porLaPagina = false
  })
  // Navegadores en los que la petición no devuelve promesa: el rechazo llega aquí.
  document.addEventListener('pointerlockerror', () => {
    if (reintento === null) fallo()
  })
  // **Un clic manda la página**: es un gesto, y lo que haga con él (volver, abrir
  // opciones) lo decide ella. Lo que no puede quedar es un reintento pendiente
  // que capture el ratón con un panel recién abierto.
  window.addEventListener('pointerdown', () => {
    cancelarReintento()
    ocultarAviso()
  }, true)
  // **Y cualquier tecla que no sea ESC es el gesto que faltaba.** Con el aviso
  // puesto, esa tecla sólo sirve para volver: si además siguiera su camino, una B
  // abriría la tienda a la vez que se captura el ratón.
  window.addEventListener('keydown', (evento) => {
    if (!avisoDeCaptura() || evento.key === 'Escape' || typingInField()) return
    evento.preventDefault()
    evento.stopImmediatePropagation()
    intentos = 0
    ocultarAviso()
    intentar()
  }, true)

  if (esEscritorio()) {
    // **Una pulsación de ESC es una, llegue por donde llegue** (vuelta 107, F3).
    // El atajo de la ventana no siempre se come la tecla: el WebView la entrega
    // también a la página, así que un ESC eran **dos** —el de verdad y el aviso de
    // la ventana, unos milisegundos después—. Con el ratón suelto el primero
    // pedía volver y el segundo, que ya encontraba el ratón capturado, lo volvía
    // a soltar: la partida parpadeaba y se quedaba en pausa. La que llega primero
    // actúa y la otra, dentro de `escRepeticionMs`, se tira.
    window.addEventListener('keydown', (evento) => {
      if (evento.key !== 'Escape' || !evento.isTrusted) return
      const ahora = performance.now()
      if (evento.repeat || ahora - ultimoEscDeLaVentana < CAPTURA.escRepeticionMs) {
        evento.preventDefault()
        evento.stopImmediatePropagation()
        return
      }
      ultimoEscDeLaVentana = ahora
    }, true)
    window.addEventListener('vektor:escape', () => {
      const ahora = performance.now()
      if (ahora - ultimoEscDeLaVentana < CAPTURA.escRepeticionMs) return
      ultimoEscDeLaVentana = ahora
      if (document.pointerLockElement) {
        soltarRaton()
        return
      }
      const destino = document.activeElement && document.activeElement !== document.body ? document.activeElement : document
      for (const tipo of ['keydown', 'keyup']) {
        destino.dispatchEvent(new KeyboardEvent(tipo, { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }))
      }
    })
  }
}
