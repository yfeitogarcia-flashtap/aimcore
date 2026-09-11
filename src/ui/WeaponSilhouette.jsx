import { WEAPONS } from '../config.js'
import { WEAPON_PATHS } from './weaponPaths.js'

/**
 * Silueta del arma para el HUD: perfil lateral, sólo contorno, sin relleno.
 *
 * Los contornos no están dibujados a mano: salen de vectorizar con potrace las
 * referencias recortadas de `Reference/Weapons/` (ver
 * `scripts/trace-weapons.mjs`). Aquí sólo se elige cuál toca y se le da el
 * color y el grosor del resto del HUD; las imágenes no se importan ni llegan
 * al navegador.
 */

/**
 * Armas cuyo trazado base corresponde a una variante concreta. La referencia
 * de Scalar-2 está fotografiada **con** silenciador, así que el trazado real
 * es el silenciado y la versión corta es la que se deriva de él.
 */
const VARIANTS = {
  'scalar-2': { suppressed: 'scalar-2', plain: 'scalar-2-plain' },
}

function resolvePathKey(weaponKey, suppressed) {
  const variant = VARIANTS[weaponKey]
  if (!variant) return weaponKey
  return suppressed ? variant.suppressed : variant.plain
}

/**
 * @param {{ weaponKey: string, suppressed?: boolean }} props
 */
export default function WeaponSilhouette({ weaponKey, suppressed = false }) {
  const shape = WEAPON_PATHS[resolvePathKey(weaponKey, suppressed)]
  if (!shape) return null

  return (
    <div className="weapon" aria-label={WEAPONS[weaponKey]?.label}>
      <svg className="weapon__svg" viewBox={shape.viewBox} role="presentation">
        <path d={shape.d} />
      </svg>
      <span className="weapon__label">{WEAPONS[weaponKey]?.label}</span>
    </div>
  )
}
