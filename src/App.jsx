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
  DEATHMATCH_DURATIONS,
  FEEDBACK,
  MOVEMENT,
  NET,
  SESSION_DURATION_S,
  SESSION_MODES,
  scenarioHasCover,
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
        onMeleeRange: setACuchillo,
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
  const openArmoury = useCallback(() => setArmouryOpen(true), [])
  const closeArmoury = useCallback(() => setArmouryOpen(false), [])

  const showHud = phase === PHASE.RUNNING || phase === PHASE.PAUSED

  /**
   * Rótulo del segundo botón: **Deathmatch** donde hay contra quién —escenario
   * con cobertura— y práctica libre donde no. Y con su duración detrás, si no
   * es «sin límite»: el modo se configura en opciones y el botón es el único
   * sitio donde se ve antes de empezar.
   */
  const deathmatch = scenarioHasCover(settings.scenario)
  const duration = DEATHMATCH_DURATIONS[settings.deathmatchDuration]
  const deathmatchLabel = deathmatch
    ? `${SESSION_MODES.deathmatch.label}${duration.seconds > 0 ? ` · ${duration.label}` : ' ∞'}`
    : SESSION_MODES.deathmatch.plainLabel

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
   */
  const duelButton = (
    <button
      type="button"
      className="button"
      onMouseDown={swallowClick}
      onClick={() => window.location.assign(NET.rutaDuelo)}
    >
      Duelo 1v1
    </button>
  )

  /** Con cualquier panel abierto el overlay deja de capturar el ratón. */
  const panelOpen = optionsOpen || armouryOpen

  return (
    <div className="app">
      <canvas ref={canvasRef} className="app__canvas" />

      {showHud && (
        <Hud ref={hudRef} weaponKey={equipped.weaponKey} suppressed={equipped.suppressed} />
      )}
      {phase === PHASE.RUNNING && <Crosshair ref={crosshairRef} hidden={apuntando} melee={aCuchillo} />}

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
        // Con las opciones abiertas el overlay deja de capturar el ratón: sería
        // desconcertante que tocar un slider arrancara la partida.
        <div className="overlay" onMouseDown={panelOpen ? undefined : lock}>
          {armouryOpen ? (
            armouryPanel
          ) : optionsOpen ? (
            optionsPanel
          ) : (
            <div className="panel">
              {/* El logotipo **es** el título: lleva «VEKTOR» dentro, así que
                  repetirlo debajo en texto sería decirlo dos veces. El rótulo
                  sigue siendo un h1 y el SVG lleva su `aria-label`. */}
              <h1 className="panel__logo">
                <VektorLogo />
              </h1>
              <p className="panel__byline">by FlickLAB</p>
              {/* Qué se juega al pulsar el primer botón, que depende del
                  escenario: con cobertura es la ronda del explosivo y con la
                  sala vacía, el gridshot de siempre. */}
              <p className="panel__eyebrow">
                {deathmatch ? 'ronda con explosivo' : `gridshot · ${SESSION_DURATION_S}s`}
              </p>
              <p className="panel__body">
                Click para capturar el ratón y empezar. Click izquierdo para disparar.
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
                  className="button button--primary"
                  onMouseDown={swallowClick}
                  onClick={startTimed}
                  autoFocus
                >
                  Jugar ahora
                </button>
                {/* **El segundo modo tiene nombre propio donde lo tiene.** Con
                    cobertura y muñecos que disparan es un Deathmatch y se llama
                    así; en la sala vacía no hay contra quién, así que sigue
                    siendo la práctica libre de siempre. El rótulo sale del
                    escenario elegido, no de un interruptor aparte. */}
                <button
                  type="button"
                  className="button button--primary"
                  onMouseDown={swallowClick}
                  onClick={startDeathmatch}
                >
                  {deathmatchLabel}
                </button>
                {/* **El duelo va con los modos, no con los paneles**: es a lo
                    que se juega, aunque lo que haga sea salir de esta página. */}
                {duelButton}
                {armouryButton}
                {optionsButton}
              </div>
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
