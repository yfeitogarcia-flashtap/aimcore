import { forwardRef, useImperativeHandle, useRef } from 'react'
import { FEEDBACK } from '../config.js'

/**
 * Crosshair fijo en el centro, con un flash breve en cada disparo.
 *
 * El color sale de `COLORS.crosshair` a través de la variable CSS
 * `--crosshair-color` (ver src/styles.css y src/App.jsx): no está escrito a
 * mano en ningún sitio, así que la futura pantalla de opciones sólo tendrá que
 * tocar esa variable.
 *
 * El flash usa la Web Animations API en vez de estado de React: no re-renderiza
 * nada y lo resuelve el compositor del navegador, fuera del bucle de render.
 */
const Crosshair = forwardRef(function Crosshair(_props, ref) {
  const flashRef = useRef(null)

  useImperativeHandle(ref, () => ({
    flash() {
      const element = flashRef.current
      if (!element) return
      element.animate(
        [
          { opacity: FEEDBACK.crosshairFlashOpacity, transform: 'scale(0.6)' },
          { opacity: 0, transform: 'scale(1.6)' },
        ],
        { duration: FEEDBACK.crosshairFlashMs, easing: 'ease-out' },
      )
    },
  }), [])

  return (
    <div className="crosshair" aria-hidden="true">
      <span className="crosshair__bar crosshair__bar--top" />
      <span className="crosshair__bar crosshair__bar--right" />
      <span className="crosshair__bar crosshair__bar--bottom" />
      <span className="crosshair__bar crosshair__bar--left" />
      <span className="crosshair__flash" ref={flashRef} />
    </div>
  )
})

export default Crosshair
