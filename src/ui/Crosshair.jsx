import { forwardRef, useImperativeHandle, useRef } from 'react'
import { FEEDBACK } from '../config.js'

/**
 * **Crosshair fijo en el centro, y fijo de verdad** (vuelta 67).
 *
 * El color sale de `COLORS.crosshair` a través de la variable CSS
 * `--crosshair-color` (ver src/styles.css y src/App.jsx): no está escrito a
 * mano en ningún sitio, así que la futura pantalla de opciones sólo tendrá que
 * tocar esa variable.
 *
 * Hasta aquí parpadeaba en cada disparo. **La mira no se anima nunca**: es la
 * referencia contra la que se apunta, y una referencia que se mueve o brilla es
 * una referencia peor — con fuego automático, además, parpadeaba diez veces por
 * segundo. Se quita el destello y se queda lo que no es la mira sino un aviso
 * dibujado **alrededor** de ella: el anillo de daño, que dice que te han dado a
 * ti y no tiene otro sitio donde ponerse.
 *
 * **Y dice dos cosas del cuchillo, no una** (vuelta 73). Con alguien a
 * distancia de golpe los cuatro trazos se abren y se tiñen del verde de acción
 * (vuelta 71); **si además le estás viendo la espalda** giran 45° y se cierra
 * un anillo alrededor del centro. Lo que distingue los dos estados es la
 * **forma** y no el color, que es la regla de la vuelta 67 y la misma por la
 * que la marca de una baja no es la de un impacto en otro tono.
 *
 * Y es la única cosa que la pantalla puede decir **antes** de golpear: un
 * fuerte por la espalda mata lleve lo que lleve el otro (vuelta 71), o sea que
 * es la diferencia más grande que hay entre dos golpes, y hasta aquí sólo se
 * sabía después.
 *
 * **Se quita con la mirilla puesta** (vuelta 70): la lente trae la suya, y
 * dos miras a la vez es una encima de otra. Lo dice el motor por `onScope`, que
 * es una pulsación y no un valor por frame.
 *
 * Su forma y su tamaño salen de `CROSSHAIR`, que es lo que comparten los dos
 * modos desde esta vuelta y lo que tocará una pantalla de opciones el día que
 * se pueda diseñar la propia.
 */
const Crosshair = forwardRef(function Crosshair({ hidden = false, melee = false, backstab = false }, ref) {
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
  }), [])

  return (
    <div
      className={`crosshair${hidden ? ' crosshair--hidden' : ''}${melee ? ' crosshair--melee' : ''}${backstab ? ' crosshair--backstab' : ''}`}
      aria-hidden="true"
    >
      <span className="crosshair__bar crosshair__bar--top" />
      <span className="crosshair__bar crosshair__bar--right" />
      <span className="crosshair__bar crosshair__bar--bottom" />
      <span className="crosshair__bar crosshair__bar--left" />
      <span className="crosshair__ring" ref={ringRef} />
    </div>
  )
})

export default Crosshair
