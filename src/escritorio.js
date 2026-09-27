/**
 * **¿Esto es la ventana de escritorio, y qué se le puede pedir?** (vuelta 97).
 *
 * La app de Tauri no contiene el juego: abre la URL del despliegue, así que el
 * código que corre dentro es este mismo. De ahí que la pregunta *¿dónde estoy?*
 * tenga que contestarla la página, y que la conteste **una sola función**: dos
 * ideas de «estoy en la app» se separan el día que una cambie de señal.
 *
 * Lo que cuelga de ella son dos cosas y nada más:
 *
 * - **`Ctrl` puede ser una tecla del juego** (`keybinds.js`). Aquí no hay pestaña
 *   que cerrar, así que la prohibición de la vuelta 27 no protege de nada.
 * - **La pantalla completa es de verdad**, o sea de la ventana y no de un
 *   elemento del documento.
 *
 * Y una regla que las separa, porque no dependen de lo mismo: **saber dónde
 * estamos no depende del origen; pedirle algo a la ventana, sí.** El agente de
 * usuario viaja con la ventana vaya a donde vaya; el IPC de Tauri sólo funciona
 * si la URL cargada está en la lista de la capacidad. Así que un cambio de
 * dominio mal acompañado deja la tecla de agacharse funcionando y la pantalla
 * completa muda —que es el orden correcto de los dos fallos, y está escrito en
 * `escritorio/README.md` junto a la línea que hay que tocar.
 */
import { ESCRITORIO } from './config.js'
import { getSettings, subscribeSettings, updateSettings } from './settings.js'

/**
 * Se calcula una vez: el agente de usuario no cambia mientras la página vive, y
 * esto lo pregunta el saneado de los binds, que corre al importar el módulo.
 */
let esLaApp = null

/** ¿Corre esto dentro de la ventana de escritorio? */
export function esEscritorio() {
  if (esLaApp === null) {
    const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent ?? ''
    esLaApp = ua.includes(ESCRITORIO.marcaUA)
  }
  return esLaApp
}

/**
 * **Pedirle algo al proceso nativo.** Tauri inyecta su puente en la página antes
 * de que corra ningún script suyo, y se busca en los dos sitios donde puede
 * estar: `window.__TAURI__` existe con `withGlobalTauri` puesto y
 * `window.__TAURI_INTERNALS__` está siempre. Dos caminos y no uno porque el
 * primero es el documentado y el segundo el que no depende de un interruptor de
 * la configuración.
 *
 * Devuelve `false` **sin tirar nada** si no hay puente: en un navegador esto no
 * es un error, es que no hay ventana a la que pedirle nada.
 */
function puenteDeTauri() {
  const w = typeof window === 'undefined' ? null : window
  return w?.__TAURI__?.core?.invoke ?? w?.__TAURI_INTERNALS__?.invoke ?? null
}

function invocar(orden, argumentos, deRepuesto = null) {
  const fn = puenteDeTauri()
  if (typeof fn !== 'function') return false
  try {
    // Se lanza y no se espera: lo que contesta el proceso nativo no cambia nada
    // de esta página, y un `await` aquí metería una promesa en el camino de una
    // tecla. El fallo se anota y no se propaga, que es lo mismo que hace el
    // `try/catch` de localStorage.
    Promise.resolve(fn(orden, argumentos)).catch((error) => {
      console.warn('[vektor] la ventana no ha atendido', orden, error)
      if (deRepuesto) deRepuesto()
    })
    return true
  } catch (error) {
    console.warn('[vektor] no se ha podido hablar con la ventana', error)
    return false
  }
}

/**
 * Pone o quita la pantalla completa de la ventana. `@returns {boolean}` si había
 * alguien al otro lado — lo usa el banco, y nadie más necesita saberlo.
 */
export function pedirPantallaCompleta(activa) {
  if (!esEscritorio()) return false
  const puesta = Boolean(activa)
  /**
   * **Y un seguro, por si la orden propia no llega** (vuelta 97). La ventana
   * atiende dos cosas: `pantalla_completa`, que es nuestra y además **recuerda**
   * la elección, y la del propio Tauri, que sólo mueve la ventana. La segunda
   * está permitida explícitamente en la capacidad
   * (`core:window:allow-set-fullscreen`), así que si un día la nuestra se
   * quedara fuera por un cambio del modelo de permisos, lo que se pierde es
   * *arrancar así* y no *ponerse a pantalla completa*. El orden es ése y no el
   * contrario: se pide la que hace las dos cosas, y sólo si falla la que hace
   * una.
   */
  return invocar(
    ESCRITORIO.ordenPantallaCompleta,
    { activa: puesta },
    () => invocar('plugin:window|set_fullscreen', { fullscreen: puesta }),
  )
}

let puesto = false

/**
 * **Monta la pantalla completa de la app**: aplica el ajuste al cargar, lo sigue
 * mientras cambie, y pone F11 a alternarlo.
 *
 * Lo montan **las dos páginas** —el juego y el duelo—, como el vigilante de
 * actualizaciones y por la misma razón: es de la ventana, no de un modo, y una
 * segunda copia en la página del 1v1 sería la vuelta 63 por la puerta del
 * escritorio.
 *
 * Tres detalles que no se adivinan:
 *
 * - **F11 sólo se toca en la app.** En un navegador esa tecla es suya y ya hace
 *   esto; interceptarla sería pelearse por un gesto que ya funciona, y encima
 *   `preventDefault` no la para (es la regla de `Ctrl+W` de la vuelta 27 con otra
 *   tecla). Sigue en `FORBIDDEN_KEYS`, así que tampoco se puede asignar a nada.
 * - **F11 escribe el ajuste, no la ventana.** Alternar y recordar son la misma
 *   acción (`SETTINGS.pantallaCompleta`), así que quien manda es el store y la
 *   ventana obedece a su suscripción. Llamar a la ventana aquí además sería
 *   pedírselo dos veces.
 * - **Y no se repite lo que ya está puesto.** Al arrancar, la ventana ya viene
 *   en pantalla completa si lo estaba (lo lee de su copia en frío), así que el
 *   primer aviso se manda igual —es idempotente— pero los cambios de otros
 *   ajustes no lo tocan.
 */
export function montarPantallaCompleta() {
  if (!esEscritorio() || puesto) return () => {}
  puesto = true

  let ultima = null
  const aplicar = (activa) => {
    if (activa === ultima) return
    ultima = activa
    pedirPantallaCompleta(activa)
  }

  aplicar(getSettings().pantallaCompleta)
  const dejarDeEscuchar = subscribeSettings((ajustes) => aplicar(ajustes.pantallaCompleta))

  const alPulsar = (evento) => {
    if (evento.code !== 'F11' || evento.repeat) return
    evento.preventDefault()
    updateSettings({ pantallaCompleta: !getSettings().pantallaCompleta })
  }
  window.addEventListener('keydown', alPulsar)

  return () => {
    dejarDeEscuchar()
    window.removeEventListener('keydown', alPulsar)
    puesto = false
  }
}
