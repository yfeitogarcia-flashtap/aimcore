/**
 * Estrellas de puntuación.
 *
 * Dibujadas en SVG y no con un carácter ★ para no depender de que una fuente
 * concreta tenga el glifo, y no con `clip-path` —que es lo que había— porque
 * una forma recortada sólo puede estar rellena: la estrella vacía tiene que
 * poder ser un contorno hueco, que es lo que la distingue de un vistazo.
 *
 * **Sin color.** El naranja es de las dianas y el ámbar del explosivo; una
 * estrella teñida se confundiría de reojo con cualquiera de los dos. El
 * contraste lo dan el relleno y la opacidad: llena en blanco puro, vacía en
 * contorno apagado.
 */

/** Estrella de cinco puntas en un lienzo de 24×24. */
export const STAR_PATH =
  'M12 2.2 L15.1 8.5 L22 9.5 L17 14.4 L18.2 21.3 L12 18 L5.8 21.3 L7 14.4 L2 9.5 L8.9 8.5 Z'

/** Una estrella suelta. `on` decide si va rellena o hueca. */
export function Star({ on, className = '' }) {
  return (
    <svg
      className={`star${on ? ' star--on' : ''} ${className}`.trim()}
      viewBox="0 0 24 24"
      role="presentation"
    >
      <path d={STAR_PATH} />
    </svg>
  )
}

/** Fila de cinco, las ganadas rellenas. Para sitios que no necesitan refs. */
export default function Stars({ count, className = '' }) {
  return (
    <div className={`stars ${className}`.trim()} aria-label={`${count} de 5 estrellas`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <Star key={i} on={i < count} />
      ))}
    </div>
  )
}
