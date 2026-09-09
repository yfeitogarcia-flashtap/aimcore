import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { COLORS, SESSION_DURATION_S } from './config.js'
import { Engine, PHASE } from './game/engine.js'
import { disposeAudio } from './audio/sfx.js'
import Crosshair from './ui/Crosshair.jsx'
import Hud from './ui/Hud.jsx'
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

  // La paleta vive en config.js; aquí sólo la publicamos como variables CSS
  // para que las hojas de estilo no repitan ningún color a mano.
  useLayoutEffect(() => {
    const root = document.documentElement.style
    root.setProperty('--crosshair-color', COLORS.crosshair)
    root.setProperty('--background-color', COLORS.background)
    root.setProperty('--accent-color', COLORS.target)
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

  /** Captura el ratón: arranca una sesión nueva o reanuda la pausada. */
  const lock = useCallback(() => {
    engineRef.current?.requestLock()
  }, [])

  // Seguimos dentro del gesto del usuario (el click del botón), así que el
  // navegador acepta la captura sin exigir un segundo click.
  const restart = useCallback(() => {
    engineRef.current?.restart()
  }, [])

  const showHud = phase === PHASE.RUNNING || phase === PHASE.PAUSED

  return (
    <div className="app">
      <canvas ref={canvasRef} className="app__canvas" />

      {showHud && <Hud ref={hudRef} />}
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

      {!engineError && phase === PHASE.IDLE && (
        <div className="overlay" onMouseDown={lock}>
          <div className="panel">
            <h1 className="panel__title">AimCore</h1>
            <p className="panel__eyebrow">gridshot · {SESSION_DURATION_S}s</p>
            <p className="panel__body">
              Click para capturar el ratón y empezar. Click izquierdo para disparar.
            </p>
            <p className="panel__hint">Escape para pausar.</p>
          </div>
        </div>
      )}

      {phase === PHASE.PAUSED && (
        <div className="overlay" onMouseDown={lock}>
          <div className="panel">
            <h2 className="panel__title panel__title--small">Pausa</h2>
            <p className="panel__body">Click para continuar.</p>
          </div>
        </div>
      )}

      {phase === PHASE.FINISHED && summary && (
        <div className="overlay">
          <Summary summary={summary} onRestart={restart} />
        </div>
      )}
    </div>
  )
}
