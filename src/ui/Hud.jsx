import { forwardRef, useImperativeHandle, useRef } from 'react'

/**
 * HUD de partida: cronómetro restante, aciertos y fallos.
 *
 * Se actualiza escribiendo directamente en el DOM desde el bucle del motor, no
 * con estado de React: a 240 Hz un `setState` por frame sería el trabajo más
 * caro de todo el frame. Además sólo se toca el DOM cuando el texto cambia de
 * verdad (el cronómetro cambia ~10 veces por segundo, no 240).
 */
const Hud = forwardRef(function Hud(_props, ref) {
  const fpsRef = useRef(null)
  const timeRef = useRef(null)
  const hitsRef = useRef(null)
  const missesRef = useRef(null)
  // Últimos valores mostrados, como números: comparamos antes de formatear,
  // así que un frame que no cambia nada no genera ni un string.
  const lastValues = useRef({ deciseconds: -1, hits: -1, misses: -1, fps: -1 })

  useImperativeHandle(ref, () => ({
    /** @param {{timeLeftMs:number, hits:number, misses:number}} stats */
    update(stats) {
      const last = lastValues.current

      const fps = Math.round(stats.fps)
      if (fps !== last.fps && fpsRef.current) {
        fpsRef.current.textContent = String(fps)
        last.fps = fps
      }

      const deciseconds = Math.ceil(stats.timeLeftMs / 100)
      if (deciseconds !== last.deciseconds && timeRef.current) {
        timeRef.current.textContent = (deciseconds / 10).toFixed(1)
        last.deciseconds = deciseconds
      }
      if (stats.hits !== last.hits && hitsRef.current) {
        hitsRef.current.textContent = String(stats.hits)
        last.hits = stats.hits
      }
      if (stats.misses !== last.misses && missesRef.current) {
        missesRef.current.textContent = String(stats.misses)
        last.misses = stats.misses
      }
    },
  }), [])

  return (
    // El contador va fuera de `.hud` a propósito: `.hud` se centra con un
    // `transform`, y un elemento posicionado dentro de un ancestro
    // transformado se ancla a ese ancestro, no a la ventana. Como hermano,
    // la esquina que ve es la de la pantalla.
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
          <span className="hud__label">tiempo</span>
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
    </>
  )
})

export default Hud
