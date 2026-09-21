/**
 * **La capa de interfaz del duelo** (vuelta 73).
 *
 * Aquí no se dibuja nada nuevo: se **monta** lo que ya existe. El HUD, la mira,
 * las opciones y la ficha de las armas son los mismos componentes que usa el
 * entrenamiento, y lo único que esta página necesitaba era un sitio donde
 * ponerlos.
 *
 * **Por qué hacía falta.** El duelo llevaba desde la vuelta 45 con su propio
 * HUD escrito a mano en `net/prueba.html`: su vida, su bloque de arma, su
 * cartel de abatido y su cuña de daño. Funcionaba, y por eso duró — pero era
 * una segunda implementación de la misma idea, que es lo que la convención de
 * la vuelta 63 llama **fallo de producto**: el precio se vio entero jugando y
 * son cinco cosas a la vez. Faltaba el chaleco (el HUD del entrenamiento lo
 * dibuja desde la vuelta 34 y el del duelo nunca lo tuvo, así que se compraba
 * un chaleco y no se veía), faltaba la marca de Vektor, faltaba la ficha de las
 * armas, **no había forma de abrir las opciones sin salir de la partida** y,
 * por eso mismo, la sensibilidad de la mirilla —que existe desde la vuelta 70—
 * era inalcanzable. Ninguna de las cinco era una decisión.
 *
 * La vuelta 67 ya había hecho esto mismo con dos piezas —la mira y la silueta
 * del arma— sacándolas a donde las pudieran llamar los dos. Esto es lo mismo
 * hasta el final.
 *
 * **Y la página sigue siendo una página aparte** (vuelta 45): `App.jsx` no sabe
 * que existe la red y esto no la toca. Lo que cambia es de dónde salen los
 * píxeles del duelo.
 *
 * **Nada de aquí se repinta por frame.** `hud.update(stats)` escribe por refs,
 * como en el entrenamiento; lo que pasa por React son pulsaciones —cambiar de
 * arma, poner la mirilla, abrir un panel—, que es la misma regla del HUD de
 * siempre.
 */

