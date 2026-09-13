import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { COLORS, MOVEMENT, SESSION_DURATION_S } from './config.js'
import { Engine, PHASE } from './game/engine.js'
import { disposeAudio } from './audio/sfx.js'
import { setMusicVolume, startMusic, stopMusic } from './audio/music.js'
import { getKeybinds, subscribeKeybinds } from './keybinds.js'
import { getSettings, resetSettings, subscribeSettings, updateSettings } from './settings.js'
import Crosshair from './ui/Crosshair.jsx'
import { VektorLogo } from './ui/Logo.jsx'
import Hud from './ui/Hud.jsx'
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
  /** Vista del avatar: mientras está abierta, los paneles se apartan. */
  const [avatarDebug, setAvatarDebug] = useState(false)
  /**
   * **El arma que se lleva en la mano**, que desde la vuelta 39 ya no es la del
   * ajuste: se llevan dos y la tecla decide cuál. Lo publica el motor cuando
   * cambia —una pulsación—, no en cada frame, así que puede ser estado de React
   * sin saltarse la regla de no repintar por frame.
   */
  const [equipped, setEquipped] = useState({ weaponKey: getSettings().weapon, suppressed: false })

  // El store de ajustes vive fuera de React porque el motor también lo lee.
  const settings = useSyncExternalStore(subscribeSettings, getSettings)
  // Y el de teclas, por lo mismo: lo escribe el panel y lo lee el motor.
  const binds = useSyncExternalStore(subscribeKeybinds, getKeybinds)

  // La paleta vive en config.js; aquí sólo la publicamos como variables CSS
  // para que las hojas de estilo no repitan ningún color a mano.
  useLayoutEffect(() => {
    const root = document.documentElement.style
    root.setProperty('--crosshair-color', COLORS.crosshair)
    root.setProperty('--background-color', COLORS.background)
    root.setProperty('--accent-color', COLORS.target)
    root.setProperty('--action-color', COLORS.action)
    root.setProperty('--electric-color', COLORS.electric)
    root.setProperty('--health-color', COLORS.health)
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
        onShot: () => crosshairRef.current?.flash(),
        onDamage: (severity) => crosshairRef.current?.damage(severity),
        onHelp: (text, durationMs) => hudRef.current?.showHelp(text, durationMs),
        onOpenOptions: () => setOptionsOpen(true),
        onAvatarDebug: setAvatarDebug,
        onWeapon: setEquipped,
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

  // La música acompaña a los menús y se calla al jugar: durante la partida el
  // audio es información —el pitido del explosivo— y una base encima estorba.
  // Se apaga también si no hay WebGL: ahí no hay nada que acompañar.
  useEffect(() => {
    if (engineError || phase === PHASE.RUNNING) stopMusic()
    else startMusic()
  }, [phase, engineError])

  useEffect(() => setMusicVolume(settings.musicVolume), [settings.musicVolume])

  // Al desmontar se para antes de cerrar el contexto de audio, que es de los dos.
  useEffect(() => () => stopMusic(), [])

  /** Captura el ratón: reanuda una pausada o arranca donde toque. */
  const lock = useCallback(() => {
    engineRef.current?.requestLock()
  }, [])

  const startTimed = useCallback(() => engineRef.current?.requestStart(false), [])
  const startEndless = useCallback(() => engineRef.current?.requestStart(true), [])
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

  const showHud = phase === PHASE.RUNNING || phase === PHASE.PAUSED

  const optionsPanel = (
    <Options
      settings={settings}
      binds={binds}
      onChange={updateSettings}
      onReset={resetSettings}
      onClose={closeOptions}
    />
  )

  const optionsButton = (
    <button type="button" className="button" onMouseDown={swallowClick} onClick={openOptions}>
      Opciones
    </button>
  )

  return (
    <div className="app">
      <canvas ref={canvasRef} className="app__canvas" />

      {showHud && (
        <Hud ref={hudRef} weaponKey={equipped.weaponKey} suppressed={equipped.suppressed} />
      )}
      {phase === PHASE.RUNNING && <Crosshair ref={crosshairRef} />}

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
        <div className="overlay" onMouseDown={optionsOpen ? undefined : lock}>
          {optionsOpen ? (
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
              <p className="panel__eyebrow">gridshot · {SESSION_DURATION_S}s</p>
              <p className="panel__body">
                Click para capturar el ratón y empezar. Click izquierdo para disparar.
              </p>
              {MOVEMENT.enabled && (
                <p className="panel__hint">
                  WASD o flechas para moverte · SHIFT camina · C agacha · SPACE salta y encadena
                </p>
              )}
              <p className="panel__hint">R recarga · Escape pausa.</p>
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
                <button
                  type="button"
                  className="button button--primary"
                  onMouseDown={swallowClick}
                  onClick={startEndless}
                >
                  Práctica libre ∞
                </button>
                {optionsButton}
              </div>
            </div>
          )}
        </div>
      )}

      {!avatarDebug && phase === PHASE.PAUSED && (
        <div className="overlay" onMouseDown={optionsOpen ? undefined : lock}>
          {optionsOpen ? (
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
