/**
 * **Lo imprescindible de la beta, del lado del jugador** (vuelta 107): mandar
 * feedback y contar un entrenamiento. Sin cookies ni identificadores —las dos
 * peticiones van con `credentials: 'omit'`— y lo que viaja se dice en pantalla.
 *
 * El contexto (en qué pantalla, modo y mapa) lo registra cada página, que es la
 * que lo sabe: el juego y el multijugador son dos páginas y un solo panel.
 */
import { versionDeEscritorio, esEscritorio } from './escritorio.js'

let contexto = () => ({})

/** Cada página dice dónde está: `{ donde, modo, mapa }`. */
export function registrarContextoDeFeedback(fn) {
  contexto = fn
}

/** La versión que se está jugando: la huella del build, sacada de la propia página. */
function version() {
  const script = document.querySelector('script[type="module"][src*="/assets/"]')
  const nombre = script?.getAttribute('src')?.split('/').pop() ?? ''
  return nombre.replace(/\.js$/, '') || 'desarrollo'
}

/** Lo que se manda, tal cual: lo enseña el panel antes de enviarlo. */
export function datosDeFeedback(texto) {
  const c = contexto() ?? {}
  return {
    texto,
    donde: c.donde ?? '',
    modo: c.modo ?? '',
    mapa: c.mapa ?? '',
    version: esEscritorio() ? `${version()} · app ${versionDeEscritorio() ?? ''}` : version(),
    app: esEscritorio(),
  }
}

/** Lo manda. Devuelve `{ ok, error? }`: el panel dice cuál de las dos. */
export async function enviarFeedback(texto) {
  try {
    const respuesta = await fetch('/feedback', {
      method: 'POST',
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datosDeFeedback(texto)),
    })
    const cuerpo = await respuesta.json().catch(() => ({}))
    if (!respuesta.ok) return { ok: false, error: cuerpo.error ?? `el servidor ha dicho ${respuesta.status}` }
    return { ok: true }
  } catch {
    return { ok: false, error: import.meta.env.DEV ? 'en desarrollo no hay buzón: se prueba con npm run host' : 'no hay conexión con el servidor' }
  }
}

/** Un entrenamiento más para el contador. Sin respuesta que esperar y sin nada de quién. */
export function contarEntreno() {
  if (import.meta.env.DEV) return
  try {
    fetch('/contador/entreno', { method: 'POST', credentials: 'omit', keepalive: true }).catch(() => {})
  } catch { /* sin red, no cuenta */ }
}

// ------------------------------------------------------- cómo se juega

const CLAVE_VISTO = 'vektor.comoSeJuega.v1'

/**
 * ¿Hay que enseñar «cómo se juega»? Sólo la primera vez; sin almacenamiento,
 * siempre. **Y no a un navegador automatizado** (`navigator.webdriver`), salvo
 * que lo pida (`window.__vkComoSeJuega`): una veintena de bancos pulsan «Jugar
 * ahora» en un navegador recién estrenado para medir lo que hay detrás, y un
 * banco no es un jugador nuevo. El que mide esta pantalla la pide (`beta107`).
 */
export function tocaComoSeJuega() {
  if (navigator.webdriver && !window.__vkComoSeJuega) return false
  try {
    return localStorage.getItem(CLAVE_VISTO) !== '1'
  } catch {
    return true
  }
}

export function comoSeJuegaVisto() {
  try {
    localStorage.setItem(CLAVE_VISTO, '1')
  } catch { /* se volverá a enseñar, y ya */ }
}
