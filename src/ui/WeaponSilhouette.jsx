import { WEAPONS } from '../config.js'
import { WEAPON_PATHS } from './weaponPaths.js'

/**
 * Silueta del arma para el HUD: perfil lateral, sólo contorno, sin relleno.
 *
 * Dibuja **sólo la silueta**. El nombre del arma lo pone quien la coloque: en el
 * HUD la silueta comparte fila con el contador de munición y un rótulo dentro
 * rompería esa fila.
 *
 * Los contornos no están dibujados a mano: salen de vectorizar con potrace las
 * referencias recortadas de `Reference/Weapons/` (ver
 * `scripts/trace-weapons.mjs`). Aquí sólo se elige cuál toca y se le da el
 * color y el grosor del resto del HUD; las imágenes no se importan ni llegan
 * al navegador.
 */

/**
 * **Con silenciador se dibuja otra arma, no la misma con un tubo pegado.**
 * Cada arma tiene sus dos referencias fotografiadas aparte —`<arma>` y
 * `ghost-<arma>`— y el trazado sale de la que toque. La regla es de una línea y
 * vale para las tres desde la vuelta 41; antes sólo la pistola tenía las dos, y
 * había que declarar a mano cuál era cuál.
 *
 * Si algún día un arma no trae su variante, se cae a la normal en vez de no
 * dibujar nada: perder la silueta entera por no tener la foto silenciada sería
 * quitar información en vez de matizarla.
 */
function resolvePathKey(weaponKey, suppressed) {
  if (!suppressed) return weaponKey
  return WEAPON_PATHS[`ghost-${weaponKey}`] ? `ghost-${weaponKey}` : weaponKey
}

/**
 * @param {{ weaponKey: string, suppressed?: boolean }} props
 */
export default function WeaponSilhouette({ weaponKey, suppressed = false }) {
  const shape = WEAPON_PATHS[resolvePathKey(weaponKey, suppressed)]
  if (!shape) return null

  return (
    <svg
      className="weapon__svg"
      viewBox={shape.viewBox}
      role="img"
      aria-label={WEAPONS[weaponKey]?.label}
    >
      <path d={shape.d} />
    </svg>
  )
}
