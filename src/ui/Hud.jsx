import { forwardRef, useImperativeHandle, useRef } from 'react'
import WeaponSilhouette from './WeaponSilhouette.jsx'
import { STAR_PATH } from './Stars.jsx'
import { WEAPONS } from '../config.js'

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
  const starsRef = useRef(null)
  // Cinco nodos fijos: encender estrellas es cambiar clases, no crear elementos.
  const starRefs = useRef([])

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
    countUp: null,
    scoring: null,
    stars: -1,
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
      if (stats.endless !== last.endless || stats.countUp !== last.countUp) {
        if (timeRef.current) {
          timeRef.current.textContent = stats.endless ? '∞' : '0.0'
          timeRef.current.classList.toggle('hud__value--endless', stats.endless)
        }
        if (timeLabelRef.current) {
          timeLabelRef.current.textContent = stats.endless ? 'libre' : 'tiempo'
        }
        last.endless = stats.endless
        last.countUp = stats.countUp
        last.deciseconds = -1
      }

      // Con explosivo el reloj sube en vez de bajar: enseñar lo que queda sería
      // poner la cuenta atrás de la bomba en el HUD, y ésa sólo se oye.
      if (!stats.endless) {
        const deciseconds = stats.countUp
          ? Math.floor(stats.timeLeftMs / 100)
          : Math.ceil(stats.timeLeftMs / 100)
        if (deciseconds !== last.deciseconds && timeRef.current) {
          timeRef.current.textContent = (deciseconds / 10).toFixed(1)
          last.deciseconds = deciseconds
        }
      }

      // Estrellas en vivo: sólo aparecen donde hay puntuación, y se recalculan
      // con cada disparo y con el paso del tiempo, no sólo al terminar.
      if (stats.scoring !== last.scoring) {
        if (starsRef.current) starsRef.current.hidden = !stats.scoring
        last.scoring = stats.scoring
        last.stars = -1
      }
      if (stats.scoring && stats.stars !== last.stars) {
        for (let i = 0; i < starRefs.current.length; i++) {
          const star = starRefs.current[i]
          if (star) star.classList.toggle('star--on', i < stats.stars)
        }
        last.stars = stats.stars
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

      <div className="hud__stars" ref={starsRef} hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <svg
            key={i}
            className="star"
            viewBox="0 0 24 24"
            role="presentation"
            ref={(node) => {
              starRefs.current[i] = node
            }}
          >
            <path d={STAR_PATH} />
          </svg>
        ))}
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
        {/* Silueta y munición en una sola fila: la silueta ya identifica el
            arma, así que el nombre sale de la fila y baja a rótulo secundario. */}
        <div className="hud__weapon-row">
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
        </div>

        <span className="hud__weapon-name">{WEAPONS[weaponKey]?.label}</span>

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
