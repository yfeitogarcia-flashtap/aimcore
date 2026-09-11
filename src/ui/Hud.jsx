import { forwardRef, useImperativeHandle, useRef } from 'react'
import WeaponSilhouette from './WeaponSilhouette.jsx'

/**
 * HUD de partida: cronómetro, aciertos, fallos, FPS, cargador y arma.
 *
 * Se actualiza escribiendo directamente en el DOM desde el bucle del motor, no
 * con estado de React: a 240 Hz un `setState` por frame sería el trabajo más
 * caro de todo el frame. Además sólo se toca el DOM cuando el valor cambia de
 * verdad — el cronómetro cambia ~10 veces por segundo, no 240.
 */
const Hud = forwardRef(function Hud({ weaponKey, suppressed }, ref) {
  const fpsRef = useRef(null)
  const timeRef = useRef(null)
  const timeLabelRef = useRef(null)
  const hitsRef = useRef(null)
  const missesRef = useRef(null)
  const ammoRef = useRef(null)
  const magazineRef = useRef(null)
  const ammoBlockRef = useRef(null)
  const reloadRef = useRef(null)
  const reloadBarRef = useRef(null)
  const helpRef = useRef(null)
  const helpTimer = useRef(0)

  // Últimos valores mostrados, como números: comparamos antes de formatear,
  // así que un frame que no cambia nada no genera ni un string.
  const lastValues = useRef({
    deciseconds: -1,
    endless: null,
    hits: -1,
    misses: -1,
    fps: -1,
    ammo: -1,
    magazine: -1,
    reloading: null,
    low: null,
  })

  useImperativeHandle(ref, () => ({
    update(stats) {
      const last = lastValues.current

      const fps = Math.round(stats.fps)
      if (fps !== last.fps && fpsRef.current) {
        fpsRef.current.textContent = String(fps)
        last.fps = fps
      }

      // Sin cronómetro el hueco lo ocupa el símbolo de infinito, y el rótulo
      // pasa de "tiempo restante" a decir sólo que la sesión no acaba sola.
      if (stats.endless !== last.endless) {
        if (timeRef.current) {
          timeRef.current.textContent = stats.endless ? '∞' : '0.0'
          timeRef.current.classList.toggle('hud__value--endless', stats.endless)
        }
        if (timeLabelRef.current) {
          timeLabelRef.current.textContent = stats.endless ? 'libre' : 'tiempo'
        }
        last.endless = stats.endless
        last.deciseconds = -1
      }

      if (!stats.endless) {
        const deciseconds = Math.ceil(stats.timeLeftMs / 100)
        if (deciseconds !== last.deciseconds && timeRef.current) {
          timeRef.current.textContent = (deciseconds / 10).toFixed(1)
          last.deciseconds = deciseconds
        }
      }
      if (stats.hits !== last.hits && hitsRef.current) {
        hitsRef.current.textContent = String(stats.hits)
        last.hits = stats.hits
      }
      if (stats.misses !== last.misses && missesRef.current) {
        missesRef.current.textContent = String(stats.misses)
        last.misses = stats.misses
      }
      if (stats.ammo !== last.ammo && ammoRef.current) {
        ammoRef.current.textContent = String(stats.ammo)
        last.ammo = stats.ammo
      }
      if (stats.magazine !== last.magazine && magazineRef.current) {
        magazineRef.current.textContent = String(stats.magazine)
        last.magazine = stats.magazine
      }

      // Parpadeo del contador: estado derivado, no un temporizador aparte.
      const low = !stats.reloading && stats.ammo <= Math.max(1, Math.floor(stats.magazine * 0.2))
      if (low !== last.low && ammoBlockRef.current) {
        ammoBlockRef.current.classList.toggle('hud__ammo--low', low)
        last.low = low
      }

      if (stats.reloading !== last.reloading) {
        if (reloadRef.current) reloadRef.current.hidden = !stats.reloading
        last.reloading = stats.reloading
      }
      if (stats.reloading && reloadBarRef.current) {
        reloadBarRef.current.style.transform = `scaleX(${stats.reloadProgress.toFixed(3)})`
      }
    },

    /** Aviso temporal que se retira solo. */
    showHelp(text, durationMs) {
      const element = helpRef.current
      if (!element) return
      element.textContent = text
      element.hidden = false
      window.clearTimeout(helpTimer.current)
      helpTimer.current = window.setTimeout(() => {
        element.hidden = true
      }, durationMs)
    },
  }), [])

  return (
    // El bloque de FPS y el del arma van fuera de `.hud` a propósito: `.hud` se
    // centra con un `transform`, y un elemento posicionado dentro de un
    // ancestro transformado se ancla a ese ancestro, no a la ventana.
    <>
      <div className="hud__fps">
        <span className="hud__fps-value" ref={fpsRef}>
          0
        </span>
        <span className="hud__fps-unit">fps</span>
      </div>

      <div className="hud">
        <div className="hud__stat hud__stat--timer">
          <span className="hud__value" ref={timeRef}>
            0.0
          </span>
          <span className="hud__label" ref={timeLabelRef}>
            tiempo
          </span>
        </div>
        <div className="hud__stat">
          <span className="hud__value" ref={hitsRef}>
            0
          </span>
          <span className="hud__label">aciertos</span>
        </div>
        <div className="hud__stat">
          <span className="hud__value hud__value--muted" ref={missesRef}>
            0
          </span>
          <span className="hud__label">fallos</span>
        </div>
      </div>

      <div className="hud__weapon">
        <WeaponSilhouette weaponKey={weaponKey} suppressed={suppressed} />

        <div className="hud__ammo" ref={ammoBlockRef}>
          <span className="hud__ammo-current" ref={ammoRef}>
            0
          </span>
          <span className="hud__ammo-sep">/</span>
          <span className="hud__ammo-max" ref={magazineRef}>
            0
          </span>
        </div>

        <div className="hud__reload" ref={reloadRef} hidden>
          <span className="hud__reload-label">recargando</span>
          <span className="hud__reload-track">
            <span className="hud__reload-bar" ref={reloadBarRef} />
          </span>
        </div>

        <p className="hud__help" ref={helpRef} hidden />
      </div>
    </>
  )
})

export default Hud