import { StrictMode, useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'

import Hud from './Hud.jsx'
import Crosshair from './Crosshair.jsx'
import Options from './Options.jsx'
import Armoury from './Armoury.jsx'
import { getKeybinds, subscribeKeybinds } from '../keybinds.js'
import { getSettings, resetSettings, subscribeSettings, updateSettings } from '../settings.js'

/**
 * **Y la hoja de estilos del juego, que es la misma** (vuelta 73). Sin esto el
 * HUD montaría sin una sola regla: las clases son las del entrenamiento porque
 * los componentes son los del entrenamiento. La página conserva sus estilos
 * propios en línea para lo que sí es suyo —el menú del código, la tienda, los
 * carteles de pausa y los números de F3—.
 */
import '../styles.css'

/**
 * El componente es **tonto a propósito**: no sabe de red ni de rondas. Recibe lo
 * que hay que enseñar y publica sus dos asas imperativas. Quien decide cuándo
 * cambia algo es la página, que es la que tiene el cliente.
 */
function CapaDuelo({ api, alCerrarPanel }) {
  const [arma, setArma] = useState({ weaponKey: 'pulse', suppressed: false })
  /**
   * **El dinero, que se enseña siempre** (vuelta 88). Vive aquí y no en `stats`
   * porque **no es un valor por frame**: cambia unas pocas veces por ronda —al
   * comprar y al cobrar— y llega por `MSG.ECONOMIA`, no en la foto. Es la misma
   * excepción que el arma desde la vuelta 39: lo que es una pulsación puede ser
   * estado de React sin saltarse la regla de no repintar por frame.
   *
   * `null` es «aquí no hay economía», y eso no es lo mismo que cero: en un mapa
   * que reparte (vuelta 72) o entrenando, un `$0` en pantalla diría que estás
   * arruinado en vez de que no hay tienda.
   */
  const [dinero, setDinero] = useState(null)
  const [jugando, setJugando] = useState(false)
  const [apuntando, setApuntando] = useState(false)
  const [aCuchillo, setACuchillo] = useState({ dentro: false, espalda: false })
  const [panel, setPanel] = useState(null)
  const [settings, setSettings] = useState(getSettings)
  const [binds, setBinds] = useState(getKeybinds)

  const hudRef = useRef(null)
  const miraRef = useRef(null)

  useEffect(() => subscribeSettings(setSettings), [])
  useEffect(() => subscribeKeybinds(setBinds), [])

  // Cerrar un panel devuelve la pantalla a quien la tenía: con el ratón suelto,
  // el menú. Lo decide la página, que es la que sabe qué había debajo.
  const cerrar = useCallback(() => {
    setPanel(null)
    alCerrarPanel?.()
  }, [alCerrarPanel])

  // El asa que usa la página. Se publica una vez y no cambia de identidad: la
  // página guarda la referencia y llama sesenta veces por segundo a `update`.
  useEffect(() => {
    api.hud = hudRef
    api.mira = miraRef
    api.setArma = setArma
    api.setDinero = setDinero
    api.setJugando = setJugando
    api.setApuntando = setApuntando
    api.setACuchillo = setACuchillo
    api.setPanel = setPanel
    api.leerPanel = () => panel
  })

  return (
    <>
      {/**
        * **El HUD del juego, en modo duelo.** `duelo` apaga los tres bloques que
        * aquí no miden nada —aciertos y fallos, estrellas y marcador de sesión—
        * porque el 1v1 no tiene puntuación (vuelta 45) y lleva su propio
        * marcador de ronda. Todo lo demás es exactamente el del entrenamiento.
        */}
      <Hud
        ref={hudRef}
        weaponKey={arma.weaponKey}
        suppressed={arma.suppressed}
        dinero={dinero}
        duelo
      />
      {jugando && <Crosshair ref={miraRef} hidden={apuntando} melee={aCuchillo.dentro} backstab={aCuchillo.espalda} />}

      {panel && (
        <div className="overlay" onMouseDown={(event) => event.stopPropagation()}>
          {panel === 'opciones' && (
            <Options
              settings={settings}
              binds={binds}
              onChange={updateSettings}
              onReset={resetSettings}
              onClose={cerrar}
            />
          )}
          {/**
            * **La ficha de las armas, de consulta** (vuelta 73). En el duelo lo
            * que llevas lo decide el servidor (vuelta 64), así que aquí la
            * armería **no equipa**: enseña. Es el mismo componente y el mismo
            * dato —`soloFicha` quita el botón y la casilla, no añade una
            * segunda ficha—, y por eso salen también la Scout y el Vanta con
            * sus números de verdad.
            */}
          {panel === 'ficha' && (
            <Armoury
              settings={settings}
              equipped={arma}
              onChange={updateSettings}
              onClose={cerrar}
              soloFicha
            />
          )}
        </div>
      )}
    </>
  )
}

/**
 * Monta la capa y devuelve el asa imperativa que usa `net/prueba.js`.
 *
 * @param {HTMLElement} contenedor dónde vive la capa. Va fuera del lienzo y por
 *   encima de él, como en el juego.
 * @param {{ alCerrarPanel?: () => void }} [opciones] qué hacer al cerrar un panel:
 *   lo decide la página, que es la que sabe qué había debajo.
 */
export function montarCapaDeDuelo(contenedor, { alCerrarPanel } = {}) {
  // La tipografía del juego, que no es la de esta página (ver `.hud-layer`).
  contenedor.classList.add('hud-layer')
  const api = {}
  createRoot(contenedor).render(
    <StrictMode>
      <CapaDuelo api={api} alCerrarPanel={alCerrarPanel} />
    </StrictMode>,
  )
  return {
    /** Por frame. Escribe por refs; si aún no ha montado, no hace nada. */
    pintar: (stats) => api.hud?.current?.update(stats),
    dano: (fraccion, rumbo) => {
      api.hud?.current?.damageFrom(rumbo ?? 0, fraccion)
      api.mira?.current?.damage(fraccion)
    },
    ayuda: (texto, ms) => api.hud?.current?.showHelp(texto, ms),
    arma: (weaponKey, suppressed) => api.setArma?.({ weaponKey, suppressed }),
    /** Cuánto dinero lleva, o `null` si en esta partida no hay tienda. */
    dinero: (valor) => api.setDinero?.(valor),
    jugando: (valor) => api.setJugando?.(valor),
    apuntando: (valor) => api.setApuntando?.(valor),
    aCuchillo: (dentro, espalda) => api.setACuchillo?.({ dentro, espalda: Boolean(espalda) }),
    /** `null`, `'opciones'` o `'ficha'`. */
    panel: (cual) => api.setPanel?.(cual),
    hayPanel: () => Boolean(api.leerPanel?.()),
  }
}
