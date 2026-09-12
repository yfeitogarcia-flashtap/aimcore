import { LOGO } from './logoPaths.js'

/**
 * Logotipo de Vektor, en sus dos formas.
 *
 * Ninguna está dibujada a mano ni es una imagen: salen de vectorizar con
 * potrace las referencias de `Reference/Logo/` (ver `scripts/trace-logo.mjs`).
 * Aquí sólo se eligen el tamaño y el color, y las PNG no llegan al navegador.
 *
 * **Se pintan rellenas, no a trazo.** La marca ya es un dibujo de línea, así que
 * el contorno que devuelve potrace rodea cada línea por sus dos lados: rellenarlo
 * reproduce exactamente las líneas del original, mientras que pasarle un `stroke`
 * —como se hace con las siluetas de las armas, que son manchas macizas— dibujaría
 * dos filos por línea y a tamaño de HUD sería un borrón.
 *
 * **Y con `fill-rule: evenodd`, que no es opcional.** Potrace devuelve los huecos
 * en un solo trazado, contando con esa regla; con la de por defecto (`nonzero`)
 * la marca se rellena entera y sale un disco blanco. Va como atributo del SVG y
 * no en la hoja de estilos a propósito: es parte de cómo se lee el trazado, no
 * una decisión de aspecto que alguien pueda quitar sin darse cuenta.
 */

/** La marca sola, sin texto. Toma el color de donde se ponga. */
export function VektorMark({ className = '' }) {
  return (
    <svg
      className={`vektor-mark ${className}`.trim()}
      viewBox={LOGO.mark.viewBox}
      role="img"
      aria-label="Vektor"
    >
      <path fillRule="evenodd" d={LOGO.mark.d} />
    </svg>
  )
}

/**
 * El logotipo completo: la marca en blanco y «VEKTOR» en el naranja de marca.
 *
 * Los dos trazados comparten `viewBox` porque salen de la misma referencia, así
 * que se superponen solos: aquí no se cuadra nada a mano.
 */
export function VektorLogo({ className = '' }) {
  return (
    <svg
      className={`vektor-logo ${className}`.trim()}
      viewBox={LOGO.logo.viewBox}
      role="img"
      aria-label="Vektor"
    >
      <path className="vektor-logo__mark" fillRule="evenodd" d={LOGO.logo.markPath} />
      <path className="vektor-logo__word" fillRule="evenodd" d={LOGO.logo.wordPath} />
    </svg>
  )
}
