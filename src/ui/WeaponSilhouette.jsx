import { WEAPONS } from '../config.js'
import { weaponShape } from './weaponSilhouette.js'

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
 *
 * **Elegir cuál toca vive fuera** (vuelta 67, `weaponSilhouette.js`): la página
 * del duelo no tiene React y necesitaba la misma silueta, así que lo compartido
 * salió a un módulo y esto se quedó con lo suyo, que es el JSX.
 */

/**
 * @param {{ weaponKey: string, suppressed?: boolean }} props
 */
export default function WeaponSilhouette({ weaponKey, suppressed = false }) {
  const shape = weaponShape(weaponKey, suppressed)
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
