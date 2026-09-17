/**
 * **La silueta del arma, y de dónde sale** — sin React, para que la puedan
 * dibujar los dos modos (vuelta 67).
 *
 * El trazado ya era uno solo (`weaponPaths.js`, que emite
 * `scripts/trace-weapons.mjs`), pero **elegir cuál toca** vivía dentro del
 * componente de React, así que la página del duelo no tenía forma de pedirla y
 * su HUD se quedó sin silueta desde que existe. Es la convención de la vuelta
 * 63 por la puerta de al lado: lo que ya funciona en un modo no se reescribe
 * para el otro, se saca a donde lo puedan llamar los dos.
 *
 * Aquí no hay color ni tamaño: eso lo pone el CSS de quien la coloque
 * (`.weapon__svg`), que es el mismo en los dos sitios.
 */
import { WEAPONS } from '../config.js'
import { WEAPON_PATHS } from './weaponPaths.js'

/**
 * **Con silenciador se dibuja otra arma, no la misma con un tubo pegado.**
 * Cada arma tiene sus dos referencias fotografiadas aparte —`<arma>` y
 * `ghost-<arma>`— y el trazado sale de la que toque.
 *
 * Si algún día un arma no trae su variante, se cae a la normal en vez de no
 * dibujar nada: perder la silueta entera por no tener la foto silenciada sería
 * quitar información en vez de matizarla.
 */
export function weaponShape(weaponKey, suppressed = false) {
  const conTubo = suppressed && WEAPON_PATHS[`ghost-${weaponKey}`]
  return WEAPON_PATHS[conTubo ? `ghost-${weaponKey}` : weaponKey] ?? null
}

/**
 * La misma silueta como texto, para una página sin React. Devuelve cadena vacía
 * si esa arma no tiene trazado: lo que no existe no se dibuja a medias.
 */
export function weaponSilhouetteSvg(weaponKey, suppressed = false) {
  const shape = weaponShape(weaponKey, suppressed)
  if (!shape) return ''
  const etiqueta = WEAPONS[weaponKey]?.label ?? ''
  return (
    `<svg class="weapon__svg" viewBox="${shape.viewBox}" role="img" aria-label="${etiqueta}">` +
    `<path d="${shape.d}"/></svg>`
  )
}
