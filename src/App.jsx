import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import {
  COLORS,
  CROSSHAIR,
  FEEDBACK,
  MOVEMENT,
  NET,
  RESUME_KEY_DELAY_MS,
} from './config.js'
import { Engine, PHASE } from './game/engine.js'
import { disposeAudio } from './audio/sfx.js'
import { getKeybinds, subscribeKeybinds } from './keybinds.js'
import { getSettings, resetSettings, subscribeSettings, updateSettings } from './settings.js'
import Crosshair from './ui/Crosshair.jsx'
import { VektorLogo } from './ui/Logo.jsx'
import Hud from './ui/Hud.jsx'
import Armoury from './ui/Armoury.jsx'
import Options from './ui/Options.jsx'
import Training from './ui/Training.jsx'
import Summary from './ui/Summary.jsx'

/**
 * Une el motor (three.js, imperativo) con el HUD (React, declarativo).
 *
 * React sólo se entera de dos cosas: en qué fase estamos y cuál fue el
 * resultado final. Los contadores y el cronómetro llegan al DOM por refs desde
 * el bucle de render, así que una partida entera provoca un puñado de renders
 * de React, no miles.
 */
export default function App() {
  const canvasRef = useRef(null)
  const engineRef = useRef(null)
  const hudRef = useRef(null)
  const crosshairRef = useRef(null)

  const [phase, setPhase] = useState(PHASE.IDLE)
  const [summary, setSummary] = useState(null)
  const [engineError, setEngineError] = useState(null)
  const [optionsOpen, setOptionsOpen] = useState(false)
  /**
   * **La armería.** Se abre con su tecla o con su botón, y jugando pausa: el
   * motor suelta el ratón antes de avisar, así que aquí sólo hay que enseñarla.
   */
  const [armouryOpen, setArmouryOpen] = useState(false)
  /**
   * **Por dónde va el menú de inicio** (vuelta 92): `marca`, `modos` o
   * `entrenamiento`.
   *
   * Hasta aquí la pantalla de inicio era **una sola** con cinco botones en
   * fila —dos modos, el duelo, la armería y las opciones— más tres párrafos de
   * instrucciones encima. Lo que eso produce es lo que se reportó del panel de
   * opciones por otra puerta: el primer contacto con el juego es una lista, y
   * en una lista de cinco cosas iguales no hay ninguna que sea *la* que hay que
   * pulsar.
   *
   * Tres pasos, y cada uno hace **una** pregunta: ¿juegas? → ¿a qué? → ¿cómo?
   * El logotipo se queda solo con su botón, que es lo que se pidió; las
   * instrucciones bajan al segundo paso, donde ya hay sitio y donde todavía no
   * estorban a nadie.
   *
   * Y es estado y no ruta a propósito: `App.jsx` no tiene router, y meterlo
   * para tres pantallas de menú sería una dependencia para un `useState`.
   */
  const [menu, setMenu] = useState('marca')
  /** Vista del avatar: mientras está abierta, los paneles se apartan. */
  const [avatarDebug, setAvatarDebug] = useState(false)
  /**
   * **El arma que se lleva en la mano**, que desde la vuelta 39 ya no es la del
   * ajuste: se llevan dos y la tecla decide cuál. Lo publica el motor cuando
   * cambia —una pulsación—, no en cada frame, así que puede ser estado de React
   * sin saltarse la regla de no repintar por frame.
   */
  const [equipped, setEquipped] = useState({ weaponKey: getSettings().weapon, suppressed: false })
  const [apuntando, setApuntando] = useState(false)
  const [aCuchillo, setACuchillo] = useState(false)
  const [porLaEspalda, setPorLaEspalda] = useState(false)

  // El store de ajustes vive fuera de React porque el motor también lo lee.
  const settings = useSyncExternalStore(subscribeSettings, getSettings)
  // Y el de teclas, por lo mismo: lo escribe el panel y lo lee el motor.
  const binds = useSyncExternalStore(subscribeKeybinds, getKeybinds)

  // La paleta vive en config.js; aquí sólo la publicamos como variables CSS
  // para que las hojas de estilo no repitan ningún color a mano.
  useLayoutEffect(() => {
    const root = document.documentElement.style
    root.setProperty('--crosshair-color', COLORS.crosshair)
    // **Y su forma, que desde la vuelta 67 es la misma en los dos modos.** Los
    // tres números viven en `CROSSHAIR` y los publican las dos páginas: el CSS
    // sigue teniendo un valor de partida por si esto no llega a correr.
    root.setProperty('--crosshair-gap', `${CROSSHAIR.gapPx}px`)
    root.setProperty('--crosshair-length', `${CROSSHAIR.lengthPx}px`)
    root.setProperty('--crosshair-thickness', `${CROSSHAIR.thicknessPx}px`)
    root.setProperty('--background-color', COLORS.background)
    root.setProperty('--accent-color', COLORS.target)
    root.setProperty('--action-color', COLORS.action)
    root.setProperty('--electric-color', COLORS.electric)
    root.setProperty('--health-color', COLORS.health)
    // El rojo de «te disparan» y las medidas de la cuña direccional: el tuning
    // sigue viviendo en config.js aunque quien lo dibuje sea una hoja de estilos.
    root.setProperty('--threat-color', COLORS.threat)
    root.setProperty('--damage-spread', `${FEEDBACK.damageArcSpreadDeg}deg`)
    root.setProperty('--damage-inner', `${FEEDBACK.damageArcInner * 100}%`)
  }, [])

  useEffect(() => {
    let engine
    try {
      engine = new Engine(canvasRef.current, {
        onPhaseChange: (next) => {
          setPhase(next)
          // El resumen se retira sólo cuando la sesión nueva arranca de verdad.
          if (next === PHASE.RUNNING) setSummary(null)
        },
        onFrame: (stats) => hudRef.current?.update(stats),
        onDamage: (severity, bearing) => {
          // Dos avisos y no uno: el anillo dice **cuánto** te han dado y la cuña
          // del borde **de dónde**. El primero está en la mira porque hay que
          // seguir mirando ahí; el segundo, justo en el borde contrario.
          crosshairRef.current?.damage(severity)
          hudRef.current?.damageFrom(bearing ?? 0, severity)
        },
        onHelp: (text, durationMs) => hudRef.current?.showHelp(text, durationMs),
        onOpenOptions: () => setOptionsOpen(true),
        // La tecla es un interruptor: abre si está cerrada y cierra si no. Al
        // cerrarla no se vuelve a capturar el ratón —queda la pausa de siempre,
        // con su click para continuar—, que es lo mismo que hacen las opciones.
        onArmoury: () => setArmouryOpen((open) => !open),
        onAvatarDebug: setAvatarDebug,
        onWeapon: setEquipped,
        /**
         * **Apuntando con mirilla, la mira de la página se quita** (vuelta 70).
         * La lente trae la suya —cruceta fina y punto rojo— y dos miras a la
         * vez es una encima de otra. El aviso es una pulsación, no un valor por
         * frame, así que puede ser estado de React: llega al cambiar de idea,
         * no sesenta veces por segundo.
         */
        onScope: setApuntando,
        /**
         * **Y si hay alguien a distancia de cuchillo** (vuelta 71): la mira se
         * abre y se tiñe. Es lo único que un arma sin modelo en la mano puede
         * decir antes de golpear. Pulsación, no valor por frame.
         */
        onMeleeRange: (dentro, espalda) => {
          setACuchillo(dentro)
          setPorLaEspalda(Boolean(espalda))
        },
        onFinish: setSummary,
      })
      engine.start()
    } catch (error) {
      // Sin WebGL no hay prototipo: mejor decirlo que dejar un canvas en negro.
      setEngineError(error?.message ?? 'No se pudo inicializar WebGL.')
      return undefined
    }
    engineRef.current = engine

    // Acceso al motor desde la consola para trastear con el tuning en
    // caliente. Sólo en desarrollo: Vite lo elimina del build de producción.
    if (import.meta.env.DEV) window.aimcore = engine

    return () => {
      engine.dispose()
      engineRef.current = null
      disposeAudio()
      if (import.meta.env.DEV) delete window.aimcore
    }
  }, [])

  /** Captura el ratón: reanuda una pausada o arranca donde toque. */
  const lock = useCallback(() => {
    engineRef.current?.requestLock()
  }, [])

  const startTimed = useCallback(() => engineRef.current?.requestStart('timed'), [])
  const startDeathmatch = useCallback(() => engineRef.current?.requestStart('deathmatch'), [])
  const finishSession = useCallback(() => engineRef.current?.finishSession(), [])
  const backToStart = useCallback(() => {
    setSummary(null)
    // **Y se vuelve al primer paso, no al último que se vio** (vuelta 92).
    // Terminar una sesión es terminar, así que la pantalla que toca es la de
    // la marca: volver a la lista de ajustes de la partida que acaba de
    // acabar es ofrecer retocarla en vez de decidir qué se hace ahora.
    setMenu('marca')
    engineRef.current?.goToStart()
  }, [])

  // Seguimos dentro del gesto del usuario (el click del botón), así que el
  // navegador acepta la captura sin exigir un segundo click.
  const restart = useCallback(() => {
    engineRef.current?.restart()
  }, [])

  // Los overlays de inicio y pausa capturan el ratón con un click en cualquier
  // sitio; los botones tienen que quedarse ese click para ellos.
  const swallowClick = useCallback((event) => event.stopPropagation(), [])
  const openOptions = useCallback(() => setOptionsOpen(true), [])
  const closeOptions = useCallback(() => setOptionsOpen(false), [])

  /**
   * **Con el panel abierto se ve el abanico de aparición** (vuelta 78). Es lo
   * único que hace falta por este lado: el cono es geometría del mundo y lo
   * dibuja el motor, que además es el único que sabe si en este escenario el
   * cono decide algo.
   */
  const enEntrenamiento = menu === 'entrenamiento'
  useEffect(() => {
    // **Y se dibuja donde vive el slider** (vuelta 92): el cono se movió a la
    // pantalla de entrenamiento, así que el dibujo se va con él. Colgarlo de
    // `optionsOpen` habría dejado el ajuste en un panel y su efecto en otro,
    // que es exactamente lo que la convención de la vuelta 78 prohíbe.
    engineRef.current?.mostrarConoDeAparicion(enEntrenamiento)
  }, [enEntrenamiento])
  const openArmoury = useCallback(() => setArmouryOpen(true), [])
  const closeArmoury = useCallback(() => setArmouryOpen(false), [])

  const showHud = phase === PHASE.RUNNING || phase === PHASE.PAUSED

  /**
   * **Los dos rótulos de modo se fueron con sus botones** (vuelta 92). El
   * nombre del segundo modo y la duración que lleva detrás se resuelven ahora
   * en `Training.jsx`, que es donde están los botones que los llevan — y se
   * resuelven **igual que en el motor**, que es lo que la vuelta 78 pidió.
   */
  const optionsPanel = (
    <Options
      settings={settings}
      binds={binds}
      onChange={updateSettings}
      onReset={resetSettings}
      onClose={closeOptions}
    />
  )

  const armouryPanel = (
    <Armoury
      settings={settings}
      equipped={equipped}
      onChange={updateSettings}
      onClose={closeArmoury}
    />
  )

  const optionsButton = (
    <button type="button" className="button" onMouseDown={swallowClick} onClick={openOptions}>
      Opciones
    </button>
  )

  const armouryButton = (
    <button type="button" className="button" onMouseDown={swallowClick} onClick={openArmoury}>
      Armería
    </button>
  )

  /**
   * **El botón del duelo es un enlace, y eso es todo lo que sabe de la red**
   * (vuelta 66). `App.jsx` no monta una fase de duelo ni habla con ningún
   * socket: el 1v1 sigue siendo una página aparte (vuelta 45) con su menú, su
   * código de partida y su botón de reconectar. Lo único que faltaba era la
   * puerta — hasta aquí había que escribir `/duelo/` a mano en la barra.
   *
   * La ruta sale de `NET.rutaDuelo`, que es la misma que sirven los dos
   * huéspedes y el servidor de desarrollo, así que es una sola en los tres
   * sitios. Y va con `assign` y no como un `<a>` para que el `onMouseDown` que
   * se traga el clic —el que evita que capture el ratón— siga valiendo aquí.
   * Lo pinta el segundo paso del menú, junto al entrenamiento.
   */

  /** Con cualquier panel abierto el overlay deja de capturar el ratón. */
  const panelOpen = optionsOpen || armouryOpen

  /**
   * **Y ESC reanuda** (vuelta 89). La 88 le enseñó a cerrar el panel de
   * opciones y ahí se quedó: con el panel ya cerrado, la única salida de la
   * pausa era encontrar «Reanudar» con el ratón, que es lo contrario de lo que
   * promete una tecla que ya hace lo de al lado.
   *
   * Tres guardas, y ninguna es de adorno:
   *
   * - **Con un panel abierto, no.** Ese ESC es suyo —lo cierra— y `panelOpen`
   *   todavía vale `true` en el manejador de esa misma pulsación, porque el
   *   estado de React no se ha confirmado aún. Así que cerrar y reanudar nunca
   *   caen en la misma tecla, y no hace falta pelearse por el orden de dos
   *   escuchas de `window` (`stopPropagation` no para a las hermanas).
   * - **Y sólo estando en pausa de verdad**, con el ratón ya suelto.
   * - **Y no antes de `RESUME_KEY_DELAY_MS`**, que es lo que impide que el ESC
   *   que *provoca* la pausa la levante de rebote, y de paso espera a que el
   *   navegador vuelva a admitir la captura. Ver el porqué en `config.js`.
   */
  const pausadoDesde = useRef(0)
  useEffect(() => {
    if (phase !== PHASE.PAUSED) return undefined
    pausadoDesde.current = performance.now()
    return undefined
  }, [phase])

  useEffect(() => {
    if (phase !== PHASE.PAUSED || panelOpen) return undefined
    const onKey = (event) => {
      if (event.key !== 'Escape') return
      if (performance.now() - pausadoDesde.current < RESUME_KEY_DELAY_MS) return
      event.preventDefault()
      lock()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, panelOpen, lock])

  return (
    <div className="app">
      <canvas ref={canvasRef} className="app__canvas" />

      {showHud && (
        <Hud ref={hudRef} weaponKey={equipped.weaponKey} suppressed={equipped.suppressed} />
      )}
      {phase === PHASE.RUNNING && <Crosshair ref={crosshairRef} hidden={apuntando} melee={aCuchillo} backstab={porLaEspalda} />}

      {engineError && (
        <div className="overlay">
          <div className="panel">
            <h2 className="panel__title panel__title--small">WebGL no disponible</h2>
            <p className="panel__body">{engineError}</p>
            <p className="panel__hint">Comprueba la aceleración por hardware del navegador.</p>
          </div>
        </div>
      )}

      {avatarDebug && (
        <div className="overlay overlay--bare">
          <p className="panel__hint">Vista del avatar · F3 para salir</p>
        </div>
      )}

      {!engineError && !avatarDebug && phase === PHASE.IDLE && (
        // Con cualquier panel abierto el overlay deja de capturar el ratón:
        // sería desconcertante que tocar un slider arrancara la partida. Y con
        // el menú fuera del primer paso, tampoco: ahí hay botones que pulsar.
        <div className="overlay" onMouseDown={panelOpen || menu !== 'marca' ? undefined : lock}>
          {armouryOpen ? (
            armouryPanel
          ) : optionsOpen ? (
            optionsPanel
          ) : menu === 'entrenamiento' ? (
            <Training
              settings={settings}
              onChange={updateSettings}
              onStartTimed={startTimed}
              onStartDeathmatch={startDeathmatch}
              onBack={() => setMenu('modos')}
            />
          ) : (
            <div className="panel">
              {/* El logotipo **es** el título: lleva «VEKTOR» dentro, así que
                  repetirlo debajo en texto sería decirlo dos veces. El rótulo
                  sigue siendo un h1 y el SVG lleva su `aria-label`. */}
              <h1 className="panel__logo">
                <VektorLogo />
              </h1>
              <p className="panel__byline">by FlickLAB</p>

              {/**
                * **Bajo el logo no va ningún rótulo destacado** (vuelta 89), y
                * desde la 92 tampoco van las instrucciones: se pidió que la
                * primera pantalla fuese el logotipo y un botón, y el motivo
                * aguanta solo — nadie lee tres líneas de controles antes de
                * haber decidido que va a jugar. Bajan al paso siguiente, que es
                * donde por primera vez hay algo que elegir.
                *
                * `panel__eyebrow` sigue viva: es de donde cuelga el veredicto
                * del resumen (`panel__eyebrow--fail`), que ahí sí es un rótulo.
                */}
              {menu === 'marca' ? (
                <div className="panel__actions panel__actions--solo">
                  <button
                    type="button"
                    className="button button--primary button--grande"
                    onMouseDown={swallowClick}
                    onClick={() => setMenu('modos')}
                    autoFocus
                  >
                    Jugar ahora
                  </button>
                </div>
              ) : (
                <>
                  {/**
                    * **Los dos modos arriba y en verde; lo demás debajo y en
                    * gris** (vuelta 92). No es decoración: el verde de acción
                    * es «esto es lo que pasa al pulsar» en todo el juego, y lo
                    * que pasa aquí es jugar. La armería y las opciones son
                    * preparativos, así que van en el gris de siempre — cinco
                    * botones del mismo color obligan a leerlos todos para saber
                    * cuál es el que hace la cosa (la regla de las fichas de la
                    * armería, vuelta 43, aplicada a un menú).
                    */}
                  <div className="panel__actions panel__actions--duo">
                    <button
                      type="button"
                      className="button button--primary button--grande"
                      onMouseDown={swallowClick}
                      onClick={() => setMenu('entrenamiento')}
                      autoFocus
                    >
                      Entrenamiento
                      <span className="button__sub">Dianas, muñecos y la bomba. Tú solo.</span>
                    </button>
                    {/* **El duelo va con los modos, no con los paneles**: es a
                        lo que se juega, aunque lo que haga sea salir de esta
                        página. */}
                    <button
                      type="button"
                      className="button button--primary button--grande"
                      onMouseDown={swallowClick}
                      onClick={() => window.location.assign(NET.rutaDuelo)}
                    >
                      Duelo 1v1
                      <span className="button__sub">Contra un amigo, por enlace.</span>
                    </button>
                  </div>

                  <div className="panel__actions panel__actions--duo">
                    {armouryButton}
                    {optionsButton}
                  </div>

                  {/* **Y aquí sí van las instrucciones** (vuelta 92): quien ha
                      llegado a este paso ya ha decidido jugar, así que es el
                      primer sitio donde leerlas significa algo. */}
                  <p className="panel__body">
                    Click para capturar el ratón. Click izquierdo para disparar.
                  </p>
                  {MOVEMENT.enabled && (
                    <p className="panel__hint">
                      WASD o flechas para moverte · SHIFT camina · C agacha · SPACE salta y encadena
                    </p>
                  )}
                  <p className="panel__hint">R recarga · B armería · Escape pausa.</p>

                  <div className="panel__actions">
                    <button
                      type="button"
                      className="button button--quiet"
                      onMouseDown={swallowClick}
                      onClick={() => setMenu('marca')}
                    >
                      Volver
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {!avatarDebug && phase === PHASE.PAUSED && (
        <div className="overlay" onMouseDown={panelOpen ? undefined : lock}>
          {armouryOpen ? (
            armouryPanel
          ) : optionsOpen ? (
            optionsPanel
          ) : (
            <div className="panel">
              <h2 className="panel__title panel__title--small">Pausa</h2>
              <p className="panel__body">Click en cualquier sitio para continuar.</p>
              <div className="panel__actions">
                <button
                  type="button"
                  className="button button--primary"
                  onMouseDown={swallowClick}
                  onClick={lock}
                  autoFocus
                >
                  Reanudar
                </button>
                {armouryButton}
                {optionsButton}
                <button
                  type="button"
                  className="button button--quiet"
                  onMouseDown={swallowClick}
                  onClick={finishSession}
                >
                  Finalizar sesión
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {!avatarDebug && phase === PHASE.FINISHED && summary && (
        <div className="overlay">
          <Summary summary={summary} onRestart={restart} onBackToStart={backToStart} />
        </div>
      )}
    </div>
  )
}
