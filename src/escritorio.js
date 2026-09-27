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
 * usuario y la marca inyectada viajan con la ventana vaya a donde vaya; el IPC de Tauri sólo funciona
 * si la URL cargada está en la lista de la capacidad. Así que un cambio de
 * dominio mal acompañado deja la tecla de agacharse funcionando y la pantalla
 * completa muda —que es el orden correcto de los dos fallos, y está escrito en
 * `escritorio/README.md` junto a la línea que hay que tocar.
 */
import { ESCRITORIO } from './config.js'
import { getSettings, subscribeSettings, updateSettings } from './settings.js'

/**
 * Se calcula una vez: las dos señales están puestas antes de que corra ningún
 * script de la página, y esto lo pregunta el saneado de los binds, que corre al
 * importar el módulo.
 */
let esLaApp = null

/**
 * **La marca que inyecta la ventana** (vuelta 98): `window.__VEKTOR_ESCRITORIO__`,
 * puesta por Tauri en cada documento antes que ningún script suyo, con la versión
 * de la app dentro.
 */
function marcaInyectada() {
  const w = typeof window === 'undefined' ? null : window
  const marca = w?.[ESCRITORIO.marcaGlobal]
  return marca && typeof marca === 'object' ? marca : null
}

/**
 * ¿Corre esto dentro de la ventana de escritorio?
 *
 * **Dos señales, y basta una** (vuelta 98). En la 97 era sólo el agente de
 * usuario, y en la app de verdad la página no se enteró: F11 no hacía nada y la
 * fila de pantalla completa no salía en opciones, sin un error en ninguna
 * pantalla. Las dos son nativas y **ninguna depende del origen** —que es la
 * regla de la 97 y sigue en pie—: el agente de usuario lo pone la
 * configuración de la ventana y la marca, un script de inicio que la ventana
 * inyecta en cualquier documento. Que fallen las dos a la vez pide que falle
 * Tauri entero.
 */
export function esEscritorio() {
  if (esLaApp === null) {
    const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent ?? ''
    esLaApp = marcaInyectada() !== null || ua.includes(ESCRITORIO.marcaUA)
  }
  return esLaApp
}

/**
 * **Qué versión de la app es**, o `null` en un navegador. Es lo que enseña el
 * panel de opciones, y existe por lo que costó la vuelta 97: la única forma de
 * saber desde fuera que la página se ha enterado de dónde está es que lo diga.
 * Sale de la marca, y si no hay marca, del agente de usuario
 * (`VektorEscritorio/0.3`).
 */
export function versionDeEscritorio() {
  if (!esEscritorio()) return null
  const marca = marcaInyectada()
  if (typeof marca?.version === 'string') return marca.version
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent ?? ''
  const trozo = ua.split(`${ESCRITORIO.marcaUA}/`)[1]
  return trozo ? trozo.split(' ')[0] : '?'
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
    // El argumento se llama `value` (el `setter!` de Tauri 2); hasta la 99 se
    // mandaba `fullscreen`, así que este repuesto no habría hecho nada.
    () => invocar('plugin:window|set_fullscreen', { value: puesta }),
  )
}

/**
 * **Salir de la app** (vuelta 99). Lo pide a la ventana, que es la única que
 * puede: una página no se cierra sola. De repuesto, cierra la ventana con la
 * orden de Tauri, y cerrar la única ventana termina la aplicación. En un
 * navegador no hace nada y devuelve `false`, y por eso el botón no se enseña
 * ahí (ver `App.jsx`).
 */
export function salirDeLaApp() {
  if (!esEscritorio()) return false
  return invocar(ESCRITORIO.ordenSalir, {}, () => invocar('plugin:window|close', {}))
}

let puesto = false

/**
 * **Monta la pantalla completa de la app**: aplica el ajuste al cargar, lo sigue
 * mientras cambie, y escucha lo que haga F11.
 *
 * Lo montan **las dos páginas** —el juego y el duelo—, como el vigilante de
 * actualizaciones y por la misma razón: es de la ventana, no de un modo, y una
 * segunda copia en la página del 1v1 sería la vuelta 63 por la puerta del
 * escritorio.
 *
 * Cuatro detalles que no se adivinan:
 *
 * - **F11 es de la ventana** desde la vuelta 98 (`escritorio/src-tauri`): la
 *   pone o la quita ella, y **aquí llega el aviso** (`ESCRITORIO.avisoPantallaCompleta`)
 *   para que el ajuste diga lo mismo. Eso hace que F11 funcione aunque esta
 *   página no llegara a saber dónde está, que es el fallo que tuvo la 97.
 * - **Y el aviso no rebota.** Se anota lo que la ventana ya ha puesto *antes* de
 *   escribir el ajuste, así que la suscripción ve un valor que ya está y no se lo
 *   vuelve a pedir.
 * - **La escucha de F11 de aquí se queda de repuesto**: sólo le llega la tecla si
 *   la ventana no ha podido quedarse con el atajo (otra aplicación lo tenía). En
 *   un navegador F11 es suyo y no se toca, y sigue en `FORBIDDEN_KEYS`.
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

  const alAvisar = (evento) => {
    const activa = Boolean(evento.detail)
    ultima = activa
    if (getSettings().pantallaCompleta !== activa) updateSettings({ pantallaCompleta: activa })
  }
  window.addEventListener(ESCRITORIO.avisoPantallaCompleta, alAvisar)

  const alPulsar = (evento) => {
    if (evento.code !== 'F11' || evento.repeat) return
    evento.preventDefault()
    updateSettings({ pantallaCompleta: !getSettings().pantallaCompleta })
  }
  window.addEventListener('keydown', alPulsar)

  return () => {
    dejarDeEscuchar()
    window.removeEventListener(ESCRITORIO.avisoPantallaCompleta, alAvisar)
    window.removeEventListener('keydown', alPulsar)
    puesto = false
  }
}
