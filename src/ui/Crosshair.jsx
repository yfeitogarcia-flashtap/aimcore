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
  const ringRef = useRef(null)

  useImperativeHandle(ref, () => ({
    /**
     * Anillo de daño: se enciende al recibir un disparo y se apaga solo.
     *
     * Va **alrededor de la mira** y no como un tinte de pantalla completa a
     * propósito: cuando te están disparando, lo último que se puede tapar es el
     * sitio al que hay que apuntar. La intensidad va con lo que se ha comido el
     * disparo, así que un roce y un tiro a la cabeza no se ven igual.
     */
    damage(severity = 0.5) {
      const element = ringRef.current
      if (!element) return
      const peak = FEEDBACK.damageRingOpacity * (0.45 + 0.55 * Math.min(1, Math.max(0, severity)))
      element.animate(
        [
          { opacity: 0, transform: 'scale(0.75)' },
          { opacity: peak, transform: 'scale(1)', offset: 0.18 },
          { opacity: 0, transform: 'scale(1.35)' },
        ],
        { duration: FEEDBACK.damageRingMs, easing: 'ease-out' },
      )
    },

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
      <span className="crosshair__ring" ref={ringRef} />
    </div>
  )
})

export default Crosshair
