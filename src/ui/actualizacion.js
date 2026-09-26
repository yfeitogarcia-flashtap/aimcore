/**
 * **Que un despliegue nuevo llegue solo al navegador del jugador** (vuelta 93).
 *
 * El problema que arregla se reportó así: «tuve que forzar un borrado de caché
 * en Edge para ver el mapa». Las cabeceras del huésped estaban **bien** —medido:
 * el HTML iba `no-cache` y los `assets/` inmutables— y aun así pasó, porque
 * `no-cache` le pide al navegador que revalide y confía en que lo haga. Eso se
 * arregla por su lado (`no-store` + `ETag`, en `net/servidor.mjs`), pero deja
 * fuera el caso que de verdad importa en una beta:
 *
 * **nadie recarga.** Un tester abre la pestaña, juega una hora, y mientras tanto
 * se despliega tres veces. Ninguna cabecera del mundo arregla una página que no
 * se vuelve a pedir. Así que la página pregunta.
 *
 * Cuatro reglas, y ninguna es tuning:
 *
 * - **La huella ya existe y no se inventa ninguna.** `/salud` publica desde la
 *   vuelta 61 los nombres de los assets que este proceso sirve, que Vite saca
 *   del contenido. Se creó para que un banco supiera contra qué build medía, y
 *   contesta exactamente la misma pregunta para un jugador: *¿es esto lo último
 *   que hay?* Un endpoint nuevo sería una segunda idea de qué versión corre.
 * - **Nunca recarga jugando.** Recargar en mitad de una ronda es peor que una
 *   versión vieja: se pierde la partida, y en un duelo se la pierde también el
 *   rival. Quien decide **cuándo** es `puedeRecargar()`, que pregunta a la
 *   página; lo único que hace esto por su cuenta es avisar.
 * - **Y avisa una vez.** No es un cartel que vuelve cada tres minutos: la huella
 *   nueva se guarda al anunciarla, así que el aviso sale cuando cambia y no
 *   mientras siga cambiada.
 * - **No existe en desarrollo.** Ahí está el HMR de Vite, que hace esto mejor y
 *   de verdad, y el servidor de desarrollo ni siquiera tiene `/salud`.
 */
import { ACTUALIZACION } from '../config.js'

let puesto = false

/**
 * @param {object} opciones
 * @param {() => boolean} [opciones.puedeRecargar] ¿se puede recargar ahora mismo
 *   sin quitarle nada a nadie? De fábrica, siempre — lo dice quien lo monta.
 */
export function vigilarActualizaciones({ puedeRecargar = () => true } = {}) {
  // **En desarrollo, nada.** Ver arriba: ahí manda el HMR.
  if (import.meta.env?.DEV) return () => {}
  if (puesto) return () => {}
  puesto = true

  let huella = null
  let anunciada = null
  let aviso = null

  const preguntar = async () => {
    let datos
    try {
      // `no-store` en la propia petición: preguntar si hay versión nueva a una
      // caché es preguntárselo a quien no lo sabe.
      const respuesta = await fetch('/salud', { cache: 'no-store' })
      if (!respuesta.ok) return
      datos = await respuesta.json()
    } catch {
      // Sin red no hay versión nueva que anunciar. Se reintenta al siguiente.
      return
    }
    const ahora = datos?.build
    if (typeof ahora !== 'string' || !ahora) return
    if (huella === null) { huella = ahora; return }
    if (ahora === huella || ahora === anunciada) return
    anunciada = ahora
    mostrar()
  }

  const recargar = () => {
    // `reload()` a secas puede servirse de la caché de la pestaña. Lo que
    // garantiza el viaje es cambiar la dirección, así que se le cuelga la
    // huella nueva: distinta dirección, descarga nueva, y la siguiente visita
    // sin parámetro vuelve a la limpia.
    const url = new URL(window.location.href)
    url.searchParams.set('v', Date.now().toString(36))
    window.location.replace(url.toString())
  }

  function mostrar() {
    if (aviso) return
    inyectarEstilos()
    aviso = document.createElement('div')
    aviso.className = 'vektor-update'
    aviso.innerHTML = `
      <span class="vektor-update__texto">Hay una versión nueva de Vektor</span>
      <button type="button" class="vektor-update__boton">Actualizar</button>
      <button type="button" class="vektor-update__cerrar" aria-label="Ahora no">×</button>`
    aviso.querySelector('.vektor-update__boton').addEventListener('click', recargar)
    aviso.querySelector('.vektor-update__cerrar').addEventListener('click', () => {
      aviso.remove()
      aviso = null
    })
    document.body.appendChild(aviso)

    // **Y si en algún momento se puede recargar sin molestar, se recarga sola.**
    // Es lo que hace que un tester que no pulse nada acabe en la versión buena:
    // al volver al menú, entre rondas, con el juego parado. Mientras juega, el
    // cartel espera.
    const reloj = setInterval(() => {
      if (!aviso) return clearInterval(reloj)
      if (puedeRecargar()) { clearInterval(reloj); recargar() }
    }, ACTUALIZACION.esperaParaRecargarMs)
  }

  preguntar()
  const reloj = setInterval(preguntar, ACTUALIZACION.compruebaCadaMs)
  return () => { clearInterval(reloj); puesto = false }
}

/**
 * Su propia hoja de estilos, inyectada una vez — la disciplina de `scope.js` y
 * `granadas.js` (vuelta 70): las dos páginas tienen CSS distinto, así que un
 * bloque copiado en cada una es el mismo cartel escrito dos veces.
 */
let estilos = false
function inyectarEstilos() {
  if (estilos) return
  estilos = true
  const hoja = document.createElement('style')
  hoja.textContent = `
    .vektor-update {
      position: fixed; z-index: 9999; left: 50%; bottom: 22px;
      transform: translateX(-50%);
      display: flex; align-items: center; gap: 12px;
      padding: 10px 12px 10px 16px;
      background: #121212; border: 1px solid #2FCB82;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 12px; color: #E8E8E8; letter-spacing: .04em;
    }
    .vektor-update__boton {
      border: 1px solid #2FCB82; background: transparent; color: #2FCB82;
      font: inherit; letter-spacing: .12em; text-transform: uppercase;
      padding: 6px 14px; cursor: pointer;
    }
    .vektor-update__boton:hover { background: #2FCB82; color: #08130D; }
    .vektor-update__cerrar {
      border: 0; background: transparent; color: #6B6B6B;
      font-size: 16px; line-height: 1; cursor: pointer; padding: 2px 4px;
    }
    .vektor-update__cerrar:hover { color: #E8E8E8; }`
  document.head.appendChild(hoja)
}

/* cache93 */

/* cache93 */
