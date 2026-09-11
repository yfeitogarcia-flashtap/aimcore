import { WEAPONS } from '../config.js'

/**
 * Silueta del arma para el HUD: perfil lateral, sólo contorno, sin relleno.
 *
 * Son trazos dibujados a mano en un `viewBox` común, con el cañón a la
 * derecha, para que las tres se lean a la misma escala y con el mismo peso de
 * línea que el resto del HUD. No hay imágenes de por medio: el color y el
 * grosor los hereda del CSS, así que la silueta acompaña a cualquier cambio de
 * paleta sin tocar este archivo.
 *
 * Cada entrada mezcla el contorno principal y un par de subtrazos de detalle
 * —guardamonte, carcasa— en un solo `d`. A tamaño de HUD, más detalle sólo
 * emborrona.
 */
const SILHOUETTES = {
  'axis-7': [
    // Culata, cajón con riel, guardamanos y cañón largo.
    'M 4 17 L 44 13 L 44 10 L 72 10 L 72 14 L 106 15 L 106 18 L 134 18 L 134 22',
    'L 106 22 L 106 25 L 84 25 L 84 28 L 78 28 L 74 41 L 64 41 L 66 28',
    'L 54 28 L 46 42 L 37 42 L 42 28 L 20 28 L 4 26 Z',
    // Guardamonte.
    'M 54 28 Q 55 34 61 33',
  ].join(' '),

  'vertex-9': [
    // Compacta: cajón corto, cargador largo y recto, cañón mínimo.
    'M 6 18 L 22 16 L 40 16 L 40 12 L 62 12 L 62 16 L 88 17 L 88 19 L 106 19 L 106 23',
    'L 88 23 L 88 26 L 74 26 L 74 29 L 68 29 L 66 46 L 55 46 L 57 29',
    'L 48 29 L 41 41 L 32 41 L 36 29 L 22 29 L 6 27 Z',
    // Varilla de la culata plegable.
    'M 6 21 L 2 21 M 6 24 L 2 24',
    // Guardamonte.
    'M 48 29 Q 49 35 55 34',
  ].join(' '),

  // Scalar-2 con silenciador: el cilindro gordo por delante del cañón.
  'scalar-2-suppressed': [
    'M 8 19 L 34 17 L 34 14 L 58 14 L 58 17 L 84 18 L 84 20 L 92 20',
    'L 92 15 L 128 15 L 128 25 L 92 25 L 92 22 L 84 22 L 84 25 L 70 25',
    'L 70 28 L 64 28 L 62 42 L 52 42 L 54 28 L 46 28 L 39 41 L 30 41 L 34 28 L 8 27 Z',
    // Junta del silenciador.
    'M 96 15 L 96 25',
    // Guardamonte.
    'M 46 28 Q 47 34 53 33',
  ].join(' '),

  // Sin silenciador: mismo cuerpo, cañón corto y sin cilindro.
  'scalar-2': [
    'M 8 19 L 34 17 L 34 14 L 58 14 L 58 17 L 84 18 L 84 20 L 98 20 L 98 23',
    'L 84 23 L 84 25 L 70 25 L 70 28 L 64 28 L 62 42 L 52 42 L 54 28',
    'L 46 28 L 39 41 L 30 41 L 34 28 L 8 27 Z',
    // Guardamonte.
    'M 46 28 Q 47 34 53 33',
  ].join(' '),
}

/**
 * @param {{ weaponKey: string, suppressed?: boolean }} props
 */
export default function WeaponSilhouette({ weaponKey, suppressed = false }) {
  // Sólo Scalar-2 tiene variante con silenciador dibujada; el resto reutiliza
  // su única silueta aunque el arma admita silenciador.
  const withSuppressor = `${weaponKey}-suppressed`
  const key = suppressed && SILHOUETTES[withSuppressor] ? withSuppressor : weaponKey
  const path = SILHOUETTES[key]
  if (!path) return null

  return (
    <div className="weapon" aria-label={WEAPONS[weaponKey]?.label}>
      <svg className="weapon__svg" viewBox="0 0 140 50" role="presentation">
        <path d={path} />
      </svg>
      <span className="weapon__label">{WEAPONS[weaponKey]?.label}</span>
    </div>
  )
}
